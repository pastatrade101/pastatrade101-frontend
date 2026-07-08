<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Check, ChevronDown, ChevronRight } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import AdminTabs from '$lib/components/AdminTabs.svelte';

  interface Ref {
    email?: string;
    full_name?: string | null;
  }
  interface PaymentEvent {
    id: string;
    user_id: string | null;
    provider: string | null;
    event_type: string | null;
    status: string | null;
    event_payload: unknown;
    reviewed: boolean;
    reviewed_at: string | null;
    created_at: string;
    user: Ref | Ref[] | null;
  }
  interface Facets {
    providers: string[];
    statuses: string[];
    event_types: string[];
  }

  let events = $state<PaymentEvent[]>([]);
  let facets = $state<Facets>({ providers: [], statuses: [], event_types: [] });
  let q = $state('');
  let providerFilter = $state('all');
  let statusFilter = $state('all');
  let typeFilter = $state('all');
  let error = $state('');
  let message = $state('');
  let expanded = $state<Record<string, boolean>>({});
  let busyId = $state('');

  // Admin guard.
  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const one = (v: Ref | Ref[] | null): Ref => (Array.isArray(v) ? (v[0] ?? {}) : (v ?? {}));
  const fmtDateTime = (d: string) => new Date(d).toLocaleString();
  const pretty = (p: unknown) => {
    try {
      return JSON.stringify(p, null, 2);
    } catch {
      return String(p);
    }
  };
  const statusTone = (s: string | null) =>
    s === 'succeeded' || s === 'active' ? 'bg-mint/15 text-mint' : s === 'pending' ? 'bg-warn/15 text-warn' : s === 'failed' ? 'bg-danger/15 text-danger' : 'bg-edge text-muted';

  const load = async () => {
    const params = new URLSearchParams();
    if (providerFilter !== 'all') params.set('provider', providerFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (typeFilter !== 'all') params.set('event_type', typeFilter);
    if (q.trim()) params.set('q', q.trim());
    const data = await api<{ items: PaymentEvent[]; facets: Facets }>(`/admin/payments?${params.toString()}`, { auth: true });
    events = data.items;
    // Capture the full facet set on the first (unfiltered) load so applying a
    // filter never removes the other options from the dropdowns.
    if (!facets.providers.length && !facets.statuses.length && !facets.event_types.length) facets = data.facets;
  };

  onMount(async () => {
    try {
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load payment events.';
    }
  });

  const toggleReviewed = async (e: PaymentEvent) => {
    busyId = e.id;
    message = '';
    error = '';
    try {
      await api(`/admin/payments/${e.id}/reviewed`, { method: 'PUT', body: { reviewed: !e.reviewed }, auth: true });
      e.reviewed = !e.reviewed; // optimistic
      message = e.reviewed ? 'Marked as reviewed.' : 'Marked as unreviewed.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Update failed.';
    } finally {
      busyId = '';
    }
  };
</script>

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Payment events</h1>
  <p class="text-sm text-muted">Provider-agnostic audit trail. Future Stripe / mobile-money webhooks write here and update subscription status.</p>
</header>
<AdminTabs />

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

<!-- Filters -->
<div class="card mb-4 flex flex-wrap items-end gap-3">
  <div class="flex-1 min-w-[160px]">
    <label class="stat-label" for="q">Search</label>
    <input id="q" class="input mt-1" placeholder="email or name…" bind:value={q} onkeydown={(e) => e.key === 'Enter' && load()} />
  </div>
  <div>
    <span class="stat-label">Provider</span>
    <select class="input mt-1" bind:value={providerFilter} onchange={() => load()}>
      <option value="all">All</option>
      {#each facets.providers as p}<option value={p}>{p}</option>{/each}
    </select>
  </div>
  <div>
    <span class="stat-label">Event type</span>
    <select class="input mt-1" bind:value={typeFilter} onchange={() => load()}>
      <option value="all">All</option>
      {#each facets.event_types as t}<option value={t}>{t}</option>{/each}
    </select>
  </div>
  <div>
    <span class="stat-label">Status</span>
    <select class="input mt-1" bind:value={statusFilter} onchange={() => load()}>
      <option value="all">All</option>
      {#each facets.statuses as s}<option value={s}>{s}</option>{/each}
    </select>
  </div>
  <button class="btn-ghost" onclick={() => load()}>Apply</button>
</div>

<!-- Mobile-first: collapsible cards on phones, table on lg+ -->
<div class="card p-0">
  {#if events.length === 0}
    <p class="px-4 py-6 text-center text-muted">No payment events yet. They appear here when users request upgrades or a provider webhook fires.</p>
  {:else}
    <!-- Mobile: collapsible card per event (twirl reveals the raw payload) -->
    <ul class="divide-y divide-edge/60 lg:hidden">
      {#each events as e (e.id)}
        {@const u = one(e.user)}
        <li>
          <button type="button" class="flex w-full items-center gap-2.5 px-4 py-3 text-left" aria-expanded={!!expanded[e.id]} onclick={() => (expanded[e.id] = !expanded[e.id])}>
            <ChevronRight class="h-4 w-4 shrink-0 text-muted transition-transform duration-200 {expanded[e.id] ? 'rotate-90' : ''}" />
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium text-strong">{u.full_name || u.email || '—'}</div>
              <div class="truncate text-xs text-muted"><span class="font-mono">{e.event_type ?? '—'}</span> · {e.provider ?? '—'}</div>
            </div>
            <span class="pill shrink-0 {statusTone(e.status)}">{e.status ?? '—'}</span>
          </button>

          {#if expanded[e.id]}
            <div class="px-4 pb-3.5" transition:slide={{ duration: 180 }}>
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs text-muted">Created {fmtDateTime(e.created_at)}</span>
                <button
                  class="pill {e.reviewed ? 'bg-mint/15 text-mint' : 'bg-edge text-muted'} {busyId === e.id ? 'opacity-50' : ''}"
                  onclick={() => toggleReviewed(e)}
                >
                  {#if e.reviewed}<Check class="h-3 w-3" /> Reviewed{:else}Mark reviewed{/if}
                </button>
              </div>
              {#if u.email}<div class="mb-2 truncate text-xs text-muted">{u.email}</div>{/if}
              <p class="mb-1 text-[11px] uppercase tracking-wide text-muted">Raw event payload</p>
              <pre class="max-h-72 overflow-auto rounded-lg border border-edge bg-ink/60 p-3 font-mono text-[11px] text-soft">{pretty(e.event_payload)}</pre>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <!-- Desktop: full table -->
    <div class="hidden overflow-x-auto lg:block">
      <table class="w-full min-w-[900px] text-sm">
        <thead>
          <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
            <th class="w-8 px-2 py-3"></th>
            <th class="px-4 py-3 font-medium">User</th>
            <th class="px-4 py-3 font-medium">Provider</th>
            <th class="px-4 py-3 font-medium">Event type</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Created</th>
            <th class="px-4 py-3 font-medium">Reviewed</th>
          </tr>
        </thead>
        <tbody>
          {#each events as e (e.id)}
            {@const u = one(e.user)}
            <tr class="border-b border-edge/60 hover:bg-panel-2/40">
              <td class="px-2 py-3">
                <button class="text-muted hover:text-strong" onclick={() => (expanded[e.id] = !expanded[e.id])} aria-label="Toggle payload">
                  {#if expanded[e.id]}<ChevronDown class="h-4 w-4" />{:else}<ChevronRight class="h-4 w-4" />{/if}
                </button>
              </td>
              <td class="px-4 py-3">
                <div class="font-medium text-strong">{u.full_name || u.email || '—'}</div>
                {#if u.email}<div class="text-xs text-muted">{u.email}</div>{/if}
              </td>
              <td class="px-4 py-3 text-soft">{e.provider ?? '—'}</td>
              <td class="px-4 py-3 font-mono text-xs text-soft">{e.event_type ?? '—'}</td>
              <td class="px-4 py-3"><span class="pill {statusTone(e.status)}">{e.status ?? '—'}</span></td>
              <td class="px-4 py-3 text-xs text-muted">{fmtDateTime(e.created_at)}</td>
              <td class="px-4 py-3">
                <button
                  class="pill {e.reviewed ? 'bg-mint/15 text-mint' : 'bg-edge text-muted'} {busyId === e.id ? 'opacity-50' : ''}"
                  onclick={() => toggleReviewed(e)}
                >
                  {#if e.reviewed}<Check class="h-3 w-3" /> Reviewed{:else}Mark reviewed{/if}
                </button>
              </td>
            </tr>
            {#if expanded[e.id]}
              <tr class="border-b border-edge/60 bg-panel-2/30">
                <td colspan="7" class="px-4 py-3">
                  <p class="mb-1 text-[11px] uppercase tracking-wide text-muted">Raw event payload</p>
                  <pre class="max-h-80 overflow-auto rounded-lg border border-edge bg-ink/60 p-3 font-mono text-xs text-soft">{pretty(e.event_payload)}</pre>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
