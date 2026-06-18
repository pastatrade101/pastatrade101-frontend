<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { ArrowLeft } from '@lucide/svelte';
  import { api } from '$lib/api';
  import ReportViewer from '$lib/components/ReportViewer.svelte';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bundle = $state<any>(null);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      bundle = await api(`/reports/${$page.params.slug}`, { auth: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Report not found.';
    } finally {
      loading = false;
    }
  });
</script>

<a href="/app/reports" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-soft"><ArrowLeft class="h-4 w-4" /> All reports</a>

{#if loading}
  <p class="text-sm text-muted">Loading report…</p>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if bundle}
  <ReportViewer {bundle} />
{/if}
