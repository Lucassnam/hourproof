"use server";

import { cookies } from "next/headers";
import { redirect, RedirectType } from "next/navigation";

const ONE_YEAR = 60 * 60 * 24 * 365;

// Only same-site paths ("/screener"), never "//evil.example" or "/\evil.example".
function safeReturnPath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

// Language choice as a plain form POST, so it works before hydration and with JavaScript
// turned off (Next serves a 303 back to the page). With JavaScript, Next runs it as a
// Server Action and re-renders in place; screener answers live in sessionStorage, so they
// survive either way. Only the locale is sent: no personal data.
export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (locale === "en" || locale === "es") {
    const cookieStore = await cookies();
    cookieStore.set("NEXT_LOCALE", locale, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  }
  redirect(safeReturnPath(formData.get("returnTo")), RedirectType.replace);
}
