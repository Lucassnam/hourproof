import { afterEach, describe, expect, test } from 'vitest'
import { contactEmail } from './site'

const original = process.env.NEXT_PUBLIC_CONTACT_EMAIL
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_CONTACT_EMAIL
  else process.env.NEXT_PUBLIC_CONTACT_EMAIL = original
})

describe('contactEmail', () => {
  test('is null until the team sets one, so no address is ever invented', () => {
    delete process.env.NEXT_PUBLIC_CONTACT_EMAIL
    expect(contactEmail()).toBeNull()
    process.env.NEXT_PUBLIC_CONTACT_EMAIL = '   '
    expect(contactEmail()).toBeNull()
  })

  test('uses the address that was set, trimmed, and ignores something that is not an address', () => {
    process.env.NEXT_PUBLIC_CONTACT_EMAIL = ' team@example.org '
    expect(contactEmail()).toBe('team@example.org')
    process.env.NEXT_PUBLIC_CONTACT_EMAIL = 'ask Lucas'
    expect(contactEmail()).toBeNull()
  })
})
