<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Banknote, TrendingUp, TrendingDown, Minus, ReceiptText, CalendarDays } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import AdminTabs from '$lib/components/AdminTabs.svelte';

  interface Tx {
    id: string;
    provider: string | null;
    reference: string | null;
    plan_slug: string | null;
    billing_interval: string | null;
    amount: number;
    currency: string | null;
    created_at: string;
    user: { email: string; full_name: string | null } | { email: string; full_name: string | null }[] | null;
  }
  interface Revenue {
    currency: string;
    summary: { total: number; count: number; avg: number; today: number; last_7d: number; last_30d: number; this_month: number; last_month: number; growth_pct: number | null };
    monthly: { month: string; total: number; count: number }[];
    by_plan: { key: string; total: number; count: number }[];
    by_interval: { key: string; total: number; count: number }[];
    transactions: Tx[];
  }

  let r = $state<Revenue | null>(null);
  let loading = $state(true);
  let error = $state('');

  // Admin-only guard.
  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  onMount(async () => {
    try {
      r = await api<Revenue>('/admin/revenue', { auth: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load revenue.';
    } finally {
      loading = false;
    }
  });

  const money = (n: number) => `${(n ?? 0).toLocaleString('en-US')} ${r?.currency ?? 'TZS'}`;
  const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n));
  const userOf = (t: Tx) => (Array.isArray(t.user) ? t.user[0] : t.user);
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const maxMonthly = $derived(Math.max(1, ...(r?.monthly ?? []).map((m) => m.total)));
  const planTotal = $derived(Math.max(1, (r?.by_plan ?? []).reduce((s, p) => s + p.total, 0)));
</script>

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Admin · Revenue</h1>
  <p class="text-sm text-muted">All confirmed Snippe payments — totals, trends, and every transaction.</p>
</header>

<AdminTabs />

{#if loading}
  <div class="card text-center text-muted">Loading revenue…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if r}
  <!-- Summary cards -->
  <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
    <div class="card p-4">
      <p class="stat-label flex items-center gap-1.5"><Banknote class="h-3.5 w-3.5" />Total revenue</p>
      <p class="mt-1 text-2xl font-bold text-mint">{money(r.summary.total)}</p>
      <p class="mt-0.5 text-xs text-muted">{r.summary.count} payment{r.summary.count === 1 ? '' : 's'} · avg {money(r.summary.avg)}</p>
    </div>
    <div class="card p-4">
      <p class="stat-label flex items-center gap-1.5"><CalendarDays class="h-3.5 w-3.5" />This month</p>
      <p class="mt-1 text-2xl font-bold text-strong">{money(r.summary.this_month)}</p>
      <p class="mt-0.5 flex items-center gap-1 text-xs">
        {#if r.summary.growth_pct === null}
          <Minus class="h-3 w-3 text-muted" /><span class="text-muted">no prior month to compare</span>
        {:else if r.summary.growth_pct >= 0}
          <TrendingUp class="h-3 w-3 text-mint" /><span class="text-mint">+{r.summary.growth_pct}% vs last month ({money(r.summary.last_month)})</span>
        {:else}
          <TrendingDown class="h-3 w-3 text-danger" /><span class="text-danger">{r.summary.growth_pct}% vs last month ({money(r.summary.last_month)})</span>
        {/if}
      </p>
    </div>
    <div class="card p-4">
      <p class="stat-label">Last 7 days</p>
      <p class="mt-1 text-2xl font-bold text-strong">{money(r.summary.last_7d)}</p>
      <p class="mt-0.5 text-xs text-muted">today: {money(r.summary.today)}</p>
    </div>
    <div class="card p-4">
      <p class="stat-label">Last 30 days</p>
      <p class="mt-1 text-2xl font-bold text-strong">{money(r.summary.last_30d)}</p>
      <p class="mt-0.5 text-xs text-muted">rolling window</p>
    </div>
  </div>

  <!-- Monthly chart + breakdowns -->
  <div class="mb-4 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
    <div class="card">
      <p class="stat-label mb-3">Monthly revenue — last 12 months</p>
      <div class="flex h-40 items-end gap-1.5">
        {#each r.monthly as m}
          <div class="group flex min-w-0 flex-1 flex-col items-center gap-1" title="{m.month}: {money(m.total)} ({m.count} payments)">
            <span class="text-[9px] text-muted opacity-0 transition group-hover:opacity-100">{compact(m.total)}</span>
            <div class="w-full rounded-t bg-mint/70 transition group-hover:bg-mint" style="height: {Math.max(2, Math.round((m.total / maxMonthly) * 120))}px"></div>
            <span class="text-[9px] text-muted">{monthLabel(m.month)}</span>
          </div>
        {/each}
      </div>
    </div>
    <div class="space-y-3">
      <div class="card">
        <p class="stat-label mb-2">By plan</p>
        {#each r.by_plan as p}
          <div class="mb-2 last:mb-0">
            <div class="mb-0.5 flex items-center justify-between text-xs">
              <span class="font-medium capitalize text-soft">{p.key}</span>
              <span class="text-muted">{money(p.total)} · {p.count}</span>
            </div>
            <div class="meter"><div class="meter-fill bg-accent" style="width: {Math.round((p.total / planTotal) * 100)}%"></div></div>
          </div>
        {:else}
          <p class="text-sm text-muted">No completed payments yet.</p>
        {/each}
      </div>
      <div class="card">
        <p class="stat-label mb-2">By billing interval</p>
        <div class="flex flex-wrap gap-2">
          {#each r.by_interval as i}
            <span class="pill bg-panel-2 text-soft">{i.key}: <span class="font-semibold text-strong">{money(i.total)}</span> <span class="text-muted">({i.count})</span></span>
          {:else}
            <p class="text-sm text-muted">—</p>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- Transactions -->
  <div class="card overflow-x-auto p-0">
    <div class="flex items-center gap-2 border-b border-edge px-4 py-3">
      <ReceiptText class="h-4 w-4 text-accent" />
      <h2 class="text-sm font-semibold text-strong">Transactions</h2>
      <span class="text-xs text-muted">latest {r.transactions.length} confirmed</span>
    </div>
    <table class="w-full min-w-[760px] text-sm">
      <thead>
        <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
          <th class="px-4 py-3 font-medium">User</th>
          <th class="px-4 py-3 font-medium">Plan</th>
          <th class="px-4 py-3 font-medium">Interval</th>
          <th class="px-4 py-3 font-medium">Amount</th>
          <th class="px-4 py-3 font-medium">Reference</th>
          <th class="px-4 py-3 font-medium">Date</th>
        </tr>
      </thead>
      <tbody>
        {#each r.transactions as t (t.id)}
          {@const u = userOf(t)}
          <tr class="border-b border-edge/60 last:border-0 hover:bg-panel-2/40">
            <td class="px-4 py-3">
              <div class="font-medium text-strong">{u?.full_name ?? '—'}</div>
              <div class="text-xs text-muted">{u?.email ?? ''}</div>
            </td>
            <td class="px-4 py-3 capitalize text-soft">{t.plan_slug ?? '—'}</td>
            <td class="px-4 py-3 text-soft">{t.billing_interval ?? '—'}</td>
            <td class="px-4 py-3 font-semibold text-mint">{money(t.amount)}</td>
            <td class="px-4 py-3 font-mono text-xs text-muted">{t.reference ?? '—'}</td>
            <td class="px-4 py-3 text-muted">{new Date(t.created_at).toLocaleString()}</td>
          </tr>
        {:else}
          <tr><td colspan="6" class="px-4 py-6 text-center text-muted">No confirmed payments yet. Completed Snippe payments will appear here.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
