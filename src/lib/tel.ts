// "(408) 758-3800" -> "tel:+14087583800" (US numbers).
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `tel:+1${digits}`;
}
