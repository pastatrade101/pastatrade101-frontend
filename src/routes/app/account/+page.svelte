<script lang="ts">
  import { onMount } from 'svelte';
  import { Check } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, loadMembership } from '$lib/stores/membership';
  import { fmtMoney } from '$lib/format';
  import { FEATURE_LABELS, FEATURE_ORDER, LIMIT_LABELS, fmtLimit } from '$lib/membership-labels';

  interface Plan {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    monthly_price: number;
    currency: string;
    badge: string | null;
    is_popular: boolean;
    features: Record<string, boolean>;
    limits: Record<string, number | null>;
  }

  const KEY_LIMITS = ['max_watchlist_items', 'max_alerts', 'max_history_years'];

  interface PendingAttempt {
    plan_slug: string;
    billing_interval: string;
    amount: number;
    currency: string;
  }

  let plans = $state<Plan[]>([]);
  let message = $state('');
  let error = $state('');
  let busy = $state(false);

  // Abandoned-checkout follow-up
  let pending = $state<PendingAttempt | null>(null);
  let showCancelForm = $state(false);
  let cancelReason = $state('');
  const cancelReasons = ['Changed my mind', 'Payment failed', 'Too expensive', 'Will pay later', 'Mobile money issue'];

  onMount(async () => {
    try {
      plans = (await api<{ items: Plan[] }>('/plans')).items;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load plans.';
    }
    // Returning from the hosted checkout — actively verify instead of waiting on
    // the webhook (which may be delayed or misconfigured).
    if (new URLSearchParams(window.location.search).get('upgrade') === 'success') {
      history.replaceState(null, '', '/app/account');
      message = 'Confirming your payment…';
      let ok = false;
      for (let i = 0; i < 4 && !ok; i += 1) {
        ok = await verifyPayment();
        if (!ok) await new Promise((r) => setTimeout(r, 2500));
      }
      if (!ok) {
        message = 'Payment received — it’s still being confirmed. It will activate automatically, or use “Verify my payment” below.';
        await loadMembership();
        try {
          pending = (await api<{ attempt: PendingAttempt | null }>('/me/payment-attempts/pending', { auth: true })).attempt;
        } catch {
          /* non-critical */
        }
      }
      return;
    }
    // Otherwise check for an unfinished upgrade so we can prompt / follow up.
    try {
      pending = (await api<{ attempt: PendingAttempt | null }>('/me/payment-attempts/pending', { auth: true })).attempt;
    } catch {
      /* non-critical */
    }
  });

  // Pull-based verification: ask the backend to check the provider and activate.
  const verifyPayment = async (): Promise<boolean> => {
    try {
      const res = await api<{ activated: boolean; plan_slug?: string }>('/me/verify-payment', { method: 'POST', auth: true });
      if (res.activated) {
        await loadMembership();
        pending = null;
        error = '';
        message = 'Payment verified — your plan is now active! 🎉';
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const confirmedPaid = async () => {
    busy = true;
    error = '';
    const ok = await verifyPayment();
    if (!ok) message = 'We couldn’t confirm your payment just yet. If you’ve paid, wait a moment and try again — an admin will also confirm it shortly.';
    busy = false;
  };

  const submitCancel = async () => {
    busy = true;
    try {
      await api('/me/payment-attempts/cancel', { method: 'POST', body: { reason: cancelReason.trim() || undefined }, auth: true });
      pending = null;
      showCancelForm = false;
      message = 'No problem — we’ve noted it. You can upgrade any time.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not submit.';
    } finally {
      busy = false;
    }
  };

  const statusTone: Record<string, string> = {
    active: 'bg-mint/15 text-mint',
    trialing: 'bg-accent/15 text-accent',
    past_due: 'bg-warn/15 text-warn',
    cancelled: 'bg-danger/15 text-danger',
    expired: 'bg-danger/15 text-danger',
    suspended: 'bg-danger/15 text-danger',
    manual: 'bg-edge text-muted'
  };

  const usageBars = $derived.by(() => {
    const m = $membership;
    if (!m) return [] as { label: string; used: number; limit: number | null }[];
    return [
      { label: 'Watchlist items', used: m.usage.watchlist_items, limit: m.limits.max_watchlist_items ?? null },
      { label: 'Alerts', used: m.usage.alerts, limit: m.limits.max_alerts ?? null }
    ];
  });

  // Phone prompt before checkout (so the mobile-money number is pre-filled).
  let payFor = $state<Plan | null>(null);
  let payPhone = $state('');
  const chooseUpgrade = (p: Plan) => {
    if (p.monthly_price > 0) {
      payFor = p;
      payPhone = $membership?.phone ?? '';
    } else {
      upgrade(p.slug);
    }
  };

  const upgrade = async (slug: string, phone?: string) => {
    busy = true;
    message = '';
    error = '';
    try {
      const res = await api<{ status: string; checkout_url?: string }>('/me/upgrade', {
        method: 'POST',
        body: { plan_slug: slug, billing_interval: 'monthly', phone: phone?.trim() || undefined },
        auth: true
      });
      payFor = null;
      if (res.checkout_url) {
        // Hosted checkout — hand off to the payment provider.
        window.location.href = res.checkout_url;
        return;
      }
      message = `Upgrade request sent. An admin will activate ${slug} shortly.`;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Upgrade request failed.';
    } finally {
      busy = false;
    }
  };

  const cancel = async () => {
    busy = true;
    message = '';
    try {
      await api('/me/cancel-subscription', { method: 'POST', auth: true });
      message = 'Your subscription will be cancelled at the end of the current period.';
      await loadMembership();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Cancel failed.';
    } finally {
      busy = false;
    }
  };
</script>

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Account &amp; Billing</h1>
  <p class="text-sm text-muted">Your current plan, usage and upgrade options.</p>
</header>

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

<!-- Unfinished upgrade prompt -->
{#if pending}
  <div class="card mb-4 border-warn/30 bg-warn/5">
    <h3 class="font-semibold text-strong">You started upgrading to {pending.plan_slug} ({pending.billing_interval})</h3>
    <p class="mt-1 text-sm text-soft">That's {fmtMoney(pending.amount, pending.currency)} — but we haven't seen the payment yet. Did you complete it?</p>
    {#if !showCancelForm}
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="btn-primary" onclick={confirmedPaid} disabled={busy}>{busy ? 'Verifying…' : 'I’ve paid — verify my access'}</button>
        <button class="btn-ghost" onclick={() => (showCancelForm = true)} disabled={busy}>No, I didn't</button>
      </div>
    {:else}
      <div class="mt-3">
        <p class="mb-1.5 text-xs text-muted">Mind telling us why? It helps us improve (optional).</p>
        <div class="mb-2 flex flex-wrap gap-1.5">
          {#each cancelReasons as r}
            <button
              class="rounded-full border px-2.5 py-1 text-xs transition {cancelReason === r ? 'border-warn/50 bg-warn/15 text-warn' : 'border-edge text-muted hover:bg-panel-2'}"
              onclick={() => (cancelReason = r)}
            >
              {r}
            </button>
          {/each}
        </div>
        <textarea class="input min-h-[60px]" placeholder="Anything else…" bind:value={cancelReason}></textarea>
        <div class="mt-2 flex gap-2">
          <button class="btn-primary" onclick={submitCancel} disabled={busy}>Submit</button>
          <button class="btn-ghost" onclick={() => (showCancelForm = false)} disabled={busy}>Back</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

{#if !$membership}
  <div class="card text-center text-muted">Loading your plan…</div>
{:else}
  {@const m = $membership}
  <!-- Current plan -->
  <section class="hero-card mb-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Current plan</span>
        <div class="mt-1 flex items-center gap-2">
          <h2 class="text-2xl font-semibold text-strong">{m.plan_name}</h2>
          <span class="pill {statusTone[m.status] ?? 'bg-edge text-muted'} capitalize">{m.status}</span>
          {#if m.is_admin}<span class="pill bg-accent/15 text-accent">Admin</span>{/if}
        </div>
      </div>
      <div class="flex gap-2">
        <a href="/pricing" class="btn-ghost">Compare plans</a>
        {#if m.plan !== 'free'}<button class="btn-ghost" onclick={cancel} disabled={busy}>Cancel</button>{/if}
      </div>
    </div>

    <!-- Usage -->
    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      {#each usageBars as u}
        {@const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0}
        <div>
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="text-muted">{u.label}</span>
            <span class="font-medium text-body">{u.used} / {u.limit === null ? '∞' : u.limit}</span>
          </div>
          <div class="meter"><div class="meter-fill {pct >= 100 ? 'bg-danger' : pct >= 75 ? 'bg-warn' : 'bg-mint'}" style="width: {u.limit === null ? 8 : pct}%"></div></div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Plan limits + features grid -->
  <div class="mb-4 grid gap-3 lg:grid-cols-2">
    <div class="card">
      <h3 class="mb-3 text-sm font-semibold text-strong">Your limits</h3>
      <dl class="space-y-2 text-sm">
        {#each Object.keys(LIMIT_LABELS) as lk}
          <div class="flex items-center justify-between">
            <dt class="text-muted">{LIMIT_LABELS[lk]}</dt>
            <dd class="font-medium text-body">{fmtLimit(lk, m.limits[lk] ?? null)}</dd>
          </div>
        {/each}
      </dl>
    </div>
    <div class="card">
      <h3 class="mb-3 text-sm font-semibold text-strong">Your features</h3>
      <ul class="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
        {#each FEATURE_ORDER as fk}
          <li class="flex items-center gap-2 {m.features[fk] || m.is_admin ? 'text-soft' : 'text-muted/50 line-through'}">
            <Check class="h-3.5 w-3.5 shrink-0 {m.features[fk] || m.is_admin ? 'text-mint' : 'text-muted/40'}" />
            {FEATURE_LABELS[fk]}
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <!-- Upgrade options -->
  {#if plans.length}
    <div class="grid gap-3 md:grid-cols-3">
      {#each plans as p}
        {@const isCurrent = p.slug === m.plan}
        <div class="card rail-card flex flex-col {p.is_popular ? 'border-accent/40' : ''}" style={p.is_popular ? '--rail: var(--c-accent)' : '--rail: var(--c-edge)'}>
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-lg font-semibold text-strong">{p.name}</h3>
            {#if p.badge}<span class="pill bg-accent/15 text-accent text-[10px]">{p.badge}</span>{/if}
          </div>
          <div class="text-sm text-muted">{fmtMoney(p.monthly_price, p.currency)}/mo</div>

          <dl class="mt-3 space-y-1 text-xs">
            {#each KEY_LIMITS as lk}
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted">{LIMIT_LABELS[lk]}</dt>
                <dd class="font-medium text-body">{fmtLimit(lk, p.limits?.[lk] ?? null)}</dd>
              </div>
            {/each}
          </dl>

          <ul class="mt-3 flex-1 space-y-1.5 text-xs">
            {#each FEATURE_ORDER.filter((k) => p.features?.[k]).slice(0, 6) as fk}
              <li class="flex items-center gap-1.5 text-soft"><Check class="h-3.5 w-3.5 shrink-0 text-mint" />{FEATURE_LABELS[fk]}</li>
            {/each}
          </ul>

          {#if isCurrent}
            <span class="btn-ghost mt-4 w-full cursor-default justify-center">Current plan</span>
          {:else}
            <button class="btn-primary mt-4 w-full" onclick={() => chooseUpgrade(p)} disabled={busy}>Choose {p.name}</button>
          {/if}
        </div>
      {/each}
    </div>
    <p class="mt-2 text-center text-xs text-muted"><a href="/pricing" class="text-mint hover:underline">See the full feature comparison →</a></p>
  {/if}

  <!-- Phone prompt before checkout -->
  {#if payFor}
    <div class="fixed inset-0 z-40 bg-black/50" onclick={() => (payFor = null)} role="presentation"></div>
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="w-full max-w-sm rounded-2xl border border-edge bg-panel p-5 shadow-2xl">
        <h2 class="text-lg font-semibold text-strong">Pay for {payFor.name}</h2>
        <p class="mt-1 text-sm text-muted">{fmtMoney(payFor.monthly_price, payFor.currency)}/mo. Enter the mobile-money number you'll pay with — we'll pre-fill it at checkout.</p>
        <label class="stat-label mt-4 block" for="payphone">Mobile money number</label>
        <input id="payphone" class="input mt-1" type="tel" placeholder="2557XXXXXXXX" bind:value={payPhone} />
        <div class="mt-4 flex gap-2">
          <button class="btn-primary flex-1" onclick={() => upgrade(payFor!.slug, payPhone)} disabled={busy}>{busy ? 'Starting…' : 'Continue to payment'}</button>
          <button class="btn-ghost" onclick={() => (payFor = null)} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
{/if}
