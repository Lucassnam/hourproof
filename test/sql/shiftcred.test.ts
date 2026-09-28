// SQL tests for supabase/migrations/20260927000000_shiftcred.sql, run in PGlite.
// Each test gets a fresh database. Every RPC call goes through asUser/asAnon, one
// transaction per call, the way PostgREST runs one transaction per request.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MIGRATION_PATH,
  asAnon,
  asUser,
  freshDb,
  freshStubDb,
  rpc,
  rpcValue,
  type Db,
  type Tx,
} from "./pglite";
import { SHIFT_CASES as DURATION_CASES } from "@/lib/shifts/cases";

// PGlite boots a WebAssembly Postgres per test and bcrypt is slow in wasm.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// DURATION_CASES is src/lib/shifts/cases.ts's SHIFT_CASES, imported directly (Task 3
// dedupe) so the SQL and TS rounding rules are checked against the exact same instants.
// Postgres parses each case's ISO instant (with its explicit UTC offset) the same way
// the TS side does; only the elapsed time between checkIn and checkOut matters here.

// create_kitchen generates each kitchen's PIN; the tests remember them by slug.
const pins = new Map<string, string>();
const pinOf = (slug: string): string => {
  const pin = pins.get(slug);
  if (!pin) throw new Error(`no kitchen ${slug}`);
  return pin;
};
/** A 6-digit PIN guaranteed to differ from the kitchen's real one. */
const wrongPin = (slug: string): string => (pinOf(slug) === "000000" ? "111111" : "000000");

type ShiftRow = {
  id: string;
  user_id?: string;
  kitchen_id: string;
  check_in: Date;
  check_out: Date | null;
  status: string;
  auto_closed: boolean;
  confirmed_by: string | null;
  reason: string | null;
  decided_at: Date | null;
  kitchen_name?: string;
  volunteer_name?: string;
};

const HOUR = 3_600_000;

let db: Db;

/** Creates a kitchen as the owner (SQL editor), remembers its generated PIN, returns its QR code. */
async function createKitchen(slug: string, name = `Kitchen ${slug}`): Promise<string> {
  const [row] = await rpc<{ qr_code: string; pin: string }>(db, "create_kitchen", { p_name: name, p_slug: slug, p_phone: "555-0100" });
  pins.set(slug, row.pin);
  return row.qr_code;
}

/** The kitchen's packed lock state (last_failure_epoch * 16 + failures), read as the owner. */
async function lockState(slug: string): Promise<{ fails: number; raw: string }> {
  const k = await db.query<{ seq: string }>(
    "select 'shiftcred_private.' || quote_ident('pin_lock_' || replace(id::text, '-', '')) as seq from public.kitchens where slug = $1",
    [slug],
  );
  const r = await db.query<{ v: string }>(`select last_value::text as v from ${k.rows[0].seq}`);
  return { fails: Number(BigInt(r.rows[0].v) % 16n), raw: r.rows[0].v };
}

/** Like asAnon, but the transaction is READ ONLY, as PostgREST runs GET/HEAD /rpc calls. */
async function asAnonReadOnly<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set transaction read only");
    await tx.exec("set local role anon");
    return fn(tx);
  });
}

async function errorOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected the call to fail, but it succeeded");
}

const checkIn = (uid: string, code: string, name = "Ana") =>
  asUser(db, uid, (tx) => rpc<ShiftRow>(tx, "check_in", { p_code: code, p_name: name })).then((r) => r[0]);
const checkOut = (uid: string, code: string) =>
  asUser(db, uid, (tx) => rpc<ShiftRow>(tx, "check_out", { p_code: code })).then((r) => r[0]);
const myShifts = (uid: string, since = "2020-01-01") =>
  asUser(db, uid, (tx) => rpc<ShiftRow>(tx, "my_shifts", { p_since: since }));
const kitchenShifts = (slug: string, pin: string, day: string) =>
  asAnon(db, (tx) => rpc<ShiftRow>(tx, "kitchen_shifts", { p_slug: slug, p_pin: pin, p_day: day }));
const decide = (
  slug: string,
  pin: string,
  shiftId: string,
  decision: string,
  extra: { p_reason?: string; p_check_out?: string; p_supervisor?: string } = {},
) =>
  asAnon(db, (tx) =>
    rpc<ShiftRow>(tx, "decide_shift", {
      p_slug: slug,
      p_pin: pin,
      p_shift_id: shiftId,
      p_decision: decision,
      p_supervisor: extra.p_supervisor ?? "Maria",
      p_reason: extra.p_reason ?? null,
      p_check_out: extra.p_check_out ?? null,
    }),
  ).then((r) => r[0]);

/** California date of now, as the migration computes it. */
async function caToday(): Promise<string> {
  const r = await db.query<{ d: string }>(
    "select ((now() at time zone 'America/Los_Angeles')::date)::text as d",
  );
  return r.rows[0].d;
}

