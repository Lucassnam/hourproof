import { describe, expect, it } from 'vitest'
import en from '../../../../messages/en.json'
import es from '../../../../messages/es.json'

type Messages = Record<string, unknown>

function flatten(obj: Messages, prefix = ''): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(acc, flatten(value as Messages, path))
    } else {
      acc[path] = value
    }
    return acc
  }, {})
}

describe('messages parity', () => {
  const flatEn = flatten(en as Messages)
  const flatEs = flatten(es as Messages)

  it('has identical key sets in en.json and es.json', () => {
    const enKeys = Object.keys(flatEn).sort()
    const esKeys = Object.keys(flatEs).sort()
    expect(esKeys).toEqual(enKeys)
  })

  it('has no empty es values', () => {
    for (const [key, value] of Object.entries(flatEs)) {
      expect(typeof value === 'string' && value.trim().length > 0, `es.${key} is empty`).toBe(true)
    }
  })

  it('has no empty en values', () => {
    for (const [key, value] of Object.entries(flatEn)) {
      expect(typeof value === 'string' && value.trim().length > 0, `en.${key} is empty`).toBe(true)
    }
  })

  it('has the exact controller-mandated notDecision copy', () => {
    expect(flatEs['result.notDecision']).toBe('Esto no es una decisión. Solo su condado puede decidir.')
    expect(flatEn['result.notDecision']).toBe('This is not a decision. Only your county can decide.')
  })
})
