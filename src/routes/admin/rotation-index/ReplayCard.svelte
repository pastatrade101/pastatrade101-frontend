<script lang="ts">
  import { onMount } from 'svelte';
  import { FlaskConical, Play } from '@lucide/svelte';
  import { api } from '$lib/api';
  import EChart from '$lib/components/EChart.svelte';
  import { axisTooltip, categorical, grid, lineSeries, timeAxis, valueAxis, zoomInside } from '$lib/charts/presets';

  // Replays the index over a chosen period on past prices, with and without the stock
  // tokens, next to holding BTC and the top-10 index. A check only: nothing is saved.

  interface Props {
    topN: number;
    worstRankHeld: number;
    top10Size: number;
    rebalanceDays: number;
  }
  let { topN, worstRankHeld, top10Size, rebalanceDays }: Props = $props();

  interface Period {
    key: 'bull' | 'bear' | 'stocks' | 'recent';
    label: string;
    from: string;
    to: string;
    btc_pct: number;
  }
  interface Periods {
    min_from: string;
    max_to: string;
    periods: Period[];
  }
  interface Change {
    date: string;
    keep: string[];
    sells: { symbol: string; reason: string }[];
    adds: string[];
  }
  interface Holding {
    coin: string;
    symbol: string;
    weight_pct: number;
    return_pct: number;
  }
  interface Replay {
    from: string;
    to: string;
    days: number;
    reviews: number;
    stock_prices_fetched: string[];
    with_stocks: {
      latest: {
        return_pct: number;
        max_drawdown_pct: number;
        btc_return_pct: number;
        btc_max_drawdown_pct: number;
        top10_return_pct: number;
        top10_max_drawdown_pct: number;
      };
      holdings: Holding[];
      changes: Change[];
      stock_days: number;
      stock_in_band_reviews?: number;
      stock_symbols: string[];
      stock_first_prices?: { symbol: string; from: string | null }[];
    };
    crypto_only: {
      latest: { return_pct: number; max_drawdown_pct: number };
      holdings: Holding[];
      changes: Change[];
    };
    series: { date: string; nav: number; btc: number; top10: number; crypto_only: number | null }[];
    warnings: string[];
  }

  const TITLES: Record<Period['key'], string> = {
    bull: 'Good time (bull)',
    bear: 'Bad time (bear)',
    stocks: 'Since stock tokens',
    recent: 'Recent'
  };

  let periods = $state<Periods | null>(null);
  let periodsError = $state('');
  let from = $state('');
  let to = $state('');
  let running = $state(false);
  let runError = $state('');
  let result = $state<Replay | null>(null);

  const niceDate = (d: string | null | undefined) =>
    d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
  const shortDate = (d: string) => niceDate(d).replace(/\s\d{4}$/, '');
  const shownAs = (n: number, digits: number) => {
    const r = Math.round(n * 10 ** digits) / 10 ** digits;
    return r === 0 ? 0 : r;
  };
  const pct = (n: number | null | undefined, digits = 1) => {
    if (n == null) return '—';
    const r = shownAs(n, digits);
    return `${r > 0 ? '+' : ''}${r.toFixed(digits)}%`;
  };
  const tone = (n: number | null | undefined, digits = 1) => {
    if (n == null) return 'text-muted';
    const r = shownAs(n, digits);
    return r > 0 ? 'text-mint' : r < 0 ? 'text-danger' : 'text-soft';
  };
  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const dayLabel = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const sameYear = (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4);
  const range = (a: string, b: string) => `${sameYear(a, b) ? shortDate(a) : niceDate(a)} – ${niceDate(b)}`;

  onMount(async () => {
    try {
      periods = await api<Periods>('/admin/rotation-index/replay/periods', { auth: true, timeoutMs: 60_000 });
      const first = periods.periods.find((p) => p.key === 'bull') ?? periods.periods[0];
      if (first) {
        from = first.from;
        to = first.to;
      }
    } catch (e) {
      periodsError = e instanceof Error ? e.message : 'Could not load the periods.';
    }
  });

  const run = async (f = from, t = to) => {
    if (!f || !t || running) return;
    from = f;
    to = t;
    running = true;
    runError = '';
    try {
      const q = new URLSearchParams({ from: f, to: t });
      result = await api<Replay>(`/admin/rotation-index/replay?${q}`, { auth: true, timeoutMs: 120_000 });
    } catch (e) {
      runError = e instanceof Error ? e.message : 'The replay failed.';
    } finally {
      running = false;
    }
  };

  const activeKey = $derived(periods?.periods.find((p) => p.from === from && p.to === to)?.key ?? null);
  const shownKey = $derived(result ? (periods?.periods.find((p) => p.from === result!.from && p.to === result!.to)?.key ?? null) : null);

  // Index in blue, BTC in amber, top 10 in green (as in the chart above); crypto only in violet (red would read as a loss).
  const colors = $derived({ rot: $categorical[1], btc: $categorical[0], top: $categorical[2], crypto: $categorical[4] });

  const rows = $derived(
    result
      ? [
          { name: 'Index with stock tokens', ret: result.with_stocks.latest.return_pct, dd: result.with_stocks.latest.max_drawdown_pct, color: colors.rot },
          { name: 'Index, crypto only', ret: result.crypto_only.latest.return_pct, dd: result.crypto_only.latest.max_drawdown_pct, color: colors.crypto },
          { name: 'Hold BTC', ret: result.with_stocks.latest.btc_return_pct, dd: result.with_stocks.latest.btc_max_drawdown_pct, color: colors.btc },
          { name: `Top ${top10Size} by market cap`, ret: result.with_stocks.latest.top10_return_pct, dd: result.with_stocks.latest.top10_max_drawdown_pct, color: colors.top }
        ]
      : []
  );
  const best = $derived(rows.length ? Math.max(...rows.map((r) => shownAs(r.ret, 1))) : null);

  const stockNote = $derived.by(() => {
    if (!result) return '';
    const w = result.with_stocks;
    const band = w.stock_in_band_reviews ?? 0;
    const pushed = band
      ? `On ${band} review${band === 1 ? '' : 's'} a stock token ranked inside the top ${worstRankHeld}, which pushes a held coin one place down, so it can be sold sooner.`
      : '';
    if (w.stock_days > 0) return `A stock token was held on ${w.stock_days} of ${result.days} days. ${pushed}`.trim();
    const firsts = (w.stock_first_prices ?? []).map((x) => x.from).filter((d): d is string => !!d).sort();
    if (firsts.length && result.to < firsts[0]) return `No stock token yet: Binance prices for them start on ${niceDate(firsts[0])}. Both versions are the same here.`;
    const same = shownAs(w.latest.return_pct, 1) === shownAs(result.crypto_only.latest.return_pct, 1);
    if (same) return `No stock token ranked high enough to change anything, so both versions are the same.`;
    return `No stock token was bought (none made the top ${topN} when a slot was free). ${pushed || 'They still changed the ranking, so the coin picks differ.'}`;
  });

  const chartOption = $derived.by(() => {
    const s = result?.series ?? [];
    if (s.length < 2) return {};
    const values = s.flatMap((p) => [p.nav, p.btc, p.top10, p.crypto_only ?? p.nav]);
    const spread = Math.max(...values) - Math.min(...values);
    const digits = spread < 1 ? 2 : spread < 10 ? 1 : 0;
    return {
      backgroundColor: 'transparent',
      useUTC: true,
      // No legend: four long names don't fit a phone, and the dots on the result tiles above already name each line.
      grid: grid({ top: 36, right: 28 }),
      tooltip: axisTooltip({
        valueFormatter: (v: number) => (v == null ? '—' : v.toFixed(2)),
        axisPointer: { label: { formatter: ({ value }: { value: number }) => dayLabel(value) } }
      }),
      dataZoom: [zoomInside()],
      xAxis: timeAxis({ splitLine: { show: false }, minInterval: 86_400_000, axisLabel: { formatter: dayLabel, hideOverlap: true, showMinLabel: true, showMaxLabel: true } }),
      yAxis: valueAxis({ scale: true, axisLabel: { formatter: (v: number) => v.toFixed(digits) } }),
      series: [
        lineSeries({ name: rows[0].name, color: colors.rot, width: 2, z: 4, data: s.map((p) => [ts(p.date), p.nav]) }),
        lineSeries({ name: rows[1].name, color: colors.crypto, width: 1.6, z: 3, data: s.map((p) => [ts(p.date), p.crypto_only]) }),
        lineSeries({ name: rows[2].name, color: colors.btc, width: 1.6, data: s.map((p) => [ts(p.date), p.btc]) }),
        lineSeries({ name: rows[3].name, color: colors.top, width: 1.6, dashed: true, data: s.map((p) => [ts(p.date), p.top10]) })
      ]
    };
  });

  const isStock = (sym: string) => result?.with_stocks.stock_symbols.includes(sym) ?? false;
  const held = (h: Holding[]) => (h.length ? h.map((x) => x.symbol).join(', ') : 'cash');
