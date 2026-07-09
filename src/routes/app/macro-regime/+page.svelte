<script lang="ts">
  import { Globe, Info, TrendingUp, TrendingDown, Minus, DollarSign, Activity, Coins, Compass, Clock } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import Gauge from '$lib/components/Gauge.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import AiInterpret from '$lib/components/AiInterpret.svelte';
  import AiLabel from '$lib/components/AiLabel.svelte';

  const canUse = $derived(hasFeature($membership, 'access_macro_regime'));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let started = $state(false);

  const load = async () => {
    loading = true;
    error = '';
    try {
      r = await api('/macro-regime', { auth: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load the macro regime.';
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

  const scoreTone = (s: number) => (s >= 60 ? 'text-mint' : s >= 40 ? 'text-accent' : 'text-danger');
  const scoreBar = (s: number) => (s >= 60 ? 'bg-mint' : s >= 40 ? 'bg-accent' : 'bg-danger');
  const pill = (s: number) => (s >= 60 ? 'bg-mint/15 text-mint' : s >= 40 ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger');
  const confPill = (c: string) => (c === 'High' ? 'bg-mint/15 text-mint' : c === 'Low' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const toneClass = (t: string) => (t === 'good' ? 'text-mint' : t === 'warn' ? 'text-danger' : 'text-soft');
  const toneDot = (t: string) => (t === 'good' ? 'bg-mint' : t === 'warn' ? 'bg-danger' : 'bg-muted');
  const dollarTone = (d: string) => (d === 'weakening' ? 'text-mint' : d === 'strengthening' ? 'text-danger' : 'text-soft');
  // What each input tone means for crypto — the beginner-friendly one-liner.
  const cryptoMeaning = (t: string) => (t === 'good' ? 'Supportive for crypto' : t === 'warn' ? 'Headwind for crypto' : 'Neutral for crypto');

  // Plain-language verdict — the decision, not the score (the /100 stays as proof).
  const macroVerdict = $derived.by(() => {
    const s = r?.regime_score;
    if (s == null) return { head: 'Macro read unavailable', sub: 'Not enough market data to read the backdrop yet.' };
    if (s >= 60) return { head: 'Traditional markets are supporting crypto', sub: 'The dollar, stocks and volatility lean risk-on — a tailwind behind crypto right now.' };
    if (s >= 40) return { head: 'The macro backdrop is mixed', sub: 'No strong tailwind or headwind — traditional markets are neither helping nor hurting much.' };
    return { head: 'Traditional markets are a headwind for crypto', sub: 'The backdrop is risk-off — even good coins face resistance until this eases.' };
  });

  // Plain-English "what to do about it" for each regime band.
  const bestApproach = (s: number) =>
    s >= 60
      ? 'Conditions favour crypto. You can lean more constructive, but keep take-profit levels and risk management in place.'
      : s >= 40
        ? 'Patience, selective entries, and confirmation. No strong tailwind — don’t force trades without a clear edge.'
        : 'Stay defensive. Prioritise capital preservation and smaller size until the macro headwind eases.';

  // Bullish / bearish / neutral tally across the tracked inputs (from tone).
  const tally = $derived.by(() => {
    const c = (r?.components ?? []) as Array<{ tone: string }>;
    return {
      bullish: c.filter((x) => x.tone === 'good').length,
      bearish: c.filter((x) => x.tone === 'warn').length,
      neutral: c.filter((x) => x.tone === 'neutral').length
    };
  });

  // Trend vs the previous reading. null → not enough history yet.
  const change = $derived<number | null>(r?.score_change ?? null);
  const trendLabel = (ch: number, score: number) => {
    if (ch > 2) return score >= 60 ? 'Improving — risk-on building' : 'Improving, but still mixed';
    if (ch < -2) return score >= 40 ? 'Cooling — watch for a shift' : 'Worsening — risk-off deepening';
    return 'Holding steady';
  };
  const trendTone = (ch: number) => (ch > 2 ? 'text-mint' : ch < -2 ? 'text-danger' : 'text-muted');

  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const fmtDay = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Transparency: exactly what the regime is built from. `symbol` is the real
  // Twelve Data ticker we pull (ETF proxies where a raw index isn't on the free
  // tier — UUP≈DXY, VIXY≈VIX; XAU/USD is unambiguous spot gold).
  const TRACKED = [
    { name: 'Equities — S&P 500', symbol: 'SPY', icon: TrendingUp, weight: '35%', signal: 'Rising = risk-on · falling = risk-off' },
    { name: 'US Dollar (DXY)', symbol: 'UUP', icon: DollarSign, weight: '35%', signal: 'Strengthening = headwind for crypto' },
    { name: 'Volatility (VIX)', symbol: 'VIXY', icon: Activity, weight: '20%', signal: 'Rising = risk-off (fear)' },
    { name: 'Gold', symbol: 'XAU/USD', icon: Coins, weight: '10%', signal: 'Context — safe-haven vs debasement' }
  ];

  // Signals for the AI interpretation — built from the page's own computed reads.
  const regimeTone = (s: number) => (s >= 60 ? 'good' : s >= 40 ? 'neutral' : 'danger');
  const aiSignals = $derived(
    r && r.available
      ? [
          { name: 'Regime score', label: r.regime_label, value: r.regime_score, tone: regimeTone(r.regime_score) },
          { name: 'Macro read', label: macroVerdict.head, meaning: macroVerdict.sub, tone: regimeTone(r.regime_score) },
          { name: 'Confidence', label: r.confidence, tone: r.confidence === 'High' ? 'good' : r.confidence === 'Low' ? 'warn' : 'neutral' },
          { name: 'Dollar trend', label: r.dollar_trend, tone: r.dollar_trend === 'weakening' ? 'good' : r.dollar_trend === 'strengthening' ? 'danger' : 'neutral' },
          { name: 'Input tally', label: `${tally.bullish} bullish · ${tally.bearish} bearish · ${tally.neutral} neutral`, tone: tally.bullish > tally.bearish ? 'good' : tally.bearish > tally.bullish ? 'warn' : 'neutral' }
        ]
      : []
  );
</script>

<header class="mb-5 flex items-center gap-2">
  <Globe class="h-5 w-5 text-accent" />
  <div>
    <h1 class="text-xl font-semibold text-strong">Macro Regime</h1>
    <p class="text-sm text-muted">The traditional-market backdrop — dollar, equities, volatility and gold — as a risk-on / risk-off read for crypto.</p>
  </div>
</header>

{#if !$membershipReady || loading}
  <p class="text-sm text-muted">Reading the macro backdrop…</p>
{:else if !canUse}
  <LockedFeature
    title="Macro Regime is a Mid & Premium feature"
    plan="Mid"
    bullets={['A single risk-on / risk-off read from the dollar, equities, volatility and gold', 'See the macro tailwind or headwind behind crypto — not just crypto in isolation', 'Feeds the Overview command center']}
  />
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if r && !r.available}
  <div class="card border-warn/30 bg-warn/5"><p class="stat-label text-warn">Macro data not available yet</p><p class="mt-1 text-sm text-soft">{r.interpretation}</p></div>
{:else if r}
  <!-- Hero: at-a-glance score, trend and freshness -->
  <div class="hero-card mb-3 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
    <div class="mx-auto"><Gauge value={r.regime_score / 100} title="Risk Appetite" /></div>
    <div class="min-w-0">
      <!-- Plain-language verdict first; the score + labels sit below as proof -->
      <AiLabel />
      <p class="mt-0.5 text-xl font-bold leading-tight {scoreTone(r.regime_score)}">{macroVerdict.head}</p>
      <p class="mb-3 mt-1 text-sm text-soft">{macroVerdict.sub}</p>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-2xl font-bold {scoreTone(r.regime_score)}">{r.regime_score}<span class="text-base text-muted">/100</span></span>
        <span class="pill {pill(r.regime_score)}">{r.regime_label}</span>
        <span class="pill {confPill(r.confidence)}">{r.confidence} confidence</span>
      </div>
      <div class="meter mt-2 max-w-md"><div class="meter-fill {scoreBar(r.regime_score)}" style="width: {r.regime_score}%"></div></div>

      <!-- Trend vs previous reading (graceful when no history yet) -->
      <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {#if change !== null}
          <span class="inline-flex items-center gap-1 font-medium {trendTone(change)}">
            {#if change > 2}<TrendingUp class="h-3.5 w-3.5" />{:else if change < -2}<TrendingDown class="h-3.5 w-3.5" />{:else}<Minus class="h-3.5 w-3.5" />{/if}
            {change > 0 ? '+' : ''}{change} {r.previous_date ? `since ${fmtDay(r.previous_date)}` : 'vs last reading'}
          </span>
          <span class="text-soft">{trendLabel(change, r.regime_score)}</span>
        {:else}
          <span class="inline-flex items-center gap-1 text-muted"><Minus class="h-3.5 w-3.5" />Trend data unavailable — building history</span>
        {/if}
      </div>

      <p class="mt-1.5 text-xs text-muted">
        Dollar: <span class="font-medium {dollarTone(r.dollar_trend)}">{r.dollar_trend}</span>
        · based on {r.symbols_used} macro input{r.symbols_used === 1 ? '' : 's'}
      </p>
      {#if fmtDateTime(r.updated_at || r.as_of)}
        <p class="mt-1 inline-flex items-center gap-1 text-xs text-muted"><Clock class="h-3.5 w-3.5" />Last updated {fmtDateTime(r.updated_at || r.as_of)}</p>
      {/if}
    </div>
  </div>

  <!-- AI interpretation — premium sees a button, free/mid see the locked teaser -->
  <AiInterpret module="macro_regime" title="Macro Regime" signals={aiSignals} />
  <div class="mb-4"></div>

  <!-- Final Interpretation — the plain-English bottom line -->
  <div class="ai-glow card mb-3 border-accent/25 bg-accent/[0.04]">
    <AiLabel />
    <div class="mt-2 space-y-2 text-sm leading-relaxed">
      <p class="flex flex-wrap items-center gap-2"><span class="text-muted">Current regime:</span><span class="pill {pill(r.regime_score)}">{r.regime_label}</span></p>
      <p class="text-soft"><span class="font-medium text-strong">What it means for crypto:</span> {r.interpretation}</p>
      <p class="flex items-start gap-2 rounded-lg bg-panel-2 px-3 py-2 text-soft">
        <Compass class="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span><span class="font-medium text-strong">Best approach:</span> {bestApproach(r.regime_score)}</span>
      </p>
    </div>
  </div>

  <!-- Component reads with a bullish / bearish / neutral tally header -->
  {#if r.components?.length}
    <div class="mb-3">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p class="stat-label">Macro inputs</p>
        <div class="flex items-center gap-3 text-xs font-medium">
          <span class="inline-flex items-center gap-1 text-mint"><span class="h-1.5 w-1.5 rounded-full bg-mint"></span>{tally.bullish} bullish</span>
          <span class="inline-flex items-center gap-1 text-danger"><span class="h-1.5 w-1.5 rounded-full bg-danger"></span>{tally.bearish} bearish</span>
          <span class="inline-flex items-center gap-1 text-muted"><span class="h-1.5 w-1.5 rounded-full bg-muted"></span>{tally.neutral} neutral</span>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {#each r.components as c}
          <div class="card p-3">
            <p class="text-[11px] uppercase tracking-wide text-muted">{c.input}</p>
            <p class="mt-0.5 flex items-center gap-1.5 text-sm font-medium {toneClass(c.tone)}"><span class="h-1.5 w-1.5 rounded-full {toneDot(c.tone)}"></span>{c.read}</p>
            <p class="mt-0.5 text-[11px] text-muted">{cryptoMeaning(c.tone)}</p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- What we track (transparency) -->
  <div class="card mb-3">
    <p class="stat-label">What we track</p>
    <p class="mt-1 text-xs text-muted">The regime is built from four liquid macro inputs (via ETF proxies), reweighted if any is unavailable:</p>
    <div class="mt-2 grid gap-2 sm:grid-cols-2">
      {#each TRACKED as tk}
        <div class="flex items-start justify-between gap-2 rounded-lg bg-panel-2 px-3 py-2">
          <div class="flex min-w-0 items-start gap-2.5">
            <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent"><tk.icon class="h-4 w-4" /></span>
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-1.5 text-sm font-medium text-soft">{tk.name}<span class="rounded bg-panel px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted">{tk.symbol}</span></p>
              <p class="text-[11px] text-muted">{tk.signal}</p>
            </div>
          </div>
          <span class="shrink-0 text-xs font-medium text-accent">{tk.weight}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- How to read -->
  <div class="card mb-3">
    <p class="stat-label">How to read this</p>
    <ul class="mt-1.5 space-y-1 text-sm text-muted">
      <li>• <span class="text-soft">Risk-on (high)</span> — equities up, dollar easing, volatility low. Historically a tailwind for BTC and risk assets.</li>
      <li>• <span class="text-soft">Risk-off (low)</span> — a strengthening dollar, rising volatility or falling equities. A headwind for crypto.</li>
      <li>• The <span class="text-soft">dollar</span> is the single biggest macro driver for crypto — a strong, rising dollar usually pressures BTC.</li>
    </ul>
    <p class="mt-2 text-[12px] text-muted/80">This is macro context, not a price prediction. It works best alongside BTC risk, on-chain and social signals.</p>
  </div>

  <div class="flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
    <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>Macro regime is <span class="text-soft">context, not a prediction</span>. Use it together with BTC risk, on-chain data, social signals and price structure. Macro context is derived internally from traditional-market data (Twelve Data) — raw market quotes are not shown. Not financial advice; always do your own research.</span>
  </div>
{/if}
