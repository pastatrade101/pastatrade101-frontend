<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { RefreshCw, Repeat, CalendarClock, ListChecks } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import EChart from '$lib/components/EChart.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import { axisTooltip, categorical, grid, lineSeries, timeAxis, valueAxis, zoomInside } from '$lib/charts/presets';

  interface Meta {
    id: string;
    label: string;
    style: { key: string; label: string; universe_size: number; top_n: number; worst_rank_held: number; rebalance_days: number; signal: string; lookback_days: number };
    fee_pct: number;
    base: number;
    top10_size: number;
    top10_rebalance_days: number;
  }
  interface Review {
    date: string;
    keep: string[];
    sells: { symbol: string; reason: string }[];
    adds: string[];
    ranking: { symbol: string; rank: number; score: number }[];
    fills: { side: 'BUY' | 'SELL'; symbol: string; price: number; value: number; reason: string }[];
  }
  interface View {
    index: Meta;
    started: boolean;
    table_missing?: boolean;
    start_date?: string;
    first_fill?: string | null;
    last_date?: string;
    days?: number;
    tradable_as_of?: string | null;
    latest?: {
      nav: number;
      btc: number;
      top10: number;
      return_pct: number;
      btc_return_pct: number;
      top10_return_pct: number;
      max_drawdown_pct: number;
      btc_max_drawdown_pct: number;
      top10_max_drawdown_pct: number;
    };
    holdings?: { coin: string; symbol: string; name: string; image: string | null; entry_date: string; weight_pct: number; return_pct: number }[];
    cash_pct?: number;
    top10?: { symbol: string; weight_pct: number }[];
    pending?: { decided: string; sells: { symbol: string; reason: string }[]; adds: string[] } | null;
    last_review?: string | null;
    next_review?: string | null;
    series?: { date: string; nav: number; btc: number; top10: number }[];
    reviews?: Review[];
  }

  let view = $state<View | null>(null);
  let loading = $state(true);
  let updating = $state(false);
  let error = $state('');
  let notice = $state('');

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    try {
      view = await api<View>('/admin/rotation-index', { auth: true });
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load the index.';
    } finally {
      loading = false;
    }
  };
  onMount(load);

  const update = async () => {
    updating = true;
    notice = '';
    try {
      const r = await api<{ added: number; to: string | null }>('/admin/rotation-index/update', { auth: true, method: 'POST' });
      notice = r.added ? `Added ${r.added} day(s), up to ${niceDate(r.to)}.` : 'Already up to date — the next day is added once its closing price is final.';
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Update failed.';
    } finally {
      updating = false;
    }
  };

  const niceDate = (d: string | null | undefined) =>
    d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
  const pct = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`);
  const tone = (n: number | null | undefined) => (n == null ? 'text-muted' : n >= 0 ? 'text-mint' : 'text-danger');
  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const price = (p: number) => (p >= 100 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toPrecision(3));

  // Rotation in blue and BTC in amber, as in the Rotation Lab; the top-10 index in green.
  const colors = $derived({ rot: $categorical[1], btc: $categorical[0], top: $categorical[2] });

  const lines = $derived(
    view?.latest
      ? [
          { key: 'rot', name: 'Rotation index', value: view.latest.nav, ret: view.latest.return_pct, dd: view.latest.max_drawdown_pct, color: colors.rot },
          { key: 'btc', name: 'Hold BTC', value: view.latest.btc, ret: view.latest.btc_return_pct, dd: view.latest.btc_max_drawdown_pct, color: colors.btc },
          { key: 'top', name: `Top ${view.index.top10_size} by market cap`, value: view.latest.top10, ret: view.latest.top10_return_pct, dd: view.latest.top10_max_drawdown_pct, color: colors.top }
        ]
      : []
  );

  const chartOption = $derived.by(() => {
    const s = view?.series ?? [];
    if (s.length < 2) return {};
    return {
      backgroundColor: 'transparent',
      grid: grid({ top: 30, right: 16 }),
      legend: { data: lines.map((l) => l.name), top: 0 },
      tooltip: axisTooltip({ valueFormatter: (v: number) => v.toFixed(2) }),
      dataZoom: [zoomInside()],
      xAxis: timeAxis({ splitLine: { show: false } }),
      yAxis: valueAxis({ scale: true, axisLabel: { formatter: (v: number) => v.toFixed(0) } }),
      series: [
        lineSeries({ name: lines[0].name, color: colors.rot, width: 2, data: s.map((p) => [ts(p.date), p.nav]) }),
        lineSeries({ name: lines[1].name, color: colors.btc, width: 1.6, data: s.map((p) => [ts(p.date), p.btc]) }),
        lineSeries({ name: lines[2].name, color: colors.top, width: 1.6, dashed: true, data: s.map((p) => [ts(p.date), p.top10]) })
      ]
    };
  });
</script>

<svelte:head><title>Rotation Index · Admin · Pastatrade</title></svelte:head>

<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
  <div>
    <h1 class="flex items-center gap-2 text-xl font-semibold text-strong"><Repeat class="h-5 w-5 text-accent" /> Admin · Rotation Index</h1>
    <p class="mt-1 max-w-2xl text-sm text-muted">
      The {view?.index.style.label ?? 'Balanced'} rotation rule tracked forward on paper. Each review picks from the coins that are biggest on that day, and its decisions are saved and never recalculated — so unlike the backtest, nothing here benefits from hindsight. Private to admins.
    </p>
  </div>
  {#if view?.started}
    <button class="btn-ghost text-sm" disabled={updating} onclick={update}>
      <RefreshCw class="h-4 w-4 {updating ? 'animate-spin' : ''}" /> Update now
    </button>
  {/if}
</header>

{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-sm text-danger">{error}</div>{/if}
{#if notice}<div class="card mb-4 text-sm text-soft">{notice}</div>{/if}

{#if loading}
  <div class="card text-sm text-muted">Loading the index…</div>
{:else if view && !view.started}
  <div class="card space-y-2 text-sm text-soft">
    {#if view.table_missing}
      <p class="font-semibold text-strong">The index's table does not exist yet.</p>
      <p>Create it once with <code class="rounded bg-panel-2 px-1.5 py-0.5 text-xs">backend/database/rotation-index.sql</code>, then start the index.</p>
    {:else}
      <p class="font-semibold text-strong">The index has not been started.</p>
    {/if}
    <p>Start it once from the backend folder with <code class="rounded bg-panel-2 px-1.5 py-0.5 text-xs">npm run index:rotation -- --start</code>. After that, every price sync adds the new day on its own.</p>
  </div>
{:else if view?.latest}
  {@const v = view}
  <div class="space-y-4">
    <!-- The three lines side by side; all start at the same base on the first fill day. -->
    <div class="grid gap-3 sm:grid-cols-3">
      {#each lines as l (l.key)}
        <div class="card">
          <p class="flex items-center gap-1.5 text-xs font-medium text-muted"><span class="inline-block h-2 w-2 rounded-full" style="background:{l.color}"></span>{l.name}</p>
          <p class="mt-1 text-2xl font-semibold text-strong">{l.value.toFixed(2)}</p>
          <p class="mt-0.5 text-xs"><span class={tone(l.ret)}>{pct(l.ret)}</span> <span class="text-muted">since start</span></p>
          <p class="text-xs text-muted">Worst drop so far <span class={l.dd < 0 ? 'text-danger' : 'text-muted'}>{l.dd.toFixed(1)}%</span></p>
        </div>
      {/each}
    </div>

    <div class="card">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-strong">Since {niceDate(v.start_date)}</h2>
        <span class="text-[11px] text-muted">{v.days} day{v.days === 1 ? '' : 's'} · prices up to {niceDate(v.last_date)} · all start at {v.index.base}</span>
      </div>
      {#if (v.series?.length ?? 0) >= 2}
        <EChart option={chartOption} height={300} />
      {:else}
        <p class="mt-3 rounded-lg bg-panel-2/60 px-3 py-6 text-center text-xs text-muted">
          Day 1. The first orders fill at the next day's close, and the chart fills in from there — one point a day, after each price sync.
        </p>
      {/if}
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="flex items-center gap-1.5 text-sm font-semibold text-strong"><ListChecks class="h-4 w-4 text-accent" /> Holding now</h2>
          <span class="pill bg-edge text-soft"><CalendarClock class="mr-1 inline h-3 w-3" />Next review {niceDate(v.next_review)}</span>
        </div>
        {#if v.holdings?.length}
          <table class="mt-2 w-full text-sm">
            <thead>
              <tr class="text-left text-[11px] text-muted"><th class="py-1 font-medium">Coin</th><th class="py-1 text-right font-medium">Weight</th><th class="py-1 text-right font-medium">Since entry</th><th class="py-1 text-right font-medium">Bought</th></tr>
            </thead>
            <tbody>
              {#each v.holdings as h (h.coin)}
                <tr class="border-t border-edge/60">
                  <td class="py-1.5"><span class="flex items-center gap-2">{#if h.image}<img src={h.image} alt="" class="h-4 w-4 rounded-full" />{/if}<span class="font-semibold text-strong">{h.symbol}</span></span></td>
                  <td class="py-1.5 text-right text-soft">{h.weight_pct.toFixed(1)}%</td>
                  <td class="py-1.5 text-right {tone(h.return_pct)}">{pct(h.return_pct)}</td>
                  <td class="py-1.5 text-right text-xs text-muted">{niceDate(h.entry_date)}</td>
                </tr>
              {/each}
              {#if (v.cash_pct ?? 0) >= 0.5}
                <tr class="border-t border-edge/60"><td class="py-1.5 text-muted">Cash</td><td class="py-1.5 text-right text-muted">{v.cash_pct?.toFixed(1)}%</td><td></td><td></td></tr>
              {/if}
            </tbody>
          </table>
        {:else}
          <p class="mt-2 text-xs text-muted">Nothing yet — all cash until the first orders fill.</p>
        {/if}

        {#if v.pending}
          <div class="mt-3 border-t border-edge/60 pt-3 text-xs">
            <p class="text-[11px] text-muted">Decided {niceDate(v.pending.decided)} · fills at the next day's close</p>
            <p class="mt-1 flex flex-wrap gap-1">
              {#each v.pending.sells as s}<span class="pill bg-danger/15 text-danger">− {s.symbol} · {s.reason}</span>{/each}
              {#each v.pending.adds as a}<span class="pill bg-mint/15 text-mint">+ {a}</span>{/each}
            </p>
          </div>
        {/if}
      </div>

      <div class="card">
        <h2 class="text-sm font-semibold text-strong">Top {v.index.top10_size} by market cap — the passive yardstick</h2>
        <p class="mt-1 text-xs text-muted">Weighted by market cap, reweighted every {v.index.top10_rebalance_days} days, same {v.index.fee_pct}% fee.</p>
        {#if v.top10?.length}
          <div class="mt-2 space-y-1">
            {#each v.top10 as t (t.symbol)}
              <div class="flex items-center gap-2 text-xs">
                <span class="w-12 font-semibold text-strong">{t.symbol}</span>
                <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2"><span class="block h-full rounded-full" style="width:{Math.min(100, t.weight_pct)}%; background:{colors.top}"></span></span>
                <span class="w-12 text-right text-soft">{t.weight_pct.toFixed(1)}%</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="mt-2 text-xs text-muted">Starts on the first fill day, together with the index.</p>
        {/if}
      </div>
    </div>

    <div class="card">
      <h2 class="text-sm font-semibold text-strong">Reviews</h2>
      <p class="mt-1 text-xs text-muted">Every {v.index.style.rebalance_days} days: keep coins still in the top {v.index.style.worst_rank_held}, sell the rest, fill free slots with the strongest coin not held.</p>
      <div class="mt-2 divide-y divide-edge/60">
        {#each v.reviews ?? [] as r (r.date)}
          <details class="py-2">
            <summary class="flex cursor-pointer flex-wrap items-center gap-1.5 text-xs">
              <span class="w-24 font-medium text-strong">{niceDate(r.date)}</span>
              {#each r.sells as s}<span class="pill bg-danger/15 text-danger">− {s.symbol}</span>{/each}
              {#each r.adds as a}<span class="pill bg-mint/15 text-mint">+ {a}</span>{/each}
              {#each r.keep as k}<span class="pill bg-edge text-soft">{k}</span>{/each}
              {#if !r.sells.length && !r.adds.length}<span class="text-muted">no change</span>{/if}
            </summary>
            <div class="mt-2 grid gap-3 pl-1 text-xs sm:grid-cols-2">
              <div>
                <p class="text-[11px] text-muted">Ranking that day ({v.index.style.signal}, {v.index.style.lookback_days} days)</p>
                <p class="mt-1 flex flex-wrap gap-1">{#each r.ranking as x}<span class="pill bg-edge text-soft">#{x.rank} {x.symbol} {pct(x.score, 0)}</span>{/each}</p>
              </div>
              <div>
                <p class="text-[11px] text-muted">Filled</p>
                {#each r.fills as f}
                  <p class="mt-0.5 text-soft"><span class={f.side === 'BUY' ? 'text-mint' : 'text-danger'}>{f.side === 'BUY' ? 'Bought' : 'Sold'}</span> {f.symbol} at {price(f.price)} · {f.value.toFixed(2)} pts{f.side === 'SELL' ? ` · ${f.reason}` : ''}</p>
                {:else}
                  <p class="mt-0.5 text-muted">{r.sells.length || r.adds.length ? 'Fills at the next day’s close.' : 'Nothing to fill.'}</p>
                {/each}
              </div>
            </div>
          </details>
        {/each}
      </div>
    </div>

    <ul class="list-disc space-y-1 pl-5 text-[11px] leading-snug text-muted">
      <li>Rule: {v.index.style.label} — top {v.index.style.universe_size} coins by market cap that Binance trades against USDT, ranked by {v.index.style.lookback_days}-day {v.index.style.signal}, {v.index.style.top_n} held at equal weight, reviewed every {v.index.style.rebalance_days} days. The same rule as the rotation bot.</li>
      <li>Orders are decided on the review day's close and filled at the next day's close, with a {v.index.fee_pct}% fee on every buy and sell. Slippage is not modelled.</li>
      <li>Closing prices are CoinGecko's 00:00 UTC prices. A day is added only once its price is final, so the newest point is usually yesterday.</li>
      <li>BTC and the top-{v.index.top10_size} index start on the first fill day ({niceDate(v.first_fill)}) at the same fee. Binance coin list as of {niceDate(v.tradable_as_of)}.</li>
    </ul>
    <Disclaimer compact />
  </div>
{/if}
