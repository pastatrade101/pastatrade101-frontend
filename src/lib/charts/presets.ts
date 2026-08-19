// Shared chart option presets.
//
// Phase 1 ($lib/charts/theme.ts) made the *chrome* — axes, tooltips, legends,
// split lines — theme-owned, so charts no longer need to spell any of that out.
// This module removes the rest of the duplication: the axis/grid/tooltip
// boilerplate that was hand-written ~130 times, and the data colours.
//
// On colour: brand tokens (--c-mint/accent/warn/danger) are only four hues, so
// they cannot carry an 8-coin categorical chart or a 6-band risk ramp without
// losing information. Those scales live here instead — curated once, and tuned
// per theme. The dark values are byte-identical to what the charts used before,
// so dark mode is unchanged; the light values are darkened for contrast on white
// (the old ones, e.g. #A3E635 lime, were close to invisible on a white card).

import { derived } from 'svelte/store';
import { theme } from '$lib/stores/theme';

/* ── Colour scales ──────────────────────────────────────────────────────── */

/** Categorical hues for "one colour per coin/series" charts (up to 8). */
const CATEGORICAL = {
  dark: ['#F59E0B', '#3B82F6', '#22C55E', '#EF4444', '#C084FC', '#22D3EE', '#F472B6', '#34D399'],
  light: ['#B45309', '#1D4ED8', '#15803D', '#B91C1C', '#7C3AED', '#0E7490', '#BE185D', '#047857']
} as const;

/** Sequential safe→danger ramp for regression bands. */
const RISK_RAMP = {
  dark: { price: '#22D3EE', fit: '#34D399', lower: '#2DD4BF', upper: '#A3E635', bubbleLower: '#FB923C', bubbleUpper: '#EF4444' },
  light: { price: '#0E7490', fit: '#047857', lower: '#0F766E', upper: '#4D7C0F', bubbleLower: '#C2410C', bubbleUpper: '#B91C1C' }
} as const;

/** Widened to plain strings — typing this off RISK_RAMP.dark would narrow to that
 *  branch's literal hexes and make the light branch unassignable. */
export type RiskRamp = Record<keyof (typeof RISK_RAMP)['dark'], string>;

/** Theme-reactive categorical scale. Usage: `$categorical[i % $categorical.length]`. */
export const categorical = derived(theme, ($t): readonly string[] => CATEGORICAL[$t] ?? CATEGORICAL.dark);

/** Theme-reactive band ramp. Usage: `$riskRamp.price`. */
export const riskRamp = derived(theme, ($t): RiskRamp => RISK_RAMP[$t] ?? RISK_RAMP.dark);

/* ── Semantic hue adapter ───────────────────────────────────────────────── */
// Some charts carry hues that mean something specific ("blue = BTC price",
// "gold = profit") and are named in the copy beside them. Those must NOT be
// remapped onto the categorical scale. Instead, keep the exact hue in dark mode
// and darken it just enough to stay legible on a white card in light mode.

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};

/** Relative luminance (WCAG). */
const luminance = ([r, g, b]: [number, number, number]): number => {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/**
 * Darken a hue until it clears a readability bar against white, preserving its
 * hue and saturation ratios so "the blue line" stays recognisably blue.
 */
const darkenForLight = (hex: string): string => {
  if (!/^#[0-9a-fA-F]{3,6}$/.test(hex)) return hex;
  let rgb = hexToRgb(hex);
  // Target luminance ~0.22 keeps roughly a 3:1 contrast against white, which is
  // the WCAG minimum for graphical objects.
  let guard = 0;
  while (luminance(rgb) > 0.22 && guard < 24) {
    rgb = [Math.round(rgb[0] * 0.9), Math.round(rgb[1] * 0.9), Math.round(rgb[2] * 0.9)];
    guard += 1;
  }
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Theme-reactive hue adapter for semantic colours.
 * Usage: `$adaptHue('#37e0a6')` — identical in dark, legible in light.
 */
export const adaptHue = derived(theme, ($t) => ($t === 'light' ? darkenForLight : (hex: string) => hex));

/* ── Option builders ────────────────────────────────────────────────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;

/**
 * Standard plot area. `containLabel` keeps axis labels inside the canvas, which
 * is what almost every chart here wants.
 */
export const grid = (extra: Obj = {}): Obj => ({ left: 8, right: 8, top: 16, bottom: 8, containLabel: true, ...extra });

export const timeAxis = (extra: Obj = {}): Obj => ({ type: 'time', ...extra });
export const valueAxis = (extra: Obj = {}): Obj => ({ type: 'value', ...extra });
export const logAxis = (extra: Obj = {}): Obj => ({ type: 'log', ...extra });

/** Crosshair tooltip shared by every time-series chart. Chrome comes from the theme. */
export const axisTooltip = (extra: Obj = {}): Obj => ({ trigger: 'axis', ...extra });

/** Item (hover-a-point) tooltip. */
export const itemTooltip = (extra: Obj = {}): Obj => ({ trigger: 'item', ...extra });

export interface LineOpts {
  name: string;
  data: unknown[];
  color?: string;
  width?: number;
  dashed?: boolean;
  z?: number;
  area?: boolean | number;
  endLabel?: string;
  smooth?: boolean;
  extra?: Obj;
}

/** A line series with this app's defaults (no symbols, sane width). */
export const lineSeries = ({ name, data, color, width = 1.6, dashed = false, z, area = false, endLabel, smooth = false, extra = {} }: LineOpts): Obj => ({
  name,
  type: 'line',
  showSymbol: false,
  smooth,
  data,
  ...(z != null ? { z } : {}),
  lineStyle: { width, ...(color ? { color } : {}), ...(dashed ? { type: 'dashed' } : {}) },
  ...(color ? { itemStyle: { color } } : {}),
  ...(area ? { areaStyle: { opacity: typeof area === 'number' ? area : 0.08, ...(color ? { color } : {}) } } : {}),
  ...(endLabel && color ? { endLabel: { show: true, formatter: endLabel, color, fontSize: 9, distance: 4 } } : {}),
  ...extra
});

/* ── HTML tooltip helpers ───────────────────────────────────────────────── */
// Custom `formatter` strings are the one place the theme layer cannot reach
// (it can style the tooltip box, not the HTML inside it), so the colours passed
// here must come from the theme-reactive scales above.

/** Coloured marker dot matching ECharts' own tooltip markers. */
export const tipDot = (color: string): string =>
  `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle"></span>`;

/** One `● Label: **value**` row. */
export const tipRow = (color: string, label: string, value: string): string => `${tipDot(color)}${label}: <b>${value}</b>`;

/** Wrap rows into the tooltip body. */
export const tipBody = (rows: string[]): string => rows.join('<br/>');
