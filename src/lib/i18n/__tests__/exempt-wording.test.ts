import { describe, expect, test } from 'vitest'
import en from '../../../../messages/en.json'
import es from '../../../../messages/es.json'
import { ruleSet } from '../../rules/load'

// Any user-facing text that mentions being exempt must be clearly conditional or negative,
// except the gated `result.likely_exempt.*` copy (only shown when reviewedAt is set).
const MENTIONS_EXEMPT = /exempt|exent/i
const HEDGED = /may|might|not|NOT|posible|puede|no /i

function flatten(obj: Record<string, unknown>, prefix = ''): [string, string][] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v !== null && typeof v === 'object' ? flatten(v as Record<string, unknown>, path) : [[path, String(v)] as [string, string]]
  })
}

const messageTexts = [
  ...flatten(en).map(([k, v]) => [`en.${k}`, v] as const),
  ...flatten(es).map(([k, v]) => [`es.${k}`, v] as const),
].filter(([k]) => !/^(en|es)\.result\.likely_exempt\./.test(k))

const RULE_TEXT_FIELDS = [
  'question_en', 'question_es', 'hint_en', 'hint_es', 'proofThatHelps_en', 'proofThatHelps_es', 'label_en', 'label_es',
  'checklistNote_en', 'checklistNote_es',
] as const
const ruleTexts = ruleSet.rules.flatMap((r) =>
  RULE_TEXT_FIELDS.flatMap((f) => (r[f] ? [[`${r.id}.${f}`, r[f] as string] as const] : [])),
)

describe('exempt wording is never an unconditional claim', () => {
  const all = [...messageTexts, ...ruleTexts]
  test('the check is not vacuous', () => {
    expect(all.filter(([, v]) => MENTIONS_EXEMPT.test(v)).length).toBeGreaterThan(3)
  })
  for (const [key, value] of all) {
    if (!MENTIONS_EXEMPT.test(value)) continue
    test(`${key} is hedged`, () => expect(value, `${key}: "${value}"`).toMatch(HEDGED))
  }
})
