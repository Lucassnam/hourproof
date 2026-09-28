import { describe, expect, test } from "vitest";
import { contrast } from "../contrast";
import { tokens } from "../tokens";

test("known pair", () => expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0));
const TEXT = ["text", "text-muted", "proof", "pace", "signal", "danger"] as const;
const BG = ["bg", "surface", "surface-2"] as const;
for (const mode of ["light", "dark"] as const)
  describe(mode, () => {
    for (const fg of TEXT)
      for (const bg of BG)
        test(`${fg} on ${bg} >= 4.5`, () =>
          expect(contrast(tokens[mode][fg], tokens[mode][bg])).toBeGreaterThanOrEqual(4.5));
  });

// Non-text pair (WCAG 1.4.11): button outlines must stand out from every background.
for (const mode of ["light", "dark"] as const)
  describe(`${mode} border (non-text)`, () => {
    for (const bg of BG)
      test(`border on ${bg} >= 3.0`, () =>
        expect(contrast(tokens[mode].border, tokens[mode][bg])).toBeGreaterThanOrEqual(3.0));
  });

// The "strong" button (Button.tsx) puts `bg`-colored text on a `signal` fill.
for (const mode of ["light", "dark"] as const)
  test(`${mode}: bg text on a signal fill >= 4.5`, () =>
    expect(contrast(tokens[mode].bg, tokens[mode].signal)).toBeGreaterThanOrEqual(4.5));

// The demo banner (DemoBanner.tsx) and the delete confirm (log EntryForm.tsx) put `bg` text
// on a `pace` / `danger` fill. (The ring's track is the `border` token, covered above.)
for (const mode of ["light", "dark"] as const)
  for (const fill of ["pace", "danger"] as const)
    test(`${mode}: bg text on a ${fill} fill >= 4.5`, () =>
      expect(contrast(tokens[mode].bg, tokens[mode][fill])).toBeGreaterThanOrEqual(4.5));
