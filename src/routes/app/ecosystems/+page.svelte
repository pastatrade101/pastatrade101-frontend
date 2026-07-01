<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { fmtPct, fmtUsd } from '$lib/format';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import { Lock, ExternalLink } from '@lucide/svelte';
  import { membership, hasFeature } from '$lib/stores/membership';
  import {
    enrich,
    breadthOf,
    regimeOf,
    buildTakeaway,
    altcoinView,
    tonePill,
    confidenceTone,
    type EcoItem,
    type EnrichedEco
  } from '$lib/ecosystem-insight';

  let raw = $state<EcoItem[]>([]);
  let error = $state('');
  let loading = $state(true);

  // Filters
  type View = 'all' | 'improving' | 'weak' | 'high';
  let view = $state<View>('all');
  let premiumView = $state(true); // hide poor-coverage ecosystems by default
  let minTvl = $state(0); // USD
  let requireDex = $state(false);
  let requireNative = $state(false);
  let expanded = $state<Record<string, boolean>>({});

  onMount(async () => {
    try {
      const data = await api<{ items: EcoItem[] }>('/ecosystems/rankings');
      raw = data.items;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load ecosystems.';
    } finally {
      loading = false;
    }
  });

  const all = $derived(raw.map(enrich));
  const breadth = $derived(breadthOf(all));
  const regime = $derived(regimeOf(breadth));
  const strongest = $derived([...all].slice(0, 3));
  const weakest = $derived([...all].filter((e) => e.signal !== 'No data').slice(-3).reverse());
  const takeaway = $derived(buildTakeaway(breadth, regime, all[0]));
  const altView = $derived(altcoinView(breadth, regime));

  const filtered = $derived.by<EnrichedEco[]>(() => {
    return all.filter((e) => {
      if (premiumView && e.confidence.level === 'Low') return false;
      if (view === 'improving' && !e.improving) return false;
      if (view === 'weak' && !e.weak) return false;
      if (view === 'high' && e.confidence.level !== 'High') return false;
      if (minTvl > 0 && (e.metrics?.tvl ?? 0) < minTvl) return false;
      if (requireDex && !e.hasDex) return false;
      if (requireNative && !e.hasNative) return false;
      return true;
    });
  });

  const hiddenCount = $derived(all.length - filtered.length);
  const toggle = (id: string) => (expanded[id] = !expanded[id]);

  // Free / Mid get a limited table (top rows, no advanced filters or detail
  // drawer). Premium unlocks advanced filters + "why ranked here" drawers.
  const FREE_ROWS = 8;
  const canAdvanced = $derived(hasFeature($membership, 'access_advanced_filters'));
  // Plain-language takeaway is gated by a feature flag (admin-toggleable per plan)
  // — free still sees the regime + breadth.
  const canInterp = $derived(hasFeature($membership, 'access_premium_interpretation'));
  const rows = $derived(canAdvanced ? filtered : all.slice(0, FREE_ROWS));

  const views: { id: View; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'improving', label: 'Improving' },
    { id: 'weak', label: 'Weak' },
    { id: 'high', label: 'High confidence' }
  ];
  const tvlOptions = [
    { v: 0, label: 'Any TVL' },
    { v: 100_000_000, label: '≥ $100M' },
    { v: 1_000_000_000, label: '≥ $1B' },
    { v: 5_000_000_000, label: '≥ $5B' }
  ];

  const meterColor = (p: number) => (p >= 50 ? 'bg-mint' : p >= 25 ? 'bg-warn' : 'bg-danger');

  // Link an ecosystem to its DefiLlama chain page — the source of these TVL/DEX/fee
  // metrics — using the exact slug we already store, so the link is always valid.
  const ecoUrl = (e: { defillama_slug: string | null }): string | null => (e.defillama_slug ? `https://defillama.com/chain/${e.defillama_slug}` : null);
</script>

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Ecosystem Rotation Report</h1>
  <p class="text-sm text-muted">
    Chains ranked by a composite strength score — TVL growth, stablecoin depth, DEX volume and native-token momentum — with plain-language
    signals so you can read rotation at a glance.
  </p>
</header>

