<script lang="ts">
  import { Lock, Copy, Check, Download } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import { api } from '$lib/api';
  import { openReportPdf } from '$lib/reports/print';
  import ReportStatusBadge from './ReportStatusBadge.svelte';

  interface Section {
    id: string;
    section_key: string;
    section_title: string;
    content: string | null;
    data: { coins?: { label: string; sub: string; image: string | null }[]; note?: string } | null;
    is_premium: boolean;
    locked?: boolean;
    sort_order: number;
  }
  interface Report {
    id: string;
    slug: string;
    title: string;
    report_type: string;
    audience: string;
    language: string;
    tone: string;
    status: string;
    report_date: string;
    published_at: string | null;
    market_status: { regime: string; btc_risk: string; altcoin: string; social: string } | null;
    scorecard: { label: string; value: string; note: string }[] | null;
    preview: string | null;
    cover_image_url: string | null;
  }
  interface Bundle {
    view: 'full' | 'preview';
    report: Report;
    sections: Section[];
    can_export: boolean;
  }
  let { bundle }: { bundle: Bundle } = $props();

  const ms = $derived(bundle.report.market_status);
  const bodySections = $derived(bundle.sections.filter((s) => s.section_key !== 'market_status').sort((a, b) => a.sort_order - b.sort_order));

  const exportPdf = () =>
    openReportPdf(
      bundle.report,
      bundle.sections.map((s) => ({ section_key: s.section_key, section_title: s.section_title, content: s.content, is_premium: s.is_premium, data: s.data }))
    );

  // Share / export
  let shareText = $state('');
  let shareLabel = $state('');
  let copied = $state(false);
  let loadingShare = $state('');

  const share = async (kind: 'whatsapp' | 'telegram' | 'public-preview', label: string) => {
    loadingShare = kind;
    copied = false;
    try {
      const r = await api<{ content: string }>(`/reports/${bundle.report.id}/share/${kind}`, { auth: true });
      shareText = r.content;
      shareLabel = label;
    } catch (e) {
      shareText = e instanceof Error ? e.message : 'Unable to build export.';
      shareLabel = label;
    } finally {
      loadingShare = '';
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
</script>

<article class="space-y-4">
  <!-- Branded header -->
  <header class="hero-card">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <BrandMark class="h-5 w-5 text-mint" />
        <div>
          <div class="text-sm font-semibold text-strong">Pasta<span class="text-mint">trade101</span></div>
          <div class="text-[10px] uppercase tracking-[0.14em] text-muted">Market Intelligence</div>
        </div>
      </div>
      {#if bundle.view === 'full'}
        <button class="btn-ghost text-xs" onclick={exportPdf}><Download class="h-3.5 w-3.5" /> Export PDF</button>
      {/if}
    </div>

    {#if bundle.report.cover_image_url}
      <img src={bundle.report.cover_image_url} alt="" class="mt-3 max-h-64 w-full rounded-xl object-cover" />
    {/if}

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <ReportStatusBadge type={bundle.report.report_type} audience={bundle.report.audience} status={bundle.report.status} />
      {#if bundle.report.language === 'sw'}<span class="pill bg-panel-2 text-soft">Kiswahili</span>{/if}
      {#if bundle.view === 'preview'}<span class="pill bg-edge text-muted"><Lock class="h-3 w-3" /> Preview</span>{/if}
    </div>
    <h1 class="mt-2 text-xl font-bold text-strong">{bundle.report.title}</h1>
    <p class="text-xs text-muted">{bundle.report.published_at ? new Date(bundle.report.published_at).toLocaleString() : bundle.report.report_date}</p>
  </header>

  <!-- Market status -->
  {#if ms}
    <div class="hero-card grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div><p class="stat-label">Regime</p><p class="mt-0.5 text-sm font-semibold text-strong">{ms.regime}</p></div>
      <div><p class="stat-label">BTC risk</p><p class="mt-0.5 text-sm font-semibold text-strong">{ms.btc_risk}</p></div>
      <div><p class="stat-label">Altcoin</p><p class="mt-0.5 text-sm font-semibold text-strong">{ms.altcoin}</p></div>
      <div><p class="stat-label">Social</p><p class="mt-0.5 text-sm font-semibold text-strong">{ms.social}</p></div>
    </div>
  {/if}

  <!-- Scorecard -->
  {#if bundle.report.scorecard?.length}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each bundle.report.scorecard as c}
        <div class="card border border-mint/25 bg-mint/5">
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-mint">{c.label}</p>
          <p class="mt-0.5 text-lg font-bold text-strong">{c.value}</p>
          <p class="text-[11px] text-muted">{c.note}</p>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Sections -->
  {#each bodySections as s (s.id)}
    {#if s.locked}
      <div class="card border border-dashed border-edge">
        <div class="flex items-center gap-2 text-sm font-semibold text-strong">
          <Lock class="h-4 w-4 text-muted" /> {s.section_title}
        </div>
        <p class="mt-1 text-xs text-muted">This section is part of the full premium report.</p>
        <a href="/app/account" class="btn-primary mt-3 inline-flex text-xs">Upgrade to unlock</a>
      </div>
    {:else if s.data?.coins?.length}
      <section class="card">
        <h2 class="text-sm font-semibold text-strong">{s.section_title}</h2>
        <div class="mt-2 space-y-2">
          {#each s.data.coins as c}
            <div class="flex items-center gap-2.5">
              {#if c.image}
                <img src={c.image} alt="" class="h-6 w-6 shrink-0 rounded-full" />
              {:else}
                <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[9px] font-semibold text-muted">{c.label.slice(0, 2)}</div>
              {/if}
              <div class="min-w-0">
                <div class="text-sm font-medium text-strong">{c.label}</div>
                <div class="text-xs text-muted">{c.sub}</div>
              </div>
            </div>
          {/each}
        </div>
        {#if s.data.note}<p class="mt-2.5 text-xs leading-relaxed text-muted">{s.data.note}</p>{/if}
      </section>
    {:else if s.content}
      <section class="card">
        <h2 class="text-sm font-semibold {s.section_key === 'premium_takeaway' ? 'text-mint' : 'text-strong'}">{s.section_title}</h2>
        <p class="mt-1.5 whitespace-pre-line text-sm leading-relaxed {s.section_key === 'disclaimer' ? 'text-muted' : 'text-soft'}">{s.content}</p>
      </section>
    {/if}
  {/each}

  {#if bundle.view === 'preview'}
    <div class="card border border-mint/30 bg-mint/5 text-center">
      <p class="text-sm text-soft">Premium members can view the full breakdown of BTC risk, on-chain data, ecosystem rotation and Alt/BTC signals.</p>
      <a href="/app/account" class="btn-primary mt-3 inline-flex">Upgrade to Premium</a>
    </div>
  {/if}

  <!-- Share / export -->
  <div class="card">
    <h2 class="text-sm font-semibold text-strong">Share</h2>
    <div class="mt-2 flex flex-wrap gap-2">
      {#if bundle.can_export}
        <button class="btn-ghost text-xs" disabled={loadingShare !== ''} onclick={() => share('whatsapp', 'WhatsApp')}>WhatsApp version</button>
        <button class="btn-ghost text-xs" disabled={loadingShare !== ''} onclick={() => share('telegram', 'Telegram')}>Telegram version</button>
      {/if}
      <button class="btn-ghost text-xs" disabled={loadingShare !== ''} onclick={() => share('public-preview', 'Public preview')}>Public preview</button>
    </div>
    {#if shareText}
      <div class="mt-3">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs text-muted">{shareLabel}</span>
          <button class="btn-ghost text-xs" onclick={copy}>{#if copied}<Check class="h-3 w-3" /> Copied{:else}<Copy class="h-3 w-3" /> Copy{/if}</button>
        </div>
        <textarea class="h-44 w-full rounded-lg border border-edge bg-panel-2 p-3 font-mono text-xs text-soft" readonly>{shareText}</textarea>
      </div>
    {/if}
  </div>
</article>
