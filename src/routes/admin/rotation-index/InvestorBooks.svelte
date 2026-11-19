<script lang="ts">
  import { Users, UserPlus, ArrowDownToLine, ArrowUpFromLine, FileText, Pencil, Printer, X } from '@lucide/svelte';
  import { api } from '$lib/api';
  import EChart from '$lib/components/EChart.svelte';
  import { axisTooltip, categorical, grid, lineSeries, timeAxis, valueAxis } from '$lib/charts/presets';

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
  interface Action { kind: 'in' | 'out'; id: string; name: string }

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
  let newName = $state('');
  let newNote = $state('');
  let editing = $state<{ id: string; name: string; note: string } | null>(null);
  let action = $state<Action | null>(null);
  let amountInput = $state('');
  let outAll = $state(false);
  let result = $state<(BotResult & { kind: 'check' | 'run'; action: Action; amount: number | 'all' }) | null>(null);
  let statementId = $state<string | null>(null);
  let showAllEntries = $state(false);

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
    action = null;
    result = null;
    statementId = null;
    confirmStart = false;
    load(m);
  });

  const usd = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const signedUsd = (n: number | null | undefined) => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`);
  const pct = (n: number | null | undefined, digits = 1) => {
    if (n == null) return '—';
    // A tiny negative that rounds to zero reads as "+0.0%", not "-0.0%".
    const v = Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n;
    return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
  };
  const tone = (n: number | null | undefined) => (n == null ? 'text-muted' : n >= 0 ? 'text-mint' : 'text-danger');
  const units = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const uprice = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(4));
  const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const KIND: Record<Entry['kind'], string> = { opening: 'Books opened', deposit: 'Money in', withdrawal: 'Money out', fee: 'Fee', adjustment: 'Correction' };

  const sinceOpening = $derived(view?.unit_price != null && view.opening_unit_price ? (view.unit_price / view.opening_unit_price - 1) * 100 : null);
  const withMoney = $derived(view?.investors.filter((i) => i.units > 1e-9).length ?? 0);
  const live = $derived(mode === 'live');

  const run = async (fn: () => Promise<void>, kind: NonNullable<typeof busy>) => {
    busy = kind;
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
      await load(mode);
    }, 'add');

  const saveEdit = () =>
    run(async () => {
      if (!editing) return;
      await api(`/admin/rotation-index/bot/${mode}/fund/investors/${encodeURIComponent(editing.id)}`, { auth: true, method: 'PATCH', body: { name: editing.name, note: editing.note } });
      editing = null;
      await load(mode);
    }, 'edit');

  const openAction = (kind: Action['kind'], inv: Investor) => {
    action = { kind, id: inv.id, name: inv.name };
    amountInput = '';
    outAll = false;
    result = null;
    formError = '';
  };

  const actionAmount = (): number | 'all' | null => {
    if (action?.kind === 'out' && outAll) return 'all';
    const n = Number(amountInput);
    return n > 0 ? n : null;
  };
  const bodyFor = (a: Action, amount: number | 'all') => (a.kind === 'in' ? { topUp: amount, investorId: a.id } : { withdraw: amount, investorId: a.id });

  /** First step: what the money in / out would do now (nothing is placed). */
  const check = async () => {
    const a = action;
    const amount = actionAmount();
    if (!a || amount == null) return;
    busy = 'check';
    result = null;
    try {
      const r = await api<BotResult>(`/admin/rotation-index/bot/${mode}/preview`, { auth: true, method: 'POST', body: bodyFor(a, amount) });
      result = { ...r, kind: 'check', action: a, amount };
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : 'The check failed.', log: [], kind: 'check', action: a, amount };
    } finally {
      busy = null;
    }
  };

  /** Second step: place the orders the check showed. */
  const confirm = async () => {
    const r0 = result;
    if (!r0) return;
    const plan = r0.outcome?.plan;
    const expect = { sell: plan?.sell.map((x) => x.asset) ?? [], buy: plan?.buy.map((x) => x.asset) ?? [] };
    busy = 'run';
    try {
      const r = await api<BotResult>(`/admin/rotation-index/bot/${mode}/run`, { auth: true, method: 'POST', body: { ...bodyFor(r0.action, r0.amount), confirm: true, expect } });
      result = { ...r, kind: 'run', action: r0.action, amount: r0.amount };
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : 'The run failed.', log: [], kind: 'run', action: r0.action, amount: r0.amount };
    } finally {
      busy = null;
      await Promise.all([load(mode), onChanged()]);
    }
  };

  /** Show the statement above everything, as a child of <body>: it prints from the top of the page. */
  const portal = (node: HTMLElement) => {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  };
  const lastOut = (id: string) => [...(view?.entries ?? [])].find((e) => e.investor_id === id && e.kind === 'withdrawal')?.at ?? null;

  const target = $derived(action ? view?.investors.find((i) => i.id === action!.id) ?? null : null);
  const statement = $derived(statementId ? view?.investors.find((i) => i.id === statementId) ?? null : null);
  const statementEntries = $derived(statementId ? [...(view?.entries ?? [])].filter((e) => e.investor_id === statementId).reverse() : []);
  const sleeveHoldings = $derived.by(() => {
    const total = holdings.reduce((x, h) => x + (h.value_usdt ?? 0), 0);
    return holdings.map((h) => ({ asset: h.asset, share: total > 0 && h.value_usdt != null ? (h.value_usdt / total) * 100 : null }));
  });

  const chart = $derived.by(() => {
    const h = [...(view?.history ?? [])];
    const today = view?.as_of.slice(0, 10);
    if (view?.unit_price != null && today) {
      if (h.length && h[h.length - 1].date === today) h[h.length - 1] = { date: today, unit_price: view.unit_price };
      else h.push({ date: today, unit_price: view.unit_price });
    }
    if (h.length < 2) return null;
    const label = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return {
      backgroundColor: 'transparent',
      useUTC: true,
      grid: grid({ top: 12, right: 20 }),
      tooltip: axisTooltip({ valueFormatter: (v: number) => `${v.toFixed(4)} USDT`, axisPointer: { label: { formatter: ({ value }: { value: number }) => label(value) } } }),
      xAxis: timeAxis({ splitLine: { show: false }, minInterval: 86_400_000, axisLabel: { formatter: label, hideOverlap: true } }),
      yAxis: valueAxis({ scale: true, axisLabel: { formatter: (v: number) => v.toFixed(3) } }),
      series: [lineSeries({ name: 'Unit price', color: $categorical[1], width: 2, data: h.map((p) => [Date.parse(`${p.date}T00:00:00Z`), p.unit_price]) })]
    };
  });
</script>

<div class="card">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="flex items-center gap-1.5 text-sm font-semibold text-strong"><Users class="h-4 w-4 text-accent" /> Investors</h2>
    <span class="pill {live ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent'}">{live ? 'Live sleeve' : 'Testnet sleeve'}</span>
  </div>
  <p class="mt-1 max-w-3xl text-[11px] leading-snug text-muted">
    The sleeve is split into units, like a fund. Money in buys units at today's unit price; money out cancels them at today's price. Gains and losses move the unit price, so everyone's share grows or shrinks by the same percentage — nobody's money mixes with anyone else's. Each person carries the trading fees of their own money in and out.
  </p>

  {#if loadError}
    <p class="mt-3 text-xs text-warn">{loadError}</p>
  {:else if !view}
    <p class="mt-3 text-xs text-muted">{loading ? 'Reading the books…' : ''}</p>
  {:else if !view.started}
    {@const v = view}
    <div class="mt-3 rounded-lg border border-edge/60 p-3 text-xs text-soft">
      {#if !v.sleeve_started}
        <p>The sleeve has not made its first run yet. Start the books after it has bought its coins.</p>
      {:else if !v.can_edit}
        <p class="text-warn">{v.why_not}</p>
      {:else}
        <p class="font-semibold text-strong">Start the books</p>
        <p class="mt-1">Everything in the sleeve today is yours: you get one unit for every USDT you have put in so far. After that, add each friend and put their money in through the books — the sleeve then knows who owns what.</p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <input class="input-sm w-48" placeholder="Your name" bind:value={ownerName} maxlength="60" />
          {#if !confirmStart}
            <button class="btn-ghost px-3 py-1.5 text-xs" disabled={!ownerName.trim() || busy !== null} onclick={() => (confirmStart = true)}>Start the books</button>
          {:else}
            <span class="text-strong">Start the {live ? 'live' : 'testnet'} books with {ownerName.trim()} owning 100%?</span>
            <button class="btn bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90" disabled={busy !== null} onclick={startBooks}>{busy === 'start' ? 'Starting…' : 'Yes, start'}</button>
            <button class="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onclick={() => (confirmStart = false)}>Cancel</button>
          {/if}
        </div>
        <p class="mt-1.5 text-[11px] text-muted">This only writes the books — no order is placed.</p>
      {/if}
      {#if formError}<p class="mt-2 text-danger">{formError}</p>{/if}
    </div>
  {:else}
    {@const v = view}
    {#if v.price_error}<p class="mt-2 text-[11px] text-warn">{v.price_error} Values show once Binance prices are back.</p>{/if}
    {#each v.problems as p (p)}<p class="mt-2 text-[11px] text-danger">Books check: {p}</p>{/each}

    <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div>
        <p class="text-[11px] text-muted">Unit price</p>
        <p class="text-lg font-semibold text-strong">{uprice(v.unit_price)} <span class="text-xs font-normal text-muted">USDT</span></p>
      </div>
      <div>
        <p class="text-[11px] text-muted">Since the books opened</p>
        <p class="text-lg font-semibold {tone(sinceOpening)}">{pct(sinceOpening, 2)}</p>
      </div>
      <div>
        <p class="text-[11px] text-muted">Sleeve value</p>
        <p class="text-lg font-semibold text-strong">{usd(v.value_usdt)} <span class="text-xs font-normal text-muted">USDT</span></p>
      </div>
      <div>
        <p class="text-[11px] text-muted">Units · people with money</p>
        <p class="text-lg font-semibold text-strong">{units(v.units)} <span class="text-xs font-normal text-muted">· {withMoney}</span></p>
      </div>
    </div>
    <p class="mt-1 text-[11px] text-muted">Books opened {day(v.started_at)} at {uprice(v.opening_unit_price)} USDT a unit · prices from Binance {mode}, {when(v.as_of)}.</p>

    {#snippet who(i: Investor)}
      {#if editing?.id === i.id}
        <div class="flex flex-col gap-1">
          <input class="input-sm w-40" bind:value={editing.name} maxlength="60" />
          <input class="input-sm w-40" placeholder="Note" bind:value={editing.note} maxlength="200" />
          <div class="flex gap-1">
            <button class="btn-ghost px-2 py-1 text-[11px]" disabled={busy !== null} onclick={saveEdit}>{busy === 'edit' ? 'Saving…' : 'Save'}</button>
            <button class="btn-ghost px-2 py-1 text-[11px]" onclick={() => (editing = null)}>Cancel</button>
          </div>
        </div>
      {:else}
        <p class="font-semibold text-strong">
          {i.name}{#if i.owner}<span class="ml-1.5 rounded-sm bg-accent/15 px-1 py-px text-[10px] font-medium text-accent">owner</span>{/if}
          <button class="ml-1 text-muted hover:text-strong" title="Rename or change the note" onclick={() => (editing = { id: i.id, name: i.name, note: i.note })}><Pencil class="inline h-3 w-3" /></button>
        </p>
        <p class="text-[11px] text-muted">{units(i.units)} units{i.note && !i.owner ? ` · ${i.note}` : ''}{i.provisional ? ' · units at the plain price (an order was interrupted)' : ''}</p>
      {/if}
    {/snippet}
    {#snippet buttons(i: Investor)}
      <div class="flex justify-end gap-1">
        <button class="rounded p-1 text-mint hover:bg-mint/10" title="Money in" disabled={busy !== null} onclick={() => openAction('in', i)}><ArrowDownToLine class="h-4 w-4" /></button>
        <button class="rounded p-1 text-danger hover:bg-danger/10 disabled:opacity-30" title="Money out" disabled={busy !== null || !(i.units > 0)} onclick={() => openAction('out', i)}><ArrowUpFromLine class="h-4 w-4" /></button>
        <button class="rounded p-1 text-soft hover:bg-edge disabled:opacity-30" title="Statement" disabled={!(i.put_in_usdt > 0)} onclick={() => (statementId = i.id)}><FileText class="h-4 w-4" /></button>
      </div>
    {/snippet}

    <!-- Phones: one card per person, the buttons in reach. -->
    <div class="mt-3 space-y-2 sm:hidden">
      {#each v.investors as i (i.id)}
        <div class="rounded-lg border border-edge/60 p-2.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">{@render who(i)}</div>
            <div class="shrink-0 text-right">
              <p class="font-semibold text-strong">{usd(i.value_usdt)} <span class="text-[11px] font-normal text-muted">USDT</span></p>
              <p class="text-[11px] {tone(i.gain_usdt)}">{signedUsd(i.gain_usdt)} ({pct(i.gain_pct)})</p>
            </div>
          </div>
          <div class="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span>{i.share_pct.toFixed(1)}% · in {usd(i.put_in_usdt)} · out {usd(i.taken_out_usdt)}</span>
            {@render buttons(i)}
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-3 hidden sm:block">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-[11px] text-muted">
            <th class="py-1 font-medium">Person</th>
            <th class="py-1 text-right font-medium">Share</th>
            <th class="py-1 text-right font-medium">Value</th>
            <th class="py-1 text-right font-medium">Put in</th>
            <th class="py-1 text-right font-medium">Taken out</th>
            <th class="py-1 text-right font-medium">Gain</th>
            <th class="py-1 text-right font-medium">Since joined</th>
            <th class="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {#each v.investors as i (i.id)}
            <tr class="border-t border-edge/60 align-top">
              <td class="py-1.5">{@render who(i)}</td>
              <td class="py-1.5 text-right text-soft">{i.share_pct.toFixed(1)}%</td>
              <td class="py-1.5 text-right font-semibold text-strong">{usd(i.value_usdt)}</td>
              <td class="py-1.5 text-right text-soft">{usd(i.put_in_usdt)}</td>
              <td class="py-1.5 text-right text-soft">{usd(i.taken_out_usdt)}</td>
              <td class="py-1.5 text-right {tone(i.gain_usdt)}">{signedUsd(i.gain_usdt)}<span class="block text-[11px]">{pct(i.gain_pct)}</span></td>
              <td class="py-1.5 text-right {tone(i.since_joined_pct)}">{i.first_at ? pct(i.since_joined_pct) : i.taken_out_usdt > 0 ? 'all out' : '—'}</td>
              <td class="py-1.5 text-right">{@render buttons(i)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="mt-1 text-[11px] text-muted">Gain = value now + taken out − put in, after the fees of their own orders. "Since joined" is the unit price's change since their first money in — what the sleeve did while they were in.</p>

    {#if action && target}
      {@const a = action}
      {@const t = target}
      <div class="mt-3 rounded-lg border {a.kind === 'in' ? 'border-mint/40' : 'border-danger/40'} p-3 text-xs">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-semibold text-strong">{a.kind === 'in' ? `Money in for ${a.name}` : `Money out to ${a.name}`}</p>
          <button class="text-muted hover:text-strong" title="Close" onclick={() => ((action = null), (result = null))}><X class="h-4 w-4" /></button>
        </div>
        <p class="mt-1 leading-snug text-muted">
          {#if a.kind === 'in'}
            First put the USDT in your Binance Spot wallet. This moves it into the sleeve and buys the index's coins at its weights; {a.name} gets units at today's price for what the orders add.
            {outsideUsdt != null ? `${usd(outsideUsdt)} USDT in Spot is outside the sleeve` : ''}{capRoom != null ? ` · the cap allows ${usd(capRoom)} more` : ''}.
          {:else}
            Sells {a.name}'s slice of every coin and takes their slice of the cash. The USDT lands in your Spot wallet, outside the sleeve — you send it to {a.name} yourself; the bot never sends money anywhere. Their share now: {usd(t.value_usdt)} USDT.
          {/if}
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-soft">
          {#if a.kind === 'out'}
            <label class="flex items-center gap-1"><input type="checkbox" bind:checked={outAll} /> Everything</label>
          {/if}
          {#if !(a.kind === 'out' && outAll)}
            <input class="input-sm w-28" type="number" min="1" step="1" bind:value={amountInput} placeholder="USDT" />
            USDT
            {#if a.kind === 'out' && t.value_usdt != null}<button class="text-[11px] text-accent hover:underline" onclick={() => (amountInput = String(Math.floor((t.value_usdt ?? 0) * 100) / 100))}>max {usd(t.value_usdt)}</button>{/if}
          {/if}
          <button class="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null || !canTrade || actionAmount() == null} onclick={check}>{busy === 'check' ? 'Checking…' : 'Check'}</button>
        </div>
        {#if !canTrade}<p class="mt-2 text-[11px] text-warn">Orders are off on this server{whyNot ? `: ${whyNot}` : '.'}</p>{/if}

        {#if result && result.action.id === a.id && result.action.kind === a.kind}
          {@const r = result}
          {@const plan = r.outcome?.plan}
          <div class="mt-3 rounded-lg border {r.ok ? 'border-edge' : 'border-danger/40'} bg-panel-2/60 p-3">
            <p class="font-semibold {r.ok ? 'text-strong' : 'text-danger'}">{r.kind === 'run' ? (r.ok ? 'Done' : 'Stopped') : 'Check'} · {r.ok ? r.outcome?.summary : r.message}</p>
            {#if plan && (plan.sell.length || plan.buy.length)}
              <div class="mt-2 space-y-0.5 text-soft">
                {#if plan.sell.length}<p><span class="text-danger">Sell</span> {plan.sell.map((x) => x.asset).join(', ')}</p>{/if}
                {#if plan.buy.length}<p><span class="text-mint">Buy</span> {plan.buy.map((x) => (x.usdt == null ? x.asset : `${x.asset} ~${usd(x.usdt)} USDT`)).join(', ')}</p>{/if}
              </div>
            {/if}
            {#if r.kind === 'check' && r.ok && r.outcome?.kind === 'preview'}
              <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-edge/60 pt-3">
                <span class="text-strong">
                  {a.kind === 'in' ? `Put ${usd(r.amount as number)} USDT in for ${a.name}` : `Pay ${r.amount === 'all' ? 'everything' : `${usd(r.amount as number)} USDT`} out to ${a.name}`}{live ? ' with real money on Binance?' : ' on Binance testnet?'}
                </span>
                <button class="btn px-3 py-1.5 text-xs font-semibold text-white {live ? 'bg-danger hover:bg-danger/90' : 'bg-accent hover:bg-accent/90'}" disabled={busy !== null} onclick={confirm}>
                  {busy === 'run' ? 'Placing orders…' : 'Place orders'}
                </button>
                <button class="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onclick={() => (result = null)}>Cancel</button>
              </div>
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

    {#if v.can_edit}
      <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-soft">
        <UserPlus class="h-4 w-4 text-muted" />
        <input class="input-sm w-40" placeholder="Friend's name" bind:value={newName} maxlength="60" />
        <input class="input-sm w-48" placeholder="Note (optional)" bind:value={newNote} maxlength="200" />
        <button class="btn-ghost px-3 py-1.5 text-xs" disabled={!newName.trim() || busy !== null} onclick={addPerson}>{busy === 'add' ? 'Adding…' : 'Add person'}</button>
        <span class="text-[11px] text-muted">Adding a person moves no money — put their money in with ↓ once it is in your Spot wallet.</span>
      </div>
    {/if}
    {#if formError}<p class="mt-2 text-xs text-danger">{formError}</p>{/if}

    {#if chart}
      <div class="mt-4">
        <p class="text-[11px] text-muted">Unit price (USDT) — the sleeve's growth with money in and out taken out of the picture</p>
        <EChart option={chart} height={170} />
      </div>
    {/if}

    {#if v.entries.length}
      <div class="mt-4 border-t border-edge/60 pt-3">
        <h3 class="text-xs font-semibold text-strong">The books</h3>
        <div class="mt-1 overflow-x-auto">
          <table class="w-full min-w-[560px] text-xs">
            <thead>
              <tr class="text-left text-[11px] text-muted">
                <th class="py-1 font-medium">When</th><th class="py-1 font-medium">Person</th><th class="py-1 font-medium">What</th>
                <th class="py-1 text-right font-medium">USDT</th><th class="py-1 text-right font-medium">Units</th><th class="py-1 text-right font-medium">Unit price</th><th class="py-1 text-right font-medium">Fees</th>
              </tr>
            </thead>
            <tbody>
              {#each showAllEntries ? v.entries : v.entries.slice(0, 10) as e (e.id)}
                <tr class="border-t border-edge/60">
                  <td class="py-1 text-muted">{when(e.at)}</td>
                  <td class="py-1 text-strong">{e.investor_name}</td>
                  <td class="py-1 {e.kind === 'deposit' ? 'text-mint' : e.kind === 'withdrawal' ? 'text-danger' : 'text-soft'}">{KIND[e.kind]}{e.provisional ? ' (plain price)' : ''}</td>
                  <td class="py-1 text-right text-soft">{e.kind === 'withdrawal' ? '−' : ''}{usd(e.usdt)}</td>
                  <td class="py-1 text-right text-soft">{e.units >= 0 ? '+' : '−'}{units(Math.abs(e.units))}</td>
                  <td class="py-1 text-right text-soft">{uprice(e.unit_price)}</td>
                  <td class="py-1 text-right text-muted">{e.cost_usdt > 0 ? usd(e.cost_usdt) : '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if v.entries.length > 10}
          <button class="mt-1 text-[11px] font-medium text-accent hover:underline" onclick={() => (showAllEntries = !showAllEntries)}>{showAllEntries ? 'Show fewer' : `Show all ${v.entries.length}`}</button>
        {/if}
      </div>
    {/if}
  {/if}
</div>

{#if statement && view}
  {@const s = statement}
  {@const v = view}
  <div use:portal class="statement-overlay fixed inset-0 z-[200] overflow-auto p-3 sm:p-8" style="background: rgba(0, 0, 0, 0.62)" role="dialog" aria-modal="true" aria-label="Statement for {s.name}">
    <div class="no-print mx-auto mb-3 flex max-w-[760px] justify-end gap-2">
      <button class="btn bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-neutral-100" onclick={() => window.print()}><Printer class="h-3.5 w-3.5" /> Print / save as PDF</button>
      <button class="btn bg-white px-3 py-1.5 text-xs text-neutral-900 hover:bg-neutral-100" onclick={() => (statementId = null)}><X class="h-3.5 w-3.5" /> Close</button>
    </div>
    <article class="statement-paper mx-auto max-w-[760px] rounded-lg bg-white p-6 text-neutral-800 shadow-xl sm:p-10">
      <header class="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Statement</p>
          <h1 class="mt-1 text-2xl font-semibold text-neutral-900">{s.name}</h1>
          <p class="mt-0.5 text-sm text-neutral-600">Share of the Pastatrade rotation sleeve{live ? '' : ' (testnet — demo money)'}</p>
        </div>
        <div class="text-right text-xs text-neutral-500">
          <p>As of {when(v.as_of)}</p>
          <p>Prices from Binance</p>
        </div>
      </header>

      <section class="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <div><p class="text-[11px] text-neutral-500">Your value now</p><p class="text-2xl font-semibold text-neutral-900">{usd(s.value_usdt)} <span class="text-xs font-normal text-neutral-500">USDT</span></p></div>
        <div><p class="text-[11px] text-neutral-500">Gain</p><p class="text-2xl font-semibold {s.gain_usdt != null && s.gain_usdt < 0 ? 'text-red-700' : 'text-emerald-700'}">{signedUsd(s.gain_usdt)} <span class="text-sm">({pct(s.gain_pct)})</span></p></div>
        <div><p class="text-[11px] text-neutral-500">Share of the sleeve</p><p class="text-2xl font-semibold text-neutral-900">{s.share_pct.toFixed(2)}%</p></div>
        <div><p class="text-[11px] text-neutral-500">Put in</p><p class="text-base font-semibold text-neutral-900">{usd(s.put_in_usdt)} USDT</p></div>
        <div><p class="text-[11px] text-neutral-500">Taken out</p><p class="text-base font-semibold text-neutral-900">{usd(s.taken_out_usdt)} USDT</p></div>
        <div><p class="text-[11px] text-neutral-500">Units held</p><p class="text-base font-semibold text-neutral-900">{units(s.units)}</p></div>
      </section>

      <section class="mt-5 rounded-md bg-neutral-50 p-4 text-sm text-neutral-700">
        {#if s.first_at}
          <p>
            Unit price <strong class="text-neutral-900">{uprice(v.unit_price)} USDT</strong> today, against <strong class="text-neutral-900">{uprice(s.first_unit_price)}</strong> when you joined on {day(s.first_at)}: the sleeve has moved
            <strong class={s.since_joined_pct != null && s.since_joined_pct < 0 ? 'text-red-700' : 'text-emerald-700'}>{pct(s.since_joined_pct)}</strong> while you were in.
            Fees on your own money in and out so far: {usd(s.cost_usdt)} USDT.
          </p>
        {:else}
          <p>
            You have taken all your money out{lastOut(s.id) ? ` (last on ${day(lastOut(s.id))})` : ''}: {usd(s.put_in_usdt)} USDT in, {usd(s.taken_out_usdt)} USDT out, a result of
            <strong class={s.gain_usdt != null && s.gain_usdt < 0 ? 'text-red-700' : 'text-emerald-700'}>{signedUsd(s.gain_usdt)} USDT</strong> after {usd(s.cost_usdt)} USDT of fees.
          </p>
        {/if}
      </section>

      <section class="mt-6">
        <h2 class="text-sm font-semibold text-neutral-900">Your money in and out</h2>
        <table class="mt-2 w-full text-sm">
          <thead>
            <tr class="border-b border-neutral-200 text-left text-[11px] text-neutral-500">
              <th class="py-1.5 font-medium">Date</th><th class="py-1.5 font-medium">What</th><th class="py-1.5 text-right font-medium">USDT</th><th class="py-1.5 text-right font-medium">Unit price</th><th class="py-1.5 text-right font-medium">Units</th>
            </tr>
          </thead>
          <tbody>
            {#each statementEntries as e (e.id)}
              <tr class="border-b border-neutral-100">
                <td class="py-1.5 text-neutral-600">{day(e.at)}</td>
                <td class="py-1.5">{e.kind === 'opening' ? 'Opening balance' : KIND[e.kind]}</td>
                <td class="py-1.5 text-right">{e.kind === 'withdrawal' ? '−' : ''}{usd(e.usdt)}</td>
                <td class="py-1.5 text-right text-neutral-600">{uprice(e.unit_price)}</td>
                <td class="py-1.5 text-right">{e.units >= 0 ? '+' : '−'}{units(Math.abs(e.units))}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr><td class="pt-2 text-neutral-500" colspan="4">Units held now</td><td class="pt-2 text-right font-semibold text-neutral-900">{units(s.units)}</td></tr>
          </tfoot>
        </table>
      </section>

      {#if sleeveHoldings.length}
        <section class="mt-6">
          <h2 class="text-sm font-semibold text-neutral-900">What the sleeve holds now</h2>
          <p class="mt-1 text-sm text-neutral-700">
            {#each sleeveHoldings as h, idx (h.asset)}{idx ? ' · ' : ''}{h.asset}{h.share != null ? ` ${h.share.toFixed(0)}%` : ''}{/each}
          </p>
          <p class="mt-1 text-xs text-neutral-500">It copies the Pastatrade Rotation Index (Balanced): a weekly review picks the strongest of the biggest coins on Binance.</p>
        </section>
      {/if}

      <footer class="mt-8 border-t border-neutral-200 pt-3 text-[11px] leading-relaxed text-neutral-500">
        How your share works: the sleeve is split into units. When money comes in or goes out, units are added or cancelled at that day's unit price, so your share only changes with your own money in and out; gains and losses change the unit price for everyone by the same percentage. Crypto prices go down as well as up, and past results don't promise future ones. Not financial advice.
      </footer>
    </article>
  </div>
{/if}

<style>
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
