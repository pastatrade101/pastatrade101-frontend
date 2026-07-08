<script lang="ts">
  import { Star } from '@lucide/svelte';
  import { api } from '$lib/api';
  import EChart from '$lib/components/EChart.svelte';
  import ScoreBar from '$lib/components/ScoreBar.svelte';
  import MultiAltCompare from '$lib/components/MultiAltCompare.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import { changeColor, fmtPct, signalColor } from '$lib/format';

  interface Pt {
    date: string;
    alt_usd: number;
    btc_usd: number;
    ratio: number;
    ma20: number | null;
    ma50: number | null;
    ma100: number | null;
    ma200: number | null;
  }
  interface Analysis {
    trend_state: string;
    premium_signal: string;
    verdict_label: string;
    verdict_summary: string;
    premium_note: string;
    what_this_means: string;
    confirmation_needed: string[];
    failure_warning: string[];
    reaction_breakdown: { label: string; state: string }[];
  }
  interface RatioResp {
    coin: { id: string | null; coingecko_id: string; symbol: string; name: string; image_url: string | null };
    points: Pt[];
    latest_ratio: number;
    strength_7d: number | null;
    strength_30d: number | null;
    strength_90d: number | null;
    signal: string;
    ma_signal: string;
    reaction_score: number;
    reaction_label: string;
    breakout_type: 'breakout' | 'weakness' | 'neutral';
    breakout_label: string;
    analysis: Analysis;
  }
  interface SignalItem {
    coin: { symbol: string; name: string } | null;
    signal_type: 'breakout' | 'weakness' | 'neutral';
    signal_label: string;
    strength_score: number | null;
    confidence: string;
    quality: string;
    reasons: string[];
    metrics: { strength_30d: number | null; strength_90d: number | null };
  }
  interface Breadth {
    count: number;
    outperform_7d: number;
    outperform_30d: number;
    outperform_90d: number;
    pct_outperform_30d: number;
    pct_above_50: number;
    pct_above_200: number;
    leaders: number;
    weak: number;
  }
  interface Top3Item {
    symbol: string;
    signal_label: string;
    strength_90d: number | null;
    confidence: string;
  }
  interface SignalsResp {
    items: SignalItem[];
    breadth: Breadth | null;
    top3: { strongest: Top3Item[]; weakest: Top3Item[] } | null;
    as_of: string | null;
    scope: string;
  }
  interface CoinOpt {
    coingecko_id: string;
    symbol: string;
    name: string;
  }
  interface MarketPoint {
    date: string;
    total2_ratio: number;
    total3_ratio: number;
    dominance_proxy: number;
  }
  interface MarketResp {
    proxy: string;
    series: MarketPoint[];
    current_btc_dominance: number | null;
    current_eth_dominance: number | null;
    percent_outperforming_30d: number | null;
  }

  const TF: Record<string, number> = { '7D': 7, '30D': 30, '90D': 90, '180D': 180, '1Y': 365 };
  const OSC_PERIODS = [7, 14, 30, 60, 90];

  let view = $state<'single' | 'compare'>('single');
  let coins = $state<CoinOpt[]>([]);
  let coinId = $state('solana');
  let timeframe = $state<keyof typeof TF | string>('1Y');
  let mode = $state<'ratio' | 'normalized'>('ratio');
  let logScale = $state(true);
  let showMa = $state(true);
  let oscPeriod = $state(30);

  let data = $state<RatioResp | null>(null);
  let error = $state('');
  let loading = $state(true);

  // Market-level (TOTAL2/TOTAL3 majors-basket proxy)
  let marketData = $state<MarketResp | null>(null);
  let marketBasis = $state<'total3' | 'total2'>('total3');
  let marketPeriod = $state(30);

  // Market-wide breakout/weakness signals (synced)
  let signalsResp = $state<SignalsResp | null>(null);
  let signalScope = $state<'premium' | 'all'>('premium');

  const breakoutColor = (type: string) =>
    type === 'breakout' ? 'bg-mint/15 text-mint' : type === 'weakness' ? 'bg-danger/15 text-danger' : 'bg-edge text-muted';
  const confidenceColor = (c: string) =>
    c.startsWith('High') ? 'bg-mint/15 text-mint' : c.startsWith('Medium') ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger';
  const qualityColor = (q: string) =>
    q === 'Clean signal' ? 'bg-mint/15 text-mint' : ['Mixed signal', 'Needs confirmation'].includes(q) ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger';

  // Altcoin vs BTC Lab is Mid+; the multi-coin Compare view is a Premium advanced filter.
  const allowed = $derived($membershipReady ? hasFeature($membership, 'access_altcoin_btc_lab') : null);
  const canAdvanced = $derived(hasFeature($membership, 'access_advanced_filters'));

  const loadSignals = async () => {
    try {
      signalsResp = await api<SignalsResp>(`/altcoin-btc/signals?scope=${signalScope}`, { auth: true });
    } catch {
      /* signals are optional until synced */
    }
  };

  // Premium signal / verdict / score-state → pill colors.
  const premiumColor = (label: string): string => {
    if (['Strong leader', 'Confirmed strength', 'Market leader'].includes(label)) return 'bg-mint/15 text-mint';
    if (['Early recovery'].includes(label)) return 'bg-accent/15 text-accent';
    if (['Overextended', 'Watch only', 'Neutral'].includes(label)) return 'bg-warn/15 text-warn';
    return 'bg-danger/15 text-danger'; // Weakening / Bleeding against BTC / Avoid
  };
  const stateColor = (s: string): string =>
    s === 'Strong' ? 'text-mint' : s === 'Improving' ? 'text-accent' : s === 'Weak' ? 'text-danger' : 'text-muted';

  // Add to Watchlist
  let watchMsg = $state('');
  const addToWatchlist = async () => {
    if (!data?.coin.id) return;
    watchMsg = 'Adding…';
    try {
      const lists = await api<{ items: { id: string }[] }>('/watchlists', { auth: true });
      let id = lists.items[0]?.id;
      if (!id) id = (await api<{ id: string }>('/watchlists', { method: 'POST', body: { name: 'My Watchlist' }, auth: true })).id;
      await api(`/watchlists/${id}/items`, { method: 'POST', body: { item_type: 'coin', ref_id: data.coin.id }, auth: true });
      watchMsg = `${data.coin.symbol} added to watchlist ✓`;
    } catch (err) {
      watchMsg = err instanceof Error ? err.message : 'Could not add to watchlist.';
    }
  };
  const breakouts = $derived((signalsResp?.items ?? []).filter((s) => s.signal_type === 'breakout').slice(0, 10));
  const weaknesses = $derived((signalsResp?.items ?? []).filter((s) => s.signal_type === 'weakness').slice(0, 10));

  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);

  const display = $derived(data ? data.points.slice(-TF[timeframe]) : []);

  // Oscillator (ROC of the ratio over `oscPeriod`) computed over the full series, then sliced.
  const oscDisplay = $derived.by(() => {
    if (!data) return [];
    const r = data.points.map((p) => p.ratio);
    const osc = data.points.map((p, i) => {
      if (i < oscPeriod) return null;
      const past = r[i - oscPeriod];
      return past ? { date: p.date, value: ((r[i] - past) / past) * 100 } : null;
    });
    return osc.slice(-TF[timeframe]).filter((x): x is { date: string; value: number } => x !== null);
  });

  const oscSignal = $derived.by(() => {
    const v = oscDisplay.at(-1)?.value;
    if (v == null) return { v: null, label: 'Neutral' };
    const label = v > 20 ? 'Very strong vs BTC' : v > 5 ? 'Strong vs BTC' : v < -20 ? 'Very weak vs BTC' : v < -5 ? 'Weak vs BTC' : 'Neutral';
    return { v, label };
  });

  // Plain-language verdict — is this coin winning or bleeding against Bitcoin?
  const coinVerdict = (sym: string, s30: number | null, s7: number | null): { head: string; sub: string; tone: 'good' | 'warn' | 'neutral' } => {
    const s = s30 ?? s7 ?? 0;
    if (s > 5) return { head: `${sym} is winning against Bitcoin`, sub: 'It is outperforming BTC — real strength, not just a dollar move.', tone: 'good' };
    if (s < -5) return { head: `${sym} is bleeding against Bitcoin`, sub: 'It is losing value vs BTC — you may have been better off just holding Bitcoin.', tone: 'warn' };
    return { head: `${sym} is holding even with Bitcoin`, sub: 'Roughly matching BTC — no clear edge either way right now.', tone: 'neutral' };
  };
  const verdictText: Record<'good' | 'warn' | 'neutral', string> = { good: 'text-mint', warn: 'text-danger', neutral: 'text-soft' };
  const hvVerdict = $derived(data?.coin ? coinVerdict(data.coin.symbol, data.strength_30d, data.strength_7d) : null);

  const load = async () => {
    loading = true;
    error = '';
    try {
      data = await api<RatioResp>(`/altcoin-btc/ratio/${coinId}`, { auth: true });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load Alt/BTC data.';
    } finally {
      loading = false;
    }
  };

  const init = async () => {
    try {
      const res = await api<{ items: CoinOpt[] }>('/altcoin-btc/coins', { auth: true });
      coins = res.items;
      if (!coins.find((c) => c.coingecko_id === coinId)) coinId = coins[0]?.coingecko_id ?? 'solana';
    } catch {
      /* selector still works with the default */
    }
    await load();
    try {
      marketData = await api<MarketResp>('/altcoin-btc/market-oscillator', { auth: true });
    } catch {
      /* market section is optional */
    }
    await loadSignals();
  };

  let started = false;
  $effect(() => {
    if (allowed && !started) {
      started = true;
      init();
    }
  });

  const setScope = (s: 'premium' | 'all') => {
    if (s !== signalScope) {
      signalScope = s;
      loadSignals();
    }
  };

  // Whole-page plain-language takeaway (selected coin + regime + breadth).
  const premiumTakeaway = $derived.by(() => {
    if (!data) return '';
    const a = data.analysis;
    const parts: string[] = [];
    if (marketView) parts.push(`Market regime: ${marketView.regime.toLowerCase()}.`);
    const b = signalsResp?.breadth;
    if (b && b.count) parts.push(`${b.pct_above_200}% of the premium top-100 are above their Alt/BTC 200-day MA — ${b.pct_above_200 >= 50 ? 'broad' : 'selective'} strength, with ${b.leaders} confirmed leader${b.leaders === 1 ? '' : 's'} and ${b.weak} bleeding pair${b.weak === 1 ? '' : 's'}.`);
    parts.push(`${data.coin.symbol} reads as "${a.premium_signal}" — ${a.verdict_summary.toLowerCase()} ${a.premium_note}`);
    return parts.join(' ');
  });

  const pickCoin = (e: Event) => {
    coinId = (e.target as HTMLSelectElement).value;
    load();
  };

  // ── Main chart option ──
  const mainOption = $derived.by(() => {
    if (!data || !display.length) return {};
    const sym = data.coin.symbol;
    const line = (name: string, color: string, width: number, vals: (number | null)[]) => ({
      name,
      type: 'line',
      showSymbol: false,
      lineStyle: { width, color },
      data: display.map((p, i) => [ts(p.date), vals[i]])
    });

    let series: any[];
    let yAxis: any;

    if (mode === 'normalized') {
      const base = display[0];
      series = [
        line(`${sym} (norm)`, '#F59E0B', 2.5, display.map((p) => (p.alt_usd / base.alt_usd) * 100)),
        line('BTC (norm)', '#3B82F6', 2, display.map((p) => (p.btc_usd / base.btc_usd) * 100))
      ];
      yAxis = { type: 'value', name: 'Indexed to 100' };
    } else {
      series = [line(`${sym}/BTC`, '#F59E0B', 2.5, display.map((p) => p.ratio))];
      if (showMa) {
        series.push(line('MA50', '#3B82F6', 1, display.map((p) => p.ma50)));
        series.push(line('MA200', '#EF4444', 1, display.map((p) => p.ma200)));
      }
      yAxis = { type: logScale ? 'log' : 'value', name: `${sym}/BTC ratio` };
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 64, right: 16, top: 28, bottom: 32 },
      legend: { textStyle: { color: '#9CA3AF' }, top: 0 },
      tooltip: { trigger: 'axis', backgroundColor: '#0E1117', borderColor: '#1F2937', textStyle: { color: '#F9FAFB', fontSize: 11 } },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#1F2937' } }, splitLine: { show: false } },
      yAxis: {
        ...yAxis,
        nameTextStyle: { color: '#9CA3AF' },
        axisLabel: { color: '#9CA3AF' },
        axisLine: { lineStyle: { color: '#1F2937' } },
        splitLine: { lineStyle: { color: '#1F2937' } },
        scale: true
      },
      series
    };
  });

  // Shared zoned-oscillator option so the coin and market charts look identical.
  function buildOscOption(points: { date: string; value: number }[], yName: string) {
    if (!points.length) return {};
    const vals = points.map((p) => p.value);
    const max = Math.max(25, Math.ceil(Math.max(...vals) / 5) * 5 + 5);
    const min = Math.min(-25, Math.floor(Math.min(...vals) / 5) * 5 - 5);
    const band = (lo: number, hi: number, color: string) => [{ yAxis: lo, itemStyle: { color } }, { yAxis: hi }];
    const guide = (y: number, label: string, color: string, bold = false) => ({
      yAxis: y,
      lineStyle: { color, type: bold ? 'solid' : 'dashed', width: bold ? 1.5 : 1 },
      label: { formatter: label, color: bold ? '#E5E7EB' : '#9CA3AF', position: 'insideEndTop', fontSize: 9 }
    });

    return {
      backgroundColor: 'transparent',
      grid: { left: 48, right: 16, top: 12, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0E1117',
        borderColor: '#1F2937',
        textStyle: { color: '#F9FAFB', fontSize: 11 },
        valueFormatter: (v: number) => (typeof v === 'number' ? `${v.toFixed(1)}%` : v)
      },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#1F2937' } }, splitLine: { show: false } },
      yAxis: {
        type: 'value',
        min,
        max,
        name: yName,
        nameTextStyle: { color: '#9CA3AF' },
        axisLabel: { color: '#9CA3AF', formatter: (v: number) => `${v}%` },
        axisLine: { lineStyle: { color: '#1F2937' } },
        splitLine: { show: false }
      },
      series: [
        {
          type: 'line',
          showSymbol: false,
          z: 5,
          lineStyle: { width: 2, color: '#F59E0B' },
          data: points.map((p) => [ts(p.date), Number(p.value.toFixed(2))]),
          markArea: {
            silent: true,
            data: [
              band(20, max, 'rgba(34,197,94,0.16)'),
              band(5, 20, 'rgba(34,197,94,0.07)'),
              band(-5, 5, 'rgba(148,163,184,0.05)'),
              band(-20, -5, 'rgba(239,68,68,0.07)'),
              band(min, -20, 'rgba(239,68,68,0.16)')
            ]
          },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              guide(20, '+20%', 'rgba(34,197,94,0.5)'),
              guide(5, '+5%', 'rgba(34,197,94,0.35)'),
              guide(0, '0', '#E5E7EB', true),
              guide(-5, '-5%', 'rgba(239,68,68,0.35)'),
              guide(-20, '-20%', 'rgba(239,68,68,0.5)')
            ]
          }
        }
      ]
    };
  }

  const oscOption = $derived(buildOscOption(oscDisplay, `${oscPeriod}d %`));

  // ── Market-level (TOTAL2/TOTAL3 proxy) oscillator + regime ──
  const marketOscDisplay = $derived.by(() => {
    if (!marketData) return [];
    const r = marketData.series.map((p) => (marketBasis === 'total3' ? p.total3_ratio : p.total2_ratio));
    const osc = marketData.series.map((p, i) => {
      if (i < marketPeriod) return null;
      const past = r[i - marketPeriod];
      return past ? { date: p.date, value: ((r[i] - past) / past) * 100 } : null;
    });
    return osc.slice(-TF[timeframe]).filter((x): x is { date: string; value: number } => x !== null);
  });

  const marketOscOption = $derived(buildOscOption(marketOscDisplay, `${marketPeriod}d %`));

  const marketSignal = $derived.by(() => {
    const v = marketOscDisplay.at(-1)?.value;
    if (v == null) return { v: null, label: 'Neutral' };
    const label = v > 20 ? 'Strong altcoin rotation' : v > 5 ? 'Altcoin strength' : v < -20 ? 'Extreme altcoin weakness' : v < -5 ? 'Altcoin weakness' : 'Neutral';
    return { v, label };
  });

  // Regime + interpretation from TOTAL3/BTC oscillator vs BTC-dominance trend.
  const marketView = $derived.by(() => {
    if (!marketData || marketData.series.length < marketPeriod + 1) return null;
    const s = marketData.series;
    const i = s.length - 1;
    const j = i - marketPeriod;
    const v3 = s[j].total3_ratio ? ((s[i].total3_ratio - s[j].total3_ratio) / s[j].total3_ratio) * 100 : 0;
    const domChange = (s[i].dominance_proxy - s[j].dominance_proxy) * 100; // pct points
    const domRising = domChange > 0.3;
    const domFalling = domChange < -0.3;

    const pct = marketData.percent_outperforming_30d;
    let regime: string;
    if (pct != null && pct >= 60) regime = 'Broad altcoin strength';
    else if (pct != null && pct <= 25) regime = 'BTC season';
    else if (v3 > 5 && domFalling) regime = 'Early altcoin rotation';
    else if (v3 < -5 && domRising) regime = 'BTC season';
    else if (v3 > 5) regime = 'Selective altcoin strength';
    else if (v3 < -5) regime = 'Altcoin weakness';
    else regime = 'Neutral';

    const domWord = domRising ? 'rising' : domFalling ? 'falling' : 'flat';
    const tail =
      regime === 'Early altcoin rotation'
        ? 'Dominance falling while alts gain is the classic early-rotation setup — not yet broad enough to confirm altcoin season.'
        : regime === 'Broad altcoin strength'
          ? 'Most majors are outpacing BTC — the broadest alt-strength signal short of a full altcoin season.'
          : regime === 'BTC season'
            ? 'Capital favors BTC over alts right now.'
            : regime === 'Selective altcoin strength'
              ? 'A few alts are outpacing BTC, but the move is selective, not broad.'
              : regime === 'Altcoin weakness'
                ? 'Alts are broadly lagging BTC.'
                : 'Altcoins are moving broadly in line with BTC.';
    const domNow = marketData.current_btc_dominance != null ? ` (${marketData.current_btc_dominance.toFixed(1)}% now)` : '';
    const pctTxt = pct != null ? ` ${pct.toFixed(0)}% of tracked majors are beating BTC over 30d.` : '';
    const interp = `Altcoin majors are ${v3 >= 0 ? 'gaining' : 'losing'} strength vs BTC — TOTAL3/BTC (majors-basket proxy) is ${v3 >= 0 ? '+' : ''}${v3.toFixed(1)}% over ${marketPeriod}d. BTC dominance is ${domWord}${domNow}.${pctTxt} ${tail}`;
    return { v3, regime, interp };
  });

  const regimeColor = (r: string) =>
    ['Broad altcoin strength', 'Early altcoin rotation', 'Selective altcoin strength', 'Altcoin season'].includes(r)
      ? '#22C55E'
      : ['BTC season', 'Altcoin weakness'].includes(r)
        ? '#EF4444'
        : '#9CA3AF';

  const oscColor = (v: number | null | undefined) => (v == null ? '#9CA3AF' : v > 5 ? '#22C55E' : v < -5 ? '#EF4444' : '#9CA3AF');

  // Interpretation that tempers a single positive reading against the longer-term
  // trend (ratio vs its 200-day MA), to avoid false confidence.
  const interpretation = $derived.by(() => {
    if (!data || oscSignal.v == null) return '';
    const sym = data.coin.symbol;
    const v = oscSignal.v;
    const last = data.points[data.points.length - 1];
    const aboveMa200 = last?.ma200 != null && last.ratio > last.ma200;
    const perf =
      v > 20 ? 'strongly outperformed' : v > 5 ? 'outperformed' : v < -20 ? 'sharply underperformed' : v < -5 ? 'underperformed' : 'moved roughly in line with';
    let nuance: string;
    if (v > 5 && !aboveMa200)
      nuance = `However, the ${sym}/BTC ratio is still below its 200-day MA, so this may be an early recovery attempt unless the ratio breaks above key moving averages.`;
    else if (v > 5 && aboveMa200) nuance = `The ratio is also above its 200-day MA, which supports the strength rather than a short-lived bounce.`;
    else if (v < -5 && aboveMa200) nuance = `Still, the ratio remains above its 200-day MA, so the longer-term uptrend vs BTC is not yet broken.`;
    else if (v < -5 && !aboveMa200) nuance = `This reinforces a longer-term downtrend vs BTC — the ratio is also below its 200-day MA.`;
    else nuance = `${sym} is moving broadly in line with BTC over this window.`;
    return `${sym}/BTC is currently ${v >= 0 ? '+' : ''}${v.toFixed(1)}% on the ${oscPeriod}d oscillator, meaning ${sym} has ${perf} BTC over the last ${oscPeriod} days. ${nuance}`;
  });

  const ZONE_LEGEND = [
    { label: 'Very strong >+20%', color: '#22C55E' },
    { label: 'Strong +5–20%', color: '#86efac' },
    { label: 'Neutral ±5%', color: '#9CA3AF' },
    { label: 'Weak −5 to −20%', color: '#fca5a5' },
    { label: 'Very weak <−20%', color: '#EF4444' }
  ];
