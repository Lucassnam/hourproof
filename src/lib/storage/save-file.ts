// Saving a file the app made on the phone: a CF 888, the proof packet, a copy of the hours.
//
// Everywhere but iPhone and iPad, an <a download> click saves it, as before. On iPhone and
// iPad that path is unreliable, worst of all in HourProof added to the Home Screen, where a
// download can open a preview with no way back, or do nothing. There the share sheet (Web
// Share with files) is used instead, which offers Save to Files, Mail, Messages and AirDrop.
//
// Safari opens the share sheet only straight from a tap. A caller that builds the file
// first (pdf-lib takes a moment) checks prefersShareSheet() and, if so, shows a second button
// and calls saveFile from that button's tap. If Safari still refuses, the download is tried.
import { isAppleMobile } from './persist'

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

type ShareData = { files: File[]; title?: string }
export type SaveEnv = {
  userAgent: string
  platform: string
  maxTouchPoints: number
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
  download: (blob: Blob, name: string) => void
}

function downloadWithLink(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function browserSaveEnv(): SaveEnv {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    canShare: typeof nav.canShare === 'function' ? (data) => nav.canShare!(data) : undefined,
    share: typeof nav.share === 'function' ? (data) => nav.share(data) : undefined,
    download: downloadWithLink,
  }
}

function canShareFile(env: SaveEnv, file: File): boolean {
  if (!env.share || !env.canShare) return false
  try {
    return env.canShare({ files: [file] })
  } catch {
    return false
  }
}

// True when saveFile would open the share sheet, so it must be called from a tap.
export function prefersShareSheet(env: SaveEnv = browserSaveEnv(), sample?: File): boolean {
  if (!isAppleMobile(env)) return false
  return canShareFile(env, sample ?? new File([''], 'probe.pdf', { type: 'application/pdf' }))
}

export async function saveFile(blob: Blob, name: string, env: SaveEnv = browserSaveEnv()): Promise<SaveResult> {
  const file = new File([blob], name, { type: blob.type })
  if (isAppleMobile(env) && canShareFile(env, file)) {
    try {
      await env.share!({ files: [file], title: name })
      return 'shared'
    } catch (err) {
      // Closing the share sheet is a choice, not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Anything else (NotAllowedError when the tap is too far back): try the download.
    }
  }
  env.download(blob, name)
  return 'downloaded'
}
