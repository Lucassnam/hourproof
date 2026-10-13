"use server";

// Server actions for the kitchen's QR poster (/kitchen/<slug>/poster). The PIN arrives in
// the action's POST body (never a URL) and goes straight to the backend's poster_code or
// rotate_code. This code never stores or logs it, and every error is caught and mapped to a
// code, so nothing carrying the arguments reaches Next's error log. `next dev` would
// otherwise log each Server Function call *with its arguments* (the PIN included); that's
// turned off in next.config.ts (`logging.serverFunctions: false`). The QR itself is drawn
// here, on the server, so the qrcode library never ships to a browser.
//
// Which backend: the same choice getShiftBackend() makes in the browser.
//   - Supabase env set: the SupabaseShiftBackend, from the server, with the anon key. The
//     PIN RPCs need no session (the PIN is the credential).
//   - Mock (NEXT_PUBLIC_HOURPROOF_BACKEND=mock and HOURPROOF_MOCK_SHIFTS=1, dev and e2e):
//     the in-memory mock, called in-process through the same shared registry the
//     /api/mock-shifts route uses (src/lib/shifts/mock-registry.ts). The namespace is the
//     one the page's mock client uses (localStorage `hp.shifts.mockNs`), passed in by the
//     page as an argument, so an e2e test's poster, dashboard and volunteer phone all see
//     one world. Calling the route over HTTP instead would mean fetching a URL built from
//     the request's Host header, which the client controls: the server would then POST the
//     PIN wherever that header pointed.
//   - Otherwise: 'unavailable'.
import { headers } from "next/headers";
import QRCode from "qrcode";
import { checkInUrl, posterOrigin } from "@/lib/shifts/poster-url";
import { SupabaseShiftBackend } from "@/lib/shifts/supabase";
import { ShiftBackendError, type BackendErrorCode, type KitchenInfo } from "@/lib/shifts/types";

export type PosterResult =
  | { ok: true; code: string; url: string; svg: string; kitchenName: string }
  | { ok: false; error: BackendErrorCode };

type PosterOps = {
  posterCode(slug: string, pin: string): Promise<string>;
  rotateCode(slug: string, pin: string): Promise<string>;
  kitchenByCode(code: string): Promise<KitchenInfo | null>;
};

async function posterBackend(ns: string | null): Promise<PosterOps | null> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return new SupabaseShiftBackend();
  }
  if (process.env.NEXT_PUBLIC_HOURPROOF_BACKEND === "mock" && process.env.HOURPROOF_MOCK_SHIFTS === "1") {
    const [mock, { sharedMockRegistry }] = await Promise.all([
      import("@/lib/shifts/mock-server"),
      import("@/lib/shifts/mock-registry"),
    ]);
    const state = mock.stateFor(sharedMockRegistry(), mock.normalizeNamespace(ns));
    return {
      posterCode: async (slug, pin) => mock.handle(state, "posterCode", { slug, pin }, undefined, new Date()),
      rotateCode: async (slug, pin) => mock.handle(state, "rotateCode", { slug, pin }, undefined, new Date()),
      kitchenByCode: async (code) => mock.handle(state, "kitchenByCode", { code }, undefined, new Date()),
    };
  }
  return null;
}

// The address the camera opens. Canonical by default (NEXT_PUBLIC_SITE_URL, else Vercel's
// production domain; see poster-url.ts); the request's own host only in development and
// e2e, so a poster printed from a preview deployment never points at that preview.
async function checkInUrlFor(code: string): Promise<string | null> {
  const allowRequestHost = process.env.NODE_ENV !== "production" || process.env.HOURPROOF_MOCK_SHIFTS === "1";
  const origin = posterOrigin(
    {
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    },
    await headers(),
    allowRequestHost,
  );
  return origin ? checkInUrl(origin, code) : null;
}

async function render(ops: PosterOps, code: string): Promise<PosterResult> {
  const url = await checkInUrlFor(code);
  // No canonical site address configured (see .env.example): no poster, not a guessed one.
  if (!url) return { ok: false, error: "unavailable" };
  const [kitchen, raw] = await Promise.all([
    ops.kitchenByCode(code),
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4 }),
  ]);
  // Fill the box the page gives it; the box carries the accessible name.
  const svg = raw.replace("<svg ", '<svg width="100%" height="100%" aria-hidden="true" focusable="false" ');
  return { ok: true, code, url, svg, kitchenName: kitchen?.name ?? "" };
}

async function run(slug: unknown, pin: unknown, ns: unknown, rotate: boolean): Promise<PosterResult> {
  if (typeof slug !== "string" || slug.length < 1 || slug.length > 100) return { ok: false, error: "not_found" };
  // The page only sends six digits; anything else can't be the PIN.
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) return { ok: false, error: "bad_pin" };
  try {
    const ops = await posterBackend(typeof ns === "string" ? ns : null);
    if (!ops) return { ok: false, error: "unavailable" };
    const code = rotate ? await ops.rotateCode(slug, pin) : await ops.posterCode(slug, pin);
    if (!code) return { ok: false, error: "not_found" };
    return await render(ops, code);
  } catch (err) {
    return { ok: false, error: err instanceof ShiftBackendError ? err.code : "network" };
  }
}

export async function loadPoster(slug: string, pin: string, ns: string | null): Promise<PosterResult> {
  return run(slug, pin, ns, false);
}

// Makes a new code: every poster printed before stops working.
export async function rotatePoster(slug: string, pin: string, ns: string | null): Promise<PosterResult> {
  return run(slug, pin, ns, true);
}
