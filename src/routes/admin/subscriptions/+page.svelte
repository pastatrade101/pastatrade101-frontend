<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { X, ChevronRight } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import AdminTabs from '$lib/components/AdminTabs.svelte';

  interface Ref {
    email?: string;
    full_name?: string | null;
    slug?: string;
    name?: string;
    role?: string;
    is_active?: boolean;
  }
  interface Sub {
    id: string;
    user_id: string;
    status: string;
    billing_interval: string;
    provider: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    trial_end: string | null;
    cancel_at_period_end: boolean;
    cancelled_at: string | null;
    note: string | null;
    created_at: string;
    user: Ref | Ref[] | null;
    plan: Ref | Ref[] | null;
  }

  const STATUSES = ['active', 'trialing', 'past_due', 'cancelled', 'expired', 'manual', 'suspended'];

  let subs = $state<Sub[]>([]);
  let planOptions = $state<{ slug: string; name: string }[]>([]);
  let q = $state('');
  let statusFilter = $state('all');
  let planFilter = $state('all');
  let error = $state('');
  let message = $state('');
  let busyId = $state('');
  let expanded = $state<Record<string, boolean>>({}); // mobile twirl state

  // Admin guard.
  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const one = (v: Ref | Ref[] | null): Ref => (Array.isArray(v) ? (v[0] ?? {}) : (v ?? {}));
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

  const statusTone: Record<string, string> = {
    active: 'bg-mint/15 text-mint',
    trialing: 'bg-accent/15 text-accent',
    past_due: 'bg-warn/15 text-warn',
    cancelled: 'bg-danger/15 text-danger',
    expired: 'bg-danger/15 text-danger',
    suspended: 'bg-danger/15 text-danger',
    manual: 'bg-edge text-muted'
  };

  const load = async () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (planFilter !== 'all') params.set('plan', planFilter);
    if (q.trim()) params.set('q', q.trim());
    const data = await api<{ items: Sub[] }>(`/admin/subscriptions?${params.toString()}`, { auth: true });
    subs = data.items;
  };

  onMount(async () => {
    try {
      planOptions = (await api<{ items: { slug: string; name: string }[] }>('/admin/plans', { auth: true })).items;
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load subscriptions.';
    }
  });

  // Actions reuse the user-level endpoints.
  const act = async (userId: string, fn: () => Promise<unknown>, ok: string) => {
    busyId = userId;
    message = '';
    error = '';
    try {
      await fn();
      message = ok;
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Action failed.';
    } finally {
      busyId = '';
    }
  };
  const assignPlan = (s: Sub, slug: string) =>
    act(s.user_id, () => api(`/admin/users/${s.user_id}/plan`, { method: 'PUT', body: { plan_slug: slug, status: 'active' }, auth: true }), `Assigned ${slug}.`);
  const setStatus = (s: Sub, status: string) => act(s.user_id, () => api(`/admin/users/${s.user_id}/status`, { method: 'PUT', body: { status }, auth: true }), `Status → ${status}.`);
  const extend = (s: Sub) => {
    const days = Number(prompt('Extend by how many days?', '30'));
    if (!Number.isFinite(days) || days <= 0) return;
    act(s.user_id, () => api(`/admin/users/${s.user_id}/extend-subscription`, { method: 'POST', body: { days }, auth: true }), `Extended ${days} days.`);
  };
  const cancel = (s: Sub) => act(s.user_id, () => api(`/admin/users/${s.user_id}/cancel-subscription`, { method: 'POST', auth: true }), 'Cancelled & downgraded.');

  // Detail drawer.
  interface Detail {
    subscription: Sub & { user: Ref | Ref[]; plan: Ref | Ref[] };
    history: { id: string; status: string; billing_interval: string; provider: string | null; current_period_start: string | null; current_period_end: string | null; created_at: string; plan: Ref | Ref[] | null }[];
    events: { id: string; provider: string | null; event_type: string | null; status: string | null; reviewed: boolean; created_at: string }[];
  }
  let openId = $state<string | null>(null);
  let detail = $state<Detail | null>(null);
  const openDetail = async (s: Sub) => {
    openId = s.id;
    detail = null;
    try {
      detail = await api<Detail>(`/admin/subscriptions/${s.id}`, { auth: true });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load detail.';
    }
  };
