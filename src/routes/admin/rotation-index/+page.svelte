<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { RefreshCw, Repeat, CalendarClock, ListChecks, Wallet } from '@lucide/svelte';
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

  // What the rotation bot's Binance sleeve holds — a snapshot the bot saves after
  // every real run (the trading key never leaves the machine that runs the bot).
  interface BotTrade { at: string; side: 'BUY' | 'SELL'; coin: string; symbol: string; qty: string; usdt: number; reason: string }
  interface BotSnapshot {
    mode: 'live' | 'testnet';
    taken_at: string;
    follow: string | null;
    style: string;
    started: boolean;
    started_on: string | null;
    budget_usdt: number;
    cash_usdt: number;
    equity_usdt: number | null;
    return_pct: number | null;
    positions: { coin: string; asset: string; qty: string; price: number | null; value_usdt: number | null; cost_usdt: number; return_pct: number | null; entry_date: string }[];
    dust: Record<string, string>;
    status: string;
    index: { id: string; date: string } | null;
    next_review: string | null;
    spot: { total_usdt: number; assets: { asset: string; free: number; locked: number; value_usdt: number | null }[]; more: number } | null;
    trades: BotTrade[];
  }
  interface BotMode { latest: BotSnapshot; history: { date: string; equity_usdt: number }[] }
  interface BotView { table_missing: boolean; live: BotMode | null; testnet: BotMode | null }

  let view = $state<View | null>(null);
  let bot = $state<BotView | null>(null);
  let botMode = $state<'live' | 'testnet'>('live');
  let botModePicked = false;
  /** The Spot list shows the biggest few until asked for the rest. */
  const SPOT_SHOWN = 8;
  let showAllSpot = $state(false);
  let loading = $state(true);
  let updating = $state(false);
  let error = $state('');
  let notice = $state('');

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    try {
      const [v, b] = await Promise.all([
        api<View>('/admin/rotation-index', { auth: true }),
        // The card is optional: an older backend without the route just hides it.
        api<BotView>('/admin/rotation-index/bot', { auth: true }).catch(() => null)
      ]);
      view = v;
      bot = b;
      if (b && !botModePicked) botMode = b.live || !b.testnet ? 'live' : 'testnet';
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

  const usd = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const amount = (q: string | number) => Number(q).toLocaleString('en-US', { maximumFractionDigits: 8 });
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pickMode = (m: 'live' | 'testnet') => {
    botMode = m;
    botModePicked = true;
  };

  const sleeve = $derived(bot?.[botMode] ?? null);
  /** Coins worth less than this are grouped as small leftovers. */
  const DUST_USDT = 1;
  const botCoins = $derived(new Set(sleeve?.latest.positions.map((p) => p.asset) ?? []));
  /** The Spot wallet as a portfolio: share of each coin, small leftovers grouped, a bar of the biggest. */
  const wallet = $derived.by(() => {
    const sp = sleeve?.latest.spot;
    if (!sp) return null;
    const total = sp.total_usdt;
    const share = (v: number | null) => (v == null || !(total > 0) ? null : (v / total) * 100);
    const main = sp.assets.filter((x) => (x.value_usdt ?? 0) >= DUST_USDT).map((x) => ({ ...x, share: share(x.value_usdt) }));
    const small = sp.assets.filter((x) => (x.value_usdt ?? 0) < DUST_USDT);
    const smallValue = small.reduce((sum, x) => sum + (x.value_usdt ?? 0), 0);
    const palette = $categorical;
    const top = main.slice(0, 6);
    const segments = top.map((x, i) => ({ label: x.asset, share: x.share ?? 0, color: palette[i % palette.length] }));
    const rest = 100 - segments.reduce((sum, g) => sum + g.share, 0);
    if (total > 0 && rest >= 0.5) segments.push({ label: 'Other', share: rest, color: 'rgb(var(--c-edge))' });
    return {
      total,
      usdtFree: sp.assets.find((x) => x.asset === 'USDT')?.free ?? 0,
      main,
      small,
      smallValue,
      more: sp.more,
      // Only worth drawing when at least one coin is bigger than a leftover.
      segments: total > 0 && main.length ? segments : []
    };
  });
  /** The index over the sleeve's own days, to compare like with like. */
  const indexSameDays = $derived.by(() => {
    const from = sleeve?.latest.started_on;
    const s = view?.series ?? [];
    if (!from || !s.length) return null;
    const start = s.find((p) => p.date >= from);
    const end = s[s.length - 1];
    if (!start) return null;
    return { pct: (end.nav / start.nav - 1) * 100, from: start.date, to: end.date };
  });

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

  const DAY_MS = 86_400_000;

  const sleeveChart = $derived.by(() => {
    const h = sleeve?.history ?? [];
    if (h.length < 2) return {};
    return {
      backgroundColor: 'transparent',
      useUTC: true,
      grid: grid({ top: 12, right: 20 }),
      tooltip: axisTooltip({
        valueFormatter: (v: number) => `${usd(v)} USDT`,
        axisPointer: { label: { formatter: ({ value }: { value: number }) => dayLabel(value) } }
      }),
      xAxis: timeAxis({ splitLine: { show: false }, minInterval: DAY_MS, axisLabel: { formatter: dayLabel, hideOverlap: true } }),
      yAxis: valueAxis({ scale: true, axisLabel: { formatter: (v: number) => v.toFixed(0) } }),
      series: [lineSeries({ name: 'Sleeve value', color: colors.rot, width: 2, data: h.map((p) => [ts(p.date), p.equity_usdt]) })]
    };
  });
  const dayLabel = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const chartOption = $derived.by(() => {
    const s = view?.series ?? [];
    if (s.length < 2) return {};
    // Early on the three lines sit within a point of each other, so whole numbers
    // would print "100" on every gridline: show as many decimals as the spread needs.
    const values = s.flatMap((p) => [p.nav, p.btc, p.top10]);
    const spread = Math.max(...values) - Math.min(...values);
    const digits = spread < 1 ? 2 : spread < 10 ? 1 : 0;
    return {
      backgroundColor: 'transparent',
      // One value per day at 00:00 UTC: lay the date axis out in UTC so ticks land on the days.
      useUTC: true,
      grid: grid({ top: 30, right: 28 }),
      legend: { data: lines.map((l) => l.name), top: 0 },
      tooltip: axisTooltip({
        valueFormatter: (v: number) => v.toFixed(2),
        axisPointer: { label: { formatter: ({ value }: { value: number }) => dayLabel(value) } }
      }),
      dataZoom: [zoomInside()],
      xAxis: timeAxis({ splitLine: { show: false }, minInterval: DAY_MS, axisLabel: { formatter: dayLabel, hideOverlap: true, showMinLabel: true, showMaxLabel: true } }),
      yAxis: valueAxis({ scale: true, axisLabel: { formatter: (v: number) => v.toFixed(digits) } }),
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
    {#if bot}
      <!-- The owner's Binance account, from the snapshot the bot saves after each run. -->
      <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="flex items-center gap-1.5 text-sm font-semibold text-strong"><Wallet class="h-4 w-4 text-accent" /> Your Binance portfolio</h2>
          <div class="flex gap-1 text-xs">
            {#each [['live', 'Live'], ['testnet', 'Testnet']] as [m, label] (m)}
              <button
                class="pill {botMode === m ? (m === 'live' ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent') : 'bg-edge text-soft'}"
                onclick={() => pickMode(m as 'live' | 'testnet')}>{label}</button
              >
            {/each}
          </div>
        </div>

        {#if bot.table_missing}
          <p class="mt-2 text-sm text-soft">
            The snapshot table doesn't exist yet. Create it once by running <code class="rounded bg-panel-2 px-1.5 py-0.5 text-xs">backend/database/rotation-bot-snapshots.sql</code> in the Supabase SQL editor.
          </p>
        {:else if !sleeve}
          <p class="mt-2 text-sm text-muted">
            No {botMode} snapshot yet. Save one with <code class="rounded bg-panel-2 px-1.5 py-0.5 text-xs">npm run bot:rotation -- --mode {botMode} --snapshot</code> (reads balances, places no orders); every real bot run saves one too.
          </p>
        {:else}
          {@const s = sleeve.latest}
          <p class="mt-1 text-xs text-muted">Spot wallet as of {when(s.taken_at)} · {s.status}</p>

          {#if wallet}
            <!-- 1. Everything in the Spot wallet -->
            <div class="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p class="text-[11px] text-muted">Total value</p>
                <p class="text-3xl font-semibold text-strong">{usd(wallet.total)} <span class="text-sm font-normal text-muted">USDT</span></p>
              </div>
              <div class="text-right">
                <p class="text-[11px] text-muted">USDT free to spend</p>
                <p class="text-lg font-semibold text-strong">{usd(wallet.usdtFree)}</p>
              </div>
            </div>

            {#if wallet.segments.length}
              <div class="mt-3 flex h-2.5 w-full overflow-hidden rounded-sm bg-panel-2">
                {#each wallet.segments as g (g.label)}
                  <span class="h-full" style="width:{g.share}%; background:{g.color}" title="{g.label} {g.share.toFixed(1)}%"></span>
                {/each}
              </div>
              <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {#each wallet.segments as g (g.label)}
                  <span class="flex items-center gap-1 text-soft"><span class="inline-block h-2 w-2 rounded-sm" style="background:{g.color}"></span>{g.label} {g.share.toFixed(1)}%</span>
                {/each}
              </div>
            {/if}

            {#if wallet.main.length}
              <table class="mt-3 w-full text-sm">
                <thead>
                  <tr class="text-left text-[11px] text-muted"><th class="py-1 font-medium">Coin</th><th class="py-1 text-right font-medium">Amount</th><th class="py-1 text-right font-medium">Value (USDT)</th><th class="py-1 text-right font-medium">Share</th></tr>
                </thead>
                <tbody>
                  {#each showAllSpot ? wallet.main : wallet.main.slice(0, SPOT_SHOWN) as b (b.asset)}
                    <tr class="border-t border-edge/60">
                      <td class="py-1.5 font-semibold text-strong">
                        {b.asset}{#if botCoins.has(b.asset)}<span class="ml-1.5 rounded-sm bg-accent/15 px-1 py-px text-[10px] font-medium text-accent">bot</span>{/if}
                        {#if b.locked > 0}<span class="ml-1 text-[11px] font-normal text-muted">({amount(b.locked)} in orders)</span>{/if}
                      </td>
                      <td class="py-1.5 text-right text-soft">{amount(b.free + b.locked)}</td>
                      <td class="py-1.5 text-right text-strong">{usd(b.value_usdt)}</td>
                      <td class="py-1.5 text-right text-soft">{b.share == null ? '—' : `${b.share.toFixed(1)}%`}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if wallet.main.length > SPOT_SHOWN}
                <button class="mt-1 text-[11px] font-medium text-accent hover:underline" onclick={() => (showAllSpot = !showAllSpot)}>
                  {showAllSpot ? 'Show fewer' : `Show all ${wallet.main.length}`}
                </button>
              {/if}
            {:else}
              <p class="mt-3 text-sm text-soft">No coin worth {DUST_USDT} USDT or more — the wallet holds only small leftovers.</p>
            {/if}

            {#if wallet.small.length}
              <details class="mt-2 text-xs">
                <summary class="cursor-pointer text-muted">
                  {wallet.small.length} small balance{wallet.small.length === 1 ? '' : 's'} under {DUST_USDT} USDT, about {usd(wallet.smallValue)} USDT in all{wallet.more ? ` (+ ${wallet.more} not listed)` : ''}
                </summary>
                <p class="mt-1 leading-relaxed text-soft">
                  {#each wallet.small as b, i (b.asset)}{i ? ' · ' : ''}{b.asset} {amount(b.free + b.locked)}{b.value_usdt == null ? '' : ` (${usd(b.value_usdt)})`}{/each}
                </p>
              </details>
            {/if}
            <p class="mt-2 text-[11px] text-muted">Spot wallet only — Funding and Earn are not included. Coins marked <span class="text-accent">bot</span> are the bot's; it never touches the rest.</p>
          {/if}

          <!-- 2. The bot's part of it -->
          <div class="mt-4 border-t border-edge/60 pt-3">
            <h3 class="text-xs font-semibold text-strong">Bot sleeve · {s.follow ? 'copies the Rotation Index' : `runs the ${s.style} rule`}</h3>
            {#if s.started}
              <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <div>
                  <p class="text-[11px] text-muted">Sleeve value</p>
                  <p class="text-lg font-semibold text-strong">{usd(s.equity_usdt)} <span class="text-xs font-normal text-muted">USDT</span></p>
                </div>
                <div>
                  <p class="text-[11px] text-muted">On the {usd(s.budget_usdt)} budget</p>
                  <p class="text-lg font-semibold {tone(s.return_pct)}">{pct(s.return_pct, 2)}</p>
                </div>
                <div>
                  <p class="text-[11px] text-muted">Index, same days</p>
                  <p class="text-lg font-semibold {tone(indexSameDays?.pct)}">{pct(indexSameDays?.pct, 2)}</p>
                </div>
                <div>
                  <p class="text-[11px] text-muted">Cash in the sleeve</p>
                  <p class="text-lg font-semibold text-strong">{usd(s.cash_usdt)} <span class="text-xs font-normal text-muted">USDT</span></p>
                </div>
              </div>
              {#if s.positions.length}
                <table class="mt-3 w-full text-sm">
                  <thead>
                    <tr class="text-left text-[11px] text-muted"><th class="py-1 font-medium">Coin</th><th class="py-1 text-right font-medium">Amount</th><th class="py-1 text-right font-medium">Value (USDT)</th><th class="py-1 text-right font-medium">Since entry</th><th class="hidden py-1 text-right font-medium sm:table-cell">Bought</th></tr>
                  </thead>
                  <tbody>
                    {#each s.positions as p (p.coin)}
                      <tr class="border-t border-edge/60">
                        <td class="py-1.5 font-semibold text-strong">{p.asset}</td>
                        <td class="py-1.5 text-right text-soft">{amount(p.qty)}</td>
                        <td class="py-1.5 text-right text-soft">{usd(p.value_usdt)}</td>
                        <td class="py-1.5 text-right {tone(p.return_pct)}">{pct(p.return_pct)}</td>
                        <td class="hidden py-1.5 text-right text-xs text-muted sm:table-cell">{niceDate(p.entry_date)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <p class="mt-2 text-xs text-muted">No coins held — the sleeve is all cash.</p>
              {/if}
              {#if sleeve.history.length >= 2}
                <div class="mt-3"><EChart option={sleeveChart} height={180} /></div>
              {/if}
            {:else}
              <p class="mt-1 text-sm text-soft">
                Not started. It will spend up to {usd(s.budget_usdt)} USDT on the index's coins{wallet && wallet.usdtFree < s.budget_usdt ? ` — add USDT to Spot first (${usd(wallet.usdtFree)} free now)` : ''}.
              </p>
            {/if}
          </div>

          {#if s.trades.length}
            <div class="mt-4 border-t border-edge/60 pt-3">
              <h3 class="text-xs font-semibold text-strong">Recent bot orders</h3>
              <div class="mt-1 space-y-0.5 text-xs">
                {#each s.trades.slice(0, 8) as t (t.at + t.symbol + t.side)}
                  <p class="text-soft">
                    <span class="text-muted">{when(t.at)}</span>
                    <span class={t.side === 'BUY' ? 'text-mint' : 'text-danger'}>{t.side === 'BUY' ? 'Bought' : 'Sold'}</span>
                    {amount(t.qty)} {t.symbol.replace(/USDT$/, '')} for {usd(t.usdt)} USDT · <span class="text-muted">{t.reason}</span>
                  </p>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/if}

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
