import { describe, expect, test } from 'vitest'
import { parseRuleSet } from '../schema'

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'pregnant', question_en: 'Are you pregnant?', question_es: null, kind: 'exemption',
  outcomeIfYes: 'likely_exempt', proofThatHelps_en: 'A note from a clinic.', label_en: "I'm pregnant",
  sourceUrl: 'https://example.gov/a', sourceQuote: 'quote', confidence: 'confirmed', ...over })
const set = (rules: unknown[], over: Record<string, unknown> = {}) => ({
  version: 't', reviewedAt: null, reviewer: null, generalSourceUrl: 'https://example.gov/g',
  county: { name: 'Santa Clara', phone: '000', sourceUrl: 'https://example.gov/c' }, rules, ...over })

describe('parseRuleSet', () => {
  test('accepts a valid set', () => expect(parseRuleSet(set([rule()])).rules).toHaveLength(1))
  test('rejects duplicate ids', () => expect(() => parseRuleSet(set([rule(), rule()]))).toThrow(/duplicate/i))
  test('rejects unknown outcome', () => expect(() => parseRuleSet(set([rule({ outcomeIfYes: 'exempt' })]))).toThrow())
  test('rejects missing source url', () => expect(() => parseRuleSet(set([rule({ sourceUrl: '' })]))).toThrow())
  test('rejects empty rule list', () => expect(() => parseRuleSet(set([]))).toThrow())
  test('rejects a non-date reviewedAt', () => expect(() => parseRuleSet(set([rule()], { reviewedAt: 'soon' }))).toThrow())
  test('rejects a missing generalSourceUrl', () =>
    expect(() => parseRuleSet(set([rule()], { generalSourceUrl: undefined }))).toThrow())
  test('accepts a rule with no proof (e.g. a continue rule)', () =>
    expect(parseRuleSet(set([rule({ proofThatHelps_en: undefined })])).rules[0].proofThatHelps_en).toBeUndefined())
  test('rejects an empty proof string', () => expect(() => parseRuleSet(set([rule({ proofThatHelps_en: '' })]))).toThrow())
  test('rejects a Spanish proof without an English proof', () =>
    expect(() => parseRuleSet(set([rule({ proofThatHelps_en: undefined, proofThatHelps_es: 'prueba' })]))).toThrow(/without/))
  test('accepts hints', () =>
    expect(parseRuleSet(set([rule({ hint_en: 'h', hint_es: 'p' })])).rules[0].hint_es).toBe('p'))
  test('rejects an empty hint', () => expect(() => parseRuleSet(set([rule({ hint_en: '' })]))).toThrow())
  test('rejects a Spanish hint without an English hint', () =>
    expect(() => parseRuleSet(set([rule({ hint_es: 'p' })]))).toThrow(/without/))
  test('accepts a date validUntil', () =>
    expect(parseRuleSet(set([rule({ validUntil: '2026-10-31' })])).rules[0].validUntil).toBe('2026-10-31'))
  test('rejects a non-date validUntil', () => expect(() => parseRuleSet(set([rule({ validUntil: 'Oct 31' })]))).toThrow())
  test('rejects an exemption rule without label_en', () =>
    expect(() => parseRuleSet(set([rule({ kind: 'exemption', label_en: undefined })]))).toThrow(/label_en/))
  test('rejects an exemption rule with outcomeIfYes other than likely_exempt', () =>
    expect(() =>
      parseRuleSet(set([rule({ kind: 'exemption', label_en: 'l', outcomeIfYes: 'not_subject' })])),
    ).toThrow())
  test('rejects a scope rule with outcomeIfYes other than not_subject', () =>
    expect(() =>
      parseRuleSet(set([rule({ kind: 'scope', outcomeIfYes: 'likely_exempt', label_en: undefined })])),
    ).toThrow())
  test('rejects an info rule with outcomeIfYes likely_exempt', () =>
    expect(() =>
      parseRuleSet(set([rule({ kind: 'info', outcomeIfYes: 'likely_exempt', label_en: undefined })])),
    ).toThrow())
  test('rejects reviewedAt set while reviewer is null', () =>
    expect(() => parseRuleSet(set([rule()], { reviewedAt: '2026-10-10', reviewer: null }))).toThrow())
  test('rejects reviewer set while reviewedAt is null', () =>
    expect(() => parseRuleSet(set([rule()], { reviewedAt: null, reviewer: 'Advocate' }))).toThrow())
})
