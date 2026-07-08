<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Banknote, Wallet, ReceiptText, Users, TrendingUp, TrendingDown, Minus, CalendarDays, Info, Coins, ArrowDownRight } from '@lucide/svelte';
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
    summary: { total: number; count: number; avg: number; today: number; last_7d: number; last_30d: number; this_month: number; last_month: number; growth_pct: number | null; paying_users?: number };
    monthly: { month: string; total: number; count: number }[];
    by_plan: { key: string; total: number; count: number }[];
    by_interval: { key: string; total: number; count: number }[];
    transactions: Tx[];
  }

  // ── Snippe fee model (Mobile Money) ──
  const COLLECTION_RATE = 0.025; // 2.5% per transaction
  const PAYOUT_FEE = 1500; // TZS per disbursement

  let r = $state<Revenue | null>(null);
  let loading = $state(true);
  let error = $state('');
  let payoutFreq = $state<'once' | 'weekly' | 'monthly'>('once');

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

  const money = (n: number) => `${Math.round(n ?? 0).toLocaleString('en-US')} ${r?.currency ?? 'TZS'}`;
  const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(Math.round(n)));
  const userOf = (t: Tx) => (Array.isArray(t.user) ? t.user[0] : t.user);
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const methodOf = (p: string | null) => (p ? p.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

  // ISO week key (used to estimate weekly payout frequency).
  const isoWeek = (iso: string) => {
    const d = new Date(iso);
    const day = (d.getUTCDay() + 6) % 7;
    const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
    const week1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
    const wk = 1 + Math.round(((thu.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
    return `${thu.getUTCFullYear()}-W${wk}`;
  };

  // ── Fee & net calculations (all derived from gross) ──
  const gross = $derived(r?.summary.total ?? 0);
  const count = $derived(r?.summary.count ?? 0);
  const revenueMonths = $derived((r?.monthly ?? []).filter((m) => m.total > 0));
  const distinctMonths = $derived(revenueMonths.length);
  const distinctWeeks = $derived(new Set((r?.transactions ?? []).map((t) => isoWeek(t.created_at))).size);
  const latestRevMonth = $derived([...(r?.monthly ?? [])].reverse().find((m) => m.total > 0)?.month ?? null);

  const payoutCount = $derived(
    gross <= 0
      ? 0
      : payoutFreq === 'once'
        ? 1
        : payoutFreq === 'monthly'
          ? Math.max(1, distinctMonths)
          : Math.max(1, distinctWeeks || distinctMonths)
  );

  const collectionFees = $derived(Math.round(gross * COLLECTION_RATE));
  const payoutFees = $derived(PAYOUT_FEE * payoutCount);
  const totalFees = $derived(collectionFees + payoutFees);
  const netRevenue = $derived(gross - totalFees);
  const feePctOfGross = $derived(gross > 0 ? (totalFees / gross) * 100 : 0);
  const payingUsers = $derived(r?.summary.paying_users ?? new Set((r?.transactions ?? []).map((t) => userOf(t)?.email).filter(Boolean)).size);
  const avgGross = $derived(count ? Math.round(gross / count) : 0);
  const avgNet = $derived(count ? Math.round(netRevenue / count) : 0);

  // Per-transaction collection fee (payout fee is per-disbursement, never per-payment).
  const txFee = (t: Tx) => Math.round((Number(t.amount) || 0) * COLLECTION_RATE);

  // Weeks-with-revenue per month (for the weekly-frequency chart estimate).
  const weeksInMonth = $derived.by(() => {
    const m = new Map<string, Set<string>>();
    for (const t of r?.transactions ?? []) {
      const mo = t.created_at.slice(0, 7);
      if (!m.has(mo)) m.set(mo, new Set());
      m.get(mo)!.add(isoWeek(t.created_at));
    }
    return new Map([...m].map(([k, v]) => [k, v.size]));
  });

  // Monthly gross vs net, using the selected payout frequency.
  const monthRows = $derived(
    (r?.monthly ?? []).map((m) => {
      const collectionM = Math.round(m.total * COLLECTION_RATE);
      let payoutM = 0;
      if (m.total > 0) {
        payoutM =
          payoutFreq === 'monthly'
            ? PAYOUT_FEE
            : payoutFreq === 'weekly'
              ? PAYOUT_FEE * (weeksInMonth.get(m.month) ?? 1)
              : m.month === latestRevMonth
                ? PAYOUT_FEE
                : 0;
      }
      return { ...m, collectionM, payoutM, netM: Math.max(0, m.total - collectionM - payoutM) };
    })
  );
  const maxMonthly = $derived(Math.max(1, ...monthRows.map((m) => m.total)));
  const PLOT = 220; // px — plot height (pixel bars render reliably; % heights collapse in flex)

  const planTotal = $derived(Math.max(1, (r?.by_plan ?? []).reduce((s, p) => s + p.total, 0)));

  const FREQS: { k: 'once' | 'weekly' | 'monthly'; label: string }[] = [
    { k: 'once', label: 'One payout' },
    { k: 'weekly', label: 'Weekly' },
    { k: 'monthly', label: 'Monthly' }
  ];
</script>

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Admin · Revenue</h1>
  <p class="text-sm text-muted">Confirmed Snippe payments — gross collected, fees lost, and your real estimated net.</p>
</header>

<AdminTabs />

{#if loading}
  <div class="card text-center text-muted">Loading revenue…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if r}
  <!-- ── Headline cards ── -->
  <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
    <div class="card p-4">
      <p class="stat-label flex items-center gap-1.5"><Banknote class="h-3.5 w-3.5" />Gross Revenue</p>
      <p class="mt-1 text-2xl font-bold text-mint">{money(gross)}</p>
      <p class="mt-0.5 text-xs text-muted">{count} payment{count === 1 ? '' : 's'} · collected before fees</p>
    </div>
    <div class="card border-mint/25 bg-mint/[0.04] p-4">
      <p class="stat-label flex items-center gap-1.5"><Wallet class="h-3.5 w-3.5 text-mint" />Estimated Net Revenue</p>
      <p class="mt-1 text-2xl font-bold text-mint">{money(netRevenue)}</p>
      <p class="mt-0.5 text-xs text-muted">after {money(collectionFees)} collection + {money(payoutFees)} payout</p>
    </div>
    <div class="card p-4">
      <p class="stat-label flex items-center gap-1.5"><ReceiptText class="h-3.5 w-3.5 text-warn" />Total Fees</p>
      <p class="mt-1 text-2xl font-bold text-warn">−{money(totalFees)}</p>
      <p class="mt-0.5 text-xs text-muted">{feePctOfGross.toFixed(1)}% of gross · {money(collectionFees)} + {money(payoutFees)}</p>
    </div>
    <div class="card p-4">
      <p class="stat-label flex items-center gap-1.5"><CalendarDays class="h-3.5 w-3.5" />This month</p>
      <p class="mt-1 text-2xl font-bold text-strong">{money(r.summary.this_month)}</p>
      <p class="mt-0.5 flex items-center gap-1 text-xs">
        {#if r.summary.growth_pct === null}
          <Minus class="h-3 w-3 text-muted" /><span class="text-muted">no prior month to compare</span>
        {:else if r.summary.growth_pct >= 0}
          <TrendingUp class="h-3 w-3 text-mint" /><span class="text-mint">+{r.summary.growth_pct}% vs last month</span>
        {:else}
          <TrendingDown class="h-3 w-3 text-danger" /><span class="text-danger">{r.summary.growth_pct}% vs last month</span>
        {/if}
      </p>
    </div>
  </div>

  <!-- ── Fees breakdown (with payout scenario) + Gross vs Net chart ── -->
  <div class="mb-4 grid gap-3 lg:grid-cols-[1fr_1.5fr] lg:items-start">
    <!-- Fees breakdown -->
    <div class="card">
      <div class="mb-3 flex items-center justify-between gap-2">
        <p class="stat-label">Fees Breakdown</p>
        <span class="pill bg-panel-2 text-[10px] text-muted" title="Snippe: 2.5% Mobile Money collection + 1,500 TZS per payout · instant settlement">Snippe · Mobile Money</span>
      </div>

      <!-- Payout frequency scenario -->
      <div class="mb-3 rounded-lg border border-edge bg-panel-2/40 p-2.5">
        <div class="mb-1.5 flex items-center gap-1 text-[11px] text-muted">
          <Info class="h-3 w-3" />Estimate net by payout frequency
        </div>
        <div class="inline-flex rounded-lg border border-edge p-0.5 text-xs">
          {#each FREQS as f}
            <button type="button" class="rounded-md px-2.5 py-1 font-medium transition {payoutFreq === f.k ? 'bg-accent/15 text-accent' : 'text-muted hover:text-soft'}" onclick={() => (payoutFreq = f.k)}>{f.label}</button>
          {/each}
        </div>
        <p class="mt-1.5 text-[11px] text-muted">Current payout count: <span class="font-semibold text-soft">{payoutCount} disbursement{payoutCount === 1 ? '' : 's'}</span> × {money(PAYOUT_FEE)}</p>
      </div>

      <div class="space-y-2 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-soft">Gross Revenue</span>
          <span class="font-semibold text-strong">{money(gross)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1 text-soft" title="Collection fee is charged per transaction (2.5%).">Collection Fee <span class="text-[10px] text-muted">2.5% × {count} tx</span><Info class="h-3 w-3 text-muted" /></span>
          <span class="font-semibold text-warn">−{money(collectionFees)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1 text-soft" title="Payout fee is charged per disbursement (1,500 TZS), so net revenue may change based on withdrawal frequency.">Payout Fee <span class="text-[10px] text-muted">{money(PAYOUT_FEE)} × {payoutCount}</span><Info class="h-3 w-3 text-muted" /></span>
          <span class="font-semibold text-warn">−{money(payoutFees)}</span>
        </div>
        <div class="my-1 border-t border-edge"></div>
        <div class="flex items-center justify-between">
          <span class="font-medium text-strong">Estimated Net Revenue</span>
          <span class="text-lg font-bold text-mint">{money(netRevenue)}</span>
        </div>
      </div>

      <p class="mt-3 text-[11px] leading-relaxed text-muted">Collection fee is charged <span class="text-soft">per transaction</span>. Payout fee is charged <span class="text-soft">per disbursement</span> — batching withdrawals (fewer, larger payouts) keeps more net revenue.</p>
    </div>

    <!-- Revenue after fees chart (stacked: net + fees = gross) — pixel-height bars -->
    <div class="card">
      <div class="mb-3 flex items-center justify-between gap-2">
        <p class="stat-label">Revenue after fees — last 12 months</p>
        <div class="flex items-center gap-3 text-[11px]">
          <span class="flex items-center gap-1 text-muted"><span class="inline-block h-2.5 w-2.5 rounded-sm bg-mint/70"></span>Net</span>
          <span class="flex items-center gap-1 text-muted"><span class="inline-block h-2.5 w-2.5 rounded-sm bg-warn/80"></span>Fees</span>
        </div>
      </div>
      <div class="relative" style="height: {PLOT + 24}px">
        <!-- gridlines + y scale -->
        <div class="pointer-events-none absolute inset-x-0 top-0" style="height: {PLOT + 24}px">
          <div class="absolute inset-x-0 border-t border-edge/30" style="top: 24px"></div>
          <div class="absolute inset-x-0 border-t border-edge/30" style="top: {24 + PLOT / 2}px"></div>
          <div class="absolute inset-x-0 border-t border-edge" style="top: {24 + PLOT}px"></div>
          <span class="absolute right-0 bg-panel px-1 text-[9px] text-muted" style="top: 24px; transform: translateY(-50%)">{compact(maxMonthly)}</span>
          <span class="absolute right-0 bg-panel px-1 text-[9px] text-muted" style="top: {24 + PLOT}px; transform: translateY(-50%)">0</span>
        </div>
        <!-- bars -->
        <div class="absolute inset-x-0 bottom-0 flex items-end gap-1.5" style="height: {PLOT + 24}px">
          {#each monthRows as m}
            {@const feeRaw = m.collectionM + m.payoutM}
            {@const gH = m.total <= 0 ? 0 : Math.max(6, Math.round((m.total / maxMonthly) * PLOT))}
            {@const fH = m.total <= 0 ? 0 : Math.min(gH - 2, Math.max(feeRaw > 0 ? 4 : 0, Math.round((feeRaw / maxMonthly) * PLOT)))}
            <div class="group flex min-w-0 flex-1 flex-col items-center justify-end" title="{monthLabel(m.month)} · gross {money(m.total)} · net {money(m.netM)} · fees −{money(feeRaw)} (collection {money(m.collectionM)} + payout {money(m.payoutM)}) · {m.count} pmt{m.count === 1 ? '' : 's'}">
              {#if m.total > 0}<span class="mb-1 text-[9px] font-semibold text-soft">{compact(m.total)}</span>{/if}
              <div class="flex w-[52%] max-w-[26px] flex-col overflow-hidden rounded-t" style="height: {gH}px">
                <div class="w-full shrink-0 bg-warn/80" style="height: {fH}px"></div>
                <div class="w-full flex-1 bg-mint/70 transition group-hover:bg-mint"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
      <!-- month labels aligned under bars -->
      <div class="mt-1.5 flex gap-1.5">
        {#each monthRows as m}
          <span class="min-w-0 flex-1 text-center text-[9px] text-muted">{monthLabel(m.month)}</span>
        {/each}
      </div>
      <p class="mt-2 text-[11px] text-muted">Each bar is <span class="text-soft">gross</span>, split into <span class="text-mint">net</span> and <span class="text-warn">fees</span> — for the selected payout frequency (<span class="capitalize text-soft">{payoutFreq === 'once' ? 'one payout' : payoutFreq}</span>). Hover for the full split.</p>
    </div>
  </div>

  <!-- ── Summary metrics ── -->
  <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    {#each [
      { label: 'Gross Revenue', value: money(gross), icon: Banknote, tone: 'text-mint' },
      { label: 'Estimated Net', value: money(netRevenue), icon: Wallet, tone: 'text-mint' },
      { label: 'Total Fees', value: `−${money(totalFees)}`, icon: ReceiptText, tone: 'text-warn' },
      { label: 'Paying Users', value: String(payingUsers), icon: Users, tone: 'text-strong' },
      { label: 'Avg Gross Payment', value: money(avgGross), icon: Coins, tone: 'text-strong' },
      { label: 'Avg Net Payment', value: money(avgNet), icon: ArrowDownRight, tone: 'text-strong' }
    ] as s}
      {@const Icon = s.icon}
      <div class="card p-3">
        <p class="stat-label flex items-center gap-1.5"><Icon class="h-3.5 w-3.5" />{s.label}</p>
        <p class="mt-1 text-lg font-bold {s.tone}">{s.value}</p>
      </div>
    {/each}
  </div>

  <!-- ── Plan + interval breakdowns ── -->
  <div class="mb-4 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
    <div class="card">
      <p class="stat-label mb-2">Revenue by plan <span class="text-[10px] normal-case text-muted">— which plan earns most</span></p>
      {#each r.by_plan as p}
        <div class="mb-2.5 last:mb-0">
          <div class="mb-0.5 flex items-center justify-between text-xs">
            <span class="font-medium capitalize text-soft">{p.key}</span>
            <span class="text-muted">{money(p.total)} <span class="text-[10px]">· {p.count} pmt{p.count === 1 ? '' : 's'} · net after 2.5% {money(p.total * (1 - COLLECTION_RATE))}</span></span>
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

  <!-- ── Transactions (mobile-first: cards on phones, table on lg+) ── -->
  <div class="card p-0">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-edge px-4 py-3">
      <ReceiptText class="h-4 w-4 text-accent" />
      <h2 class="text-sm font-semibold text-strong">Transactions</h2>
      <span class="text-xs text-muted">latest {r.transactions.length} confirmed · fees shown per transaction (collection only)</span>
    </div>

    {#if r.transactions.length === 0}
      <p class="px-4 py-6 text-center text-muted">No confirmed payments yet. Completed Snippe payments will appear here.</p>
    {:else}
      <!-- Mobile: one card per transaction -->
      <ul class="divide-y divide-edge/60 lg:hidden">
        {#each r.transactions as t (t.id)}
          {@const u = userOf(t)}
          {@const fee = txFee(t)}
          <li class="px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-medium text-strong">{u?.full_name ?? '—'}</p>
                <p class="truncate text-xs text-muted">{u?.email ?? ''}</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="font-semibold text-mint">{money(t.amount)}</p>
                <p class="text-[10px] uppercase tracking-wide text-muted">gross</p>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <span class="pill bg-panel-2 capitalize text-soft">{t.plan_slug ?? '—'}</span>
              <span class="pill bg-panel-2 text-soft">{methodOf(t.provider)}</span>
              {#if t.billing_interval}<span class="pill bg-panel-2 text-muted">{t.billing_interval}</span>{/if}
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-panel-2/40 px-2.5 py-2 text-xs">
              <div>
                <span class="text-muted">Collection fee</span>
                <div class="font-medium text-warn">−{money(fee)}</div>
              </div>
              <div class="text-right">
                <span class="text-muted">Net after fee</span>
                <div class="font-semibold text-strong">{money((Number(t.amount) || 0) - fee)}</div>
              </div>
            </div>
            <div class="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
              <span class="min-w-0 truncate font-mono">{t.reference ?? '—'}</span>
              <span class="shrink-0">{fmtDate(t.created_at)}</span>
            </div>
          </li>
        {/each}
      </ul>

      <!-- Desktop: full table -->
      <div class="hidden overflow-x-auto lg:block">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
              <th class="px-4 py-3 font-medium">User</th>
              <th class="px-4 py-3 font-medium">Plan</th>
              <th class="px-4 py-3 font-medium">Method</th>
              <th class="px-4 py-3 text-right font-medium">Gross</th>
              <th class="px-4 py-3 text-right font-medium">Collection Fee</th>
              <th class="px-4 py-3 text-right font-medium">Net After Fee</th>
              <th class="px-4 py-3 font-medium">Reference</th>
              <th class="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {#each r.transactions as t (t.id)}
              {@const u = userOf(t)}
              {@const fee = txFee(t)}
              <tr class="border-b border-edge/60 last:border-0 hover:bg-panel-2/40">
                <td class="px-4 py-3">
                  <div class="font-medium text-strong">{u?.full_name ?? '—'}</div>
                  <div class="text-xs text-muted">{u?.email ?? ''}</div>
                </td>
                <td class="px-4 py-3 capitalize text-soft">{t.plan_slug ?? '—'}</td>
                <td class="px-4 py-3 text-soft">{methodOf(t.provider)}</td>
                <td class="px-4 py-3 text-right font-semibold text-mint">{money(t.amount)}</td>
                <td class="px-4 py-3 text-right text-warn">−{money(fee)}</td>
                <td class="px-4 py-3 text-right font-semibold text-strong">{money((Number(t.amount) || 0) - fee)}</td>
                <td class="px-4 py-3 font-mono text-xs text-muted">{t.reference ?? '—'}</td>
                <td class="px-4 py-3 text-muted">{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <p class="mt-3 text-[11px] leading-relaxed text-muted">
    Net figures are estimates based on Snippe's fee schedule (2.5% collection per transaction, {money(PAYOUT_FEE)} per payout). Payout fees depend on how often you withdraw — the table shows collection fees only, since payout fees are charged per disbursement, not per payment.
  </p>
{/if}
