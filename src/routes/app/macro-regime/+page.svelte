<script lang="ts">
  import { Globe, Info, TrendingUp, TrendingDown, Minus, Clock, Database } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import Gauge from '$lib/components/Gauge.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import PlainRead from '$lib/components/PlainRead.svelte';
  import ReadLabel from '$lib/components/ReadLabel.svelte';
  import EChart from '$lib/components/EChart.svelte';
  import { grid, valueAxis, logAxis, timeAxis, axisTooltip, lineSeries, zoomInside, categorical } from '$lib/charts/presets';

  const canUse = $derived(hasFeature($membership, 'access_macro_regime'));

  // ── Data ──
  type Pt = [string, number];
  interface Component {
    input: string;
    read: string;
    driver: string;
    tone: 'good' | 'warn' | 'neutral';
    weight?: number;
    contribution?: number;
    source?: string;
  }
  interface Market {
    as_of: string | null;
    kpis: {
      dxy: { date: string; value: number; chg_1m_pct: number | null; chg_3m_pct: number | null; ma200: number | null; above_200d: boolean | null } | null;
      m2: { date: string; m2_usd: number; yoy_pct: number; chg_13w_pct: number | null; annualised_13w_pct: number | null; yoy_percentile: number; yoy_median_10y: number | null } | null;
      stablecoins: { date: string; total_usd: number; usdt_usd: number; usdc_usd: number; chg_30d_pct: number | null; chg_90d_pct: number | null; chg_30d_percentile: number | null } | null;
      gold: { date: string; price: number; chg_1m_pct: number | null; btc_gold_ratio: number | null } | null;
      btc: { date: string; price: number; chg_1m_pct: number | null } | null;
      correlations: { date: string; sp500_30d: number | null; sp500_90d: number | null; dxy_30d: number | null; dxy_90d: number | null; gold_30d: number | null; gold_90d: number | null } | null;
    };
    series: {
      btc: Pt[];
      m2: [string, number, number | null][];
      dxy: [string, number, number | null, number | null][];
      gold: [string, number, number | null][];
      stablecoins: [string, number, number, number][];
      correlations: [string, number | null, number | null, number | null, number | null, number | null, number | null][];
    };
    sources: { provider: string; updated: string; series: string[] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r = $state<any>(null);
  let m = $state<Market | null>(null);
  let loading = $state(true);
  let error = $state('');
  let started = $state(false);

  const load = async () => {
    loading = true;
    error = '';
    try {
      const [regime, market] = await Promise.all([
        api('/macro-regime', { auth: true }),
        api<Market>('/macro-regime/market', { auth: true }).catch(() => null)
      ]);
      r = regime;
      m = market;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load the macro regime.';
    } finally {
      loading = false;
    }
  };
  $effect(() => {
    if (!$membershipReady || started) return;
    started = true;
    if (!canUse) {
      loading = false;
      return;
    }
    void load();
  });

  // ── Formatting ──
  const ts = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
  const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
  const usdCompact = (v: number) => '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const usdTn = (v: number) => `$${(v / 1e12).toFixed(1)}T`;
  const usdBn = (v: number) => `$${(v / 1e9).toFixed(0)}B`;
  const corr = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);
  const fmtDay = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const signTone = (v: number | null | undefined, goodWhenUp = true) =>
    v == null || Math.abs(v) < 0.05 ? 'text-muted' : (v > 0) === goodWhenUp ? 'text-mint' : 'text-danger';

  // ── Regime (stored daily) ──
  const scoreTone = (s: number) => (s >= 60 ? 'text-mint' : s >= 40 ? 'text-accent' : 'text-danger');
  const scoreBar = (s: number) => (s >= 60 ? 'bg-mint' : s >= 40 ? 'bg-accent' : 'bg-danger');
  const pill = (s: number) => (s >= 60 ? 'bg-mint/15 text-mint' : s >= 40 ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger');
  const confPill = (c: string) => (c === 'High' ? 'bg-mint/15 text-mint' : c === 'Low' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const toneText = (t: string) => (t === 'good' ? 'text-mint' : t === 'warn' ? 'text-danger' : 'text-soft');
  const toneBg = (t: string) => (t === 'good' ? 'bg-mint' : t === 'warn' ? 'bg-danger' : 'bg-muted');
  const trendTone = (ch: number) => (ch > 2 ? 'text-mint' : ch < -2 ? 'text-danger' : 'text-muted');
  const change = $derived<number | null>(r?.score_change ?? null);
  // A stored score older than 2 days that could not be refreshed live.
  const staleDays = $derived.by(() => {
    if (!r?.available || r.live) return 0;
    const d = r.as_of ?? r.date;
    return d ? Math.floor((Date.now() - Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`)) / 86_400_000) : 0;
  });

  const verdict = $derived.by(() => {
    const s = r?.regime_score;
    if (s == null) return { head: 'Macro read unavailable', sub: 'Not enough market data to read the backdrop yet.' };
    if (s >= 60) return { head: 'The macro backdrop is supporting crypto', sub: 'Liquidity, the dollar, stocks and volatility lean risk-on — a tailwind behind crypto right now.' };
    if (s >= 40) return { head: 'The macro backdrop is mixed', sub: 'No strong tailwind or headwind — the inputs are pulling in different directions.' };
    return { head: 'The macro backdrop is a headwind for crypto', sub: 'Most inputs lean risk-off — even strong coins face resistance until this eases.' };
  });
  const bestApproach = (s: number) =>
    s >= 60
      ? 'Conditions favour crypto. You can lean more constructive, but keep take-profit levels and risk management in place.'
      : s >= 40
        ? 'Patience, selective entries and confirmation. No strong tailwind — don’t force trades without a clear edge.'
        : 'Stay defensive. Prioritise capital preservation and smaller size until the macro headwind eases.';

  // Inputs table, strongest weight first. Rows stored before the weights were
  // added fall back to the order they were saved in.
  const inputs = $derived(((r?.components ?? []) as Component[]).slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)));
  const tally = $derived({
    good: inputs.filter((c) => c.tone === 'good').length,
    warn: inputs.filter((c) => c.tone === 'warn').length,
    neutral: inputs.filter((c) => c.tone === 'neutral').length
  });

  // ── Sparklines (last 12 months) ──
  const lastYear = <T extends [string, ...unknown[]]>(rows: T[]) => {
    if (!rows.length) return rows;
    const from = ts(rows[rows.length - 1][0]) - 365 * 86_400_000;
    return rows.filter((x) => ts(x[0]) >= from);
  };
  const spark = (vals: (number | null)[], w = 120, h = 30) => {
    const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
    if (v.length < 2) return '';
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - ((x - min) / span) * (h - 4)).toFixed(1)}`).join(' ');
  };

  const tiles = $derived.by(() => {
    if (!m) return [];
    const k = m.kpis;
    const out: { label: string; value: string; sub: string; subTone: string; note: string; spark: string; sparkTone: string; title: string }[] = [];
    if (k.m2)
      out.push({
        label: 'Global M2',
        value: usdTn(k.m2.m2_usd),
        sub: `${pct(k.m2.yoy_pct)} y/y`,
        subTone: signTone(k.m2.yoy_pct),
        note: `10-yr median ${k.m2.yoy_median_10y == null ? '—' : `${k.m2.yoy_median_10y.toFixed(1)}%`} · 13-wk ${pct(k.m2.annualised_13w_pct)} ann.`,
        spark: spark(lastYear(m.series.m2).map((x) => x[1])),
        sparkTone: 'text-accent',
        title: `Global money supply in USD, week of ${fmtDay(k.m2.date)}`
      });
    if (k.dxy)
      out.push({
        label: 'US Dollar Index',
        value: k.dxy.value.toFixed(2),
        sub: `${pct(k.dxy.chg_1m_pct)} 1M · ${pct(k.dxy.chg_3m_pct)} 3M`,
        subTone: signTone(k.dxy.chg_1m_pct, false),
        note: k.dxy.above_200d == null ? '' : `${k.dxy.above_200d ? 'Above' : 'Below'} 200-day avg (${k.dxy.ma200?.toFixed(1)})`,
        spark: spark(lastYear(m.series.dxy).map((x) => x[1])),
        sparkTone: 'text-accent',
        title: `DXY, ${fmtDay(k.dxy.date)} — a rising dollar is usually a headwind for BTC`
      });
    if (k.stablecoins)
      out.push({
        label: 'Stablecoin supply',
        value: usdBn(k.stablecoins.total_usd),
        sub: `${pct(k.stablecoins.chg_30d_pct)} 30D · ${pct(k.stablecoins.chg_90d_pct)} 90D`,
        subTone: signTone(k.stablecoins.chg_30d_pct),
        note: `USDT ${usdBn(k.stablecoins.usdt_usd)} · USDC ${usdBn(k.stablecoins.usdc_usd)}`,
        spark: spark(lastYear(m.series.stablecoins).map((x) => x[1] + x[2] + x[3])),
        sparkTone: 'text-accent',
        title: `USDT, USDC, DAI and smaller stablecoins tracked by BGeometrics, ${fmtDay(k.stablecoins.date)}`
      });
    if (k.gold)
      out.push({
        label: 'Gold',
        value: `$${Math.round(k.gold.price).toLocaleString()}`,
        sub: `${pct(k.gold.chg_1m_pct)} 1M`,
        subTone: signTone(k.gold.chg_1m_pct),
        note: k.gold.btc_gold_ratio == null ? '' : `1 BTC = ${k.gold.btc_gold_ratio.toFixed(1)} oz`,
        spark: spark(lastYear(m.series.gold).map((x) => x[1])),
        sparkTone: 'text-accent',
        title: `Spot gold, USD per ounce, ${fmtDay(k.gold.date)}`
      });
    if (k.correlations) {
      out.push({
        label: 'BTC ↔ S&P 500',
        value: corr(k.correlations.sp500_30d),
        sub: `90D ${corr(k.correlations.sp500_90d)}`,
        subTone: 'text-muted',
        note: corrWords(k.correlations.sp500_30d, 'stocks'),
        spark: spark(lastYear(m.series.correlations).map((x) => x[1])),
        sparkTone: 'text-accent',
        title: '30-day rolling correlation of daily returns (−1 to +1)'
      });
      out.push({
        label: 'BTC ↔ Dollar',
        value: corr(k.correlations.dxy_30d),
        sub: `90D ${corr(k.correlations.dxy_90d)}`,
        subTone: 'text-muted',
        note: corrWords(k.correlations.dxy_30d, 'the dollar'),
        spark: spark(lastYear(m.series.correlations).map((x) => x[3])),
        sparkTone: 'text-accent',
        title: '30-day rolling correlation of daily returns (−1 to +1)'
      });
    }
    return out;
  });

  function corrWords(c: number | null, what: string) {
    if (c == null) return '';
    const a = Math.abs(c);
    if (a < 0.2) return `Moving independently of ${what}`;
    const strength = a >= 0.5 ? 'closely' : 'loosely';
    return c > 0 ? `Moving ${strength} with ${what}` : `Moving ${strength} against ${what}`;
  }

  // ── "What the data says" — fixed rules over the numbers above ──
  const notes = $derived.by(() => {
    if (!m) return [];
    const k = m.kpis;
    const out: { tone: 'good' | 'warn' | 'neutral'; head: string; text: string }[] = [];
    if (k.m2) {
      const accel = k.m2.annualised_13w_pct == null ? 0 : k.m2.annualised_13w_pct - k.m2.yoy_pct;
      const above = k.m2.yoy_median_10y != null && k.m2.yoy_pct > k.m2.yoy_median_10y;
      out.push({
        tone: k.m2.yoy_pct < 0 ? 'warn' : accel < -1 ? 'neutral' : above ? 'good' : 'neutral',
        head: 'Liquidity',
        text:
          `Global M2 is ${k.m2.yoy_pct >= 0 ? 'up' : 'down'} ${Math.abs(k.m2.yoy_pct).toFixed(1)}% on the year` +
          (k.m2.yoy_median_10y != null ? ` (10-year median ${k.m2.yoy_median_10y.toFixed(1)}%)` : '') +
          (k.m2.annualised_13w_pct != null
            ? `, and the last 13 weeks annualise to ${k.m2.annualised_13w_pct.toFixed(1)}% — ${accel > 1 ? 'growth is speeding up' : accel < -1 ? 'growth is slowing' : 'a steady pace'}.`
            : '.')
      });
    }
    if (k.dxy) {
      const up = (k.dxy.chg_3m_pct ?? 0) > 1;
      const down = (k.dxy.chg_3m_pct ?? 0) < -1;
      out.push({
        tone: k.dxy.above_200d && up ? 'warn' : !k.dxy.above_200d && down ? 'good' : 'neutral',
        head: 'Dollar',
        text: `DXY is ${k.dxy.value.toFixed(1)}, ${k.dxy.above_200d ? 'above' : 'below'} its 200-day average (${k.dxy.ma200?.toFixed(1)}) and ${pct(k.dxy.chg_3m_pct)} over 3 months. ${up ? 'A firming dollar has usually been a headwind for Bitcoin.' : down ? 'A weakening dollar has usually been a tailwind for Bitcoin.' : 'The dollar is not trending strongly either way.'}`
      });
    }
    if (k.stablecoins && k.stablecoins.chg_30d_pct != null) {
      const c = k.stablecoins.chg_30d_pct;
      const p = k.stablecoins.chg_30d_percentile;
      const rank = p == null ? '' : p <= 0.02 ? ' — the weakest 30-day change in three years' : p >= 0.98 ? ' — the strongest 30-day change in three years' : '';
      out.push({
        tone: c > 0.5 ? 'good' : c < -0.5 ? 'warn' : 'neutral',
        head: 'Stablecoins',
        text: `Stablecoin supply ${c >= 0 ? 'grew' : 'shrank'} ${Math.abs(c).toFixed(1)}% in 30 days to ${usdBn(k.stablecoins.total_usd)}${rank}. ${c > 0.5 ? 'New dollars on-chain are buying power waiting to be used.' : c < -0.5 ? 'Dollars are leaving crypto rails — less buying power on the sidelines.' : 'On-chain dollar supply is flat.'}`
      });
    }
    if (k.correlations && k.correlations.sp500_30d != null) {
      const c = k.correlations.sp500_30d;
      out.push({
        tone: 'neutral',
        head: 'Correlation',
        text: `Bitcoin's 30-day correlation with the S&P 500 is ${corr(c)} (90-day ${corr(k.correlations.sp500_90d)}). ${c >= 0.5 ? 'It is trading as a risk asset — stock-market moves are likely to carry over.' : c <= 0.2 ? 'It is moving largely on its own drivers right now.' : 'Stock-market moves carry over only partly.'}`
      });
    }
    if (k.gold && k.gold.btc_gold_ratio != null) {
      out.push({
        tone: 'neutral',
        head: 'Gold',
        text: `${k.gold.chg_1m_pct == null ? 'Gold is' : `Gold ${k.gold.chg_1m_pct >= 0 ? 'rose' : 'fell'} ${Math.abs(k.gold.chg_1m_pct).toFixed(1)}% over a month to`} $${Math.round(k.gold.price).toLocaleString()}/oz; one bitcoin buys ${k.gold.btc_gold_ratio.toFixed(1)} oz.`
      });
    }
    return out;
  });

  // ── Charts ──
  type Range = '1Y' | '3Y' | '5Y' | 'All';
  const RANGES: Range[] = ['1Y', '3Y', '5Y', 'All'];
  const WINDOWS: ('30' | '90')[] = ['30', '90'];
  let range = $state<Range>('3Y');
  let lead = $state(0); // weeks M2 is shifted forward
  let corrWin = $state<'30' | '90'>('90');
  const fromTs = $derived(range === 'All' ? 0 : Date.now() - { '1Y': 1, '3Y': 3, '5Y': 5 }[range] * 365 * 86_400_000);
  const inRange = <T extends [string, ...unknown[]]>(rows: T[], shiftDays = 0) => rows.filter((x) => ts(x[0]) + shiftDays * 86_400_000 >= fromTs);

  const hue = $derived({ btc: $categorical[0], a: $categorical[1], b: $categorical[2], c: $categorical[3], d: $categorical[4], e: $categorical[5] });
  const chartGrid = () => grid({ left: 54, right: 54, top: 30, bottom: 28, containLabel: false });
  const dateTip = (extra = {}) => axisTooltip({ textStyle: { fontSize: 11 }, ...extra });
  const btcLine = (yAxisIndex = 0) =>
    m ? lineSeries({ name: 'BTC', data: inRange(m.series.btc).map(([d, v]) => [ts(d), v]), color: hue.btc, width: 1.2, extra: { yAxisIndex } }) : null;

  const liquidityOption = $derived.by(() => {
    if (!m?.series.m2.length) return null;
    const shift = lead * 7 * 86_400_000;
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['BTC', lead ? `Global M2 (+${lead} wk)` : 'Global M2'] },
      tooltip: dateTip(),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: [
        logAxis({ position: 'left', scale: true, name: 'BTC', axisLabel: { formatter: usdCompact } }),
        valueAxis({ position: 'right', scale: true, name: '$T', splitLine: { show: false }, axisLabel: { formatter: (v: number) => `${v}T` } })
      ],
      dataZoom: [zoomInside()],
      series: [
        btcLine(0),
        lineSeries({
          name: lead ? `Global M2 (+${lead} wk)` : 'Global M2',
          data: inRange(m.series.m2, lead * 7).map(([d, v]) => [ts(d) + shift, v]),
          color: hue.a,
          width: 2,
          area: 0.06,
          extra: { yAxisIndex: 1 }
        })
      ]
    };
  });

  const m2GrowthOption = $derived.by(() => {
    if (!m?.series.m2.length) return null;
    const rows = inRange(m.series.m2).filter((x) => x[2] != null) as [string, number, number][];
    const med = m.kpis.m2?.yoy_median_10y;
    return {
      grid: chartGrid(),
      tooltip: dateTip({ valueFormatter: (v: number) => `${v.toFixed(2)}%` }),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: valueAxis({ scale: true, axisLabel: { formatter: (v: number) => `${v}%` } }),
      dataZoom: [zoomInside()],
      series: [
        {
          name: 'M2 y/y',
          type: 'bar',
          barMaxWidth: 6,
          data: rows.map(([d, , y]) => ({ value: [ts(d), y], itemStyle: { color: y >= 0 ? hue.b : hue.c, opacity: 0.85 } })),
          markLine:
            med == null
              ? undefined
              : { silent: true, symbol: 'none', lineStyle: { type: 'dashed', opacity: 0.6 }, data: [{ yAxis: med }], label: { formatter: `10-yr median ${med.toFixed(1)}%`, fontSize: 9, position: 'insideEndTop', color: 'inherit', textBorderWidth: 0 } }
        }
      ]
    };
  });

  const dxyOption = $derived.by(() => {
    if (!m?.series.dxy.length) return null;
    const rows = inRange(m.series.dxy);
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['DXY', '50-day', '200-day'] },
      tooltip: dateTip({ valueFormatter: (v: number) => (v == null ? '—' : v.toFixed(2)) }),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: valueAxis({ scale: true }),
      dataZoom: [zoomInside()],
      series: [
        lineSeries({ name: 'DXY', data: rows.map(([d, v]) => [ts(d), v]), color: hue.a, width: 1.8 }),
        lineSeries({ name: '50-day', data: rows.filter((x) => x[2] != null).map(([d, , a]) => [ts(d), a]), color: hue.d, width: 1, dashed: true }),
        lineSeries({ name: '200-day', data: rows.filter((x) => x[3] != null).map(([d, , , b]) => [ts(d), b]), color: hue.c, width: 1.2, dashed: true })
      ]
    };
  });

  const stablesOption = $derived.by(() => {
    if (!m?.series.stablecoins.length) return null;
    const rows = inRange(m.series.stablecoins);
    const stack = (name: string, i: 1 | 2 | 3, color: string) =>
      lineSeries({ name, data: rows.map((x) => [ts(x[0]), x[i]]), color, width: 1, area: 0.35, extra: { stack: 'supply' } });
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['USDT', 'USDC', 'Other'] },
      tooltip: dateTip({ valueFormatter: (v: number) => `$${v.toFixed(1)}B` }),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: valueAxis({ name: '$B', axisLabel: { formatter: (v: number) => `${v}` } }),
      dataZoom: [zoomInside()],
      series: [stack('USDT', 1, hue.b), stack('USDC', 2, hue.a), stack('Other', 3, hue.d)]
    };
  });

  const corrOption = $derived.by(() => {
    if (!m?.series.correlations.length) return null;
    const rows = inRange(m.series.correlations);
    const idx = corrWin === '30' ? [1, 3, 5] : [2, 4, 6];
    const line = (name: string, i: number, color: string) =>
      lineSeries({ name, data: rows.filter((x) => x[i] != null).map((x) => [ts(x[0]), x[i]]), color, width: 1.4 });
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['S&P 500', 'US Dollar', 'Gold'] },
      tooltip: dateTip({ valueFormatter: (v: number) => (v == null ? '—' : v.toFixed(2)) }),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: valueAxis({ min: -1, max: 1, interval: 0.5 }),
      dataZoom: [zoomInside()],
      series: [
        {
          ...line('S&P 500', idx[0], hue.b),
          markLine: { silent: true, symbol: 'none', lineStyle: { opacity: 0.4 }, data: [{ yAxis: 0 }], label: { show: false } }
        },
        line('US Dollar', idx[1], hue.a),
        line('Gold', idx[2], hue.btc)
      ]
    };
  });

  const goldOption = $derived.by(() => {
    if (!m?.series.gold.length) return null;
    const rows = inRange(m.series.gold);
    return {
      grid: chartGrid(),
      legend: { top: 0, data: ['BTC in gold (oz)', 'Gold $/oz'] },
      tooltip: dateTip(),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: [
        logAxis({ position: 'left', scale: true, name: 'oz' }),
        valueAxis({ position: 'right', scale: true, name: '$/oz', splitLine: { show: false }, axisLabel: { formatter: usdCompact } })
      ],
      dataZoom: [zoomInside()],
      series: [
        lineSeries({ name: 'BTC in gold (oz)', data: rows.filter((x) => x[2] != null).map((x) => [ts(x[0]), x[2]]), color: hue.btc, width: 1.6 }),
        lineSeries({ name: 'Gold $/oz', data: rows.map((x) => [ts(x[0]), x[1]]), color: hue.d, width: 1.1, extra: { yAxisIndex: 1 } })
      ]
    };
  });

  // ── Plain read ──
  const regimeTone = (s: number) => (s >= 60 ? 'good' : s >= 40 ? 'neutral' : 'danger');
  const readSignals = $derived(
    r && r.available
      ? [
          { name: 'Macro regime', label: r.regime_label, value: `${r.regime_score}/100`, meaning: verdict.sub, tone: regimeTone(r.regime_score) },
          ...inputs.map((c) => ({ name: c.input, label: c.read, tone: c.tone === 'warn' ? 'warn' : c.tone }))
        ]
      : []
  );
