<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import ReportStatusBadge from '$lib/components/ReportStatusBadge.svelte';

  interface AdminReport {
    id: string;
    slug: string;
    title: string;
    report_type: string;
    audience: string;
    language: string;
    status: string;
    report_date: string;
    published_at: string | null;
    quality: { passed: boolean; warnings: string[] } | null;
  }

  let items = $state<AdminReport[]>([]);
  let loading = $state(true);
  let error = $state('');
  let message = $state('');
  let busy = $state('');

  // Generate form
  let gType = $state<'daily' | 'weekly' | 'monthly' | 'special'>('daily');
  let gAudience = $state<'public' | 'free' | 'mid' | 'premium'>('premium');
  let gLanguage = $state<'en' | 'sw'>('en');
  let gTone = $state<'professional' | 'simple' | 'channel' | 'whatsapp'>('professional');
  let gDate = $state(new Date().toISOString().slice(0, 10));

  const SECTIONS = [
    ['market_status', 'Market status'],
    ['executive_summary', 'Executive summary'],
    ['what_changed', 'What changed'],
    ['market_posture', 'Market posture'],
    ['btc_risk', 'BTC risk'],
    ['btc_cycle', 'BTC cycle'],
    ['onchain', 'On-chain'],
    ['social', 'Social metrics'],
    ['altcoin_btc', 'Altcoin vs BTC'],
    ['ecosystem', 'Ecosystem rotation'],
    ['strongest_signals', 'Strongest signals'],
    ['weakest_areas', 'Weakest areas'],
    ['confirmation_needed', 'Confirmation needed'],
    ['risk_warnings', 'Risk warnings'],
    ['premium_takeaway', 'Premium takeaway'],
    ['data_coverage', 'Data coverage'],
    ['disclaimer', 'Disclaimer']
  ] as const;
  let enabled = $state<Record<string, boolean>>(Object.fromEntries(SECTIONS.map(([k]) => [k, true])));

  // Recommended structure per report type — daily is short/tactical, monthly full.
  const TYPE_DEFAULTS: Record<string, string[]> = {
    daily: ['market_status', 'what_changed', 'btc_risk', 'altcoin_btc', 'ecosystem', 'risk_warnings', 'premium_takeaway', 'disclaimer'],
    weekly: ['market_status', 'what_changed', 'btc_risk', 'onchain', 'social', 'altcoin_btc', 'ecosystem', 'strongest_signals', 'weakest_areas', 'confirmation_needed', 'risk_warnings', 'premium_takeaway', 'data_coverage', 'disclaimer'],
    monthly: ['market_status', 'executive_summary', 'what_changed', 'market_posture', 'btc_risk', 'btc_cycle', 'onchain', 'social', 'altcoin_btc', 'ecosystem', 'strongest_signals', 'weakest_areas', 'confirmation_needed', 'risk_warnings', 'premium_takeaway', 'data_coverage', 'disclaimer'],
    special: ['market_status', 'executive_summary', 'what_changed', 'btc_risk', 'risk_warnings', 'premium_takeaway', 'disclaimer']
  };
  // Reset the section checklist to the recommended set whenever the type changes.
  $effect(() => {
    const def = TYPE_DEFAULTS[gType] ?? [];
    enabled = Object.fromEntries(SECTIONS.map(([k]) => [k, def.includes(k)]));
  });

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    try {
      items = (await api<{ items: AdminReport[] }>('/admin/reports', { auth: true })).items;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load reports.';
    } finally {
      loading = false;
    }
  };
  onMount(load);

  const generate = async () => {
    busy = 'generate';
    message = '';
    error = '';
    try {
      const sections = SECTIONS.map(([k]) => k).filter((k) => enabled[k]);
      const report = await api<{ id: string }>('/admin/reports/generate', {
        method: 'POST',
        auth: true,
        body: { type: gType, audience: gAudience, language: gLanguage, tone: gTone, report_date: gDate, sections }
      });
      goto(`/admin/reports/${report.id}/edit`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Generation failed.';
    } finally {
      busy = '';
    }
  };

  const act = async (id: string, action: 'publish' | 'archive') => {
    busy = id + action;
    message = '';
    error = '';
    try {
      await api(`/admin/reports/${id}/${action}`, { method: 'POST', auth: true });
      message = `Report ${action}ed.`;
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : `${action} failed.`;
    } finally {
      busy = '';
    }
  };
</script>

<header class="mb-5">
  <h1 class="text-xl font-semibold text-strong">Admin · Reports</h1>
  <p class="text-sm text-muted">Generate market intelligence from the platform's modules, review, then publish to members.</p>
</header>

<div class="mb-4 flex flex-wrap gap-2 text-sm">
  <a href="/admin" class="btn-ghost">Data sync</a>
  <a href="/admin/plans" class="btn-ghost">Plans</a>
  <a href="/admin/users" class="btn-ghost">Users</a>
  <a href="/admin/subscriptions" class="btn-ghost">Subscriptions</a>
</div>

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

<!-- Generate -->
<div class="card mb-6">
  <h2 class="mb-3 text-sm font-semibold text-strong">Generate a report</h2>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    <label class="text-xs text-muted">Type
      <select class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-soft" bind:value={gType}>
        <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="special">Special</option>
      </select>
    </label>
    <label class="text-xs text-muted">Audience
      <select class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-soft" bind:value={gAudience}>
        <option value="public">Public</option><option value="free">Free</option><option value="mid">Mid</option><option value="premium">Premium</option>
      </select>
    </label>
    <label class="text-xs text-muted">Language
      <select class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-soft" bind:value={gLanguage}>
        <option value="en">English</option><option value="sw">Swahili</option>
      </select>
    </label>
    <label class="text-xs text-muted">Tone
      <select class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-soft" bind:value={gTone}>
        <option value="professional">Professional</option><option value="simple">Simple</option><option value="channel">Channel</option><option value="whatsapp">Short WhatsApp</option>
      </select>
    </label>
    <label class="text-xs text-muted">Date
      <input type="date" class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-soft" bind:value={gDate} />
    </label>
  </div>
  <div class="mt-3">
    <p class="mb-1.5 text-xs text-muted">Include sections</p>
    <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-soft">
      {#each SECTIONS as [key, label]}
        <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={enabled[key]} /> {label}</label>
      {/each}
    </div>
  </div>
  <button class="btn-primary mt-4" disabled={busy === 'generate'} onclick={generate}>{busy === 'generate' ? 'Generating…' : 'Generate draft'}</button>
</div>

<!-- List -->
{#if loading}
  <p class="text-sm text-muted">Loading…</p>
{:else if !items.length}
  <div class="card text-center text-sm text-muted">No reports yet. Generate your first one above.</div>
{:else}
  <div class="card overflow-x-auto p-0">
    <table class="w-full min-w-[720px] text-sm">
      <thead>
        <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
          <th class="px-4 py-3 font-medium">Report</th>
          <th class="px-4 py-3 font-medium">Status</th>
          <th class="px-4 py-3 font-medium">Quality</th>
          <th class="px-4 py-3 font-medium">Date</th>
          <th class="px-4 py-3 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each items as r (r.id)}
          <tr class="border-b border-edge/60 last:border-0">
            <td class="px-4 py-3">
              <div class="font-medium text-strong">{r.title}</div>
              <div class="mt-1 flex flex-wrap gap-1"><ReportStatusBadge type={r.report_type} audience={r.audience} />{#if r.language === 'sw'}<span class="pill bg-panel-2 text-soft">SW</span>{/if}</div>
            </td>
            <td class="px-4 py-3"><ReportStatusBadge status={r.status} /></td>
            <td class="px-4 py-3">
              {#if r.quality}
                <span class="pill {r.quality.passed ? 'bg-mint/15 text-mint' : 'bg-warn/15 text-warn'}">{r.quality.passed ? 'OK' : `${r.quality.warnings.length} warn`}</span>
              {:else}—{/if}
            </td>
            <td class="px-4 py-3 text-muted">{r.report_date}</td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-1.5">
                <a href="/admin/reports/{r.id}/edit" class="btn-ghost text-xs">Edit</a>
                {#if r.status !== 'published'}<button class="btn-ghost text-xs" disabled={busy === r.id + 'publish'} onclick={() => act(r.id, 'publish')}>Publish</button>{/if}
                {#if r.status !== 'archived'}<button class="btn-ghost text-xs" disabled={busy === r.id + 'archive'} onclick={() => act(r.id, 'archive')}>Archive</button>{/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
