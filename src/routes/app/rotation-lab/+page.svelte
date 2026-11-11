<script lang="ts">
  import { Repeat, Info, AlertTriangle, Play, Search, ArrowRightLeft, ChevronDown, Sliders, Trophy } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import EChart from '$lib/components/EChart.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import { fmtMoney } from '$lib/format';
  import { axisTooltip, categorical, grid, lineSeries, logAxis, timeAxis, valueAxis, zoomInside } from '$lib/charts/presets';

  // Rotation Backtest Lab — rank coins by strength, hold the top N inside a hold
  // band, rotate out laggards, and compare with simply holding BTC. Everything is
  // computed server-side from saved daily closes; this page only collects inputs
  // and draws the result.

  interface Coin { id: string; symbol: string; name: string; image: string | null; rank: number }
  interface Meta {
    coins: Coin[];
    data_from: string;
    data_to: string;
    bars: number;
    signals: { key: string; label: string; unit: string }[];
    filters: { key: string; label: string }[];
    defaults: Record<string, unknown>;
  }
  interface M { final_equity: number; total_return_pct: number; cagr_pct: number | null; max_drawdown_pct: number; volatility_pct: number; sharpe: number | null; sortino: number | null }
  interface Result {
    params: { rebalance_days: number; worst_rank_held: number; top_n: number };
    window: { start: string; end: string; days: number };
    data_as_of: string;
    universe: Coin[];
    series: { dates: string[]; strategy: number[]; btc: number[]; drawdown_strategy: number[]; drawdown_btc: number[] };
    metrics: { strategy: M; btc: M };
    stats: { trades: number; win_rate_pct: number | null; avg_trade_pct: number | null; best_trade_pct: number | null; worst_trade_pct: number | null; avg_hold_days: number | null; total_fees: number; exposure_pct: number; rebalances: number };
    trades: { coin: string; symbol: string; entry_date: string; exit_date: string; return_pct: number; hold_days: number; exit_reason: 'rank' | 'unrankable' | 'end' }[];
    events: { date: string; bought: string[]; sold: string[]; held: string[] }[];
    final_holdings: { coin: string; symbol: string; entry_date: string; return_pct: number; weight_pct: number }[];
    final_ranking: { coin: string; symbol: string; name: string; rank: number; score: number; in_hold_band: boolean }[];
    score_unit: '%' | 'x';
    warnings: string[];
    assumptions: string[];
    disclaimer: string;
  }

  const canUse = $derived(hasFeature($membership, 'access_rotation_backtest'));

  // ── Inputs ──
  let universe = $state<'top10' | 'top20' | 'top30' | 'top50' | 'all' | 'custom'>('top20');
  let custom = $state<string[]>(['bitcoin', 'ethereum', 'solana', 'ripple', 'binancecoin', 'dogecoin']);
  let signal = $state<'momentum' | 'risk_adjusted'>('momentum');
  let filter = $state<'none' | 'positive' | 'beat_btc'>('none');
  let lookback = $state(30);
  let topN = $state(3);
  let band = $state(5);
  let rebalance = $state(7);
  let fee = $state(0.1);
  let cash = $state(1_000_000); // TSh by default — see `unit` below.
  let startDate = $state('');
  let endDate = $state('');
  let logScale = $state(false);
  let coinQuery = $state('');
  let showAllTrades = $state(false);

  // ── Simple mode ──
  // The engine has ten controls. Most investors do not have an opinion on a
  // lookback window or a hold band, and every control they cannot answer is a
  // reason to leave. Simple mode asks three questions — how much, which style,
  // since when — and presets the rest. Nothing is hidden from anyone who wants
  // it: "Customise" is the same panel that was always here.
  let mode = $state<'simple' | 'custom'>('simple');
  let styleKey = $state<'steady' | 'balanced' | 'bold'>('balanced');
  let showDetails = $state(false);

  // Money unit. The backtest models no exchange-rate movement, so equity is just
  // initial_cash × a growth factor — the arithmetic is identical whatever unit
  // the amount is counted in. That lets us quote TSh directly without inventing
  // a USD/TZS rate. It does mean the figure ignores shilling-vs-dollar drift,
  // which is stated in the notes rather than glossed over.
  let unit = $state<'TZS' | 'USD'>('TZS');
  const AMOUNTS: Record<'TZS' | 'USD', number[]> = { TZS: [100_000, 1_000_000], USD: [100, 1_000] };
  const money = (n: number | null | undefined) => (n == null ? '—' : fmtMoney(Math.round(n), unit));

  const STYLES = [
    {
      key: 'steady' as const,
      icon: '🐢',
      label: 'Steady',
      blurb: 'Big coins only, reviewed monthly, and sits in cash when nothing is rising.',
      preset: { universe: 'top10' as const, signal: 'risk_adjusted' as const, filter: 'positive' as const, rebalance: 30, topN: 3, band: 5, lookback: 30 }
    },
    {
      key: 'balanced' as const,
      icon: '⚖️',
      label: 'Balanced',
      blurb: 'The middle road: top 20 coins, reviewed every week.',
      preset: { universe: 'top20' as const, signal: 'momentum' as const, filter: 'none' as const, rebalance: 7, topN: 3, band: 5, lookback: 30 }
    },
    {
      key: 'bold' as const,
      icon: '🚀',
      label: 'Bold',
      blurb: 'Widest net, always invested. Expect much bigger swings.',
      preset: { universe: 'top50' as const, signal: 'momentum' as const, filter: 'none' as const, rebalance: 7, topN: 3, band: 5, lookback: 30 }
    }
  ];
  const activeStyle = $derived(STYLES.find((s) => s.key === styleKey) ?? STYLES[1]);

  const applyStyle = (key: 'steady' | 'balanced' | 'bold') => {
    styleKey = key;
    const p = (STYLES.find((s) => s.key === key) ?? STYLES[1]).preset;
    universe = p.universe;
    signal = p.signal;
    filter = p.filter;
    rebalance = p.rebalance;
    lookback = p.lookback;
    topN = p.topN;
    band = p.band;
  };

  // "Since when" → a start date, clamped to what the price cache actually holds.
  // Asking for a year when only six months are saved silently gets six months,
  // rather than an empty result.
  let since = $state<'6m' | '1y' | 'all'>('all');
  const startFor = (key: '6m' | '1y' | 'all'): string => {
    if (key === 'all' || !meta) return '';
    const end = new Date(`${meta.data_to}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() - (key === '6m' ? 6 : 12));
    const want = end.toISOString().slice(0, 10);
    return want < meta.data_from ? '' : want;
  };
  const applySince = (key: '6m' | '1y' | 'all') => {
    since = key;
    endDate = '';
    startDate = startFor(key);
  };
  // The range buttons can be pressed before the price window has loaded, so
  // resolve the date again once meta arrives.
  $effect(() => {
    if (meta) startDate = startFor(since);
  });

  // Switching unit rescales the amount to that unit's own default, so a TSh
  // 1,000,000 figure never silently becomes $1,000,000.
  const setUnit = (u: 'TZS' | 'USD') => {
    if (u === unit) return;
    unit = u;
    cash = AMOUNTS[u][1];
  };

  let meta = $state<Meta | null>(null);
  let result = $state<Result | null>(null);
  let loading = $state(false);
  let error = $state('');

  const UNIVERSES = [
    { key: 'top10', label: 'Top 10' },
    { key: 'top20', label: 'Top 20' },
    { key: 'top30', label: 'Top 30' },
    { key: 'top50', label: 'Top 50' },
    { key: 'all', label: 'All' },
    { key: 'custom', label: 'Custom' }
  ] as const;
  const REBALANCE = [
    { days: 1, label: 'Daily' },
    { days: 7, label: 'Weekly' },
    { days: 14, label: '2 weeks' },
    { days: 30, label: 'Monthly' }
  ];
  const LOOKBACKS = [7, 14, 30, 60, 90];

  const universeSize = $derived.by(() => {
    if (!meta) return 0;
    if (universe === 'custom') return custom.length;
    if (universe === 'all') return meta.coins.length;
    return Math.min(meta.coins.length, Number(universe.slice(3)));
  });
  const bandMax = $derived(Math.max(topN, Math.min(30, universeSize || 30)));

  // The hold band can never be tighter than the slot count.
  $effect(() => {
    if (band < topN) band = topN;
    if (band > bandMax) band = bandMax;
  });

  const filteredCoins = $derived(
    (meta?.coins ?? []).filter((c) => {
      const q = coinQuery.trim().toLowerCase();
      return !q || c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    })
  );
  const toggleCoin = (id: string) => {
    custom = custom.includes(id) ? custom.filter((c) => c !== id) : custom.length >= 40 ? custom : [...custom, id];
  };

  const body = () => ({
    universe,
    ...(universe === 'custom' ? { coins: custom } : {}),
    signal,
    filter,
    lookback_days: lookback,
    top_n: topN,
    worst_rank_held: band,
    rebalance_days: rebalance,
    fee_pct: Number(fee) || 0,
    initial_cash: Number(cash) || AMOUNTS[unit][1],
    ...(startDate ? { start_date: startDate } : {}),
    ...(endDate ? { end_date: endDate } : {})
  });

  const run = async () => {
    loading = true;
    error = '';
    try {
      result = await api<Result>('/rotation-backtest/run', { method: 'POST', auth: true, body: body() });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Backtest failed.';
    } finally {
      loading = false;
    }
  };

  // Load options once access is known.
  let metaRequested = false;
  $effect(() => {
    if (!$membershipReady || !canUse || metaRequested) return;
    metaRequested = true;
    api<Meta>('/rotation-backtest/meta', { auth: true })
      .then((m) => (meta = m))
      .catch((e) => (error = e instanceof Error ? e.message : 'Could not load the lab.'));
  });

  // Debounced auto-run whenever an input changes.
  $effect(() => {
    const deps = [universe, custom.length, signal, filter, lookback, topN, band, rebalance, fee, cash, startDate, endDate, meta];
    void deps;
    if (!meta) return;
    if (universe === 'custom' && custom.length < topN) return;
    const id = setTimeout(() => void run(), 400);
    return () => clearTimeout(id);
  });

  // ── Formatting ──
  const pct = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`);
  const num = (n: number | null | undefined, digits = 2) => (n == null ? '—' : n.toFixed(digits));
  const tone = (n: number | null | undefined) => (n == null ? 'text-muted' : n >= 0 ? 'text-mint' : 'text-danger');
  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const REASON: Record<string, string> = { rank: 'Fell out of band', unrankable: 'Failed filter / no data', end: 'Test ended' };

  // Rotation in blue, BTC in its amber — both from the theme-reactive palette.
  const colors = $derived({ rot: $categorical[1], btc: $categorical[0] });

  const equityOption = $derived.by(() => {
    if (!result) return {};
    const s = result.series;
    return {
      backgroundColor: 'transparent',
      grid: grid({ top: 30, right: 16 }),
      legend: { data: ['Rotation', 'Hold BTC'], top: 0 },
      tooltip: axisTooltip({ valueFormatter: (v: number) => money(v) }),
      dataZoom: [zoomInside()],
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: logScale
        ? logAxis({ scale: true, axisLabel: { formatter: (v: number) => money(v) } })
        : valueAxis({ scale: true, axisLabel: { formatter: (v: number) => money(v) } }),
      series: [
        lineSeries({ name: 'Rotation', color: colors.rot, width: 2, data: s.dates.map((d, i) => [ts(d), s.strategy[i]]) }),
        lineSeries({ name: 'Hold BTC', color: colors.btc, width: 1.6, data: s.dates.map((d, i) => [ts(d), s.btc[i]]) })
      ]
    };
  });

  const drawdownOption = $derived.by(() => {
    if (!result) return {};
    const s = result.series;
    return {
      backgroundColor: 'transparent',
      grid: grid({ top: 30, right: 16 }),
      legend: { data: ['Rotation', 'Hold BTC'], top: 0 },
      tooltip: axisTooltip({ valueFormatter: (v: number) => `${v.toFixed(1)}%` }),
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: valueAxis({ max: 0, axisLabel: { formatter: (v: number) => `${Math.round(v)}%` } }),
      series: [
        lineSeries({ name: 'Rotation', color: colors.rot, width: 1.4, area: 0.12, data: s.dates.map((d, i) => [ts(d), s.drawdown_strategy[i]]) }),
        lineSeries({ name: 'Hold BTC', color: colors.btc, width: 1.2, area: 0.06, data: s.dates.map((d, i) => [ts(d), s.drawdown_btc[i]]) })
      ]
    };
  });

  const edge = $derived(result ? result.metrics.strategy.total_return_pct - result.metrics.btc.total_return_pct : 0);
  const comparison = $derived(
    result
      ? [
          { label: 'Final value', a: money(result.metrics.strategy.final_equity), b: money(result.metrics.btc.final_equity) },
          { label: 'Total return', a: pct(result.metrics.strategy.total_return_pct), b: pct(result.metrics.btc.total_return_pct), ta: tone(result.metrics.strategy.total_return_pct), tb: tone(result.metrics.btc.total_return_pct) },
          { label: 'Annualised (CAGR)', a: pct(result.metrics.strategy.cagr_pct), b: pct(result.metrics.btc.cagr_pct) },
          { label: 'Max drawdown', a: pct(result.metrics.strategy.max_drawdown_pct), b: pct(result.metrics.btc.max_drawdown_pct), ta: 'text-danger', tb: 'text-danger' },
          { label: 'Volatility (yr)', a: `${num(result.metrics.strategy.volatility_pct, 0)}%`, b: `${num(result.metrics.btc.volatility_pct, 0)}%` },
          { label: 'Sharpe', a: num(result.metrics.strategy.sharpe), b: num(result.metrics.btc.sharpe) },
          { label: 'Sortino', a: num(result.metrics.strategy.sortino), b: num(result.metrics.btc.sortino) }
        ]
      : []
  );
  const tradesShown = $derived(result ? (showAllTrades ? result.trades : result.trades.slice(0, 25)) : []);

  // Holdings are only reviewed on rebalance days, so on the last day a held coin can
  // already rank outside the band — flag it rather than let it look like a bug.
  const heldIds = $derived(new Set(result?.final_holdings.map((h) => h.coin) ?? []));
  const heldOutsideBand = $derived(
    result
      ? result.final_holdings
          .filter((h) => !result!.final_ranking.some((row) => row.coin === h.coin && row.in_hold_band))
          .map((h) => h.symbol)
      : []
  );
  const cadence = $derived(REBALANCE.find((x) => x.days === (result?.params?.rebalance_days ?? rebalance))?.label.toLowerCase() ?? 'weekly');

  // ── This week ──
  // The one genuinely forward-looking thing on the page. A backtest says what
  // would have worked; today's ranking says where the rule points now. Built
  // from the last day of saved prices, so it needs nothing from the server
  // beyond what /run already returns. Events are in chronological order, so the
  // most recent review is the last one.
  const thisWeek = $derived.by(() => {
    if (!result) return null;
    const last = result.events.length ? result.events[result.events.length - 1] : null;
    return {
      asOf: result.window.end,
      leaders: result.final_ranking.filter((row) => row.in_hold_band).slice(0, 5),
      holding: result.final_holdings.map((h) => h.symbol),
      entered: last?.bought ?? [],
      left: last?.sold ?? [],
      reviewed: last?.date ?? null
    };
  });

  // ── Plain language ──
  // Same numbers as the metrics table, in words. Sharpe and Sortino stay behind
  // "See the details" — they mean nothing to someone investing their first
  // TSh 100,000, and a number nobody understands is a number nobody trusts.
  const rideWord = (vol: number | null | undefined) =>
    vol == null ? '—' : vol < 50 ? 'Calm' : vol < 80 ? 'Bumpy' : vol < 120 ? 'Very bumpy' : 'Wild';

  const plain = $derived.by(() => {
    if (!result) return null;
    const s = result.metrics.strategy;
    const b = result.metrics.btc;
    return {
      from: money(cash),
      ours: money(s.final_equity),
      btc: money(b.final_equity),
      beat: s.final_equity >= b.final_equity,
      drop: Math.abs(s.max_drawdown_pct),
      btcDrop: Math.abs(b.max_drawdown_pct),
      ride: rideWord(s.volatility_pct),
      winsPer100: result.stats.win_rate_pct == null ? null : Math.round(result.stats.win_rate_pct)
    };
  });

  // Most recent rotations first — someone checking in on a Sunday wants the last
  // review, not the first one of the test window.
  const recentEvents = $derived(result ? [...result.events].reverse().slice(0, 60) : []);
</script>

<header class="mb-5">
  <h1 class="flex items-center gap-2 text-xl font-semibold text-strong"><Repeat class="h-5 w-5 text-accent" /> Rotation Backtest Lab</h1>
  <p class="text-sm text-muted">
    Rank coins by strength, hold the strongest few, swap out the ones that fade, and see how that rotation would have done against simply holding BTC.
  </p>
</header>

{#if !$membershipReady}
  <p class="text-sm text-muted">Loading…</p>
{:else if !canUse}
  <LockedFeature
    title="Rotation Backtest Lab is a premium feature"
    plan="Premium"
    bullets={[
      'Backtest a top-N coin rotation on real daily prices',
      'Momentum or risk-adjusted ranking, with a hold band to cut churn',
      'Optional cash filters: only hold coins going up, or only coins beating BTC',
      'Equity curve, drawdowns, trade log and Sharpe ratio versus holding BTC'
    ]}
  />
{:else}
  <div class="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
    <!-- ── Inputs ── -->
    <div class="space-y-3">
      <div class="inline-flex w-full overflow-hidden rounded-lg border border-edge text-xs">
        <button
          class="flex-1 px-3 py-2 font-medium transition-colors {mode === 'simple' ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}"
          onclick={() => (mode = 'simple')}>Simple</button
        >
        <button
          class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 font-medium transition-colors {mode === 'custom' ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}"
          onclick={() => (mode = 'custom')}><Sliders class="h-3.5 w-3.5" /> Customise</button
        >
      </div>

      {#if mode === 'simple'}
        <div class="card space-y-4">
          <div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-muted">How much?</span>
              <div class="inline-flex overflow-hidden rounded-md border border-edge text-[10px]">
                <button class="px-2 py-0.5 font-semibold transition-colors {unit === 'TZS' ? 'bg-accent/15 text-accent' : 'text-muted'}" onclick={() => setUnit('TZS')}>TSh</button>
                <button class="px-2 py-0.5 font-semibold transition-colors {unit === 'USD' ? 'bg-accent/15 text-accent' : 'text-muted'}" onclick={() => setUnit('USD')}>$</button>
              </div>
            </div>
            <div class="mt-1 grid grid-cols-2 gap-1.5">
              {#each AMOUNTS[unit] as a}
                <button
                  class="rounded-lg border px-2 py-2 text-xs font-semibold transition {Number(cash) === a ? 'border-accent/50 bg-accent/10 text-accent' : 'border-edge text-muted hover:text-soft'}"
                  onclick={() => (cash = a)}>{fmtMoney(a, unit)}</button
                >
              {/each}
            </div>
            <input
              type="number"
              min="1"
              class="mt-1.5 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-strong"
              placeholder="Other amount"
              bind:value={cash}
            />
          </div>

          <div>
            <span class="text-xs font-medium text-muted">Your style?</span>
            <div class="mt-1 space-y-1.5">
              {#each STYLES as s}
                <button
                  class="flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition {styleKey === s.key ? 'border-accent/50 bg-accent/10' : 'border-edge hover:bg-panel-2/60'}"
                  onclick={() => applyStyle(s.key)}
                >
                  <span class="text-base leading-none" aria-hidden="true">{s.icon}</span>
                  <span class="min-w-0">
                    <span class="block text-xs font-semibold {styleKey === s.key ? 'text-accent' : 'text-strong'}">{s.label}</span>
                    <span class="block text-[11px] leading-snug text-muted">{s.blurb}</span>
                  </span>
                </button>
              {/each}
            </div>
          </div>

          <div>
            <span class="text-xs font-medium text-muted">Since when?</span>
            <div class="mt-1 grid grid-cols-3 gap-1.5">
              {#each [{ k: '6m', l: '6 months' }, { k: '1y', l: '1 year' }, { k: 'all', l: 'All time' }] as o}
                <button
                  class="rounded-lg border px-1 py-1.5 text-xs font-medium transition {since === o.k ? 'border-accent/50 bg-accent/10 text-accent' : 'border-edge text-muted hover:text-soft'}"
                  onclick={() => applySince(o.k as '6m' | '1y' | 'all')}>{o.l}</button
                >
              {/each}
            </div>
            {#if meta}<p class="mt-1 text-[11px] text-muted">Saved prices start {meta.data_from}.</p>{/if}
          </div>

          <p class="rounded-lg bg-panel-2/60 px-2.5 py-2 text-[11px] leading-snug text-muted">
            Amounts are counted in {unit === 'TZS' ? 'shillings' : 'dollars'} straight through. The test does not model the
            {unit === 'TZS' ? 'shilling-to-dollar' : 'dollar'} exchange rate, so treat it as the growth of the strategy, not a currency forecast.
          </p>
        </div>
      {:else}
      <div class="card space-y-4">
        <div>
          <span class="text-xs font-medium text-muted">Coins to choose from</span>
          <div class="mt-1 grid grid-cols-3 gap-1.5">
            {#each UNIVERSES as u}
              <button
                class="rounded-lg border px-2 py-1.5 text-xs font-medium transition {universe === u.key ? 'border-accent/50 bg-accent/10 text-accent' : 'border-edge text-muted hover:text-soft'}"
                onclick={() => (universe = u.key)}>{u.label}</button
              >
            {/each}
          </div>
          <p class="mt-1 text-[11px] text-muted">
            {#if universe === 'custom'}{custom.length} selected (max 40){:else}{universeSize} coins by today’s market cap, stablecoins excluded{/if}
          </p>
          {#if universe === 'custom' && meta}
            <div class="mt-2 rounded-lg border border-edge">
              <div class="relative border-b border-edge">
                <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input class="w-full rounded-t-lg bg-panel-2 py-1.5 pl-8 pr-2 text-xs text-strong" placeholder="Search coins…" bind:value={coinQuery} />
              </div>
              <ul class="max-h-48 overflow-y-auto py-1">
                {#each filteredCoins as c (c.id)}
                  <li>
                    <label class="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-xs hover:bg-panel-2/60">
                      <input type="checkbox" class="accent-mint" checked={custom.includes(c.id)} onchange={() => toggleCoin(c.id)} />
                      <span class="w-12 font-semibold text-strong">{c.symbol}</span>
                      <span class="truncate text-muted">{c.name}</span>
                    </label>
                  </li>
                {/each}
              </ul>
            </div>
            {#if custom.length < topN}<p class="mt-1 text-[11px] text-warn">Pick at least {topN} coins for {topN} slots.</p>{/if}
          {/if}
        </div>

        <div>
          <span class="text-xs font-medium text-muted">Rank coins by</span>
          <div class="mt-1 inline-flex w-full overflow-hidden rounded-lg border border-edge text-xs">
            <button class="flex-1 px-2 py-1.5 font-medium transition-colors {signal === 'momentum' ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (signal = 'momentum')}>Momentum</button>
            <button class="flex-1 px-2 py-1.5 font-medium transition-colors {signal === 'risk_adjusted' ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (signal = 'risk_adjusted')}>Risk-adjusted</button>
          </div>
          <p class="mt-1 text-[11px] text-muted">
            {signal === 'momentum' ? 'Price change over the lookback window.' : 'Price change divided by its day-to-day volatility — favours steady climbs over spikes.'}
          </p>
        </div>

        <div>
          <label class="text-xs font-medium text-muted" for="lb">Lookback window</label>
          <select id="lb" class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-2 text-sm text-strong" bind:value={lookback}>
            {#each LOOKBACKS as d}<option value={d}>{d} days</option>{/each}
          </select>
        </div>

        <div>
          <label class="text-xs font-medium text-muted" for="topn">Hold the top <span class="text-strong">{topN}</span></label>
          <input id="topn" type="range" min="1" max="10" step="1" class="mt-1 w-full accent-mint" bind:value={topN} />
          <label class="mt-2 block text-xs font-medium text-muted" for="band">Keep a coin while it ranks in the top <span class="text-strong">{band}</span></label>
          <input id="band" type="range" min={topN} max={bandMax} step="1" class="mt-1 w-full accent-accent" bind:value={band} />
          <p class="mt-1 text-[11px] text-muted">
            The hold band: a coin bought in the top {topN} is only sold once it drops below #{band}. A wider band means fewer trades and lower fees.
          </p>
        </div>

        <div>
          <span class="text-xs font-medium text-muted">Rebalance</span>
          <div class="mt-1 grid grid-cols-4 gap-1.5">
            {#each REBALANCE as r}
              <button
                class="rounded-lg border px-1 py-1.5 text-xs font-medium transition {rebalance === r.days ? 'border-accent/50 bg-accent/10 text-accent' : 'border-edge text-muted hover:text-soft'}"
                onclick={() => (rebalance = r.days)}>{r.label}</button
              >
            {/each}
          </div>
        </div>

        <div>
          <span class="text-xs font-medium text-muted">Cash filter</span>
          <div class="mt-1 space-y-1.5">
            {#each meta?.filters ?? [] as f}
              <label class="flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition {filter === f.key ? 'border-accent/50 bg-accent/10 text-soft' : 'border-edge text-muted hover:text-soft'}">
                <input type="radio" name="filter" class="mt-0.5 accent-mint" value={f.key} bind:group={filter} />
                <span>{f.label}</span>
              </label>
            {/each}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs font-medium text-muted" for="fee">Fee per trade (%)</label>
            <input id="fee" type="number" min="0" max="2" step="0.05" class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-strong" bind:value={fee} />
          </div>
          <div>
            <label class="text-xs font-medium text-muted" for="cash">Starting capital ({unit === 'TZS' ? 'TSh' : '$'})</label>
            <input id="cash" type="number" min="100" step="1000" class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-strong" bind:value={cash} />
          </div>
          <div>
            <label class="text-xs font-medium text-muted" for="sd">From</label>
            <input id="sd" type="date" min={meta?.data_from} max={meta?.data_to} class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-2 text-sm text-strong" bind:value={startDate} />
          </div>
          <div>
            <label class="text-xs font-medium text-muted" for="ed">To</label>
            <input id="ed" type="date" min={meta?.data_from} max={meta?.data_to} class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-2 text-sm text-strong" bind:value={endDate} />
          </div>
        </div>
        {#if meta}<p class="text-[11px] text-muted">Saved daily prices: {meta.data_from} → {meta.data_to}. Leave the dates empty to use all of it.</p>{/if}

        <button class="btn-primary w-full justify-center text-sm" disabled={loading || !meta} onclick={run}>
          <Play class="h-4 w-4" />
          {loading ? 'Running…' : 'Run backtest'}
        </button>
      </div>
      {/if}
    </div>

    <!-- ── Results ── -->
    <div class="min-w-0 space-y-3">
      {#if error}
        <div class="card border-danger/30 bg-danger/5 text-sm text-danger">{error}</div>
      {/if}

      {#if !result}
        <p class="text-sm text-muted">{meta ? 'Running the first backtest…' : 'Loading saved price history…'}</p>
      {:else}
        {@const r = result}

        {#if mode === 'simple'}
          <!-- The rule as it stands today. A backtest cannot tell anyone what to
               do next, so the current ranking leads and the history sits behind
               it as evidence. -->
          {#if thisWeek}
            <div class="card {loading ? 'opacity-60' : ''} transition-opacity">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="flex items-center gap-1.5 text-sm font-semibold text-strong"><Trophy class="h-4 w-4 text-accent" /> This week</h2>
                <span class="text-[11px] text-muted">as of {thisWeek.asOf}</span>
              </div>

              <p class="mt-2 text-xs text-muted">Strongest right now, by the {activeStyle.label} rule</p>
              <div class="mt-1 flex flex-wrap gap-1.5">
                {#each thisWeek.leaders as row, i (row.coin)}
                  <span class="pill {i < r.params.top_n ? 'bg-mint/15 text-mint' : 'bg-edge text-muted'}">#{row.rank} {row.symbol}</span>
                {:else}
                  <span class="text-xs text-muted">Nothing is rising — this style would be sitting in cash.</span>
                {/each}
              </div>

              <div class="mt-3 grid gap-2 border-t border-edge/60 pt-3 text-xs sm:grid-cols-2">
                <div>
                  <p class="text-[11px] text-muted">Would be holding</p>
                  <p class="font-semibold text-strong">{thisWeek.holding.join(', ') || 'Cash'}</p>
                </div>
                <div>
                  <p class="text-[11px] text-muted">Last review{thisWeek.reviewed ? ` · ${thisWeek.reviewed}` : ''}</p>
                  <p class="flex flex-wrap items-center gap-1">
                    {#each thisWeek.left as s}<span class="pill bg-danger/15 text-danger">− {s}</span>{/each}
                    {#each thisWeek.entered as b}<span class="pill bg-mint/15 text-mint">+ {b}</span>{/each}
                    {#if !thisWeek.left.length && !thisWeek.entered.length}<span class="text-muted">No change</span>{/if}
                  </p>
                </div>
              </div>

              <p class="mt-3 text-[11px] leading-snug text-muted">
                This is where the rule points today, reviewed {cadence}. It describes recent strength — it is not a prediction or a recommendation to buy.
              </p>
            </div>
          {/if}

          {#if plain}
            <div class="card {loading ? 'opacity-60' : ''} transition-opacity">
              <p class="stat-label">What this rule did in the past</p>
              <p class="mt-1.5 text-base leading-snug text-strong">
                {plain.from} put into <span class="font-semibold text-accent">{activeStyle.label}</span> on {r.window.start}
                would be <span class="font-bold {tone(r.metrics.strategy.total_return_pct)}">{plain.ours}</span> today.
              </p>
              <p class="mt-1 text-sm text-muted">Bitcoin alone: <span class="font-semibold text-soft">{plain.btc}</span>.</p>

              <div class="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2">
                <p class="text-sm font-semibold text-warn">⚠️ At its worst it was down {plain.drop.toFixed(0)}%.</p>
                <p class="mt-0.5 text-xs text-warn/90">Could you have held on? Most people lose money by panicking out of a plan, not by picking the wrong one.</p>
              </div>

              <div class="mt-3 grid grid-cols-3 gap-3 border-t border-edge/60 pt-3 text-center">
                <div>
                  <p class="text-[11px] text-muted">Worst drop</p>
                  <p class="font-semibold text-danger">−{plain.drop.toFixed(0)}%</p>
                </div>
                <div>
                  <p class="text-[11px] text-muted">Ride</p>
                  <p class="font-semibold text-strong">{plain.ride}</p>
                </div>
                <div>
                  <p class="text-[11px] text-muted">Wins</p>
                  <p class="font-semibold text-strong">{plain.winsPer100 == null ? '—' : `${plain.winsPer100} of 100`}</p>
                </div>
              </div>

              <p class="mt-3 text-[11px] leading-snug text-muted">
                Past results, not a forecast. This is evidence that the rule has worked before — it is not a promise that it will work next.
              </p>
            </div>
          {/if}
        {/if}

        {#if r.warnings.length}
          <div class="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
            {#each r.warnings as w}<p class="flex items-start gap-1.5"><AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>{/each}
          </div>
        {/if}

        {#if mode === 'simple' && !showDetails}
          <button class="btn-ghost w-full justify-center text-xs" onclick={() => (showDetails = true)}>
            <ChevronDown class="h-3.5 w-3.5" /> See the details
          </button>
        {/if}

        {#if mode === 'custom' || showDetails}
        <div class="hero-card {loading ? 'opacity-60' : ''} transition-opacity">
          <p class="stat-label">Rotation vs holding BTC · {r.window.start} → {r.window.end} ({r.window.days} days)</p>
          <div class="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p class="text-[11px] text-muted">Rotation</p>
              <p class="text-2xl font-bold {tone(r.metrics.strategy.total_return_pct)}">{pct(r.metrics.strategy.total_return_pct)}</p>
              <p class="text-xs text-muted">{money(cash)} → {money(r.metrics.strategy.final_equity)}</p>
            </div>
            <div>
              <p class="text-[11px] text-muted">Hold BTC</p>
              <p class="text-2xl font-bold {tone(r.metrics.btc.total_return_pct)}">{pct(r.metrics.btc.total_return_pct)}</p>
              <p class="text-xs text-muted">{money(cash)} → {money(r.metrics.btc.final_equity)}</p>
            </div>
            <div class="col-span-2 flex items-center sm:col-span-1">
              <span class="pill {edge >= 0 ? 'bg-mint/15 text-mint' : 'bg-danger/15 text-danger'}">
                {edge >= 0 ? 'Beat' : 'Trailed'} BTC by {Math.abs(edge).toFixed(1)} pts
              </span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-strong">Portfolio value</h2>
            <label class="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" class="accent-mint" bind:checked={logScale} /> Log scale</label>
          </div>
          <EChart option={equityOption} height={340} />
        </div>

        <div class="grid gap-3 xl:grid-cols-2">
          <div class="card overflow-x-auto p-0">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
                  <th class="px-3 py-2">Metric</th><th class="px-3 py-2" style="color:{colors.rot}">Rotation</th><th class="px-3 py-2" style="color:{colors.btc}">Hold BTC</th>
                </tr>
              </thead>
              <tbody>
                {#each comparison as row}
                  <tr class="border-b border-edge/60 last:border-0">
                    <td class="px-3 py-2 text-muted">{row.label}</td>
                    <td class="px-3 py-2 font-semibold {row.ta ?? 'text-strong'}">{row.a}</td>
                    <td class="px-3 py-2 font-semibold {row.tb ?? 'text-soft'}">{row.b}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <div class="card grid grid-cols-2 content-start gap-3 text-sm">
            <div><p class="text-[11px] text-muted">Trades</p><p class="font-semibold text-strong">{r.stats.trades}</p></div>
            <div><p class="text-[11px] text-muted">Win rate</p><p class="font-semibold text-strong">{r.stats.win_rate_pct == null ? '—' : `${r.stats.win_rate_pct.toFixed(0)}%`}</p></div>
            <div><p class="text-[11px] text-muted">Average trade</p><p class="font-semibold {tone(r.stats.avg_trade_pct)}">{pct(r.stats.avg_trade_pct)}</p></div>
            <div><p class="text-[11px] text-muted">Average hold</p><p class="font-semibold text-strong">{r.stats.avg_hold_days == null ? '—' : `${Math.round(r.stats.avg_hold_days)} days`}</p></div>
            <div><p class="text-[11px] text-muted">Best / worst trade</p><p class="font-semibold"><span class="text-mint">{pct(r.stats.best_trade_pct, 0)}</span> / <span class="text-danger">{pct(r.stats.worst_trade_pct, 0)}</span></p></div>
            <div><p class="text-[11px] text-muted">Fees paid</p><p class="font-semibold text-strong">{money(r.stats.total_fees)}</p></div>
            <div><p class="text-[11px] text-muted">Average invested</p><p class="font-semibold text-strong">{r.stats.exposure_pct.toFixed(0)}%</p></div>
            <div><p class="text-[11px] text-muted">Rebalances</p><p class="font-semibold text-strong">{r.stats.rebalances}</p></div>
          </div>
        </div>

        <div class="card">
          <h2 class="mb-2 text-sm font-semibold text-strong">Drawdown from peak</h2>
          <EChart option={drawdownOption} height={220} />
        </div>

        <div class="grid gap-3 xl:grid-cols-2">
          <div class="card p-0">
            <div class="border-b border-edge px-4 py-3">
              <h2 class="text-sm font-semibold text-strong">Held on {r.window.end}</h2>
              <p class="text-[11px] text-muted">What the rotation held on the last day of the test, before the closing sale.</p>
            </div>
            {#if r.final_holdings.length}
              <ul class="divide-y divide-edge/60">
                {#each r.final_holdings as h}
                  <li class="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span class="font-semibold text-strong">{h.symbol}</span>
                    <span class="text-xs text-muted">since {h.entry_date} · {h.weight_pct.toFixed(0)}% of portfolio</span>
                    <span class="font-semibold {tone(h.return_pct)}">{pct(h.return_pct)}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="px-4 py-3 text-sm text-muted">All cash — no coin passed the filter.</p>
            {/if}
          </div>

          <div class="card overflow-x-auto p-0">
            <div class="border-b border-edge px-4 py-3">
              <h2 class="text-sm font-semibold text-strong">Strength ranking on {r.window.end}</h2>
              <p class="text-[11px] text-muted">Rotation score on that day — describes recent strength, not a forecast.</p>
            </div>
            <table class="w-full text-sm">
              <tbody>
                {#each r.final_ranking as row}
                  <tr class="border-b border-edge/60 last:border-0 {row.in_hold_band ? '' : 'opacity-60'}">
                    <td class="w-10 px-3 py-1.5 font-mono text-xs text-muted">#{row.rank}</td>
                    <td class="px-1 py-1.5"><span class="font-semibold text-strong">{row.symbol}</span> <span class="text-xs text-muted">{row.name}</span></td>
                    <td class="px-3 py-1.5 text-right font-mono text-xs {tone(row.score)}">
                      {r.score_unit === '%' ? pct(row.score) : row.score.toFixed(2)}
                    </td>
                    <td class="whitespace-nowrap px-3 py-1.5 text-right">
                      {#if heldIds.has(row.coin)}<span class="pill bg-mint/15 text-mint">held</span>{/if}
                      {#if row.in_hold_band}<span class="pill bg-accent/15 text-accent">in band</span>{/if}
                    </td>
                  </tr>
                {:else}
                  <tr><td class="px-4 py-3 text-sm text-muted">No coin passes the filter on this day.</td></tr>
                {/each}
              </tbody>
            </table>
            {#if heldOutsideBand.length}
              <p class="border-t border-edge px-4 py-2 text-[11px] text-muted">
                Holdings are only reviewed on rebalance days ({cadence}). {heldOutsideBand.join(', ')}
                {heldOutsideBand.length === 1 ? 'is' : 'are'} held but now outside the top {r.params.worst_rank_held}, so the next review would sell
                {heldOutsideBand.length === 1 ? 'it' : 'them'}.
              </p>
            {/if}
          </div>
        </div>

        <div class="card p-0">
          <div class="border-b border-edge px-4 py-3"><h2 class="flex items-center gap-1.5 text-sm font-semibold text-strong"><ArrowRightLeft class="h-4 w-4 text-accent" /> Rotation log</h2></div>
          <ul class="max-h-72 divide-y divide-edge/60 overflow-y-auto">
            {#each recentEvents as e}
              <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
                <span class="font-mono text-muted">{e.date}</span>
                {#each e.sold as s}<span class="pill bg-danger/15 text-danger">− {s}</span>{/each}
                {#each e.bought as b}<span class="pill bg-mint/15 text-mint">+ {b}</span>{/each}
                <span class="text-muted">holding {e.held.join(', ') || 'cash'}</span>
              </li>
            {:else}
              <li class="px-4 py-3 text-sm text-muted">No trades in this window.</li>
            {/each}
          </ul>
        </div>

        <div class="card overflow-x-auto p-0">
          <div class="flex items-center justify-between border-b border-edge px-4 py-3">
            <h2 class="text-sm font-semibold text-strong">Trades ({r.trades.length})</h2>
            {#if r.trades.length > 25}
              <button class="btn-ghost text-xs" onclick={() => (showAllTrades = !showAllTrades)}>{showAllTrades ? 'Show fewer' : 'Show all'}</button>
            {/if}
          </div>
          <table class="w-full min-w-[560px] text-sm">
            <thead>
              <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
                <th class="px-3 py-2">Coin</th><th class="px-3 py-2">Bought</th><th class="px-3 py-2">Sold</th><th class="px-3 py-2">Days</th><th class="px-3 py-2">Return</th><th class="px-3 py-2">Why sold</th>
              </tr>
            </thead>
            <tbody>
              {#each tradesShown as t}
                <tr class="border-b border-edge/60 last:border-0">
                  <td class="px-3 py-1.5 font-semibold text-strong">{t.symbol}</td>
                  <td class="px-3 py-1.5 font-mono text-xs text-muted">{t.entry_date}</td>
                  <td class="px-3 py-1.5 font-mono text-xs text-muted">{t.exit_date}</td>
                  <td class="px-3 py-1.5 text-muted">{t.hold_days}</td>
                  <td class="px-3 py-1.5 font-semibold {tone(t.return_pct)}">{pct(t.return_pct)}</td>
                  <td class="px-3 py-1.5 text-xs text-muted">{REASON[t.exit_reason]}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if mode === 'simple'}
          <button class="btn-ghost w-full justify-center text-xs" onclick={() => (showDetails = false)}>Hide the details</button>
        {/if}
        {/if}

        <div class="card">
          <p class="flex items-center gap-1.5 stat-label"><Info class="h-3.5 w-3.5" /> How this backtest works</p>
          <ul class="mt-2 space-y-1 text-xs leading-relaxed text-muted">
            {#each r.assumptions as a}<li class="flex items-start gap-1.5"><span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted"></span>{a}</li>{/each}
          </ul>
          <p class="mt-2 text-[11px] text-muted">Prices as of {r.data_as_of}.</p>
        </div>

        <div class="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs font-medium text-warn">{r.disclaimer}</div>
        <Disclaimer compact />
      {/if}
    </div>
  </div>
{/if}
