<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowDownLeft, ArrowUpRight, BookOpen, RefreshCw, Wallet } from '@lucide/svelte';
  import { api } from '$lib/api';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import { categorical } from '$lib/charts/presets';

  // A member's own share of the rotation sleeve, view only. The admin links the account
  // to a person in the investor books; the server sends only that person's figures.

  type Mode = 'live' | 'testnet';
  interface Investment {
    mode: Mode;
    as_of: string;
    name: string;
    price_error: string | null;
    value_usdt: number | null;
    units: number;
    unit_price: number | null;
    put_in_usdt: number;
    taken_out_usdt: number;
    gain_usdt: number | null;
    gain_pct: number | null;
    cost_usdt: number;
    first_at: string | null;
    first_unit_price: number | null;
    since_joined_pct: number | null;
    holdings: { asset: string; value_usdt: number; weight_pct: number }[];
    entries: { at: string; kind: 'opening' | 'deposit' | 'withdrawal' | 'fee' | 'adjustment'; usdt: number; units: number; unit_price: number; provisional: boolean }[];
    history: { date: string; value_usdt: number }[];
  }

  let items = $state<Investment[] | null>(null);
  let error = $state('');
  let loading = $state(false);
  let pick = $state<Mode>('live');
  let showAll = $state(false);

  const load = async () => {
    loading = true;
    try {
      const r = await api<{ items: Investment[] }>('/me/investments', { auth: true, timeoutMs: 20_000 });
      items = r.items;
      error = '';
      if (r.items.length && !r.items.some((i) => i.mode === pick)) pick = r.items[0].mode;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load your investment.';
    } finally {
      loading = false;
    }
  };
  onMount(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 60_000);
    return () => clearInterval(t);
  });

  const inv = $derived(items?.find((i) => i.mode === pick) ?? items?.[0] ?? null);

  /* Signs and colours follow the rounded figure, so +0.004 reads as a plain 0.00. */
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
  const tone = (n: number | null | undefined, digits = 2) => {
    if (n == null) return 'text-muted';
    const v = round(n, digits);
    return v > 0 ? 'text-mint' : v < 0 ? 'text-danger' : 'text-soft';
  };
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const KIND = { opening: 'Opening balance', deposit: 'Money in', withdrawal: 'Withdrawal', fee: 'Fee', adjustment: 'Correction' } as const;
  const coinColor = (i: number) => (i < 0 ? 'rgb(var(--c-muted))' : $categorical[i % $categorical.length]);
</script>

<Seo title="My investment" description="Your share of the Pastatrade rotation sleeve." noindex />

