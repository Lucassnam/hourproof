// What the proof page shows for a month: one box per activity type the person logged, and,
// for volunteering, one CF 888 per organization. Hours here are the hours *logged*, not the
// hours that count (that's summarizeMonth's job on /log): a representative certifies the
// hours on a CF 888, and a county decides what a pay stub proves.

import { ACTIVITY_TYPES, type ActivityType, type Entry } from '@/lib/hours/types'

export type ProofGroup = { type: ActivityType; hours: number }
export type VolunteerPlace = { place: string /* '' when no place was typed */; hours: number }

// A kitchen shift that is still open or was not accepted counts toward nothing (the same rule
// summarizeMonth applies on /log), so the proof page leaves it out.
export function proofEntries(monthEntries: readonly Entry[]): Entry[] {
  return monthEntries.filter(
    (entry) => !(entry.source === 'shift' && (entry.verification === 'open' || entry.verification === 'rejected')),
  )
}

function placeKey(place: string | undefined): string {
  return (place ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

// For one organization: the hours a supervisor there confirmed in HourProof, and who did.
export function kitchenConfirmed(monthEntries: readonly Entry[], place: string): { hours: number; by: string[] } {
  const key = placeKey(place)
  let quarters = 0
  const by: string[] = []
  for (const entry of monthEntries) {
    if (entry.source !== 'shift' || entry.verification !== 'confirmed' || placeKey(entry.place) !== key) continue
    quarters += Math.round(entry.hours * 4)
    if (entry.confirmedBy && !by.includes(entry.confirmedBy)) by.push(entry.confirmedBy)
  }
  return { hours: quarters / 4, by }
}

export function proofGroups(monthEntries: readonly Entry[]): ProofGroup[] {
  const hours = new Map<ActivityType, number>()
  for (const entry of monthEntries) hours.set(entry.type, (hours.get(entry.type) ?? 0) + entry.hours)
  return ACTIVITY_TYPES.filter((type) => hours.has(type)).map((type) => ({ type, hours: hours.get(type)! }))
}

// Places are matched ignoring case and extra spaces ("Food Bank" and "food  bank " are one
// organization), shown as first typed (the earliest entry, whatever order the store lists
// them in), and sorted by name with the unnamed group last.
export function volunteerPlaces(monthEntries: readonly Entry[]): VolunteerPlace[] {
  const places = new Map<string, VolunteerPlace>()
  const oldestFirst = [...monthEntries].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  )
  for (const entry of oldestFirst) {
    if (entry.type !== 'volunteer') continue
    const shown = (entry.place ?? '').trim().replace(/\s+/g, ' ')
    const key = shown.toLocaleLowerCase()
    const existing = places.get(key)
    if (existing) existing.hours += entry.hours
    else places.set(key, { place: shown, hours: entry.hours })
  }
  return Array.from(places.values()).sort((a, b) => {
    if (!a.place !== !b.place) return a.place ? -1 : 1
    return a.place.localeCompare(b.place)
  })
}
