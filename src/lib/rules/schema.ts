import { z } from 'zod'

export const OUTCOMES = ['not_subject', 'likely_exempt', 'meeting_requirement', 'ask_county', 'continue'] as const
export type Outcome = (typeof OUTCOMES)[number]

const RuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  question_en: z.string().min(1),
  question_es: z.string().min(1).nullable(),
  kind: z.enum(['scope', 'exemption', 'info']),
  outcomeIfYes: z.enum(OUTCOMES),
  proofThatHelps_en: z.string().min(1),
  proofThatHelps_es: z.string().min(1).nullable().optional(),
  sourceUrl: z.string().url(),
  sourceQuote: z.string().min(1),
  confidence: z.enum(['confirmed', 'unclear']),
})

const RuleSetSchema = z
  .object({
    version: z.string().min(1),
    reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    reviewer: z.string().min(1).nullable(),
    county: z.object({ name: z.string().min(1), phone: z.string().min(3), sourceUrl: z.string().url() }),
    rules: z.array(RuleSchema).min(1),
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>()
    for (const r of s.rules) {
      if (seen.has(r.id)) ctx.addIssue({ code: 'custom', message: `duplicate rule id: ${r.id}` })
      seen.add(r.id)
    }
  })

export type Rule = z.infer<typeof RuleSchema>
export type RuleSet = z.infer<typeof RuleSetSchema>
export type County = RuleSet['county']
export const parseRuleSet = (raw: unknown): RuleSet => RuleSetSchema.parse(raw)
