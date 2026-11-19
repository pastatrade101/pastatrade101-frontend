<script lang="ts">
  import {
    ArrowDownLeft,
    ArrowLeft,
    ArrowUpRight,
    BookOpen,
    ChevronRight,
    CircleCheck,
    CircleX,
    FileText,
    Info,
    Pencil,
    Printer,
    RefreshCw,
    UserPlus,
    X
  } from '@lucide/svelte';
  import { api } from '$lib/api';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import { categorical } from '$lib/charts/presets';

  // The investor books: who owns which part of the bot's sleeve, kept in units like a
  // fund. Money in buys units at the unit price of the moment, money out cancels them, so
  // gains and losses are shared by percentage and nobody's money mixes with anyone else's.
  // Money in and out place real orders (on the tab's account), always after a check the
  // owner confirms — the same flow as Run now.

  type Mode = 'live' | 'testnet';
  interface Investor {
    id: string;
    name: string;
    note: string;
    owner: boolean;
    created_at: string;
    units: number;
    share_pct: number;
    value_usdt: number | null;
    put_in_usdt: number;
    taken_out_usdt: number;
    gain_usdt: number | null;
    gain_pct: number | null;
    cost_usdt: number;
    first_at: string | null;
    first_unit_price: number | null;
    since_joined_pct: number | null;
    provisional: boolean;
  }
  interface Entry {
    id: string;
    at: string;
    investor_id: string;
    investor_name: string;
    kind: 'opening' | 'deposit' | 'withdrawal' | 'fee' | 'adjustment';
    usdt: number;
    units: number;
    unit_price: number;
    cost_usdt: number;
    units_after: number;
    note: string;
    provisional: boolean;
  }
  interface FundView {
    mode: Mode;
    as_of: string;
    can_edit: boolean;
    why_not: string | null;
    sleeve_started: boolean;
    started: boolean;
    started_at: string | null;
    price_error: string | null;
    value_usdt: number | null;
    units: number;
    unit_price: number | null;
    opening_unit_price: number | null;
    investors: Investor[];
    entries: Entry[];
    history: { date: string; unit_price: number }[];
    problems: string[];
  }
  interface BotPlan { keep: string[]; sell: { asset: string; reason: string }[]; buy: { asset: string; usdt: number | null }[] }
  interface BotResult { ok: boolean; message?: string; outcome?: { kind: string; summary: string; plan: BotPlan | null }; log: string[] }
  type Kind = 'in' | 'out';
  /** The person sheet's screens: their account → amount → review → receipt (or rename). */
  type Screen = 'view' | 'amount' | 'review' | 'done' | 'edit';

  let {
    mode,
    canTrade,
    whyNot,
    outsideUsdt,
    capRoom,
    holdings,
    onChanged
  }: {
    mode: Mode;
    /** This server may place orders for the mode right now. */
    canTrade: boolean;
    whyNot: string | null;
    /** USDT in Spot that is not the sleeve's (money in comes from there). */
    outsideUsdt: number | null;
    /** Live: how much more the budget cap allows. */
    capRoom: number | null;
    /** What the sleeve holds now, for statements. */
    holdings: { asset: string; value_usdt: number | null }[];
    onChanged: () => void | Promise<void>;
  } = $props();

  let view = $state<FundView | null>(null);
  let loadError = $state('');
  let loading = $state(false);
  let busy = $state<'start' | 'add' | 'edit' | 'check' | 'run' | null>(null);
  let formError = $state('');
  let ownerName = $state('');
  let confirmStart = $state(false);
  let showHow = $state(false);
  let adding = $state(false);
  let newName = $state('');
  let newNote = $state('');
  let showAllActivity = $state(false);

  // The person sheet.
  let personId = $state<string | null>(null);
  let screen = $state<Screen>('view');
  let kind = $state<Kind>('in');
  let amountInput = $state('');
  let outAll = $state(false);
  let editName = $state('');
  let editNote = $state('');
  let result = $state<(BotResult & { step: 'check' | 'run'; kind: Kind; amount: number | 'all' }) | null>(null);
  let statementId = $state<string | null>(null);

  const load = async (m: Mode) => {
    loading = true;
    try {
      const v = await api<FundView>(`/admin/rotation-index/bot/${m}/fund`, { auth: true, timeoutMs: 20_000 });
      if (m === mode) {
        view = v;
        loadError = '';
      }
    } catch (e) {
      if (m === mode) loadError = e instanceof Error ? e.message : 'Could not read the investor books.';
    } finally {
      loading = false;
    }
  };
  // A new tab (live / testnet) is a different set of books.
  $effect(() => {
    const m = mode;
    view = null;
    personId = null;
    statementId = null;
    result = null;
    confirmStart = false;
    adding = false;
    load(m);
  });

  /* ── Formatting. Signs and colours follow the rounded figure, so +0.004 reads as a plain 0.00. ── */
  const round = (n: number, digits: number) => {
    const f = 10 ** digits;
    const r = Math.round(n * f) / f;
    return r === 0 ? 0 : r;
  };
  const usd = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const signedUsd = (n: number | null | undefined) => {
    if (n == null) return '—';
    const v = round(n, 2);
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${usd(Math.abs(v))}`;
  };
  const pct = (n: number | null | undefined, digits = 1) => {
    if (n == null) return '—';
    const v = round(n, digits);
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`;
  };
  /** Green up, red down, plain when it rounds to nothing. */
  const tone = (n: number | null | undefined, digits = 2) => {
    if (n == null) return 'text-muted';
    const v = round(n, digits);
    return v > 0 ? 'text-mint' : v < 0 ? 'text-danger' : 'text-soft';
  };
  const units = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const uprice = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(4));
  const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const KIND: Record<Entry['kind'], string> = { opening: 'Books opened', deposit: 'Money in', withdrawal: 'Withdrawal', fee: 'Fee', adjustment: 'Correction' };

  const initials = (name: string) => {
    // Letters and digits only, and nothing in brackets: "Pastory (testnet)" → "PA".
    const parts = name
      .replace(/\(.*?\)/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean);
    const s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
    return s.toUpperCase();
  };
  /** Amber, blue, purple, cyan, pink — never the red and green that mean loss and gain here. */
  const AVATAR_HUES = [0, 1, 4, 5, 6];
  const hueOf = (id: string) => {
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return $categorical[AVATAR_HUES[h % AVATAR_HUES.length]];
  };
  /** A soft circle in the person's colour (the same colour everywhere, light and dark). */
  const avatarStyle = (id: string) => {
    const c = hueOf(id);
    return `background: color-mix(in srgb, ${c} 18%, transparent); color: ${c};`;
  };

  const live = $derived(mode === 'live');
  const sinceOpening = $derived(view?.unit_price != null && view.opening_unit_price ? (view.unit_price / view.opening_unit_price - 1) * 100 : null);
  const withMoney = $derived(view?.investors.filter((i) => i.units > 1e-9).length ?? 0);
  const trend = $derived.by(() => {
    const h = [...(view?.history ?? [])];
    const today = view?.as_of.slice(0, 10);
    if (view?.unit_price != null && today) {
      if (h.length && h[h.length - 1].date === today) h[h.length - 1] = { date: today, unit_price: view.unit_price };
      else h.push({ date: today, unit_price: view.unit_price });
    }
    return h.length >= 2 ? h.map((p) => p.unit_price) : null;
  });

  const run = async (fn: () => Promise<void>, b: NonNullable<typeof busy>) => {
    busy = b;
    formError = '';
    try {
      await fn();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'That did not work.';
    } finally {
      busy = null;
    }
  };

  const startBooks = () =>
    run(async () => {
      await api(`/admin/rotation-index/bot/${mode}/fund/start`, { auth: true, method: 'POST', body: { ownerName } });
      confirmStart = false;
      await load(mode);
    }, 'start');

  const addPerson = () =>
    run(async () => {
      await api(`/admin/rotation-index/bot/${mode}/fund/investors`, { auth: true, method: 'POST', body: { name: newName, note: newNote } });
      newName = '';
      newNote = '';
      adding = false;
      await load(mode);
    }, 'add');

  const saveEdit = () =>
    run(async () => {
      if (!personId) return;
      await api(`/admin/rotation-index/bot/${mode}/fund/investors/${encodeURIComponent(personId)}`, { auth: true, method: 'PATCH', body: { name: editName, note: editNote } });
      screen = 'view';
      await load(mode);
    }, 'edit');

  /* ── The person sheet ── */
  const person = $derived(personId ? view?.investors.find((i) => i.id === personId) ?? null : null);
  const personEntries = $derived(personId ? (view?.entries ?? []).filter((e) => e.investor_id === personId) : []);

  const openPerson = (i: Investor) => {
    personId = i.id;
    screen = 'view';
    result = null;
    formError = '';
  };
  const closeSheet = () => {
    if (busy === 'run') return;
    personId = null;
    result = null;
    formError = '';
  };
  const startMoney = (k: Kind) => {
    kind = k;
    amountInput = '';
    outAll = false;
    result = null;
    formError = '';
    screen = 'amount';
  };
  const startEdit = () => {
    if (!person) return;
    editName = person.name;
    editNote = person.note;
    formError = '';
    screen = 'edit';
  };

  const amount = $derived.by((): number | 'all' | null => {
    if (kind === 'out' && outAll) return 'all';
    const n = Number(amountInput);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const bodyFor = (k: Kind, a: number | 'all', id: string) => (k === 'in' ? { topUp: a, investorId: id } : { withdraw: a, investorId: id });

  /** First step: what the money in / out would do now (nothing is placed). */
  const check = async () => {
    const id = personId;
    const a = amount;
    const k = kind;
    if (!id || a == null) return;
    busy = 'check';
    result = null;
    try {
      const r = await api<BotResult>(`/admin/rotation-index/bot/${mode}/preview`, { auth: true, method: 'POST', body: bodyFor(k, a, id) });
      result = { ...r, step: 'check', kind: k, amount: a };
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : 'The check failed.', log: [], step: 'check', kind: k, amount: a };
    } finally {
      busy = null;
    }
    if (result?.ok) screen = 'review';
  };

  /** Second step: place the orders the check showed. */
  const confirm = async () => {
    const r0 = result;
    const id = personId;
    if (!r0 || !id) return;
    const plan = r0.outcome?.plan;
    const expect = { sell: plan?.sell.map((x) => x.asset) ?? [], buy: plan?.buy.map((x) => x.asset) ?? [] };
    busy = 'run';
    try {
      const r = await api<BotResult>(`/admin/rotation-index/bot/${mode}/run`, { auth: true, method: 'POST', body: { ...bodyFor(r0.kind, r0.amount, id), confirm: true, expect } });
      result = { ...r, step: 'run', kind: r0.kind, amount: r0.amount };
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : 'The run failed.', log: [], step: 'run', kind: r0.kind, amount: r0.amount };
    } finally {
      busy = null;
      screen = 'done';
      await Promise.all([load(mode), onChanged()]);
    }
  };

  /** About how many units the money in buys, or the withdrawal cancels, at today's price (the orders set the exact figure). */
  const estUnits = $derived.by(() => {
    if (!result || !person || !view?.unit_price) return null;
    if (result.amount === 'all') return person.units;
    return result.amount / view.unit_price;
  });

  /** Overlays live under <body>: above the site header, and the statement prints from the top. */
  const portal = (node: HTMLElement) => {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  };
  $effect(() => {
    if (!personId && !statementId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (statementId) statementId = null;
    else if (personId) closeSheet();
  };

  /* ── Statement ── */
  const lastOut = (id: string) => (view?.entries ?? []).find((e) => e.investor_id === id && e.kind === 'withdrawal')?.at ?? null;
  const statement = $derived(statementId ? view?.investors.find((i) => i.id === statementId) ?? null : null);
  const statementEntries = $derived(statementId ? [...(view?.entries ?? [])].filter((e) => e.investor_id === statementId).reverse() : []);
  const sleeveHoldings = $derived.by(() => {
    const total = holdings.reduce((x, h) => x + (h.value_usdt ?? 0), 0);
    return holdings.map((h) => ({ asset: h.asset, share: total > 0 && h.value_usdt != null ? (h.value_usdt / total) * 100 : null }));
  });
  const paperTone = (n: number | null | undefined, digits = 2) => {
    if (n == null) return 'text-neutral-500';
    const v = round(n, digits);
    return v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-700' : 'text-neutral-900';
  };
  /** The statement's summary, as label and value rows (reads like a bank statement on a phone and on paper). */
  const statementRows = $derived.by(() => {
    const st = statement;
    const v = view;
    if (!st || !v) return [];
    const rows: { label: string; value: string; cls?: string }[] = [
      { label: 'Put in', value: `${usd(st.put_in_usdt)} USDT` },
      { label: 'Taken out', value: `${usd(st.taken_out_usdt)} USDT` },
      { label: 'Fees on your money in and out', value: `${usd(st.cost_usdt)} USDT` },
      { label: 'Units held', value: units(st.units) },
      { label: 'Share of the sleeve', value: `${st.share_pct.toFixed(2)}%` }
    ];
    if (st.first_at) {
      rows.push({ label: 'Unit price today', value: `${uprice(v.unit_price)} USDT` });
      rows.push({ label: `Unit price when you joined, ${day(st.first_at)}`, value: `${uprice(st.first_unit_price)} USDT` });
      rows.push({ label: 'Sleeve move since you joined', value: pct(st.since_joined_pct), cls: paperTone(st.since_joined_pct, 1) });
    } else {
      const lo = lastOut(st.id);
      rows.push({ label: 'All money taken out', value: lo ? day(lo) : 'Yes' });
    }
    return rows;
  });
</script>

<svelte:window onkeydown={onKey} />

{#snippet avatar(id: string, name: string, size: 'sm' | 'lg' = 'sm')}
  <span
    class="grid shrink-0 place-items-center rounded-full font-semibold {size === 'lg' ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm'}"
    style={avatarStyle(id)}
    aria-hidden="true">{initials(name)}</span>
{/snippet}

{#snippet activityRow(e: Entry, showName: boolean)}
  {@const out = e.kind === 'withdrawal'}
  {@const isIn = e.kind === 'deposit'}
  <li class="flex items-center gap-3 py-2.5">
    <span
      class="grid h-9 w-9 shrink-0 place-items-center rounded-full {isIn ? 'bg-mint/15 text-mint' : out ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent'}"
      aria-hidden="true">
      {#if isIn}<ArrowDownLeft class="h-4 w-4" />{:else if out}<ArrowUpRight class="h-4 w-4" />{:else}<BookOpen class="h-4 w-4" />{/if}
    </span>
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-strong">{showName ? e.investor_name : KIND[e.kind]}</p>
      <p class="truncate text-xs text-muted">{showName ? `${KIND[e.kind]} · ` : ''}{shortDay(e.at)}{e.provisional ? ' · plain price' : ''}</p>
    </div>
    <div class="shrink-0 text-right">
      <p class="text-sm font-semibold tabular-nums {isIn ? 'text-mint' : 'text-strong'}">{out ? '−' : '+'}{usd(e.usdt)}</p>
      <p class="text-xs tabular-nums text-muted">{e.units >= 0 ? '+' : '−'}{units(Math.abs(e.units))} u</p>
    </div>
  </li>
{/snippet}

<div class="card">
  <!-- Header: title, a short "how it works", add person. -->
  <div class="flex items-center justify-between gap-2">
    <div>
      <h2 class="text-base font-semibold text-strong">Investors</h2>
      <p class="text-xs text-muted">Who owns which part of the sleeve</p>
    </div>
    <div class="flex items-center gap-1.5">
      <button
        class="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-panel-2 hover:text-strong {showHow ? 'bg-panel-2 text-strong' : ''}"
        title="How it works"
        aria-expanded={showHow}
        onclick={() => (showHow = !showHow)}><Info class="h-4 w-4" /></button>
      {#if view?.started && view.can_edit}
        <button
          class="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-panel-2 hover:text-strong disabled:opacity-40"
          title="Refresh"
          disabled={loading}
          onclick={() => load(mode)}><RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" /></button>
        <button
          class="btn-ghost h-9 whitespace-nowrap rounded-full px-2.5 text-xs sm:px-3"
          title="Add person"
          aria-label="Add person"
          onclick={() => ((adding = !adding), (formError = ''))}>
          <UserPlus class="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span class="hidden sm:inline">Add person</span>
        </button>
      {/if}
    </div>
  </div>

  {#if showHow}
    <div class="mt-3 rounded-2xl bg-panel-2/70 p-4 text-xs leading-relaxed text-soft">
      <p>The sleeve is split into <strong class="text-strong">units</strong>, like a fund.</p>
      <ul class="mt-1.5 list-disc space-y-0.5 pl-4">
        <li>Money in buys units at today's unit price; a withdrawal cancels units at today's price.</li>
        <li>Gains and losses move the unit price, so everyone grows or shrinks by the same percentage.</li>
        <li>Each person pays the trading fees of their own money in and out. Nobody's money mixes.</li>
      </ul>
    </div>
  {/if}

  {#if adding && view?.started}
    <div class="mt-3 rounded-2xl border border-edge/70 p-4">
      <p class="text-sm font-semibold text-strong">Add a person</p>
      <p class="mt-0.5 text-xs text-muted">This moves no money. Add their money from their page once it is in your Spot wallet.</p>
      <div class="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input class="input-sm" placeholder="Name" bind:value={newName} maxlength="60" />
        <input class="input-sm" placeholder="Note (optional)" bind:value={newNote} maxlength="200" />
        <div class="flex gap-2">
          <button class="btn bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50" disabled={!newName.trim() || busy !== null} onclick={addPerson}>
            {busy === 'add' ? 'Adding…' : 'Add'}
          </button>
          <button class="btn-ghost px-3 py-1.5 text-xs" onclick={() => (adding = false)}>Cancel</button>
        </div>
      </div>
      {#if formError && !personId}<p class="mt-2 text-xs text-danger">{formError}</p>{/if}
    </div>
  {/if}

  {#if loadError}
    <p class="mt-4 text-xs text-warn">{loadError}</p>
  {:else if !view}
    <div class="mt-4 h-44 animate-pulse rounded-3xl bg-panel-2/70" aria-label={loading ? 'Reading the books' : ''}></div>
  {:else if !view.started}
    {@const v = view}
    <div class="mt-4 max-w-md rounded-3xl p-5 text-white shadow-lg {live ? 'hero-live' : 'hero-test'}">
      <div class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
        <span>Rotation sleeve</span>
        <span class="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 normal-case tracking-normal text-white/80">
          <span class="h-1.5 w-1.5 rounded-full {live ? 'bg-rose-400' : 'bg-sky-400'}"></span>{live ? 'Live' : 'Testnet'}
        </span>
      </div>
      {#if !v.sleeve_started}
        <p class="mt-6 text-sm text-white/80">The sleeve has not made its first run yet. Start the books after it has bought its coins.</p>
      {:else if !v.can_edit}
        <p class="mt-6 text-sm text-amber-200">{v.why_not}</p>
      {:else}
        <p class="mt-5 text-lg font-semibold">Start the books</p>
        <p class="mt-1 text-sm leading-snug text-white/70">Everything in the sleeve today is yours: one unit for every USDT you have put in. Then add each friend and put their money in from their page.</p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <input class="w-48 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40" placeholder="Your name" bind:value={ownerName} maxlength="60" />
          {#if !confirmStart}
            <button class="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white/90 disabled:opacity-50" disabled={!ownerName.trim() || busy !== null} onclick={() => (confirmStart = true)}>Start</button>
          {/if}
        </div>
        {#if confirmStart}
          <div class="mt-3 rounded-2xl bg-black/20 p-3 text-sm">
            <p>Start the {live ? 'live' : 'testnet'} books with <strong>{ownerName.trim()}</strong> owning 100%?</p>
            <div class="mt-2 flex gap-2">
              <button class="rounded-xl bg-white px-4 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-white/90 disabled:opacity-50" disabled={busy !== null} onclick={startBooks}>{busy === 'start' ? 'Starting…' : 'Yes, start'}</button>
              <button class="rounded-xl px-3 py-1.5 text-sm text-white/80 hover:bg-white/10" disabled={busy !== null} onclick={() => (confirmStart = false)}>Cancel</button>
            </div>
          </div>
        {/if}
        <p class="mt-3 text-xs text-white/50">This only writes the books. No order is placed.</p>
      {/if}
      {#if formError}<p class="mt-2 text-xs text-rose-300">{formError}</p>{/if}
    </div>
  {:else}
    {@const v = view}
    {#if v.price_error}<p class="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">{v.price_error} Values show once Binance prices are back.</p>{/if}
    {#each v.problems as p (p)}<p class="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">Books check: {p}</p>{/each}

    <div class="mt-4 grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <!-- The sleeve, as a bank card. -->
      <div class="flex flex-col rounded-3xl p-5 text-white shadow-lg {live ? 'hero-live' : 'hero-test'}">
        <div class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
          <span>Rotation sleeve</span>
          <span class="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 normal-case tracking-normal text-white/80">
            <span class="h-1.5 w-1.5 rounded-full {live ? 'bg-rose-400' : 'bg-sky-400'}"></span>{live ? 'Live' : 'Testnet'}
          </span>
        </div>
        <p class="mt-5 text-xs text-white/60">Total value</p>
        <p class="mt-0.5 text-[2rem] font-semibold leading-tight tracking-tight tabular-nums">
          {usd(v.value_usdt)} <span class="text-base font-medium text-white/60">USDT</span>
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span class="text-white/70">Unit <span class="font-medium tabular-nums text-white">{uprice(v.unit_price)}</span></span>
          {#if sinceOpening != null}
            {@const s = round(sinceOpening, 2)}
            <span
              class="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums {s > 0 ? 'bg-emerald-300/15 text-emerald-300' : s < 0 ? 'bg-rose-300/15 text-rose-300' : 'bg-white/10 text-white/80'}"
              title="Unit price change since the books opened">{pct(sinceOpening, 2)}</span>
            <span class="text-xs text-white/50">since {shortDay(v.started_at ?? v.as_of)}</span>
          {/if}
        </div>
        {#if trend}
          <div class="mt-3 h-12 [&>svg]:h-full" title="Unit price by day">
            <Sparkline points={trend} height={48} stroke="#7CE7BF" />
          </div>
        {/if}
        <div class="min-h-5 flex-1"></div>
        <div class="flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-white/60">
          <span class="whitespace-nowrap tabular-nums">{v.units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} units</span>
          <span class="whitespace-nowrap">{withMoney} {withMoney === 1 ? 'person' : 'people'} with money in</span>
        </div>
      </div>

      <!-- People. -->
      <div class="min-w-0">
        <div class="flex items-baseline justify-between">
          <h3 class="text-sm font-semibold text-strong">People</h3>
          <span class="text-xs text-muted">{v.investors.length}</span>
        </div>
        <ul class="mt-1 divide-y divide-edge/60">
          {#each v.investors as i (i.id)}
            {@const empty = !(i.units > 1e-9)}
            <li>
              <button class="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-3 text-left transition hover:bg-panel-2/70" onclick={() => openPerson(i)}>
                {@render avatar(i.id, i.name)}
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-strong">{i.name}</p>
                  <p class="truncate text-xs text-muted">
                    {#if i.owner}<span class="font-medium text-accent">Owner</span>{' · '}{/if}{#if !empty}{i.share_pct.toFixed(1)}% share{#if i.provisional} · units at the plain price{/if}
                    {:else if i.taken_out_usdt > 0}All money taken out
                    {:else}No money in yet{/if}
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  {#if empty && !(i.put_in_usdt > 0)}
                    <p class="text-sm text-muted">—</p>
                  {:else}
                    <p class="text-sm font-semibold tabular-nums text-strong">{usd(i.value_usdt)}</p>
                    <p class="text-xs tabular-nums {tone(i.gain_usdt)}">{signedUsd(i.gain_usdt)} · {pct(i.gain_pct)}</p>
                  {/if}
                </div>
                <ChevronRight class="h-4 w-4 shrink-0 text-muted" />
              </button>
            </li>
          {/each}
        </ul>
        <p class="mt-1 text-[11px] text-muted">Values in USDT. Gain counts what each person put in and took out, after their own fees.</p>
      </div>
    </div>

    <!-- Recent activity. -->
    {#if v.entries.length}
      <div class="mt-5 border-t border-edge/60 pt-4">
        <div class="flex items-baseline justify-between">
          <h3 class="text-sm font-semibold text-strong">Recent activity</h3>
          {#if v.entries.length > 5}
            <button class="text-xs font-medium text-accent hover:underline" onclick={() => (showAllActivity = !showAllActivity)}>{showAllActivity ? 'Show less' : 'See all'}</button>
          {/if}
        </div>
        <ul class="mt-1 divide-y divide-edge/60">
          {#each showAllActivity ? v.entries : v.entries.slice(0, 5) as e (e.id)}
            {@render activityRow(e, true)}
          {/each}
        </ul>
      </div>
    {/if}
    <p class="mt-3 text-[11px] text-muted">Prices from Binance {mode} · {when(v.as_of)}</p>
  {/if}
</div>

<!-- One person: their account, money in and out, rename, statement. -->
{#if person && view}
  {@const p = person}
  {@const v = view}
  <div
    use:portal
    class="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-6"
    style="background: rgba(0, 0, 0, 0.55)"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && closeSheet()}>
    <div
      class="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border border-edge/70 bg-panel p-5 pb-7 shadow-2xl sm:max-w-[440px] sm:rounded-[28px]"
      role="dialog"
      aria-modal="true"
      aria-label={p.name}>
      <!-- Top bar -->
      <div class="flex items-center justify-between">
        {#if screen === 'view' || screen === 'done'}
          <span class="h-9 w-9"></span>
        {:else}
          <button
            class="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-panel-2 hover:text-strong disabled:opacity-40"
            title="Back"
            disabled={busy !== null}
            onclick={() => ((screen = screen === 'review' ? 'amount' : 'view'), (formError = ''))}><ArrowLeft class="h-4 w-4" /></button>
        {/if}
        <span class="mx-auto h-1 w-10 rounded-full bg-edge sm:hidden"></span>
        <button class="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-panel-2 hover:text-strong disabled:opacity-40" title="Close" disabled={busy === 'run'} onclick={closeSheet}><X class="h-4 w-4" /></button>
      </div>

      {#if screen === 'view'}
        <div class="mt-1 flex items-center gap-3">
          {@render avatar(p.id, p.name, 'lg')}
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 text-lg font-semibold text-strong">
              <span class="truncate">{p.name}</span>
              {#if p.owner}<span class="shrink-0 rounded-full bg-accent/15 px-1.5 py-px text-[10px] font-medium text-accent">Owner</span>{/if}
            </p>
            <p class="truncate text-xs text-muted">{p.note && p.note.trim().toLowerCase() !== 'owner' ? p.note : `Joined ${day(p.created_at)}`}</p>
          </div>
          {#if v.can_edit}
            <button class="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-panel-2 hover:text-strong" title="Rename or change the note" onclick={startEdit}><Pencil class="h-4 w-4" /></button>
          {/if}
        </div>

        <div class="mt-5 text-center">
          <p class="text-xs text-muted">Value now</p>
          <p class="mt-0.5 text-[2rem] font-semibold leading-tight tracking-tight tabular-nums text-strong">{usd(p.value_usdt)} <span class="text-base font-medium text-muted">USDT</span></p>
          {#if p.put_in_usdt > 0}
            {@const g = p.gain_usdt == null ? null : round(p.gain_usdt, 2)}
            <span class="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums {g == null ? 'bg-panel-2 text-muted' : g > 0 ? 'bg-mint/15 text-mint' : g < 0 ? 'bg-danger/15 text-danger' : 'bg-panel-2 text-soft'}">
              {signedUsd(p.gain_usdt)} · {pct(p.gain_pct)} all time
            </span>
          {/if}
        </div>

        {#if p.units > 1e-9}
          <div class="mt-5">
            <div class="flex justify-between text-xs"><span class="text-muted">Share of the sleeve</span><span class="font-medium tabular-nums text-strong">{p.share_pct.toFixed(1)}%</span></div>
            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
              <div class="h-full rounded-full bg-mint" style="width: {Math.min(100, Math.max(0, p.share_pct))}%"></div>
            </div>
          </div>
        {/if}

        <!-- Actions, bank-app style. -->
        <div class="mt-6 grid grid-cols-3 gap-2">
          <button class="group flex flex-col items-center gap-1.5 disabled:opacity-40" disabled={!v.can_edit} onclick={() => startMoney('in')}>
            <span class="grid h-12 w-12 place-items-center rounded-full bg-mint/15 text-mint transition group-hover:bg-mint/20"><ArrowDownLeft class="h-5 w-5" /></span>
            <span class="text-xs font-medium text-strong">Add money</span>
          </button>
          <button class="group flex flex-col items-center gap-1.5 disabled:opacity-40" disabled={!v.can_edit || !(p.units > 1e-9)} onclick={() => startMoney('out')}>
            <span class="grid h-12 w-12 place-items-center rounded-full bg-danger/15 text-danger transition group-hover:bg-danger/20"><ArrowUpRight class="h-5 w-5" /></span>
            <span class="text-xs font-medium text-strong">Withdraw</span>
          </button>
          <button class="group flex flex-col items-center gap-1.5 disabled:opacity-40" disabled={!(p.put_in_usdt > 0)} onclick={() => (statementId = p.id)}>
            <span class="grid h-12 w-12 place-items-center rounded-full bg-panel-2 text-soft transition group-hover:bg-edge"><FileText class="h-5 w-5" /></span>
            <span class="text-xs font-medium text-strong">Statement</span>
          </button>
        </div>

        <dl class="mt-6 grid grid-cols-2 gap-2">
          <div class="rounded-2xl bg-panel-2/70 px-3.5 py-3"><dt class="text-[11px] text-muted">Put in</dt><dd class="mt-0.5 text-sm font-semibold tabular-nums text-strong">{usd(p.put_in_usdt)}</dd></div>
          <div class="rounded-2xl bg-panel-2/70 px-3.5 py-3"><dt class="text-[11px] text-muted">Taken out</dt><dd class="mt-0.5 text-sm font-semibold tabular-nums text-strong">{usd(p.taken_out_usdt)}</dd></div>
          <div class="rounded-2xl bg-panel-2/70 px-3.5 py-3"><dt class="text-[11px] text-muted">Units</dt><dd class="mt-0.5 text-sm font-semibold tabular-nums text-strong">{units(p.units)}</dd></div>
          <div class="rounded-2xl bg-panel-2/70 px-3.5 py-3">
            <dt class="text-[11px] text-muted">Since joined</dt>
            <dd class="mt-0.5 text-sm font-semibold tabular-nums {p.first_at ? tone(p.since_joined_pct, 1) : 'text-muted'}">{p.first_at ? pct(p.since_joined_pct) : '—'}</dd>
          </div>
        </dl>
        {#if p.cost_usdt > 0}<p class="mt-2 text-[11px] text-muted">Fees on their own money in and out: {usd(p.cost_usdt)} USDT.</p>{/if}

        {#if personEntries.length}
          <h4 class="mt-6 text-sm font-semibold text-strong">Activity</h4>
          <ul class="mt-1 divide-y divide-edge/60">
            {#each personEntries.slice(0, 6) as e (e.id)}
              {@render activityRow(e, false)}
            {/each}
          </ul>
        {/if}
      {:else if screen === 'edit'}
        <p class="mt-1 text-lg font-semibold text-strong">Edit {p.name}</p>
        <label class="mt-4 block text-xs text-muted" for="inv-edit-name">Name</label>
        <input id="inv-edit-name" class="input mt-1" bind:value={editName} maxlength="60" />
        <label class="mt-3 block text-xs text-muted" for="inv-edit-note">Note</label>
        <input id="inv-edit-note" class="input mt-1" bind:value={editNote} maxlength="200" placeholder="Optional" />
        {#if formError}<p class="mt-2 text-xs text-danger">{formError}</p>{/if}
        <button class="btn mt-5 w-full bg-accent py-3 font-semibold text-white hover:bg-accent/90 disabled:opacity-50" disabled={!editName.trim() || busy !== null} onclick={saveEdit}>
          {busy === 'edit' ? 'Saving…' : 'Save'}
        </button>
      {:else if screen === 'amount'}
        {@const isIn = kind === 'in'}
        <p class="mt-1 text-lg font-semibold text-strong">{isIn ? `Add money for ${p.name}` : `Withdraw for ${p.name}`}</p>
        <p class="mt-0.5 text-xs text-muted">
          {#if isIn}
            {outsideUsdt != null ? `${usd(outsideUsdt)} USDT in your Spot wallet` : 'Put the USDT in your Spot wallet first'}{capRoom != null ? ` · the cap allows ${usd(capRoom)} more` : ''}
          {:else}
            Available {usd(p.value_usdt)} USDT
          {/if}
        </p>

        {#if !(kind === 'out' && outAll)}
          <div class="mt-5 flex items-center rounded-2xl border border-edge bg-panel-2 px-4 py-3 focus-within:border-mint">
            <input
              class="w-full min-w-0 bg-transparent text-3xl font-semibold tabular-nums text-strong outline-none placeholder:text-muted/60"
              type="number"
              inputmode="decimal"
              min="1"
              step="any"
              placeholder="0.00"
              aria-label="Amount in USDT"
              bind:value={amountInput} />
            <span class="ml-2 text-sm font-medium text-muted">USDT</span>
          </div>
        {:else}
          <div class="mt-5 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3">
            <p class="text-sm font-semibold text-strong">Everything</p>
            <p class="text-xs text-muted">Sells their whole share. About {usd(p.value_usdt)} USDT before fees.</p>
          </div>
        {/if}

        {#if kind === 'out'}
          <div class="mt-3 flex flex-wrap gap-2">
            {#each [25, 50, 75] as f (f)}
              <button
                class="rounded-full border border-edge px-3 py-1 text-xs text-soft hover:bg-panel-2 disabled:opacity-40"
                disabled={outAll || p.value_usdt == null}
                onclick={() => (amountInput = String(Math.floor(((p.value_usdt ?? 0) * f) / 100 * 100) / 100))}>{f}%</button>
            {/each}
            <button
              class="rounded-full border px-3 py-1 text-xs {outAll ? 'border-danger/50 bg-danger/10 text-danger' : 'border-edge text-soft hover:bg-panel-2'}"
              aria-pressed={outAll}
              onclick={() => (outAll = !outAll)}>Everything</button>
          </div>
        {/if}

        <p class="mt-4 rounded-2xl bg-panel-2/70 p-3 text-xs leading-relaxed text-soft">
          {#if isIn}
            Moves the USDT into the sleeve and buys the index's coins at their weights. {p.name} gets units at today's price for what the orders add.
          {:else}
            Sells {p.name}'s slice of every coin. The USDT stays in your Spot wallet{p.owner ? '.' : `; you send it to ${p.name} yourself.`} The bot never sends money anywhere.
          {/if}
        </p>

        {#if !canTrade}<p class="mt-3 text-xs text-warn">Orders are off on this server{whyNot ? `: ${whyNot}` : '.'}</p>{/if}
        {#if result && !result.ok && result.step === 'check'}
          <div class="mt-3 rounded-2xl bg-danger/10 p-3 text-xs text-danger">
            <p>{result.message ?? 'The check failed.'}</p>
            {#if result.log.length}
              <details class="mt-1.5 text-soft"><summary class="cursor-pointer text-muted">Run log</summary><pre class="mt-1 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{result.log.join('\n')}</pre></details>
            {/if}
          </div>
        {/if}

        <button
          class="btn mt-5 w-full py-3 font-semibold text-white disabled:opacity-50 bg-accent hover:bg-accent/90"
          disabled={busy !== null || !canTrade || amount == null}
          onclick={check}>
          {busy === 'check' ? 'Checking…' : 'Review'}
        </button>
        <p class="mt-2 text-center text-[11px] text-muted">Nothing is placed until you confirm on the next step.</p>
      {:else if screen === 'review' && result}
        {@const r = result}
        {@const plan = r.outcome?.plan}
        {@const isIn = r.kind === 'in'}
        {@const ready = r.ok && r.outcome?.kind === 'preview'}
        <div class="mt-1 text-center">
          <p class="text-xs text-muted">{isIn ? `Add money for ${p.name}` : `Withdraw for ${p.name}`}</p>
          <p class="mt-1 text-[2rem] font-semibold leading-tight tracking-tight tabular-nums text-strong">
            {r.amount === 'all' ? 'Everything' : usd(r.amount)}
            {#if r.amount !== 'all'}<span class="text-base font-medium text-muted">USDT</span>{/if}
          </p>
        </div>

        <dl class="mt-5 divide-y divide-edge/60 rounded-2xl bg-panel-2/70 px-4 text-sm">
          <div class="flex justify-between gap-3 py-2.5"><dt class="text-muted">{isIn ? 'For' : 'From'}</dt><dd class="font-medium text-strong">{p.name}</dd></div>
          {#if plan?.buy.length}
            <div class="flex justify-between gap-3 py-2.5">
              <dt class="text-muted">Buys</dt>
              <dd class="text-right text-strong">{plan.buy.map((x) => (x.usdt == null ? x.asset : `${x.asset} ${usd(x.usdt)}`)).join(' · ')}</dd>
            </div>
          {/if}
          {#if plan?.sell.length}
            <div class="flex justify-between gap-3 py-2.5"><dt class="text-muted">Sells</dt><dd class="text-right text-strong">{plan.sell.map((x) => x.asset).join(' · ')}</dd></div>
          {/if}
          {#if estUnits != null}
            <div class="flex justify-between gap-3 py-2.5">
              <dt class="text-muted">{isIn ? 'Units, about' : 'Units cancelled, about'}</dt>
              <dd class="tabular-nums text-strong">{isIn ? '+' : '−'}{units(estUnits)}</dd>
            </div>
          {/if}
          <div class="flex justify-between gap-3 py-2.5"><dt class="text-muted">Unit price now</dt><dd class="tabular-nums text-strong">{uprice(v.unit_price)}</dd></div>
          <div class="flex justify-between gap-3 py-2.5">
            <dt class="text-muted">Account</dt>
            <dd class="font-medium {live ? 'text-danger' : 'text-strong'}">{live ? 'Binance live, real money' : 'Binance testnet'}</dd>
          </div>
        </dl>
        {#if r.outcome?.summary}<p class="mt-3 text-xs leading-relaxed text-muted">{r.outcome.summary}</p>{/if}
        {#if !isIn}<p class="mt-2 text-xs leading-relaxed text-muted">The payout lands in your Spot wallet after fees{p.owner ? '.' : `; send it to ${p.name} yourself.`}</p>{/if}

        {#if ready}
          <button
            class="btn mt-5 w-full py-3 font-semibold text-white disabled:opacity-50 {live ? 'bg-danger hover:bg-danger/90' : 'bg-accent hover:bg-accent/90'}"
            disabled={busy !== null}
            onclick={confirm}>
            {busy === 'run' ? 'Placing orders…' : `Confirm ${isIn ? 'money in' : 'withdrawal'}`}
          </button>
        {:else}
          <p class="mt-4 rounded-2xl bg-warn/10 p-3 text-xs text-warn">Nothing to place for this amount right now.</p>
        {/if}
        {#if r.log.length}
          <details class="mt-3 text-xs"><summary class="cursor-pointer text-muted">Run log</summary><pre class="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-panel-2 p-2 font-mono text-[11px] leading-snug text-soft">{r.log.join('\n')}</pre></details>
        {/if}
      {:else if screen === 'done' && result}
        {@const r = result}
        {@const isIn = r.kind === 'in'}
        <div class="mt-2 flex flex-col items-center text-center">
          <span class="grid h-16 w-16 place-items-center rounded-full {r.ok ? 'bg-mint/15 text-mint' : 'bg-danger/15 text-danger'}">
            {#if r.ok}<CircleCheck class="h-8 w-8" />{:else}<CircleX class="h-8 w-8" />{/if}
          </span>
          <p class="mt-3 text-lg font-semibold text-strong">{r.ok ? (isIn ? 'Money in done' : 'Withdrawal done') : 'Stopped'}</p>
          <p class="mt-1 text-sm text-muted">{r.ok ? r.outcome?.summary : r.message}</p>
        </div>
        {#if r.ok}
          <dl class="mt-5 divide-y divide-edge/60 rounded-2xl bg-panel-2/70 px-4 text-sm">
            <div class="flex justify-between py-2.5"><dt class="text-muted">{p.name} now</dt><dd class="font-semibold tabular-nums text-strong">{usd(p.value_usdt)} USDT</dd></div>
            <div class="flex justify-between py-2.5"><dt class="text-muted">Units</dt><dd class="tabular-nums text-strong">{units(p.units)}</dd></div>
            <div class="flex justify-between py-2.5"><dt class="text-muted">Share</dt><dd class="tabular-nums text-strong">{p.share_pct.toFixed(1)}%</dd></div>
          </dl>
          {#if !isIn}<p class="mt-3 rounded-2xl bg-accent/10 p-3 text-xs text-strong">The USDT is in your Spot wallet.{p.owner ? '' : ` Send it to ${p.name} yourself.`}</p>{/if}
        {/if}
        {#if r.log.length}
          <details class="mt-3 text-xs"><summary class="cursor-pointer text-muted">Run log</summary><pre class="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-panel-2 p-2 font-mono text-[11px] leading-snug text-soft">{r.log.join('\n')}</pre></details>
        {/if}
        <button class="btn-ghost mt-5 w-full py-3 font-semibold" onclick={() => ((screen = 'view'), (result = null))}>Done</button>
      {/if}
    </div>
  </div>
{/if}

{#if statement && view}
  {@const s = statement}
  {@const v = view}
  <div use:portal class="statement-overlay fixed inset-0 z-[210] overflow-auto p-3 sm:p-8" style="background: rgba(0, 0, 0, 0.62)" role="dialog" aria-modal="true" aria-label="Statement for {s.name}">
    <div class="no-print mx-auto mb-3 flex max-w-[680px] justify-end gap-2">
      <button class="btn bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-neutral-100" onclick={() => window.print()}><Printer class="h-3.5 w-3.5" /> Print / save as PDF</button>
      <button class="btn bg-white px-3 py-1.5 text-xs text-neutral-900 hover:bg-neutral-100" onclick={() => (statementId = null)}><X class="h-3.5 w-3.5" /> Close</button>
    </div>
    <article class="statement-paper mx-auto max-w-[680px] overflow-hidden rounded-2xl bg-white text-neutral-800 shadow-xl">
      <!-- Letterhead -->
      <header class="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 pb-5 pt-6 sm:px-10 sm:pt-8">
        <div>
          <p class="text-lg font-semibold tracking-tight text-neutral-900">Pasta<span class="text-emerald-700">trade101</span></p>
          <p class="mt-0.5 text-xs text-neutral-500">Rotation sleeve{live ? '' : ' · testnet, demo money'}</p>
        </div>
        <div class="text-right">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Statement</p>
          <p class="mt-0.5 text-xs text-neutral-700">{day(v.as_of)}</p>
        </div>
      </header>

      <div class="px-6 py-6 sm:px-10 sm:py-8">
        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Account holder</p>
        <h1 class="mt-1 text-xl font-semibold text-neutral-900">{s.name}</h1>

        <!-- Balance -->
        <section class="mt-5 rounded-xl border border-neutral-200 px-5 py-4">
          <p class="text-xs text-neutral-500">Value now</p>
          <p class="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">{usd(s.value_usdt)} <span class="text-sm font-medium text-neutral-500">USDT</span></p>
          {#if s.put_in_usdt > 0}
            <p class="mt-1 text-sm font-medium tabular-nums {paperTone(s.gain_usdt)}">{signedUsd(s.gain_usdt)} USDT ({pct(s.gain_pct)}) all time</p>
          {/if}
        </section>

        <!-- Summary -->
        <section class="mt-7">
          <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Summary</h2>
          <dl class="mt-1 divide-y divide-neutral-100 text-sm">
            {#each statementRows as r (r.label)}
              <div class="flex items-baseline justify-between gap-4 py-2.5">
                <dt class="text-neutral-600">{r.label}</dt>
                <dd class="shrink-0 text-right font-medium tabular-nums {r.cls ?? 'text-neutral-900'}">{r.value}</dd>
              </div>
            {/each}
          </dl>
        </section>

        <!-- Transactions -->
        <section class="mt-7">
          <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Transactions</h2>
          <ul class="mt-1 divide-y divide-neutral-100">
            {#each statementEntries as e (e.id)}
              {@const out = e.kind === 'withdrawal'}
              <li class="flex items-start justify-between gap-4 py-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-neutral-900">{e.kind === 'opening' ? 'Opening balance' : KIND[e.kind]}</p>
                  <p class="mt-0.5 text-xs text-neutral-500">{day(e.at)} · {e.units >= 0 ? '+' : '−'}{units(Math.abs(e.units))} units at {uprice(e.unit_price)}</p>
                </div>
                <p class="shrink-0 text-sm font-semibold tabular-nums {out ? 'text-neutral-900' : 'text-emerald-700'}">{out ? '−' : '+'}{usd(e.usdt)}</p>
              </li>
            {/each}
          </ul>
          <div class="flex items-baseline justify-between gap-4 border-t border-neutral-300 pt-2.5 text-sm">
            <span class="text-neutral-600">Units held now</span>
            <span class="font-semibold tabular-nums text-neutral-900">{units(s.units)}</span>
          </div>
        </section>

        {#if sleeveHoldings.length}
          <section class="mt-7">
            <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">What the sleeve holds</h2>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each sleeveHoldings as h (h.asset)}
                <span class="rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-700">
                  <span class="font-medium text-neutral-900">{h.asset}</span>{h.share != null ? ` ${h.share.toFixed(0)}%` : ''}
                </span>
              {/each}
            </div>
            <p class="mt-2 text-xs text-neutral-500">It copies the Pastatrade Rotation Index (Balanced): a weekly review picks the strongest of the biggest coins on Binance.</p>
          </section>
        {/if}

        <footer class="mt-8 border-t border-neutral-200 pt-3 text-[11px] leading-relaxed text-neutral-500">
          <p>Prices from Binance at {when(v.as_of)}.</p>
          <p class="mt-1">
            How your share works: the sleeve is split into units. Money in adds units and money out cancels them at that day's unit price, so your share only changes with your own money in and out; gains and losses move the unit price for everyone by the same percentage. Crypto prices go down as well as up, and past results don't promise future ones. Not financial advice.
          </p>
        </footer>
      </div>
    </article>
  </div>
{/if}

<style>
  /* The sleeve card: deep green for the live account, deep blue for testnet, so the two never look alike. */
  .hero-live {
    background: linear-gradient(155deg, #17493a 0%, #0f3429 55%, #0a271f 100%);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 12px 30px rgb(0 0 0 / 0.22);
  }
  .hero-test {
    background: linear-gradient(155deg, #1e3358 0%, #152643 55%, #0f1c33 100%);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 12px 30px rgb(0 0 0 / 0.22);
  }
  @media print {
    :global(body *) {
      visibility: hidden;
    }
    :global(.statement-paper),
    :global(.statement-paper *) {
      visibility: visible;
    }
    .statement-overlay {
      position: absolute;
      inset: 0 auto auto 0;
      width: 100%;
      overflow: visible;
      background: white !important;
      padding: 0;
    }
    .statement-paper {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      max-width: none;
      box-shadow: none;
      border-radius: 0;
    }
    .no-print {
      display: none !important;
    }
  }
</style>
