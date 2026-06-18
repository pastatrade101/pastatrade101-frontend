<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';

  interface PlanRef {
    slug: string;
    name: string;
  }
  interface AdminUser {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    is_active: boolean;
    subscription_status: string;
    created_at: string;
    last_login_at: string | null;
    plan: PlanRef | PlanRef[] | null;
  }

  let users = $state<AdminUser[]>([]);
  let planOptions = $state<{ slug: string; name: string }[]>([]);
  let q = $state('');
  let error = $state('');
  let message = $state('');
  let busyId = $state('');

  const statuses = ['active', 'trialing', 'past_due', 'cancelled', 'expired', 'manual', 'suspended'];

  // Admin guard.
  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const planOf = (u: AdminUser): string => {
    const p = Array.isArray(u.plan) ? u.plan[0] : u.plan;
    return p?.name ?? '—';
  };
  const planSlugOf = (u: AdminUser): string => {
    const p = Array.isArray(u.plan) ? u.plan[0] : u.plan;
    return p?.slug ?? 'free';
  };

  const load = async () => {
    const data = await api<{ items: AdminUser[] }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`, { auth: true });
    users = data.items;
  };

  onMount(async () => {
    try {
      planOptions = (await api<{ items: { slug: string; name: string }[] }>('/admin/plans', { auth: true })).items;
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load users.';
    }
  });

  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    busyId = id;
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

  const assignPlan = (u: AdminUser, slug: string) =>
    act(u.id, () => api(`/admin/users/${u.id}/plan`, { method: 'PUT', body: { plan_slug: slug, status: 'active' }, auth: true }), `Assigned ${slug} to ${u.email}.`);
  const setStatus = (u: AdminUser, status: string) =>
    act(u.id, () => api(`/admin/users/${u.id}/status`, { method: 'PUT', body: { status }, auth: true }), `Status set to ${status}.`);
  const extend = (u: AdminUser) => {
    const days = Number(prompt(`Extend ${u.email} by how many days?`, '30'));
    if (!Number.isFinite(days) || days <= 0) return;
    act(u.id, () => api(`/admin/users/${u.id}/extend-subscription`, { method: 'POST', body: { days }, auth: true }), `Extended by ${days} days.`);
  };
  const cancel = (u: AdminUser) => act(u.id, () => api(`/admin/users/${u.id}/cancel-subscription`, { method: 'POST', auth: true }), 'Subscription cancelled.');

  const statusTone: Record<string, string> = {
    active: 'bg-mint/15 text-mint',
    trialing: 'bg-accent/15 text-accent',
    past_due: 'bg-warn/15 text-warn',
    cancelled: 'bg-danger/15 text-danger',
    expired: 'bg-danger/15 text-danger',
    suspended: 'bg-danger/15 text-danger',
    manual: 'bg-edge text-muted'
  };
</script>

<header class="mb-4 flex flex-wrap items-end justify-between gap-2">
  <div>
    <h1 class="text-xl font-semibold text-strong">Users &amp; Subscriptions</h1>
    <p class="text-sm text-muted">Assign plans manually (local payments / direct sales), change status, extend or cancel.</p>
  </div>
  <nav class="flex gap-2 text-sm">
    <a href="/admin/plans" class="btn-ghost">Plans</a>
    <a href="/admin/subscriptions" class="btn-ghost">Subscriptions</a>
    <a href="/admin/payments" class="btn-ghost">Payments</a>
    <a href="/admin/payment-attempts" class="btn-ghost">Follow-ups</a>
  </nav>
</header>

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

<div class="card mb-4 flex flex-wrap items-end gap-3">
  <div class="flex-1"><label class="stat-label" for="q">Search</label>
    <input id="q" class="input mt-1" placeholder="email or name…" bind:value={q} onkeydown={(e) => e.key === 'Enter' && load()} />
  </div>
  <button class="btn-ghost" onclick={() => load()}>Search</button>
</div>

<div class="card overflow-x-auto p-0">
  <table class="w-full min-w-[820px] text-sm">
    <thead>
      <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
        <th class="px-4 py-3 font-medium">User</th>
        <th class="px-4 py-3 font-medium">Role</th>
        <th class="px-4 py-3 font-medium">Plan</th>
        <th class="px-4 py-3 font-medium">Status</th>
        <th class="px-4 py-3 font-medium">Joined</th>
        <th class="px-4 py-3 font-medium">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each users as u (u.id)}
        <tr class="border-b border-edge/60 last:border-0 hover:bg-panel-2/50 {busyId === u.id ? 'opacity-50' : ''}">
          <td class="px-4 py-3">
            <div class="font-medium text-strong">{u.full_name || u.email}</div>
            <div class="text-xs text-muted">{u.email}</div>
          </td>
          <td class="px-4 py-3 capitalize text-soft">{u.role}</td>
          <td class="px-4 py-3">
            <select class="rounded-lg border border-edge bg-panel-2/40 px-2 py-1 text-xs text-soft" value={planSlugOf(u)} onchange={(e) => assignPlan(u, (e.currentTarget as HTMLSelectElement).value)}>
              {#each planOptions as po}<option value={po.slug}>{po.name}</option>{/each}
            </select>
          </td>
          <td class="px-4 py-3">
            <select class="rounded-lg px-2 py-1 text-xs {statusTone[u.subscription_status] ?? 'bg-edge text-muted'}" value={u.subscription_status} onchange={(e) => setStatus(u, (e.currentTarget as HTMLSelectElement).value)}>
              {#each statuses as s}<option value={s}>{s}</option>{/each}
            </select>
          </td>
          <td class="px-4 py-3 text-xs text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
          <td class="px-4 py-3">
            <div class="flex gap-1.5">
              <button class="btn-ghost px-2 py-1 text-xs" onclick={() => extend(u)}>Extend</button>
              <button class="btn-ghost px-2 py-1 text-xs text-danger" onclick={() => cancel(u)}>Cancel</button>
            </div>
          </td>
        </tr>
      {/each}
      {#if users.length === 0}
        <tr><td colspan="6" class="px-4 py-6 text-center text-muted">No users found.</td></tr>
      {/if}
    </tbody>
  </table>
</div>
