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

export const categoryAxis = (data: unknown[], extra: Obj = {}): Obj => ({ type: 'category', data, ...extra });

/* ── Bars ───────────────────────────────────────────────────────────────── */

export interface DivergingOpts {
  name: string;
  /** [x, value] pairs, or plain values when paired with a categoryAxis. */
  data: unknown[];
  /** Maps a value to its bar colour — usually a zone/threshold lookup. */
  colorFor: (value: number) => string;
  /** Bar width; omit to let ECharts fit them. */
  barWidth?: number | string;
  extra?: Obj;
}

/**
 * Zero-crossing bars.
 *
 * A line forces the reader to trace a stroke and work out which side of an
 * invisible origin it sits on. Bars from a shared baseline encode the sign
 * TWICE — direction and colour — so "green up = winning, red down = losing"
 * lands without reading an axis, and streaks show up as solid blocks.
 */
export const divergingBars = ({ name, data, colorFor, barWidth, extra = {} }: DivergingOpts): Obj => ({
  name,
  type: 'bar',
  data,
  ...(barWidth != null ? { barWidth } : {}),
  itemStyle: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    color: (p: any) => {
      const raw = Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
      return colorFor(Number(raw));
    }
  },
  ...extra
});

/** A ranked horizontal bar row set — pair with categoryAxis on the yAxis. */
export const rankedBars = ({ name, data, colorFor, barWidth = '58%', extra = {} }: DivergingOpts): Obj =>
  divergingBars({ name, data, colorFor, barWidth, extra: { ...extra } });

/* ── Zoom ───────────────────────────────────────────────────────────────── */

/**
 * Drag-to-pan + zoom without stealing the page scroll.
 *
 * Two ECharts defaults would fight the page on a long dashboard:
 *  - zoomOnMouseWheel:true hijacks the wheel over a chart, trapping desktop scroll.
 *    Gating it behind Ctrl/⌘ keeps normal scrolling intact.
 *  - moveOnMouseMove:true pans on a single-finger drag, which on a phone eats the
 *    vertical swipe the user needs to scroll the page. Off — pinch still zooms.
 */
export const zoomInside = (extra: Obj = {}): Obj => ({
  type: 'inside',
  zoomOnMouseWheel: 'ctrl',
  moveOnMouseWheel: false,
  moveOnMouseMove: false,
  ...extra
});

/** Visible range slider. Costs vertical space — pair with extra grid bottom. */
export const zoomSlider = (extra: Obj = {}): Obj => ({ type: 'slider', height: 18, bottom: 6, brushSelect: false, ...extra });

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
  /** Downsampling strategy. 'lttb' (default) preserves the visual shape. */
  sampling?: 'lttb' | 'average' | 'max' | 'min' | 'sum' | 'none';
  extra?: Obj;
}

/**
 * A line series with this app's defaults (no symbols, sane width).
 *
 * `sampling: 'lttb'` — Largest-Triangle-Three-Buckets. When a series holds more
 * points than the chart has pixels (years of daily history, several series at
 * once), ECharts draws a reduced set chosen to preserve the curve's SHAPE —
 * peaks and troughs survive, unlike naive every-Nth decimation. First and last
 * points are always kept, so "latest value" markers stay correct. Below the
 * pixel threshold it does nothing at all, so it is safe as a default.
 */
export const lineSeries = ({ name, data, color, width = 1.6, dashed = false, z, area = false, endLabel, smooth = false, sampling = 'lttb', extra = {} }: LineOpts): Obj => ({
  name,
  type: 'line',
  showSymbol: false,
  smooth,
  ...(sampling !== 'none' ? { sampling } : {}),
  data,
  ...(z != null ? { z } : {}),
  lineStyle: { width, ...(color ? { color } : {}), ...(dashed ? { type: 'dashed' } : {}) },
  ...(color ? { itemStyle: { color } } : {}),
  ...(area ? { areaStyle: { opacity: typeof area === 'number' ? area : 0.08, ...(color ? { color } : {}) } } : {}),
  ...(endLabel && color ? { endLabel: { show: true, formatter: endLabel, color, fontSize: 9, distance: 4 } } : {}),
  ...extra
});

/* ── Speedometer gauge ──────────────────────────────────────────────────── */

/** The 0→1 risk bands (green → red) the gauges have always used. */
const GAUGE_BANDS: readonly [number, string][] = [
  [0.2, '#2fbf71'],
  [0.4, '#9acd3e'],
  [0.6, '#ffd23f'],
  [0.8, '#ff8c42'],
  [1.0, '#ff5d6c']
];

/** Band colour for a 0→1 value (used for the needle + readout). */
export const gaugeBandColor = (v: number, adapt: (h: string) => string): string =>
  adapt((GAUGE_BANDS.find(([to]) => v < to) ?? GAUGE_BANDS[GAUGE_BANDS.length - 1])[1]);

