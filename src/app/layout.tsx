import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { tokens } from "@/lib/theme/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "HourProof",
  description: "Check CalFresh work-requirement rules and what proof helps, on your phone.",
  // iOS home-screen icon: 180x180 PNG rendered from scripts/icon-source.svg with
  // `rsvg-convert -w 180 -h 180 -b "#F6F7F9"` (opaque, since iOS fills transparency black).
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// theme-color lives on the viewport export in Next 16, not as a raw <meta>
// tag or a Metadata field — see
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md.
// Light is the app's default theme (the boot script below only ever flips
// *to* dark), so this uses the light background token.
export const viewport: Viewport = {
  themeColor: tokens.light.bg,
};

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

// This runs before React (and before the ThemeToggle module loads), so it can't import the
// storage/theme-color helpers — it's a plain guarded string. The dark background is
// interpolated from `tokens` at build time so it can't drift from ThemeToggle's own value.
const THEME_BOOT_SCRIPT = `
(function () {
  try {
    if (window.localStorage.getItem("theme") === "dark") {
      document.documentElement.dataset.theme = "dark";
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", "${tokens.dark.bg}");
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${plusJakartaSans.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