</script>

<header class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div class="flex items-center gap-2">
    <Globe class="h-5 w-5 text-accent" />
    <div>
      <h1 class="text-xl font-semibold text-strong">Macro Regime</h1>
      <p class="text-sm text-muted">Liquidity, the dollar, stocks, volatility and gold — the backdrop behind crypto, with the data.</p>
    </div>
  </div>
  {#if m?.as_of}
    <span class="inline-flex items-center gap-1.5 text-xs text-muted"><Database class="h-3.5 w-3.5" />Data to {fmtDay(m.as_of)}</span>
  {/if}
</header>

{#if !$membershipReady || loading}
  <p class="text-sm text-muted">Reading the macro backdrop…</p>
{:else if !canUse}
  <LockedFeature
    title="Macro Regime is a Mid & Premium feature"
    plan="Mid"
    bullets={['A risk-on / risk-off read from liquidity, the dollar, equities, volatility and gold', 'Global M2, stablecoin supply and BTC correlations with charts', 'Feeds the Overview command center']}
  />
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else}
  <!-- Regime: score + the inputs behind it -->
  {#if r?.available}
    <div class="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div class="hero-card grid items-center gap-4 sm:grid-cols-[auto_1fr] lg:grid-cols-1 xl:grid-cols-[auto_1fr]">
        <div class="mx-auto"><Gauge value={r.regime_score / 100} title="Risk Appetite" /></div>
        <div class="min-w-0">
          <ReadLabel />
          <p class="mt-0.5 text-lg font-bold leading-tight {scoreTone(r.regime_score)}">{verdict.head}</p>
          <p class="mb-2.5 mt-1 text-sm text-soft">{verdict.sub}</p>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-2xl font-bold {scoreTone(r.regime_score)}">{r.regime_score}<span class="text-base text-muted">/100</span></span>
            <span class="pill {pill(r.regime_score)}">{r.regime_label}</span>
            <span class="pill {confPill(r.confidence)}">{r.confidence} confidence</span>
          </div>
          <div class="meter mt-2 max-w-md"><div class="meter-fill {scoreBar(r.regime_score)}" style="width: {r.regime_score}%"></div></div>
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {#if change !== null}
              <span class="inline-flex items-center gap-1 font-medium {trendTone(change)}">
                {#if change > 2}<TrendingUp class="h-3.5 w-3.5" />{:else if change < -2}<TrendingDown class="h-3.5 w-3.5" />{:else}<Minus class="h-3.5 w-3.5" />{/if}
                {change > 0 ? '+' : ''}{change} {r.previous_date ? `since ${fmtDay(r.previous_date)}` : 'vs last reading'}
              </span>
            {/if}
            {#if fmtDateTime(r.updated_at || r.as_of)}
              <span class="inline-flex items-center gap-1 text-muted"><Clock class="h-3.5 w-3.5" />Scored {fmtDateTime(r.updated_at || r.as_of)}</span>
            {/if}
          </div>
          {#if staleDays > 2}
            <p class="mt-2 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-xs text-warn">This score is {staleDays} days old — the macro data has not refreshed since {fmtDay(r.as_of ?? r.date)}.</p>
          {/if}
        </div>
      </div>

      <div class="card">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p class="stat-label">What the score is built from</p>
          <div class="flex items-center gap-3 text-xs font-medium">
            <span class="inline-flex items-center gap-1 text-mint"><span class="h-1.5 w-1.5 rounded-full bg-mint"></span>{tally.good} supportive</span>
            <span class="inline-flex items-center gap-1 text-danger"><span class="h-1.5 w-1.5 rounded-full bg-danger"></span>{tally.warn} headwind</span>
            <span class="inline-flex items-center gap-1 text-muted"><span class="h-1.5 w-1.5 rounded-full bg-muted"></span>{tally.neutral} neutral</span>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[400px] text-sm">
            <thead>
              <tr class="text-left text-[11px] uppercase tracking-wide text-muted">
                <th class="pb-1.5 font-medium">Input</th>
                <th class="pb-1.5 font-medium">Reading</th>
                <th class="pb-1.5 text-right font-medium">Weight</th>
                <th class="w-20 pb-1.5 pl-3 font-medium" title="How risk-on this input reads: empty = risk-off, full = risk-on">Risk-on</th>
              </tr>
            </thead>
            <tbody>
              {#each inputs as c}
                <tr class="border-t border-edge/60">
                  <td class="py-1.5 pr-2 align-top">
                    <span class="flex items-center gap-1.5 font-medium text-soft"><span class="h-1.5 w-1.5 shrink-0 rounded-full {toneBg(c.tone)}"></span>{c.input}</span>
                    {#if c.source}<span class="pl-3 text-[10px] text-muted">{c.source}</span>{/if}
                  </td>
                  <td class="py-1.5 pr-2 align-top text-xs {toneText(c.tone)}">{c.read}</td>
                  <td class="py-1.5 text-right align-top text-xs tabular-nums text-muted">{c.weight != null ? `${Math.round(c.weight * 100)}%` : '—'}</td>
                  <td class="py-1.5 pl-3 align-top">
                    {#if c.contribution != null}
                      <div class="mt-1.5 h-1.5 w-full rounded-full bg-panel-2"><div class="h-1.5 rounded-full {toneBg(c.tone)}" style="width: {Math.max(4, c.contribution * 100)}%"></div></div>
                    {:else}<span class="text-xs text-muted">—</span>{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="mt-2 flex items-start gap-2 rounded-lg bg-panel-2 px-3 py-2 text-xs text-soft">
          <span><span class="font-medium text-strong">Approach:</span> {bestApproach(r.regime_score)}</span>
        </p>
      </div>
    </div>
  {:else if r}
    <div class="card mb-3 border-warn/30 bg-warn/5"><p class="stat-label text-warn">Macro score not available yet</p><p class="mt-1 text-sm text-soft">{r.interpretation}</p></div>
  {/if}

  {#if m && tiles.length}
    <!-- Key figures -->
    <div class="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {#each tiles as t}
        <div class="card p-3" title={t.title}>
          <p class="text-[11px] uppercase tracking-wide text-muted">{t.label}</p>
          <p class="mt-0.5 text-lg font-bold tabular-nums text-strong">{t.value}</p>
          <p class="text-xs font-medium tabular-nums {t.subTone}">{t.sub}</p>
          {#if t.spark}
            <svg viewBox="0 0 120 30" class="mt-1 h-7 w-full {t.sparkTone}" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={t.spark} fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke" />
            </svg>
          {/if}
          <p class="mt-0.5 truncate text-[11px] text-muted">{t.note}</p>
        </div>
      {/each}
    </div>

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

    <!-- Charts -->
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p class="stat-label">Charts</p>
      <div class="flex rounded-lg border border-edge p-0.5 text-xs" role="group" aria-label="Chart range">
        {#each RANGES as opt}
          <button class="rounded-md px-2.5 py-1 {range === opt ? 'bg-panel-2 font-semibold text-strong' : 'text-muted hover:text-soft'}" onclick={() => (range = opt)} aria-pressed={range === opt}>{opt}</button>
        {/each}
      </div>
    </div>

    <div class="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
      {#if liquidityOption}
        <div class="card">
          <div class="mb-1 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-strong">Global liquidity vs Bitcoin</p>
              <p class="text-xs text-muted">Global M2 money supply (USD) against the BTC price, log scale.</p>
            </div>
            <label class="flex items-center gap-1.5 text-xs text-muted">
              Shift M2
              <select class="rounded-md border border-edge bg-panel px-1.5 py-0.5 text-xs text-soft" bind:value={lead}>
                <option value={0}>none</option>
                <option value={4}>+4 wk</option>
                <option value={8}>+8 wk</option>
                <option value={12}>+12 wk</option>
              </select>
            </label>
          </div>
          <EChart option={liquidityOption} height={300} />
          <p class="mt-1 text-[11px] text-muted">Some analysts shift M2 forward to look for a lead over BTC. The shift only moves the line — it is not a forecast.</p>
        </div>
      {/if}

      {#if m2GrowthOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Global M2 growth, year on year</p>
          <p class="mb-1 text-xs text-muted">Faster money-supply growth has tended to coincide with stronger crypto markets; contractions with weaker ones.</p>
          <EChart option={m2GrowthOption} height={300} />
        </div>
      {/if}

      {#if dxyOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">US Dollar Index (DXY)</p>
          <p class="mb-1 text-xs text-muted">With its 50- and 200-day averages. A dollar trending above its 200-day average is usually a headwind for BTC.</p>
          <EChart option={dxyOption} height={300} />
        </div>
      {/if}

      {#if stablesOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Stablecoin supply</p>
          <p class="mb-1 text-xs text-muted">Dollars on crypto rails ($ billions) — growing supply is buying power waiting on the sidelines.</p>
          <EChart option={stablesOption} height={300} />
        </div>
      {/if}

      {#if corrOption}
        <div class="card">
          <div class="mb-1 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-strong">Bitcoin's correlation with markets</p>
              <p class="text-xs text-muted">Rolling correlation of daily returns: +1 moves together, −1 opposite, 0 unrelated.</p>
            </div>
            <div class="flex rounded-lg border border-edge p-0.5 text-xs" role="group" aria-label="Correlation window">
              {#each WINDOWS as w}
                <button class="rounded-md px-2 py-0.5 {corrWin === w ? 'bg-panel-2 font-semibold text-strong' : 'text-muted hover:text-soft'}" onclick={() => (corrWin = w)} aria-pressed={corrWin === w}>{w}D</button>
              {/each}
            </div>
          </div>
          <EChart option={corrOption} height={300} />
        </div>
      {/if}

      {#if goldOption}
        <div class="card">
          <p class="text-sm font-semibold text-strong">Bitcoin priced in gold</p>
          <p class="mb-1 text-xs text-muted">How many ounces of gold one bitcoin buys, with the gold price for context.</p>
          <EChart option={goldOption} height={300} />
        </div>
      {/if}
    </div>
  {:else if !m}
    <div class="card mb-3 border-warn/30 bg-warn/5 text-sm text-soft">Macro market data (liquidity, dollar, stablecoins, correlations) is unavailable right now — the score above still uses the last stored read.</div>
  {/if}

  {#if r?.available}
    <div class="mb-3"><PlainRead signals={readSignals} /></div>
  {/if}

  <!-- Method + sources -->
  <div class="card mb-3">
    <p class="stat-label">How the score works</p>
    <ul class="mt-1.5 space-y-1 text-sm text-muted">
      <li>• Each input is read as risk-on (1) or risk-off (0) from its trend: <span class="text-soft">stocks up, the dollar and volatility down, M2 and stablecoin supply growing</span> all lean risk-on.</li>
      <li>• Global M2 is scored on its year-on-year growth against the last 10 years, tilted by the last 13 weeks; stablecoins on their 30-day change against the last 3 years.</li>
      <li>• The score is the weighted average (0–100). If an input is missing, the others are reweighted.</li>
    </ul>
    <p class="mt-2 text-[12px] text-muted/80">Macro context, not a price prediction. It works best alongside BTC risk, on-chain and social signals.</p>
  </div>

  <div class="flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
    <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>
      Sources: global M2, US Dollar Index, gold, stablecoin supply and BTC correlations — BGeometrics (bitcoin-data.com), updated daily. The S&amp;P 500 and volatility trends are derived
      internally from Twelve Data; those raw quotes are not shown. BTC price — Pastatrade daily closes. Not financial advice; always do your own research.
    </span>
  </div>
{/if}
