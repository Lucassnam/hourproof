import { describe, expect, test } from 'vitest'
import en from '../../../../messages/en.json'
import es from '../../../../messages/es.json'
import { ruleSet } from '../../rules/load'

// Any user-facing text that mentions being exempt must be clearly conditional or negative,
// except the gated `result.likely_exempt.*` copy (only shown when reviewedAt is set).
// "exenci" catches the Spanish noun (exención/exenciones), which "exent" alone misses.
const MENTIONS_EXEMPT = /exempt|exent|exenci/i

// The explicit hedge phrases (final-review M7). A bare "not" or "no " is NOT enough: it would
// let "You are exempt. No proof needed." through. Each phrase is conditional ("may"), or says
// something is not / no longer an exemption.
const HEDGE_PHRASES: readonly RegExp[] = [
  // Negations first, so a string that says "not an exemption" is credited for that and not
  // for an unrelated "puede" elsewhere in it.
  /\bnot (an )?exempt(ions?)?\b/i, // "NOT exempt", "NOT an exemption", "not exemptions"
  /\bno longer\b/i,
  /\bnot automatically\b/i,
  /\bno (es|son) (una )?exenci/i, // "no es una exención", "no son exenciones"
  /\bno (es|está|están) exent/i, // "no es exento", "NO están exentas"
  /\bya no\b/i,
  /\bno automáticamente/i,
  // Conditionals
  /\bmay\b/i,
  /\bmight\b/i,
  /\bpossibly\b/i,
  /\bif the rule applies\b/i,
  /\bes posible\b/i,
  /\bposiblemente\b/i,
  /\bpuede\b/i,
  /\bsi la regla\b/i,
]

function hedgeIn(text: string): RegExp | undefined {
  return HEDGE_PHRASES.find((phrase) => phrase.test(text))
}

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
    test(`${key} is hedged`, () => expect(hedgeIn(value), `${key}: "${value}" has none of the hedge phrases`).toBeDefined())
  }
})

describe('the hedge check itself (M7)', () => {
  const unconditional = [
    'You are exempt.',
    "You're exempt from the work rule.",
    'You are likely exempt.',
    'You are exempt. No proof needed.',
    'You are exempt, not subject to the rule.',
    'Usted está exento/a.',
    'Usted está exenta de la regla.',
    'Es probable que usted esté exento/a.',
    'Tiene una exención. No necesita prueba.',
  ]
  for (const text of unconditional) {
    test(`fails an unconditional claim: "${text}"`, () => {
      expect(MENTIONS_EXEMPT.test(text)).toBe(true)
      expect(hedgeIn(text)).toBeUndefined()
    })
  }

  test('the gated likely_exempt copy would fail it (which is why only the reviewedAt gate may show it)', () => {
    const gated = [...flatten(en), ...flatten(es)].filter(([k]) => /^result\.likely_exempt\./.test(k))
    const claims = gated.filter(([, v]) => MENTIONS_EXEMPT.test(v))
    expect(claims.length).toBeGreaterThan(0)
    for (const [, v] of claims) expect(hedgeIn(v), v).toBeUndefined()
  })
})
