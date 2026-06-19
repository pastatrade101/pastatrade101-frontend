<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Plus, Trash2, RefreshCw } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';

  interface Weights { btc: number; onchain: number; social: number; altcoin: number; cycle: number }
  interface LadderStep { risk: number; label: string; action: string; pct: string }
  interface RiskZone { min: number; max: number; label: string; meaning: string }
  interface Profile {
    profile_name: string;
    is_default: boolean;
    is_active: boolean;
    show_percentages: boolean;
    weights: Weights;
    ladder: LadderStep[];
    risk_zones: RiskZone[];
    disclaimer: string;
  }

  interface Diagnostics {
    social_last_synced: string | null;
    social_score: number | null;
    social_label: string;
    social_status: string;
    sources_active: string[];
    sources_missing: string[];
    exit_uses_social: boolean;
    last_social_sync_log: { source_name: string; status: string; finished_at: string; records_processed: number } | null;
    last_recalc: string | null;
    last_snapshot_date: string | null;
    last_confidence: string | null;
  }

  let profiles = $state<Profile[]>([]);
  let diagnostics = $state<Diagnostics | null>(null);
  let selectedName = $state('balanced');
  let loading = $state(true);
  let busy = $state('');
  let message = $state('');
  let error = $state('');

  const current = $derived(profiles.find((p) => p.profile_name === selectedName) ?? null);
  const weightSum = $derived(current ? Math.round((current.weights.btc + current.weights.onchain + current.weights.social + current.weights.altcoin + current.weights.cycle) * 100) : 0);

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    try {
      const res = await api<{ items: Profile[]; diagnostics: Diagnostics }>('/admin/exit-strategy/settings', { auth: true });
      profiles = res.items;
      diagnostics = res.diagnostics ?? null;
      if (!profiles.find((p) => p.profile_name === selectedName)) selectedName = profiles[0]?.profile_name ?? 'balanced';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load settings.';
    } finally {
      loading = false;
    }
  };
  onMount(load);

  const addStep = () => {
    if (current) current.ladder = [...current.ladder, { risk: 0.5, label: 'New step', action: 'Action', pct: '' }];
  };
  const removeStep = (i: number) => {
    if (current) current.ladder = current.ladder.filter((_, idx) => idx !== i);
  };

  const save = async () => {
    if (!current) return;
    busy = 'save';
    message = '';
    error = '';
    try {
      await api('/admin/exit-strategy/settings', {
        method: 'PUT',
        auth: true,
        body: {
          profile_name: current.profile_name,
          is_default: current.is_default,
          is_active: current.is_active,
          show_percentages: current.show_percentages,
          weights: current.weights,
          ladder: current.ladder.map((s) => ({ ...s, risk: Number(s.risk) })),
          risk_zones: current.risk_zones,
          disclaimer: current.disclaimer
        }
      });
      message = `Saved “${current.profile_name}”.`;
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Save failed.';
    } finally {
      busy = '';
    }
  };

  const runAdmin = async (path: string, label: string) => {
    busy = path;
    message = '';
    error = '';
    try {
      await api(path, { method: 'POST', auth: true });
      message = `${label} done.`;
    } catch (e) {
      error = e instanceof Error ? e.message : `${label} failed.`;
    } finally {
      busy = '';
    }
  };
</script>

<header class="mb-5">
  <h1 class="text-xl font-semibold text-strong">Admin · Exit Strategy Settings</h1>
  <p class="text-sm text-muted">Configure the Dynamic Exit Strategy profiles — weights, risk zones, exit ladder and disclaimer.</p>
</header>

<div class="mb-4 flex flex-wrap gap-2 text-sm">
  <a href="/admin" class="btn-ghost">Data sync</a>
  <a href="/admin/reports" class="btn-ghost">Reports</a>
</div>

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

