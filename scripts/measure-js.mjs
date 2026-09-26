// Measures full page weight (not just JS) on HourProof's home route (/) and
// /screener, against the spec's "first load under 200 KB of JS on the home
// route" budget. The budget itself is JS-only; document/CSS/font/image
// bytes are reported alongside it for visibility, not checked against 200 KB.
//
// Next 16's `next build` output no longer prints a per-route "First Load JS"
// table (verified 2026-09-25: the Route (app) table only lists ○/ƒ markers,
// no size column), so this script measures it directly by loading each route
// in a real browser and summing the transferred size of every response,
// broken out by type (document/JS/CSS/font/image/other).
//
// Fix round 1 (2026-09-25), two controller-ruled findings:
//   1. Moving the rules data (~15 KB) out of a JS chunk and into the
//      RSC/HTML payload of /screener (see the Task 7 gate report) made the
//      JS-only number look better without the total page weight changing by
//      the same amount. This script now also reports the document (HTML)
//      response size and a true total-of-everything per route, so that
//      relocation is visible instead of hidden.
//   2. This script used to require a server already running on :7050,
//      started by hand — easy to leave stale (e.g. testing an old build).
//      It now starts its own `npm start`, verifies :7050 was free before
//      doing so (fails loudly if not), and always stops the server it
//      started in a `finally` block, even on error.
//
// Fix round 2 (2026-09-25), one controller-ruled finding:
//   `npm start` runs `next start` as a *child* of the `npm` process. Sending
//   SIGTERM to just the `npm` process relies on npm forwarding it to `next`;
//   if that forwarding doesn't happen, `next` (and its own child server
//   process) is orphaned and keeps listening on :7050 after this script
//   exits. Fixed by spawning with `{ detached: true }` (so `npm start` is
//   the leader of its own process group, not just a child of this script)
//   and killing the whole group with `process.kill(-child.pid, signal)`
//   (negative pid = process group) on both the success and error paths.
//   ESRCH (group already gone) is caught and ignored. After sending
//   SIGTERM, this script polls :7050 for up to ~5s and escalates to
//   SIGKILL on the group if the port is still answering.
//
// Usage:
//   node scripts/measure-js.mjs
//
// Requires a production build to already exist (`npm run build`) — this
// script runs `npm start`, not `npm run build && npm start`, so it measures
// whatever was most recently built. Run `npm run build` first if in doubt.

import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = 7050;
const BASE_URL = process.env.MEASURE_BASE_URL ?? `http://localhost:${PORT}`;
const ROUTES = ["/", "/screener"];
const BUDGET_KB = 200;
const SERVER_START_TIMEOUT_MS = 60_000;
const SERVER_STOP_TIMEOUT_MS = 5_000;

function toKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

async function isPortResponding() {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(1000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function waitForServer(child, deadline) {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`"npm start" exited early with code ${child.exitCode} before it started responding.`);
    }
    if (await isPortResponding()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`"npm start" did not respond on ${BASE_URL} within ${SERVER_START_TIMEOUT_MS}ms.`);
}

async function startServer() {
  if (await isPortResponding()) {
    throw new Error(
      `Port ${PORT} is already serving something. Refusing to start a second server — ` +
        `stop whatever's on :${PORT} first (this is the exact stale-server footgun this script ` +
        `is meant to avoid: measuring against an old build instead of the one just made).`,
    );
  }

  // `detached: true` makes this child the leader of its own process group
  // (its pgid equals its pid), rather than just a child of this script. That
  // lets us kill the whole group below — `npm start` *and* the `next start`
  // process it spawns underneath it — instead of only the `npm` process and
  // hoping it forwards the signal down.
  const child = spawn("npm", ["start"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));

  try {
    await waitForServer(child, Date.now() + SERVER_START_TIMEOUT_MS);
  } catch (err) {
    await stopServer(child);
    throw new Error(`${err.message}\n--- npm start output ---\n${output}`);
  }

  return child;
}

// Sends `signal` to the whole process group led by `child` (negative pid),
// not just `child` itself. ESRCH means the group is already gone — that's
// success, not an error, so it's swallowed.
function killGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch (err) {
    if (err.code !== "ESRCH") throw err;
  }
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;

  killGroup(child, "SIGTERM");

  const deadline = Date.now() + SERVER_STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await isPortResponding())) return;
    await new Promise((r) => setTimeout(r, 250));
  }

  // Still answering after ~5s of SIGTERM — escalate.
  if (await isPortResponding()) {
    console.error(`:${PORT} still answering ${SERVER_STOP_TIMEOUT_MS}ms after SIGTERM — sending SIGKILL to the group.`);
    killGroup(child, "SIGKILL");
  }
}

