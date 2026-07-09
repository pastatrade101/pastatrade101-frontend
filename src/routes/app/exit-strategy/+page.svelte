<script lang="ts">
  import { Check, AlertTriangle, GitCompareArrows, Info, ArrowUpRight, ArrowDownRight, Lock, ChevronDown, Activity, Calculator } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import Gauge from '$lib/components/Gauge.svelte';
  import EChart from '$lib/components/EChart.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import AiInterpret from '$lib/components/AiInterpret.svelte';
  import AiLottie from '$lib/components/AiLottie.svelte';
  import AiLabel from '$lib/components/AiLabel.svelte';
  import { fmtUsd } from '$lib/format';

  const canExit = $derived(hasFeature($membership, 'access_exit_strategy'));
  const canSim = $derived(hasFeature($membership, 'access_exit_simulator'));
  // Mid plans get the current signal + a limited breakdown; the full strategy
  // tooling (ladder, history, profiles, Social Risk detail) is premium-only.
  const isPremium = $derived(!!$membership && ($membership.is_admin || $membership.plan === 'premium'));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result = $state<any>(null);
  interface HistPoint { date: string; exit_risk: number; btc_price: number | null; btc_risk: number | null; onchain_risk: number | null; social_risk: number | null }
  let history = $state<HistPoint[]>([]);
  let zones = $state<{ threshold: number; start: string; end: string; peak_risk: number; price_min: number | null; price_max: number | null; days: number }[]>([]);
  let profile = $state<'conservative' | 'balanced' | 'aggressive'>('balanced');
  let loading = $state(true);
  let error = $state('');
  let socialOpen = $state(false);

  const PROFILE_DESC: Record<string, string> = {
    conservative: 'Scales out earlier and gives more caution.',
    balanced: 'Default approach. Scales out gradually as multiple risk categories rise.',
    aggressive: 'Allows higher risk before reducing exposure.'
  };

  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);

  const zonePill = (s: number) => (s < 0.5 ? 'bg-mint/15 text-mint' : s < 0.75 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger');
  const zoneBar = (s: number) => (s < 0.5 ? 'bg-mint' : s < 0.75 ? 'bg-warn' : 'bg-danger');
  const confPill = (c: string) => (c === 'High' ? 'bg-mint/15 text-mint' : c === 'Low' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const scorePill = (s: number | null) => (s == null ? 'bg-edge text-muted' : s < 0.4 ? 'bg-mint/15 text-mint' : s < 0.6 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger');

  // Plain-language exit verdict — the decision, not the score (the 0–1 stays as proof).
  const exitVerdict = (s: number): { head: string; sub: string; color: string } => {
    if (s < 0.4) return { head: 'Not a take-profit zone yet', sub: 'Risk is low — no reason to sell into this.', color: 'text-mint' };
    if (s < 0.6) return { head: 'Getting closer, but not yet', sub: 'Risk is building — hold and watch, no rush to trim.', color: 'text-accent' };
    if (s < 0.75) return { head: 'Time to start trimming into strength', sub: 'Risk is elevated — taking some profit is reasonable.', color: 'text-warn' };
    return { head: 'Scale out — this is a high-risk zone', sub: 'Historically a distribution zone — prioritise protecting gains.', color: 'text-danger' };
  };
  const statusPill = (s: string) => (s === 'active' ? 'bg-mint/15 text-mint' : s === 'partial' ? 'bg-warn/15 text-warn' : 'bg-edge text-muted');
  const fmt2 = (n: number | null) => (n == null ? 'n/a' : n.toFixed(2));
  const pct100 = (n: number | null) => (n == null ? 'n/a' : `${Math.round(n)}/100`);

  // Signals for the AI interpretation — built from what the page already computes/shows.
  const scoreTone = (s: number) => (s < 0.4 ? 'good' : s < 0.6 ? 'neutral' : s < 0.75 ? 'warn' : 'danger');
  const confTone = (c: string) => (c === 'High' ? 'good' : c === 'Low' ? 'danger' : 'neutral');
  const aiSignals = $derived(
    result
      ? [
          { name: 'Exit risk score', label: exitVerdict(result.exit_risk_score).head, value: result.exit_risk_score.toFixed(2), tone: scoreTone(result.exit_risk_score) },
          { name: 'Strategy zone', label: result.strategy_label, value: result.exit_risk_percent, tone: scoreTone(result.exit_risk_score) },
          { name: 'Current action', label: result.current_action?.action ?? null, meaning: result.current_action?.reason ?? null, tone: scoreTone(result.exit_risk_score) },
          { name: 'Confidence', label: result.confidence, meaning: result.confidence_reason ?? null, tone: confTone(result.confidence) },
          ...(result.next_threshold
            ? [{ name: 'Next threshold', label: result.next_threshold.label, value: result.next_threshold.score?.toFixed(2) ?? null, meaning: result.next_threshold.meaning ?? null, tone: 'neutral' }]
            : []),
          ...(result.social?.label
            ? [{ name: 'Social risk', label: result.social.label, tone: result.social.status === 'active' ? 'warn' : 'neutral' }]
            : [])
        ]
      : []
  );

  const loadExit = async () => {
    result = await api(`/exit-strategy?profile=${profile}`, { auth: true });
  };

  // Wait until the membership/feature flags are actually known before deciding
  // whether to fetch or show the locked state — otherwise onMount races the
  // membership load (admins/premium users would flash "locked" then go blank).
  let started = $state(false);
  $effect(() => {
    if (!$membershipReady || started) return;
    started = true;
    if (!canExit) {
      loading = false;
      return;
    }
    void (async () => {
      try {
        await loadExit();
        if (isPremium) {
          try {
            const h = await api<{ series: HistPoint[]; zones: typeof zones }>('/exit-strategy/history', { auth: true });
            history = h.series ?? [];
            zones = h.zones ?? [];
          } catch {
            /* history optional */
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to load exit strategy.';
      } finally {
        loading = false;
      }
    })();
  });

  const changeProfile = async (p: typeof profile) => {
    profile = p;
    try {
      await loadExit();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load.';
    }
  };

  // ── History chart (toggleable series + 6 strategy zones + markers) ──
  const SERIES = [
    { key: 'exit', name: 'Exit risk', color: '#EF4444', axis: 0, width: 2.4, field: 'exit_risk' as const },
    { key: 'price', name: 'BTC price', color: '#37e0a6', axis: 1, width: 1.3, field: 'btc_price' as const },
    { key: 'btc', name: 'BTC risk', color: '#F59E0B', axis: 0, width: 1.4, field: 'btc_risk' as const },
    { key: 'onchain', name: 'On-chain risk', color: '#8B5CF6', axis: 0, width: 1.4, field: 'onchain_risk' as const },
    { key: 'social', name: 'Social risk', color: '#22D3EE', axis: 0, width: 1.4, field: 'social_risk' as const }
  ];
  let visible = $state<Record<string, boolean>>({ exit: true, price: true, btc: false, onchain: false, social: false });
  const toggleSeries = (k: string) => (visible[k] = !visible[k]);

  const ZONE_BANDS = [
    { lo: 0, hi: 0.3, color: 'rgba(34,197,94,0.08)', name: 'Accumulation' },
    { lo: 0.3, hi: 0.5, color: 'rgba(154,205,62,0.06)', name: 'Hold' },
    { lo: 0.5, hi: 0.65, color: 'rgba(255,170,66,0.06)', name: 'Reduce DCA' },
    { lo: 0.65, hi: 0.75, color: 'rgba(255,140,66,0.08)', name: 'Light profit-taking' },
    { lo: 0.75, hi: 0.85, color: 'rgba(239,99,68,0.09)', name: 'Scale-out' },
    { lo: 0.85, hi: 1, color: 'rgba(239,68,68,0.11)', name: 'Distribution' }
  ];

  const histOption = $derived.by(() => {
    if (!history.length) return {};
    const cur = result?.exit_risk_score ?? null;
    const next = result?.next_threshold?.score ?? null;
    const markArea = {
      silent: true,
      data: ZONE_BANDS.map((z) => [
        { yAxis: z.lo, itemStyle: { color: z.color }, label: { show: true, position: 'insideLeft' as const, color: '#6B7280', fontSize: 9, formatter: z.name } },
        { yAxis: z.hi }
      ])
    };
    const markLine = {
      silent: true,
      symbol: 'none',
      data: [
        cur != null ? { yAxis: cur, lineStyle: { color: '#EF4444', width: 1.4 }, label: { color: '#EF4444', fontSize: 9, formatter: `Current ${cur.toFixed(2)}` } } : null,
        next != null ? { yAxis: next, lineStyle: { color: '#9CA3AF', type: 'dashed' as const, width: 1 }, label: { color: '#9CA3AF', fontSize: 9, formatter: `Next ${next.toFixed(2)}` } } : null,
        { yAxis: 0.75, lineStyle: { color: '#F87171', type: 'dotted' as const, width: 1 }, label: { color: '#F87171', fontSize: 9, formatter: 'Major exit zone 0.75+' } }
      ].filter(Boolean)
    };

    const activeSeries = SERIES.filter((s) => visible[s.key]).map((s, idx) => ({
      name: s.name,
      type: 'line' as const,
      yAxisIndex: s.axis,
      showSymbol: false,
      smooth: true,
      z: s.key === 'exit' ? 5 : 3,
      itemStyle: { color: s.color },
      lineStyle: { width: s.width, color: s.color },
      data: history.filter((p) => p[s.field] != null).map((p) => [ts(p.date), p[s.field]]),
      ...(idx === 0 ? { markArea, markLine } : {})
    }));
    // Always render the zone bands even if no risk-series is first; attach to a hidden helper.
    const base = activeSeries.length ? activeSeries : [{ name: '', type: 'line' as const, yAxisIndex: 0, data: [], silent: true, markArea, markLine }];

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0E1117',
        borderColor: '#1F2937',
        textStyle: { color: '#F9FAFB', fontSize: 11 },
        formatter: (p: { axisValue: number; seriesName: string; value: [number, number] }[]) => {
          if (!p?.length) return '';
          const d = new Date(p[0].axisValue).toISOString().slice(0, 10);
          let h = `<b>${d}</b>`;
          for (const row of p) {
            const v = row.value?.[1];
            if (v == null) continue;
            if (row.seriesName === 'BTC price') h += `<br/>${row.seriesName}: $${Math.round(v).toLocaleString()}`;
            else if (row.seriesName) h += `<br/>${row.seriesName}: <b>${v.toFixed(3)}</b>`;
          }
          return h;
        }
      },
      grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: true },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' } },
      yAxis: [
        { type: 'value', name: 'Risk', min: 0, max: 1, position: 'left', nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#1F2937' } } },
        { type: 'log', name: 'BTC', position: 'right', nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF' }, splitLine: { show: false } }
      ],
      series: base
    };
  });
</script>

<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
  <div>
    <h1 class="text-xl font-semibold text-strong">Dynamic Exit Strategy</h1>
    <p class="text-sm text-muted">A risk-based framework for scaling out gradually as market risk rises — instead of trying to predict the exact top.</p>
  </div>
  {#if canSim}
    <a href="/app/exit-strategy/simulator" class="btn-ghost shrink-0 text-sm"><Calculator class="h-4 w-4" /> Portfolio Exit Simulator</a>
  {/if}
</header>

{#if loading}
  <p class="text-sm text-muted">Computing exit risk…</p>
{:else if !canExit}
  <LockedFeature
    title="Dynamic Exit Strategy is a premium feature"
    plan="Premium"
    bullets={['A single Exit Risk Score (0–1) from BTC risk, on-chain, Social Risk, altcoin breadth and cycle position', 'A clear current action: keep accumulating, hold, reduce DCA, take light profits, or scale out', 'Strategy zones + a configurable exit ladder, and Conservative / Balanced / Aggressive profiles', 'Historical exit-risk chart, past high-risk zones, and what would change the signal']}
  />
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if result}
  {@const r = result}
  {@const ev = exitVerdict(r.exit_risk_score)}
  <!-- Profile selector (premium) -->
  {#if isPremium}
    <div class="mb-4">
      <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
        {#each ['conservative', 'balanced', 'aggressive'] as p}
          <button class="px-3 py-1.5 font-medium capitalize transition-colors {profile === p ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => changeProfile(p as typeof profile)}>{p}</button>
        {/each}
      </div>
      <p class="mt-1.5 text-xs text-muted">{PROFILE_DESC[profile]}</p>
    </div>
  {/if}

  <!-- Current action — plain-language verdict first, then the exact action -->
  <div class="card mb-3 border-l-4 {r.exit_risk_score < 0.5 ? 'border-l-mint' : r.exit_risk_score < 0.75 ? 'border-l-warn' : 'border-l-danger'}">
    <div class="flex items-center gap-2">
      <Activity class="h-4 w-4 text-accent" />
      <p class="stat-label">Should I take profit?</p>
    </div>
    <p class="mt-1.5 text-xl font-bold leading-tight {ev.color}">{ev.head}</p>
    <p class="mt-1 text-sm text-soft">{ev.sub}</p>
    <p class="mt-2.5 flex items-start gap-2 rounded-lg border border-edge bg-panel-2/50 px-3 py-2 text-sm text-strong">
      <span class="mt-0.5 shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">Do</span>
      {r.current_action.action}
    </p>
    <p class="mt-1.5 text-xs text-muted"><span class="font-medium text-soft">Reason:</span> {r.current_action.reason}</p>
  </div>

  <!-- Hero -->
  <div class="hero-card mb-3 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
    <div class="mx-auto"><Gauge value={r.exit_risk_score} title="Exit Risk" /></div>
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-2xl font-bold text-strong">{r.exit_risk_score.toFixed(2)} <span class="text-base text-muted">/ {r.exit_risk_percent}</span></span>
        <span class="pill {zonePill(r.exit_risk_score)}">{r.strategy_label}</span>
        <span class="pill {confPill(r.confidence)}" title={r.confidence_reason}>{r.confidence} confidence</span>
      </div>
      <div class="meter mt-2 max-w-md"><div class="meter-fill {zoneBar(r.exit_risk_score)}" style="width: {r.exit_risk_percent}%"></div></div>
      <p class="mt-2 max-w-2xl text-sm leading-relaxed text-soft">{r.suggested_action}</p>
      <p class="mt-1.5 text-xs text-muted"><span class="font-medium text-soft">Exposure guidance:</span> {r.exposure_guidance}</p>
      {#if r.next_threshold}
        <p class="mt-1 text-xs text-muted">Next threshold: <span class="font-medium text-soft">{r.next_threshold.score.toFixed(2)} — {r.next_threshold.label}</span></p>
        <p class="mt-0.5 text-[11px] text-muted/80">{r.next_threshold.meaning}</p>
      {/if}
      <!-- Active weights -->
      <div class="mt-2 flex flex-wrap gap-1.5">
        {#each r.categories as c (c.key)}
          <span class="rounded-md border border-edge px-1.5 py-0.5 text-[10px] {c.available ? 'text-muted' : 'text-muted/50 line-through'}">{c.label.replace(' Risk', '')} {Math.round((c.active_weight ?? 0) * 100)}%</span>
        {/each}
      </div>
      <p class="mt-2 text-[11px] text-muted">{r.coverage_note}</p>
    </div>
  </div>

  <!-- AI interpretation — premium sees the button, free/mid see the locked teaser -->
  <div class="mb-4">
    <AiInterpret module="exit_strategy" title="Exit Strategy" signals={aiSignals} />
  </div>

  <!-- Category breakdown -->
  <div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
    {#each r.categories as c (c.key)}
      <div class="card {c.available ? '' : 'opacity-60'}">
        <div class="flex items-center justify-between gap-1">
          <span class="text-xs font-semibold text-strong">{c.label}</span>
          <span class="pill {scorePill(c.score)} text-[10px]">{c.score == null ? 'n/a' : c.score.toFixed(2)}</span>
        </div>
        {#if c.key === 'social' && r.social}
          <span class="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium {statusPill(r.social.status)}">{r.social.label}</span>
        {/if}
        <p class="mt-1.5 text-[11px] leading-relaxed text-muted">{c.meaning}</p>
        {#if c.key === 'social' && r.social}
          <p class="mt-1 text-[10px] text-muted/70">Sources: {r.social.sources_active.length ? r.social.sources_active.join(', ') : 'none'}</p>
          {#if r.social.sources_missing.length}<p class="text-[10px] text-muted/60">Missing: {r.social.sources_missing.join(', ')}</p>{/if}
          {#if isPremium}
            <button class="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-accent transition hover:text-accent/80" onclick={() => (socialOpen = !socialOpen)}>
              Details <ChevronDown class="h-3 w-3 transition {socialOpen ? 'rotate-180' : ''}" />
            </button>
          {/if}
        {:else}
          <p class="mt-1 text-[10px] text-muted/70">weight {Math.round((c.active_weight ?? 0) * 100)}%</p>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Social Risk detail drawer (premium) -->
  {#if isPremium && socialOpen && r.social}
    <div class="card mb-3 border-accent/30 bg-accent/5">
      <div class="flex items-center justify-between">
        <p class="stat-label text-accent">Social Risk detail</p>
        <span class="text-[11px] text-muted">{r.social.last_synced ? `Last synced ${r.social.last_synced}` : 'Not synced'}</span>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <div class="flex justify-between gap-2"><span class="text-muted">Fear &amp; Greed</span><span class="font-medium text-soft">{r.social.detail.fear_greed == null ? 'n/a' : r.social.detail.fear_greed}</span></div>
        <div class="flex justify-between gap-2"><span class="text-muted">Trends: Bitcoin</span><span class="font-medium text-soft">{pct100(r.social.detail.trends_bitcoin)}</span></div>
        <div class="flex justify-between gap-2"><span class="text-muted">Trends: BTC</span><span class="font-medium text-soft">{pct100(r.social.detail.trends_btc)}</span></div>
        <div class="flex justify-between gap-2"><span class="text-muted">Trends: Bitcoin price</span><span class="font-medium text-soft">{pct100(r.social.detail.trends_bitcoin_price)}</span></div>
        <div class="flex justify-between gap-2"><span class="text-muted">Wikipedia risk</span><span class="font-medium text-soft">{fmt2(r.social.detail.wikipedia_risk)}</span></div>
        <div class="flex justify-between gap-2"><span class="text-muted">YouTube attention</span><span class="font-medium text-soft">{fmt2(r.social.detail.youtube_attention)}</span></div>
        <div class="flex justify-between gap-2"><span class="text-muted">Combined Social Risk</span><span class="font-medium text-soft">{fmt2(r.categories.find((x: { key: string }) => x.key === 'social')?.score ?? null)}</span></div>
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-muted">{r.social.interpretation}</p>
    </div>
  {/if}

  <!-- What this means -->
  <div class="card mb-3">
    <AiLabel />
    <p class="mt-1 text-sm leading-relaxed text-soft">{r.interpretation}</p>
  </div>

  <!-- Confirmation + warnings -->
  <div class="mb-3 grid gap-3 md:grid-cols-2">
    <div class="card">
      <p class="stat-label text-mint">Confirmation needed for bigger exits</p>
      <ul class="mt-2 space-y-1 text-sm text-muted">
        {#each r.confirmation_needed as c}<li class="flex items-start gap-1.5"><Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" />{c}</li>{/each}
      </ul>
    </div>
    <div class="card">
      <p class="stat-label text-warn">Risk warnings</p>
      <ul class="mt-2 space-y-1 text-sm text-muted">
        {#each r.risk_warnings as w}<li class="flex items-start gap-1.5"><AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />{w}</li>{/each}
      </ul>
    </div>
  </div>

  {#if r.conflicts?.length}
    <div class="card mb-3 border border-accent/30 bg-accent/5">
      <p class="flex items-center gap-1.5 stat-label text-accent"><GitCompareArrows class="h-3.5 w-3.5" /> Signal conflict / confirmation · {r.confidence} confidence</p>
      <ul class="mt-2 space-y-1 text-sm text-soft">
        {#each r.conflicts as c}<li>• {c}</li>{/each}
      </ul>
      <p class="mt-1.5 text-[11px] text-muted">{r.confidence_reason}</p>
    </div>
  {/if}

  {#if isPremium}
    <!-- Exit ladder -->
    <div class="card mb-3">
      <h2 class="mb-1 text-sm font-semibold text-strong">Exit ladder · <span class="capitalize">{r.profile}</span></h2>
      <p class="mb-2 text-[11px] text-muted">Thresholds and suggested ranges are configurable by an admin — they are not fixed advice.</p>
      <div class="space-y-1.5">
        {#each r.ladder as step (step.risk)}
          <div class="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 {step.current ? 'border-accent/50 bg-accent/10' : step.reached ? 'border-edge bg-panel-2/40' : 'border-edge/60'}">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs {step.reached ? 'text-strong' : 'text-muted'}">{step.risk.toFixed(2)}</span>
              <span class="text-sm {step.reached ? 'text-strong' : 'text-muted'}">{step.action}</span>
              {#if step.current}<span class="pill bg-accent/20 text-[10px] text-accent">you are here</span>{/if}
            </div>
            {#if r.show_percentages && step.pct}<span class="text-xs font-medium {step.reached ? 'text-soft' : 'text-muted'}">{step.pct}</span>{/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- What would change the signal -->
    <div class="mb-3 grid gap-3 md:grid-cols-2">
      <div class="card">
        <p class="flex items-center gap-1.5 stat-label text-warn"><ArrowUpRight class="h-3.5 w-3.5" /> Signal would strengthen if</p>
        <ul class="mt-2 space-y-1 text-sm text-muted">
          {#each r.signal_changes.upgrade as u}<li class="flex items-start gap-1.5"><span class="mt-1 h-1 w-1 shrink-0 rounded-full bg-warn"></span>{u}</li>{/each}
        </ul>
      </div>
      <div class="card">
        <p class="flex items-center gap-1.5 stat-label text-mint"><ArrowDownRight class="h-3.5 w-3.5" /> Signal would weaken if</p>
        <ul class="mt-2 space-y-1 text-sm text-muted">
          {#each r.signal_changes.weaken as wk}<li class="flex items-start gap-1.5"><span class="mt-1 h-1 w-1 shrink-0 rounded-full bg-mint"></span>{wk}</li>{/each}
        </ul>
      </div>
    </div>

    <!-- History -->
    {#if history.length}
      <div class="card mb-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-strong">Exit risk vs BTC price — history</h2>
          <div class="flex flex-wrap gap-1.5">
            {#each SERIES as s}
              <button
                class="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition {visible[s.key] ? 'border-edge bg-panel-2 text-strong' : 'border-edge/60 text-muted hover:text-soft'}"
                onclick={() => toggleSeries(s.key)}
              >
                <span class="h-2 w-2 rounded-full" style="background:{visible[s.key] ? s.color : 'transparent'};border:1px solid {s.color}"></span>{s.name}
              </button>
            {/each}
          </div>
        </div>
        <EChart option={histOption} height={340} />
        <p class="mt-2 text-[11px] leading-relaxed text-muted">Red = Exit Risk Score. Green = BTC price. Toggle BTC / on-chain / Social Risk to see the components. Shaded zones show the model moving from accumulation → hold → reduce DCA → light profit-taking → scale-out → distribution risk. Altcoin breadth and cycle extension also feed the live score but aren't kept as dense daily history.</p>
      </div>
    {/if}

    <!-- Past zones -->
    {#if zones.length}
      <div class="card mb-3 overflow-x-auto p-0">
        <div class="border-b border-edge px-4 py-3"><h2 class="text-sm font-semibold text-strong">Past high exit-risk zones</h2></div>
        <table class="w-full min-w-[560px] text-sm">
          <thead>
            <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
              <th class="px-3 py-2">Threshold</th><th class="px-3 py-2">Period</th><th class="px-3 py-2">Peak risk</th><th class="px-3 py-2">BTC range</th><th class="px-3 py-2">Days</th>
            </tr>
          </thead>
          <tbody>
            {#each zones as z}
              <tr class="border-b border-edge/60 last:border-0">
                <td class="px-3 py-2"><span class="pill bg-danger/15 text-danger text-[10px]">≥ {z.threshold.toFixed(2)}</span></td>
                <td class="px-3 py-2 text-soft">{z.start} → {z.end}</td>
                <td class="px-3 py-2 text-muted">{z.peak_risk.toFixed(2)}</td>
                <td class="px-3 py-2 text-muted">{z.price_min != null ? `${fmtUsd(z.price_min, { compact: true })}–${fmtUsd(z.price_max ?? z.price_min, { compact: true })}` : '—'}</td>
                <td class="px-3 py-2 text-muted">{z.days}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else}
    <!-- Mid plan: invite to premium for the full tooling -->
    <div class="card mb-3 border-accent/30 bg-accent/5">
      <AiLottie size={44} class="mx-auto mb-2" />
      <p class="flex items-center gap-1.5 stat-label text-accent"><Lock class="h-3.5 w-3.5" /> Upgrade to Premium</p>
      <p class="mt-1 text-sm text-soft">You're seeing the current exit signal and a limited breakdown. Premium adds the configurable exit ladder, Conservative / Balanced / Aggressive profiles, the full Social Risk breakdown, “what would change the signal”, the historical exit-risk chart and past high-risk zones.</p>
      <a href="/pricing" class="btn-primary mt-3 inline-flex">See Premium</a>
    </div>
  {/if}

  <!-- Single disclaimer -->
  <div class="flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
    <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>{r.disclaimer}</span>
  </div>
{/if}
