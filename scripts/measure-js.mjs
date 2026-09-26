// Measures the JS transferred on HourProof's home route (/) and /screener,
// against the spec's "first load under 200 KB of JS on the home route"
// budget.
//
// Next 16's `next build` output no longer prints a per-route "First Load JS"
// table (verified 2026-09-25: the Route (app) table only lists ○/ƒ markers,
// no size column), so this script measures it directly by loading each route
// in a real browser and summing the transferred size of every JS response.
//
// Usage:
//   npm run build && npm start   # starts the prod server on :7050
//   node scripts/measure-js.mjs  # in a second terminal, while the server is up
//
// Reports both:
//   - "transferred" bytes: the actual bytes that crossed the network for
//     this response (what `response.request().sizes()` calls
//     `responseBodySize` + headers; this reflects gzip/br compression when
//     the server applies it)
//   - "decoded"/uncompressed bytes: the size of the response body after
//     decompression (`(await response.body()).length`), i.e. what the
//     browser actually parses/executes
//
// `next start` does not gzip responses by default (no compression
// middleware is configured in this project), so on this server the two
// numbers are typically identical; both are reported so the numbers still
// mean something if compression is added later (e.g. behind a CDN).

import { chromium } from "playwright";

const BASE_URL = process.env.MEASURE_BASE_URL ?? "http://localhost:7050";
const ROUTES = ["/", "/screener"];
const BUDGET_KB = 200;

function toKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

async function measureRoute(page, path) {
  const responses = [];

  const onResponse = async (response) => {
    const url = response.url();
    const isJs =
      response.request().resourceType() === "script" ||
      /\.(m?js)(\?|$)/.test(new URL(url).pathname);
    if (!isJs) return;

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

    responses.push({ url, transferred, decoded });
  };

  page.on("response", onResponse);
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  page.off("response", onResponse);

  const transferredTotal = responses.reduce((sum, r) => sum + r.transferred, 0);
  const decodedTotal = responses.reduce((sum, r) => sum + r.decoded, 0);

  return { path, responses, transferredTotal, decodedTotal };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];

  for (const path of ROUTES) {
    const page = await browser.newPage();
    const result = await measureRoute(page, path);
    results.push(result);
    await page.close();
  }

  await browser.close();

  console.log(`\nJS budget check (base: ${BASE_URL}, budget: ${BUDGET_KB} KB/route)\n`);

  let anyOverBudget = false;

  for (const result of results) {
    const transferredKB = toKB(result.transferredTotal);
    const decodedKB = toKB(result.decodedTotal);
    const over = result.transferredTotal / 1024 > BUDGET_KB;
    if (over) anyOverBudget = true;

    console.log(`Route ${result.path}`);
    console.log(`  JS files: ${result.responses.length}`);
    console.log(`  Transferred: ${transferredKB} KB${over ? "  *** OVER BUDGET ***" : ""}`);
    console.log(`  Decoded (uncompressed): ${decodedKB} KB`);
    for (const r of result.responses.sort((a, b) => b.transferred - a.transferred)) {
      const name = r.url.replace(BASE_URL, "");
      console.log(`    ${toKB(r.transferred).padStart(8)} KB  ${name}`);
    }
    console.log("");
  }

  if (anyOverBudget) {
    console.log("RESULT: one or more routes exceed the 200 KB JS budget.");
    process.exitCode = 1;
  } else {
    console.log("RESULT: all measured routes are within the 200 KB JS budget.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
