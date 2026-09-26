import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

export const locales = ['en', 'es'] as const
export type AppLocale = (typeof locales)[number]
export const defaultLocale: AppLocale = 'en'

function isAppLocale(value: string | undefined): value is AppLocale {
  return value === 'en' || value === 'es'
}

export default getRequestConfig(async ({ locale: override }) => {
  // An explicit locale (e.g. `getTranslations({ locale: 'es' })` for the bilingual
  // no-JavaScript notice) wins; otherwise the NEXT_LOCALE cookie decides.
  let locale: AppLocale = defaultLocale
  if (isAppLocale(override)) {
    locale = override
  } else {
    const cookieStore = await cookies()
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value
    if (isAppLocale(cookieLocale)) locale = cookieLocale
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