/**
 * Moves a kitchen's PIN-failure clock back by `minutes` (the test's stand-in for waiting).
 * The lockout state lives in a per-kitchen sequence, packed as last_failure_epoch * 16 + count,
 * because sequence writes survive the rollback of the failing RPC (see the migration).
 */
async function ageLockout(slug: string, minutes: number): Promise<void> {
  const k = await db.query<{ seq: string }>(
    "select 'shiftcred_private.' || quote_ident('pin_lock_' || replace(id::text, '-', '')) as seq from public.kitchens where slug = $1",
    [slug],
  );
  const seq = k.rows[0].seq;
  await db.query(`select setval('${seq}', (select last_value from ${seq}) - ${minutes * 60 * 16})`);
}

/** Inserts a shift directly as the owner (bypassing the RPCs) for time-travel setups. */
async function insertShift(
  uid: string,
  kitchenSlug: string,
  checkInIso: string,
  checkOutIso: string | null,
  status: string,
): Promise<string> {
  await db.query("insert into auth.users(id) values ($1) on conflict do nothing", [uid]);
  const r = await db.query<{ id: string }>(
    `insert into public.shifts(user_id, kitchen_id, check_in, check_out, status)
     select $1, k.id, $3, $4, $5 from public.kitchens k where k.slug = $2
     returning id`,
    [uid, kitchenSlug, checkInIso, checkOutIso, status],
  );
  return r.rows[0].id;
}

