import { describe, expect, test } from 'vitest'
import type { Entry } from '@/lib/hours/types'
import { proofGroups, volunteerPlaces } from '../groups'

let n = 0
const entry = (type: Entry['type'], hours: number, place?: string): Entry => ({
  id: String(n++),
  date: '2026-10-05',
  type,
  hours,
  place,
  createdAt: '2026-10-05T12:00:00Z',
})

describe('proofGroups', () => {
  test('one group per logged type, in the log’s type order, with logged hours', () => {
    const groups = proofGroups([entry('volunteer', 3), entry('work', 10), entry('volunteer', 2.5), entry('job_search', 4, undefined)])
    expect(groups).toEqual([
      { type: 'work', hours: 10 },
      { type: 'volunteer', hours: 5.5 },
      { type: 'job_search', hours: 4 },
    ])
  })

  test('no entries, no groups', () => {
    expect(proofGroups([])).toEqual([])
  })
})

describe('volunteerPlaces', () => {
  test('merges places ignoring case and spacing, keeps the first spelling, unnamed last', () => {
    const places = volunteerPlaces([
      entry('volunteer', 3, 'Food Bank'),
      entry('volunteer', 2, 'food  bank '),
      entry('volunteer', 4),
      entry('volunteer', 1, 'Animal Shelter'),
      entry('work', 8, 'Food Bank'),
    ])
    expect(places).toEqual([
      { place: 'Animal Shelter', hours: 1 },
      { place: 'Food Bank', hours: 5 },
      { place: '', hours: 4 },
    ])
  })

  test('the spelling shown is the earliest entry’s, even when the store lists newest first', () => {
    const older = { ...entry('volunteer', 3, 'Food Bank'), date: '2026-10-01' }
    const newer = { ...entry('volunteer', 2, 'food bank'), date: '2026-10-09' }
    expect(volunteerPlaces([newer, older])).toEqual([{ place: 'Food Bank', hours: 5 }])
  })
})