{#if loading}
  <p class="text-sm text-muted">Loading…</p>
{:else if current}
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
      {#each profiles as p}
        <button class="px-3 py-1.5 font-medium capitalize transition-colors {selectedName === p.profile_name ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (selectedName = p.profile_name)}>{p.profile_name}</button>
      {/each}
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn-ghost text-sm" disabled={busy !== ''} onclick={() => runAdmin('/admin/exit-strategy/sync', 'Sync')}><RefreshCw class="h-4 w-4 {busy === '/admin/exit-strategy/sync' ? 'animate-spin' : ''}" /> Sync today</button>
      <button class="btn-ghost text-sm" disabled={busy !== ''} onclick={() => runAdmin('/admin/exit-strategy/recalculate', 'Recalculate')}>Recalculate</button>
      <button class="btn-primary text-sm" disabled={busy === 'save'} onclick={save}>{busy === 'save' ? 'Saving…' : 'Save profile'}</button>
    </div>
  </div>

  <!-- Social Risk diagnostics -->
  {#if diagnostics}
    <div class="card mb-3">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-strong">Social Risk diagnostics</h2>
        <span class="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide {diagnostics.social_status === 'active' ? 'bg-mint/15 text-mint' : diagnostics.social_status === 'partial' ? 'bg-warn/15 text-warn' : 'bg-edge text-muted'}">{diagnostics.social_status}</span>
      </div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div><p class="text-muted">Latest Social Risk</p><p class="font-semibold text-strong">{diagnostics.social_score == null ? 'n/a' : `${diagnostics.social_score.toFixed(2)} · ${diagnostics.social_label}`}</p></div>
        <div><p class="text-muted">Exit uses Social Risk</p><p class="font-semibold {diagnostics.exit_uses_social ? 'text-mint' : 'text-warn'}">{diagnostics.exit_uses_social ? 'Yes' : 'No (reweighted)'}</p></div>
        <div><p class="text-muted">Last social sync</p><p class="font-semibold text-soft">{diagnostics.social_last_synced ?? '—'}</p></div>
        <div><p class="text-muted">Last recalculation</p><p class="font-semibold text-soft">{diagnostics.last_recalc ? new Date(diagnostics.last_recalc).toISOString().slice(0, 10) : '—'}{diagnostics.last_confidence ? ` · ${diagnostics.last_confidence}` : ''}</p></div>
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {#each diagnostics.sources_active as s}<span class="rounded bg-mint/10 px-1.5 py-0.5 text-mint">{s} ✓</span>{/each}
        {#each diagnostics.sources_missing as s}<span class="rounded bg-edge px-1.5 py-0.5 text-muted">{s} — missing</span>{/each}
      </div>
      {#if diagnostics.last_social_sync_log}
        <p class="mt-2 text-[11px] text-muted">Last source log: {diagnostics.last_social_sync_log.source_name} — {diagnostics.last_social_sync_log.status} ({diagnostics.last_social_sync_log.records_processed} records).</p>
      {/if}
    </div>
  {/if}

  <!-- Flags -->
  <div class="card mb-3 flex flex-wrap gap-4 text-sm">
    <label class="flex items-center gap-2"><input type="checkbox" class="accent-mint" bind:checked={current.is_default} /> Default profile</label>
    <label class="flex items-center gap-2"><input type="checkbox" class="accent-mint" bind:checked={current.is_active} /> Active (module enabled)</label>
    <label class="flex items-center gap-2"><input type="checkbox" class="accent-mint" bind:checked={current.show_percentages} /> Show exit percentages</label>
  </div>

  <!-- Weights -->
  <div class="card mb-3">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-strong">Category weights</h2>
      <span class="text-xs {weightSum === 100 ? 'text-mint' : 'text-warn'}">sum {weightSum}% {weightSum !== 100 ? '(renormalized at runtime)' : ''}</span>
    </div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {#each [['btc', 'BTC risk'], ['onchain', 'On-chain'], ['social', 'Social'], ['altcoin', 'Altcoin'], ['cycle', 'Cycle']] as [k, lab]}
        <label class="text-xs text-muted">{lab}
          <input type="number" step="0.05" min="0" max="1" class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-sm text-strong" bind:value={current.weights[k as keyof Weights]} />
        </label>
      {/each}
    </div>
  </div>

  <!-- Ladder -->
  <div class="card mb-3">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-strong">Exit ladder</h2>
      <button class="btn-ghost text-xs" onclick={addStep}><Plus class="h-3.5 w-3.5" /> Add step</button>
    </div>
    <div class="space-y-2">
      {#each current.ladder as step, i (i)}
        <div class="flex flex-wrap items-center gap-2">
          <input type="number" step="0.05" min="0" max="1" class="w-20 rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-sm text-strong" bind:value={step.risk} />
          <input class="min-w-0 flex-1 rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-sm text-soft" placeholder="Action" bind:value={step.action} />
          <input class="w-28 rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-sm text-soft" placeholder="%" bind:value={step.pct} />
          <button class="rounded-lg border border-edge p-1.5 text-muted hover:text-danger" aria-label="Remove" onclick={() => removeStep(i)}><Trash2 class="h-4 w-4" /></button>
        </div>
      {/each}
    </div>
  </div>

  <!-- Disclaimer -->
  <div class="card mb-3">
    <h2 class="mb-2 text-sm font-semibold text-strong">Disclaimer</h2>
    <textarea class="h-24 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-soft" bind:value={current.disclaimer}></textarea>
  </div>

  <p class="text-xs text-muted">Risk-zone label thresholds (Accumulation → Extreme exit risk) are shared across profiles; profiles differ by their exit ladder + weights. Edit zones directly in the DB if needed.</p>
{/if}