<div class="mx-auto max-w-2xl space-y-5 pb-10">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold text-strong">My investment</h1>
      <p class="text-sm text-muted">Your share of the rotation sleeve · view only</p>
    </div>
    <button
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-panel-2 hover:text-strong disabled:opacity-40"
      title="Refresh"
      aria-label="Refresh"
      disabled={loading}
      onclick={load}><RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" /></button>
  </div>

  {#if error && !items}
    <div class="card text-sm text-warn">{error}</div>
  {:else if !items}
    <div class="h-56 animate-pulse rounded-3xl bg-panel-2/70"></div>
    <div class="h-40 animate-pulse rounded-3xl bg-panel-2/50"></div>
  {:else if !inv}
    <div class="card flex flex-col items-center py-10 text-center">
      <span class="grid h-14 w-14 place-items-center rounded-full bg-panel-2 text-muted"><Wallet class="h-6 w-6" /></span>
      <p class="mt-3 font-semibold text-strong">No investment on this account</p>
      <p class="mt-1 max-w-sm text-sm text-muted">When Pastatrade101 links your share to this account, your balance and holdings show here.</p>
    </div>
  {:else}
    {@const i = inv}
    {@const live = i.mode === 'live'}
    {#if items.length > 1}
      <div class="inline-flex rounded-full bg-panel-2 p-1 text-sm">
        {#each items as it (it.mode)}
          <button
            class="rounded-full px-4 py-1.5 font-medium transition {pick === it.mode ? 'bg-panel text-strong shadow-sm' : 'text-muted hover:text-strong'}"
            onclick={() => (pick = it.mode)}>{it.mode === 'live' ? 'Live' : 'Testnet'}</button>
        {/each}
      </div>
    {/if}
    {#if i.price_error}<p class="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">{i.price_error}</p>{/if}

    <!-- Balance card -->
    <div class="flex flex-col rounded-3xl p-5 text-white sm:p-6 {live ? 'hero-live' : 'hero-test'}">
      <div class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
        <span>Your balance</span>
        <span class="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 normal-case tracking-normal text-white/80">
          <span class="h-1.5 w-1.5 rounded-full {live ? 'bg-emerald-300' : 'bg-sky-400'}"></span>{live ? 'Rotation sleeve' : 'Testnet · demo money'}
        </span>
      </div>
      <p class="mt-5 text-[2.25rem] font-semibold leading-tight tracking-tight tabular-nums">
        {usd(i.value_usdt)} <span class="text-base font-medium text-white/60">USDT</span>
      </p>
      {#if i.put_in_usdt > 0 && i.gain_usdt != null}
        {@const g = round(i.gain_usdt, 2)}
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums {g > 0 ? 'bg-emerald-300/15 text-emerald-300' : g < 0 ? 'bg-rose-300/15 text-rose-300' : 'bg-white/10 text-white/80'}">
            {signedUsd(i.gain_usdt)} · {pct(i.gain_pct)}
          </span>
          <span class="text-xs text-white/50">all time</span>
        </div>
      {/if}
      {#if i.history.length >= 2}
        <div class="mt-4 h-14 [&>svg]:h-full" title="Your balance by day">
          <Sparkline points={i.history.map((h) => h.value_usdt)} height={56} stroke="#7CE7BF" />
        </div>
      {/if}
      <div class="min-h-5 flex-1"></div>
      <div class="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs">
        <div><p class="text-white/50">Put in</p><p class="mt-0.5 font-medium tabular-nums text-white/90">{usd(i.put_in_usdt)}</p></div>
        <div class="text-right"><p class="text-white/50">Taken out</p><p class="mt-0.5 font-medium tabular-nums text-white/90">{usd(i.taken_out_usdt)}</p></div>
      </div>
    </div>

    <!-- Key figures -->
    <dl class="grid grid-cols-2 gap-2">
      <div class="rounded-2xl bg-panel-2/70 px-4 py-3">
        <dt class="text-[11px] text-muted">Since you joined</dt>
        <dd class="mt-0.5 font-semibold tabular-nums {i.first_at ? tone(i.since_joined_pct, 1) : 'text-muted'}">{i.first_at ? pct(i.since_joined_pct) : '—'}</dd>
      </div>
      <div class="rounded-2xl bg-panel-2/70 px-4 py-3">
        <dt class="text-[11px] text-muted">Units held</dt>
        <dd class="mt-0.5 font-semibold tabular-nums text-strong">{i.units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</dd>
      </div>
      <div class="rounded-2xl bg-panel-2/70 px-4 py-3">
        <dt class="text-[11px] text-muted">Unit price</dt>
        <dd class="mt-0.5 font-semibold tabular-nums text-strong">{i.unit_price == null ? '—' : i.unit_price.toFixed(4)}</dd>
      </div>
      <div class="rounded-2xl bg-panel-2/70 px-4 py-3">
        <dt class="text-[11px] text-muted">Fees paid</dt>
        <dd class="mt-0.5 font-semibold tabular-nums text-strong">{usd(i.cost_usdt)}</dd>
      </div>
    </dl>

    <!-- Holdings -->
    {#if i.holdings.length}
      <section class="card">
        <div class="flex items-baseline justify-between">
          <h2 class="text-sm font-semibold text-strong">Holdings</h2>
          <span class="text-xs text-muted">Your part, in USDT</span>
        </div>
        <div class="mt-3 flex h-2 overflow-hidden rounded-full bg-panel-2" aria-hidden="true">
          {#each i.holdings as h, idx (h.asset)}
            <div style="width: {h.weight_pct}%; background: {coinColor(h.asset === 'USDT' ? -1 : idx)}"></div>
          {/each}
        </div>
        <ul class="mt-2 divide-y divide-edge/60">
          {#each i.holdings as h, idx (h.asset)}
            {@const c = coinColor(h.asset === 'USDT' ? -1 : idx)}
            <li class="flex items-center gap-3 py-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[11px] font-bold" style="background: color-mix(in srgb, {c} 16%, transparent); color: {c};">{h.asset.slice(0, 4)}</span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-strong">{h.asset === 'USDT' ? 'Cash' : h.asset}</p>
                <p class="text-xs text-muted">{h.weight_pct < 0.05 ? 'under 0.1' : h.weight_pct.toFixed(1)}% of the portfolio</p>
              </div>
              <p class="shrink-0 text-sm font-semibold tabular-nums text-strong">{usd(h.value_usdt)}</p>
            </li>
          {/each}
        </ul>
        <p class="mt-1 text-[11px] text-muted">The sleeve copies the Pastatrade Rotation Index (Balanced + BTC switch): a weekly review picks the strongest of the biggest coins on Binance, and holds cash while BTC is below its 50-day average.</p>
      </section>
    {/if}

    <!-- Activity -->
    {#if i.entries.length}
      <section class="card">
        <div class="flex items-baseline justify-between">
          <h2 class="text-sm font-semibold text-strong">Activity</h2>
          {#if i.entries.length > 6}
            <button class="text-xs font-medium text-accent hover:underline" onclick={() => (showAll = !showAll)}>{showAll ? 'Show less' : 'See all'}</button>
          {/if}
        </div>
        <ul class="mt-1 divide-y divide-edge/60">
          {#each showAll ? i.entries : i.entries.slice(0, 6) as e (e.at + e.kind)}
            {@const out = e.kind === 'withdrawal'}
            <li class="flex items-center gap-3 py-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full {out ? 'bg-danger/15 text-danger' : e.kind === 'deposit' ? 'bg-mint/15 text-mint' : 'bg-accent/15 text-accent'}" aria-hidden="true">
                {#if out}<ArrowUpRight class="h-4 w-4" />{:else if e.kind === 'deposit'}<ArrowDownLeft class="h-4 w-4" />{:else}<BookOpen class="h-4 w-4" />{/if}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-strong">{KIND[e.kind]}</p>
                <p class="truncate text-xs text-muted">{day(e.at)} · {Math.abs(e.units).toLocaleString('en-US', { maximumFractionDigits: 4 })} units at {e.unit_price.toFixed(4)}</p>
              </div>
              <p class="shrink-0 text-sm font-semibold tabular-nums {out ? 'text-strong' : 'text-mint'}">{out ? '−' : '+'}{usd(e.usdt)}</p>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <p class="px-1 text-[11px] leading-relaxed text-muted">
      View only. Money in and out is arranged with Pastatrade101. Values use Binance prices at {when(i.as_of)} and move with the market. Your share only changes with your own money in and
      out; gains and losses move the unit price for everyone by the same percentage. Crypto prices go down as well as up, and past results don't promise future ones. Not financial advice.
    </p>
  {/if}
</div>

<style>
  .hero-live {
    background: linear-gradient(155deg, #17493a 0%, #0f3429 55%, #0a271f 100%);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 12px 30px rgb(0 0 0 / 0.22);
  }
  .hero-test {
    background: linear-gradient(155deg, #1e3358 0%, #152643 55%, #0f1c33 100%);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 12px 30px rgb(0 0 0 / 0.22);
  }
</style>
