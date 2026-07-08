<script lang="ts">
  import { Activity, Info, Search, X, AlertTriangle, ArrowRight } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import EChart from '$lib/components/EChart.svelte';

  const canUse = $derived(hasFeature($membership, 'access_alt_btc_bottom_radar'));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let started = $state(false);

  let tab = $state('all');
  let sort = $state('bottom');
  let search = $state('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let detail = $state<any>(null);
  let drawerLoading = $state(false);

  const qs = () => new URLSearchParams({ ...(tab !== 'all' ? { tab } : {}), sort, ...(search ? { search } : {}) }).toString();
  const load = async () => {
    loading = true;
    error = '';
    try {
      data = await api(`/alt-btc-bottom-radar?${qs()}`, { auth: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load the radar.';
    } finally {
      loading = false;
    }
  };
  $effect(() => {
    if (!$membershipReady || started) return;
    started = true;
    if (!canUse) {
      loading = false;
      return;
    }
    void load();
  });
  $effect(() => {
    void tab;
    void sort;
    if (started && canUse) void load();
  });

  const openDetail = async (coinId: string) => {
    drawerLoading = true;
    detail = { coin_id: coinId };
    try {
      detail = await api(`/alt-btc-bottom-radar/coins/${coinId}`, { auth: true });
    } catch {
      detail = null;
    } finally {
      drawerLoading = false;
    }
  };

  // ── formatting ──
  const pct = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)}%`);
  const pctTone = (n: number | null | undefined) => (n == null ? 'text-muted' : n > 0 ? 'text-mint' : 'text-danger');
  const scoreTone = (s: number) => (s >= 71 ? 'text-mint' : s >= 56 ? 'text-mint/90' : s >= 41 ? 'text-accent' : s >= 21 ? 'text-warn' : 'text-danger');
  const scoreBar = (s: number) => (s >= 56 ? 'bg-mint' : s >= 41 ? 'bg-accent' : s >= 21 ? 'bg-warn' : 'bg-danger');
  const invTone = (s: number) => (s <= 25 ? 'text-mint' : s <= 45 ? 'text-accent' : s <= 65 ? 'text-warn' : 'text-danger');

  // Plain-language rotation verdict from the summary counts (counts stay as proof).
  const textTone = (t: string) => (t === 'good' ? 'text-mint' : t === 'warn' ? 'text-danger' : 'text-accent');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bottomVerdict = $derived.by(() => {
    const s = data?.summary;
    if (!s) return null;
    const conf = s.confirmed_strength ?? 0;
    const early = s.early_recoveries ?? 0;
    const bleed = s.still_bleeding ?? 0;
    const bottom = s.bottoming_attempts ?? 0;
    if (conf + early >= 3 && conf + early >= bleed)
      return { head: 'Altcoins are starting to recover against Bitcoin', sub: `${conf} confirmed and ${early} in early recovery — rotation is building.`, action: 'Focus on coins that have confirmed strength, not just a bounce.', tone: 'good' };
    if (bleed > conf + early + bottom)
      return { head: 'Altcoins are still bleeding against Bitcoin', sub: `${bleed} still weak vs ${conf + early} recovering — most alts underperform BTC.`, action: 'Be patient — holding Bitcoin may still be the stronger position.', tone: 'warn' };
    return { head: 'Altcoins are trying to bottom vs Bitcoin', sub: `${bottom} attempting a bottom, ${early} early recovery — early and unconfirmed.`, action: 'Wait for confirmed higher lows before treating any as a leader.', tone: 'neutral' };
  });
  const statusPill = (s: string) => {
    if (/leader|confirmed/i.test(s)) return 'bg-mint/15 text-mint';
    if (/early recovery/i.test(s)) return 'bg-accent/15 text-accent';
    if (/bottoming/i.test(s)) return 'bg-warn/15 text-warn';
    if (/failed/i.test(s)) return 'bg-danger/15 text-danger';
    return 'bg-panel-2 text-muted';
  };
  const invLabel = (s: number) => (s <= 25 ? 'Low' : s <= 45 ? 'Moderate' : s <= 65 ? 'High' : 'Very high');
  const domTone = (d: string) => (d === 'falling' ? 'text-mint' : d === 'rising' ? 'text-warn' : 'text-soft');
  const confPill = (c: string) => (c === 'High' ? 'bg-mint/15 text-mint' : c === 'Low' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const ago = (iso: string | null) => {
    if (!iso) return 'never';
    const days = Math.round((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86400000);
    return days <= 0 ? 'today' : `${days}d ago`;
  };

  // Invalidation explanation (what would break the setup), by status.
  const invalidationLine = (status: string): string => {
    if (/leader/i.test(status)) return 'Loses MA50 and 30D ALT/BTC strength turns negative.';
    if (/confirmed/i.test(status)) return 'Loses MA50 or fails to hold the higher low.';
    if (/early recovery/i.test(status)) return 'Loses MA50 or breaks below the recent higher low.';
    if (/bottoming/i.test(status)) return 'Breaks below the recent ALT/BTC low.';
    if (/failed/i.test(status)) return 'Returns to a new BTC-pair low.';
    return 'Keeps making new ALT/BTC lows (no recovery yet).';
  };

  // "Why this score?" — positives/negatives from existing fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whyPos = (c: any): string[] => {
    const out: string[] = [];
    if (c.above_ma50) out.push('ALT/BTC above MA50');
    else if (c.above_ma20) out.push('ALT/BTC reclaimed MA20');
    if ((c.alt_btc_return_30d ?? 0) > 0) out.push(`30D ALT/BTC positive (${pct(c.alt_btc_return_30d)})`);
    if (c.structure_label === 'higher_low') out.push('Higher low confirmed');
    if ((c.distance_from_180d_low ?? 0) > 0.05) out.push(`Off the 180D low (${pct(c.distance_from_180d_low)})`);
    if (c.confidence === 'High') out.push('High data/liquidity confidence');
    return out;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whyNeg = (c: any): string[] => {
    const out: string[] = [];
    if (!c.above_ma200) out.push('Still below MA200');
    if (!c.above_ma50) out.push('Still below MA50');
    if ((c.alt_btc_return_30d ?? 0) <= 0) out.push(`30D ALT/BTC weak (${pct(c.alt_btc_return_30d)})`);
    if (c.structure_label === 'lower_low') out.push('Still making lower lows');
    if (c.invalidation_risk_score >= 46) out.push(`Invalidation risk ${invLabel(c.invalidation_risk_score).toLowerCase()}`);
    return out;
  };

  // expandable "why this score" per card
  let openWhy = $state<Record<string, boolean>>({});
  const toggleWhy = (id: string) => (openWhy = { ...openWhy, [id]: !openWhy[id] });

  const STAGES = ['Still Bleeding', 'Bottoming Attempt', 'Early Recovery', 'Confirmed Recovery', 'Relative Strength Leader'];

  const TABS = [
    { id: 'all', label: 'All' },
    { id: 'bottoming', label: 'Bottoming Attempts' },
    { id: 'early_recovery', label: 'Early Recovery' },
    { id: 'confirmed', label: 'Confirmed Recovery' },
    { id: 'still_bleeding', label: 'Still Bleeding' },
    { id: 'failed', label: 'Failed Recovery' }
  ];

  const chartOption = $derived.by(() => {
    const c = detail?.chart;
    if (!c || !c.dates?.length) return null;
    const line = (name: string, dataArr: (number | null)[], color: string, width = 1.5, dashed = false) => ({ name, type: 'line', data: dataArr, smooth: true, symbol: 'none', connectNulls: true, lineStyle: { color, width, type: dashed ? 'dashed' : 'solid' } });
    return {
      grid: { left: 52, right: 14, top: 24, bottom: 24 },
      legend: { top: 0, textStyle: { color: '#7d8590', fontSize: 9 }, itemWidth: 14, itemHeight: 8 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: c.dates, axisLabel: { color: '#7d8590', fontSize: 9, showMaxLabel: true }, axisLine: { lineStyle: { color: '#30363d' } } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: '#7d8590', fontSize: 9, formatter: (v: number) => v.toExponential(1) }, splitLine: { lineStyle: { color: 'rgba(48,54,61,0.4)' } } },
      series: [
        line('ALT/BTC', c.ratio, '#F9FAFB', 2),
        line('MA20', c.ma20, '#37E0A6'),
        line('MA50', c.ma50, '#5B8CFF'),
        line('MA100', c.ma100, '#F59E0B'),
        line('MA200', c.ma200, '#94A3B8', 1.5, true)
      ]
    };
  });
</script>

<header class="mb-4 flex items-start gap-2">
  <Activity class="mt-0.5 h-5 w-5 text-accent" />
  <div class="min-w-0">
    <h1 class="text-xl font-semibold text-strong">Alt/BTC Bottom Radar</h1>
    <p class="text-sm text-muted">Track which top altcoins may have stopped bleeding against Bitcoin and are beginning to rotate back into strength.</p>
  </div>
</header>

{#if !$membershipReady}
  <p class="text-sm text-muted">Loading…</p>
{:else if !canUse}
  <div class="space-y-4">
    <LockedFeature
      title="Alt/BTC Bottom Radar is a Mid & Premium feature"
      plan="Mid"
      bullets={['See which altcoins are bottoming or recovering against BTC — not just in USD', 'Bottom Score, recovery confirmation and invalidation risk on every BTC pair', 'Top-100 ALT/BTC breadth and rotation-wave read for alt-season timing']}
    />
    <div class="card">
      <p class="stat-label">What this module does</p>
      <p class="mt-1 text-sm leading-relaxed text-soft">Altcoins rarely pump together — capital rotates in waves. Many alts first bleed against Bitcoin, then form a bottom on their ALT/BTC ratio, then start outperforming BTC. This radar reads the ALT/BTC ratio (not USD) to flag which coins may have <strong>stopped bleeding</strong> and are beginning to recover. These are <strong>research signals, not buy signals</strong>.</p>
    </div>
  </div>
{:else}
  {#if loading && !data}
    <p class="text-sm text-muted">Reading ALT/BTC ratios…</p>
  {:else if error}
    <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
  {:else if data && !data.available}
    <div class="card border-warn/30 bg-warn/5"><p class="stat-label text-warn">Not synced yet</p><p class="mt-1 text-sm text-soft">{data.takeaway}</p></div>
  {:else if data}
    <!-- Verdict first, then the radar takeaway as proof -->
    <div class="hero-card mb-3">
      {#if bottomVerdict}
        <p class="text-[11px] font-semibold uppercase tracking-wide text-muted">The rotation read</p>
        <p class="mt-0.5 text-xl font-bold leading-tight {textTone(bottomVerdict.tone)}">{bottomVerdict.head}</p>
        <p class="mt-1 text-sm text-soft">{bottomVerdict.sub}</p>
        <p class="mt-2.5 flex items-start gap-2 rounded-lg border border-edge bg-panel-2/50 px-3 py-2 text-sm text-strong">
          <span class="mt-0.5 shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">Do</span>
          {bottomVerdict.action}
        </p>
        <div class="mt-3 border-t border-edge/60 pt-3">
          <p class="stat-label text-accent">Radar takeaway</p>
          <p class="mt-1 text-sm leading-relaxed text-soft">{data.takeaway}</p>
        </div>
      {:else}
        <p class="stat-label text-accent">Radar takeaway</p>
        <p class="mt-1 text-sm leading-relaxed text-soft">{data.takeaway}</p>
      {/if}
    </div>

    <!-- Stage progression guide -->
    <div class="mb-3 card p-3">
      <div class="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
        {#each STAGES as st, i}
          <span class="rounded px-2 py-0.5 {i === 0 ? 'bg-danger/12 text-danger' : i === 1 ? 'bg-warn/12 text-warn' : i === 2 ? 'bg-accent/12 text-accent' : 'bg-mint/12 text-mint'}">{st}</span>
          {#if i < STAGES.length - 1}<span class="text-muted">→</span>{/if}
        {/each}
      </div>
      <p class="mt-2 text-xs text-muted">Altcoins usually rotate in stages. The radar tracks whether a coin is still bleeding against BTC, attempting to bottom, recovering, or already leading.</p>
    </div>

    <!-- Market context + rotation wave -->
    <div class="mb-3 grid gap-3 lg:grid-cols-[1fr_auto]">
      <div class="card flex flex-wrap items-center gap-x-5 gap-y-1.5 p-3 text-sm">
        <span class="text-muted">BTC dominance: <span class="font-medium {domTone(data.market_context.btc_dominance)}">{data.market_context.btc_dominance}</span></span>
        <span class="text-muted">Altcoin breadth: <span class="font-medium text-soft">{data.market_context.altcoin_breadth}</span></span>
        {#if data.market_context.btc_risk != null}<span class="text-muted">BTC risk: <span class="font-medium text-soft">{data.market_context.btc_risk.toFixed(2)}</span></span>{/if}
        <span class="text-[11px] text-muted">· updated {ago(data.as_of)}</span>
      </div>
      {#if data.breadth}
        <div class="card p-3">
          <p class="text-[11px] uppercase tracking-wide text-accent">{data.breadth.rotation_wave_label}</p>
          <p class="mt-0.5 text-xs text-muted">{data.breadth.above_ma50_percent}% above ALT/BTC MA50 · {data.breadth.higher_low_percent}% higher lows · {data.breadth.breadth_label ?? ''}</p>
        </div>
      {/if}
    </div>

    <!-- Summary cards -->
    <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {#each [['Bottoming', data.summary.bottoming_attempts], ['Early recovery', data.summary.early_recoveries], ['Confirmed', data.summary.confirmed_strength], ['Still bleeding', data.summary.still_bleeding], ['Strongest', data.summary.strongest_recovery ?? '—'], ['Top inval. risk', data.summary.highest_invalidation_risk ?? '—']] as [label, value]}
        <div class="card p-3"><p class="text-[11px] uppercase tracking-wide text-muted">{label}</p><p class="truncate text-lg font-bold text-strong">{value}</p></div>
      {/each}
    </div>

    <!-- Recovery score note -->
    <div class="mb-3 flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
      <Info class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <span>The <span class="text-soft">Alt/BTC Recovery Score</span> measures whether a coin is stabilizing or improving against BTC (the ALT/BTC ratio, not USD). A low ALT/BTC ratio alone is not enough — the radar separates <span class="text-soft">cheap but still bleeding</span> from <span class="text-soft">bottoming and improving</span>. Always check the invalidation risk.</span>
    </div>

    <!-- Best setups + Weakest -->
    <div class="mb-3 grid gap-3 lg:grid-cols-2">
      {#if data.best_setups?.length}
        <div class="card p-3">
          <p class="stat-label mb-1.5 text-mint">Best setups today <span class="font-normal text-muted">· research candidates</span></p>
          {#each data.best_setups as b}
            <button class="flex w-full items-center justify-between border-b border-edge/40 py-1.5 text-left text-sm last:border-0" onclick={() => openDetail(b.coin_id)}>
              <span class="font-medium text-soft">{b.symbol}/BTC <span class="text-xs text-muted">· {b.note}</span></span>
              <span class="text-xs"><span class="rounded px-1.5 py-0.5 {statusPill(b.status)}">{b.status}</span> <span class={scoreTone(b.score)}>{b.score}</span></span>
            </button>
          {/each}
        </div>
      {/if}
      {#if data.weakest?.length}
        <div class="card p-3">
          <p class="stat-label mb-1.5 text-danger">Weakest vs BTC <span class="font-normal text-muted">· avoid chasing</span></p>
          {#each data.weakest as w}
            <button class="flex w-full items-center justify-between border-b border-edge/40 py-1.5 text-left text-sm last:border-0" onclick={() => openDetail(w.coin_id)}>
              <span class="font-medium text-soft">{w.symbol}/BTC</span>
              <span class="text-xs"><span class="rounded px-1.5 py-0.5 {statusPill(w.status)}">{w.status}</span> <span class={scoreTone(w.score)}>{w.score}</span></span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- How to use -->
    <details class="card mb-3">
      <summary class="cursor-pointer text-sm font-medium text-soft">How to use Alt/BTC Bottom Radar</summary>
      <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Look for coins moving from <span class="text-soft">Still Bleeding → Bottoming Attempt → Early Recovery</span>.</li>
        <li>A low ALT/BTC ratio alone is not enough — stronger setups show <span class="text-soft">improving ALT/BTC returns, reclaimed moving averages and higher lows</span>.</li>
        <li>Always check the <span class="text-soft">invalidation risk</span> before acting.</li>
        <li>Use this with BTC dominance, BTC risk, liquidity and the broader market regime.</li>
        <li>These are <span class="text-soft">relative-strength research signals, not buy signals</span>.</li>
      </ul>
    </details>

    <!-- Tabs -->
    <div class="mb-2 flex flex-wrap gap-1.5">
      {#each TABS as t}
        <button class="rounded-lg px-3 py-1.5 text-sm transition {tab === t.id ? 'bg-accent/15 text-accent' : 'bg-panel-2 text-muted hover:text-soft'}" onclick={() => (tab = t.id)}>{t.label}</button>
      {/each}
    </div>

    <!-- Filters -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <select bind:value={sort} class="input-sm">
        <option value="bottom">Bottom Score</option>
        <option value="confirmation">Recovery confirmation</option>
        <option value="drawdown">Drawdown from BTC-pair high</option>
        <option value="distance_low">Distance from BTC-pair low</option>
        <option value="ret30">30D ALT/BTC strength</option>
        <option value="ret90">90D ALT/BTC strength</option>
        <option value="invalidation">Invalidation risk</option>
        <option value="rank">Market cap rank</option>
      </select>
      <div class="relative">
        <Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} placeholder="Search coin…" class="input-sm pl-7" />
      </div>
      {#if loading}<span class="text-xs text-muted">updating…</span>{/if}
    </div>

    <!-- Candidate cards -->
    {#if !data.candidates.length}
      <div class="card text-center text-sm text-muted">No coins in this tab right now. Try <span class="text-soft">All</span> or a different sort.</div>
    {:else}
      <div class="grid gap-2 lg:grid-cols-2">
        {#each data.candidates as c}
          <div class="card p-3 transition hover:border-accent/40">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-semibold text-strong">{c.symbol}/BTC <span class="text-xs font-normal text-muted">#{c.market_cap_rank ?? '—'}</span></p>
                <div class="mt-0.5 flex flex-wrap items-center gap-1">
                  <span class="rounded px-1.5 py-0.5 text-[10px] {statusPill(c.status_label)}">{c.status_label}</span>
                  {#if c.confidence}<span class="rounded px-1.5 py-0.5 text-[10px] {confPill(c.confidence)}" title="Signal confidence">{c.confidence} conf.</span>{/if}
                </div>
              </div>
              <div class="shrink-0 text-right">
                <p class="text-[10px] uppercase tracking-wide text-muted">Recovery</p>
                <p class="text-xl font-bold {scoreTone(c.bottom_score)}">{c.bottom_score}<span class="text-xs text-muted">/100</span></p>
              </div>
            </div>

            <div class="meter mt-1.5"><div class="meter-fill {scoreBar(c.bottom_score)}" style="width:{c.bottom_score}%"></div></div>

            <div class="mt-2 flex flex-wrap gap-3 text-xs text-muted">
              <span>30D ALT/BTC <span class={pctTone(c.alt_btc_return_30d)}>{pct(c.alt_btc_return_30d)}</span></span>
              <span>DD 365D <span class="text-soft">{pct(c.drawdown_from_365d_high)}</span></span>
              <span>off 180D low <span class="text-soft">{pct(c.distance_from_180d_low)}</span></span>
              <span title="Invalidation risk">inval. <span class={invTone(c.invalidation_risk_score)}>{invLabel(c.invalidation_risk_score)}</span></span>
            </div>

            <p class="mt-2 text-xs leading-relaxed text-soft">{c.key_reason}</p>
            {#if c.what_to_watch_next?.length}<p class="mt-1 text-[11px] text-muted">Watch next: {c.what_to_watch_next[0]}</p>{/if}
            <p class="mt-1 text-[11px] text-warn">Invalidation: {invalidationLine(c.status_label)}</p>

            <!-- Why this score? -->
            <button class="mt-2 text-[11px] text-accent hover:underline" onclick={() => toggleWhy(c.coin_id)}>{openWhy[c.coin_id] ? 'Hide' : 'Why this score?'}</button>
            {#if openWhy[c.coin_id]}
              <div class="mt-1 grid gap-2 rounded-lg bg-panel-2 p-2 text-[11px] sm:grid-cols-2">
                <div>
                  <p class="mb-0.5 font-medium text-mint">Supports recovery</p>
                  {#each whyPos(c) as p}<p class="text-muted">+ {p}</p>{:else}<p class="text-muted">Limited positive signals.</p>{/each}
                </div>
                <div>
                  <p class="mb-0.5 font-medium text-warn">Holding it back</p>
                  {#each whyNeg(c) as nx}<p class="text-muted">− {nx}</p>{:else}<p class="text-muted">No major drags.</p>{/each}
                </div>
              </div>
            {/if}

            <div class="mt-2 flex items-center gap-2 border-t border-edge/50 pt-2">
              <button class="rounded-lg bg-accent/15 px-2.5 py-1 text-xs text-accent transition hover:bg-accent/25" onclick={() => openDetail(c.coin_id)}>View chart</button>
              <button class="cursor-not-allowed rounded-lg bg-panel-2 px-2.5 py-1 text-xs text-muted" disabled title="Coming in Phase 2">+ Watchlist</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Breadth detail -->
    {#if data.breadth}
      <div class="card mt-4">
        <p class="stat-label mb-2">Top-{data.breadth.universe_size} ALT/BTC breadth</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          <div><span class="text-muted">Above MA20:</span> <span class="text-soft">{data.breadth.above_ma20_percent}%</span></div>
          <div><span class="text-muted">Above MA50:</span> <span class="text-soft">{data.breadth.above_ma50_percent}%</span></div>
          <div><span class="text-muted">Above MA200:</span> <span class="text-soft">{data.breadth.above_ma200_percent}%</span></div>
          <div><span class="text-muted">Positive 30D:</span> <span class="text-soft">{data.breadth.positive_30d_percent}%</span></div>
          <div><span class="text-muted">Higher lows:</span> <span class="text-soft">{data.breadth.higher_low_percent}%</span></div>
          <div><span class="text-muted">Confirmed:</span> <span class="text-soft">{data.breadth.confirmed_strength_count + data.breadth.leadership_count}</span></div>
        </div>
      </div>
    {/if}

    <!-- Recovery by sector (only when category data is available) -->
    {#if data.by_sector?.length}
      <div class="card mt-3">
        <p class="stat-label mb-2">Recovery by sector</p>
        {#each data.by_sector as s}
          <div class="flex items-center justify-between border-b border-edge/40 py-1.5 text-sm last:border-0">
            <span class="text-soft">{s.sector}</span>
            <span class="text-xs text-muted">{s.confirmed} confirmed · {s.early} early · {s.bottoming} bottoming · avg {s.avg_score} · top {s.top_symbol ?? '—'}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Disclaimer -->
    <div class="mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs leading-relaxed text-muted">
      <Info class="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
      <span>Alt/BTC Bottom Radar is a relative-strength research tool. It identifies conditions where an altcoin may be stabilizing against BTC, but it does not predict price appreciation or guarantee a bottom is complete. Use it with liquidity, BTC risk, market regime and your own risk management.</span>
    </div>
  {/if}
{/if}

<!-- Detail drawer -->
{#if detail}
  <button class="fixed inset-0 z-40 bg-black/60" aria-label="Close" onclick={() => (detail = null)}></button>
  <aside class="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-edge bg-panel p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-strong">{detail.symbol ? `${detail.symbol}/BTC` : 'Coin'}</h2>
      <button aria-label="Close" onclick={() => (detail = null)}><X class="h-5 w-5 text-muted" /></button>
    </div>
    {#if drawerLoading}
      <p class="text-sm text-muted">Loading…</p>
    {:else if detail.bottom_score != null}
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded px-1.5 py-0.5 text-[11px] {statusPill(detail.status_label)}">{detail.status_label}</span>
        {#if detail.confidence}<span class="rounded px-1.5 py-0.5 text-[11px] {confPill(detail.confidence)}">{detail.confidence} confidence</span>{/if}
        <span class="text-xs text-muted">{detail.name} · #{detail.market_cap_rank ?? '—'}</span>
      </div>

      <div class="mt-3 grid grid-cols-3 gap-2">
        <div class="card p-2.5"><p class="text-[10px] uppercase tracking-wide text-muted">Recovery</p><p class="text-lg font-bold {scoreTone(detail.bottom_score)}">{detail.bottom_score}</p></div>
        <div class="card p-2.5"><p class="text-[10px] uppercase tracking-wide text-muted">Confirmation</p><p class="text-lg font-bold text-soft">{detail.confirmation_score}</p></div>
        <div class="card p-2.5"><p class="text-[10px] uppercase tracking-wide text-muted">Inval. risk</p><p class="text-lg font-bold {invTone(detail.invalidation_risk_score)}">{detail.invalidation_risk_score}</p></div>
      </div>

      {#if chartOption}
        <div class="card mt-3 p-2"><p class="stat-label mb-1 px-1">ALT/BTC ratio vs moving averages</p><EChart option={chartOption} height={240} /></div>
      {/if}

      <p class="mt-3 text-sm leading-relaxed text-soft">{detail.key_reason}</p>

      <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <dt class="text-muted">30D ALT/BTC</dt><dd class="text-right {pctTone(detail.alt_btc_return_30d)}">{pct(detail.alt_btc_return_30d)}</dd>
        <dt class="text-muted">90D ALT/BTC</dt><dd class="text-right {pctTone(detail.alt_btc_return_90d)}">{pct(detail.alt_btc_return_90d)}</dd>
        <dt class="text-muted">Drawdown 365D high</dt><dd class="text-right text-soft">{pct(detail.drawdown_from_365d_high)}</dd>
        <dt class="text-muted">Off 180D low</dt><dd class="text-right text-soft">{pct(detail.distance_from_180d_low)}</dd>
        <dt class="text-muted">Structure</dt><dd class="text-right text-soft">{detail.structure_label?.replace('_', ' ')}</dd>
        <dt class="text-muted">Above MA50 / MA200</dt><dd class="text-right text-soft">{detail.above_ma50 ? 'yes' : 'no'} / {detail.above_ma200 ? 'yes' : 'no'}</dd>
      </dl>

      {#if detail.what_to_watch_next?.length}
        <p class="mt-3 text-[11px] uppercase tracking-wide text-muted">What to watch next</p>
        <ul class="mt-1 space-y-0.5 text-xs text-soft">{#each detail.what_to_watch_next as w}<li>• {w}</li>{/each}</ul>
      {/if}
      <p class="mt-3 text-[11px] uppercase tracking-wide text-muted">Invalidation</p>
      <p class="mt-1 text-xs text-warn">{invalidationLine(detail.status_label)}</p>
      {#if detail.risk_flags?.length}
        <ul class="mt-1 space-y-0.5">{#each detail.risk_flags as f}<li class="flex items-center gap-1 text-xs text-warn"><AlertTriangle class="h-3 w-3 shrink-0" />{f}</li>{/each}</ul>
      {/if}

      <p class="mt-3 text-[11px] uppercase tracking-wide text-muted">Why this score?</p>
      <div class="mt-1 grid gap-2 text-[11px] sm:grid-cols-2">
        <div>{#each whyPos(detail) as p}<p class="text-mint/90">+ {p}</p>{:else}<p class="text-muted">Limited positive signals.</p>{/each}</div>
        <div>{#each whyNeg(detail) as nx}<p class="text-warn/90">− {nx}</p>{:else}<p class="text-muted">No major drags.</p>{/each}</div>
      </div>

      <p class="mt-3 text-[11px] uppercase tracking-wide text-muted">Related</p>
      <div class="mt-1 flex flex-wrap gap-2 text-xs">
        <a href="/app/altcoin-btc-lab" class="inline-flex items-center gap-1 text-accent hover:underline">Alt vs BTC Lab <ArrowRight class="h-3 w-3" /></a>
        <a href="/app/charts" class="inline-flex items-center gap-1 text-accent hover:underline">Altcoin Season <ArrowRight class="h-3 w-3" /></a>
      </div>

      <div class="mt-3 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[11px] leading-relaxed text-muted">Relative-strength research only — not a buy signal. If ALT/BTC breaks below the recent low, the bottoming attempt is invalidated.</div>
    {:else}
      <p class="text-sm text-muted">Details unavailable.</p>
    {/if}
  </aside>
{/if}
