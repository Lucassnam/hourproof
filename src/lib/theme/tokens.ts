export const tokens = {
  dark: {
    bg: "#0E1116",
    surface: "#171B22",
    "surface-2": "#1F2530",
    text: "#F2F4F7",
    "text-muted": "#A3ACB9",
    proof: "#3DDC97",
    pace: "#FFB547",
    signal: "#8B7CFF",
    danger: "#FF6B6B",
  },
  light: {
    bg: "#F6F7F9",
    surface: "#FFFFFF",
    "surface-2": "#EEF1F5",
    text: "#0E1116",
    "text-muted": "#4B5563",
    proof: "#127A52",
    pace: "#9A5B00",
    signal: "#5B4BDB",
    danger: "#B42318",
  },
} as const;

export type ThemeMode = keyof typeof tokens;
export type TokenName = keyof (typeof tokens)["dark"];
