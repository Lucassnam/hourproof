// PGlite harness for the ShiftCred migration (no Docker, no Supabase project).
//
// It recreates the parts of a Supabase database the migration depends on:
//   - schema `extensions` with pgcrypto in it (Supabase installs pgcrypto there),
//   - schema `auth` with a stub `auth.users` table and `auth.uid()`,
//   - roles `anon`, `authenticated` and `service_role`,
//   - Supabase's DEFAULT PRIVILEGES: every new table, function and sequence in
//     `public` is granted to anon/authenticated/service_role. This matters: it
//     means `revoke ... from public` alone does NOT lock a function down on
//     Supabase, so the tests would miss that bug without it.
//
// Every helper runs one transaction per call, like PostgREST does per request,
// so an RPC that raises rolls back everything it wrote, exactly as in production.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATION_PATH = path.resolve(
  here,
  "../../supabase/migrations/20260927000000_shiftcred.sql",
);

export type Db = PGlite;
export type Tx = Transaction;
type Queryable = PGlite | Transaction;

const SUPABASE_STUB = `
create schema extensions;
create extension pgcrypto with schema extensions;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

/** A fresh database with the Supabase stub only (no migration). */
export async function freshStubDb(): Promise<Db> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  return db;
}

/** A fresh database with the Supabase stub and the ShiftCred migration applied. */
export async function freshDb(): Promise<Db> {
  const db = await freshStubDb();
  await db.exec(readFileSync(MIGRATION_PATH, "utf8"));
  return db;
}

/**
 * Runs `fn` as a signed-in (anonymous-auth) volunteer: role `authenticated`,
 * `auth.uid()` = `uid`, inside one transaction. The auth.users row is created
 * first as the owner, as Supabase's anonymous sign-in would.
 */
export async function asUser<T>(db: Db, uid: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  await db.query("insert into auth.users(id) values ($1) on conflict do nothing", [uid]);
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    return fn(tx);
  });
}

/** Runs `fn` as the anon key with no session (how supervisors call kitchen RPCs). */
export async function asAnon<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    await tx.query("select set_config('request.jwt.claim.sub', '', true)");
    return fn(tx);
  });
}

/** Calls a function with named arguments: `select * from name(k => $1, ...)`. */
export async function rpc<R = Record<string, unknown>>(
  db: Queryable,
  name: string,
  args: Record<string, unknown> = {},
): Promise<R[]> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`bad function name ${name}`);
  const keys = Object.keys(args);
  for (const k of keys) if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw new Error(`bad arg name ${k}`);
  const list = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  const res = await db.query<R>(
    `select * from public.${name}(${list})`,
    keys.map((k) => args[k]),
  );
  return res.rows;
}

/** Calls a scalar-returning function and returns its single value. */
export async function rpcValue<V>(
  db: Queryable,
  name: string,
  args: Record<string, unknown> = {},
): Promise<V> {
  const rows = await rpc<Record<string, V>>(db, name, args);
  return Object.values(rows[0])[0];
}
