import { z } from 'zod'

export const OUTCOMES = ['not_subject', 'likely_exempt', 'meeting_requirement', 'ask_county', 'continue'] as const
export type Outcome = (typeof OUTCOMES)[number]

const text = z.string().min(1)

const RuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    question_en: text,
    question_es: text.nullable(),
    // Shown under the question on the question screen (guidance for answering it).
    hint_en: text.optional(),
    hint_es: text.nullable().optional(),
    kind: z.enum(['scope', 'exemption', 'info']),
    outcomeIfYes: z.enum(OUTCOMES),
    // Shown on the result screen. Optional (a rule whose outcome is `continue` may have none),
    // but never an empty string when present.
    proofThatHelps_en: text.optional(),
    proofThatHelps_es: text.nullable().optional(),
    // Short "Check any that apply" checkbox text. Required (non-empty) when kind === 'exemption'.
    label_en: text.optional(),
    label_es: text.nullable().optional(),
    sourceUrl: z.url(),
    sourceQuote: text,
    confidence: z.enum(['confirmed', 'unclear']),
    // Last day (inclusive, California date) the rule applies. After it, the engine skips the rule.
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.hint_es && !r.hint_en)
      ctx.addIssue({ code: 'custom', message: `${r.id}: hint_es without hint_en` })
    if (r.proofThatHelps_es && !r.proofThatHelps_en)
      ctx.addIssue({ code: 'custom', message: `${r.id}: proofThatHelps_es without proofThatHelps_en` })
    if (r.label_es && !r.label_en)
      ctx.addIssue({ code: 'custom', message: `${r.id}: label_es without label_en` })
    if (r.kind === 'exemption' && !r.label_en)
      ctx.addIssue({ code: 'custom', message: `${r.id}: label_en is required when kind is exemption` })
    if (r.kind === 'exemption' && r.outcomeIfYes !== 'likely_exempt')
      ctx.addIssue({ code: 'custom', message: `${r.id}: kind exemption must have outcomeIfYes likely_exempt` })
    if (r.kind === 'scope' && r.outcomeIfYes !== 'not_subject')
      ctx.addIssue({ code: 'custom', message: `${r.id}: kind scope must have outcomeIfYes not_subject` })
    if (r.kind === 'info' && r.outcomeIfYes === 'likely_exempt')
      ctx.addIssue({ code: 'custom', message: `${r.id}: kind info must not have outcomeIfYes likely_exempt` })
  })

const RuleSetSchema = z
  .object({
    version: z.string().min(1),
    reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    reviewer: z.string().min(1).nullable(),
    // Shown as "Source" on a result that has no rule attached (e.g. `subject`).
    generalSourceUrl: z.url(),
    county: z.object({ name: z.string().min(1), phone: z.string().min(3), sourceUrl: z.url() }),
    rules: z.array(RuleSchema).min(1),
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>()
    for (const r of s.rules) {
      if (seen.has(r.id)) ctx.addIssue({ code: 'custom', message: `duplicate rule id: ${r.id}` })
      seen.add(r.id)
    }
    if ((s.reviewedAt === null) !== (s.reviewer === null))
      ctx.addIssue({ code: 'custom', message: 'reviewedAt and reviewer must both be set or both be null' })
  })

export type Rule = z.infer<typeof RuleSchema>
export type RuleSet = z.infer<typeof RuleSetSchema>
export type County = RuleSet['county']
export const parseRuleSet = (raw: unknown): RuleSet => RuleSetSchema.parse(raw)
