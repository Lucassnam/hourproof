import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { tokens } from "../tokens";

const CSS_PATH = join(__dirname, "../../../app/globals.css");
const TOKEN_NAMES = [
  "bg",
  "surface",
  "surface-2",
  "text",
  "text-muted",
  "proof",
  "pace",
  "signal",
  "danger",
  "border",
] as const;

function extractBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*{([^}]*)}`));
  if (!match) throw new Error(`Could not find block for selector: ${selector}`);
  return match[1];
}

function extractTokens(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    result[m[1]] = m[2];
  }
  return result;
}

const css = readFileSync(CSS_PATH, "utf8");
const rootBlock = extractTokens(extractBlock(css, ":root"));
const darkBlock = extractTokens(extractBlock(css, '[data-theme="dark"]'));

describe("css-sync", () => {
  test(":root block declares all tokens", () => {
    for (const name of TOKEN_NAMES) {
      expect(rootBlock).toHaveProperty(name);
    }
  });

  test('[data-theme="dark"] block declares all tokens', () => {
    for (const name of TOKEN_NAMES) {
      expect(darkBlock).toHaveProperty(name);
    }
  });

  for (const name of TOKEN_NAMES) {
    test(`:root --${name} matches tokens.light.${name}`, () => {
      expect(rootBlock[name]?.toLowerCase()).toBe(tokens.light[name].toLowerCase());
    });

    test(`[data-theme="dark"] --${name} matches tokens.dark.${name}`, () => {
      expect(darkBlock[name]?.toLowerCase()).toBe(tokens.dark[name].toLowerCase());
    });
  }
});
