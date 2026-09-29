// What the proof page shows for a month: one box per activity type the person logged, and,
// for volunteering, one CF 888 per organization. Hours here are the hours *logged*, not the
// hours that count (that's summarizeMonth's job on /log): a representative certifies the
// hours on a CF 888, and a county decides what a pay stub proves.

import { ACTIVITY_TYPES, type ActivityType, type Entry } from '@/lib/hours/types'

export type ProofGroup = { type: ActivityType; hours: number }
export type VolunteerPlace = { place: string /* '' when no place was typed */; hours: number }

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
