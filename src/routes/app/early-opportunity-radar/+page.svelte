<script lang="ts">
  import { Radar, Info, Search, ExternalLink, X, AlertTriangle, Layers, Network } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import LockedFeature from '$lib/components/LockedFeature.svelte';

  const canRadar = $derived(hasFeature($membership, 'access_early_opportunity_radar'));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let started = $state(false);

  let tab = $state('all'); // all | trending_coins | trending_pools | narratives
  let view = $state('clean'); // clean | all | high_risk | new_pools | dex_only | cex_listed
  let network = $state('');
  let sort = $state('opportunity');
  let search = $state('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let detail = $state<any>(null);
  let drawerLoading = $state(false);

  const qs = () => new URLSearchParams({ tab, view, ...(network ? { network } : {}), sort, ...(search ? { search } : {}) }).toString();

  const load = async () => {
    loading = true;
    error = '';
    try {
      data = await api(`/early-opportunity-radar?${qs()}`, { auth: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load the radar.';
    } finally {
      loading = false;
    }
  };

  // Initial load once membership resolves.
  $effect(() => {
    if (!$membershipReady || started) return;
    started = true;
    if (!canRadar) {
      loading = false;
      return;
    }
    void load();
  });
  // Reload when filters change (after first load).
  $effect(() => {
    // track filters
    void tab;
    void view;
    void network;
    void sort;
    if (started && canRadar) void load();
  });

  const openDetail = async (id: string) => {
    drawerLoading = true;
    detail = { id };
    try {
      detail = await api(`/early-opportunity-radar/candidates/${id}`, { auth: true });
    } catch {
      detail = null;
    } finally {
      drawerLoading = false;
    }
  };

  // ── formatting ──
  const compact = (n: number | null | undefined) => {
    if (n == null) return 'n/a';
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(2)}`;
  };
  const pct = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  const pctTone = (n: number | null | undefined) => (n == null ? 'text-muted' : n > 0 ? 'text-mint' : 'text-danger');
  const oppTone = (s: number) => (s >= 76 ? 'text-mint' : s >= 61 ? 'text-mint/90' : s >= 46 ? 'text-accent' : 'text-muted');
  const oppBar = (s: number) => (s >= 61 ? 'bg-mint' : s >= 46 ? 'bg-accent' : 'bg-muted');
  const riskTone = (s: number) => (s <= 25 ? 'text-mint' : s <= 45 ? 'text-accent' : s <= 65 ? 'text-warn' : 'text-danger');
  const riskBar = (s: number) => (s <= 25 ? 'bg-mint' : s <= 45 ? 'bg-accent' : s <= 65 ? 'bg-warn' : 'bg-danger');
  const confPill = (c: string) => (c === 'High' ? 'bg-mint/15 text-mint' : c === 'Low' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const badgeClass = (b: string) => {
    if (/clean|improving|expanding|strong|trending|cex/i.test(b)) return 'bg-mint/12 text-mint';
    if (/low liquidity|honeypot|abnormal|pump|short history|speculative/i.test(b)) return 'bg-danger/12 text-danger';
    if (/needs validation|dex-only|new pool/i.test(b)) return 'bg-warn/12 text-warn';
    return 'bg-panel-2 text-muted';
  };
  const srcTone = (s: string) => (s === 'Active' ? 'text-mint' : s === 'Partial' || s === 'Stale' ? 'text-warn' : 'text-danger');
  const ago = (iso: string | null) => {
    if (!iso) return 'never';
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.round(m / 60)}h ago`;
    return `${Math.round(m / 1440)}d ago`;
  };

  const TABS = [
    { id: 'all', label: 'All' },
    { id: 'trending_coins', label: 'Trending Coins' },
    { id: 'trending_pools', label: 'Trending DEX Pools' },
    { id: 'narratives', label: 'Narrative Radar' }
  ];
  const VIEWS = [
    { id: 'clean', label: 'Premium Clean' },
    { id: 'all', label: 'All Candidates' },
    { id: 'high_risk', label: 'High Risk' },
    { id: 'dex_only', label: 'DEX Only' },
    { id: 'cex_listed', label: 'CEX Listed' }
  ];
</script>

<header class="mb-4 flex items-start gap-2">
  <Radar class="mt-0.5 h-5 w-5 text-accent" />
  <div class="min-w-0">
    <h1 class="text-xl font-semibold text-strong">Early Opportunity Radar</h1>
    <p class="text-sm text-muted">Discover early research candidates from trending coins, new DEX pools, and rising market activity — with risk filters built in.</p>
  </div>
</header>

{#if !$membershipReady}
  <p class="text-sm text-muted">Loading…</p>
{:else if !canRadar}
  <div class="space-y-4">
    <LockedFeature
      title="Early Opportunity Radar is a Mid & Premium feature"
      plan="Mid"
      bullets={['Trending coins, trending DEX pools and narrative radar in one place', 'Opportunity Score + Risk Score + confidence on every candidate', 'GoPlus security screening and premium-clean filters to cut the noise']}
    />
    <div class="card">
      <p class="stat-label">What this module does</p>
      <p class="mt-1 text-sm leading-relaxed text-soft">Early Opportunity Radar scans CoinGecko trending coins, GeckoTerminal DEX pools and narrative/category momentum to surface assets gaining <em>early market attention</em>. Every candidate is a <strong>research candidate</strong>, never a buy signal — and each is paired with a risk score, confidence and clear risk flags so you can avoid low-liquidity, abnormal-spike and short-history traps.</p>
    </div>
  </div>
{:else}
  <!-- Takeaway -->
  {#if data?.takeaway}
    <div class="hero-card mb-3">
      <p class="stat-label text-accent">Radar takeaway</p>
      <p class="mt-1 text-sm leading-relaxed text-soft">{data.takeaway}</p>
    </div>
  {/if}

  <!-- Education + disclaimer -->
  <details class="card mb-3">
    <summary class="cursor-pointer text-sm font-medium text-soft">How to use Early Opportunity Radar</summary>
    <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
      <li>Look for candidates with <span class="text-soft">improving volume and liquidity</span>, not just price spikes.</li>
      <li>Check the <span class="text-soft">risk flags</span> before adding anything to a watchlist.</li>
      <li>Treat <span class="text-soft">very new pools</span> and low-liquidity tokens as high risk.</li>
      <li>Confirm with market trend, liquidity and broader narrative strength.</li>
      <li>These are <span class="text-soft">research candidates</span>, not confirmed opportunities.</li>
    </ol>
  </details>

  {#if loading && !data}
    <p class="text-sm text-muted">Scanning sources…</p>
  {:else if error}
    <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
  {:else if data}
    <!-- Summary cards -->
    <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {#each [['Candidates', data.summary.total_candidates], ['Trending', data.summary.trending_count], ['High attention', data.summary.high_attention], ['Clean', data.summary.clean_candidates], ['Low-liq warnings', data.summary.low_liquidity_warnings], ['Top network', data.summary.top_network ?? '—']] as [label, value]}
        <div class="card p-3">
          <p class="text-[11px] uppercase tracking-wide text-muted">{label}</p>
          <p class="text-lg font-bold text-strong">{value}</p>
        </div>
      {/each}
    </div>

    <!-- Source status + freshness -->
    <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      <span>Updated {ago(data.as_of)}</span>
      {#each data.source_status as s}
        <span class="inline-flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full {srcTone(s.status).replace('text-', 'bg-')}"></span>{s.source.replace(/_/g, ' ')}: <span class={srcTone(s.status)}>{s.status}</span></span>
      {/each}
    </div>

    <!-- Tabs -->
    <div class="mb-2 flex flex-wrap gap-1.5">
      {#each TABS as t}
        <button class="rounded-lg px-3 py-1.5 text-sm transition {tab === t.id ? 'bg-accent/15 text-accent' : 'bg-panel-2 text-muted hover:text-soft'}" onclick={() => (tab = t.id)}>{t.label}</button>
      {/each}
    </div>

    {#if tab === 'narratives'}
      <!-- Narrative radar -->
      <div class="grid gap-2 sm:grid-cols-2">
        {#each data.narratives as n}
          <div class="card flex items-center justify-between p-3">
            <div class="min-w-0"><p class="truncate font-medium text-soft">{n.narrative}</p><p class="truncate text-xs text-muted">{(n.top_coins ?? []).join(' · ') || '—'}</p></div>
            <span class="shrink-0 text-sm font-semibold {pctTone(n.market_cap_change_24h)}">{pct(n.market_cap_change_24h)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Filters -->
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <select bind:value={view} class="input-sm">{#each VIEWS as v}<option value={v.id}>{v.label}</option>{/each}</select>
        <select bind:value={network} class="input-sm">
          <option value="">All networks</option>
          {#each data.networks as n}<option value={n.network}>{n.network} ({n.count})</option>{/each}
        </select>
        <select bind:value={sort} class="input-sm">
          <option value="opportunity">Opportunity</option>
          <option value="risk">Risk</option>
          <option value="volume">24h volume</option>
          <option value="liquidity">Liquidity</option>
          <option value="price_change">24h change</option>
          <option value="trending">Trending rank</option>
        </select>
        <div class="relative">
          <Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} placeholder="Search token…" class="input-sm pl-7" />
        </div>
        {#if loading}<span class="text-xs text-muted">updating…</span>{/if}
      </div>

      <!-- Candidate cards -->
      {#if !data.candidates.length}
        <div class="card text-center text-sm text-muted">No candidates match these filters. Try “All Candidates” or a different network.</div>
      {:else}
        <div class="grid gap-2 lg:grid-cols-2">
          {#each data.candidates as c}
            <button class="card p-3 text-left transition hover:border-accent/40" onclick={() => openDetail(c.id)}>
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-strong">{c.symbol} <span class="text-xs font-normal text-muted">{c.asset_name !== c.symbol ? c.asset_name : ''}</span></p>
                  <p class="text-xs text-muted">{c.network ?? 'multi-chain'} · {c.dex_name ?? c.source_name.replace(/_/g, ' ')}</p>
                </div>
                <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] {confPill(c.confidence)}">{c.confidence}</span>
              </div>

              <div class="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p class="text-[10px] uppercase tracking-wide text-muted">Opportunity</p>
                  <p class="text-lg font-bold {oppTone(c.opportunity_score)}">{c.opportunity_score}<span class="text-xs text-muted">/100</span></p>
                  <div class="meter mt-0.5"><div class="meter-fill {oppBar(c.opportunity_score)}" style="width:{c.opportunity_score}%"></div></div>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wide text-muted">Risk</p>
                  <p class="text-lg font-bold {riskTone(c.risk_score)}">{c.risk_score}<span class="text-xs text-muted">/100</span></p>
                  <div class="meter mt-0.5"><div class="meter-fill {riskBar(c.risk_score)}" style="width:{c.risk_score}%"></div></div>
                </div>
              </div>

              <div class="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                <span>Liq <span class="text-soft">{compact(c.liquidity_usd)}</span></span>
                <span>Vol <span class="text-soft">{compact(c.volume_24h)}</span></span>
                {#if c.pool_age_hours != null}<span>Age <span class="text-soft">{Math.round(c.pool_age_hours / 24)}d</span></span>{/if}
                <span>24h <span class={pctTone(c.price_change_24h)}>{pct(c.price_change_24h)}</span></span>
              </div>

              {#if c.quality_badges?.length}
                <div class="mt-2 flex flex-wrap gap-1">
                  {#each c.quality_badges.slice(0, 4) as b}<span class="rounded px-1.5 py-0.5 text-[10px] {badgeClass(b)}">{b}</span>{/each}
                </div>
              {/if}
              {#if c.risk_flags?.length}
                <p class="mt-1.5 flex items-center gap-1 text-[11px] text-warn"><AlertTriangle class="h-3 w-3 shrink-0" />{c.risk_flags[0]}{c.risk_flags.length > 1 ? ` +${c.risk_flags.length - 1}` : ''}</p>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- Leaderboards -->
    <div class="mt-4 grid gap-3 lg:grid-cols-2">
      <div class="card">
        <p class="stat-label mb-2 flex items-center gap-1.5"><Network class="h-3.5 w-3.5" />Hot networks today</p>
        {#each data.networks.slice(0, 6) as n}
          <div class="flex items-center justify-between border-b border-edge/50 py-1.5 text-sm last:border-0">
            <span class="text-soft">{n.network} <span class="text-xs text-muted">· {n.count}</span></span>
            <span class="text-xs text-muted">opp <span class="text-soft">{n.avg_opportunity}</span> · risk <span class="text-soft">{n.avg_risk}</span> · {compact(n.total_volume)}</span>
          </div>
        {:else}
          <p class="text-sm text-muted">No network data yet.</p>
        {/each}
      </div>
      <div class="card">
        <p class="stat-label mb-2 flex items-center gap-1.5"><Layers class="h-3.5 w-3.5" />Hot narratives today</p>
        {#each data.narratives.slice(0, 6) as n}
          <div class="flex items-center justify-between border-b border-edge/50 py-1.5 text-sm last:border-0">
            <span class="truncate text-soft">{n.narrative}</span>
            <span class="shrink-0 text-sm font-medium {pctTone(n.market_cap_change_24h)}">{pct(n.market_cap_change_24h)}</span>
          </div>
        {:else}
          <p class="text-sm text-muted">No narrative data yet.</p>
        {/each}
      </div>
    </div>

    <!-- Disclaimer -->
    <div class="mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs leading-relaxed text-muted">
      <Info class="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
      <span>Early Opportunity Radar is for research only. New tokens, DEX pools and pre-market assets are highly risky and may be illiquid, volatile or unsafe. Pastatrade does not recommend buying any asset. Always do your own research.</span>
    </div>
  {/if}
{/if}

<!-- Detail drawer -->
{#if detail}
  <button class="fixed inset-0 z-40 bg-black/60" aria-label="Close" onclick={() => (detail = null)}></button>
  <aside class="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-edge bg-panel p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-strong">{detail.symbol ?? 'Candidate'}</h2>
      <button aria-label="Close" onclick={() => (detail = null)}><X class="h-5 w-5 text-muted" /></button>
    </div>
    {#if drawerLoading}
      <p class="text-sm text-muted">Loading…</p>
    {:else if detail.id && detail.opportunity_score != null}
      <p class="text-xs text-muted">{detail.asset_name} · {detail.network ?? 'multi-chain'} · {detail.dex_name ?? detail.source_name?.replace(/_/g, ' ')}</p>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <div class="card p-3"><p class="text-[10px] uppercase tracking-wide text-muted">Opportunity</p><p class="text-xl font-bold {oppTone(detail.opportunity_score)}">{detail.opportunity_score}/100</p></div>
        <div class="card p-3"><p class="text-[10px] uppercase tracking-wide text-muted">Risk</p><p class="text-xl font-bold {riskTone(detail.risk_score)}">{detail.risk_score}/100</p></div>
      </div>

      <p class="mt-3 text-sm leading-relaxed text-soft">{detail.interpretation}</p>

      <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <dt class="text-muted">Price</dt><dd class="text-right text-soft">{detail.price_usd != null ? `$${detail.price_usd}` : 'n/a'}</dd>
        <dt class="text-muted">Liquidity</dt><dd class="text-right text-soft">{compact(detail.liquidity_usd)}</dd>
        <dt class="text-muted">24h volume</dt><dd class="text-right text-soft">{compact(detail.volume_24h)}</dd>
        <dt class="text-muted">Market cap</dt><dd class="text-right text-soft">{compact(detail.market_cap)}</dd>
        <dt class="text-muted">FDV</dt><dd class="text-right text-soft">{compact(detail.fdv)}</dd>
        <dt class="text-muted">Transactions 24h</dt><dd class="text-right text-soft">{detail.transactions_24h ?? 'n/a'}</dd>
        {#if detail.pool_age_hours != null}<dt class="text-muted">Pool age</dt><dd class="text-right text-soft">{Math.round(detail.pool_age_hours / 24)}d</dd>{/if}
        <dt class="text-muted">Confidence</dt><dd class="text-right text-soft">{detail.confidence}</dd>
      </dl>

      {#if detail.quality_badges?.length}
        <p class="mt-3 text-[11px] uppercase tracking-wide text-muted">Quality</p>
        <div class="mt-1 flex flex-wrap gap-1">{#each detail.quality_badges as b}<span class="rounded px-1.5 py-0.5 text-[10px] {badgeClass(b)}">{b}</span>{/each}</div>
      {/if}
      {#if detail.risk_flags?.length}
        <p class="mt-3 text-[11px] uppercase tracking-wide text-muted">Risk flags</p>
        <ul class="mt-1 space-y-0.5">{#each detail.risk_flags as f}<li class="flex items-center gap-1 text-xs text-warn"><AlertTriangle class="h-3 w-3 shrink-0" />{f}</li>{/each}</ul>
      {/if}

      {#if detail.contract_address}
        <p class="mt-3 break-all text-[11px] text-muted">Contract: {detail.contract_address}</p>
      {/if}
      {#if detail.source_url}
        <a href={detail.source_url} target="_blank" rel="noopener" class="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">View source <ExternalLink class="h-3.5 w-3.5" /></a>
      {/if}

      <div class="mt-4 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[11px] leading-relaxed text-muted">Research candidate only — not a buy signal. New / low-liquidity tokens are highly risky. Always do your own research.</div>
    {:else}
      <p class="text-sm text-muted">Candidate details unavailable.</p>
    {/if}
  </aside>
{/if}