</script>

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Subscriptions</h1>
  <p class="text-sm text-muted">Every subscription record across users. Manual assignment, extend, cancel, suspend.</p>
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
    <span class="stat-label">Status</span>
    <select class="input mt-1" bind:value={statusFilter} onchange={() => load()}>
      <option value="all">All statuses</option>
      {#each STATUSES as s}<option value={s}>{s}</option>{/each}
    </select>
  </div>
  <div>
    <span class="stat-label">Plan</span>
    <select class="input mt-1" bind:value={planFilter} onchange={() => load()}>
      <option value="all">All plans</option>
      {#each planOptions as p}<option value={p.slug}>{p.name}</option>{/each}
    </select>
  </div>
  <button class="btn-ghost" onclick={() => load()}>Apply</button>
</div>

<!-- Mobile-first: cards on phones, table on lg+ -->
<div class="card p-0">
  {#if subs.length === 0}
    <p class="px-4 py-6 text-center text-muted">No subscriptions found.</p>
  {:else}
    <!-- Mobile: collapsible card per subscription (twirl to expand) -->
    <ul class="divide-y divide-edge/60 lg:hidden">
      {#each subs as s (s.id)}
        {@const u = one(s.user)}
        <li class={busyId === s.user_id ? 'opacity-50' : ''}>
          <!-- Collapsed summary — tap to twirl open -->
          <button type="button" class="flex w-full items-center gap-2.5 px-4 py-3 text-left" aria-expanded={!!expanded[s.id]} onclick={() => (expanded[s.id] = !expanded[s.id])}>
            <ChevronRight class="h-4 w-4 shrink-0 text-muted transition-transform duration-200 {expanded[s.id] ? 'rotate-90' : ''}" />
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium text-strong">{u.full_name || u.email || '—'}</div>
              <div class="truncate text-xs text-muted">{u.email}</div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <span class="pill bg-panel-2 text-[10px] capitalize text-soft">{one(s.plan).name ?? 'Free'}</span>
              <span class="pill text-[10px] {statusTone[s.status] ?? 'bg-edge text-muted'}">{s.status}</span>
            </div>
          </button>

          {#if expanded[s.id]}
            <div class="px-4 pb-3.5" transition:slide={{ duration: 180 }}>
              {#if s.cancel_at_period_end}<div class="mb-2"><span class="pill bg-warn/15 text-[10px] text-warn">cancels at period end</span></div>{/if}

              <div class="grid grid-cols-2 gap-2">
                <label class="block">
                  <span class="text-[10px] uppercase tracking-wide text-muted">Plan</span>
                  <select class="mt-0.5 w-full rounded-lg border border-edge bg-panel-2/40 px-2 py-1.5 text-xs text-soft" value={one(s.plan).slug ?? 'free'} onchange={(e) => assignPlan(s, (e.currentTarget as HTMLSelectElement).value)}>
                    {#each planOptions as p}<option value={p.slug}>{p.name}</option>{/each}
                  </select>
                </label>
                <label class="block">
                  <span class="text-[10px] uppercase tracking-wide text-muted">Status</span>
                  <select class="mt-0.5 w-full rounded-lg border border-edge bg-panel-2/40 px-2 py-1.5 text-xs text-soft" value={s.status} onchange={(e) => setStatus(s, (e.currentTarget as HTMLSelectElement).value)}>
                    {#each STATUSES as st}<option value={st}>{st}</option>{/each}
                  </select>
                </label>
              </div>

              <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div><div class="text-[10px] uppercase tracking-wide text-muted">Interval</div><div class="text-soft">{s.billing_interval}</div></div>
                <div><div class="text-[10px] uppercase tracking-wide text-muted">Provider</div><div class="text-soft">{s.provider ?? '—'}</div></div>
                <div class="col-span-2"><div class="text-[10px] uppercase tracking-wide text-muted">Period</div><div class="text-soft">{fmtDate(s.current_period_start)} → {fmtDate(s.current_period_end)}</div></div>
              </div>

              <div class="mt-2.5 flex flex-wrap gap-1.5">
                <button class="btn-ghost px-2.5 py-1 text-xs" onclick={() => extend(s)}>Extend</button>
                <button class="btn-ghost px-2.5 py-1 text-xs" onclick={() => setStatus(s, 'active')}>Reactivate</button>
                <button class="btn-ghost px-2.5 py-1 text-xs text-warn" onclick={() => setStatus(s, 'suspended')}>Suspend</button>
                <button class="btn-ghost px-2.5 py-1 text-xs text-danger" onclick={() => cancel(s)}>Cancel</button>
                <button class="btn-ghost px-2.5 py-1 text-xs text-accent" onclick={() => openDetail(s)}>History →</button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <!-- Desktop: full table -->
    <div class="hidden overflow-x-auto lg:block">
      <table class="w-full min-w-[980px] text-sm">
        <thead>
          <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
            <th class="px-4 py-3 font-medium">User</th>
            <th class="px-4 py-3 font-medium">Plan</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Interval</th>
            <th class="px-4 py-3 font-medium">Provider</th>
            <th class="px-4 py-3 font-medium">Period</th>
            <th class="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each subs as s (s.id)}
            {@const u = one(s.user)}
            <tr class="border-b border-edge/60 last:border-0 hover:bg-panel-2/50 {busyId === s.user_id ? 'opacity-50' : ''}">
              <td class="px-4 py-3">
                <button class="text-left" onclick={() => openDetail(s)}>
                  <div class="font-medium text-strong hover:underline">{u.full_name || u.email || '—'}</div>
                  <div class="text-xs text-muted">{u.email}</div>
                </button>
              </td>
              <td class="px-4 py-3">
                <select class="rounded-lg border border-edge bg-panel-2/40 px-2 py-1 text-xs text-soft" value={one(s.plan).slug ?? 'free'} onchange={(e) => assignPlan(s, (e.currentTarget as HTMLSelectElement).value)}>
                  {#each planOptions as p}<option value={p.slug}>{p.name}</option>{/each}
                </select>
              </td>
              <td class="px-4 py-3">
                <select class="rounded-lg px-2 py-1 text-xs {statusTone[s.status] ?? 'bg-edge text-muted'}" value={s.status} onchange={(e) => setStatus(s, (e.currentTarget as HTMLSelectElement).value)}>
                  {#each STATUSES as st}<option value={st}>{st}</option>{/each}
                </select>
                {#if s.cancel_at_period_end}<span class="ml-1 pill bg-warn/15 text-[10px] text-warn">cancels at period end</span>{/if}
              </td>
              <td class="px-4 py-3 text-soft">{s.billing_interval}</td>
              <td class="px-4 py-3 text-muted">{s.provider ?? '—'}</td>
              <td class="px-4 py-3 text-xs text-muted">{fmtDate(s.current_period_start)} → {fmtDate(s.current_period_end)}</td>
              <td class="px-4 py-3">
                <div class="flex gap-1.5">
                  <button class="btn-ghost px-2 py-1 text-xs" onclick={() => extend(s)}>Extend</button>
                  <button class="btn-ghost px-2 py-1 text-xs" onclick={() => setStatus(s, 'active')}>Reactivate</button>
                  <button class="btn-ghost px-2 py-1 text-xs text-warn" onclick={() => setStatus(s, 'suspended')}>Suspend</button>
                  <button class="btn-ghost px-2 py-1 text-xs text-danger" onclick={() => cancel(s)}>Cancel</button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Detail drawer -->
{#if openId}
  <div class="fixed inset-0 z-40 bg-black/50" onclick={() => (openId = null)} role="presentation"></div>
  <aside class="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-edge bg-panel p-5 shadow-2xl">
    {#if !detail}
      <div class="text-center text-muted">Loading…</div>
    {:else}
      {@const u = one(detail.subscription.user)}
      <div class="mb-4 flex items-start justify-between">
        <div>
          <h2 class="text-lg font-semibold text-strong">{u.full_name || u.email}</h2>
          <p class="text-xs text-muted">{u.email}</p>
        </div>
        <button class="text-muted hover:text-strong" onclick={() => (openId = null)} aria-label="Close"><X class="h-5 w-5" /></button>
      </div>

      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Subscription history</h3>
      <ul class="mb-4 space-y-2">
        {#each detail.history as h}
          <li class="rounded-lg bg-panel-2/50 px-3 py-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-medium text-strong">{one(h.plan).name ?? '—'}</span>
              <span class="pill {statusTone[h.status] ?? 'bg-edge text-muted'} text-[10px]">{h.status}</span>
            </div>
            <div class="mt-0.5 text-muted">{h.billing_interval} · {h.provider ?? '—'} · {fmtDate(h.current_period_start)} → {fmtDate(h.current_period_end)}</div>
            <div class="text-[10px] text-muted/70">created {fmtDate(h.created_at)}</div>
          </li>
        {/each}
        {#if !detail.history.length}<li class="text-xs text-muted">No history.</li>{/if}
      </ul>

      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recent payment events</h3>
      <ul class="space-y-1">
        {#each detail.events as ev}
          <li class="flex items-center justify-between rounded-lg bg-panel-2/50 px-3 py-1.5 text-xs">
            <span class="text-soft">{ev.event_type ?? '—'} <span class="text-muted">· {ev.provider ?? '—'}</span></span>
            <span class="text-muted">{ev.status ?? '—'} · {fmtDate(ev.created_at)}</span>
          </li>
        {/each}
        {#if !detail.events.length}<li class="text-xs text-muted">No payment events.</li>{/if}
      </ul>
      <a href="/admin/payments" class="btn-ghost mt-3 w-full">Open payments →</a>
    {/if}
  </aside>
{/if}