describe("ShiftCred migration (PGlite)", () => {
  beforeEach(async () => {
    db = await freshDb();
    pins.clear();
  });

  it("1. applies cleanly on a fresh database, with RLS on every table", async () => {
    const fresh = await freshStubDb();
    await expect(fresh.exec(readFileSync(MIGRATION_PATH, "utf8"))).resolves.toBeDefined();
    const r = await fresh.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    expect(r.rows).toEqual([
      { relname: "kitchens", relrowsecurity: true },
      { relname: "pin_attempts", relrowsecurity: true },
      { relname: "shifts", relrowsecurity: true },
      { relname: "volunteers", relrowsecurity: true },
    ]);
  });

  it("2. create_kitchen returns a 22-char code and a generated 6-digit PIN; kitchen_by_code finds it (id and name only); inactive kitchens are not found; the PIN is bcrypt-hashed", async () => {
    const code = await createKitchen("st-anne");
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(pinOf("st-anne")).toMatch(/^[0-9]{6}$/);

    const found = await asAnon(db, (tx) => rpc(tx, "kitchen_by_code", { p_code: code }));
    expect(found).toEqual([{ id: expect.any(String), name: "Kitchen st-anne" }]);

    const hash = await db.query<{ pin_hash: string; matches: boolean }>(
      "select pin_hash, extensions.crypt($1, pin_hash) = pin_hash as matches from public.kitchens",
      [pinOf("st-anne")],
    );
    expect(hash.rows[0].pin_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(hash.rows[0].pin_hash).not.toContain(pinOf("st-anne"));
    expect(hash.rows[0].matches).toBe(true);

    await db.query("update public.kitchens set active = false where slug = 'st-anne'");
    const gone = await asAnon(db, (tx) => rpc(tx, "kitchen_by_code", { p_code: code }));
    expect(gone).toEqual([]);

    // The old signature (caller-chosen PIN) is gone, so no PIN is ever typed into SQL history.
    expect(await errorOf(db.query("select public.create_kitchen('X', 'old-sig', '123456', null)"))).toMatch(/does not exist/);
  });

  it("3. check in opens a shift; again at the same kitchen returns the same shift; another kitchen raises already_open_elsewhere", async () => {
    const a = await createKitchen("kitchen-a");
    const b = await createKitchen("kitchen-b");
    const uid = randomUUID();

    const first = await checkIn(uid, a, "  Ana  ");
    expect(first.status).toBe("open");
    expect(first.check_out).toBeNull();
    expect(first.user_id).toBe(uid);
    expect(first.kitchen_name).toBe("Kitchen kitchen-a");

    const again = await checkIn(uid, a);
    expect(again.id).toBe(first.id);
    expect(again.kitchen_name).toBe("Kitchen kitchen-a");

    expect(await errorOf(checkIn(uid, b))).toBe("already_open_elsewhere");
    const open = await db.query("select count(*)::int as n from public.shifts where status = 'open'");
    expect(open.rows).toEqual([{ n: 1 }]);

    const name = await db.query("select display_name from public.volunteers where user_id = $1", [uid]);
    expect(name.rows).toEqual([{ display_name: "Ana" }]);
  });

  it("3b. check_in validates the name and the code, and needs a signed-in user", async () => {
    const a = await createKitchen("kitchen-a");
    const uid = randomUUID();
    expect(await errorOf(checkIn(uid, a, "   "))).toBe("bad_name");
    expect(await errorOf(checkIn(uid, a, "x".repeat(41)))).toBe("bad_name");
    expect(await errorOf(checkIn(uid, a, "Ana\nsays hi"))).toBe("bad_name");
    expect(await errorOf(checkIn(uid, "NOPE-not-a-real-code-0"))).toBe("not_found");

    await db.query("update public.kitchens set active = false");
    expect(await errorOf(checkIn(uid, a))).toBe("not_found");

    const anonErr = await errorOf(
      asAnon(db, (tx) => rpc(tx, "check_in", { p_code: a, p_name: "Ana" })),
    );
    expect(anonErr).toMatch(/permission denied/);
  });

  it("4. check out makes the shift pending with check_out set; not checked in raises not_checked_in", async () => {
    const a = await createKitchen("kitchen-a");
    const b = await createKitchen("kitchen-b");
    const uid = randomUUID();

    expect(await errorOf(checkOut(uid, a))).toBe("not_checked_in");

    const opened = await checkIn(uid, a);
    expect(await errorOf(checkOut(uid, b))).toBe("not_checked_in");

    const closed = await checkOut(uid, a);
    expect(closed.id).toBe(opened.id);
    expect(closed.status).toBe("pending");
    expect(closed.check_out).toBeInstanceOf(Date);
    expect(closed.auto_closed).toBe(false);
    expect(closed.kitchen_name).toBe("Kitchen kitchen-a");

    expect(await errorOf(checkOut(uid, a))).toBe("not_checked_in");
  });

  it("4c. check_out still returns kitchen_name after the kitchen was deactivated between check-in and check-out", async () => {
    const a = await createKitchen("kitchen-a", "The Deactivated Kitchen");
    const uid = randomUUID();
    await checkIn(uid, a, "Ana");

    await db.query("update public.kitchens set active = false where slug = 'kitchen-a'");

    const closed = await checkOut(uid, a);
    expect(closed.status).toBe("pending");
    expect(closed.kitchen_name).toBe("The Deactivated Kitchen");
  });

  it("4b. checking out 9 hours later caps the shift at 8 hours and marks it auto-closed", async () => {
    const a = await createKitchen("kitchen-a");
    const uid = randomUUID();
    const opened = await checkIn(uid, a);
    await db.query("update public.shifts set check_in = now() - interval '9 hours' where id = $1", [opened.id]);

    const closed = await checkOut(uid, a);
    expect(closed.status).toBe("pending");
    expect(closed.auto_closed).toBe(true);
    expect(closed.check_out!.getTime() - closed.check_in.getTime()).toBe(8 * HOUR);
  });

  it("5. auto-close: an open shift 9 hours old becomes pending, auto_closed, check_out = check_in + 8h (my_shifts, kitchen_shifts, check_in)", async () => {
    const a = await createKitchen("kitchen-a");
    const b = await createKitchen("kitchen-b");
    const uid = randomUUID();
    const opened = await checkIn(uid, a);
    await db.query("update public.shifts set check_in = now() - interval '9 hours' where id = $1", [opened.id]);

    const mine = await myShifts(uid);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: opened.id, status: "pending", auto_closed: true, kitchen_name: "Kitchen kitchen-a" });
    expect(mine[0].check_out!.getTime() - mine[0].check_in.getTime()).toBe(8 * HOUR);
    expect(mine[0]).not.toHaveProperty("user_id");

    // Via the supervisor's dashboard.
    const uid2 = randomUUID();
    const opened2 = await checkIn(uid2, a, "Ben");
    await db.query("update public.shifts set check_in = now() - interval '9 hours' where id = $1", [opened2.id]);
    const day = (await db.query<{ d: string }>(
      "select ((check_in at time zone 'America/Los_Angeles')::date)::text as d from public.shifts where id = $1",
      [opened2.id],
    )).rows[0].d;
    const dash = await kitchenShifts("kitchen-a", pinOf("kitchen-a"), day);
    expect(dash.find((s) => s.id === opened2.id)).toMatchObject({ status: "pending", auto_closed: true, volunteer_name: "Ben" });

    // Via check_in: a stale open shift at A does not block checking in at B.
    const uid3 = randomUUID();
    const opened3 = await checkIn(uid3, a, "Cy");
    await db.query("update public.shifts set check_in = now() - interval '9 hours' where id = $1", [opened3.id]);
    const atB = await checkIn(uid3, b, "Cy");
    expect(atB.status).toBe("open");
    const old = await db.query("select status, auto_closed from public.shifts where id = $1", [opened3.id]);
    expect(old.rows).toEqual([{ status: "pending", auto_closed: true }]);

    // 7h59 stays open.
    const uid4 = randomUUID();
    const opened4 = await checkIn(uid4, a, "Di");
    await db.query("update public.shifts set check_in = now() - interval '7 hours 59 minutes' where id = $1", [opened4.id]);
    expect((await myShifts(uid4))[0]).toMatchObject({ status: "open", check_out: null, auto_closed: false });
  });

  describe("6. duration cases (SQL floor to quarter hours matches the TS case list)", () => {
    it.each(DURATION_CASES)("$name", async ({ checkIn: ci, checkOut: co, expectedHours }) => {
      await createKitchen("kitchen-a");
      const id = await insertShift(randomUUID(), "kitchen-a", ci, co, "pending");
      const r = await db.query<{ h: string }>(
        `select (floor(extract(epoch from (check_out - check_in)) / 900) * 0.25)::text as h
         from public.shifts where id = $1`,
        [id],
      );
      expect(Number(r.rows[0].h)).toBe(expectedHours);
    });
  });

  it("7. PIN: wrong → bad_pin; 5 wrong then the right one → locked; 16 minutes later the right PIN works", async () => {
    await createKitchen("kitchen-a");
    await createKitchen("kitchen-b");
    const today = await caToday();

    expect(await errorOf(kitchenShifts("kitchen-a", wrongPin("kitchen-a"), today))).toBe("bad_pin");
    for (let i = 0; i < 4; i++) {
      expect(await errorOf(kitchenShifts("kitchen-a", wrongPin("kitchen-a"), today))).toBe("bad_pin");
    }
    // Each failed call above was its own rolled-back transaction; the lockout must still count them.
    expect(await errorOf(kitchenShifts("kitchen-a", pinOf("kitchen-a"), today))).toBe("locked");
    expect(await errorOf(asAnon(db, (tx) => rpc(tx, "poster_code", { p_slug: "kitchen-a", p_pin: pinOf("kitchen-a") })))).toBe("locked");

    // The lockout is per kitchen.
    await expect(kitchenShifts("kitchen-b", pinOf("kitchen-b"), today)).resolves.toEqual([]);

    // Move the failures 16 minutes into the past (the test's stand-in for waiting).
    await ageLockout("kitchen-a", 16);
    await expect(kitchenShifts("kitchen-a", pinOf("kitchen-a"), today)).resolves.toEqual([]);

    // Unknown kitchen.
    expect(await errorOf(kitchenShifts("no-such-kitchen", "123456", today))).toBe("not_found");
  });

  it("8. decide: confirm, reject, needs_correction, another kitchen's shift", async () => {
    await createKitchen("kitchen-a");
    const b = await createKitchen("kitchen-b");
    const a = (await asAnon(db, (tx) => rpc<{ poster_code: string }>(tx, "poster_code", { p_slug: "kitchen-a", p_pin: pinOf("kitchen-a") })))[0].poster_code;

    // Confirm sets confirmed_by and decided_at.
    const u1 = randomUUID();
    const s1 = await checkIn(u1, a, "Ana");
    await checkOut(u1, a);
    const confirmed = await decide("kitchen-a", pinOf("kitchen-a"), s1.id, "confirm", { p_supervisor: "  Maria  " });
    expect(confirmed).toMatchObject({ id: s1.id, status: "confirmed", confirmed_by: "Maria", volunteer_name: "Ana", kitchen_name: "Kitchen kitchen-a" });
    expect(confirmed.decided_at).toBeInstanceOf(Date);
    // A decided shift can't be decided again.
    expect(await errorOf(decide("kitchen-a", pinOf("kitchen-a"), s1.id, "reject", { p_reason: "oops" }))).toBe("not_found");

    // Reject needs a reason.
    const u2 = randomUUID();
    const s2 = await checkIn(u2, a, "Ben");
    await checkOut(u2, a);
    expect(await errorOf(decide("kitchen-a", pinOf("kitchen-a"), s2.id, "reject"))).toBe("needs_correction");
    expect(await errorOf(decide("kitchen-a", pinOf("kitchen-a"), s2.id, "reject", { p_reason: "   " }))).toBe("needs_correction");
    const rejected = await decide("kitchen-a", pinOf("kitchen-a"), s2.id, "reject", { p_reason: "Not here today" });
    expect(rejected).toMatchObject({ status: "rejected", reason: "Not here today", confirmed_by: "Maria" });
    expect(rejected.decided_at).toBeInstanceOf(Date);

    // A 10h15 shift needs a corrected end time; 9h is accepted.
    const u3 = randomUUID();
    const ci = new Date(Date.now() - 11 * HOUR);
    const s3 = await insertShift(u3, "kitchen-a", ci.toISOString(), new Date(ci.getTime() + 10.25 * HOUR).toISOString(), "pending");
    expect(await errorOf(decide("kitchen-a", pinOf("kitchen-a"), s3, "confirm"))).toBe("needs_correction");
    // A correction before check-in, or in the future, is refused too.
    expect(await errorOf(decide("kitchen-a", pinOf("kitchen-a"), s3, "confirm", { p_check_out: new Date(ci.getTime() - HOUR).toISOString() }))).toBe("needs_correction");
    expect(await errorOf(decide("kitchen-a", pinOf("kitchen-a"), s3, "confirm", { p_check_out: new Date(Date.now() + HOUR).toISOString() }))).toBe("needs_correction");
    const fixed = await decide("kitchen-a", pinOf("kitchen-a"), s3, "confirm", { p_check_out: new Date(ci.getTime() + 9 * HOUR).toISOString() });
    expect(fixed.status).toBe("confirmed");
    expect(fixed.check_out!.getTime() - fixed.check_in.getTime()).toBe(9 * HOUR);

    // An open shift is closed by the decision (at now).
    const u4 = randomUUID();
    const s4 = await checkIn(u4, a, "Cy");
    const closedByDecision = await decide("kitchen-a", pinOf("kitchen-a"), s4.id, "confirm");
    expect(closedByDecision.status).toBe("confirmed");
    expect(closedByDecision.check_out).toBeInstanceOf(Date);

    // Another kitchen's shift is not found, even with a valid PIN for this kitchen.
    const u5 = randomUUID();
    const s5 = await checkIn(u5, b, "Di");
    await checkOut(u5, b);
    expect(await errorOf(decide("kitchen-a", pinOf("kitchen-a"), s5.id, "confirm"))).toBe("not_found");
    // A bad supervisor name, or an unknown decision.
    expect(await errorOf(decide("kitchen-b", pinOf("kitchen-b"), s5.id, "confirm", { p_supervisor: " " }))).toBe("bad_name");
    expect(await errorOf(decide("kitchen-b", pinOf("kitchen-b"), s5.id, "approve"))).toBe("needs_correction");
    // A wrong PIN.
    expect(await errorOf(decide("kitchen-b", wrongPin("kitchen-b"), s5.id, "confirm"))).toBe("bad_pin");
  });

  it("9. RLS: users see only their own shifts; anon can't read kitchens or pin_attempts; no direct inserts", async () => {
    const a = await createKitchen("kitchen-a");
    const ua = randomUUID();
    const ub = randomUUID();
    const sa = await checkIn(ua, a, "Ana");
    const sb = await checkIn(ub, a, "Ben");
    await kitchenShifts("kitchen-a", pinOf("kitchen-a"), await caToday()); // leaves an ok pin_attempts row

    const seenByA = await asUser(db, ua, (tx) => tx.query<{ id: string }>("select id from public.shifts"));
    expect(seenByA.rows.map((r) => r.id)).toEqual([sa.id]);
    const byIdB = await asUser(db, ua, (tx) => tx.query("select * from public.shifts where id = $1", [sb.id]));
    expect(byIdB.rows).toEqual([]);
    const volsA = await asUser(db, ua, (tx) => tx.query<{ user_id: string }>("select user_id from public.volunteers"));
    expect(volsA.rows).toEqual([{ user_id: ua }]);

    for (const table of ["kitchens", "pin_attempts", "shifts", "volunteers"]) {
      expect(await errorOf(asAnon(db, (tx) => tx.query(`select * from public.${table}`)))).toMatch(/permission denied/);
    }
    for (const table of ["kitchens", "pin_attempts"]) {
      expect(await errorOf(asUser(db, ua, (tx) => tx.query(`select * from public.${table}`)))).toMatch(/permission denied/);
    }
    const kid = (await db.query<{ id: string }>("select id from public.kitchens")).rows[0].id;
    expect(
      await errorOf(asUser(db, ua, (tx) => tx.query("insert into public.shifts(user_id, kitchen_id) values ($1, $2)", [ua, kid]))),
    ).toMatch(/permission denied/);
    expect(
      await errorOf(asUser(db, ua, (tx) => tx.query("update public.shifts set status = 'confirmed' where id = $1", [sa.id]))),
    ).toMatch(/permission denied/);

    // Defense in depth: even if someone re-grants the tables (Supabase's defaults), RLS still blocks.
    await db.query("grant all on public.shifts, public.kitchens, public.pin_attempts to anon, authenticated");
    const anonKitchens = await asAnon(db, (tx) => tx.query("select * from public.kitchens"));
    expect(anonKitchens.rows).toEqual([]);
    const anonAttempts = await asAnon(db, (tx) => tx.query("select * from public.pin_attempts"));
    expect(anonAttempts.rows).toEqual([]);
    expect(
      await errorOf(asUser(db, ua, (tx) => tx.query("insert into public.shifts(user_id, kitchen_id) values ($1, $2)", [ua, kid]))),
    ).toMatch(/row-level security/);
    const upd = await asUser(db, ua, (tx) => tx.query("update public.shifts set status = 'confirmed' where id = $1 returning id", [sa.id]));
    expect(upd.rows).toEqual([]);
  });

  it("10. create_kitchen, the admin functions and the internal functions can't be executed by anon or authenticated", async () => {
    await createKitchen("kitchen-a");
    const internal: Array<[string, Record<string, unknown>]> = [
      ["create_kitchen", { p_name: "X", p_slug: "sneaky", p_phone: null }],
      ["unlock_kitchen", { p_slug: "kitchen-a" }],
      ["reset_kitchen_pin", { p_slug: "kitchen-a" }],
      ["_new_pin", {}],
      ["_check_pin", { p_slug: "sneaky", p_pin: "123456" }],
      ["_auto_close", {}],
    ];
    for (const [fn, args] of internal) {
      expect(await errorOf(asAnon(db, (tx) => rpc(tx, fn, args)))).toMatch(/permission denied/);
      expect(await errorOf(asUser(db, randomUUID(), (tx) => rpc(tx, fn, args)))).toMatch(/permission denied/);
    }
    // And the grants say so, independent of the call path.
    const r = await db.query<{ fn: string; anon: boolean; auth: boolean }>(
      `select p.proname as fn,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by p.proname`,
    );
    const grants = Object.fromEntries(r.rows.map((x) => [x.fn, [x.anon, x.auth]]));
    expect(grants).toEqual({
      _auto_close: [false, false],
      _check_pin: [false, false],
      _kitchen_shift_rows: [false, false],
      _new_code: [false, false],
      _new_pin: [false, false],
      _pin_lock_seq: [false, false],
      check_in: [false, true],
      check_out: [false, true],
      create_kitchen: [false, false],
      decide_shift: [true, true],
      kitchen_by_code: [true, true],
      kitchen_shifts: [true, true],
      my_shifts: [false, true],
      ping: [true, true],
      poster_code: [true, true],
      reset_kitchen_pin: [false, false],
      rotate_code: [true, true],
      tg_kitchens_pin_lock: [false, false],
      tg_kitchens_pin_lock_drop: [false, false],
      unlock_kitchen: [false, false],
    });
  });

  it("11. California date: a shift at 2026-11-01T06:30Z shows in kitchen_shifts(…, '2026-10-31')", async () => {
    await createKitchen("kitchen-a");
    const uid = randomUUID();
    await db.query("insert into auth.users(id) values ($1)", [uid]);
    await db.query("insert into public.volunteers(user_id, display_name) values ($1, 'Ana')", [uid]);
    const id = await insertShift(uid, "kitchen-a", "2026-11-01T06:30:00Z", "2026-11-01T08:15:00Z", "pending");

    const oct31 = await kitchenShifts("kitchen-a", pinOf("kitchen-a"), "2026-10-31");
    expect(oct31.map((s) => s.id)).toEqual([id]);
    const nov1 = await kitchenShifts("kitchen-a", pinOf("kitchen-a"), "2026-11-01");
    expect(nov1).toEqual([]);

    // my_shifts filters by the same California date.
    expect((await myShifts(uid, "2026-10-31")).map((s) => s.id)).toEqual([id]);
    expect(await myShifts(uid, "2026-11-01")).toEqual([]);
  });

  it("12. poster_code and rotate_code: rotating makes the old poster stop working", async () => {
    const oldCode = await createKitchen("kitchen-a");
    const poster = await asAnon(db, (tx) => rpcValue<string>(tx, "poster_code", { p_slug: "kitchen-a", p_pin: pinOf("kitchen-a") }));
    expect(poster).toBe(oldCode);

    const newCode = await asAnon(db, (tx) => rpcValue<string>(tx, "rotate_code", { p_slug: "kitchen-a", p_pin: pinOf("kitchen-a") }));
    expect(newCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newCode).not.toBe(oldCode);
    expect(await asAnon(db, (tx) => rpc(tx, "kitchen_by_code", { p_code: oldCode }))).toEqual([]);
    expect(await asAnon(db, (tx) => rpc(tx, "kitchen_by_code", { p_code: newCode }))).toHaveLength(1);
    expect(await errorOf(asAnon(db, (tx) => rpc(tx, "rotate_code", { p_slug: "kitchen-a", p_pin: wrongPin("kitchen-a") })))).toBe("bad_pin");
  });

  it("13. ping returns 1 for anon", async () => {
    expect(await asAnon(db, (tx) => rpcValue<number>(tx, "ping"))).toBe(1);
  });
  it("14. C1: in a READ ONLY transaction (PostgREST GET/HEAD) a wrong and a right PIN get the same 'locked', and nothing changes", async () => {
    await createKitchen("kitchen-a");
    const today = await caToday();
    const before = await lockState("kitchen-a");
    const attempts = await db.query("select count(*)::int as n from public.pin_attempts");

    const kitchenRpcs = (pin: string): Array<[string, Record<string, unknown>]> => [
      ["kitchen_shifts", { p_slug: "kitchen-a", p_pin: pin, p_day: today }],
      ["poster_code", { p_slug: "kitchen-a", p_pin: pin }],
      ["rotate_code", { p_slug: "kitchen-a", p_pin: pin }],
      ["decide_shift", { p_slug: "kitchen-a", p_pin: pin, p_shift_id: randomUUID(), p_decision: "confirm", p_supervisor: "Maria" }],
    ];
    for (const pin of [wrongPin("kitchen-a"), pinOf("kitchen-a")]) {
      for (const [fn, args] of kitchenRpcs(pin)) {
        expect(await errorOf(asAnonReadOnly((tx) => rpc(tx, fn, args))), `${fn} read-only`).toBe("locked");
      }
    }
    // Many read-only tries: still no oracle, still no state change.
    for (let i = 0; i < 10; i++) {
      expect(await errorOf(asAnonReadOnly((tx) => rpc(tx, "poster_code", { p_slug: "kitchen-a", p_pin: String(i).padStart(6, "0") })))).toBe("locked");
    }
    expect(await lockState("kitchen-a")).toEqual(before);
    expect((await db.query("select count(*)::int as n from public.pin_attempts")).rows).toEqual(attempts.rows);

    // A normal (read-write) call with the right PIN still works afterwards.
    await expect(kitchenShifts("kitchen-a", pinOf("kitchen-a"), today)).resolves.toEqual([]);
  });

  it("15. C1: count-first still locks after 5 wrong PINs, and a correct PIN never counts as a failure (nor resets them)", async () => {
    await createKitchen("kitchen-a");
    const today = await caToday();
    const right = () => kitchenShifts("kitchen-a", pinOf("kitchen-a"), today);
    const wrong = () => errorOf(kitchenShifts("kitchen-a", wrongPin("kitchen-a"), today));

    // Six right PINs in a row: never locked, never counted.
    for (let i = 0; i < 6; i++) await expect(right()).resolves.toEqual([]);
    expect((await lockState("kitchen-a")).fails).toBe(0);

    for (let i = 0; i < 4; i++) expect(await wrong()).toBe("bad_pin");
    expect((await lockState("kitchen-a")).fails).toBe(4);
    for (let i = 0; i < 3; i++) await expect(right()).resolves.toEqual([]);
    expect((await lockState("kitchen-a")).fails).toBe(4); // successes restore the count exactly

    expect(await wrong()).toBe("bad_pin"); // the 5th failure
    expect((await lockState("kitchen-a")).fails).toBe(5);
    expect(await errorOf(right())).toBe("locked");
    expect(await wrong()).toBe("locked");
    expect((await lockState("kitchen-a")).fails).toBe(5); // refused calls don't count or extend
    const ok = await db.query("select count(*)::int as n from public.pin_attempts where ok");
    expect(ok.rows).toEqual([{ n: 9 }]);
  });

  it("16. I2: unlock_kitchen (admin only) clears a lockout", async () => {
    await createKitchen("kitchen-a");
    const today = await caToday();
    for (let i = 0; i < 5; i++) await errorOf(kitchenShifts("kitchen-a", wrongPin("kitchen-a"), today));
    expect(await errorOf(kitchenShifts("kitchen-a", pinOf("kitchen-a"), today))).toBe("locked");

    expect(await errorOf(asAnon(db, (tx) => rpc(tx, "unlock_kitchen", { p_slug: "kitchen-a" })))).toMatch(/permission denied/);
    expect(await errorOf(asUser(db, randomUUID(), (tx) => rpc(tx, "unlock_kitchen", { p_slug: "kitchen-a" })))).toMatch(/permission denied/);

    await rpc(db, "unlock_kitchen", { p_slug: "kitchen-a" });
    expect((await lockState("kitchen-a")).fails).toBe(0);
    await expect(kitchenShifts("kitchen-a", pinOf("kitchen-a"), today)).resolves.toEqual([]);
    expect(await errorOf(rpc(db, "unlock_kitchen", { p_slug: "no-such-kitchen" }))).toBe("not_found");
  });

  it("17. I3: reset_kitchen_pin (admin only) returns a new generated PIN; the old one stops working; it also clears a lockout", async () => {
    await createKitchen("kitchen-a");
    const today = await caToday();
    const oldPin = pinOf("kitchen-a");
    for (let i = 0; i < 5; i++) await errorOf(kitchenShifts("kitchen-a", wrongPin("kitchen-a"), today));

    expect(await errorOf(asAnon(db, (tx) => rpc(tx, "reset_kitchen_pin", { p_slug: "kitchen-a" })))).toMatch(/permission denied/);
    expect(await errorOf(asUser(db, randomUUID(), (tx) => rpc(tx, "reset_kitchen_pin", { p_slug: "kitchen-a" })))).toMatch(/permission denied/);

    // Force a different PIN (a reset may, 1 in a million, draw the same one).
    let newPin = oldPin;
    while (newPin === oldPin) newPin = await rpcValue<string>(db, "reset_kitchen_pin", { p_slug: "kitchen-a" });
    expect(newPin).toMatch(/^[0-9]{6}$/);
    pins.set("kitchen-a", newPin);
    await expect(kitchenShifts("kitchen-a", newPin, today)).resolves.toEqual([]);
    expect(await errorOf(kitchenShifts("kitchen-a", oldPin, today))).toBe("bad_pin");
    expect(await errorOf(rpc(db, "reset_kitchen_pin", { p_slug: "no-such-kitchen" }))).toBe("not_found");
  });

  it("18. I3: generated PINs are 6 digits drawn from the whole 000000-999999 range", async () => {
    const r = await db.query<{ n: number; distinct_n: number; bad: number; lo: number; hi: number; lead0: number }>(
      `with p as (select public._new_pin() as pin from generate_series(1, 5000))
       select count(*)::int as n, count(distinct pin)::int as distinct_n,
              count(*) filter (where pin !~ '^[0-9]{6}$')::int as bad,
              min(pin::int) as lo, max(pin::int) as hi,
              count(*) filter (where pin like '0%')::int as lead0
       from p`,
    );
    const x = r.rows[0];
    expect(x.n).toBe(5000);
    expect(x.bad).toBe(0);
    expect(x.distinct_n).toBeGreaterThan(4950); // birthday bound: ~12 collisions expected in 1e6
    expect(x.lo).toBeLessThan(5000);
    expect(x.hi).toBeGreaterThan(995_000);
    expect(x.lead0).toBeGreaterThan(350); // ~500 expected: leading zeros are kept
    expect(x.lead0).toBeLessThan(650);
  });

  it("19. I1: the one-open-shift index refuses a second open shift for the same user (23505)", async () => {
    await createKitchen("kitchen-a");
    await createKitchen("kitchen-b");
    const uid = randomUUID();
    await insertShift(uid, "kitchen-a", new Date().toISOString(), null, "open");
    let code: string | undefined;
    try {
      await insertShift(uid, "kitchen-b", new Date().toISOString(), null, "open");
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("23505");
    // Closed shifts don't count against it.
    await insertShift(uid, "kitchen-b", new Date(Date.now() - 3 * HOUR).toISOString(), new Date(Date.now() - HOUR).toISOString(), "pending");
  });

  it("20. hardening: verified hours survive user deletion; a deleted kitchen drops its lock sequence; kitchen_shifts needs a day", async () => {
    const code = await createKitchen("kitchen-a");
    const uid = randomUUID();
    await checkIn(uid, code, "Ana");
    let fk: string | undefined;
    try {
      await db.query("delete from auth.users where id = $1", [uid]);
    } catch (e) {
      fk = (e as { code?: string }).code;
    }
    expect(fk).toBe("23001"); // restrict_violation

    expect(await errorOf(kitchenShifts("kitchen-a", pinOf("kitchen-a"), null as unknown as string))).toBe("not_found");

    await createKitchen("kitchen-gone");
    const seq = "pin_lock_" + (await db.query<{ id: string }>("select replace(id::text, '-', '') as id from public.kitchens where slug = 'kitchen-gone'")).rows[0].id;
    const exists = () => db.query("select 1 from pg_class where relname = $1 and relnamespace = 'shiftcred_private'::regnamespace", [seq]).then((r) => r.rows.length);
    expect(await exists()).toBe(1);
    await db.query("delete from public.kitchens where slug = 'kitchen-gone'");
    expect(await exists()).toBe(0);

    const meta = await db.query<{ k: string; v: string }>(
      `select 'ping_secdef' as k, prosecdef::text as v from pg_proc where oid = 'public.ping()'::regprocedure
       union all select 'pin_attempts_idx', indexdef from pg_indexes where tablename = 'pin_attempts' and indexname <> 'pin_attempts_pkey'
       union all select 'policy_' || policyname, qual from pg_policies where schemaname = 'public'
       union all select 'fk_' || conrelid::regclass::text, confdeltype::text from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass`,
    );
    const m = Object.fromEntries(meta.rows.map((r) => [r.k, r.v]));
    expect(m.ping_secdef).toBe("false");
    expect(m.pin_attempts_idx).toMatch(/\(kitchen_id, at\)/);
    expect(m.policy_shifts_select_own).toMatch(/\( SELECT auth\.uid\(\)/);
    expect(m.policy_volunteers_select_own).toMatch(/\( SELECT auth\.uid\(\)/);
    expect(m.fk_shifts).toBe("r"); // restrict
    expect(m["fk_volunteers"]).toBe("r");
  });
});
