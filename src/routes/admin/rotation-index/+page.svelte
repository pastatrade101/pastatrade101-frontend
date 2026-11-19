<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ArrowDownLeft, ArrowUpRight, Bot, CalendarClock, ChartLine, Eye, ListChecks, Play, RefreshCw, Users, Wallet } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import EChart from '$lib/components/EChart.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import { axisTooltip, categorical, grid, lineSeries, timeAxis, valueAxis, zoomInside } from '$lib/charts/presets';
  import InvestorBooks from './InvestorBooks.svelte';

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

  // What the rotation bot's Binance sleeve holds. Read live from Binance by the
  // server (with its own key) while the page is open; the snapshot the bot saves
  // after every run is the fallback when Binance can't be read.
  interface BotTrade { at: string; side: 'BUY' | 'SELL'; coin: string; symbol: string; qty: string; usdt: number; reason: string }
  interface BotSnapshot {
    mode: 'live' | 'testnet';
    taken_at: string;
    follow: string | null;
    style: string;
    started: boolean;
    started_on: string | null;
    budget_usdt: number;
    top_ups?: { at: string; usdt: number }[];
    cash_usdt: number;
    equity_usdt: number | null;
    return_pct: number | null;
    positions: { coin: string; asset: string; qty: string; price: number | null; value_usdt: number | null; cost_usdt: number; return_pct: number | null; entry_date: string }[];
    dust: Record<string, string>;
    status: string;
    last_run?: { at: string; summary: string; by: 'cli' | 'admin' } | null;
    index: { id: string; date: string } | null;
    next_review: string | null;
    spot: { total_usdt: number; assets: { asset: string; free: number; locked: number; value_usdt: number | null }[]; more: number } | null;
    trades: BotTrade[];
    /** The investor books, once started (units outstanding and the unit price). */
    fund?: { started_at: string; units: number; unit_price: number | null; investors: number } | null;
  }
  interface BotMode { latest: BotSnapshot; history: { date: string; equity_usdt: number }[] }
  interface BotView { table_missing: boolean; live: BotMode | null; testnet: BotMode | null }
  type Mode = 'live' | 'testnet';
  interface LiveWallet {
    mode: Mode;
    fetched_at: string;
    keys: boolean;
    error: string | null;
    key: { withdrawals: boolean; ip_restricted: boolean; spot_trading: boolean } | null;
    snapshot: BotSnapshot | null;
    control: { can_trade: boolean; why_not: string | null; max_budget_usdt: number | null; running: boolean };
  }
  interface BotPlan { keep: string[]; sell: { asset: string; reason: string }[]; buy: { asset: string; usdt: number | null }[] }
  interface BotResult {
    ok: boolean;
    message?: string;
    outcome?: { kind: string; summary: string; plan: BotPlan | null };
    log: string[];
    wallet: LiveWallet | null;
  }

  let view = $state<View | null>(null);
  let bot = $state<BotView | null>(null);
  let botMode = $state<'live' | 'testnet'>('live');
  let botModePicked = false;
  /** The Spot list shows the biggest few until asked for the rest. */
  const SPOT_SHOWN = 8;
  let showAllSpot = $state(false);
  /** The account as the server reads it from Binance right now, per mode. */
  let liveWallets = $state<Record<Mode, LiveWallet | null>>({ live: null, testnet: null });
  let liveFailed = $state<Record<Mode, string>>({ live: '', testnet: '' });
  /** An older backend without the live route: keep showing saved snapshots only. */
  let liveUnsupported = $state(false);
  let liveLoading = $state(false);
  let nowTick = $state(Date.now());
  const POLL_MS = 10_000;
  /** What the bot buttons are doing, and what the last preview / run said. */
  let busy = $state<'preview' | 'check' | 'run' | null>(null);
  let result = $state<(BotResult & { mode: Mode; kind: 'preview' | 'check' | 'run'; topUp?: number }) | null>(null);
  let budgetInput = $state('');
  let budgetTouched = false;
  /** Adding USDT to a sleeve that has started. */
  let topUpInput = $state('');
  let topUpTouched = false;
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
  const dayMonth = (d: string) => niceDate(d).replace(/\s\d{4}$/, '');
  // Sign and colour follow the figure as shown, so -0.04 reads as a plain 0.0%, not a red one.
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
  const price = (p: number) => (p >= 100 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toPrecision(3));

  const usd = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const amount = (q: string | number) => Number(q).toLocaleString('en-US', { maximumFractionDigits: 8 });
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pickMode = (m: 'live' | 'testnet') => {
    botMode = m;
    botModePicked = true;
    budgetTouched = false;
    topUpTouched = false;
    if (result?.mode !== m) result = null;
  };

  const refreshLive = async (mode: Mode, fresh = false) => {
    if (liveUnsupported) return;
    liveLoading = true;
    try {
      liveWallets[mode] = await api<LiveWallet>(`/admin/rotation-index/bot/${mode}/live${fresh ? '?fresh=1' : ''}`, { auth: true, timeoutMs: 20_000 });
      liveFailed[mode] = '';
    } catch (e) {
      if (e instanceof Error && 'status' in e && (e as { status: number }).status === 404) liveUnsupported = true;
      else liveFailed[mode] = e instanceof Error ? e.message : 'Could not reach the server.';
    } finally {
      liveLoading = false;
    }
  };

  // Poll the account while the page is open and visible; switching tabs reads at once.
  $effect(() => {
    const mode = botMode;
    refreshLive(mode);
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible' && !busy) refreshLive(mode);
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refreshLive(mode);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });
  $effect(() => {
    const tick = setInterval(() => (nowTick = Date.now()), 1000);
    return () => clearInterval(tick);
  });

  /** Before the first run: the budget to start with — the cap, or the free USDT if that is less. */
  $effect(() => {
    if (budgetTouched || !shown || shown.started) return;
    const free = Math.floor(wallet?.usdtFree ?? 0);
    const cap = lw?.control.max_budget_usdt;
    const pick = botMode === 'live' ? Math.min(cap ?? free, free) : 1000;
    budgetInput = pick > 0 ? String(pick) : '';
  });
  const budgetBody = () => (shown && !shown.started && budgetInput ? { budget: Number(budgetInput) } : {});

  /** USDT in Spot that is not the sleeve's, and how much more the cap allows (live). */
  const topUpRoom = $derived.by(() => {
    if (!shown?.started || !wallet) return null;
    const outside = Math.max(0, wallet.usdtFree - shown.cash_usdt);
    const cap = lw?.control.max_budget_usdt ?? null;
    const capRoom = botMode === 'live' && cap != null ? Math.max(0, cap - shown.budget_usdt) : null;
    return { outside, capRoom, most: Math.floor(capRoom == null ? outside : Math.min(outside, capRoom)) };
  });
  /** Suggest adding what is free outside the sleeve, up to the cap (testnet: up to 1,000). */
  $effect(() => {
    if (topUpTouched || !topUpRoom) return;
    const pick = botMode === 'live' ? topUpRoom.most : Math.min(topUpRoom.most, 1000);
    topUpInput = pick >= 1 ? String(pick) : '';
  });
  const hasOrders = (r: BotResult | null) => !!r?.ok && r.outcome?.kind === 'preview' && !!(r.outcome.plan?.sell.length || r.outcome.plan?.buy.length);

  /** Preview: what a run would do now. "check" is the same, as the first step of Run. */
  const preview = async (kind: 'preview' | 'check', topUp?: number) => {
    const mode = botMode;
    busy = kind;
    result = null;
    try {
      const r = await api<BotResult>(`/admin/rotation-index/bot/${mode}/preview`, { auth: true, method: 'POST', body: topUp ? { topUp } : budgetBody() });
      result = { ...r, mode, kind, topUp };
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : 'Preview failed.', log: [], wallet: null, mode, kind, topUp };
    } finally {
      busy = null;
    }
  };

  /** Place the orders the check showed — only after the owner confirms them. */
  const run = async () => {
    const mode = botMode;
    busy = 'run';
    try {
      const plan = result?.outcome?.plan;
      const expect = { sell: plan?.sell.map((x) => x.asset) ?? [], buy: plan?.buy.map((x) => x.asset) ?? [] };
      const topUp = result?.topUp;
      const body = { ...(topUp ? { topUp } : budgetBody()), confirm: true, expect };
      const r = await api<BotResult>(`/admin/rotation-index/bot/${mode}/run`, { auth: true, method: 'POST', body });
      result = { ...r, mode, kind: 'run', topUp };
      if (r.wallet) liveWallets[mode] = r.wallet;
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : 'The run failed.', log: [], wallet: null, mode, kind: 'run' };
    } finally {
      busy = null;
      await Promise.all([load(), refreshLive(mode, true)]);
    }
  };

  const sleeve = $derived(bot?.[botMode] ?? null);
  const lw = $derived(liveWallets[botMode]);
  /** Live from Binance when the server could read it, else the last saved snapshot. */
  const shown = $derived(lw?.snapshot ?? sleeve?.latest ?? null);
  const isLive = $derived(!!lw?.snapshot);
  const secondsAgo = $derived(lw ? Math.max(0, Math.round((nowTick - Date.parse(lw.fetched_at)) / 1000)) : null);
  /** Coins worth less than this are grouped as small leftovers. */
  const DUST_USDT = 1;
  const botCoins = $derived(new Set(shown?.positions.map((p) => p.asset) ?? []));
  /** The Spot wallet as a portfolio: share of each coin, small leftovers grouped, a bar of the biggest. */
  const wallet = $derived.by(() => {
    const sp = shown?.spot;
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
    const from = shown?.started_on;
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

  /* ── Tabs: one job per screen instead of one long page ── */
  type Tab = 'bot' | 'investors' | 'wallet' | 'index';
  const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
    { id: 'bot', label: 'Bot', icon: Bot },
    { id: 'investors', label: 'Investors', icon: Users },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'index', label: 'Index', icon: ChartLine }
  ];
  const TAB_KEY = 'pastatrade_admin_rotation_tab';
  let tab = $state<Tab>('bot');
  onMount(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(TAB_KEY);
    } catch {
      /* private mode: start on Bot */
    }
    const want = fromUrl ?? saved;
    if (TABS.some((t) => t.id === want)) tab = want as Tab;
  });
  const pickTab = (t: Tab) => {
    tab = t;
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };
  // The investor books are read once, on the first visit to their tab.
  let booksSeen = $state(false);
  $effect(() => {
    if (tab === 'investors') booksSeen = true;
  });
  const booksReady = $derived(!!shown && !!lw && !liveUnsupported);
  const MODES = ['live', 'testnet'] as const;
  const agoText = $derived(secondsAgo == null ? '' : secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.round(secondsAgo / 60)} min ago`);
</script>

<svelte:head><title>Rotation Index · Admin · Pastatrade</title></svelte:head>

<header class="mb-4 flex flex-wrap items-end justify-between gap-3">
  <div class="min-w-0">
    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Admin</p>
    <h1 class="mt-0.5 text-2xl font-semibold tracking-tight text-strong">Rotation Index</h1>
    {#if view?.latest}
      <p class="mt-0.5 text-sm text-muted">{view.index.style.label} rule{view.next_review ? ` · next review ${niceDate(view.next_review)}` : ''}</p>
    {/if}
  </div>
  {#if view?.latest && tab !== 'index'}
    <div class="flex items-center gap-1 rounded-full bg-panel-2/80 p-1 text-xs font-medium" role="group" aria-label="Binance account">
      {#each MODES as m (m)}
        <button
          class="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition {botMode === m ? 'bg-panel text-strong shadow-sm' : 'text-muted hover:text-strong'}"
          aria-pressed={botMode === m}
          onclick={() => pickMode(m)}>
          <span class="h-1.5 w-1.5 rounded-full {m === 'live' ? 'bg-danger' : 'bg-accent'}"></span>{m === 'live' ? 'Live' : 'Testnet'}
        </button>
      {/each}
    </div>
  {/if}
</header>

{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-sm text-danger">{error}</div>{/if}
{#if notice}<div class="card mb-4 text-sm text-soft">{notice}</div>{/if}

{#snippet accountStatus()}
  <div class="mb-3 flex items-center justify-between gap-2 text-xs text-muted">
    <p class="flex min-w-0 items-center gap-1.5">
      {#if isLive}
        <span class="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-mint"></span><span class="truncate">Live from Binance · updated {agoText}</span>
      {:else if lw && !lw.keys}
        <span class="truncate text-warn">No {botMode} API key on this server{shown ? ` · snapshot from ${when(shown.taken_at)}` : ''}</span>
      {:else if lw?.error || liveFailed[botMode]}
        <span class="truncate text-warn" title={lw?.error || liveFailed[botMode]}>Binance could not be read: {lw?.error || liveFailed[botMode]}</span>
      {:else if shown}
        <span class="truncate">{liveLoading ? 'Reading Binance…' : `Saved snapshot from ${when(shown.taken_at)}`}</span>
      {/if}
    </p>
    <button
      class="grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:bg-panel-2 hover:text-strong disabled:opacity-40"
      title="Read Binance now"
      aria-label="Read Binance now"
      disabled={liveLoading || liveUnsupported}
      onclick={() => refreshLive(botMode, true)}><RefreshCw class="h-3.5 w-3.5 {liveLoading ? 'animate-spin' : ''}" /></button>
  </div>
  {#if !shown}
    <div class="card text-sm text-muted">
      {#if bot?.table_missing}
        The snapshot table doesn't exist yet. Create it once by running <code class="rounded bg-panel-2 px-1.5 py-0.5 text-xs">backend/database/rotation-bot-snapshots.sql</code> in the Supabase SQL editor.
      {:else}
        {liveLoading ? 'Reading Binance…' : `No ${botMode} balance yet.`}
      {/if}
    </div>
  {/if}
{/snippet}

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
  <div class="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-panel-2/80 p-1" role="tablist" aria-label="Sections">
    {#each TABS as t (t.id)}
      <button
        role="tab"
        aria-selected={tab === t.id}
        class="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-medium transition {tab === t.id ? 'bg-panel text-strong shadow-sm' : 'text-muted hover:text-strong'}"
        onclick={() => pickTab(t.id)}>
        <t.icon class="hidden h-4 w-4 sm:block" />{t.label}
      </button>
    {/each}
  </div>

  {#if tab === 'bot'}
    {@render accountStatus()}
    {#if shown}
      {@const s = shown}
      <div class="space-y-4">
        <!-- The sleeve -->
        <div class="card">
          <p class="text-xs text-muted">Bot sleeve · {s.follow ? 'copies the Rotation Index' : `runs the ${s.style} rule`}</p>
          {#if s.started}
            <p class="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-strong">{usd(s.equity_usdt)} <span class="text-sm font-medium text-muted">USDT</span></p>
            <p class="mt-0.5 text-sm"><span class="font-semibold {tone(s.return_pct, 2)}">{pct(s.return_pct, 2)}</span> <span class="text-muted">on the {usd(s.budget_usdt)} budget</span></p>

            <dl class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div class="rounded-2xl bg-panel-2/70 px-3.5 py-3">
                <dt class="text-[11px] text-muted">Index, same days</dt>
                <dd class="mt-0.5 font-semibold tabular-nums {tone(indexSameDays?.pct, 2)}">{pct(indexSameDays?.pct, 2)}</dd>
              </div>
              <div class="rounded-2xl bg-panel-2/70 px-3.5 py-3">
                <dt class="text-[11px] text-muted">Cash in the sleeve</dt>
                <dd class="mt-0.5 font-semibold tabular-nums text-strong">{usd(s.cash_usdt)}</dd>
              </div>
              <div class="col-span-2 rounded-2xl bg-panel-2/70 px-3.5 py-3 sm:col-span-1">
                <dt class="text-[11px] text-muted">Last run</dt>
                <dd class="mt-0.5 truncate font-semibold text-strong">{s.last_run ? `${when(s.last_run.at)} · ${s.last_run.by === 'admin' ? 'this page' : 'command line'}` : '—'}</dd>
              </div>
            </dl>
            {#if s.top_ups?.length && !s.fund}
              <p class="mt-2 text-[11px] text-muted">
                Budget {usd(s.budget_usdt)} USDT: started with {usd(s.budget_usdt - s.top_ups.reduce((x, t) => x + t.usdt, 0))}, then added {s.top_ups.map((t) => `${usd(t.usdt)} on ${niceDate(t.at.slice(0, 10))}`).join(', ')}.
              </p>
            {/if}

            {#if s.positions.length}
              <ul class="mt-3 divide-y divide-edge/60">
                {#each s.positions as p (p.coin)}
                  {@const added = s.trades.find((t) => t.side === 'BUY' && t.symbol.replace(/USDT$/, '') === p.asset && t.at.slice(0, 10) > p.entry_date)}
                  <li class="flex items-center gap-3 py-2.5">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-semibold text-strong">{p.asset}</p>
                      <p class="truncate text-xs text-muted">{amount(p.qty)} · bought {dayMonth(p.entry_date)}{added ? ` · added ${dayMonth(added.at.slice(0, 10))}` : ''}</p>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="text-sm font-semibold tabular-nums text-strong">{usd(p.value_usdt)}</p>
                      <p class="text-xs tabular-nums {tone(p.return_pct)}">{pct(p.return_pct)}</p>
                    </div>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="mt-3 text-xs text-muted">No coins held — the sleeve is all cash.</p>
            {/if}
            {#if (sleeve?.history.length ?? 0) >= 2}
              <div class="mt-3"><EChart option={sleeveChart} height={180} /></div>
            {/if}
            {#if s.last_run}<p class="mt-2 text-[11px] text-muted">{s.last_run.summary}</p>{/if}
          {:else}
            <p class="mt-1 text-sm text-soft">Not started. The first run buys the index's coins with the budget you set below.</p>
          {/if}
        </div>

        <!-- Run the bot on the server, with the server's own key -->
        {#if lw && !liveUnsupported}
          {@const c = lw.control}
          {@const k = lw.key}
          <div class="card">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-sm font-semibold text-strong">Run the bot</h2>
              <div class="flex gap-2">
                <button class="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null || !lw.keys} onclick={() => preview('preview')}>
                  <Eye class="h-3.5 w-3.5" /> Preview
                </button>
                <button
                  class="btn px-3 py-1.5 text-xs font-semibold {botMode === 'live' ? 'bg-danger text-white hover:bg-danger/90' : 'bg-accent text-white hover:bg-accent/90'} disabled:opacity-50"
                  disabled={busy !== null || !c.can_trade || c.running}
                  onclick={() => preview('check')}>
                  <Play class="h-3.5 w-3.5" /> {busy === 'check' ? 'Checking…' : busy === 'run' ? 'Placing orders…' : 'Run now'}
                </button>
              </div>
            </div>
            <p class="mt-1 text-xs text-muted">Copies the index's orders inside the sleeve once the index has saved its fill. You see the orders first; nothing is placed until you confirm.</p>
            {#if view?.pending}<p class="mt-1 text-xs text-muted">The review decided {niceDate(view.pending.decided)} fills at the next close. Until that is saved, a run does nothing.</p>{/if}
            {#if !s.started}
              <label class="mt-3 flex flex-wrap items-center gap-2 text-xs text-soft">
                First-run budget
                <input class="input-sm w-28" type="number" min="1" step="1" bind:value={budgetInput} oninput={() => (budgetTouched = true)} />
                USDT{c.max_budget_usdt ? ` · at most ${usd(c.max_budget_usdt)} (BOT_MAX_BUDGET_USDT)` : ''}{wallet ? ` · ${usd(wallet.usdtFree)} free in Spot` : ''}
              </label>
            {/if}
            {#if c.running}<p class="mt-2 text-xs text-warn">A run is in progress. The buttons come back when it finishes.</p>{/if}
            {#if !c.can_trade && c.why_not}<p class="mt-2 text-xs text-warn">Run is off on this server: {c.why_not}</p>{/if}
            {#if k}
              {#if k.withdrawals}<p class="mt-1 text-xs text-danger">This key can withdraw funds — the bot refuses to trade with it. Turn withdrawals off on Binance.</p>{/if}
              {#if !k.spot_trading}<p class="mt-1 text-xs text-warn">Spot trading is off for this key — on Binance › API Management, restrict it to trusted IPs, then tick "Enable Spot & Margin Trading".</p>{/if}
              {#if !k.ip_restricted}<p class="mt-1 text-xs text-warn">This key is not restricted to an IP address — add this server's IP on Binance › API Management.</p>{/if}
            {/if}

            {#if s.started && s.fund}
              <p class="mt-3 rounded-2xl bg-panel-2/70 p-3 text-xs text-muted">
                Money goes in and out per person now: open someone in the
                <button class="font-medium text-accent hover:underline" onclick={() => pickTab('investors')}>Investors</button> tab and use Add money or Withdraw.
              </p>
            {:else if s.started && topUpRoom}
              {@const room = topUpRoom}
              <div class="mt-3 rounded-2xl border border-edge/70 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-xs font-semibold text-strong">Add to the sleeve</p>
                  <p class="text-[11px] {room.outside >= 5 ? 'text-mint' : 'text-muted'}">
                    {usd(room.outside)} USDT in Spot is outside the sleeve{room.capRoom != null ? ` · the cap allows ${usd(room.capRoom)} more` : ''}
                  </p>
                </div>
                <p class="mt-1 text-[11px] leading-snug text-muted">Moves USDT from Spot into the sleeve and buys more of the index's coins at its weights. Binance needs about 5 USDT per coin.</p>
                {#if room.capRoom != null && room.capRoom < 1}
                  <p class="mt-2 text-[11px] text-warn">The sleeve is at the cap ({usd(c.max_budget_usdt)} USDT). Raise BOT_MAX_BUDGET_USDT in the server's backend/.env and restart it to add more.</p>
                {:else}
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-soft">
                    <input class="input-sm w-28" type="number" min="1" step="1" bind:value={topUpInput} oninput={() => (topUpTouched = true)} />
                    USDT
                    <button
                      class="btn-ghost px-3 py-1.5 text-xs"
                      disabled={busy !== null || !c.can_trade || c.running || !(Number(topUpInput) > 0)}
                      onclick={() => preview('check', Number(topUpInput))}>
                      <Eye class="h-3.5 w-3.5" /> {busy === 'check' && !!topUpInput ? 'Checking…' : 'Check & add'}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}

            {#if result && result.mode === botMode}
              {@const r = result}
              {@const plan = r.outcome?.plan}
              <div class="mt-3 rounded-2xl border {r.ok ? 'border-edge' : 'border-danger/40'} bg-panel-2/60 p-3 text-xs">
                <p class="font-semibold {r.ok ? 'text-strong' : 'text-danger'}">
                  {r.kind === 'run' ? (r.ok ? 'Done' : 'Stopped') : r.topUp ? 'Add to the sleeve' : 'Preview'} · {r.ok ? r.outcome?.summary : r.message}
                </p>
                {#if plan && (plan.sell.length || plan.buy.length)}
                  <div class="mt-2 space-y-0.5 text-soft">
                    {#if plan.sell.length}<p><span class="text-danger">Sell</span> {plan.sell.map((x) => `${x.asset} (${x.reason})`).join(', ')}</p>{/if}
                    {#if plan.buy.length}<p><span class="text-mint">Buy</span> {plan.buy.map((x) => (x.usdt == null ? x.asset : `${x.asset} ~${usd(x.usdt)} USDT`)).join(', ')}</p>{/if}
                    {#if plan.keep.length}<p><span class="text-muted">Keep</span> {plan.keep.join(', ')}</p>{/if}
                  </div>
                {/if}
                {#if r.kind === 'check' && hasOrders(r)}
                  <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-edge/60 pt-3">
                    <span class="text-strong">
                      {r.topUp ? `Add ${usd(r.topUp)} USDT to the sleeve and place these orders` : 'Place these orders'}{botMode === 'live' ? ' with real money on Binance?' : ' on Binance testnet?'}
                    </span>
                    <button class="btn px-3 py-1.5 text-xs font-semibold {botMode === 'live' ? 'bg-danger text-white hover:bg-danger/90' : 'bg-accent text-white hover:bg-accent/90'}" disabled={busy !== null} onclick={run}>
                      {busy === 'run' ? 'Placing orders…' : 'Place orders'}
                    </button>
                    <button class="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onclick={() => (result = null)}>Cancel</button>
                  </div>
                {:else if r.kind === 'check' && r.ok}
                  <p class="mt-1 text-muted">Nothing to place now.</p>
                {/if}
                {#if r.log.length}
                  <details class="mt-2">
                    <summary class="cursor-pointer text-muted">Run log</summary>
                    <pre class="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-panel p-2 font-mono text-[11px] leading-snug text-soft">{r.log.join('\n')}</pre>
                  </details>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Recent orders -->
        {#if s.trades.length}
          <div class="card">
            <h2 class="text-sm font-semibold text-strong">Recent orders</h2>
            <ul class="mt-1 divide-y divide-edge/60">
              {#each s.trades.slice(0, 8) as t (t.at + t.symbol + t.side)}
                {@const buy = t.side === 'BUY'}
                <li class="flex items-center gap-3 py-2.5">
                  <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full {buy ? 'bg-mint/15 text-mint' : 'bg-danger/15 text-danger'}" aria-hidden="true">
                    {#if buy}<ArrowDownLeft class="h-4 w-4" />{:else}<ArrowUpRight class="h-4 w-4" />{/if}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-strong">{buy ? 'Bought' : 'Sold'} {t.symbol.replace(/USDT$/, '')}</p>
                    <p class="truncate text-xs text-muted">{when(t.at)} · {t.reason}</p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="text-sm font-semibold tabular-nums text-strong">{usd(t.usdt)}</p>
                    <p class="text-xs tabular-nums text-muted">{amount(t.qty)}</p>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  {:else if tab === 'investors'}
    {#if !booksReady}{@render accountStatus()}{/if}
  {:else if tab === 'wallet'}
    {@render accountStatus()}
    {#if shown && wallet}
      <div class="card">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="text-xs text-muted">Spot wallet</p>
            <p class="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-strong">{usd(wallet.total)} <span class="text-sm font-medium text-muted">USDT</span></p>
          </div>
          <div class="sm:text-right">
            <p class="text-[11px] text-muted">USDT free to spend</p>
            <p class="text-lg font-semibold tabular-nums text-strong">{usd(wallet.usdtFree)}</p>
          </div>
        </div>

        {#if wallet.segments.length}
          <div class="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-panel-2">
            {#each wallet.segments as g (g.label)}
              <span class="h-full" style="width:{g.share}%; background:{g.color}" title="{g.label} {g.share.toFixed(1)}%"></span>
            {/each}
          </div>
        {/if}

        {#if wallet.main.length}
          <ul class="mt-2 divide-y divide-edge/60">
            {#each showAllSpot ? wallet.main : wallet.main.slice(0, SPOT_SHOWN) as b (b.asset)}
              <li class="flex items-center gap-3 py-2.5">
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-1.5 text-sm font-semibold text-strong">
                    {b.asset}{#if botCoins.has(b.asset)}<span class="rounded-full bg-accent/15 px-1.5 py-px text-[10px] font-medium text-accent">bot</span>{/if}
                  </p>
                  <p class="truncate text-xs text-muted">{amount(b.free + b.locked)}{b.locked > 0 ? ` · ${amount(b.locked)} in orders` : ''}</p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="text-sm font-semibold tabular-nums text-strong">{usd(b.value_usdt)}</p>
                  <p class="text-xs tabular-nums text-muted">{b.share == null ? '—' : `${b.share.toFixed(1)}%`}</p>
                </div>
              </li>
            {/each}
          </ul>
          {#if wallet.main.length > SPOT_SHOWN}
            <button class="mt-1 text-xs font-medium text-accent hover:underline" onclick={() => (showAllSpot = !showAllSpot)}>
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
        <p class="mt-3 text-[11px] text-muted">Spot only; Funding and Earn are not included. Coins marked <span class="text-accent">bot</span> belong to the bot's sleeve, which never touches the rest.</p>
      </div>
    {/if}
  {:else}
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-muted">{v.days} day{v.days === 1 ? '' : 's'} · prices up to {niceDate(v.last_date)} · all start at {v.index.base}</p>
        <button class="btn-ghost shrink-0 px-3 py-1.5 text-xs" disabled={updating} onclick={update}>
          <RefreshCw class="h-3.5 w-3.5 {updating ? 'animate-spin' : ''}" /> Update now
        </button>
      </div>

      <!-- The three lines; all start at the same base on the first fill day. One card of rows on a phone… -->
      <ul class="card divide-y divide-edge/60 py-1 sm:hidden">
        {#each lines as l (l.key)}
          <li class="flex items-center justify-between gap-3 py-2.5">
            <div class="min-w-0">
              <p class="flex items-center gap-1.5 text-sm font-medium text-strong"><span class="inline-block h-2 w-2 shrink-0 rounded-full" style="background:{l.color}"></span>{l.name}</p>
              <p class="mt-0.5 text-xs text-muted">Worst drop <span class={l.dd < 0 ? 'text-danger' : 'text-muted'}>{l.dd.toFixed(1)}%</span></p>
            </div>
            <div class="shrink-0 text-right">
              <p class="text-base font-semibold tabular-nums text-strong">{l.value.toFixed(2)}</p>
              <p class="text-xs tabular-nums {tone(l.ret)}">{pct(l.ret)}</p>
            </div>
          </li>
        {/each}
      </ul>
      <!-- …side by side on a wider screen. -->
      <div class="hidden gap-3 sm:grid sm:grid-cols-3">
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
        <h2 class="text-sm font-semibold text-strong">Since {niceDate(v.start_date)}</h2>
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
            <h2 class="flex items-center gap-1.5 text-sm font-semibold text-strong"><ListChecks class="h-4 w-4 text-accent" /> Index holds now</h2>
            <span class="pill bg-edge text-soft"><CalendarClock class="mr-1 inline h-3 w-3" />Next review {niceDate(v.next_review)}</span>
          </div>
          {#if v.holdings?.length}
            <table class="mt-2 w-full text-sm">
              <thead>
                <tr class="text-left text-[11px] text-muted"><th class="py-1 font-medium">Coin</th><th class="py-1 text-right font-medium">Weight</th><th class="py-1 text-right font-medium">Since entry</th><th class="py-1 text-right font-medium">Index bought</th></tr>
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
        <li>Tracked forward on paper: each review picks from the coins that are biggest on that day, and its decisions are saved and never recalculated, so nothing here benefits from hindsight.</li>
        <li>Rule: {v.index.style.label} — top {v.index.style.universe_size} coins by market cap that Binance trades against USDT, ranked by {v.index.style.lookback_days}-day {v.index.style.signal}, {v.index.style.top_n} held at equal weight, reviewed every {v.index.style.rebalance_days} days. The same rule as the rotation bot.</li>
        <li>Orders are decided on the review day's close and filled at the next day's close, with a {v.index.fee_pct}% fee on every buy and sell. Slippage is not modelled.</li>
        <li>Closing prices are CoinGecko's 00:00 UTC prices. A day is added only once its price is final, so the newest point is usually yesterday.</li>
        <li>BTC and the top-{v.index.top10_size} index start on the first fill day ({niceDate(v.first_fill)}) at the same fee. Binance coin list as of {niceDate(v.tradable_as_of)}.</li>
      </ul>
      <Disclaimer compact />
    </div>
  {/if}

  <!-- Kept mounted after the first visit, so coming back to the tab doesn't read the books again. -->
  {#if booksSeen && booksReady && shown && lw}
    <div class:hidden={tab !== 'investors'}>
      <InvestorBooks
        mode={botMode}
        canTrade={lw.control.can_trade && !lw.control.running}
        whyNot={lw.control.running ? 'a run is in progress' : lw.control.why_not}
        outsideUsdt={topUpRoom?.outside ?? null}
        capRoom={topUpRoom?.capRoom ?? null}
        holdings={shown.positions}
        onChanged={async () => {
          await Promise.all([load(), refreshLive(botMode, true)]);
        }}
      />
    </div>
  {/if}
{/if}
