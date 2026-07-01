<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { ArrowLeft, Copy, Check, Download } from '@lucide/svelte';
  import { api, apiUploadBinary } from '$lib/api';
  import { openReportPdf } from '$lib/reports/print';
  import { authReady, user } from '$lib/stores/auth';
  import ReportStatusBadge from '$lib/components/ReportStatusBadge.svelte';

  interface Section {
    id: string;
    section_key: string;
    section_title: string;
    content: string | null;
    data: { coins?: { label: string; sub: string; image: string | null }[]; note?: string } | null;
    is_enabled: boolean;
    is_premium: boolean;
    sort_order: number;
  }
  interface Report {
    id: string;
    title: string;
    report_type: string;
    audience: string;
    language: string;
    tone: string;
    status: string;
    summary: string | null;
    premium_takeaway: string | null;
    cover_image_url: string | null;
    market_status: { regime: string; btc_risk: string; altcoin: string; social: string } | null;
    scorecard: { label: string; value: string; note: string }[] | null;
    published_at: string | null;
    report_date: string;
    quality: { passed: boolean; warnings: string[]; checks: Record<string, boolean> } | null;
  }

  let report = $state<Report | null>(null);
  let sections = $state<Section[]>([]);
  let loading = $state(true);
  let error = $state('');
  let message = $state('');
  let busy = $state('');

  let exportText = $state('');
  let exportLabel = $state('');
  let copied = $state(false);

  const id = $page.params.id;

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    try {
      const data = await api<{ report: Report; sections: Section[] }>(`/admin/reports/${id}`, { auth: true });
      report = data.report;
      sections = data.sections.sort((a, b) => a.sort_order - b.sort_order);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load report.';
    } finally {
      loading = false;
    }
  };
  onMount(load);

  const save = async () => {
    if (!report) return;
    busy = 'save';
    message = '';
    error = '';
    try {
      await api(`/admin/reports/${id}`, {
        method: 'PUT',
        auth: true,
        body: {
          title: report.title,
          summary: report.summary,
          premium_takeaway: report.premium_takeaway,
          cover_image_url: report.cover_image_url,
          sections: sections.map((s) => ({ id: s.id, content: s.content, is_enabled: s.is_enabled, section_title: s.section_title }))
        }
      });
      message = 'Saved.';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Save failed.';
    } finally {
      busy = '';
    }
  };

  const uploadCover = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !report) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      error = 'Unsupported image type. Use PNG, JPG, WebP or GIF.';
      input.value = '';
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      error = 'Image is too large (max 6MB).';
      input.value = '';
      return;
    }
    busy = 'cover';
    message = '';
    error = '';
    try {
      const { url } = await apiUploadBinary<{ url: string }>('/admin/reports/cover-upload', file);
      report.cover_image_url = url;
      message = 'Cover image uploaded — remember to Save.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Cover upload failed.';
    } finally {
      busy = '';
      input.value = '';
    }
  };

  const act = async (action: 'publish' | 'archive') => {
    busy = action;
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

  const doExport = async (type: string, label: string) => {
    busy = 'export';
    copied = false;
    try {
      const r = await api<{ content: string }>(`/admin/reports/${id}/export`, { method: 'POST', auth: true, body: { type } });
      exportText = r.content;
      exportLabel = label;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Export failed.';
    } finally {
      busy = '';
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const exportPdf = () => {
    if (!report) return;
    openReportPdf(
      report,
      sections.filter((s) => s.is_enabled).map((s) => ({ section_key: s.section_key, section_title: s.section_title, content: s.content, is_premium: s.is_premium, data: s.data }))
    );
  };
</script>

<a href="/admin/reports" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-soft"><ArrowLeft class="h-4 w-4" /> All reports</a>

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

{#if loading}
  <p class="text-sm text-muted">Loading…</p>
{:else if report}
  <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
    <div class="flex flex-wrap items-center gap-1.5">
      <ReportStatusBadge type={report.report_type} audience={report.audience} status={report.status} />
      {#if report.language === 'sw'}<span class="pill bg-panel-2 text-soft">Kiswahili</span>{/if}
      <span class="pill bg-panel-2 capitalize text-soft">{report.tone}</span>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn-ghost text-sm" onclick={exportPdf}><Download class="h-3.5 w-3.5" /> PDF</button>
      <button class="btn-ghost text-sm" disabled={busy === 'save'} onclick={save}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
      {#if report.status !== 'published'}<button class="btn-primary text-sm" disabled={busy === 'publish'} onclick={() => act('publish')}>Publish</button>{/if}
      {#if report.status !== 'archived'}<button class="btn-ghost text-sm" disabled={busy === 'archive'} onclick={() => act('archive')}>Archive</button>{/if}
    </div>
  </div>

  <!-- Quality check -->
  {#if report.quality}
    <div class="card mb-4 {report.quality.passed ? 'border-mint/30 bg-mint/5' : 'border-warn/30 bg-warn/5'}">
      <p class="text-sm font-semibold {report.quality.passed ? 'text-mint' : 'text-warn'}">Quality check: {report.quality.passed ? 'passed' : 'review needed'}</p>
      {#if report.quality.warnings.length}
        <ul class="mt-1 space-y-0.5 text-xs text-muted">
          {#each report.quality.warnings as w}<li>• {w}</li>{/each}
        </ul>
      {/if}
    </div>
  {/if}

  <!-- Editable fields -->
  <div class="card mb-4 space-y-3">
    <label class="block text-xs text-muted">Cover image URL (optional)
      <input class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-soft" placeholder="https://…/cover.jpg" bind:value={report.cover_image_url} />
    </label>
    <div class="flex flex-wrap items-center gap-3">
      <label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs text-soft transition hover:bg-panel-2/60">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onchange={uploadCover} disabled={busy === 'cover'} />
        {busy === 'cover' ? 'Uploading…' : 'Upload from file'}
      </label>
      <span class="text-[11px] text-muted">…or paste a URL above. PNG/JPG/WebP/GIF, max 6MB.</span>
      {#if report.cover_image_url}
        <button type="button" class="text-[11px] text-danger hover:underline" onclick={() => report && (report.cover_image_url = null)}>Remove</button>
      {/if}
    </div>
    {#if report.cover_image_url}
      <img src={report.cover_image_url} alt="cover preview" class="max-h-48 w-full rounded-lg border border-edge object-cover" />
    {/if}
    <label class="block text-xs text-muted">Title
      <input class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-strong" bind:value={report.title} />
    </label>
    <label class="block text-xs text-muted">Executive summary
      <textarea class="mt-1 h-24 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-soft" bind:value={report.summary}></textarea>
    </label>
    <label class="block text-xs text-muted">Premium takeaway
      <textarea class="mt-1 h-20 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-soft" bind:value={report.premium_takeaway}></textarea>
    </label>
  </div>

  <!-- Sections -->
  <div class="space-y-3">
    {#each sections as s (s.id)}
      <div class="card">
        <div class="mb-2 flex items-center justify-between gap-2">
          <input class="flex-1 rounded-lg border border-edge bg-panel-2 px-2 py-1 text-sm font-semibold text-strong" bind:value={s.section_title} />
          <label class="flex shrink-0 items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" class="accent-mint" bind:checked={s.is_enabled} /> Enabled
          </label>
          {#if s.is_premium}<span class="pill bg-edge text-muted">Premium</span>{/if}
        </div>
        <textarea class="h-28 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-soft" bind:value={s.content}></textarea>
      </div>
    {/each}
  </div>

  <!-- Export -->
  <div class="card mt-4">
    <h2 class="text-sm font-semibold text-strong">Export / share</h2>
    <div class="mt-2 flex flex-wrap gap-2">
      <button class="btn-ghost text-xs" disabled={busy === 'export'} onclick={() => doExport('whatsapp', 'WhatsApp')}>WhatsApp</button>
      <button class="btn-ghost text-xs" disabled={busy === 'export'} onclick={() => doExport('telegram', 'Telegram')}>Telegram</button>
      <button class="btn-ghost text-xs" disabled={busy === 'export'} onclick={() => doExport('public_preview', 'Public preview')}>Public preview</button>
      <button class="btn-ghost text-xs" disabled={busy === 'export'} onclick={() => doExport('swahili', 'Swahili')}>Swahili</button>
    </div>
    {#if exportText}
      <div class="mt-3">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs text-muted">{exportLabel}</span>
          <button class="btn-ghost text-xs" onclick={copy}>{#if copied}<Check class="h-3 w-3" /> Copied{:else}<Copy class="h-3 w-3" /> Copy{/if}</button>
        </div>
        <textarea class="h-44 w-full rounded-lg border border-edge bg-panel-2 p-3 font-mono text-xs text-soft" readonly>{exportText}</textarea>
      </div>
    {/if}
  </div>
{/if}
