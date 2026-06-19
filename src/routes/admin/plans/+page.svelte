<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { X } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import { CURRENCIES, fmtMoney } from '$lib/format';
  import AdminTabs from '$lib/components/AdminTabs.svelte';
  import { FEATURE_LABELS, FEATURE_ORDER, LIMIT_LABELS } from '$lib/membership-labels';

  interface AdminPlan {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    badge: string | null;
    monthly_price: number;
    yearly_price: number;
    currency: string;
    is_active: boolean;
    is_popular: boolean;
    is_hidden: boolean;
    is_archived: boolean;
    sort_order: number;
    trial_days: number;
    features: Record<string, boolean>;
    limits: Record<string, number | null>;
  }

  let plans = $state<AdminPlan[]>([]);
  let savingId = $state('');
  let editingId = $state<string | null>(null);
  let newName = $state('');
  let newSlug = $state('');

  const limitKeys = Object.keys(LIMIT_LABELS);

  // Toast (top, auto-dismiss).
  let toast = $state<{ text: string; tone: 'ok' | 'err' } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout>;
  const showToast = (text: string, tone: 'ok' | 'err' = 'ok') => {
    toast = { text, tone };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3200);
  };

  // Admin guard.
  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    const data = await api<{ items: AdminPlan[] }>('/admin/plans', { auth: true });
    // Ensure every key exists on the editable model.
    plans = data.items.map((p) => ({
      ...p,
      features: Object.fromEntries(FEATURE_ORDER.map((k) => [k, p.features?.[k] ?? false])),
      limits: Object.fromEntries(limitKeys.map((k) => [k, p.limits?.[k] ?? null]))
    }));
  };

  onMount(() => {
    load().catch((err) => showToast(err instanceof Error ? err.message : 'Failed to load plans.', 'err'));
  });

  const savePlan = async (p: AdminPlan) => {
    savingId = p.id;
    try {
      await api(`/admin/plans/${p.id}`, {
        method: 'PUT',
        body: {
          name: p.name,
          description: p.description ?? undefined,
          badge: p.badge,
          monthly_price: Number(p.monthly_price),
          yearly_price: Number(p.yearly_price),
          currency: p.currency,
          is_active: p.is_active,
          is_popular: p.is_popular,
          is_hidden: p.is_hidden,
          sort_order: Number(p.sort_order),
          trial_days: Number(p.trial_days)
        },
        auth: true
      });
      // Persist feature flags + limits (upsert each).
      for (const fk of FEATURE_ORDER) {
        await api(`/admin/plans/${p.id}/features`, { method: 'POST', body: { feature_key: fk, is_enabled: !!p.features[fk] }, auth: true });
      }
      for (const lk of limitKeys) {
        const v = p.limits[lk];
        await api(`/admin/plans/${p.id}/features`, { method: 'POST', body: { feature_key: lk, is_enabled: true, limit_value: v === null || (v as unknown) === '' ? null : Number(v) }, auth: true });
      }
      editingId = null;
      showToast(`Saved “${p.name}”.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', 'err');
    } finally {
      savingId = '';
    }
  };

  const archivePlan = async (p: AdminPlan) => {
    if (!confirm(`Archive the ${p.name} plan? Existing subscribers keep it until reassigned.`)) return;
    try {
      await api(`/admin/plans/${p.id}`, { method: 'DELETE', auth: true });
      editingId = null;
      await load();
      showToast(`Archived “${p.name}”.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Archive failed.', 'err');
    }
  };

  const createPlan = async () => {
    if (!newName || !newSlug) return;
    try {
      const created = await api<{ id: string }>('/admin/plans', { method: 'POST', body: { name: newName, slug: newSlug, sort_order: plans.length + 1 }, auth: true });
      newName = '';
      newSlug = '';
      await load();
      editingId = created.id; // open the editor for the new plan
      showToast('Plan created — configure its features.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create failed.', 'err');
    }
  };
</script>

<!-- Toast -->
{#if toast}
  <div class="fixed left-1/2 top-4 z-[60] -translate-x-1/2" transition:fly={{ y: -16, duration: 200 }}>
    <div
      class="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-2xl {toast.tone === 'ok' ? 'border-mint/40 text-mint' : 'border-danger/40 text-danger'}"
      style="background: rgb(var(--c-panel))"
    >
      <span class="h-2 w-2 rounded-full {toast.tone === 'ok' ? 'bg-mint' : 'bg-danger'}"></span>{toast.text}
    </div>
  </div>
{/if}

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Plans &amp; Pricing</h1>
  <p class="text-sm text-muted">Control pricing, limits and feature access. Changes apply to all users on each plan immediately.</p>
</header>
<AdminTabs />

<!-- New plan -->
<div class="card mb-4 flex flex-wrap items-end gap-3">
  <div><label class="stat-label" for="nn">New plan name</label><input id="nn" class="input mt-1" placeholder="VIP" bind:value={newName} /></div>
  <div><label class="stat-label" for="ns">Slug</label><input id="ns" class="input mt-1" placeholder="vip" bind:value={newSlug} /></div>
  <button class="btn-primary" onclick={createPlan} disabled={!newName || !newSlug}>Create plan</button>
</div>

<!-- Plan rows (summary + Edit button only) -->
<div class="space-y-3">
  {#each plans as p (p.id)}
    <div class="card flex flex-wrap items-center justify-between gap-3 {p.is_archived ? 'opacity-60' : ''}">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-strong">{p.name}</span>
        <span class="pill bg-edge text-muted">{p.slug}</span>
        {#if p.is_popular}<span class="pill bg-accent/15 text-accent">Popular</span>{/if}
        {#if !p.is_active}<span class="pill bg-warn/15 text-warn">Inactive</span>{/if}
        {#if p.is_hidden}<span class="pill bg-edge text-muted">Hidden</span>{/if}
        {#if p.is_archived}<span class="pill bg-danger/15 text-danger">Archived</span>{/if}
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm text-muted">{fmtMoney(p.monthly_price, p.currency)}/mo · {fmtMoney(p.yearly_price, p.currency)}/yr</span>
        <button class="btn-ghost px-3 py-1.5 text-xs" onclick={() => (editingId = p.id)}>Edit</button>
      </div>
    </div>
  {/each}
</div>

<!-- Edit modal -->
{#if editingId}
  {@const p = plans.find((x) => x.id === editingId)}
  {#if p}
    <div class="fixed inset-0 z-40 bg-black/50" onclick={() => (editingId = null)} role="presentation"></div>
    <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div class="my-8 w-full max-w-2xl rounded-2xl border border-edge bg-panel shadow-2xl" transition:fly={{ y: 16, duration: 180 }}>
        <!-- Modal header -->
        <div class="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h2 class="flex items-center gap-2 font-semibold text-strong">Edit {p.name} <span class="pill bg-edge text-muted">{p.slug}</span></h2>
          <button class="text-muted hover:text-strong" onclick={() => (editingId = null)} aria-label="Close"><X class="h-5 w-5" /></button>
        </div>

        <!-- Modal body -->
        <div class="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <!-- Meta -->
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="block text-xs text-muted">Name<input class="input mt-1" bind:value={p.name} /></label>
            <label class="block text-xs text-muted">Badge<input class="input mt-1" bind:value={p.badge} placeholder="Popular" /></label>
            <label class="block text-xs text-muted">Monthly price<input type="number" class="input mt-1" bind:value={p.monthly_price} /></label>
            <label class="block text-xs text-muted">Yearly price<input type="number" class="input mt-1" bind:value={p.yearly_price} /></label>
            <label class="block text-xs text-muted">Currency<select class="input mt-1" bind:value={p.currency}>
              {#each CURRENCIES as c}<option value={c}>{c}</option>{/each}
            </select></label>
            <label class="block text-xs text-muted">Sort order<input type="number" class="input mt-1" bind:value={p.sort_order} /></label>
            <label class="block text-xs text-muted">Trial days<input type="number" class="input mt-1" bind:value={p.trial_days} /></label>
            <label class="block text-xs text-muted sm:col-span-2 lg:col-span-4">Description<input class="input mt-1" bind:value={p.description} /></label>
          </div>
          <div class="flex flex-wrap gap-4 text-sm text-soft">
            <label class="flex items-center gap-2"><input type="checkbox" bind:checked={p.is_active} /> Active</label>
            <label class="flex items-center gap-2"><input type="checkbox" bind:checked={p.is_popular} /> Popular</label>
            <label class="flex items-center gap-2"><input type="checkbox" bind:checked={p.is_hidden} /> Hidden</label>
          </div>

          <!-- Limits -->
          <div>
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Limits</h4>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {#each limitKeys as lk}
                <label class="block text-xs text-muted">{LIMIT_LABELS[lk]}<input type="number" class="input mt-1" placeholder="∞" bind:value={p.limits[lk]} /></label>
              {/each}
            </div>
            <p class="mt-1 text-[11px] text-muted">Leave a limit blank for unlimited.</p>
          </div>

          <!-- Feature toggles -->
          <div>
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Feature access</h4>
            <div class="grid gap-2 sm:grid-cols-2">
              {#each FEATURE_ORDER as fk}
                <label class="flex items-center gap-2 rounded-lg bg-panel-2/40 px-2.5 py-1.5 text-sm text-soft">
                  <input type="checkbox" bind:checked={p.features[fk]} /> {FEATURE_LABELS[fk]}
                </label>
              {/each}
            </div>
          </div>
        </div>

        <!-- Modal footer -->
        <div class="flex items-center justify-between gap-2 border-t border-edge px-5 py-3.5">
          {#if !p.is_archived}<button class="btn-ghost text-danger" onclick={() => archivePlan(p)}>Archive</button>{:else}<span></span>{/if}
          <div class="flex items-center gap-2">
            <button class="btn-ghost" onclick={() => (editingId = null)}>Cancel</button>
            <button class="btn-primary" onclick={() => savePlan(p)} disabled={savingId === p.id}>{savingId === p.id ? 'Saving…' : 'Save plan'}</button>
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}
