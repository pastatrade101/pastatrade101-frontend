<script lang="ts">
  import { onMount } from 'svelte';
  import { Trash2, X, Bell, Plus } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { signalTone, tonePill } from '$lib/ecosystem-insight';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import { membership, hasFeature } from '$lib/stores/membership';

  // Watchlist alerts are a Mid+ feature (backend enforces on create too).
  const canAlerts = $derived(hasFeature($membership, 'access_alerts'));

  interface WatchItem {
    id: string;
    item_type: string;
    ref_id: string | null;
    created_at: string;
    name: string;
    score: number | null;
    score_when_added: number | null;
    score_change: number | null;
    signal: string;
    signal_when_added: string | null;
    previous_signal: string | null;
    confidence: 'High' | 'Medium' | 'Low';
    status: string;
    why_watching: string | null;
    user_note: string | null;
    what_changed: string;
    confirmation_needed: string[];
    risk_warnings: string[];
    auto_note: string | null;
    last_updated: string;
  }
  interface Summary {
    total: number;
    improving: number;
    confirmed: number;
    weakening: number;
    needsConfirmation: number;
    riskWarnings: number;
    neutral: number;
    highConfidence: number;
    mostImportantChange: string | null;
    takeaway: string;
  }
  interface AlertEvent {
    id: string;
    watchlist_item_id: string;
    triggered_at: string;
    message: string;
    value: string | null;
    is_read: boolean;
  }
  interface Watchlist {
    id: string;
    name: string;
    items: WatchItem[];
    summary: Summary;
    alert_events: AlertEvent[];
  }

  let watchlist = $state<Watchlist | null>(null);
  let ecosystems = $state<{ id: string; name: string }[]>([]);
  let selectedEco = $state('');
  let whyInput = $state('');
  let error = $state('');
  let addError = $state('');
  let loading = $state(true);
  let busy = $state(false);

  // Filters + sort
  let filter = $state<'all' | 'ecosystem' | 'improving' | 'weakening' | 'confirm' | 'confirmed' | 'risk'>('all');
  let confFilter = $state<'any' | 'High' | 'Medium' | 'Low'>('any');
  let sort = $state('recent');

  const load = async () => {
    const lists = await api<{ items: { id: string }[] }>('/watchlists', { auth: true });
    let id = lists.items[0]?.id;
    if (!id) {
      const created = await api<{ id: string }>('/watchlists', { method: 'POST', body: { name: 'My Watchlist' }, auth: true });
      id = created.id;
    }
    watchlist = await api<Watchlist>(`/watchlists/${id}`, { auth: true });
  };

  onMount(async () => {
    try {
      const [, ecoData] = await Promise.all([load(), api<{ items: { id: string; name: string }[] }>('/ecosystems/rankings')]);
      ecosystems = ecoData.items;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load watchlist.';
    } finally {
      loading = false;
    }
  });

  const addEcosystem = async () => {
    if (!selectedEco || !watchlist) return;
    busy = true;
    addError = '';
    try {
      await api(`/watchlists/${watchlist.id}/items`, {
        method: 'POST',
        body: { item_type: 'ecosystem', ref_id: selectedEco, why_watching: whyInput.trim() || undefined },
        auth: true
      });
      selectedEco = '';
      whyInput = '';
      await load();
    } catch (err) {
      // Plan-limit (403) returns a friendly upgrade message from the backend.
      addError = err instanceof Error ? err.message : 'Could not add item.';
    } finally {
      busy = false;
    }
  };

  const removeItem = async (itemId: string) => {
    if (!watchlist) return;
    await api(`/watchlists/${watchlist.id}/items/${itemId}`, { method: 'DELETE', auth: true });
    if (openId === itemId) openId = null;
    await load();
  };

  // ── Status presentation ─────────────────────────────────────────────────
  const statusPill = (s: string): string => {
    if (s === 'Confirmed strength') return 'bg-mint/15 text-mint';
    if (['Signal upgraded', 'Improving', 'Early recovery'].includes(s)) return 'bg-accent/15 text-accent';
    if (['Breakout watch', 'Needs confirmation', 'Weakening', 'Signal downgraded', 'Overextended'].includes(s)) return 'bg-warn/15 text-warn';
    if (['Risk warning', 'Still weak'].includes(s)) return 'bg-danger/15 text-danger';
    return 'bg-edge text-muted';
  };
  const confPill = (c: string): string => (c === 'High' ? 'text-mint' : c === 'Medium' ? 'text-warn' : 'text-muted');
  const typeLabel: Record<string, string> = { ecosystem: 'Ecosystem', coin: 'Coin', sector: 'Sector', pair: 'Alt/BTC', btc_risk: 'BTC Risk', altcoin_regime: 'Regime' };

  // ── Derived filtered + sorted list ──────────────────────────────────────
  const items = $derived(watchlist?.items ?? []);
  const inFilter = (it: WatchItem): boolean => {
    if (confFilter !== 'any' && it.confidence !== confFilter) return false;
    if (filter === 'ecosystem') return it.item_type === 'ecosystem';
    if (filter === 'improving') return ['Signal upgraded', 'Improving', 'Early recovery'].includes(it.status);
    if (filter === 'weakening') return ['Signal downgraded', 'Weakening'].includes(it.status);
    if (filter === 'confirm') return ['Needs confirmation', 'Breakout watch'].includes(it.status);
    if (filter === 'confirmed') return it.status === 'Confirmed strength';
    if (filter === 'risk') return ['Risk warning', 'Still weak'].includes(it.status) || it.risk_warnings.length > 0;
    return true;
  };
  const sorters: Record<string, (a: WatchItem, b: WatchItem) => number> = {
    recent: (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    score_desc: (a, b) => (b.score ?? -1) - (a.score ?? -1),
    score_asc: (a, b) => (a.score ?? 1e9) - (b.score ?? 1e9),
    improve: (a, b) => (b.score_change ?? -1e9) - (a.score_change ?? -1e9),
    decline: (a, b) => (a.score_change ?? 1e9) - (b.score_change ?? 1e9),
    confidence: (a, b) => ({ High: 3, Medium: 2, Low: 1 })[b.confidence] - ({ High: 3, Medium: 2, Low: 1 })[a.confidence]
  };
  const visible = $derived([...items].filter(inFilter).sort(sorters[sort]));

  const summaryTiles = $derived.by(() => {
    const s = watchlist?.summary;
    if (!s) return [] as { label: string; value: number; tone: string }[];
    return [
      { label: 'Tracked', value: s.total, tone: 'text-strong' },
      { label: 'Improving', value: s.improving, tone: 'text-accent' },
      { label: 'Confirmed', value: s.confirmed, tone: 'text-mint' },
      { label: 'Needs conf.', value: s.needsConfirmation, tone: 'text-warn' },
      { label: 'Weakening', value: s.weakening, tone: 'text-warn' },
      { label: 'Risk', value: s.riskWarnings, tone: 'text-danger' }
    ];
  });

  const filterChips: { id: typeof filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'ecosystem', label: 'Ecosystems' },
    { id: 'improving', label: 'Improving' },
    { id: 'confirm', label: 'Needs confirmation' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'weakening', label: 'Weakening' },
    { id: 'risk', label: 'Risk warning' }
  ];

  // ── Detail drawer ───────────────────────────────────────────────────────
  interface Detail {
    item: WatchItem;
    history: { snapshot_date: string; score: number | null; signal: string; status: string }[];
    alerts: { id: string; metric: string; operator: string; threshold: string; label: string | null }[];
    events: AlertEvent[];
  }
  let openId = $state<string | null>(null);
  let detail = $state<Detail | null>(null);
  let detailLoading = $state(false);
  let noteDraft = $state('');
  let whyDraft = $state('');

  // Alert builder
  let alMetric = $state('score');
  let alOperator = $state('>=');
  let alThreshold = $state('70');

  const openDetail = async (it: WatchItem) => {
    if (!watchlist) return;
    openId = it.id;
    detail = null;
    detailLoading = true;
    try {
      detail = await api<Detail>(`/watchlists/${watchlist.id}/items/${it.id}/detail`, { auth: true });
      noteDraft = detail.item.user_note ?? '';
      whyDraft = detail.item.why_watching ?? '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load details.';
    } finally {
      detailLoading = false;
    }
  };
  const closeDetail = () => {
    openId = null;
    detail = null;
  };

  const saveField = async (patch: Record<string, string>) => {
    if (!watchlist || !openId) return;
    await api(`/watchlists/${watchlist.id}/items/${openId}`, { method: 'PUT', body: patch, auth: true });
  };

  const onMetricChange = () => {
    if (alMetric === 'signal') {
      alOperator = 'changes_to';
      alThreshold = 'Improving';
    } else {
      alOperator = '>=';
      alThreshold = alMetric === 'score' ? '70' : '0';
    }
  };

  const addAlert = async () => {
    if (!watchlist || !openId) return;
    await api(`/watchlists/${watchlist.id}/items/${openId}/alerts`, {
      method: 'POST',
      body: { metric: alMetric, operator: alOperator, threshold: alThreshold },
      auth: true
    });
    const it = items.find((i) => i.id === openId);
    if (it) await openDetail(it);
  };
  const removeAlert = async (alertId: string) => {
    if (!watchlist || !openId) return;
    await api(`/watchlists/${watchlist.id}/items/${openId}/alerts/${alertId}`, { method: 'DELETE', auth: true });
    const it = items.find((i) => i.id === openId);
    if (it) await openDetail(it);
  };

  const metricLabel: Record<string, string> = {
    score: 'Score',
    signal: 'Signal',
    tvl_change_30d: 'TVL 30D %',
    dex_volume_change_7d: 'DEX vol 7D %',
    native_token_30d: 'Native 30D %'
  };
  const opLabel: Record<string, string> = { '>': 'above', '>=': 'at or above', '<': 'below', '<=': 'at or below', changes_to: 'changes to' };
  const signalChoices = ['Improving', 'Strong rotation', 'Selective strength', 'Neutral', 'Under pressure', 'Weak', 'Deteriorating'];
