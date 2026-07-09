<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, X } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { fmtMoney } from '$lib/format';
  import { user } from '$lib/stores/auth';
  import { membership } from '$lib/stores/membership';
  import { offers, loadOffers, activeOffer } from '$lib/stores/offers';
  import { FEATURE_LABELS, FEATURE_ORDER, LIMIT_LABELS, fmtLimit } from '$lib/membership-labels';
  import Seo from '$lib/components/Seo.svelte';
  import Countdown from '$lib/components/Countdown.svelte';
  import { t } from '$lib/i18n';

  interface Plan {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    tagline: string | null;
    badge: string | null;
    monthly_price: number;
    yearly_price: number;
    currency: string;
    is_popular: boolean;
    trial_days: number;
    features: Record<string, boolean>;
    limits: Record<string, number | null>;
  }

  let plans = $state<Plan[]>([]);
  let error = $state('');
  let loading = $state(true);
  let yearly = $state(false);

  onMount(async () => {
    try {
      const data = await api<{ items: Plan[] }>('/plans');
      plans = data.items;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load plans.';
    } finally {
      loading = false;
    }
    loadOffers(); // optional; never blocks the page
  });

  // On expiry: drop the lapsed offer instantly, then reconcile with the server.
  const onOfferExpire = (o: ReturnType<typeof offerFor>) => {
    offers.set($offers.filter((x) => x !== o));
    loadOffers();
  };

  const price = (p: Plan) => (yearly ? p.yearly_price : p.monthly_price);

  // Real yearly saving, computed from the actual prices (never a hard-coded
  // claim). Uses the smallest discount across paid plans so the badge never
  // over-promises; hides entirely when yearly isn't actually cheaper.
  const yearlySaving = $derived.by(() => {
    const paid = plans.filter((p) => p.monthly_price > 0 && p.yearly_price > 0);
    if (!paid.length) return null;
    const months = Math.min(...paid.map((p) => 12 - p.yearly_price / p.monthly_price));
    if (months >= 0.9) return { months: Math.round(months), pct: 0 };
    const pct = Math.min(...paid.map((p) => Math.round((1 - p.yearly_price / (p.monthly_price * 12)) * 100)));
    return pct >= 3 ? { months: 0, pct } : null;
  });
  // Live offer for a plan at the currently-selected interval (or null).
  const interval = $derived<'monthly' | 'yearly'>(yearly ? 'yearly' : 'monthly');
  const offerFor = (p: Plan) => activeOffer($offers, p.id, interval);

  // A user "owns" a plan if it's their exact plan, or a lower/equal tier already
  // covered by their active paid plan — those must not be payable again.
  const activeStatuses = new Set(['active', 'trialing', 'manual']);
  const currentPrice = $derived(plans.find((pl) => pl.slug === $membership?.plan)?.monthly_price ?? 0);
  const isPaidActive = $derived(!!$membership && activeStatuses.has($membership.status) && ($membership.plan ?? 'free') !== 'free');
  const owns = (p: Plan) => {
    if (!$membership) return false;
    if (p.slug === $membership.plan) return true;
    return isPaidActive && p.monthly_price <= currentPrice;
  };
  const cta = (p: Plan) => {
    if ($membership && p.slug === $membership.plan) return $t('pricing.current');
    if (owns(p)) return $t('pricing.included');
    return p.monthly_price === 0 ? $t('pricing.startFree') : $t('pricing.get', { name: p.name });
  };
  // Carry the chosen plan through auth so checkout opens automatically afterwards.
  const planHref = (p: Plan) => {
    if (p.monthly_price === 0) return $user ? '/app' : '/register';
    const intent = `/app/account?plan=${p.slug}`;
    return $user ? intent : `/register?redirect=${encodeURIComponent(intent)}`;
  };
  // Show the headline limits on each card.
  const KEY_LIMITS = ['max_watchlist_items', 'max_alerts', 'max_history_years'];

  // Reframe plans by WHO they're for, not by feature tier.
  const IDENTITY: Record<string, string> = {
    free: 'For people who want the daily market read.',
    mid: 'For active traders who want the full signals.',
    premium: 'For serious investors who want everything.'
  };
</script>

<Seo
  title="Pricing"
  description="Pastatrade101 tells you when to buy, wait, avoid or take profit — in plain language. Start free, upgrade for the full signals. No exchange connection required."
/>

