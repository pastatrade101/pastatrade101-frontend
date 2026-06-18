<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { fmtMoney } from '$lib/format';
  import { authReady, user } from '$lib/stores/auth';

  interface Ref {
    email?: string;
    full_name?: string | null;
  }
  interface Attempt {
    id: string;
    provider: string | null;
    reference: string | null;
    plan_slug: string | null;
    billing_interval: string | null;
    amount: number | null;
    currency: string | null;
    status: string;
    cancel_reason: string | null;
    followup_status: string;
    followup_note: string | null;
    created_at: string;
    user: Ref | Ref[] | null;
  }

  const STATUSES = ['pending', 'completed', 'failed', 'cancelled', 'expired'];
  const FOLLOWUPS = ['open', 'contacted', 'resolved', 'ignored'];

  let attempts = $state<Attempt[]>([]);
  let statusFilter = $state('all');
  let followupFilter = $state('open');
  let q = $state('');
  let error = $state('');
  let message = $state('');
  let busyId = $state('');
  let noteDraft = $state<Record<string, string>>({});

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const one = (v: Ref | Ref[] | null): Ref => (Array.isArray(v) ? (v[0] ?? {}) : (v ?? {}));
  const fmtDate = (d: string) => new Date(d).toLocaleString();

  const statusTone = (s: string) =>
    s === 'completed' ? 'bg-mint/15 text-mint' : s === 'pending' ? 'bg-warn/15 text-warn' : s === 'cancelled' ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger';
  const followupTone = (s: string) =>
    s === 'resolved' ? 'bg-mint/15 text-mint' : s === 'contacted' ? 'bg-accent/15 text-accent' : s === 'ignored' ? 'bg-edge text-muted' : 'bg-warn/15 text-warn';

  const load = async () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (followupFilter !== 'all') params.set('followup', followupFilter);
    if (q.trim()) params.set('q', q.trim());
    attempts = (await api<{ items: Attempt[] }>(`/admin/payment-attempts?${params.toString()}`, { auth: true })).items;
    noteDraft = Object.fromEntries(attempts.map((a) => [a.id, a.followup_note ?? '']));
  };

  onMount(async () => {
    try {
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load follow-ups.';
    }
  });

  const update = async (a: Attempt, patch: { followup_status?: string; followup_note?: string }) => {
    busyId = a.id;
    message = '';
    error = '';
    try {
      await api(`/admin/payment-attempts/${a.id}/followup`, { method: 'PUT', body: patch, auth: true });
      message = 'Follow-up updated.';
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Update failed.';
    } finally {
      busyId = '';
    }
  };
</script>

<header class="mb-4 flex flex-wrap items-end justify-between gap-2">
  <div>
    <h1 class="text-xl font-semibold text-strong">Upgrade Follow-ups</h1>
    <p class="text-sm text-muted">Users who started an upgrade but didn't finish — abandoned, failed or cancelled. Reach out and close the sale.</p>
  </div>
  <nav class="flex gap-2 text-sm">
    <a href="/admin/plans" class="btn-ghost">Plans</a>
    <a href="/admin/users" class="btn-ghost">Users</a>
    <a href="/admin/subscriptions" class="btn-ghost">Subscriptions</a>
    <a href="/admin/payments" class="btn-ghost">Payments</a>
  </nav>
</header>

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

<!-- Filters -->
<div class="card mb-4 flex flex-wrap items-end gap-3">
  <div class="min-w-[160px] flex-1">
    <label class="stat-label" for="q">Search</label>
    <input id="q" class="input mt-1" placeholder="email or name…" bind:value={q} onkeydown={(e) => e.key === 'Enter' && load()} />
  </div>
  <div>
    <span class="stat-label">Status</span>
    <select class="input mt-1" bind:value={statusFilter} onchange={() => load()}>
      <option value="all">All</option>
      {#each STATUSES as s}<option value={s}>{s}</option>{/each}
    </select>
  </div>
  <div>
    <span class="stat-label">Follow-up</span>
    <select class="input mt-1" bind:value={followupFilter} onchange={() => load()}>
      <option value="all">All</option>
      {#each FOLLOWUPS as f}<option value={f}>{f}</option>{/each}
    </select>
  </div>
  <button class="btn-ghost" onclick={() => load()}>Apply</button>
</div>

<div class="space-y-3">
  {#each attempts as a (a.id)}
    {@const u = one(a.user)}
    <div class="card {busyId === a.id ? 'opacity-50' : ''}">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold text-strong">{u.full_name || u.email || 'Unknown'}</span>
            <span class="pill {statusTone(a.status)}">{a.status}</span>
            <span class="pill {followupTone(a.followup_status)}">{a.followup_status}</span>
          </div>
          <div class="mt-0.5 text-xs text-muted">{u.email}</div>
          <div class="mt-1 text-sm text-soft">
            Wanted <span class="font-medium text-strong capitalize">{a.plan_slug}</span> ({a.billing_interval}) ·
            {fmtMoney(a.amount ?? 0, a.currency ?? 'TZS')} · {a.provider} · {fmtDate(a.created_at)}
          </div>
          {#if a.cancel_reason}
            <p class="mt-1.5 rounded-lg border border-edge bg-panel-2/50 px-2.5 py-1.5 text-xs text-soft"><span class="font-medium text-warn">Cancel reason:</span> {a.cancel_reason}</p>
          {/if}
        </div>
        <select
          class="rounded-lg px-2 py-1 text-xs {followupTone(a.followup_status)}"
          value={a.followup_status}
          onchange={(e) => update(a, { followup_status: (e.currentTarget as HTMLSelectElement).value })}
        >
          {#each FOLLOWUPS as f}<option value={f}>{f}</option>{/each}
        </select>
      </div>

      <div class="mt-3 flex flex-wrap items-end gap-2 border-t border-edge/50 pt-3">
        <div class="min-w-[220px] flex-1">
          <label class="stat-label" for="note-{a.id}">Admin note</label>
          <input id="note-{a.id}" class="input mt-1" placeholder="e.g. WhatsApped, will pay Friday…" bind:value={noteDraft[a.id]} />
        </div>
        <button class="btn-ghost" onclick={() => update(a, { followup_note: noteDraft[a.id] })}>Save note</button>
      </div>
    </div>
  {/each}
  {#if attempts.length === 0}
    <div class="card text-center text-muted">No follow-ups match these filters.</div>
  {/if}
</div>