export interface GaugeOpts {
  /** 0..1, or null when the metric is unavailable/locked. */
  value: number | null;
  /** Rendered pixel width — tick/label/readout sizes scale off this. */
  size?: number;
  /** Digits in the centre readout. */
  precision?: number;
  /** Small caption under the number (the demo's "km / h" slot). */
  label?: string;
  /** Muted colour for ticks/labels (pass a themed token). */
  muted: string;
  /** Strong colour for the readout text. */
  strong: string;
  /** Track colour behind the bands. */
  track: string;
  /** Surface colour — fills the anchor hub, as `#001122` does in the demo. */
  panel: string;
  /** Theme-aware hue adapter, so the bands stay legible on white. */
  adapt: (hex: string) => string;
}

/** Re-alpha a colour for the glow gradient. Handles #rgb/#rrggbb and rgb(a)(). */
const withAlpha = (color: string, a: number): string => {
  if (color.startsWith('#')) {
    const h = color.slice(1);
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const m = color.match(/(\d+(?:\.\d+)?)/g);
  return m && m.length >= 3 ? `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a})` : color;
};

/** Tapered needle from the ECharts speed-gauge demo. */
const NEEDLE =
  'path://M2.9,0.7L2.9,0.7c1.4,0,2.6,1.2,2.6,2.6V285c0,0.7-0.6,1.3-1.3,1.3l0,0c-0.7,0-1.3-0.6-1.3-1.3V3.3C0.3,1.9,1.5,0.7,2.9,0.7z';

/**
 * Speedometer modelled on the ECharts "Gauge Speed" demo: a thin track with a
 * red danger zone at the top of the scale, a glowing progress sweep, fine tick
 * marks, a long tapered needle and a ring hub — with the value and its label
 * stacked under the centre.
 *
 * Values are 0→1, matching every risk score in the app. Sizes are derived from
 * `size` because these render anywhere from 150px to 220px wide and fixed pixel
 * type would collide with the readout at the small end.
 */
export const gaugeOption = ({ value, size = 180, precision = 3, label, muted, strong, track, panel, adapt }: GaugeOpts): Obj => {
  const v = value == null ? null : Math.max(0, Math.min(1, value));
  const s = size / 220; // scale factor against the largest gauge in the app
  const px = (n: number) => Math.max(7, Math.round(n * s));
  const sweep = v == null ? track : gaugeBandColor(v, adapt);
  const danger = adapt('#ff5d6c');

  // The demo's signature glow is NOT a shadow — it is a very wide `progress`
  // bar (width 200 there) painted with a radial gradient that is transparent at
  // the centre and saturated at the rim, so the lit sector appears to bloom
  // inward. Width scales with the gauge so it reads the same at 150px as 220px.
  const glow = {
    type: 'radial',
    x: 0.5,
    y: 0.5,
    r: 0.5,
    colorStops: [
      { offset: 0, color: 'transparent' },
      { offset: 0.76, color: 'transparent' },
      { offset: 0.9, color: withAlpha(sweep, 0.1) },
      { offset: 0.97, color: withAlpha(sweep, 0.32) },
      { offset: 1, color: withAlpha(sweep, 0.75) }
    ]
  };

  return {
    series: [
      {
        type: 'gauge',
        min: 0,
        max: 1,
        startAngle: 225,
        endAngle: -45,
        radius: '80%',
        center: ['50%', '52%'],
        splitNumber: 5,
        // Thin track; the last fifth is the redline, exactly as in the demo.
        axisLine: { lineStyle: { width: Math.max(1.5, 2 * s), color: [[0.8, track], [1, danger]] } },
        progress: { show: v != null, width: Math.round(size * 0.3), itemStyle: { color: glow } },
        axisTick: { splitNumber: 5, distance: 0, length: px(5), lineStyle: { color: muted, width: 1 } },
        splitLine: { distance: 0, length: px(11), lineStyle: { color: strong, width: Math.max(1.5, 2 * s) } },
        // The 0.0 and 1.0 labels sit at the arc's lower tips, exactly where the
        // readout goes on a gauge this small — the bands already imply the range.
        axisLabel: { distance: px(14), fontSize: px(9), color: muted, formatter: (n: number) => (n === 0 || n === 1 ? '' : n.toFixed(1)) },
        pointer: v == null
          ? { show: false }
          : { icon: NEEDLE, width: Math.max(3, 5 * s), length: '88%', offsetCenter: [0, '8%'], itemStyle: { color: strong } },
        // Hub: filled with the surface colour, ringed and glowing.
        anchor: v == null
          ? { show: false }
          : {
              show: true,
              showAbove: false,
              size: px(22),
              itemStyle: { color: panel, borderColor: strong, borderWidth: Math.max(1.5, 2 * s), shadowBlur: Math.round(22 * s), shadowColor: withAlpha(strong, 0.5) }
            },
        // Value + caption stacked below the hub, like the demo's "160 / km / h".
        title: { show: !!label, offsetCenter: [0, '80%'], fontSize: px(10), color: muted },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, label ? '54%' : '62%'],
          fontSize: px(24),
          fontWeight: 700,
          color: v == null ? muted : strong,
          formatter: () => (v == null ? '—' : v.toFixed(precision))
        },
        data: [{ value: v ?? 0, name: label ?? '' }]
      }
    ]
  };
};

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
