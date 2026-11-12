<script lang="ts">
  import { Info, Flame, Clock, Database } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import Gauge from '$lib/components/Gauge.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import EChart from '$lib/components/EChart.svelte';
  import PlainRead from '$lib/components/PlainRead.svelte';
  import ReadLabel from '$lib/components/ReadLabel.svelte';
  import { grid, valueAxis, logAxis, timeAxis, axisTooltip, itemTooltip, lineSeries, zoomInside, categorical, categoryAxis, rankedBars } from '$lib/charts/presets';
  import { readChartTokens } from '$lib/charts/theme';
  import { theme } from '$lib/stores/theme';

  const canDeriv = $derived(hasFeature($membership, 'access_derivatives'));

  // ── Data ──
  type Pt = [string, number];
  type Tone = 'good' | 'warn' | 'neutral';
  interface Input {
    key: string;
    input: string;
    reading: string;
    weight: number;
    risk: number | null;
    tone: Tone;
    as_of: string | null;
  }
  interface Live {
    as_of: string;
    leverage_risk: number | null;
    leverage_percent: number | null;
    label: string;
    confidence: string;
    interpretation: string;
    inputs: Input[];
    funding: { as_of: string; latest: number; avg_24h: number | null; annualised_pct: number | null; avg_30d: number | null } | null;
    open_interest: {
      as_of: string;
      usd: number;
      btc: number | null;
      chg_7d_pct: number | null;
      chg_30d_pct: number | null;
      usd_chg_7d_pct: number | null;
      percentile_1y: number | null;
      high_1y_btc: number | null;
    } | null;
    positioning: { as_of: string; ratio: number; ratio_24h: number | null; long_pct: number | null; percentile_1y: number | null; median_1y: number | null } | null;
    taker: { as_of: string; ratio_24h: number; buy_share_24h_pct: number; ratio_7d: number | null } | null;
    liquidations: { as_of: string; total_usd: number; long_usd: number; short_usd: number; avg_30d_usd: number | null } | null;
    coinbase_premium: { as_of: string; value: number; avg_30d: number | null } | null;
    oi_by_exchange: { key: string; name: string; usd: number; share_pct: number }[];
  }
  interface History {
    score: [string, number, number, number, number][];
    price: Pt[];
    funding: Pt[];
    open_interest: [string, number, number | null][];
    long_short: Pt[];
    taker: Pt[];
    liquidations: [string, number, number][];
    premium: Pt[];
  }

  let r = $state<Live | null>(null);
  let h = $state<History | null>(null);
  let loading = $state(true);
  let error = $state('');
  let started = $state(false);

  const load = async () => {
    loading = true;
    error = '';
    try {
      const [live, hist] = await Promise.all([
        api<Live>('/derivatives', { auth: true }),
        api<History>('/derivatives/history', { auth: true }).catch(() => null)
      ]);
      r = live;
      h = hist;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load derivatives data.';
    } finally {
      loading = false;
    }
  };
  $effect(() => {
    if (!$membershipReady || started) return;
    started = true;
    if (!canDeriv) {
      loading = false;
      return;
    }
    void load();
  });

  // ── Formatting ──
  const ts = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
  const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
  const fund = (f: number | null | undefined) => (f == null ? '—' : `${f >= 0 ? '+' : ''}${(f * 100).toFixed(4)}%`);
  const usdM = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`);
  const usdCompact = (v: number) => '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const btcK = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v / 1000)}K BTC`);
  const ordinal = (p: number) => {
    const n = Math.round(p * 100);
    const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
    return `${n}${s}`;
  };
  const fmtWhen = (s: string | null | undefined) => {
    if (!s) return '';
    const hasTime = s.length > 10;
    const d = new Date(hasTime ? `${s.replace(' ', 'T')}Z` : `${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    return hasTime
      ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  const signTone = (v: number | null | undefined, goodWhenUp = true) => (v == null || Math.abs(v) < 0.05 ? 'text-muted' : (v > 0) === goodWhenUp ? 'text-mint' : 'text-danger');

  // ── Score ──
  const zonePill = (s: number) => (s < 0.35 ? 'bg-mint/15 text-mint' : s < 0.55 ? 'bg-accent/15 text-accent' : s < 0.75 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger');
  const zoneText = (s: number) => (s < 0.35 ? 'text-mint' : s < 0.55 ? 'text-accent' : s < 0.75 ? 'text-warn' : 'text-danger');
  const zoneBar = (s: number) => (s < 0.35 ? 'bg-mint' : s < 0.55 ? 'bg-accent' : s < 0.75 ? 'bg-warn' : 'bg-danger');
  const confPill = (c: string) => (c === 'High' ? 'bg-mint/15 text-mint' : c === 'Low' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const toneText = (t: string) => (t === 'good' ? 'text-mint' : t === 'warn' ? 'text-danger' : 'text-soft');
  const toneBg = (t: string) => (t === 'good' ? 'bg-mint' : t === 'warn' ? 'bg-danger' : 'bg-muted');

  const verdict = $derived.by(() => {
    const s = r?.leverage_risk;
    if (s == null) return { head: 'Leverage read unavailable', sub: '' };
    if (s >= 0.75) return { head: 'The futures market is crowded long', sub: 'Leverage is stretched — a fragile setup where a stall in price can trigger long liquidations.' };
    if (s >= 0.55) return { head: 'Leverage is building', sub: 'Not overheated yet, but traders are adding risk — over-extension is worth watching.' };
    if (s >= 0.35) return { head: 'Leverage is at a normal level', sub: 'Funding, open interest and positioning are not stretched together.' };
    return { head: 'Leverage is light', sub: 'The futures market is not crowded — a calmer backdrop than crowded-long conditions.' };
  });
  const change7 = $derived.by(() => {
    if (!h?.score.length || r?.leverage_percent == null) return null;
    const last = h.score[h.score.length - 1];
    const target = ts(last[0]) - 7 * 86_400_000;
    const prior = [...h.score].reverse().find((x) => ts(x[0]) <= target);
    return prior ? r.leverage_percent - prior[1] : null;
  });

  // ── Sparklines ──
  const lastDays = <T extends [string, ...unknown[]]>(rows: T[] | undefined, days: number): T[] => {
    if (!rows?.length) return [];
    const from = ts(rows[rows.length - 1][0]) - days * 86_400_000;
    return rows.filter((x) => ts(x[0]) >= from);
  };
  const spark = (vals: (number | null)[], w = 120, hgt = 30) => {
    const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
    if (v.length < 2) return '';
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(hgt - 2 - ((x - min) / span) * (hgt - 4)).toFixed(1)}`).join(' ');
  };

  const tiles = $derived.by(() => {
    if (!r) return [];
    const out: { label: string; value: string; valueTone?: string; sub: string; subTone: string; note: string; spark: string; when: string; title: string }[] = [];
    if (r.funding) {
      const f = r.funding.avg_24h ?? r.funding.latest;
      out.push({
        label: 'Funding (8h)',
        value: fund(r.funding.latest),
        valueTone: r.funding.latest < 0 ? 'text-mint' : r.funding.latest > 0.0003 ? 'text-danger' : 'text-strong',
        sub: `24h avg ${fund(f)}`,
        subTone: f < 0 ? 'text-mint' : f > 0.0003 ? 'text-danger' : 'text-muted',
        note: r.funding.annualised_pct == null ? '' : `${r.funding.annualised_pct.toFixed(1)}% a year · 30D avg ${fund(r.funding.avg_30d)}`,
        spark: spark(lastDays(h?.funding, 90).map((x) => x[1])),
        when: fmtWhen(r.funding.as_of),
        title: 'What longs pay shorts every 8 hours (negative = shorts pay longs). Sparkline: daily average, last 90 days.'
      });
    }
    if (r.open_interest) {
      const o = r.open_interest;
      out.push({
        label: 'Open interest',
        value: o.btc != null ? btcK(o.btc) : usdM(o.usd),
        sub: `${pct(o.chg_7d_pct)} 7D · ${pct(o.chg_30d_pct)} 30D`,
        subTone: signTone(o.chg_30d_pct, false),
        note: `${usdM(o.usd)}${o.high_1y_btc ? ` · 1-yr high ${btcK(o.high_1y_btc)}` : ''}`,
        spark: spark(lastDays(h?.open_interest, 365).map((x) => x[2])),
        when: fmtWhen(o.as_of),
        title: 'BTC futures open interest across exchanges, measured in BTC so price moves do not distort it. Sparkline: last 12 months.'
      });
    }
    if (r.positioning) {
      const p = r.positioning;
      out.push({
        label: 'Top traders L/S',
        value: p.ratio.toFixed(2),
        valueTone: (p.percentile_1y ?? 0.5) >= 0.9 ? 'text-danger' : (p.percentile_1y ?? 0.5) <= 0.1 ? 'text-mint' : 'text-strong',
        sub: p.long_pct == null ? `24h avg ${p.ratio_24h?.toFixed(2) ?? '—'}` : `${p.long_pct.toFixed(1)}% of accounts long`,
        subTone: 'text-muted',
        note: `24h ${p.ratio_24h?.toFixed(2) ?? '—'} · 1-yr median ${p.median_1y?.toFixed(2) ?? '—'}`,
        spark: spark(lastDays(h?.long_short, 365).map((x) => x[1])),
        when: fmtWhen(p.as_of),
        title: 'Long/short ratio of top-trader accounts (hourly). Above 1 = more accounts long. Sparkline: daily average, last 12 months.'
      });
    }
    if (r.taker) {
      const t = r.taker;
      out.push({
        label: 'Taker buy/sell (24h)',
        value: t.ratio_24h.toFixed(3),
        valueTone: t.ratio_24h > 1.05 ? 'text-mint' : t.ratio_24h < 0.95 ? 'text-danger' : 'text-strong',
        sub: `${t.buy_share_24h_pct.toFixed(1)}% market buys`,
        subTone: 'text-muted',
        note: t.ratio_7d == null ? '' : `7-day ${t.ratio_7d.toFixed(3)} · above 1 = buyers lead`,
        spark: spark(lastDays(h?.taker, 90).map((x) => x[1])),
        when: fmtWhen(t.as_of),
        title: 'Market-buy volume divided by market-sell volume in futures. Sparkline: daily, last 90 days.'
      });
    }
    if (r.liquidations) {
      const l = r.liquidations;
      out.push({
        label: 'Liquidations (1 day)',
        value: usdM(l.total_usd),
        sub: `Longs ${usdM(l.long_usd)} · Shorts ${usdM(l.short_usd)}`,
        subTone: l.long_usd > l.short_usd * 1.5 ? 'text-danger' : l.short_usd > l.long_usd * 1.5 ? 'text-mint' : 'text-muted',
        note: l.avg_30d_usd == null ? '' : `30-day avg ${usdM(l.avg_30d_usd)}`,
        spark: spark(lastDays(h?.liquidations, 90).map((x) => x[1] + x[2])),
        when: fmtWhen(l.as_of),
        title: 'BTC futures positions force-closed in the last full day. Sparkline: daily total, last 90 days.'
      });
    }
    if (r.coinbase_premium) {
      const c = r.coinbase_premium;
      out.push({
        label: 'Coinbase premium',
        value: `${c.value >= 0 ? '+' : '−'}${Math.abs(c.value).toFixed(3)}%`,
        valueTone: c.value > 0.05 ? 'text-mint' : c.value < -0.05 ? 'text-danger' : 'text-strong',
        sub: c.avg_30d == null ? '' : `30D avg ${c.avg_30d >= 0 ? '+' : '−'}${Math.abs(c.avg_30d).toFixed(3)}%`,
        subTone: 'text-muted',
        note: c.value >= 0 ? 'US spot buyers paying up' : 'US spot demand softer than offshore',
        spark: spark(lastDays(h?.premium, 90).map((x) => x[1])),
        when: fmtWhen(c.as_of),
        title: 'Coinbase BTC/USD price vs Binance BTC/USDT, in %. Positive = stronger US spot demand. Sparkline: last 90 days.'
      });
    }
    return out;
  });

  // ── "What the data says" — fixed rules over the numbers above ──
  const notes = $derived.by(() => {
    if (!r) return [];
    const out: { tone: Tone; head: string; text: string }[] = [];
    const p = r.positioning;
    if (p && p.percentile_1y != null) {
      const q = p.percentile_1y;
      out.push({
        tone: q >= 0.9 ? 'warn' : q <= 0.1 ? 'good' : 'neutral',
        head: 'Positioning',
        text: `Top-trader accounts are ${(p.ratio_24h ?? p.ratio).toFixed(2)} long for every short (24h average) — the ${ordinal(q)} percentile of the past year (median ${p.median_1y?.toFixed(2) ?? '—'}). ${q >= 0.9 ? 'Positioning this one-sided has often come before long squeezes.' : q <= 0.1 ? 'Traders are unusually short — crowded shorts can fuel squeezes higher.' : 'That is within its usual range.'}`
      });
    }
    if (r.funding) {
      const f = r.funding.avg_24h ?? r.funding.latest;
      out.push({
        tone: f < 0 ? 'good' : f > 0.0003 ? 'warn' : 'neutral',
        head: 'Funding',
        text: `Funding averages ${fund(f)} per 8 hours over the last day${r.funding.annualised_pct != null ? ` (${r.funding.annualised_pct.toFixed(1)}% a year)` : ''}. ${f < 0 ? 'Shorts are paying longs — a fearful market.' : f > 0.0003 ? 'Longs are paying a steep premium to stay long — an overheated sign.' : 'A normal, mildly positive level — longs are not overpaying.'}`
      });
    }
    const o = r.open_interest;
    if (o && o.btc != null) {
      const c30 = o.chg_30d_pct ?? 0;
      out.push({
        tone: c30 > 10 && (o.percentile_1y ?? 0) >= 0.7 ? 'warn' : c30 < -10 ? 'good' : 'neutral',
        head: 'Open interest',
        text: `${btcK(o.btc)} (${usdM(o.usd)}) is open across exchanges, ${pct(o.chg_7d_pct)} over 7 days and ${pct(o.chg_30d_pct)} over 30${o.percentile_1y != null ? ` — the ${ordinal(o.percentile_1y)} percentile of the year` : ''}. ${c30 > 10 ? 'Leverage has been building quickly.' : c30 < -10 ? 'Leverage has been flushed out.' : 'Leverage is steady.'}`
      });
    }
    const l = r.liquidations;
    if (l) {
      const heavy = l.avg_30d_usd != null && l.total_usd > 2 * l.avg_30d_usd;
      const longShare = l.total_usd ? Math.round((l.long_usd / l.total_usd) * 100) : 0;
      out.push({
        tone: 'neutral',
        head: 'Liquidations',
        text: `${usdM(l.total_usd)} of positions were force-closed on ${fmtWhen(l.as_of)} — ${longShare}% of it longs${l.avg_30d_usd != null ? `, against a 30-day average of ${usdM(l.avg_30d_usd)}` : ''}. ${heavy ? 'A heavy day: leverage was forced out.' : 'A quiet day by recent standards.'}`
      });
    }
    if (r.taker || r.coinbase_premium) {
      const t = r.taker;
      const c = r.coinbase_premium;
      out.push({
        tone: 'neutral',
        head: 'Order flow',
        text:
          (t ? `Market buys vs sells: ${t.ratio_24h.toFixed(3)} over 24 hours — ${t.ratio_24h > 1.05 ? 'aggressive buyers in control' : t.ratio_24h < 0.95 ? 'aggressive sellers in control' : 'balanced'}. ` : '') +
          (c ? `The Coinbase premium is ${c.value >= 0 ? '+' : '−'}${Math.abs(c.value).toFixed(3)}% — ${c.value >= 0 ? 'US spot buyers are paying up' : 'US spot demand is softer than offshore'}.` : '')
      });
    }
    return out;
  });

  // ── Charts ──
  type Range = '3M' | '1Y' | '3Y' | 'All';
  const RANGES: Range[] = ['3M', '1Y', '3Y', 'All'];
  let range = $state<Range>('1Y');
  const fromTs = $derived(range === 'All' ? 0 : Date.now() - { '3M': 0.25, '1Y': 1, '3Y': 3 }[range] * 365 * 86_400_000);
  const inRange = <T extends [string, ...unknown[]]>(rows: T[] | undefined): T[] => (rows ?? []).filter((x) => ts(x[0]) >= fromTs);

  const hue = $derived({ btc: $categorical[0], a: $categorical[1], up: $categorical[2], down: $categorical[3], d: $categorical[4], e: $categorical[5] });
  const chartGrid = () => grid({ left: 54, right: 54, top: 30, bottom: 28, containLabel: false });
  const dateTip = (extra = {}) => axisTooltip({ textStyle: { fontSize: 11 }, ...extra });
  // Log scale only across the whole history; over shorter ranges a log axis
  // squashes the price into a flat line.
  const priceAxis = () =>
    range === 'All'
      ? logAxis({ position: 'right', name: 'BTC', splitLine: { show: false }, axisLabel: { formatter: usdCompact } })
      : valueAxis({ position: 'right', scale: true, name: 'BTC', splitLine: { show: false }, axisLabel: { formatter: usdCompact } });
  // Reference-line label in the muted text colour, without the default outline.
  const muted = $derived.by(() => {
    void $theme;
    const [x, y, z] = readChartTokens().muted.split(/[\s,]+/);
    return `rgb(${x}, ${y}, ${z})`;
  });
  const refLabel = (text: string) => ({ formatter: text, fontSize: 9, position: 'insideEndTop', color: muted, textBorderWidth: 0 });
  const priceLine = (yAxisIndex = 1) => lineSeries({ name: 'BTC', data: inRange(h?.price).map(([d, v]) => [ts(d), v]), color: hue.btc, width: 1.1, extra: { yAxisIndex } });

  const scoreOption = $derived.by(() => {
    if (!h || h.score.length < 2) return null;
    // 7-day average over the full history first, then cut to the range, so the
    // first days of a range are averaged too.
    const avg = h.score.map((x, i) => {
      const win = h!.score.slice(Math.max(0, i - 6), i + 1);
      return [x[0], Math.round(win.reduce((t, y) => t + y[1], 0) / win.length)] as [string, number];
    });
    const rows = inRange(h.score);
    const smooth = inRange(avg);
    if (rows.length < 2) return null;
    const band = (from: number, to: number, color: string) => [{ yAxis: from, itemStyle: { color, opacity: 0.07 } }, { yAxis: to }];
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['7-day average', 'Daily', 'BTC'] },
      tooltip: dateTip(),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: [valueAxis({ min: 0, max: 100, interval: 25 }), priceAxis()],
      dataZoom: [zoomInside()],
      series: [
        lineSeries({
          name: '7-day average',
          data: smooth.map((x) => [ts(x[0]), x[1]]),
          color: hue.a,
          width: 2,
          extra: {
            markArea: { silent: true, data: [band(0, 35, hue.up), band(55, 75, hue.btc), band(75, 100, hue.down)] }
          }
        }),
        lineSeries({ name: 'Daily', data: rows.map((x) => [ts(x[0]), x[1]]), color: hue.a, width: 0.8, extra: { lineStyle: { width: 0.8, color: hue.a, opacity: 0.35 } } }),
        priceLine(1)
      ]
    };
  });

  const fundingOption = $derived.by(() => {
    const rows = inRange(h?.funding);
    if (!rows.length) return null;
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['Funding (8h, daily avg)', 'BTC'] },
      tooltip: dateTip({ valueFormatter: (v: number) => (v == null ? '—' : Math.abs(v) < 1 ? `${v.toFixed(4)}%` : `$${Math.round(v).toLocaleString()}`) }),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: [valueAxis({ scale: true, axisLabel: { formatter: (v: number) => `${Number(v.toFixed(3))}%` } }), priceAxis()],
      dataZoom: [zoomInside()],
      series: [
        {
          name: 'Funding (8h, daily avg)',
          type: 'bar',
          barMaxWidth: 4,
          itemStyle: { color: hue.a },
          data: rows.map(([d, v]) => ({ value: [ts(d), v], itemStyle: { color: v >= 0.03 ? hue.down : v < 0 ? hue.up : hue.a, opacity: 0.85 } })),
          markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', opacity: 0.5 }, data: [{ yAxis: 0.03 }], label: refLabel('hot 0.03%') }
        },
        priceLine(1)
      ]
    };
  });

  const oiOption = $derived.by(() => {
    const rows = inRange(h?.open_interest);
    if (!rows.length) return null;
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['Open interest (K BTC)', 'Open interest ($B)'] },
      tooltip: dateTip(),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: [
        valueAxis({ scale: true, name: 'K BTC' }),
        valueAxis({ position: 'right', scale: true, name: '$B', splitLine: { show: false } })
      ],
      dataZoom: [zoomInside()],
      series: [
        lineSeries({ name: 'Open interest (K BTC)', data: rows.filter((x) => x[2] != null).map((x) => [ts(x[0]), x[2]]), color: hue.a, width: 1.8, area: 0.08 }),
        lineSeries({ name: 'Open interest ($B)', data: rows.map((x) => [ts(x[0]), x[1]]), color: hue.d, width: 1.1, dashed: true, extra: { yAxisIndex: 1 } })
      ]
    };
  });

  const lsOption = $derived.by(() => {
    const rows = inRange(h?.long_short);
    if (!rows.length) return null;
    const med = r?.positioning?.median_1y;
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['Top traders L/S', 'BTC'] },
      tooltip: dateTip({ valueFormatter: (v: number) => (v == null ? '—' : v < 50 ? v.toFixed(2) : `$${Math.round(v).toLocaleString()}`) }),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: [valueAxis({ scale: true }), priceAxis()],
      dataZoom: [zoomInside()],
      series: [
        lineSeries({
          name: 'Top traders L/S',
          data: rows.map(([d, v]) => [ts(d), v]),
          color: hue.e,
          width: 1.6,
          extra: {
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { type: 'dashed', opacity: 0.5 },
              data: [{ yAxis: 1, label: refLabel('balanced') }, ...(med ? [{ yAxis: med, label: refLabel(`1-yr median ${med.toFixed(2)}`) }] : [])]
            }
          }
        }),
        priceLine(1)
      ]
    };
  });

  const liqOption = $derived.by(() => {
    const rows = inRange(h?.liquidations);
    if (!rows.length) return null;
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['Longs liquidated', 'Shorts liquidated'] },
      tooltip: dateTip({ valueFormatter: (v: number) => (v == null ? '—' : `$${v.toFixed(1)}M`) }),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: valueAxis({ name: '$M' }),
      dataZoom: [zoomInside()],
      series: [
        { name: 'Longs liquidated', type: 'bar', stack: 'liq', barMaxWidth: 8, itemStyle: { color: hue.down, opacity: 0.85 }, data: rows.map((x) => [ts(x[0]), x[1]]) },
        { name: 'Shorts liquidated', type: 'bar', stack: 'liq', barMaxWidth: 8, itemStyle: { color: hue.up, opacity: 0.85 }, data: rows.map((x) => [ts(x[0]), x[2]]) }
      ]
    };
  });

  const flowOption = $derived.by(() => {
    const t = inRange(h?.taker);
    const p = inRange(h?.premium);
    if (!t.length && !p.length) return null;
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['Taker buy/sell', 'Coinbase premium %'] },
      tooltip: dateTip({ valueFormatter: (v: number) => (v == null ? '—' : v.toFixed(3)) }),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: [valueAxis({ scale: true, name: 'ratio' }), valueAxis({ position: 'right', scale: true, name: '%', splitLine: { show: false } })],
      dataZoom: [zoomInside()],
      series: [
        {
          name: 'Coinbase premium %',
          type: 'bar',
          barMaxWidth: 4,
          yAxisIndex: 1,
          itemStyle: { color: hue.up },
          data: p.map(([d, v]) => ({ value: [ts(d), v], itemStyle: { color: v >= 0 ? hue.up : hue.down, opacity: 0.45 } }))
        },
        lineSeries({
          name: 'Taker buy/sell',
          data: t.map(([d, v]) => [ts(d), v]),
          color: hue.a,
          width: 1.5,
          extra: { markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', opacity: 0.5 }, data: [{ yAxis: 1 }], label: { show: false } } }
        })
      ]
    };
  });

  const exchangeOption = $derived.by(() => {
    const rows = (r?.oi_by_exchange ?? []).slice(0, 10);
    if (!rows.length) return null;
    return {
      grid: grid({ left: 4, right: 40, top: 4, bottom: 4 }),
      tooltip: itemTooltip({
        textStyle: { fontSize: 11 },
        formatter: (p: { dataIndex: number }) => {
          const x = rows[p.dataIndex];
          return `<b>${x.name}</b><br/>${usdM(x.usd)} · ${x.share_pct}% of the total`;
        }
      }),
      xAxis: valueAxis({ show: false }),
      yAxis: categoryAxis(
        rows.map((x) => x.name),
        { inverse: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { fontSize: 11 } }
      ),
      series: [
        rankedBars({
          name: 'Share',
          data: rows.map((x) => x.share_pct),
          colorFor: () => hue.a,
          extra: { label: { show: true, position: 'right', fontSize: 10, formatter: (p: { value: number }) => `${p.value}%` } }
        })
      ]
    };
  });

  // ── Plain read ──
  const zoneTone = (s: number) => (s < 0.35 ? 'good' : s < 0.55 ? 'neutral' : s < 0.75 ? 'warn' : 'danger');
  const readSignals = $derived(
    r && r.leverage_risk != null
      ? [
          { name: 'Leverage risk', label: r.label, value: `${r.leverage_percent}/100`, meaning: verdict.sub, tone: zoneTone(r.leverage_risk) },
          ...r.inputs.map((i) => ({ name: i.input, label: i.reading, tone: i.tone }))
        ]
      : []
  );
