<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { RefreshCw, ExternalLink, Download, Check, X, EyeOff } from '@lucide/svelte';
  import { api, getToken } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';

  const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5050/api/v1';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Ico = any;
  let items = $state<Ico[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let source = $state<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let watch = $state<any[]>([]);
  let newRef = $state('');
  let addingWatch = $state(false);
  let loading = $state(true);
  let running = $state(false);
  let message = $state('');
  let error = $state('');

  let fStatus = $state(''); // admin_status filter
  let fClass = $state('');
  let search = $state('');

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    loading = true;
    error = '';
    try {
      const qs = new URLSearchParams();
      if (fStatus) qs.set('admin_status', fStatus);
      if (fClass) qs.set('classification', fClass);
      if (search) qs.set('search', search);
      const data = await api<{ items: Ico[]; source: typeof source; watch: typeof watch }>(`/admin/ico-projects${qs.toString() ? `?${qs}` : ''}`, { auth: true });
      items = data.items;
      source = data.source;
      watch = data.watch ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load ICO projects.';
    } finally {
      loading = false;
    }
  };
  onMount(load);

  const sync = async () => {
    running = true;
    message = '';
    error = '';
    try {
      const res = await api<{ records: number }>('/admin/ico-projects/sync', { method: 'POST', auth: true });
      message = `Sync complete — ${res?.records ?? 0} projects ingested/updated.`;
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sync failed.';
    } finally {
      running = false;
    }
  };

  const addWatch = async () => {
    const ref = newRef.trim();
    if (!ref) return;
    addingWatch = true;
    message = '';
    error = '';
    try {
      await api('/admin/ico-projects/watch', { method: 'POST', auth: true, body: { ref } });
      newRef = '';
      message = `Tracking "${ref}" — hit Sync now to pull its data.`;
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add tracked project.';
    } finally {
      addingWatch = false;
    }
  };

  const removeWatch = async (id: string) => {
    try {
      await api(`/admin/ico-projects/watch/${id}`, { method: 'DELETE', auth: true });
      watch = watch.filter((w) => w.id !== id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to remove.';
    }
  };

  const review = async (it: Ico, patch: { admin_status?: string; is_published?: boolean; admin_note?: string }) => {
    try {
      const res = await api<{ project: Ico }>(`/admin/ico-projects/${it.id}/review`, { method: 'PATCH', auth: true, body: patch });
      const i = items.findIndex((x) => x.id === it.id);
      if (i >= 0) items[i] = res.project;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Update failed.';
    }
  };

  const downloadCsv = async () => {
    const res = await fetch(`${API_BASE}/admin/ico-projects/export.csv`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ico-projects-all.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const CLASS_META: Record<string, { light: string; label: string; cls: string }> = {
    strong_watchlist: { light: '🟢', label: 'Strong Watchlist', cls: 'text-mint' },
    needs_research: { light: '🟡', label: 'Needs Research', cls: 'text-warn' },
    high_risk: { light: '🔴', label: 'High Risk', cls: 'text-danger' }
  };
  const statusPill = (s: string) => (s === 'approved' ? 'bg-mint/15 text-mint' : s === 'rejected' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const scoreTone = (n: number | null) => (n == null ? 'text-muted' : n >= 70 ? 'text-mint' : n >= 45 ? 'text-warn' : 'text-danger');
</script>

<header class="mb-4 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 class="text-xl font-semibold text-strong">Admin · Early Project Radar (ICO intelligence)</h1>
    <p class="text-sm text-muted">Review scraped projects and approve before they reach users. Research data only, not financial advice.</p>
  </div>
  <div class="flex items-center gap-2">
    <button class="btn-primary" disabled={running} onclick={sync}><RefreshCw class="h-4 w-4 {running ? 'animate-spin' : ''}" /> Sync now</button>
    <button class="btn-ghost" onclick={downloadCsv}><Download class="h-4 w-4" /> CSV</button>
  </div>
</header>

{#if message}<div class="card mb-3 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-3 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

{#if source && !source.enabled}
  <div class="card mb-3 border-warn/30 bg-warn/5 text-sm text-warn">
    No ingestion source is enabled. For the richest data (backers, raise, website, tokenomics, vesting) set <code class="rounded bg-panel-2 px-1">ICODROPS_ENABLED=true</code> — it scrapes ICO Drops (robots-respecting, throttled; review their ToS first).
    <code class="rounded bg-panel-2 px-1">CRYPTORANK_API_KEY</code> adds tracked-by-id projects. Then redeploy and hit <strong>Sync now</strong>.
  </div>
{:else if source}
  <p class="mb-3 text-[11px] text-muted">
    Sources: CryptoRank <span class={source.cryptorank?.enabled ? 'text-mint' : 'text-muted'}>{source.cryptorank?.enabled ? 'on' : 'off'}</span>
    · ICO Drops <span class={source.icodrops?.enabled ? 'text-mint' : 'text-muted'}>{source.icodrops?.enabled ? 'on' : 'off'}</span>
  </p>
{/if}

<!-- Tracked projects (CryptoRank, free-plan tracked-by-id) -->
<div class="card mb-3">
  <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
    <p class="stat-label">Tracked projects (CryptoRank)</p>
    <span class="text-[11px] text-muted">{watch.length} tracked · enriched on each sync</span>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <input bind:value={newRef} onkeydown={(e) => e.key === 'Enter' && addWatch()} placeholder="CryptoRank slug, id or symbol (e.g. aptos, 174670, APT)" class="input-sm min-w-[280px] flex-1" />
    <button class="btn-primary text-xs" disabled={addingWatch || !newRef.trim()} onclick={addWatch}>{addingWatch ? 'Adding…' : 'Track project'}</button>
  </div>
  {#if watch.length}
    <div class="mt-2 flex flex-wrap gap-1.5">
      {#each watch as w (w.id)}
        <span class="inline-flex items-center gap-1.5 rounded-lg bg-panel-2 px-2 py-1 text-xs text-soft">
          {w.name || w.slug || `#${w.cr_id}`}<span class="text-muted">#{w.cr_id}</span>
          <button class="text-muted hover:text-danger" title="Stop tracking" onclick={() => removeWatch(w.id)}><X class="h-3 w-3" /></button>
        </span>
      {/each}
    </div>
  {:else}
    <p class="mt-2 text-[11px] text-muted">No tracked projects yet. Add a CryptoRank slug (from its cryptorank.io URL), then hit <strong>Sync now</strong>. Note: backers, raise amount and vesting aren't on the free CryptoRank plan, so those show as red flags.</p>
  {/if}
</div>

<!-- Filters -->
<div class="card mb-3 flex flex-wrap items-center gap-2">
  <select bind:value={fStatus} onchange={load} class="input-sm">
    <option value="">All review states</option>
    <option value="pending">Pending</option>
    <option value="approved">Approved</option>
    <option value="rejected">Rejected</option>
  </select>
  <select bind:value={fClass} onchange={load} class="input-sm">
    <option value="">All classifications</option>
    <option value="strong_watchlist">🟢 Strong Watchlist</option>
    <option value="needs_research">🟡 Needs Research</option>
    <option value="high_risk">🔴 High Risk</option>
  </select>
  <input bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} placeholder="Search project…" class="input-sm" />
  <button class="btn-ghost text-xs" onclick={load}>Apply</button>
</div>

{#if loading}
  <div class="card text-center text-muted">Loading…</div>
{:else if !items.length}
  <div class="card text-center text-muted">No ICO projects yet. Enable the collector and run a sync.</div>
{:else}
  <div class="card overflow-x-auto p-0">
    <table class="w-full min-w-[1000px] text-sm">
      <thead>
        <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
          <th class="px-3 py-3 font-medium">Project</th>
          <th class="px-3 py-3 font-medium">Category</th>
          <th class="px-3 py-3 font-medium">Sale</th>
          <th class="px-3 py-3 font-medium">Score</th>
          <th class="px-3 py-3 font-medium">Class</th>
          <th class="px-3 py-3 font-medium">Flags</th>
          <th class="px-3 py-3 font-medium">Review</th>
          <th class="px-3 py-3 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each items as it (it.id)}
          {@const meta = CLASS_META[it.classification] ?? { light: '', label: it.classification ?? '—', cls: 'text-muted' }}
          <tr class="border-b border-edge/60 align-top last:border-0 hover:bg-panel-2/40">
            <td class="px-3 py-3">
              <div class="font-medium text-strong">{it.project_name}{#if it.token_symbol}<span class="ml-1 text-xs text-muted">{it.token_symbol}</span>{/if}</div>
              <div class="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted">
                {#if it.website}<a href={it.website} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 hover:text-mint">site<ExternalLink class="h-2.5 w-2.5" /></a>{/if}
                {#if it.whitepaper_url}<a href={it.whitepaper_url} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 hover:text-mint">docs<ExternalLink class="h-2.5 w-2.5" /></a>{/if}
                {#if it.source_url}<a href={it.source_url} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 hover:text-mint">source<ExternalLink class="h-2.5 w-2.5" /></a>{/if}
              </div>
              {#if it.backers?.length}<div class="mt-0.5 text-[11px] text-muted">Backers: {it.backers.slice(0, 4).join(', ')}</div>{/if}
            </td>
            <td class="px-3 py-3 text-soft">{it.category ?? '—'}</td>
            <td class="px-3 py-3">
              <div class="text-soft capitalize">{it.sale_status ?? '—'}</div>
              <div class="text-[11px] text-muted">{it.raise_amount_text ?? ''}</div>
            </td>
            <td class="px-3 py-3 font-semibold {scoreTone(it.score)}">{it.score ?? '—'}</td>
            <td class="px-3 py-3 {meta.cls}">{meta.light} {meta.label}</td>
            <td class="px-3 py-3">
              {#if it.red_flags?.length}
                <span class="text-danger" title={it.red_flags.join(' · ')}>{it.red_flags.length} ⚠</span>
              {:else}<span class="text-mint">clean</span>{/if}
            </td>
            <td class="px-3 py-3">
              <span class="pill {statusPill(it.admin_status)}">{it.admin_status}</span>
              {#if it.is_published}<span class="ml-1 pill bg-mint/15 text-mint">live</span>{/if}
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap gap-1.5">
                <button class="btn-ghost px-2 py-1 text-[11px]" title="Approve &amp; publish (make live)" onclick={() => review(it, { admin_status: 'approved', is_published: true })}><Check class="h-3 w-3" /></button>
                <button class="btn-ghost px-2 py-1 text-[11px]" title="Reject" onclick={() => review(it, { admin_status: 'rejected' })}><X class="h-3 w-3" /></button>
                {#if it.is_published}
                  <button class="btn-ghost px-2 py-1 text-[11px]" title="Unpublish (hide from users)" onclick={() => review(it, { is_published: false })}><EyeOff class="h-3 w-3" /></button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="mt-3 text-[11px] text-muted">Research data only, not financial advice. Projects are visible to users only when <span class="text-mint">approved</span> and <span class="text-mint">live</span>.</p>
{/if}
