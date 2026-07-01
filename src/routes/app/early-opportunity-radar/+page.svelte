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
    { id: 'clean_watchlist', label: 'Clean Watchlist' },
    { id: 'all', label: 'All Candidates' },
    { id: 'high_risk', label: 'High Risk' },
    { id: 'dex_only', label: 'DEX Only' },
    { id: 'cex_listed', label: 'CEX Listed' }
  ];

  // ── explainability helpers ──
  const SOURCE_BADGE: Record<string, string> = {
    coingecko_trending: 'CoinGecko Trending',
    geckoterminal_trending: 'GeckoTerminal Trending Pool',
    geckoterminal_new: 'GeckoTerminal New Pool',
    coingecko_category: 'Narrative Radar'
  };
  const sourceLabel = (c: any) => SOURCE_BADGE[c.source_name] ?? (c.source_name ?? '').replace(/_/g, ' ');

  const CONF_TIP: Record<string, string> = {
    High: 'Good liquidity, real volume, enough age/history and a cleaner risk profile.',
    Medium: 'Real activity, but some validation is still missing.',
    Low: 'Very new, thin liquidity, an abnormal spike, or contract/security data is missing.'
  };
  const SORT_HELP: Record<string, string> = {
    opportunity: 'Ranks candidates by attention and traction — not by safety.',
    risk: 'Lower risk does not mean safe — only fewer visible warnings.',
    volume: 'Ranks by 24h volume. High volume vs liquidity can signal wash activity.',
    liquidity: 'Ranks by pool depth. More liquidity usually means lower slippage.',
    price_change: 'Ranks by 24h price move. Big moves are often noisy or short-lived.',
    trending: 'Ranks by trending position across sources.'
  };
  const FLAG_TIP: Record<string, string> = {
    'Very new pool': 'The pool was created very recently, so there is little price/liquidity history to trust.',
    'Low liquidity': 'Thin liquidity means higher slippage and easier price manipulation.',
    'High FDV / low liquidity': 'Valuation looks large vs available liquidity — this can increase slippage and volatility risk.',
    'Abnormal price spike': 'Price moved very sharply in 24h — the signal may be noise or short-term speculation.',
    'Thin transactions': 'Few trades in 24h — activity may not be genuine or sustained.',
    'Unknown market cap': 'Market cap is unavailable, so size and dilution are hard to judge.',
    'Contract risk unknown': 'Security data is incomplete. Treat as unverified until contract checks are available.',
    'Honeypot warning': 'Security screening flagged possible honeypot behaviour — treat as dangerous.',
    'DEX-only · single source': 'Seen on a single DEX pool only — not confirmed across exchanges or aggregators.',
    'Possible wash / hype spike': 'Volume is very high vs liquidity — can indicate wash trading or a hype spike.'
  };
  const flagTip = (f: string) => FLAG_TIP[f] ?? 'A risk factor to validate before researching further.';

  const GOOD_BADGE = /clean|improving|expanding|strong|trending|cex/i;
  const whyPositives = (c: any): string[] => (c.quality_badges ?? []).filter((b: string) => GOOD_BADGE.test(b));
  const whyNegatives = (c: any): string[] => (c.risk_flags ?? []);

  const whatToWatch = (c: any): string[] => {
    const out: string[] = [];
    const lowRisk = c.risk_score <= 40;
    if (lowRisk) {
      if (c.liquidity_usd) out.push(`Liquidity stays above ${compact(c.liquidity_usd * 0.8)}`);
      out.push('Volume continues without abnormal spikes');
      out.push('Risk score stays below 40');
      out.push('Token keeps trending for more than 24–48 hours');
      if (!c.security_checked && c.source_type === 'dex_pool') out.push('Contract / security data becomes clearer');
    } else {
      out.push('Watch for liquidity dropping');
      out.push('Watch for abnormal volume fading');
      if ((c.fdv ?? 0) && (c.liquidity_usd ?? 0) && c.fdv / c.liquidity_usd > 30) out.push('Watch the high FDV vs liquidity imbalance');
      out.push('Watch for contract / security warnings');
    }
    return out.slice(0, 5);
  };

  const whyAppeared = (c: any): string => {
    if (c.source_type === 'trending') return 'Appeared because it is trending on CoinGecko (multi-source search interest).';
    return `Appeared as a trending DEX pool on ${c.network ?? 'its network'}${c.dex_name ? ` (${c.dex_name})` : ''} — rising volume/attention relative to other pools.`;
  };

  const relatedAssets = (n: any): string[] => (n.top_coins ?? []).filter((x: string) => !/^https?:/i.test(x));
  // Link a narrative to its CoinGecko category page (the source of this momentum).
  // Uses the exact CoinGecko slug so links are always valid.
  const narrativeUrl = (n: any): string | null => (n.category_id ? `https://www.coingecko.com/en/categories/${n.category_id}` : null);

  // expandable "why this score" per card
  let openWhy = $state<Record<string, boolean>>({});
  const toggleWhy = (id: string) => (openWhy = { ...openWhy, [id]: !openWhy[id] });

  // source health banner
  const staleSources = $derived((data?.source_status ?? []).filter((s: any) => s.status === 'Stale').map((s: any) => s.source));
  const downSources = $derived((data?.source_status ?? []).filter((s: any) => s.status === 'Unavailable' || s.status === 'Partial').map((s: any) => s.source));
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

  <!-- Opportunity vs Risk explainer -->
  <div class="mb-3 flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
    <Info class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
    <span><span class="text-soft">Opportunity score</span> measures early attention and traction. <span class="text-soft">Risk score</span> measures danger, noise and uncertainty. <span class="font-medium text-soft">A high opportunity score does not mean low risk.</span></span>
  </div>

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
    <p class="mt-3 text-xs font-medium text-soft">Research checklist — before adding a candidate to a watchlist:</p>
    <ul class="mt-1 grid gap-1 pl-1 text-sm text-muted sm:grid-cols-2">
      <li>☐ Check liquidity</li>
      <li>☐ Check 24h volume</li>
      <li>☐ Check pool age / history</li>
      <li>☐ Check risk flags</li>
      <li>☐ Don't rely only on price spikes</li>
      <li>☐ Prefer real transactions over hype</li>
      <li>☐ Confirm with broader market &amp; narrative strength</li>
    </ul>
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

    {#if staleSources.length}
      <div class="mb-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-xs text-warn">Some source data is stale — showing the last successful sync. Scores may not reflect the latest market activity.</div>
    {:else if downSources.length}
      <div class="mb-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-xs text-warn">Some sources are unavailable or rate-limited ({downSources.map((s: string) => s.replace(/_/g, ' ')).join(', ')}). Scores may have lower confidence.</div>
    {/if}

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
          {#if narrativeUrl(n)}
            <a href={narrativeUrl(n)} target="_blank" rel="noopener noreferrer" class="card group flex items-center justify-between p-3 transition hover:border-mint/40 hover:bg-panel-2/50">
              <div class="min-w-0">
                <p class="flex items-center gap-1 truncate font-medium text-soft">{n.narrative}<ExternalLink class="h-3 w-3 shrink-0 text-muted transition group-hover:text-mint" /></p>
                <p class="truncate text-xs text-muted">{relatedAssets(n).length ? `Related: ${relatedAssets(n).join(', ')}` : 'View this category on CoinGecko'}</p>
              </div>
              <span class="shrink-0 text-sm font-semibold {pctTone(n.market_cap_change_24h)}">{pct(n.market_cap_change_24h)}</span>
            </a>
          {:else}
            <div class="card flex items-center justify-between p-3">
              <div class="min-w-0">
                <p class="truncate font-medium text-soft">{n.narrative}</p>
                <p class="truncate text-xs text-muted">{relatedAssets(n).length ? `Related: ${relatedAssets(n).join(', ')}` : 'Category momentum from CoinGecko'}</p>
              </div>
              <span class="shrink-0 text-sm font-semibold {pctTone(n.market_cap_change_24h)}">{pct(n.market_cap_change_24h)}</span>
            </div>
          {/if}
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
      {#if SORT_HELP[sort]}<p class="-mt-1 mb-3 text-[11px] text-muted">Sorting by {sort}: {SORT_HELP[sort]}</p>{/if}

      <!-- Candidate cards -->
      {#if !data.candidates.length}
        <div class="card text-center text-sm text-muted">No candidates passed the current filters. Try <span class="text-soft">All Candidates</span>, switch network, or lower the minimum liquidity in admin settings.</div>
      {:else}
        <div class="grid gap-2 lg:grid-cols-2">
          {#each data.candidates as c}
            <div class="card p-3 transition hover:border-accent/40">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-strong">{c.symbol} <span class="text-xs font-normal text-muted">{c.asset_name !== c.symbol ? c.asset_name : ''}</span></p>
                  <div class="mt-0.5 flex flex-wrap items-center gap-1">
                    {#if c.network}<span class="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">{c.network}</span>{/if}
                    <span class="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">{sourceLabel(c)}</span>
                    {#if c.security_checked}<span class="rounded bg-mint/10 px-1.5 py-0.5 text-[10px] text-mint">GoPlus checked</span>{/if}
                  </div>
                </div>
                <span class="shrink-0 cursor-help rounded px-1.5 py-0.5 text-[10px] {confPill(c.confidence)}" title={CONF_TIP[c.confidence]}>{c.confidence}</span>
              </div>

              <div class="mt-2 grid grid-cols-2 gap-2">
                <div title="Early attention & traction — not safety.">
                  <p class="text-[10px] uppercase tracking-wide text-muted">Opportunity</p>
                  <p class="text-lg font-bold {oppTone(c.opportunity_score)}">{c.opportunity_score}<span class="text-xs text-muted">/100</span></p>
                  <div class="meter mt-0.5"><div class="meter-fill {oppBar(c.opportunity_score)}" style="width:{c.opportunity_score}%"></div></div>
                </div>
                <div title="Danger, noise & uncertainty — lower is fewer warnings, not 'safe'.">
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
                <p class="mt-1.5 flex items-center gap-1 text-[11px] text-warn" title={flagTip(c.risk_flags[0])}><AlertTriangle class="h-3 w-3 shrink-0" />{c.risk_flags[0]}{c.risk_flags.length > 1 ? ` +${c.risk_flags.length - 1}` : ''}</p>
              {/if}

              <!-- Why this score? -->
              <button class="mt-2 text-[11px] text-accent hover:underline" onclick={() => toggleWhy(c.id)}>{openWhy[c.id] ? 'Hide' : 'Why this score?'}</button>
              {#if openWhy[c.id]}
                <div class="mt-1 grid gap-2 rounded-lg bg-panel-2 p-2 text-[11px] sm:grid-cols-2">
                  <div>
                    <p class="mb-0.5 font-medium text-mint">Supports attention</p>
                    {#each whyPositives(c) as p}<p class="text-muted">+ {p}</p>{:else}<p class="text-muted">Limited positive signals.</p>{/each}
                  </div>
                  <div>
                    <p class="mb-0.5 font-medium text-warn">Adds risk</p>
                    {#each whyNegatives(c) as n}<p class="cursor-help text-muted" title={flagTip(n)}>− {n}</p>{:else}<p class="text-muted">No major risk flags.</p>{/each}
                  </div>
                </div>
              {/if}

              <!-- Actions -->
              <div class="mt-2 flex items-center gap-2 border-t border-edge/50 pt-2">
                <button class="rounded-lg bg-accent/15 px-2.5 py-1 text-xs text-accent transition hover:bg-accent/25" onclick={() => openDetail(c.id)}>View details</button>
                <button class="cursor-not-allowed rounded-lg bg-panel-2 px-2.5 py-1 text-xs text-muted" disabled title="Coming in Phase 2">+ Watchlist</button>
                <button class="cursor-not-allowed rounded-lg bg-panel-2 px-2.5 py-1 text-xs text-muted" disabled title="Coming in Phase 2">Alert</button>
              </div>
            </div>
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
          {#if narrativeUrl(n)}
            <a href={narrativeUrl(n)} target="_blank" rel="noopener noreferrer" class="group flex items-center justify-between border-b border-edge/50 py-1.5 text-sm last:border-0">
              <span class="flex items-center gap-1 truncate text-soft transition group-hover:text-mint">{n.narrative}<ExternalLink class="h-2.5 w-2.5 shrink-0 text-muted transition group-hover:text-mint" /></span>
              <span class="shrink-0 text-sm font-medium {pctTone(n.market_cap_change_24h)}">{pct(n.market_cap_change_24h)}</span>
            </a>
          {:else}
            <div class="flex items-center justify-between border-b border-edge/50 py-1.5 text-sm last:border-0">
              <span class="truncate text-soft">{n.narrative}</span>
              <span class="shrink-0 text-sm font-medium {pctTone(n.market_cap_change_24h)}">{pct(n.market_cap_change_24h)}</span>
            </div>
          {/if}
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
      <div class="mt-1.5 flex flex-wrap gap-1">
        <span class="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">{sourceLabel(detail)}</span>
        {#if detail.security_checked}<span class="rounded bg-mint/10 px-1.5 py-0.5 text-[10px] text-mint">GoPlus checked</span>{:else if detail.source_type === 'dex_pool'}<span class="rounded bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn">Security unverified</span>{/if}
        <span class="cursor-help rounded px-1.5 py-0.5 text-[10px] {confPill(detail.confidence)}" title={CONF_TIP[detail.confidence]}>{detail.confidence} confidence</span>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <div class="card p-3" title="Early attention & traction — not safety."><p class="text-[10px] uppercase tracking-wide text-muted">Opportunity</p><p class="text-xl font-bold {oppTone(detail.opportunity_score)}">{detail.opportunity_score}/100</p></div>
        <div class="card p-3" title="Danger, noise & uncertainty."><p class="text-[10px] uppercase tracking-wide text-muted">Risk</p><p class="text-xl font-bold {riskTone(detail.risk_score)}">{detail.risk_score}/100</p></div>
      </div>

      <p class="mt-3 text-sm leading-relaxed text-soft">{detail.interpretation}</p>
      <p class="mt-2 text-xs text-muted">{whyAppeared(detail)}</p>

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
        <ul class="mt-1 space-y-0.5">{#each detail.risk_flags as f}<li class="flex cursor-help items-center gap-1 text-xs text-warn" title={flagTip(f)}><AlertTriangle class="h-3 w-3 shrink-0" />{f}</li>{/each}</ul>
      {/if}

      <!-- What to watch next -->
      <p class="mt-3 text-[11px] uppercase tracking-wide text-muted">What to watch next</p>
      <ul class="mt-1 space-y-0.5 text-xs text-soft">{#each whatToWatch(detail) as w}<li>• {w}</li>{/each}</ul>

      {#if detail.contract_address}
        <p class="mt-3 break-all text-[11px] text-muted">Contract: {detail.contract_address}</p>
      {/if}
      {#if detail.source_url}
        <a href={detail.source_url} target="_blank" rel="noopener" class="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">View source <ExternalLink class="h-3.5 w-3.5" /></a>
      {/if}

      <button class="mt-3 w-full cursor-not-allowed rounded-lg bg-panel-2 px-3 py-2 text-sm text-muted" disabled title="Watchlist & alerts arrive in Phase 2">+ Add to Early Watchlist (coming soon)</button>

      <div class="mt-3 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[11px] leading-relaxed text-muted">Research candidate only — not a buy signal. New / low-liquidity tokens are highly risky. Always do your own research.</div>
    {:else}
      <p class="text-sm text-muted">Candidate details unavailable.</p>
    {/if}
  </aside>
{/if}