</script>

<header class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div class="flex items-center gap-2">
    <Flame class="h-5 w-5 text-warn" />
    <div>
      <h1 class="text-xl font-semibold text-strong">Derivatives · Leverage Risk</h1>
      <p class="text-sm text-muted">Funding, open interest, positioning, liquidations and order flow in BTC futures — with the history.</p>
    </div>
  </div>
  {#if r?.positioning?.as_of}
    <span class="inline-flex items-center gap-1.5 text-xs text-muted"><Database class="h-3.5 w-3.5" />Positioning to {fmtWhen(r.positioning.as_of)}</span>
  {/if}
</header>

{#if !$membershipReady || loading}
  <p class="text-sm text-muted">Reading the futures market…</p>
{:else if !canDeriv}
  <LockedFeature
    title="Derivatives / Leverage Risk is a Mid & Premium feature"
    plan="Mid"
    bullets={['A leverage-risk score from funding, open interest and top-trader positioning', 'Liquidations, taker flow and the Coinbase premium with full-history charts', 'Feeds the Overview and the Exit Strategy cycle read']}
  />
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if r}
  {#if r.leverage_risk == null}
    <div class="card mb-3 border-warn/30 bg-warn/5">
      <p class="stat-label text-warn">Derivatives data unavailable</p>
      <p class="mt-1 text-sm text-soft">{r.interpretation}</p>
    </div>
  {:else}
    <!-- Score + the inputs behind it -->
    <div class="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div class="hero-card grid items-center gap-4 sm:grid-cols-[auto_1fr] lg:grid-cols-1 xl:grid-cols-[auto_1fr]">
        <div class="mx-auto"><Gauge value={r.leverage_risk} title="Leverage Risk" /></div>
        <div class="min-w-0">
          <ReadLabel />
          <p class="mt-0.5 text-lg font-bold leading-tight {zoneText(r.leverage_risk)}">{verdict.head}</p>
          <p class="mb-2.5 mt-1 text-sm text-soft">{r.interpretation}</p>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-2xl font-bold {zoneText(r.leverage_risk)}">{r.leverage_percent}<span class="text-base text-muted">/100</span></span>
            <span class="pill {zonePill(r.leverage_risk)}">{r.label}</span>
            <span class="pill {confPill(r.confidence)}">{r.confidence} confidence</span>
          </div>
          <div class="meter mt-2 max-w-md"><div class="meter-fill {zoneBar(r.leverage_risk)}" style="width: {r.leverage_percent}%"></div></div>
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {#if change7 != null}
              <span class="font-medium {change7 > 2 ? 'text-danger' : change7 < -2 ? 'text-mint' : 'text-muted'}">{change7 > 0 ? '+' : ''}{change7} over 7 days</span>
            {/if}
            <span class="inline-flex items-center gap-1 text-muted"><Clock class="h-3.5 w-3.5" />Read {fmtWhen(r.as_of.slice(0, 16).replace('T', ' '))}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <p class="stat-label mb-2">What the score is built from</p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[340px] text-sm">
            <thead>
              <tr class="text-left text-[11px] uppercase tracking-wide text-muted">
                <th class="pb-1.5 font-medium">Input</th>
                <th class="pb-1.5 font-medium">Reading</th>
                <th class="pb-1.5 text-right font-medium">Weight</th>
                <th class="w-16 pb-1.5 pl-2 font-medium" title="How stretched this input is: empty = calm, full = crowded">Stretch</th>
              </tr>
            </thead>
            <tbody>
              {#each r.inputs as i}
                <tr class="border-t border-edge/60">
                  <td class="py-1.5 pr-2 align-top">
                    <span class="flex items-center gap-1.5 font-medium text-soft"><span class="h-1.5 w-1.5 shrink-0 rounded-full {toneBg(i.tone)}"></span>{i.input}</span>
                    {#if i.as_of}<span class="pl-3 text-[10px] text-muted">{fmtWhen(i.as_of)}</span>{/if}
                  </td>
                  <td class="py-1.5 pr-2 align-top text-xs {toneText(i.tone)}">{i.reading}</td>
                  <td class="py-1.5 text-right align-top text-xs tabular-nums text-muted">{Math.round(i.weight * 100)}%</td>
                  <td class="py-1.5 pl-2 align-top">
                    {#if i.risk != null}
                      <div class="mt-1.5 h-1.5 w-full rounded-full bg-panel-2"><div class="h-1.5 rounded-full {toneBg(i.tone)}" style="width: {Math.max(4, i.risk * 100)}%"></div></div>
                    {:else}<span class="text-xs text-muted">—</span>{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="mt-2 text-[11px] leading-relaxed text-muted">
          Funding is read on its own level; open interest and positioning against their past year (a reading at the 90th percentile is higher than 90% of the year). Liquidations, taker flow and the Coinbase premium below are context and are not scored.
        </p>
      </div>
    </div>

    <!-- Key figures -->
    {#if tiles.length}
      <div class="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {#each tiles as t}
          <div class="card p-3" title={t.title}>
            <p class="text-[11px] uppercase tracking-wide text-muted">{t.label}</p>
            <p class="mt-0.5 text-lg font-bold tabular-nums {t.valueTone ?? 'text-strong'}">{t.value}</p>
            <p class="text-xs font-medium tabular-nums {t.subTone}">{t.sub}</p>
            {#if t.spark}
              <svg viewBox="0 0 120 30" class="mt-1 h-7 w-full text-accent" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={t.spark} fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke" />
              </svg>
            {/if}
            <p class="mt-0.5 truncate text-[11px] text-muted">{t.note}</p>
            <p class="truncate text-[10px] text-muted/80">{t.when}</p>
          </div>
        {/each}
      </div>
    {/if}

    <!-- What the data says -->
    {#if notes.length}
      <div class="card mb-3">
        <ReadLabel text="What the data says" />
        <ul class="mt-2 grid gap-x-6 gap-y-2 md:grid-cols-2">
          {#each notes as n}
            <li class="flex items-start gap-2 text-sm leading-relaxed text-soft">
              <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full {toneBg(n.tone)}"></span>
              <span><span class="font-medium text-strong">{n.head}.</span> {n.text}</span>
            </li>
          {/each}
        </ul>
        <p class="mt-2 text-[11px] text-muted">Written by fixed rules from the figures on this page — not a forecast.</p>
      </div>
    {/if}
  {/if}

  <!-- Charts -->
  {#if h}
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p class="stat-label">Charts</p>
      <div class="flex rounded-lg border border-edge p-0.5 text-xs" role="group" aria-label="Chart range">
        {#each RANGES as opt}
          <button class="rounded-md px-2.5 py-1 {range === opt ? 'bg-panel-2 font-semibold text-strong' : 'text-muted hover:text-soft'}" onclick={() => (range = opt)} aria-pressed={range === opt}>{opt}</button>
        {/each}
      </div>
    </div>

    <div class="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
      {#if scoreOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Leverage risk over time</p>
          <p class="mb-1 text-xs text-muted">The same 0–100 score, day by day, against the BTC price. Shaded: light (green), elevated (amber), overheated (red).</p>
          <EChart option={scoreOption} height={300} />
        </div>
      {/if}

      {#if fundingOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Funding rate</p>
          <p class="mb-1 text-xs text-muted">Daily average per 8 hours. Above 0.03% longs are paying heavily; below zero shorts pay longs.</p>
          <EChart option={fundingOption} height={300} />
        </div>
      {/if}

      {#if oiOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Open interest</p>
          <p class="mb-1 text-xs text-muted">BTC futures open across exchanges. The BTC line strips out price moves — a rising line means more leverage, not just a higher price.</p>
          <EChart option={oiOption} height={300} />
        </div>
      {/if}

      {#if lsOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Top-trader long/short ratio</p>
          <p class="mb-1 text-xs text-muted">Accounts long per account short, daily average. Extremes in either direction have often reversed.</p>
          <EChart option={lsOption} height={300} />
        </div>
      {/if}

      {#if liqOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Liquidations</p>
          <p class="mb-1 text-xs text-muted">Futures positions force-closed each day, $ millions. Tall red bars = long squeezes; tall green bars = short squeezes. Data starts March 2026; the feed has no data from 28 Apr to 29 May 2026.</p>
          <EChart option={liqOption} height={300} />
        </div>
      {/if}

      {#if flowOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Order flow</p>
          <p class="mb-1 text-xs text-muted">Taker buy/sell ratio (line, above 1 = market buyers lead) and the Coinbase premium (bars, positive = US spot buyers paying up).</p>
          <EChart option={flowOption} height={300} />
        </div>
      {/if}

      {#if exchangeOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Open interest by exchange</p>
          <p class="mb-1 text-xs text-muted">Share of BTC futures open interest{r.open_interest ? `, ${fmtWhen(r.open_interest.as_of)}` : ''}.</p>
          <EChart option={exchangeOption} height={300} minWidth={0} />
        </div>
      {/if}
    </div>
  {:else}
    <div class="card mb-3 border-warn/30 bg-warn/5 text-sm text-soft">The history charts are unavailable right now.</div>
  {/if}

  {#if r.leverage_risk != null}
    <div class="mb-3"><PlainRead signals={readSignals} /></div>
  {/if}

  <!-- Method + sources -->
  <div class="card mb-3">
    <p class="stat-label">How the score works</p>
    <ul class="mt-1.5 space-y-1 text-sm text-muted">
      <li>• <span class="text-soft">Funding (35%)</span> — the 24-hour average rate. Around zero is calm; +0.1% per 8h or more reads fully stretched; negative reads as fear.</li>
      <li>• <span class="text-soft">Open interest (35%)</span> — measured in BTC and ranked against the past 365 days.</li>
      <li>• <span class="text-soft">Top-trader positioning (30%)</span> — the long/short account ratio (24h average), ranked against the past 365 days.</li>
      <li>• Bands: under 35 light, 35–55 normal, 55–75 elevated, 75+ overheated. If an input is missing, the others are reweighted.</li>
    </ul>
    <p class="mt-2 text-[12px] text-muted/80">A positioning gauge, not a price prediction. It works best alongside BTC risk, on-chain and social signals.</p>
  </div>

  <div class="flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
    <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>
      Source: BGeometrics (bitcoin-data.com) — funding every 8 hours, positioning and taker flow hourly, open interest, liquidations and the Coinbase premium daily (open interest runs about two days behind). The
      Overview and Exit Strategy use the stored daily read, so their numbers can differ slightly from this page. Not financial advice; always do your own research.
    </span>
  </div>
{/if}
