// Chart theming driven by the app's own design tokens.
//
// Every chart option in this app used to hardcode its chrome (#9CA3AF axis
// labels, #1F2937 split lines, #0E1117 tooltips — 279 hex literals in total).
// That made charts blind to light mode AND to the admin Branding page, which
// recolors the whole site by rewriting the --c-* CSS variables.
//
// Instead of registering an ECharts theme (which is init-time only, so toggling
// would force a dispose + re-init and a visible flash), we merge a token-derived
// layer into the option on every setOption:
//
//   defaults  →  caller's option  →  chrome
//
// `defaults` (series palette, fonts) lose to the caller, so a chart can still
// choose its own series colors. `chrome` (axis/tooltip/legend/splitLine colors)
// wins, so the theme always owns the furniture. Re-reading the tokens and
// pushing setOption again is all a theme switch costs — no re-init, no flash.

import { browser } from '$app/environment';

/** Read an `--c-*` token ("55 224 166") straight off the document. */
const token = (name: string, fallback: string): string => {
  if (!browser) return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** "55 224 166" → "rgba(55, 224, 166, a)" (legacy syntax: safest for canvas). */
const rgba = (triplet: string, a = 1): string => {
  const [r, g, b] = triplet.split(/[\s,]+/);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export interface ChartTokens {
  mint: string;
  accent: string;
  warn: string;
  danger: string;
  muted: string;
  edge: string;
  panel: string;
  body: string;
  strong: string;
}

/** Snapshot the current theme's tokens. Cheap; call it on every theme change. */
export const readChartTokens = (): ChartTokens => ({
  mint: token('--c-mint', '55 224 166'),
  accent: token('--c-accent', '91 140 255'),
  warn: token('--c-warn', '255 181 71'),
  danger: token('--c-danger', '255 93 108'),
  muted: token('--c-muted', '139 151 168'),
  edge: token('--c-edge', '34 43 57'),
  panel: token('--c-panel', '17 22 31'),
  body: token('--c-body', '226 232 240'),
  strong: token('--c-strong', '255 255 255')
});

/** Categorical series palette — used only where a chart doesn't pick its own. */
const palette = (t: ChartTokens): string[] => [
  rgba(t.mint),
  rgba(t.accent),
  rgba(t.warn),
  rgba(t.danger),
  rgba(t.mint, 0.6),
  rgba(t.accent, 0.6),
  rgba(t.warn, 0.6),
  rgba(t.danger, 0.6)
];

const FONT = "'Inter', system-ui, -apple-system, sans-serif";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;

const isPlain = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Deep merge where `src` wins. Arrays are replaced, not concatenated. */
const merge = (base: Obj, src: Obj): Obj => {
  const out: Obj = { ...base };
  for (const [k, v] of Object.entries(src)) {
    out[k] = isPlain(v) && isPlain(out[k]) ? merge(out[k], v) : v;
  }
  return out;
};

/** Apply an axis chrome patch to an axis that may be a single object or an array. */
const patchAxis = (axis: unknown, patch: Obj): unknown => {
  if (Array.isArray(axis)) return axis.map((a) => merge(isPlain(a) ? a : {}, patch));
  if (isPlain(axis)) return merge(axis, patch);
  return axis;
};

/**
 * Merge the token-derived theme into a chart option.
 * Pure — returns a new option and never mutates the caller's object.
 */
export const applyChartTheme = (option: Obj, t: ChartTokens): Obj => {
  if (!isPlain(option)) return option;

  // Lose to the caller: a chart may still choose its own series colors.
  const defaults: Obj = {
    color: palette(t),
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT, color: rgba(t.body) },
    animationDuration: 420,
    // Generates a screen-reader description of the chart from its series/axes.
    aria: { enabled: true }
  };

  // Beat the caller: the theme owns the furniture, in every mode.
  const axisPatch: Obj = {
    axisLabel: { color: rgba(t.muted), fontFamily: FONT },
    axisLine: { lineStyle: { color: rgba(t.edge, 0.9) } },
    axisTick: { lineStyle: { color: rgba(t.edge, 0.9) } },
    splitLine: { lineStyle: { color: rgba(t.edge, 0.55) } },
    nameTextStyle: { color: rgba(t.muted) }
  };
  const chrome: Obj = {
    tooltip: {
      backgroundColor: rgba(t.panel, 0.96),
      borderColor: rgba(t.edge),
      textStyle: { color: rgba(t.body), fontFamily: FONT },
      extraCssText: 'backdrop-filter: blur(8px); border-radius: 10px;'
    },
    legend: { textStyle: { color: rgba(t.muted), fontFamily: FONT } }
  };

  const merged = merge(merge(defaults, option), chrome);
  // Axes are patched separately so array-form axes are handled element-wise.
  if (merged.xAxis) merged.xAxis = patchAxis(merged.xAxis, axisPatch);
  if (merged.yAxis) merged.yAxis = patchAxis(merged.yAxis, axisPatch);
  return merged;
};