function classify(url, resourceType) {
  const path = new URL(url).pathname;
  if (resourceType === "document") return "document";
  if (resourceType === "script" || /\.m?js(\?|$)/.test(path)) return "js";
  if (resourceType === "stylesheet" || /\.css(\?|$)/.test(path)) return "css";
  if (resourceType === "font" || /\.(woff2?|ttf|otf)(\?|$)/.test(path)) return "font";
  if (resourceType === "image" || /\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/.test(path)) return "image";
  return "other";
}

async function measureRoute(page, path) {
  const responses = [];

  const onResponse = async (response) => {
    const url = response.url();
    const kind = classify(url, response.request().resourceType());

    let transferred = 0;
    try {
      const sizes = await response.request().sizes();
      transferred = sizes.responseBodySize + sizes.responseHeadersSize;
    } catch {
      // sizes() can throw for responses served from disk cache; skip those,
      // they didn't cost the user any bytes on this load.
      return;
    }

    let decoded = 0;
    try {
      const body = await response.body();
      decoded = body.length;
    } catch {
      decoded = transferred;
    }

    responses.push({ url, kind, transferred, decoded });
  };

  page.on("response", onResponse);
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  page.off("response", onResponse);

  const byKind = {};
  for (const r of responses) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + r.transferred;
  }
  const totalTransferred = responses.reduce((sum, r) => sum + r.transferred, 0);
  const jsTransferred = byKind.js ?? 0;
  const jsDecoded = responses.filter((r) => r.kind === "js").reduce((sum, r) => sum + r.decoded, 0);

  return { path, responses, byKind, totalTransferred, jsTransferred, jsDecoded };
}

async function main() {
  let server;
  try {
    server = await startServer();

    const browser = await chromium.launch();
    const results = [];

    for (const path of ROUTES) {
      const page = await browser.newPage();
      const result = await measureRoute(page, path);
      results.push(result);
      await page.close();
    }

    await browser.close();

    console.log(`\nPage weight check (base: ${BASE_URL}, JS budget: ${BUDGET_KB} KB/route)\n`);

    let anyOverBudget = false;
    const summaryRows = [];

    for (const result of results) {
      const jsKB = toKB(result.jsTransferred);
      const docKB = toKB(result.byKind.document ?? 0);
      const cssKB = toKB(result.byKind.css ?? 0);
      const fontKB = toKB(result.byKind.font ?? 0);
      const imageKB = toKB(result.byKind.image ?? 0);
      const otherKB = toKB(result.byKind.other ?? 0);
      const totalKB = toKB(result.totalTransferred);
      const over = result.jsTransferred / 1024 > BUDGET_KB;
      if (over) anyOverBudget = true;

      summaryRows.push({ path: result.path, jsKB, docKB, totalKB });

      console.log(`Route ${result.path}`);
      console.log(`  JS:        ${jsKB} KB${over ? "  *** OVER 200 KB BUDGET ***" : ""} (decoded: ${toKB(result.jsDecoded)} KB)`);
      console.log(`  Document:  ${docKB} KB`);
      console.log(`  CSS:       ${cssKB} KB`);
      console.log(`  Fonts:     ${fontKB} KB`);
      console.log(`  Images:    ${imageKB} KB`);
      console.log(`  Other:     ${otherKB} KB`);
      console.log(`  TOTAL:     ${totalKB} KB (all response types, ${result.responses.length} responses)`);
      for (const r of result.responses.sort((a, b) => b.transferred - a.transferred)) {
        const name = r.url.replace(BASE_URL, "") || "/";
        console.log(`    ${toKB(r.transferred).padStart(8)} KB  [${r.kind}]  ${name}`);
      }
      console.log("");
    }

    console.log("Summary table (paste into the gate report):");
    console.log("| Route | JS KB | Document KB | Total KB |");
    console.log("|---|---|---|---|");
    for (const row of summaryRows) {
      console.log(`| \`${row.path}\` | ${row.jsKB} | ${row.docKB} | ${row.totalKB} |`);
    }
    console.log("");

    if (anyOverBudget) {
      console.log("RESULT: one or more routes exceed the 200 KB JS budget.");
      process.exitCode = 1;
    } else {
      console.log("RESULT: all measured routes are within the 200 KB JS budget.");
    }
  } finally {
    await stopServer(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
