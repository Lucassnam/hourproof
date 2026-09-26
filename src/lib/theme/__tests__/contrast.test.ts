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
