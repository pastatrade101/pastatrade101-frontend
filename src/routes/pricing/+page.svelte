<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, X } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { fmtMoney } from '$lib/format';
  import { user } from '$lib/stores/auth';
  import { membership } from '$lib/stores/membership';
  import { FEATURE_LABELS, FEATURE_ORDER, LIMIT_LABELS, fmtLimit } from '$lib/membership-labels';
  import { t } from '$lib/i18n';

  interface Plan {
    id: string;
    name: string;
    slug: string;
    description: string | null;
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
  });

  const price = (p: Plan) => (yearly ? p.yearly_price : p.monthly_price);
  const cta = (p: Plan) =>
    p.slug === ($membership?.plan ?? 'free') ? $t('pricing.current') : p.monthly_price === 0 ? $t('pricing.startFree') : $t('pricing.get', { name: p.name });
  const ctaHref = (p: Plan) => (!$user ? '/register' : '/app/account');
  // Show the headline limits on each card.
  const KEY_LIMITS = ['max_watchlist_items', 'max_alerts', 'max_history_years'];
</script>

<section class="mx-auto max-w-[1100px] px-4 py-10">
  <header class="mb-8 text-center">
    <h1 class="text-3xl font-semibold text-strong">{$t('pricing.title')}</h1>
    <p class="mx-auto mt-2 max-w-xl text-muted">{$t('pricing.sub')}</p>
    <div class="mt-5 inline-flex items-center gap-1 rounded-lg border border-edge p-1 text-sm">
      <button class="rounded-md px-3 py-1.5 {!yearly ? 'bg-accent/15 text-accent' : 'text-muted'}" onclick={() => (yearly = false)}>{$t('pricing.monthly')}</button>
      <button class="rounded-md px-3 py-1.5 {yearly ? 'bg-accent/15 text-accent' : 'text-muted'}" onclick={() => (yearly = true)}>{$t('pricing.yearly')} <span class="text-mint">{$t('pricing.yearlyNote')}</span></button>
    </div>
  </header>

  {#if loading}
    <div class="card text-center text-muted">Loading plans…</div>
  {:else if error}
    <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
  {:else}
    <div class="grid gap-4 md:grid-cols-3">
      {#each plans as p}
        <div class="card rail-card flex flex-col {p.is_popular ? 'border-accent/40' : ''}" style={p.is_popular ? '--rail: var(--c-accent)' : '--rail: var(--c-edge)'}>
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-strong">{p.name}</h2>
            {#if p.badge}<span class="pill bg-accent/15 text-accent">{p.badge}</span>{/if}
          </div>
          <div class="mb-1 flex items-end gap-1">
            <span class="text-3xl font-semibold text-strong">{fmtMoney(price(p), p.currency)}</span>
            <span class="mb-1 text-sm text-muted">/{yearly ? 'yr' : 'mo'}</span>
          </div>
          {#if p.description}<p class="mb-3 text-sm text-muted">{p.description}</p>{/if}
          {#if p.trial_days > 0}<p class="mb-3 text-xs text-mint">{$t('pricing.trial', { days: p.trial_days })}</p>{/if}

          <a href={ctaHref(p)} class="{p.slug === ($membership?.plan ?? 'free') ? 'btn-ghost' : 'btn-primary'} mb-4 w-full">{cta(p)}</a>

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