<section class="mx-auto max-w-[1100px] px-4 py-10">
  <header class="mb-8 text-center">
    <h1 class="text-3xl font-semibold text-strong">{$t('pricing.title')}</h1>
    <p class="mx-auto mt-2 max-w-xl text-muted">{$t('pricing.sub')}</p>
    <div class="mt-5 inline-flex items-center gap-1 rounded-lg border border-edge p-1 text-sm">
      <button class="rounded-md px-3 py-1.5 {!yearly ? 'bg-accent/15 text-accent' : 'text-muted'}" onclick={() => (yearly = false)}>{$t('pricing.monthly')}</button>
      <button class="rounded-md px-3 py-1.5 {yearly ? 'bg-accent/15 text-accent' : 'text-muted'}" onclick={() => (yearly = true)}>{$t('pricing.yearly')}{#if yearlySaving}
          <span class="text-mint"> ·{yearlySaving.months ? $t('pricing.yearlyMonthsFree', { months: yearlySaving.months }) : $t('pricing.yearlySavePct', { pct: yearlySaving.pct })}</span>{/if}</button>
    </div>
  </header>

  {#if loading}
    <div class="card text-center text-muted">Loading plans…</div>
  {:else if error}
    <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
  {:else}
    <div class="grid gap-4 md:grid-cols-3">
      {#each plans as p}
        {@const identity = p.tagline ?? IDENTITY[p.slug]}
        {@const o = offerFor(p)}
        <div class="card rail-card flex flex-col {o ? 'border-danger/40' : p.is_popular ? 'border-accent/40' : ''}" style={o ? '--rail: var(--c-danger)' : p.is_popular ? '--rail: var(--c-accent)' : '--rail: var(--c-edge)'}>
          <div class="mb-1.5 flex items-center justify-between gap-2">
            <h2 class="text-lg font-semibold text-strong">{p.name}</h2>
            <div class="flex flex-wrap items-center justify-end gap-1.5">
              {#if o}<span class="pill bg-danger/15 text-danger">{o.offer_label}</span>{/if}
              {#if p.badge}<span class="pill bg-accent/15 text-accent">{p.badge}</span>{/if}
            </div>
          </div>
          {#if identity}<p class="mb-3 text-sm font-medium text-soft">{identity}</p>{/if}
          <div class="mb-1 flex flex-wrap items-end gap-x-2 gap-y-1">
            <span class="text-3xl font-semibold text-strong">{fmtMoney(o ? o.offer_price : price(p), p.currency)}</span>
            <span class="mb-1 text-sm text-muted">/{yearly ? 'yr' : 'mo'}</span>
            {#if o}<span class="mb-1 text-sm text-muted line-through">{fmtMoney(o.original_price, p.currency)}</span>{/if}
          </div>
          {#if o}
            <div class="mb-3 mt-1 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2">
              <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger">{$t('pricing.offerEndsIn')}</p>
              <Countdown endsAt={o.ends_at} onExpire={() => onOfferExpire(o)} label="{p.name} offer" />
            </div>
          {/if}
          {#if p.description}<p class="mb-3 text-sm text-muted">{p.description}</p>{/if}
          {#if p.trial_days > 0}<p class="mb-3 text-xs text-mint">{$t('pricing.trial', { days: p.trial_days })}</p>{/if}

          {#if owns(p)}
            <span class="btn-ghost mb-4 w-full cursor-default justify-center">{cta(p)}</span>
          {:else}
            <a href={planHref(p)} class="btn-primary mb-4 w-full">{cta(p)}</a>
          {/if}

          <ul class="space-y-2 text-sm">
            {#each KEY_LIMITS as lk}
              <li class="flex items-center justify-between gap-2 text-soft">
                <span class="text-muted">{LIMIT_LABELS[lk]}</span>
                <span class="font-medium text-body">{fmtLimit(lk, p.limits[lk] ?? null)}</span>
              </li>
            {/each}
            <li class="my-1 border-t border-edge/60"></li>
            {#each FEATURE_ORDER as fk}
              <li class="flex items-center gap-2 {p.features[fk] ? 'text-soft' : 'text-muted/60'}">
                {#if p.features[fk]}<Check class="h-4 w-4 shrink-0 text-mint" />{:else}<X class="h-4 w-4 shrink-0 text-muted/50" />{/if}
                {FEATURE_LABELS[fk]}
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
    <p class="mt-6 text-center text-xs text-muted">{$t('pricing.localpay')}</p>
  {/if}
</section>
