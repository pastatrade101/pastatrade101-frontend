<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { RefreshCw } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';

  interface Settings {
    asset_symbol: 'BTC' | 'ETH';
    start_date: string | null;
    lower_multiplier: number;
    upper_multiplier: number;
    bubble_lower_multiplier: number;
    bubble_upper_multiplier: number;
    fitting_method: string;
    is_active: boolean;
  }

  let items = $state<Settings[]>([]);
  let selected = $state<'BTC' | 'ETH'>('BTC');
  let loading = $state(true);
  let busy = $state('');
  let message = $state('');
  let error = $state('');

  const current = $derived(items.find((s) => s.asset_symbol === selected) ?? null);

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    try {
      items = (await api<{ items: Settings[] }>('/admin/charts/log-regression/settings', { auth: true })).items;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load settings.';
    } finally {
      loading = false;
    }
  };
  onMount(load);

  const save = async () => {
    if (!current) return;
    busy = 'save';
    message = '';
    error = '';
    try {
      await api(`/admin/charts/log-regression/settings/${current.asset_symbol}`, {
        method: 'PUT',
        auth: true,
        body: {
          start_date: current.start_date || null,
          lower_multiplier: Number(current.lower_multiplier),
          upper_multiplier: Number(current.upper_multiplier),
          bubble_lower_multiplier: Number(current.bubble_lower_multiplier),
          bubble_upper_multiplier: Number(current.bubble_upper_multiplier),
          fitting_method: current.fitting_method,
          is_active: current.is_active
        }
      });
      message = `Saved ${current.asset_symbol} settings.`;
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Save failed.';
    } finally {
      busy = '';
    }
  };

  const recalc = async () => {
    if (!current) return;
    busy = 'recalc';
    message = '';
    error = '';
    try {
      const r = await api<{ rows: number }>(`/admin/charts/log-regression/${current.asset_symbol}/recalculate`, { method: 'POST', auth: true });
      message = `Recalculated ${current.asset_symbol} — ${r.rows} rows stored.`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Recalculation failed.';
    } finally {
      busy = '';
    }
  };
</script>

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Admin · Log Regression Settings</h1>
  <p class="text-sm text-muted">Configure per-asset regression band multipliers and start date. ETH is configured separately from BTC.</p>
</header>

<div class="mb-4 flex flex-wrap gap-2 text-sm">
  <a href="/admin/data-import/log-regression" class="btn-ghost">CSV import</a>
  <a href="/app/charts/logarithmic-regression" class="btn-ghost">View charts</a>
</div>

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

{#if loading}
  <p class="text-sm text-muted">Loading…</p>
{:else if current}
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div class="inline-flex overflow-hidden rounded-lg border border-edge text-sm">
      {#each ['BTC', 'ETH'] as a}
        <button class="px-4 py-1.5 font-medium {selected === a ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (selected = a as 'BTC' | 'ETH')}>{a}</button>
      {/each}
    </div>
    <div class="flex gap-2">
      <button class="btn-ghost text-sm" disabled={busy !== ''} onclick={recalc}><RefreshCw class="h-4 w-4 {busy === 'recalc' ? 'animate-spin' : ''}" /> Recalculate</button>
      <button class="btn-primary text-sm" disabled={busy === 'save'} onclick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
    </div>
  </div>

  <div class="card mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
    <label class="text-xs text-muted">Start date (optional)
      <input type="date" class="input mt-1 w-full" bind:value={current.start_date} />
    </label>
    <label class="text-xs text-muted">Fitting method
      <input class="input mt-1 w-full" bind:value={current.fitting_method} />
    </label>
    <label class="flex items-end gap-2 text-sm text-soft"><input type="checkbox" class="accent-mint" bind:checked={current.is_active} /> Active</label>
  </div>

  <div class="card mb-3">
    <h2 class="mb-2 text-sm font-semibold text-strong">Band multipliers (× regression fit)</h2>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each [['lower_multiplier', 'Lower band'], ['upper_multiplier', 'Upper band'], ['bubble_lower_multiplier', 'Bubble lower'], ['bubble_upper_multiplier', 'Bubble upper']] as [k, lab]}
        <label class="text-xs text-muted">{lab}
          <input type="number" step="0.05" min="0" class="input mt-1 w-full" bind:value={current[k as keyof Settings] as number} />
        </label>
      {/each}
    </div>
    <p class="mt-2 text-[11px] text-muted">Defaults — BTC: 0.65 / 1.50 / 2.80 / 4.20 · ETH: 0.55 / 1.70 / 3.00 / 5.00. After editing, click Recalculate to persist the stored bands.</p>
  </div>
{/if}
