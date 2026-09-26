import { describe, expect, test } from 'vitest'
import { parseRuleSet } from '../schema'

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'pregnant', question_en: 'Are you pregnant?', question_es: null, kind: 'exemption',
  outcomeIfYes: 'likely_exempt', proofThatHelps_en: 'A note from a clinic.',
  sourceUrl: 'https://example.gov/a', sourceQuote: 'quote', confidence: 'confirmed', ...over })
const set = (rules: unknown[], over: Record<string, unknown> = {}) => ({
  version: 't', reviewedAt: null, reviewer: null,
  county: { name: 'Santa Clara', phone: '000', sourceUrl: 'https://example.gov/c' }, rules, ...over })

describe('parseRuleSet', () => {
  test('accepts a valid set', () => expect(parseRuleSet(set([rule()])).rules).toHaveLength(1))
  test('rejects duplicate ids', () => expect(() => parseRuleSet(set([rule(), rule()]))).toThrow(/duplicate/i))
  test('rejects unknown outcome', () => expect(() => parseRuleSet(set([rule({ outcomeIfYes: 'exempt' })]))).toThrow())
  test('rejects missing source url', () => expect(() => parseRuleSet(set([rule({ sourceUrl: '' })]))).toThrow())
  test('rejects empty rule list', () => expect(() => parseRuleSet(set([]))).toThrow())
  test('rejects a non-date reviewedAt', () => expect(() => parseRuleSet(set([rule()], { reviewedAt: 'soon' }))).toThrow())
})