</script>

<div class="card">
  <h2 class="flex items-center gap-1.5 text-sm font-semibold text-strong"><FlaskConical class="h-4 w-4 text-accent" /> Test a period</h2>
  <p class="mt-1 text-xs text-muted">
    Runs the same rule over a past period, twice: with the stock tokens and with coins only, next to holding BTC and the top {top10Size}. Nothing is saved.
  </p>

  {#if periodsError}
    <p class="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">{periodsError}</p>
  {:else if !periods}
    <p class="mt-3 rounded-lg bg-panel-2/60 px-3 py-4 text-center text-xs text-muted">Finding BTC's best and worst 90 days… (first load takes a few seconds)</p>
  {:else}
    <div class="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {#each periods.periods as p (p.key)}
        <button
          type="button"
          class="rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60 {activeKey === p.key ? 'border-accent bg-accent/10' : 'border-edge hover:border-accent/50 hover:bg-panel-2/60'}"
          disabled={running}
          onclick={() => run(p.from, p.to)}
        >
          <span class="block text-xs font-semibold text-strong">{TITLES[p.key]}</span>
          <span class="mt-0.5 block text-[11px] text-muted">{range(p.from, p.to)}</span>
          <span class="mt-0.5 block text-[11px] text-muted">BTC <span class={tone(p.btc_pct)}>{pct(p.btc_pct)}</span></span>
        </button>
      {/each}
    </div>

    <form
      class="mt-3 flex flex-wrap items-end gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <label class="flex min-w-[9.5rem] flex-1 flex-col gap-1 text-[11px] text-muted sm:flex-none">
        From
        <input type="date" class="input" min={periods.min_from} max={periods.max_to} bind:value={from} required />
      </label>
      <label class="flex min-w-[9.5rem] flex-1 flex-col gap-1 text-[11px] text-muted sm:flex-none">
        To
        <input type="date" class="input" min={periods.min_from} max={periods.max_to} bind:value={to} required />
      </label>
      <button type="submit" class="btn bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50" disabled={running || !from || !to}>
        <Play class="mr-1 inline h-3.5 w-3.5" />{running ? 'Running…' : 'Run'}
      </button>
    </form>
    <p class="mt-1 text-[11px] text-muted">Any period from {niceDate(periods.min_from)} to {niceDate(periods.max_to)}, at least {rebalanceDays + 1} days.</p>
  {/if}

  {#if runError}
    <p class="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">{runError}</p>
  {/if}

  {#if running && !result}
    <p class="mt-3 rounded-lg bg-panel-2/60 px-3 py-6 text-center text-xs text-muted">Replaying… about 5 seconds.</p>
  {/if}

  {#if result}
    <div class="mt-4 border-t border-edge/60 pt-3 {running ? 'opacity-50' : ''}">
      <p class="text-xs text-soft">
        {#if shownKey}<span class="font-semibold text-strong">{TITLES[shownKey]}:</span>{/if}
        {niceDate(result.from)} → {niceDate(result.to)} · {result.days} days · {result.reviews} reviews
      </p>

      <div class="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {#each rows as r (r.name)}
          <div class="rounded-lg bg-panel-2/60 px-3 py-2">
            <p class="flex items-center gap-1.5 text-[11px] text-muted"><span class="h-2 w-2 shrink-0 rounded-full" style="background:{r.color}"></span>{r.name}</p>
            <p class="mt-0.5 text-lg font-semibold {tone(r.ret)}">
              {pct(r.ret)}
              {#if best != null && shownAs(r.ret, 1) === best}<span class="pill ml-1 bg-mint/15 align-middle text-[10px] text-mint">best</span>{/if}
            </p>
            <p class="text-[11px] text-muted">Worst drop <span class={r.dd < 0 ? 'text-danger' : 'text-muted'}>{r.dd.toFixed(1)}%</span></p>
          </div>
        {/each}
      </div>

      <div class="mt-3">
        <EChart option={chartOption} height={300} />
      </div>

      <ul class="mt-2 space-y-1 text-xs text-soft">
        <li>{stockNote}</li>
        <li>
          Held at the end: <span class="text-strong">{held(result.with_stocks.holdings)}</span> with stock tokens{#if held(result.with_stocks.holdings) !== held(result.crypto_only.holdings)}; <span class="text-strong">{held(result.crypto_only.holdings)}</span> crypto only{/if}.
        </li>
      </ul>

      {#if result.with_stocks.changes.length}
        <details class="mt-3 rounded-lg border border-edge/60 px-3 py-2">
          <summary class="cursor-pointer text-xs font-medium text-strong">Reviews that changed something ({result.with_stocks.changes.length}, with stock tokens)</summary>
          <div class="mt-2 divide-y divide-edge/60">
            {#each result.with_stocks.changes as c (c.date)}
              <p class="flex flex-wrap items-center gap-1.5 py-1.5 text-xs">
                <span class="w-24 font-medium text-strong">{niceDate(c.date)}</span>
                {#each c.sells as s}<span class="pill bg-danger/15 text-danger">− {s.symbol}</span>{/each}
                {#each c.adds as a}<span class="pill {isStock(a) ? 'bg-accent/15 text-accent' : 'bg-mint/15 text-mint'}">+ {a}</span>{/each}
                {#each c.keep as k}<span class="pill bg-edge text-soft">{k}</span>{/each}
              </p>
            {/each}
          </div>
        </details>
      {/if}

      {#if result.warnings.length || result.stock_prices_fetched.length}
        <ul class="mt-2 list-disc space-y-0.5 pl-5 text-[11px] text-muted">
          {#if result.stock_prices_fetched.length}
            <li>Prices for {result.stock_prices_fetched.join(', ')} were read from Binance for this check only; the daily price sync saves them after the backend update.</li>
          {/if}
          {#each result.warnings as w}<li>{w}</li>{/each}
        </ul>
      {/if}
    </div>
  {/if}

  <p class="mt-3 text-[11px] leading-snug text-muted">
    Past prices, today's Binance coin list, decisions on each review day's close and fills at the next close with the same fee. It shows how the rule behaved, not what it will do next. The stock tokens only have prices from mid-2026, so earlier periods are coins only.
  </p>
</div>
