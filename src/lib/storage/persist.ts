// Two ways to make it less likely that a phone throws away the hour log, which lives only
// in the browser's storage for this site.
//
// 1. Ask the browser to treat this site's storage as persistent, so it isn't cleared when
//    the phone runs low on space. Browsers decide on their own rules (some ask the person).
// 2. Suggest adding the app to the Home Screen. On iPhone and iPad that matters most:
//    Safari may erase the storage of a website it hasn't been used on for a week, and a Home
//    Screen app is not subject to that.

export type Persistence = 'granted' | 'denied' | 'unsupported'

export async function requestPersistence(): Promise<Persistence> {
  try {
    const storage = globalThis.navigator?.storage
    if (!storage?.persist || !storage.persisted) return 'unsupported'
    if (await storage.persisted()) return 'granted'
    return (await storage.persist()) ? 'granted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

export type InstallAdvice = 'none' | 'ios' | 'prompt'

// What to tell this person about adding the app to their Home Screen.
//   'ios'    iPhone/iPad in a browser: there is no install button, only the Share menu.
//   'prompt' the browser offered an install prompt (Chrome and others), so show a button.
//   'none'   already running from the Home Screen, or the browser has no way to install.
export function installAdvice(env: {
  userAgent: string
  platform: string
  maxTouchPoints: number
  standalone: boolean
  canPrompt: boolean
}): InstallAdvice {
  if (env.standalone) return 'none'
  // iPadOS identifies itself as a Mac; a Mac with a touch screen is an iPad.
  const ios = /iPad|iPhone|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1)
  if (ios) return 'ios'
  return env.canPrompt ? 'prompt' : 'none'
}
