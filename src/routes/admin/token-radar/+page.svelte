<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Crosshair } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Any = any;
  let s = $state<Any>(null);
  let loading = $state(true);
  let error = $state('');

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  onMount(async () => {
    try {
      s = await api('/admin/token-radar/stats', { auth: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load stats.';
    } finally {
      loading = false;
    }
  });

  const ratingColor = (r: string) =>
    r === 'Strong Opportunity' || r === 'Good Watchlist Candidate' ? 'text-mint' : r === 'Neutral / Wait for Confirmation' ? 'text-warn' : r === 'Weak Setup' ? 'text-orange-400' : 'text-danger';
  const userOf = (r: Any) => (Array.isArray(r.user) ? r.user[0] : r.user);
</script>

<header class="mb-4 flex items-center gap-2">
  <Crosshair class="h-5 w-5 text-accent" />
  <div>
    <h1 class="text-xl font-semibold text-strong">Admin · Token Radar</h1>
    <p class="text-sm text-muted">Scan volume, popular tokens, and analysis quality (last 7 days).</p>
  </div>
</header>

{#if loading}
  <div class="card text-center text-muted">Loading…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if s}
  <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
    <div class="card p-4"><p class="stat-label">Scans today</p><p class="mt-1 text-2xl font-bold text-strong">{s.scans_today}</p></div>
    <div class="card p-4"><p class="stat-label">Scans (7d)</p><p class="mt-1 text-2xl font-bold text-strong">{s.scans_7d}</p></div>
    <div class="card p-4"><p class="stat-label">Avg confidence</p><p class="mt-1 text-2xl font-bold text-mint">{s.avg_confidence ?? '—'}</p></div>
    <div class="card p-4"><p class="stat-label">Avg risk</p><p class="mt-1 text-2xl font-bold text-warn">{s.avg_risk ?? '—'}</p></div>
  </div>

  <div class="mb-4 grid gap-3 lg:grid-cols-3">
    <div class="card">
      <p class="stat-label mb-2">By chain</p>
      {#each s.by_chain as c}
        <div class="flex items-center justify-between py-1 text-sm"><span class="capitalize text-soft">{c.key}</span><span class="text-muted">{c.count}</span></div>
      {:else}<p class="text-sm text-muted">No scans yet.</p>{/each}
    </div>
    <div class="card">
      <p class="stat-label mb-2">Most scanned tokens</p>
      {#each s.top_tokens as t}
        <div class="flex items-center justify-between py-1 text-sm"><span class="text-soft">{t.key}</span><span class="text-muted">{t.count}</span></div>
      {:else}<p class="text-sm text-muted">—</p>{/each}
    </div>
    <div class="card">
      <p class="stat-label mb-2">Top users</p>
      {#each s.top_users as u}
        <div class="flex items-center justify-between py-1 text-sm"><span class="truncate text-soft">{u.key}</span><span class="shrink-0 text-muted">{u.count}</span></div>
      {:else}<p class="text-sm text-muted">—</p>{/each}
    </div>
  </div>

  <div class="card overflow-x-auto p-0">
    <div class="border-b border-edge px-4 py-3"><h2 class="text-sm font-semibold text-strong">Latest scans</h2></div>
    <table class="w-full min-w-[720px] text-sm">
      <thead>
        <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
          <th class="px-4 py-3 font-medium">Token</th><th class="px-4 py-3 font-medium">Chain</th><th class="px-4 py-3 font-medium">Rating</th><th class="px-4 py-3 font-medium">Risk</th><th class="px-4 py-3 font-medium">Conf.</th><th class="px-4 py-3 font-medium">User</th><th class="px-4 py-3 font-medium">When</th>
        </tr>
      </thead>
      <tbody>
        {#each s.latest as r (r.id)}
          <tr class="border-b border-edge/60 last:border-0">
            <td class="px-4 py-3 font-medium text-strong">{r.token_symbol ?? r.token_name ?? '—'}</td>
            <td class="px-4 py-3 capitalize text-soft">{r.chain}</td>
            <td class="px-4 py-3 {ratingColor(r.final_rating)}">{r.final_rating}</td>
            <td class="px-4 py-3 text-soft">{r.risk_score ?? '—'}</td>
            <td class="px-4 py-3 text-soft">{r.confidence_score ?? '—'}</td>
            <td class="px-4 py-3 text-xs text-muted">{userOf(r)?.email ?? '—'}</td>
            <td class="px-4 py-3 text-muted">{new Date(r.created_at).toLocaleString()}</td>
          </tr>
        {:else}
          <tr><td colspan="7" class="px-4 py-6 text-center text-muted">No scans yet.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
