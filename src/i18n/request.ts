import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

export const locales = ['en', 'es'] as const
export type AppLocale = (typeof locales)[number]
export const defaultLocale: AppLocale = 'en'

function isAppLocale(value: string | undefined): value is AppLocale {
  return value === 'en' || value === 'es'
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value
  const locale = isAppLocale(cookieLocale) ? cookieLocale : defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