{#if loading}
  <div class="card text-center text-muted">Loading ecosystems…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">
    {error}
    <p class="mt-1 text-sm text-muted">Run a DefiLlama sync from the Admin panel to populate metrics.</p>
  </div>
{:else if !all.length}
  <div class="card text-center text-muted">No ecosystems tracked yet. Run a DefiLlama sync to populate metrics.</div>
{:else}
  <!-- 1 · Premium takeaway + regime -->
  <section class="hero-card mb-4">
    <div class="flex items-start gap-3.5">
      <span class="icon-badge bg-accent/12 text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
          <path d="M12 3l1.9 4.7L18.5 9.6l-4.6 1.9L12 16l-1.9-4.5L5.5 9.6l4.6-1.9z" />
          <path d="M19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7z" />
        </svg>
      </span>
      <div class="min-w-0 flex-1">
        <div class="mb-1.5 flex flex-wrap items-center gap-2">
          <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Premium Takeaway</span>
          <span class="pill {tonePill(regime.tone)}">{regime.label}</span>
        </div>
        {#if canInterp}
          <p class="text-[15px] leading-relaxed text-body">{takeaway}</p>
        {:else}
          <div class="relative">
            <p class="text-[15px] leading-relaxed text-body blur-[3px]" aria-hidden="true">Ecosystem rotation is selective — a few chains are improving while most remain neutral or weak. This favours disciplined, selective exposure rather than broad ecosystem bets until breadth improves.</p>
            <div class="absolute inset-0 flex items-center justify-center">
              <a href="/pricing" class="btn-primary text-xs shadow-lg"><Lock class="h-3.5 w-3.5" /> Unlock with Premium</a>
            </div>
          </div>
        {/if}
        <p class="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-muted/60"></span>{regime.blurb}
        </p>
      </div>
    </div>
  </section>

  <!-- 2 · Strongest / Weakest cards -->
  <div class="mb-4 grid gap-3 sm:grid-cols-2">
    <div class="card rail-card">
      <header class="mb-3 flex items-center gap-2.5">
        <span class="icon-badge bg-mint/12 text-mint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
            <polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" />
          </svg>
        </span>
        <h2 class="text-sm font-semibold text-strong">Strongest ecosystems</h2>
      </header>
      <ol class="space-y-0.5">
        {#each strongest as e, i}
          <li class="lead-row">
            <span class="flex items-center gap-2.5 text-sm">
              <span class="rank-badge">{i + 1}</span>
              {#if ecoUrl(e)}
                <a href={ecoUrl(e)} target="_blank" rel="noopener noreferrer" class="group inline-flex items-center gap-1 font-medium text-body hover:text-mint">{e.name}<ExternalLink class="h-2.5 w-2.5 text-muted transition group-hover:text-mint" /></a>
              {:else}<span class="font-medium text-body">{e.name}</span>{/if}
            </span>
            <span class="pill {tonePill(e.tone)}">{e.signal}</span>
          </li>
        {/each}
      </ol>
    </div>
    <div class="card rail-card" style="--rail: var(--c-danger)">
      <header class="mb-3 flex items-center gap-2.5">
        <span class="icon-badge bg-danger/12 text-danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
            <polyline points="3 7 9 13 13 9 21 17" /><polyline points="15 17 21 17 21 11" />
          </svg>
        </span>
        <h2 class="text-sm font-semibold text-strong">Weakest ecosystems</h2>
      </header>
      <ol class="space-y-0.5">
        {#each weakest as e, i}
          <li class="lead-row">
            <span class="flex items-center gap-2.5 text-sm">
              <span class="rank-badge">{i + 1}</span>
              {#if ecoUrl(e)}
                <a href={ecoUrl(e)} target="_blank" rel="noopener noreferrer" class="group inline-flex items-center gap-1 font-medium text-body hover:text-mint">{e.name}<ExternalLink class="h-2.5 w-2.5 text-muted transition group-hover:text-mint" /></a>
              {:else}<span class="font-medium text-body">{e.name}</span>{/if}
            </span>
            <span class="pill {tonePill(e.tone)}">{e.signal}</span>
          </li>
        {/each}
      </ol>
    </div>
  </div>

  <!-- 8 · Breadth + What this means -->
  <div class="mb-4 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
    <div class="card">
      <header class="mb-3 flex items-center gap-2.5">
        <span class="icon-badge bg-accent/12 text-accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
            <line x1="6" y1="20" x2="6" y2="13" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="9" />
          </svg>
        </span>
        <h2 class="text-sm font-semibold text-strong">Ecosystem breadth</h2>
      </header>
      <div class="grid grid-cols-3 gap-2.5 text-center">
        <div class="rounded-xl border border-mint/20 bg-mint/5 p-2.5">
          <div class="text-2xl font-semibold text-mint">{breadth.improving}</div>
          <div class="mt-0.5 text-[11px] uppercase tracking-wide text-muted">Improving</div>
        </div>
        <div class="rounded-xl border border-warn/20 bg-warn/5 p-2.5">
          <div class="text-2xl font-semibold text-warn">{breadth.neutral}</div>
          <div class="mt-0.5 text-[11px] uppercase tracking-wide text-muted">Neutral</div>
        </div>
        <div class="rounded-xl border border-danger/20 bg-danger/5 p-2.5">
          <div class="text-2xl font-semibold text-danger">{breadth.weak}</div>
          <div class="mt-0.5 text-[11px] uppercase tracking-wide text-muted">Weak</div>
        </div>
      </div>
      <div class="mt-4 space-y-3">
        {#each [{ label: 'Positive 30D TVL growth', v: breadth.pctTvlPos }, { label: 'Positive 7D DEX volume', v: breadth.pctDexPos }, { label: 'Positive 30D native token', v: breadth.pctNatPos }] as row}
          <div>
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="text-muted">{row.label}</span>
              <span class="font-semibold text-body">{row.v}%</span>
            </div>
            <div class="meter"><div class="meter-fill {meterColor(row.v)}" style="width: {row.v}%"></div></div>
          </div>
        {/each}
      </div>
      <div class="mt-4 flex items-center justify-between border-t border-edge/60 pt-3 text-xs">
        <span class="text-muted">Data coverage</span>
        <span class="text-body"><span class="font-semibold text-mint">{breadth.completeData}</span> complete · <span class="font-semibold text-muted">{breadth.incompleteData}</span> limited</span>
      </div>
    </div>
    <div class="card rail-card" style="--rail: var(--c-accent)">
      <header class="mb-3 flex items-center gap-2.5">
        <span class="icon-badge bg-accent/12 text-accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
            <circle cx="12" cy="12" r="9" /><polygon points="15.5 8.5 11 11 8.5 15.5 13 13" />
          </svg>
        </span>
        <h2 class="text-sm font-semibold text-strong">What this means for altcoins</h2>
      </header>
      <p class="text-[15px] leading-relaxed text-body">{altView}</p>
    </div>
  </div>

  <!-- 10 · Filters (Premium advanced filters) -->
  {#if canAdvanced}
  <div class="card mb-3">
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex overflow-hidden rounded-lg border border-edge">
        {#each views as v}
          <button
            class="px-3 py-1.5 text-xs font-medium transition-colors {view === v.id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}"
            onclick={() => (view = v.id)}
          >
            {v.label}
          </button>
        {/each}
      </div>

      <select bind:value={minTvl} class="rounded-lg border border-edge bg-panel-2/40 px-2 py-1.5 text-xs text-soft">
        {#each tvlOptions as o}<option value={o.v}>{o.label}</option>{/each}
      </select>

      <label class="flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" bind:checked={requireDex} class="accent-accent" /> Has DEX data
      </label>
      <label class="flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" bind:checked={requireNative} class="accent-accent" /> Has native token data
      </label>
      <label class="ml-auto flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" bind:checked={premiumView} class="accent-accent" /> Premium view — hide limited-coverage chains
      </label>
    </div>
    {#if hiddenCount > 0}
      <p class="mt-2 text-[11px] text-muted">{hiddenCount} ecosystem{hiddenCount === 1 ? '' : 's'} hidden by current filters.</p>
    {/if}
  </div>
  {:else}
    <div class="card mb-3 flex flex-wrap items-center justify-between gap-2 border-accent/30 bg-accent/5">
      <p class="text-sm text-soft"><span class="font-medium text-strong">Premium:</span> unlock advanced filters, the full ranked table and “why ranked here?” detail drawers.</p>
      <a href="/app/account" class="btn-primary px-3 py-1.5 text-xs">Go Premium</a>
    </div>
  {/if}

  <!-- 3–6 · Table with rich signals, confidence and expandable "why" -->
  <div class="card overflow-x-auto p-0">
    <table class="w-full min-w-[860px] text-sm">
      <thead>
        <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
          <th class="px-3 py-3 font-medium">#</th>
          <th class="px-3 py-3 font-medium">Ecosystem</th>
          <th class="px-3 py-3 font-medium">Score</th>
          <th class="px-3 py-3 font-medium">TVL</th>
          <th class="px-3 py-3 font-medium">TVL 30d</th>
          <th class="px-3 py-3 font-medium">Stablecoins</th>
          <th class="px-3 py-3 font-medium">DEX vol 7d</th>
          <th class="px-3 py-3 font-medium">Native 30d</th>
          <th class="px-3 py-3 font-medium">Signal</th>
          <th class="px-3 py-3 font-medium">Confidence</th>
          <th class="px-3 py-3 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as e (e.id)}
          {@const m = e.metrics}
          <tr class="border-b border-edge/60 last:border-0 hover:bg-panel-2/40">
            <td class="px-3 py-3 text-muted">{e.rank}</td>
            <td class="px-3 py-3 font-medium text-strong">
              {#if ecoUrl(e)}
                <a href={ecoUrl(e)} target="_blank" rel="noopener noreferrer" class="group inline-flex items-center gap-1 hover:text-mint">{e.name}<ExternalLink class="h-3 w-3 text-muted transition group-hover:text-mint" /></a>
              {:else}{e.name}{/if}
            </td>
            <td class="px-3 py-3 font-semibold text-strong">{m?.strength_score ?? '—'}</td>
            <td class="px-3 py-3 text-soft">{fmtUsd(m?.tvl ?? null, { compact: true })}</td>
            <td class="px-3 py-3 {(m?.tvl_change_30d ?? 0) >= 0 ? 'text-mint' : 'text-danger'}">{fmtPct(m?.tvl_change_30d)}</td>
            <td class="px-3 py-3 text-soft">{fmtUsd(m?.stablecoin_mcap ?? null, { compact: true })}</td>
            <td class="px-3 py-3 {(m?.dex_volume_change_7d ?? 0) >= 0 ? 'text-mint' : 'text-danger'}">{fmtPct(m?.dex_volume_change_7d)}</td>
            <td class="px-3 py-3 {(m?.native_token_30d ?? 0) >= 0 ? 'text-mint' : 'text-danger'}">{fmtPct(m?.native_token_30d)}</td>
            <td class="px-3 py-3"><span class="pill {tonePill(e.tone)}">{e.signal}</span></td>
            <td class="px-3 py-3">
              <span
                class="text-xs font-medium {confidenceTone(e.confidence.level) === 'pos'
                  ? 'text-mint'
                  : confidenceTone(e.confidence.level) === 'warn'
                    ? 'text-warn'
                    : 'text-muted'}"
              >
                {e.confidence.level}
              </span>
            </td>
            <td class="px-3 py-3">
              {#if canAdvanced}
                <button class="text-xs text-accent hover:underline" onclick={() => toggle(e.id)}>
                  {expanded[e.id] ? 'Hide' : 'Why?'}
                </button>
              {:else}
                <span class="text-[10px] uppercase tracking-wide text-muted/60">🔒</span>
              {/if}
            </td>
          </tr>
          {#if canAdvanced && expanded[e.id]}
            <tr class="border-b border-edge/60 bg-panel-2/30">
              <td colspan="11" class="px-3 py-3">
                <div class="space-y-2">
                  <p class="text-sm leading-relaxed text-soft">
                    <span class="font-semibold text-strong">Why ranked here? </span>{e.why}
                  </p>
                  <p class="text-xs text-muted">
                    <span class="font-medium text-soft">Confidence: {e.confidence.level}.</span> {e.confidence.reason}
                  </p>
                  {#if e.notes.length}
                    <ul class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-warn">
                      {#each e.notes as n}<li>• {n}</li>{/each}
                    </ul>
                  {/if}
                </div>
              </td>
            </tr>
          {/if}
        {/each}
        {#if !rows.length}
          <tr><td colspan="11" class="px-3 py-6 text-center text-muted">No ecosystems match the current filters.</td></tr>
        {/if}
        {#if !canAdvanced && all.length > FREE_ROWS}
          <tr><td colspan="11" class="px-3 py-4 text-center text-xs text-muted">
            Showing top {FREE_ROWS} of {all.length}. <a href="/app/account" class="text-accent hover:underline">Upgrade to Premium</a> for the full ranked table, advanced filters &amp; detail drawers.
          </td></tr>
        {/if}
      </tbody>
    </table>
  </div>

  <div class="mt-6"><Disclaimer /></div>
{/if}
