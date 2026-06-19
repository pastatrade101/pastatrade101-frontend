<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fly, fade } from 'svelte/transition';
  import { Users, UserCheck, Crown, Layers, XCircle, Bell, RefreshCw, Download, Search, X, ChevronLeft, ChevronRight, Eye, CalendarPlus, Repeat, Ban, FileText } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import AdminTabs from '$lib/components/AdminTabs.svelte';

  interface PlanRef { slug: string; name: string }
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
    subscription: { status: string; billing_interval: string | null; current_period_end: string | null; cancel_at_period_end: boolean | null; days_remaining: number | null } | null;
    usage: { watchlist_items: number; alerts: number };
    limits: { max_watchlist_items: number | null; max_alerts: number | null };
    latest_payment: { provider: string; status: string; event_type: string; created_at: string } | null;
    followup_status: string | null;
  }
  interface Metrics { total_users: number; active: number; free: number; mid: number; premium: number; expired: number; cancelled: number; suspended: number; expired_cancelled: number; followups_due: number; payments_pending: number }

  let users = $state<AdminUser[]>([]);
  let total = $state(0);
  let page = $state(1);
  let limit = $state(25);
  let totalPages = $state(1);
  let metrics = $state<Metrics | null>(null);
  let planOptions = $state<{ slug: string; name: string }[]>([]);

  let search = $state('');
  let fPlan = $state('all');
  let fStatus = $state('all');
  let fRole = $state('all');
  let fJoined = $state('all');

  let loading = $state(true);
  let error = $state('');
  let message = $state('');
  let busyId = $state('');
  let selected = $state<Set<string>>(new Set());

  const statuses = ['active', 'trialing', 'past_due', 'cancelled', 'expired', 'manual', 'suspended'];

  // Admin guard.
  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  // ── Helpers ──
  const planOf = (u: AdminUser) => (Array.isArray(u.plan) ? u.plan[0] : u.plan);
  const planSlugOf = (u: AdminUser) => planOf(u)?.slug ?? 'free';
  const initials = (u: { full_name: string | null; email: string }) => (u.full_name || u.email || '?').trim().charAt(0).toUpperCase();
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const planBadgeTone = (slug: string) => (slug === 'premium' ? 'bg-accent/15 text-accent' : slug === 'mid' ? 'bg-mint/15 text-mint' : 'bg-edge text-muted');
  const statusTone: Record<string, string> = {
    active: 'bg-mint/15 text-mint',
    trialing: 'bg-accent/15 text-accent',
    past_due: 'bg-warn/15 text-warn',
    manual: 'bg-accent/10 text-accent',
    cancelled: 'bg-danger/15 text-danger',
    expired: 'bg-warn/15 text-warn',
    suspended: 'bg-edge text-muted'
  };
  const daysLeftLabel = (u: AdminUser) => {
    const d = u.subscription?.days_remaining;
    if (d == null) return null;
    if (d < 0) return `expired ${-d}d ago`;
    if (d === 0) return 'ends today';
    return `${d} days left`;
  };
  // Rows that need admin attention.
  const rowAlert = (u: AdminUser): string | null => {
    if (u.subscription_status === 'suspended') return 'suspended';
    if (u.subscription_status === 'expired') return 'expired';
    if (u.followup_status && ['open', 'contacted'].includes(u.followup_status)) return 'followup';
    const d = u.subscription?.days_remaining;
    if (d != null && d >= 0 && d <= 7) return 'expiring';
    return null;
  };
  const followupBadge = (u: AdminUser): { label: string; tone: string } | null => {
    if (u.followup_status && ['open', 'contacted'].includes(u.followup_status)) return { label: 'Follow-up due', tone: 'bg-warn/15 text-warn' };
    const d = u.subscription?.days_remaining;
    if (d != null && d >= 0 && d <= 7) return { label: 'Expiring soon', tone: 'bg-warn/15 text-warn' };
    if (u.subscription_status === 'expired') return { label: 'Expired', tone: 'bg-danger/15 text-danger' };
    return null;
  };

  // ── Data loading ──
  const qs = () => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (fPlan !== 'all') p.set('plan', fPlan);
    if (fStatus !== 'all') p.set('status', fStatus);
    if (fRole !== 'all') p.set('role', fRole);
    if (fJoined !== 'all') p.set('joined', fJoined);
    p.set('page', String(page));
    p.set('limit', String(limit));
    return p.toString();
  };

  const loadUsers = async () => {
    loading = true;
    error = '';
    try {
      const data = await api<{ items: AdminUser[]; total: number; page: number; limit: number; total_pages: number }>(`/admin/users?${qs()}`, { auth: true });
      users = data.items;
      total = data.total;
      totalPages = data.total_pages;
      selected = new Set();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load users.';
    } finally {
      loading = false;
    }
  };
  const loadMetrics = async () => {
    try {
      metrics = await api<Metrics>('/admin/users/metrics', { auth: true });
    } catch {
      /* non-fatal */
    }
  };

  onMount(async () => {
    try {
      planOptions = (await api<{ items: { slug: string; name: string }[] }>('/admin/plans', { auth: true })).items;
    } catch {
      /* ignore */
    }
    await Promise.all([loadUsers(), loadMetrics()]);
  });

  // Debounced search + filter changes reset to page 1.
  let searchTimer: ReturnType<typeof setTimeout>;
  const onSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      page = 1;
      void loadUsers();
    }, 350);
  };
  const onFilter = () => {
    page = 1;
    void loadUsers();
  };
  const resetFilters = () => {
    search = '';
    fPlan = 'all';
    fStatus = 'all';
    fRole = 'all';
    fJoined = 'all';
    page = 1;
    void loadUsers();
  };
  const goPage = (n: number) => {
    if (n < 1 || n > totalPages) return;
    page = n;
    void loadUsers();
  };

  const refreshAll = () => Promise.all([loadUsers(), loadMetrics()]);

  // ── Actions ──
  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    busyId = id;
    message = '';
    error = '';
    try {
      await fn();
      message = ok;
      await refreshAll();
      if (drawerUser && drawerUser.id === id) await openDrawer(id);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Action failed.';
    } finally {
      busyId = '';
    }
  };
  const setStatus = (id: string, status: string, note?: string) => act(id, () => api(`/admin/users/${id}/status`, { method: 'PUT', body: { status, note }, auth: true }), `Status set to ${status}.`);
  const cancelSub = (u: AdminUser) => {
    if (!confirm(`Cancel ${u.email}'s subscription and downgrade to Free?`)) return;
    return act(u.id, () => api(`/admin/users/${u.id}/cancel-subscription`, { method: 'POST', auth: true }), 'Subscription cancelled.');
  };

  // ── User detail drawer ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let drawerUser = $state<any>(null);
  let drawerLoading = $state(false);
  let noteText = $state('');
  const openDrawer = async (id: string) => {
    drawerLoading = true;
    if (!drawerUser || drawerUser.id !== id) drawerUser = { id };
    try {
      drawerUser = await api(`/admin/users/${id}`, { auth: true });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load user.';
      drawerUser = null;
    } finally {
      drawerLoading = false;
    }
  };
  const closeDrawer = () => {
    drawerUser = null;
    noteText = '';
  };
  const addNote = async () => {
    if (!drawerUser || !noteText.trim()) return;
    await act(drawerUser.id, () => api(`/admin/users/${drawerUser.id}/note`, { method: 'POST', body: { note: noteText.trim() }, auth: true }), 'Note added.');
    noteText = '';
  };

  // ── Plan assignment modal ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let planModal = $state<{ user: AdminUser | null; bulk: boolean } | null>(null);
  let pmSlug = $state('premium');
  let pmStatus = $state('active');
  let pmInterval = $state('manual');
  let pmStart = $state('');
  let pmEnd = $state('');
  let pmNote = $state('');
  const openPlanModal = (u: AdminUser | null, bulk = false) => {
    planModal = { user: u, bulk };
    pmSlug = u ? planSlugOf(u) : 'premium';
    pmStatus = 'active';
    pmInterval = 'manual';
    pmStart = new Date().toISOString().slice(0, 10);
    pmEnd = '';
    pmNote = '';
  };
  const planName = (slug: string) => planOptions.find((p) => p.slug === slug)?.name ?? slug;
  const planConfirmText = $derived.by(() => {
    if (!planModal) return '';
    const who = planModal.bulk ? `${selected.size} selected users` : planModal.user ? planModal.user.full_name || planModal.user.email : '';
    const fromTxt = !planModal.bulk && planModal.user ? `from ${planName(planSlugOf(planModal.user))} ` : '';
    const until = pmEnd ? ` until ${fmtDate(pmEnd)}` : '';
    return `You are changing ${who} ${fromTxt}to ${planName(pmSlug)}${until}.`;
  });
  const submitPlan = async () => {
    if (!planModal) return;
    const bodyOf = () => ({ plan_slug: pmSlug, status: pmStatus, billing_interval: pmInterval, current_period_start: pmStart || undefined, current_period_end: pmEnd || undefined, note: pmNote || undefined });
    const targets = planModal.bulk ? [...selected] : planModal.user ? [planModal.user.id] : [];
    const m = planModal;
    planModal = null;
    busyId = m.bulk ? 'bulk' : targets[0];
    message = '';
    error = '';
    try {
      for (const id of targets) await api(`/admin/users/${id}/plan`, { method: 'PUT', body: bodyOf(), auth: true });
      message = `Assigned ${planName(pmSlug)} to ${targets.length} user${targets.length > 1 ? 's' : ''}.`;
      await refreshAll();
      if (drawerUser && targets.includes(drawerUser.id)) await openDrawer(drawerUser.id);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Plan assignment failed.';
    } finally {
      busyId = '';
    }
  };

  // ── Extend modal ──
  let extendModal = $state<{ user: AdminUser } | null>(null);
  let exDays = $state(30);
  let exNote = $state('');
  const openExtend = (u: AdminUser) => {
    extendModal = { user: u };
    exDays = 30;
    exNote = '';
  };
  const setExtendByDate = (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (!v) return;
    exDays = Math.max(1, Math.ceil((Date.parse(v) - Date.now()) / 86_400_000));
  };
  const submitExtend = async () => {
    if (!extendModal) return;
    const u = extendModal.user;
    const days = Number(exDays);
    const note = exNote;
    extendModal = null;
    if (!Number.isFinite(days) || days <= 0) return;
    await act(u.id, () => api(`/admin/users/${u.id}/extend-subscription`, { method: 'POST', body: { days, note: note || undefined }, auth: true }), `Extended by ${days} days.`);
  };

  // ── Bulk ──
  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    selected = s;
  };
  const allOnPage = $derived(users.length > 0 && users.every((u) => selected.has(u.id)));
  const toggleAll = () => {
    const s = new Set(selected);
    if (allOnPage) users.forEach((u) => s.delete(u.id));
    else users.forEach((u) => s.add(u.id));
    selected = s;
  };
  let bulkStatus = $state('active');
  const bulkSetStatus = async () => {
    if (!selected.size || !confirm(`Set ${selected.size} users to "${bulkStatus}"?`)) return;
    busyId = 'bulk';
    message = '';
    error = '';
    try {
      for (const id of selected) await api(`/admin/users/${id}/status`, { method: 'PUT', body: { status: bulkStatus }, auth: true });
      message = `Set ${selected.size} users to ${bulkStatus}.`;
      await refreshAll();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Bulk update failed.';
    } finally {
      busyId = '';
    }
  };

  // ── CSV export (selected, else current page) ──
  const exportCsv = () => {
    const rows = selected.size ? users.filter((u) => selected.has(u.id)) : users;
    const head = ['Name', 'Email', 'Role', 'Plan', 'Status', 'Period end', 'Days left', 'Joined'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((u) => [u.full_name ?? '', u.email, u.role, planName(planSlugOf(u)), u.subscription_status, u.subscription?.current_period_end ?? '', u.subscription?.days_remaining ?? '', u.created_at].map(esc).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pastatrade-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const showingFrom = $derived(total === 0 ? 0 : (page - 1) * limit + 1);
  const showingTo = $derived(Math.min(page * limit, total));
</script>

{#snippet planBadge(slug: string)}
  <span class="rounded px-2 py-0.5 text-[11px] font-semibold capitalize {planBadgeTone(slug)}">{planName(slug)}</span>
{/snippet}
{#snippet statusPill(s: string)}
  <span class="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize {statusTone[s] ?? 'bg-edge text-muted'}">{s}</span>
{/snippet}

<!-- Header -->
<header class="mb-4 flex flex-wrap items-start justify-between gap-3">
  <div>
    <h1 class="text-xl font-semibold text-strong">Users &amp; Subscriptions</h1>
    <p class="text-sm text-muted">Manage member access, subscription status, manual payments, and plan limits — all from one dashboard.</p>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <button class="btn-ghost text-sm" onclick={refreshAll} disabled={loading}><RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" /> Refresh</button>
    <button class="btn-ghost text-sm" onclick={exportCsv}><Download class="h-4 w-4" /> Export CSV</button>
    <a href="/admin/payment-attempts" class="btn-ghost text-sm"><Bell class="h-4 w-4" /> Follow-ups</a>
  </div>
</header>

<!-- Tabs -->
<AdminTabs />

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint" transition:fade>{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger" transition:fade>{error}</div>{/if}

<!-- Metric cards -->
<div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
  {#snippet metric(label: string, value: number | undefined, Icon: typeof Users, tone: string)}
    <div class="card flex items-center gap-3 p-3">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {tone}"><Icon class="h-4 w-4" /></span>
      <div class="min-w-0"><p class="truncate text-[11px] uppercase tracking-wide text-muted">{label}</p><p class="text-lg font-bold text-strong">{value ?? '—'}</p></div>
    </div>
  {/snippet}
  {@render metric('Total users', metrics?.total_users, Users, 'bg-panel-2 text-soft')}
  {@render metric('Active', metrics?.active, UserCheck, 'bg-mint/15 text-mint')}
  {@render metric('Premium', metrics?.premium, Crown, 'bg-accent/15 text-accent')}
  {@render metric('Mid', metrics?.mid, Layers, 'bg-mint/10 text-mint')}
  {@render metric('Expired / cancelled', metrics?.expired_cancelled, XCircle, 'bg-danger/15 text-danger')}
  {@render metric('Follow-ups due', metrics?.followups_due, Bell, 'bg-warn/15 text-warn')}
</div>

<!-- Filters -->
<div class="card mb-4">
  <div class="flex flex-wrap items-end gap-3">
    <div class="min-w-[200px] flex-1">
      <label class="stat-label" for="q">Search</label>
      <div class="relative mt-1">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input id="q" class="input pl-8" placeholder="Search by name, email, or plan…" bind:value={search} oninput={onSearch} />
      </div>
    </div>
    <div>
      <label class="stat-label" for="fp">Plan</label>
      <select id="fp" class="input mt-1" bind:value={fPlan} onchange={onFilter}>
        <option value="all">All plans</option>
        {#each planOptions as p}<option value={p.slug}>{p.name}</option>{/each}
      </select>
    </div>
    <div>
      <label class="stat-label" for="fs">Status</label>
      <select id="fs" class="input mt-1" bind:value={fStatus} onchange={onFilter}>
        <option value="all">All status</option>
        {#each statuses as s}<option value={s}>{s}</option>{/each}
      </select>
    </div>
    <div>
      <label class="stat-label" for="fr">Role</label>
      <select id="fr" class="input mt-1" bind:value={fRole} onchange={onFilter}>
        <option value="all">All roles</option>
        <option value="admin">Admin</option>
        <option value="subscriber">Subscriber</option>
      </select>
    </div>
    <div>
      <label class="stat-label" for="fj">Joined</label>
      <select id="fj" class="input mt-1" bind:value={fJoined} onchange={onFilter}>
        <option value="all">Any time</option>
        <option value="today">Today</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
      </select>
    </div>
    <button class="btn-ghost text-sm" onclick={resetFilters}><X class="h-4 w-4" /> Reset</button>
  </div>
</div>

<!-- Bulk action bar -->
{#if selected.size}
  <div class="card mb-3 flex flex-wrap items-center gap-3 border-accent/30 bg-accent/5" transition:fade>
    <span class="text-sm font-medium text-strong">{selected.size} selected</span>
    <button class="btn-ghost text-sm" onclick={() => openPlanModal(null, true)}>Assign plan</button>
    <div class="flex items-center gap-1.5">
      <select class="input" bind:value={bulkStatus}>{#each statuses as s}<option value={s}>{s}</option>{/each}</select>
      <button class="btn-ghost text-sm" onclick={bulkSetStatus}>Set status</button>
    </div>
    <button class="btn-ghost text-sm" onclick={exportCsv}><Download class="h-4 w-4" /> Export selected</button>
    <button class="btn-ghost ml-auto text-sm" onclick={() => (selected = new Set())}>Clear</button>
  </div>
{/if}

<!-- Table (md+) -->
<div class="card hidden overflow-x-auto p-0 md:block">
  <table class="w-full min-w-[940px] text-sm">
    <thead class="sticky top-0 z-10 bg-panel">
      <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
        <th class="px-3 py-3"><input type="checkbox" class="accent-mint" checked={allOnPage} onchange={toggleAll} aria-label="Select all" /></th>
        <th class="px-4 py-3 font-medium">User</th>
        <th class="px-4 py-3 font-medium">Plan</th>
        <th class="px-4 py-3 font-medium">Status</th>
        <th class="px-4 py-3 font-medium">Subscription</th>
        <th class="px-4 py-3 font-medium">Usage</th>
        <th class="px-4 py-3 font-medium">Joined</th>
        <th class="px-4 py-3 font-medium">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#if loading}
        {#each Array(6) as _}
          <tr class="border-b border-edge/60"><td class="px-4 py-4" colspan="8"><div class="h-5 w-full animate-pulse rounded bg-panel-2"></div></td></tr>
        {/each}
      {:else if users.length === 0}
        <tr><td colspan="8" class="px-4 py-10 text-center text-muted">No users found matching these filters.</td></tr>
      {:else}
        {#each users as u (u.id)}
          {@const alert = rowAlert(u)}
          {@const fb = followupBadge(u)}
          <tr class="border-b border-edge/60 last:border-0 hover:bg-panel-2/50 {busyId === u.id ? 'opacity-50' : ''} {alert === 'suspended' || alert === 'expired' ? 'bg-danger/5' : alert === 'expiring' || alert === 'followup' ? 'bg-warn/5' : ''}">
            <td class="px-3 py-3"><input type="checkbox" class="accent-mint" checked={selected.has(u.id)} onchange={() => toggleSelect(u.id)} aria-label="Select user" /></td>
            <td class="px-4 py-3">
              <button class="flex items-center gap-3 text-left" onclick={() => openDrawer(u.id)}>
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint/15 text-sm font-semibold text-mint">{initials(u)}</span>
                <span class="min-w-0">
                  <span class="block font-medium text-strong hover:underline">{u.full_name || u.email}</span>
                  <span class="block text-xs text-muted">{u.email}</span>
                </span>
              </button>
            </td>
            <td class="px-4 py-3">{@render planBadge(planSlugOf(u))}{#if u.role === 'admin'}<span class="ml-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">admin</span>{/if}</td>
            <td class="px-4 py-3">
              {@render statusPill(u.subscription_status)}
              {#if fb}<span class="mt-1 block w-fit rounded px-1.5 py-0.5 text-[10px] font-medium {fb.tone}">{fb.label}</span>{/if}
            </td>
            <td class="px-4 py-3 text-xs">
              {#if u.subscription?.current_period_end}
                <div class="text-soft">Ends {fmtDate(u.subscription.current_period_end)}</div>
                <div class="{(u.subscription.days_remaining ?? 99) <= 7 ? 'text-warn' : 'text-muted'}">{daysLeftLabel(u)}</div>
              {:else}
                <span class="text-muted">—</span>
              {/if}
            </td>
            <td class="px-4 py-3 text-xs text-muted">
              <div>Watchlist: {u.usage.watchlist_items}{u.limits.max_watchlist_items != null ? `/${u.limits.max_watchlist_items}` : ''}</div>
              <div>Alerts: {u.usage.alerts}{u.limits.max_alerts != null ? `/${u.limits.max_alerts}` : ''}</div>
            </td>
            <td class="px-4 py-3 text-xs text-muted">{fmtDate(u.created_at)}</td>
            <td class="px-4 py-3">
              <div class="flex gap-1">
                <button class="btn-ghost px-2 py-1 text-xs" onclick={() => openDrawer(u.id)} title="View details"><Eye class="h-3.5 w-3.5" /></button>
                <button class="btn-ghost px-2 py-1 text-xs" onclick={() => openPlanModal(u)} title="Change plan"><Repeat class="h-3.5 w-3.5" /></button>
                <button class="btn-ghost px-2 py-1 text-xs" onclick={() => openExtend(u)} title="Extend access"><CalendarPlus class="h-3.5 w-3.5" /></button>
                <button class="btn-ghost px-2 py-1 text-xs text-danger" onclick={() => cancelSub(u)} title="Cancel"><Ban class="h-3.5 w-3.5" /></button>
              </div>
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>

<!-- Cards (mobile) -->
<div class="space-y-3 md:hidden">
  {#if loading}
    {#each Array(4) as _}<div class="card h-24 animate-pulse"></div>{/each}
  {:else if users.length === 0}
    <div class="card text-center text-muted">No users found matching these filters.</div>
  {:else}
    {#each users as u (u.id)}
      {@const fb = followupBadge(u)}
      <div class="card {busyId === u.id ? 'opacity-50' : ''}">
        <button class="flex w-full items-center gap-3 text-left" onclick={() => openDrawer(u.id)}>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint/15 text-sm font-semibold text-mint">{initials(u)}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-strong">{u.full_name || u.email}</span>
            <span class="block truncate text-xs text-muted">{u.email}</span>
          </span>
          {@render planBadge(planSlugOf(u))}
        </button>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {@render statusPill(u.subscription_status)}
          {#if fb}<span class="rounded px-1.5 py-0.5 text-[10px] font-medium {fb.tone}">{fb.label}</span>{/if}
          {#if u.subscription?.current_period_end}<span class="text-muted">· {daysLeftLabel(u)}</span>{/if}
        </div>
        <div class="mt-2 flex gap-1.5">
          <button class="btn-ghost flex-1 py-1 text-xs" onclick={() => openPlanModal(u)}>Plan</button>
          <button class="btn-ghost flex-1 py-1 text-xs" onclick={() => openExtend(u)}>Extend</button>
          <button class="btn-ghost flex-1 py-1 text-xs text-danger" onclick={() => cancelSub(u)}>Cancel</button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<!-- Pagination -->
<div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
  <div class="flex items-center gap-2 text-muted">
    <span>Showing {showingFrom}–{showingTo} of {total} users</span>
    <select class="input" bind:value={limit} onchange={() => { page = 1; void loadUsers(); }}>
      {#each [25, 50, 100] as n}<option value={n}>{n} / page</option>{/each}
    </select>
  </div>
  <div class="flex items-center gap-2">
    <button class="btn-ghost px-2 py-1" disabled={page <= 1} onclick={() => goPage(page - 1)}><ChevronLeft class="h-4 w-4" /></button>
    <span class="text-muted">Page {page} of {totalPages}</span>
    <button class="btn-ghost px-2 py-1" disabled={page >= totalPages} onclick={() => goPage(page + 1)}><ChevronRight class="h-4 w-4" /></button>
  </div>
</div>

<!-- ── User detail drawer ── -->
{#if drawerUser}
  <button class="fixed inset-0 z-40 bg-black/50" aria-label="Close" onclick={closeDrawer} transition:fade={{ duration: 150 }}></button>
  <aside class="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-edge bg-panel shadow-2xl" transition:fly={{ x: 400, duration: 200 }}>
    <div class="flex items-center justify-between border-b border-edge px-4 py-3">
      <h2 class="font-semibold text-strong">User details</h2>
      <button class="rounded-lg border border-edge p-1.5 text-muted hover:text-strong" aria-label="Close" onclick={closeDrawer}><X class="h-4 w-4" /></button>
    </div>
    {#if drawerLoading && !drawerUser.email}
      <div class="space-y-3 p-4">{#each Array(5) as _}<div class="h-5 animate-pulse rounded bg-panel-2"></div>{/each}</div>
    {:else}
      <div class="space-y-4 p-4 text-sm">
        <!-- Profile -->
        <div class="flex items-center gap-3">
          <span class="flex h-12 w-12 items-center justify-center rounded-full bg-mint/15 text-lg font-semibold text-mint">{initials(drawerUser)}</span>
          <div class="min-w-0">
            <p class="truncate font-semibold text-strong">{drawerUser.full_name || 'Member'}</p>
            <p class="truncate text-xs text-muted">{drawerUser.email}</p>
            <div class="mt-1 flex items-center gap-1.5">
              {@render statusPill(drawerUser.subscription_status)}
              {@render planBadge((Array.isArray(drawerUser.plan) ? drawerUser.plan[0]?.slug : drawerUser.plan?.slug) ?? 'free')}
              <span class="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">{drawerUser.role}</span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 rounded-lg border border-edge p-3 text-xs">
          <div><p class="text-muted">Joined</p><p class="text-soft">{fmtDate(drawerUser.created_at)}</p></div>
          <div><p class="text-muted">Last login</p><p class="text-soft">{fmtDate(drawerUser.last_login_at)}</p></div>
          {#if drawerUser.subscriptions?.[0]}
            {@const s = drawerUser.subscriptions[0]}
            <div><p class="text-muted">Billing</p><p class="text-soft">{s.billing_interval ?? '—'} · {s.provider ?? '—'}</p></div>
            <div><p class="text-muted">Period end</p><p class="text-soft">{fmtDate(s.current_period_end)}</p></div>
            <div><p class="text-muted">Cancel at period end</p><p class="text-soft">{s.cancel_at_period_end ? 'Yes' : 'No'}</p></div>
          {/if}
        </div>

        <!-- Usage -->
        <div>
          <p class="stat-label mb-1">Usage</p>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="rounded-lg border border-edge p-2"><p class="text-muted">Watchlist items</p><p class="text-lg font-semibold text-strong">{drawerUser.usage?.watchlist_items ?? 0}</p></div>
            <div class="rounded-lg border border-edge p-2"><p class="text-muted">Alerts</p><p class="text-lg font-semibold text-strong">{drawerUser.usage?.alerts ?? 0}</p></div>
          </div>
        </div>

        <!-- Actions -->
        <div>
          <p class="stat-label mb-1">Actions</p>
          <div class="grid grid-cols-2 gap-2">
            <button class="btn-ghost text-sm" onclick={() => { const u = drawerUser; openPlanModal({ ...u, plan: u.plan } as AdminUser); }}><Repeat class="h-4 w-4" /> Change plan</button>
            <button class="btn-ghost text-sm" onclick={() => openExtend(drawerUser as AdminUser)}><CalendarPlus class="h-4 w-4" /> Extend</button>
            {#if drawerUser.subscription_status === 'suspended'}
              <button class="btn-ghost text-sm" onclick={() => setStatus(drawerUser.id, 'active')}>Reactivate</button>
            {:else}
              <button class="btn-ghost text-sm" onclick={() => setStatus(drawerUser.id, 'suspended')}><Ban class="h-4 w-4" /> Suspend</button>
            {/if}
            <button class="btn-ghost text-sm text-danger" onclick={() => cancelSub(drawerUser as AdminUser)}>Cancel</button>
          </div>
        </div>

        <!-- Internal note -->
        <div>
          <p class="stat-label mb-1">Add internal note</p>
          <textarea class="input h-16 w-full" placeholder="Manual M-Pesa payment received…" bind:value={noteText}></textarea>
          <button class="btn-primary mt-1.5 text-sm" disabled={!noteText.trim()} onclick={addNote}>Save note</button>
        </div>

        <!-- Payment history -->
        {#if drawerUser.payments?.length}
          <div>
            <p class="stat-label mb-1">Payment history</p>
            <ul class="space-y-1 text-xs">
              {#each drawerUser.payments.slice(0, 5) as p}
                <li class="flex items-center justify-between gap-2 rounded border border-edge px-2 py-1.5">
                  <span class="text-soft">{p.provider} · {p.event_type}</span>
                  <span class="text-muted">{p.status} · {fmtDate(p.created_at)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <!-- Audit trail -->
        {#if drawerUser.audit?.length}
          <div>
            <p class="stat-label mb-1 flex items-center gap-1.5"><FileText class="h-3.5 w-3.5" /> Admin activity</p>
            <ul class="space-y-1 text-xs">
              {#each drawerUser.audit.slice(0, 8) as a}
                <li class="rounded border border-edge px-2 py-1.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium capitalize text-soft">{a.action_type.replace('_', ' ')}</span>
                    <span class="text-muted">{fmtDate(a.created_at)}</span>
                  </div>
                  {#if a.note}<p class="mt-0.5 text-muted">{a.note}</p>{/if}
                  {#if a.action_type === 'plan_change' && a.new_value}<p class="mt-0.5 text-muted">{a.old_value?.plan ?? '—'} → {a.new_value?.plan ?? '—'}</p>{/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </aside>
{/if}

<!-- ── Plan assignment modal ── -->
{#if planModal}
  <button class="fixed inset-0 z-40 bg-black/50" aria-label="Close" onclick={() => (planModal = null)} transition:fade={{ duration: 120 }}></button>
  <div class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-edge bg-panel p-5 shadow-2xl" transition:fly={{ y: 12, duration: 160 }}>
    <h2 class="text-lg font-semibold text-strong">{planModal.bulk ? `Assign plan to ${selected.size} users` : 'Change plan'}</h2>
    <div class="mt-3 space-y-3 text-sm">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="stat-label" for="pm-plan">Plan</label><select id="pm-plan" class="input mt-1" bind:value={pmSlug}>{#each planOptions as p}<option value={p.slug}>{p.name}</option>{/each}</select></div>
        <div><label class="stat-label" for="pm-status">Status</label><select id="pm-status" class="input mt-1" bind:value={pmStatus}>{#each ['active', 'trialing', 'manual', 'expired'] as s}<option value={s}>{s}</option>{/each}</select></div>
        <div><label class="stat-label" for="pm-int">Billing interval</label><select id="pm-int" class="input mt-1" bind:value={pmInterval}>{#each ['monthly', 'yearly', 'lifetime', 'manual'] as s}<option value={s}>{s}</option>{/each}</select></div>
        <div><label class="stat-label" for="pm-start">Start date</label><input id="pm-start" type="date" class="input mt-1" bind:value={pmStart} /></div>
        <div class="col-span-2"><label class="stat-label" for="pm-end">End date (optional)</label><input id="pm-end" type="date" class="input mt-1" bind:value={pmEnd} /></div>
      </div>
      <div><label class="stat-label" for="pm-note">Internal note</label><textarea id="pm-note" class="input mt-1 h-14 w-full" placeholder="e.g. Direct sale via WhatsApp" bind:value={pmNote}></textarea></div>
      <p class="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-soft">{planConfirmText}</p>
    </div>
    <div class="mt-4 flex justify-end gap-2">
      <button class="btn-ghost text-sm" onclick={() => (planModal = null)}>Cancel</button>
      <button class="btn-primary text-sm" onclick={submitPlan}>Confirm change</button>
    </div>
  </div>
{/if}

<!-- ── Extend modal ── -->
{#if extendModal}
  <button class="fixed inset-0 z-40 bg-black/50" aria-label="Close" onclick={() => (extendModal = null)} transition:fade={{ duration: 120 }}></button>
  <div class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-edge bg-panel p-5 shadow-2xl" transition:fly={{ y: 12, duration: 160 }}>
    <h2 class="text-lg font-semibold text-strong">Extend access</h2>
    <p class="mt-1 text-xs text-muted">{extendModal.user.full_name || extendModal.user.email}</p>
    <div class="mt-3 flex flex-wrap gap-1.5">
      {#each [['+7 days', 7], ['+30 days', 30], ['+90 days', 90], ['+1 year', 365]] as [label, d]}
        <button class="rounded-lg border px-3 py-1.5 text-xs font-medium transition {exDays === d ? 'border-accent/50 bg-accent/10 text-accent' : 'border-edge text-muted hover:text-soft'}" onclick={() => (exDays = d as number)}>{label}</button>
      {/each}
    </div>
    <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
      <div><label class="stat-label" for="ex-days">Custom days</label><input id="ex-days" type="number" min="1" class="input mt-1" bind:value={exDays} /></div>
      <div><label class="stat-label" for="ex-date">Or until date</label><input id="ex-date" type="date" class="input mt-1" onchange={setExtendByDate} /></div>
    </div>
    <div class="mt-3"><label class="stat-label" for="ex-note">Reason</label><textarea id="ex-note" class="input mt-1 h-14 w-full" placeholder="e.g. Manual M-Pesa payment received." bind:value={exNote}></textarea></div>
    <div class="mt-4 flex justify-end gap-2">
      <button class="btn-ghost text-sm" onclick={() => (extendModal = null)}>Cancel</button>
      <button class="btn-primary text-sm" onclick={submitExtend}>Extend by {exDays} days</button>
    </div>
  </div>
{/if}