</script>

<header class="mb-4 flex flex-wrap items-end justify-between gap-2">
  <div>
    <h1 class="text-xl font-semibold text-strong">Premium Watchlist</h1>
    <p class="text-sm text-muted">Track ecosystems, coins and pairs with live strength signals, change tracking and confirmation alerts.</p>
  </div>
</header>

{#if loading}
  <div class="card text-center text-muted">Loading watchlist…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if watchlist}
  {@const s = watchlist.summary}

  <!-- Premium takeaway -->
  <section class="hero-card mb-4">
    <div class="flex items-start gap-3.5">
      <span class="icon-badge bg-accent/12 text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
          <path d="M12 3l1.9 4.7L18.5 9.6l-4.6 1.9L12 16l-1.9-4.5L5.5 9.6l4.6-1.9z" />
          <path d="M19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7z" />
        </svg>
      </span>
      <div class="min-w-0 flex-1">
        <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Premium Takeaway</span>
        <p class="mt-1 text-[15px] leading-relaxed text-body">{s.takeaway}</p>
        {#if s.mostImportantChange}
          <p class="mt-2 flex items-start gap-1.5 text-xs text-soft">
            <span class="mt-0.5 inline-flex h-4 items-center rounded bg-warn/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-warn">Key change</span>
            {s.mostImportantChange}
          </p>
        {/if}
      </div>
    </div>
  </section>

  <!-- Summary counts -->
  <div class="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
    {#each summaryTiles as t}
      <div class="stat-tile">
        <div class="text-2xl font-semibold {t.tone}">{t.value}</div>
        <div class="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{t.label}</div>
      </div>
    {/each}
  </div>

  <!-- Alert events banner -->
  {#if watchlist.alert_events.length}
    <div class="card mb-4 border-warn/30 bg-warn/5">
      <div class="mb-1 flex items-center gap-2 text-sm font-semibold text-warn"><Bell class="h-4 w-4" /> Recent alerts</div>
      <ul class="space-y-0.5 text-xs text-soft">
        {#each watchlist.alert_events.slice(0, 4) as ev}
          <li>• {ev.message} <span class="text-muted">· {new Date(ev.triggered_at).toLocaleDateString()}</span></li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Add item -->
  <div class="card mb-4 flex flex-wrap items-end gap-3">
    <div class="min-w-[180px] flex-1">
      <label class="stat-label" for="eco">Add an ecosystem</label>
      <select id="eco" class="input mt-1" bind:value={selectedEco}>
        <option value="">Select an ecosystem…</option>
        {#each ecosystems as eco}<option value={eco.id}>{eco.name}</option>{/each}
      </select>
    </div>
    <div class="min-w-[200px] flex-[2]">
      <label class="stat-label" for="why">Why watching (optional)</label>
      <input id="why" class="input mt-1" placeholder="Auto-generated if left blank" bind:value={whyInput} />
    </div>
    <button class="btn-primary" onclick={addEcosystem} disabled={!selectedEco || busy}>{busy ? 'Adding…' : 'Add'}</button>
  </div>

  {#if addError}
    <div class="card mb-4 flex flex-wrap items-center justify-between gap-2 border-warn/30 bg-warn/5 text-sm text-warn">
      <span>{addError}</span>
      <a href="/app/account" class="btn-primary px-3 py-1.5 text-xs">Upgrade</a>
    </div>
  {/if}

  {#if items.length === 0}
    <div class="card text-center text-muted">Your watchlist is empty. Add an ecosystem above to start tracking the thesis.</div>
  {:else}
    <!-- Filters + sort -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <div class="inline-flex flex-wrap overflow-hidden rounded-lg border border-edge">
        {#each filterChips as c}
          <button
            class="px-3 py-1.5 text-xs font-medium transition-colors {filter === c.id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}"
            onclick={() => (filter = c.id)}>{c.label}</button>
        {/each}
      </div>
      <select bind:value={confFilter} class="rounded-lg border border-edge bg-panel-2/40 px-2 py-1.5 text-xs text-soft">
        <option value="any">Any confidence</option>
        <option value="High">High confidence</option>
        <option value="Medium">Medium confidence</option>
        <option value="Low">Low confidence</option>
      </select>
      <select bind:value={sort} class="ml-auto rounded-lg border border-edge bg-panel-2/40 px-2 py-1.5 text-xs text-soft">
        <option value="recent">Recently added</option>
        <option value="score_desc">Highest score</option>
        <option value="score_asc">Lowest score</option>
        <option value="improve">Biggest improvement</option>
        <option value="decline">Biggest decline</option>
        <option value="confidence">Highest confidence</option>
      </select>
    </div>

    <!-- Item cards -->
    <ul class="space-y-2.5">
      {#each visible as it (it.id)}
        <li class="card rail-card" style={['Risk warning', 'Still weak'].includes(it.status) ? '--rail: var(--c-danger)' : it.status === 'Confirmed strength' ? '--rail: var(--c-mint)' : '--rail: var(--c-accent)'}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="pill bg-edge text-muted">{typeLabel[it.item_type] ?? it.item_type}</span>
                <span class="font-semibold text-strong">{it.name}</span>
                <span class="pill {tonePill(signalTone(it.signal as never))}">{it.signal}</span>
                <span class="pill {statusPill(it.status)}">{it.status}</span>
              </div>
              <p class="mt-2 text-sm leading-relaxed text-soft">{it.what_changed}</p>
              {#if it.risk_warnings.length}
                <p class="mt-1 text-xs text-danger">⚠ {it.risk_warnings[0]}</p>
              {/if}
            </div>
            <div class="text-right">
              <div class="text-2xl font-semibold text-strong">{it.score ?? '—'}</div>
              {#if it.score_change != null && it.score_change !== 0}
                <div class="text-xs font-medium {it.score_change >= 0 ? 'text-mint' : 'text-danger'}">{it.score_change >= 0 ? '+' : ''}{it.score_change} since added</div>
              {:else}
                <div class="text-xs text-muted">no change since added</div>
              {/if}
              <div class="mt-0.5 text-[11px] text-muted">Confidence <span class="font-medium {confPill(it.confidence)}">{it.confidence}</span></div>
            </div>
          </div>
          <div class="mt-3 flex items-center gap-2 border-t border-edge/50 pt-3">
            <button class="btn-ghost px-3 py-1.5 text-xs" onclick={() => openDetail(it)}>View details</button>
            <button class="btn-ghost px-3 py-1.5 text-xs" onclick={() => openDetail(it)}><Bell class="mr-1 h-3.5 w-3.5" /> Add alert</button>
            <button class="ml-auto text-muted hover:text-danger" onclick={() => removeItem(it.id)} aria-label="Remove"><Trash2 class="h-4 w-4" /></button>
          </div>
        </li>
      {/each}
      {#if visible.length === 0}
        <li class="card text-center text-muted">No items match the current filters.</li>
      {/if}
    </ul>
  {/if}

  <!-- Detail drawer -->
  {#if openId}
    <div class="fixed inset-0 z-40 bg-black/50" onclick={closeDetail} role="presentation"></div>
    <aside class="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-edge bg-panel p-5 shadow-2xl">
      {#if detailLoading || !detail}
        <div class="text-center text-muted">Loading…</div>
      {:else}
        {@const d = detail.item}
        <div class="mb-4 flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="pill bg-edge text-muted">{typeLabel[d.item_type] ?? d.item_type}</span>
              <h2 class="text-lg font-semibold text-strong">{d.name}</h2>
            </div>
            <div class="mt-1.5 flex items-center gap-2">
              <span class="pill {tonePill(signalTone(d.signal as never))}">{d.signal}</span>
              <span class="pill {statusPill(d.status)}">{d.status}</span>
            </div>
          </div>
          <button class="text-muted hover:text-strong" onclick={closeDetail} aria-label="Close"><X class="h-5 w-5" /></button>
        </div>

        <!-- Score breakdown -->
        <div class="mb-4 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-lg bg-panel-2/50 p-2.5">
            <div class="text-lg font-semibold text-muted">{d.score_when_added ?? '—'}</div>
            <div class="text-[11px] uppercase tracking-wide text-muted">When added</div>
          </div>
          <div class="rounded-lg bg-panel-2/50 p-2.5">
            <div class="text-lg font-semibold text-strong">{d.score ?? '—'}</div>
            <div class="text-[11px] uppercase tracking-wide text-muted">Now</div>
          </div>
          <div class="rounded-lg bg-panel-2/50 p-2.5">
            <div class="text-lg font-semibold {(d.score_change ?? 0) >= 0 ? 'text-mint' : 'text-danger'}">{d.score_change == null ? '—' : (d.score_change >= 0 ? '+' : '') + d.score_change}</div>
            <div class="text-[11px] uppercase tracking-wide text-muted">Change</div>
          </div>
        </div>
        <p class="mb-1 text-[11px] text-muted">Signal when added: <span class="text-soft">{d.signal_when_added ?? '—'}</span> · Confidence <span class={confPill(d.confidence)}>{d.confidence}</span></p>

        <!-- What changed -->
        <section class="mb-4">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">What changed</h3>
          <p class="text-sm leading-relaxed text-soft">{d.what_changed}</p>
          {#if d.auto_note}<p class="mt-1 text-xs italic text-muted">Auto note: {d.auto_note}</p>{/if}
        </section>

        <!-- History -->
        {#if detail.history.filter((h) => h.score != null).length >= 2}
          <section class="mb-4">
            <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Score history</h3>
            <Sparkline points={detail.history.map((h) => Number(h.score)).filter(Number.isFinite)} height={56} />
          </section>
        {/if}

        <!-- Confirmation needed -->
        <section class="mb-4">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Confirmation needed</h3>
          {#if d.confirmation_needed.length}
            <ul class="space-y-1 text-sm text-soft">
              {#each d.confirmation_needed as c}<li class="flex gap-2"><span class="text-warn">○</span> {c}</li>{/each}
            </ul>
          {:else}
            <p class="text-sm text-mint">✓ Fully confirmed — all key metrics are positive.</p>
          {/if}
        </section>

        <!-- Risk warnings -->
        <section class="mb-4">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Risk warnings</h3>
          {#if d.risk_warnings.length}
            <ul class="space-y-1 text-sm text-danger">
              {#each d.risk_warnings as r}<li class="flex gap-2"><span>⚠</span> {r}</li>{/each}
            </ul>
          {:else}
            <p class="text-sm text-muted">No active risk warnings.</p>
          {/if}
        </section>

        <!-- Why watching -->
        <section class="mb-4">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Why watching</h3>
          <textarea class="input min-h-[60px]" bind:value={whyDraft}></textarea>
          <button class="btn-ghost mt-1.5 px-3 py-1 text-xs" onclick={() => saveField({ why_watching: whyDraft })}>Save reason</button>
        </section>

        <!-- User note -->
        <section class="mb-4">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">My note</h3>
          <textarea class="input min-h-[60px]" placeholder="e.g. Only add if it reclaims MA200…" bind:value={noteDraft}></textarea>
          <button class="btn-ghost mt-1.5 px-3 py-1 text-xs" onclick={() => saveField({ user_note: noteDraft })}>Save note</button>
        </section>

        <!-- Alerts -->
        <section class="mb-2">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Alerts</h3>
          {#if detail.alerts.length}
            <ul class="mb-2 space-y-1">
              {#each detail.alerts as a}
                <li class="flex items-center justify-between rounded-lg bg-panel-2/50 px-2.5 py-1.5 text-xs text-soft">
                  <span>{metricLabel[a.metric] ?? a.metric} {opLabel[a.operator] ?? a.operator} <span class="font-medium text-strong">{a.threshold}</span></span>
                  <button class="text-muted hover:text-danger" onclick={() => removeAlert(a.id)} aria-label="Delete alert"><Trash2 class="h-3.5 w-3.5" /></button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if canAlerts}
            <div class="rounded-lg border border-edge p-2.5">
              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <select bind:value={alMetric} onchange={onMetricChange} class="rounded border border-edge bg-panel-2/40 px-1.5 py-1 text-soft">
                  {#each Object.entries(metricLabel) as [v, l]}<option value={v}>{l}</option>{/each}
                </select>
                {#if alMetric === 'signal'}
                  <span class="text-muted">changes to</span>
                  <select bind:value={alThreshold} class="rounded border border-edge bg-panel-2/40 px-1.5 py-1 text-soft">
                    {#each signalChoices as sc}<option value={sc}>{sc}</option>{/each}
                  </select>
                {:else}
                  <select bind:value={alOperator} class="rounded border border-edge bg-panel-2/40 px-1.5 py-1 text-soft">
                    <option value=">">above</option>
                    <option value=">=">at or above</option>
                    <option value="<">below</option>
                    <option value="<=">at or below</option>
                  </select>
                  <input bind:value={alThreshold} class="w-16 rounded border border-edge bg-panel-2/40 px-1.5 py-1 text-soft" />
                {/if}
                <button class="btn-primary ml-auto px-2.5 py-1 text-xs" onclick={addAlert}><Plus class="mr-1 h-3.5 w-3.5" /> Add</button>
              </div>
            </div>
          {:else}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-2 text-xs text-soft">
              <span>Alerts are a Mid &amp; Premium feature.</span>
              <a href="/app/account" class="btn-primary px-2.5 py-1 text-[11px]">Upgrade</a>
            </div>
          {/if}
          {#if detail.events.length}
            <div class="mt-3">
              <h4 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Fired</h4>
              <ul class="space-y-0.5 text-xs text-soft">
                {#each detail.events.slice(0, 5) as ev}<li>• {ev.message} <span class="text-muted">· {new Date(ev.triggered_at).toLocaleDateString()}</span></li>{/each}
              </ul>
            </div>
          {/if}
        </section>
      {/if}
    </aside>
  {/if}
{/if}
