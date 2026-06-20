<script lang="ts">
  import { Radar, RefreshCw, Save } from '@lucide/svelte';
  import { api } from '$lib/api';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s = $state<any>(null);
  let logs = $state<any[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let syncing = $state(false);
  let message = $state('');
  let error = $state('');
  let started = $state(false);
  let networksText = $state('');

  const load = async () => {
    loading = true;
    error = '';
    try {
      const [settings, l] = await Promise.all([api('/admin/early-opportunity/settings', { auth: true }), api<any[]>('/admin/early-opportunity/sync-logs', { auth: true }).catch(() => [])]);
      s = settings;
      networksText = (s.allowed_networks ?? []).join(', ');
      logs = l ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load settings.';
    } finally {
      loading = false;
    }
  };
  $effect(() => {
    if (started) return;
    started = true;
    void load();
  });

  const save = async () => {
    saving = true;
    message = '';
    error = '';
    try {
      const payload = {
        min_liquidity_usd: Number(s.min_liquidity_usd),
        min_volume_24h: Number(s.min_volume_24h),
        min_transactions_24h: Number(s.min_transactions_24h),
        min_pool_age_hours: Number(s.min_pool_age_hours),
        max_vol_liq_ratio: Number(s.max_vol_liq_ratio),
        exclude_stablecoins: s.exclude_stablecoins,
        exclude_wrapped_tokens: s.exclude_wrapped_tokens,
        exclude_abnormal_spikes: s.exclude_abnormal_spikes,
        allowed_networks: networksText.split(',').map((x: string) => x.trim()).filter(Boolean),
        is_active: s.is_active
      };
      s = await api('/admin/early-opportunity/settings', { method: 'PUT', auth: true, body: payload });
      networksText = (s.allowed_networks ?? []).join(', ');
      message = 'Settings saved.';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Save failed.';
    } finally {
      saving = false;
    }
  };

  const syncNow = async () => {
    syncing = true;
    message = '';
    error = '';
    try {
      const res: any = await api('/admin/early-opportunity/sync', { method: 'POST', auth: true });
      message = res?.stored ? `Synced — ${res.stored} candidate(s).` : 'No candidates returned (sources unavailable).';
      const l = await api<any[]>('/admin/early-opportunity/sync-logs', { auth: true }).catch(() => []);
      logs = l ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sync failed.';
    } finally {
      syncing = false;
    }
  };

  const num = (label: string, key: string) => ({ label, key });
  const NUMS = [num('Min liquidity (USD)', 'min_liquidity_usd'), num('Min 24h volume (USD)', 'min_volume_24h'), num('Min 24h transactions', 'min_transactions_24h'), num('Min pool age (hours)', 'min_pool_age_hours'), num('Max volume/liquidity ratio', 'max_vol_liq_ratio')];
  const TOGGLES = [['exclude_stablecoins', 'Exclude stablecoins'], ['exclude_wrapped_tokens', 'Exclude wrapped/staked'], ['exclude_abnormal_spikes', 'Exclude abnormal spikes'], ['is_active', 'Module active']];
</script>

<header class="mb-5 flex items-center gap-2">
  <Radar class="h-5 w-5 text-accent" />
  <div>
    <h1 class="text-xl font-semibold text-strong">Early Opportunity Radar — Settings</h1>
    <p class="text-sm text-muted">Clean-filter thresholds, networks, sync controls and source logs.</p>
  </div>
</header>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <button class="btn-primary inline-flex items-center gap-2" disabled={syncing} onclick={syncNow}><RefreshCw class="h-4 w-4 {syncing ? 'animate-spin' : ''}" />{syncing ? 'Syncing…' : 'Sync now'}</button>
  {#if message}<span class="text-sm text-mint">{message}</span>{/if}
  {#if error}<span class="text-sm text-danger">{error}</span>{/if}
</div>

{#if loading}
  <p class="text-sm text-muted">Loading…</p>
{:else if s}
  <div class="grid gap-4 lg:grid-cols-2">
    <div class="card">
      <p class="stat-label mb-3">Clean-filter thresholds</p>
      <div class="grid grid-cols-2 gap-3">
        {#each NUMS as f}
          <label class="block text-sm">
            <span class="mb-1 block text-xs text-muted">{f.label}</span>
            <input type="number" class="input" bind:value={s[f.key]} />
          </label>
        {/each}
      </div>
      <label class="mt-3 block text-sm">
        <span class="mb-1 block text-xs text-muted">Allowed networks (comma-separated)</span>
        <input class="input" bind:value={networksText} placeholder="eth, solana, base, bsc…" />
      </label>
      <div class="mt-3 space-y-2">
        {#each TOGGLES as [key, label]}
          <label class="flex items-center gap-2 text-sm text-soft"><input type="checkbox" bind:checked={s[key]} class="accent-mint" />{label}</label>
        {/each}
      </div>
      <button class="btn-primary mt-4 inline-flex items-center gap-2" disabled={saving} onclick={save}><Save class="h-4 w-4" />{saving ? 'Saving…' : 'Save settings'}</button>
    </div>

    <div class="card">
      <p class="stat-label mb-2">Scoring & risk weights (read-only)</p>
      <p class="mb-2 text-xs text-muted">Opportunity weights</p>
      <div class="flex flex-wrap gap-1.5">
        {#each Object.entries(s.scoring_weights ?? {}) as [k, v]}<span class="rounded bg-panel-2 px-2 py-0.5 text-xs text-soft">{k.replace(/_/g, ' ')}: {v}</span>{/each}
      </div>
      <p class="mb-2 mt-3 text-xs text-muted">Risk weights</p>
      <div class="flex flex-wrap gap-1.5">
        {#each Object.entries(s.risk_weights ?? {}) as [k, v]}<span class="rounded bg-panel-2 px-2 py-0.5 text-xs text-soft">{k.replace(/_/g, ' ')}: {v}</span>{/each}
      </div>
      <p class="mt-3 text-[11px] text-muted">Weights are tuned in code for Phase 1. Editing per-weight from the UI can be added later.</p>
    </div>
  </div>

  <div class="card mt-4">
    <p class="stat-label mb-2">Recent source syncs</p>
    {#if logs.length}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-xs text-muted"><th class="py-1 pr-3">Source</th><th class="py-1 pr-3">Status</th><th class="py-1 pr-3">Records</th><th class="py-1 pr-3">When</th></tr></thead>
          <tbody>
            {#each logs.slice(0, 20) as l}
              <tr class="border-t border-edge/50">
                <td class="py-1 pr-3 text-soft">{l.source_name.replace(/_/g, ' ')}</td>
                <td class="py-1 pr-3 {l.status === 'success' ? 'text-mint' : l.status === 'partial' ? 'text-warn' : 'text-danger'}">{l.status}</td>
                <td class="py-1 pr-3 text-muted">{l.records_processed}</td>
                <td class="py-1 pr-3 text-muted">{l.finished_at ? new Date(l.finished_at).toLocaleString() : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="text-sm text-muted">No sync logs yet. Click “Sync now”.</p>
    {/if}
  </div>
{:else}
  <p class="text-sm text-danger">{error || 'No settings available.'}</p>
{/if}
