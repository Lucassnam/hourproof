import type { Page } from "@playwright/test";

// The webkit project is an iPhone, where the app sends files to the share sheet instead of
// downloading them (src/lib/storage/save-file.ts; keep-safe.spec.ts tests that path with a
// stubbed share sheet). Tests of the download path take Web Share away first, so the
// download is what happens on both browsers. Not a spec: Playwright only runs *.spec.ts.
export async function withoutWebShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (Navigator.prototype as { canShare?: unknown }).canShare;
  });
}