</script>

<header class="mb-5">
  <h1 class="text-xl font-semibold text-strong">Altcoin vs BTC Lab</h1>
  <p class="text-sm text-muted">
    Know whether your altcoin is truly outperforming Bitcoin or silently bleeding against it. Historical comparison —
    not a price prediction.
  </p>
</header>

{#if allowed === false}
  <LockedFeature
    title="Altcoin vs BTC Lab is a Mid &amp; Premium feature"
    plan="mid"
    bullets={['Alt/BTC ratio, oscillator & moving averages', 'Reaction score & market-level oscillator', 'Premium: multi-coin compare & advanced filters']}
  />
{:else if allowed === null}
  <div class="card text-center text-muted">Loading…</div>
{:else}
<!-- View switcher -->
<div class="mb-4 flex rounded-lg border border-edge p-0.5" style="width: fit-content">
  <button class="rounded-md px-3 py-1.5 text-sm" class:bg-panel-2={view === 'single'} class:text-strong={view === 'single'} class:text-muted={view !== 'single'} onclick={() => (view = 'single')}>Single coin</button>
  <button class="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm" class:bg-panel-2={view === 'compare'} class:text-strong={view === 'compare'} class:text-muted={view !== 'compare'} onclick={() => (view = 'compare')}>
    Compare{#if !canAdvanced}<span class="rounded bg-accent/15 px-1 text-[9px] font-semibold uppercase text-accent">Premium</span>{/if}
  </button>
</div>

{#if view === 'compare'}
  {#if canAdvanced}
    <MultiAltCompare {coins} />
    <div class="mt-6"><Disclaimer /></div>
  {:else}
    <LockedFeature
      title="Multi-coin compare is a Premium advanced filter"
      plan="premium"
      bullets={['Compare several alts against BTC at once', 'Relative-strength ranking across your set', 'Breakout & reaction scoring side by side']}
    />
  {/if}
{:else}
<!-- Controls -->
<div class="card mb-4 flex flex-wrap items-center gap-4">
  <div>
    <label class="stat-label" for="coin">Altcoin</label>
    <select id="coin" class="input mt-1 w-44" value={coinId} onchange={pickCoin}>
      {#each coins as c}<option value={c.coingecko_id}>{c.symbol} · {c.name}</option>{/each}
    </select>
  </div>

  <div>
    <span class="stat-label">Timeframe</span>
    <div class="mt-1 flex gap-1">
      {#each Object.keys(TF) as t}
        <button class="rounded-md px-2 py-1 text-sm" class:bg-panel-2={timeframe === t} class:text-strong={timeframe === t} class:text-muted={timeframe !== t} onclick={() => (timeframe = t)}>{t}</button>
      {/each}
    </div>
  </div>

  <div>
    <span class="stat-label">Mode</span>
    <div class="mt-1 flex gap-1">
      <button class="rounded-md px-2 py-1 text-sm" class:bg-panel-2={mode === 'ratio'} class:text-strong={mode === 'ratio'} class:text-muted={mode !== 'ratio'} onclick={() => (mode = 'ratio')}>Alt/BTC ratio</button>
      <button class="rounded-md px-2 py-1 text-sm" class:bg-panel-2={mode === 'normalized'} class:text-strong={mode === 'normalized'} class:text-muted={mode !== 'normalized'} onclick={() => (mode = 'normalized')}>Normalized</button>
    </div>
  </div>

  {#if mode === 'ratio'}
    <label class="flex items-center gap-2 text-sm text-muted"><input type="checkbox" bind:checked={showMa} /> MAs</label>
    <label class="flex items-center gap-2 text-sm text-muted"><input type="checkbox" bind:checked={logScale} /> Log</label>
  {/if}
</div>

{#if loading}
  <div class="card text-center text-muted">Loading Alt/BTC data…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if data}
  <!-- Premium Takeaway -->
  <div class="card mb-4 border border-mint/30 bg-mint/5">
    <p class="stat-label text-mint">Premium Takeaway</p>
    <p class="mt-1 text-sm leading-relaxed text-body">{premiumTakeaway}</p>
  </div>

  <!-- Final Verdict -->
  <div class="card mb-4 border-l-4" style="border-left-color: var(--mint, #37e0a6)">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-wide text-muted">The verdict</p>
        <p class="mt-1 text-xl font-bold leading-tight sm:text-2xl {verdictText[hvVerdict?.tone ?? 'neutral']}">{hvVerdict?.head}</p>
        <p class="mt-1 text-sm text-soft">{hvVerdict?.sub}</p>
        <p class="mt-2 text-[11px] text-muted">Signal: {data.analysis.verdict_label} · {data.analysis.verdict_summary}</p>
      </div>
      <div class="flex flex-col items-end gap-1">
        <button class="btn-primary" onclick={addToWatchlist}><Star class="h-4 w-4" /> Add to Watchlist</button>
        {#if watchMsg}<span class="text-xs text-muted">{watchMsg}</span>{/if}
      </div>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="stat-label">Premium signal</span>
      <span class="pill {premiumColor(data.analysis.premium_signal)}">{data.analysis.premium_signal}</span>
      <span class="stat-label ml-2">Trend</span>
      <span class="pill bg-edge text-body">{data.analysis.trend_state}</span>
      <span class="stat-label ml-2">Breakout</span>
      <span class="pill {breakoutColor(data.breakout_type)}">{data.breakout_label}</span>
    </div>
    <p class="mt-3 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-soft">
      <span class="font-medium text-strong">Premium note:</span> {data.analysis.premium_note}
    </p>
  </div>

  <!-- Signal / reaction card -->
  <div class="card mb-4 grid gap-4 md:grid-cols-[1fr_1fr_1.4fr]">
    <div>
      <p class="stat-label">{data.coin.symbol}/BTC ratio</p>
      <p class="mt-1 font-mono text-lg text-strong">{data.latest_ratio.toExponential(3)}</p>
      <p class="mt-1 flex flex-wrap gap-1">
        <span class="pill {signalColor(data.signal)}">{data.signal}</span>
        <span class="pill {breakoutColor(data.breakout_type)}">{data.breakout_label}</span>
      </p>
    </div>
    <div>
      <p class="stat-label">Strength vs BTC</p>
      <div class="mt-1 space-y-0.5 text-sm">
        <p>7d <span class={changeColor(data.strength_7d)}>{fmtPct(data.strength_7d)}</span></p>
        <p>30d <span class={changeColor(data.strength_30d)}>{fmtPct(data.strength_30d)}</span></p>
        <p>90d <span class={changeColor(data.strength_90d)}>{fmtPct(data.strength_90d)}</span></p>
      </div>
    </div>
    <div>
      <p class="stat-label mb-1">Reaction score</p>
      <ScoreBar score={data.reaction_score} label={data.reaction_label} />
      <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        {#each data.analysis.reaction_breakdown as b}
          <div class="flex justify-between gap-2">
            <span class="text-muted">{b.label}</span><span class={stateColor(b.state)}>{b.state}</span>
          </div>
        {/each}
      </div>
      <p class="mt-2 text-xs text-muted">Final: {data.reaction_label} — {data.ma_signal.toLowerCase()}.</p>
    </div>
  </div>

  <!-- Main chart -->
  <div class="card">
    <EChart option={mainOption} height={400} />
  </div>

  <!-- What this means -->
  <div class="card mt-4">
    <h2 class="text-sm font-semibold text-strong">What this means</h2>
    <p class="mt-1 text-sm leading-relaxed text-soft">{data.analysis.what_this_means}</p>
  </div>

  <!-- Confirmation + risk rules -->
  <div class="card mt-4 grid gap-4 md:grid-cols-2">
    <div>
      <h3 class="text-sm font-semibold text-strong">Confirmation needed</h3>
      <ul class="mt-2 space-y-1 text-xs text-soft">
        {#each data.analysis.confirmation_needed as c}
          <li class="flex gap-2"><span class="text-mint">✓</span><span>{c}</span></li>
        {/each}
      </ul>
    </div>
    <div>
      <h3 class="text-sm font-semibold text-strong">Risk warnings</h3>
      <ul class="mt-2 space-y-1 text-xs text-soft">
        {#each data.analysis.failure_warning as f}
          <li class="flex gap-2"><span class="text-danger">!</span><span>{f}</span></li>
        {/each}
      </ul>
    </div>
  </div>

  <!-- Oscillator -->
  <div class="card mt-4">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-sm font-semibold text-strong">Alt/BTC Oscillator</h2>
        <p class="text-xs text-muted">Rolling % change of the {data.coin.symbol}/BTC ratio over {oscPeriod} days. Above 0 = gaining strength vs BTC.</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="pill {signalColor(oscSignal.label)}">{oscSignal.label}{oscSignal.v != null ? ` · ${oscSignal.v >= 0 ? '+' : ''}${oscSignal.v.toFixed(1)}%` : ''}</span>
        <div class="flex gap-1">
          {#each OSC_PERIODS as p}
            <button class="rounded-md px-2 py-0.5 text-xs" class:bg-panel-2={oscPeriod === p} class:text-strong={oscPeriod === p} class:text-muted={oscPeriod !== p} onclick={() => (oscPeriod = p)}>{p}d</button>
          {/each}
        </div>
      </div>
    </div>

    <EChart option={oscOption} height={220} />

    <!-- Zone legend -->
    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {#each ZONE_LEGEND as z}
        <span class="flex items-center gap-1.5 text-xs text-muted">
          <span class="inline-block h-2 w-2 rounded-sm" style="background: {z.color}"></span>{z.label}
        </span>
      {/each}
    </div>

    <!-- Interpretation -->
    {#if interpretation}
      <p class="mt-3 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-soft">{interpretation}</p>
    {/if}
  </div>

  <!-- Market-level oscillator (TOTAL2/TOTAL3 vs BTC) -->
  <div class="card mt-4">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-sm font-semibold text-strong">Altcoin Market vs BTC</h2>
        <p class="text-xs text-muted">
          Rolling % change of {marketBasis === 'total3' ? 'TOTAL3' : 'TOTAL2'}/BTC over {marketPeriod} days. Above 0 =
          altcoin market gaining strength vs BTC. <span class="opacity-70">(majors-basket proxy — true TOTAL2/3 needs a paid feed)</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        {#if marketSignal.v != null}
          <span class="rounded-full px-2.5 py-1 text-xs font-medium" style="background: {oscColor(marketSignal.v)}22; color: {oscColor(marketSignal.v)}">{marketSignal.label} · {marketSignal.v >= 0 ? '+' : ''}{marketSignal.v.toFixed(1)}%</span>
        {/if}
        <div class="flex rounded-md border border-edge p-0.5">
          <button class="rounded px-2 py-0.5 text-xs" class:bg-panel-2={marketBasis === 'total2'} class:text-strong={marketBasis === 'total2'} class:text-muted={marketBasis !== 'total2'} onclick={() => (marketBasis = 'total2')}>TOTAL2</button>
          <button class="rounded px-2 py-0.5 text-xs" class:bg-panel-2={marketBasis === 'total3'} class:text-strong={marketBasis === 'total3'} class:text-muted={marketBasis !== 'total3'} onclick={() => (marketBasis = 'total3')}>TOTAL3</button>
        </div>
        <div class="flex gap-1">
          {#each [7, 30, 90] as p}
            <button class="rounded-md px-2 py-0.5 text-xs" class:bg-panel-2={marketPeriod === p} class:text-strong={marketPeriod === p} class:text-muted={marketPeriod !== p} onclick={() => (marketPeriod = p)}>{p}d</button>
          {/each}
        </div>
      </div>
    </div>

    {#if !marketData}
      <p class="py-10 text-center text-muted">Loading altcoin-market data…</p>
    {:else}
      <EChart option={marketOscOption} height={220} />

      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {#each ZONE_LEGEND as z}
          <span class="flex items-center gap-1.5 text-xs text-muted">
            <span class="inline-block h-2 w-2 rounded-sm" style="background: {z.color}"></span>{z.label}
          </span>
        {/each}
      </div>

      {#if marketView}
        <div class="mt-3 flex items-center gap-2">
          <span class="stat-label">Regime</span>
          <span class="rounded-full px-2.5 py-1 text-xs font-medium" style="background: {regimeColor(marketView.regime)}22; color: {regimeColor(marketView.regime)}">{marketView.regime}</span>
        </div>
        <p class="mt-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-soft">{marketView.interp}</p>
      {/if}
    {/if}
  </div>

  {#if signalsResp}
    <!-- Today's Top 3 -->
    {#if signalsResp.top3}
      <div class="card mt-4 grid gap-4 md:grid-cols-2">
        {#each [{ title: "Today's strongest vs BTC", list: signalsResp.top3.strongest, pos: true }, { title: 'Weakest vs BTC', list: signalsResp.top3.weakest, pos: false }] as col}
          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{col.title}</h3>
            <ol class="space-y-1 text-sm">
              {#each col.list as t, i}
                <li class="flex items-center justify-between">
                  <span class="text-strong"><span class="text-muted">{i + 1}.</span> {t.symbol} — {t.signal_label}</span>
                  <span class="flex items-center gap-2">
                    <span class={col.pos ? 'text-mint' : 'text-danger'}>{fmtPct(t.strength_90d)}</span>
                    <span class="pill {confidenceColor(t.confidence)} text-[10px]">{t.confidence.replace(' confidence', '')}</span>
                  </span>
                </li>
              {/each}
            </ol>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Market breadth -->
    {#if signalsResp.breadth && signalsResp.breadth.count}
      {@const b = signalsResp.breadth}
      <div class="card mt-4">
        <h3 class="text-sm font-semibold text-strong">Altcoin Market Breadth</h3>
        <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div><p class="stat-label">Outperform 7d</p><p class="text-strong">{b.outperform_7d}/{b.count}</p></div>
          <div><p class="stat-label">Outperform 30d</p><p class="text-strong">{b.outperform_30d}/{b.count}</p></div>
          <div><p class="stat-label">Outperform 90d</p><p class="text-strong">{b.outperform_90d}/{b.count}</p></div>
          <div><p class="stat-label">% above 200D MA</p><p class="text-strong">{b.pct_above_200}%</p></div>
          <div><p class="stat-label">% above 50D MA</p><p class="text-strong">{b.pct_above_50}%</p></div>
          <div><p class="stat-label">Confirmed leaders</p><p class="text-mint">{b.leaders}</p></div>
          <div><p class="stat-label">Bleeding pairs</p><p class="text-danger">{b.weak}</p></div>
        </div>
        <p class="mt-2 text-xs text-muted">
          {b.pct_outperform_30d}% of the {b.count}-coin premium universe are outperforming BTC over 30d —
          {b.pct_above_200 >= 50 ? 'broad altcoin strength.' : 'selective strength, not full altcoin season.'}
        </p>
      </div>
    {/if}

    <!-- Breakout & Weakness Signals -->
    <div class="card mt-4">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-strong">Breakout & Weakness Signals</h2>
          <p class="text-xs text-muted">
            {signalScope === 'premium'
              ? 'Premium view: top-100, liquid, ≥180d history, abnormal spikes hidden.'
              : 'All coins — includes low-liquidity / short-history tickers.'}
          </p>
        </div>
        <div class="flex rounded-md border border-edge p-0.5 text-xs">
          <button class="rounded px-2 py-0.5" class:bg-panel-2={signalScope === 'premium'} class:text-strong={signalScope === 'premium'} class:text-muted={signalScope !== 'premium'} onclick={() => setScope('premium')}>Premium</button>
          <button class="rounded px-2 py-0.5" class:bg-panel-2={signalScope === 'all'} class:text-strong={signalScope === 'all'} class:text-muted={signalScope !== 'all'} onclick={() => setScope('all')}>All coins</button>
        </div>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        {#each [{ title: 'Breaking out vs BTC', list: breakouts }, { title: 'Bleeding vs BTC', list: weaknesses }] as col}
          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{col.title}</h3>
            {#if col.list.length}
              <ul class="divide-y divide-edge/60">
                {#each col.list as s}
                  <li class="py-1.5 text-sm" title={s.reasons.join(' · ')}>
                    <div class="flex items-center justify-between">
                      <span class="font-medium text-strong">{s.coin?.symbol ?? '—'}</span>
                      <span class="flex items-center gap-2">
                        <span class="pill {breakoutColor(s.signal_type)}">{s.signal_label}</span>
                        <span class={changeColor(s.metrics?.strength_90d)}>{fmtPct(s.metrics?.strength_90d)}</span>
                      </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5">
                      <span class="pill {confidenceColor(s.confidence)} text-[10px]">{s.confidence}</span>
                      <span class="pill {qualityColor(s.quality)} text-[10px]">{s.quality}</span>
                    </div>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="py-2 text-xs text-muted">None in this view.</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="mt-6"><Disclaimer /></div>
{/if}
{/if}
{/if}
