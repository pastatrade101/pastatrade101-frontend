<script lang="ts">
  import { onMount } from 'svelte';
  import { BarChart3, Bitcoin, CircleDollarSign, Gem, Globe, PieChart, TrendingDown, TrendingUp, Gauge, Users, DoorOpen, Layers, FileText, Spline, ArrowRight, AlertTriangle, Zap, Activity, Lock, Flame } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { changeColor, fmtPct, fmtUsd } from '$lib/format';
  import Disclaimer from '$lib/components/Disclaimer.svelte';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data = $state<any>(null);
  let error = $state('');
  let loading = $state(true);
  let universe = $state<'clean' | 'all'>('clean');

  const load = async () => {
    loading = true;
    error = '';
    try {
      data = await api(`/overview?universe=${universe}`, { auth: true });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load market data.';
    } finally {
      loading = false;
    }
  };
  onMount(load);

  let firstRun = $state(true);
  $effect(() => {
    void universe;
    if (firstRun) {
      firstRun = false;
      return;
    }
    void load();
  });

  const toneClass: Record<string, string> = {
    good: 'bg-mint/15 text-mint',
    neutral: 'bg-accent/15 text-accent',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    na: 'bg-edge text-muted'
  };
  const toneBorder: Record<string, string> = { good: 'border-l-mint', neutral: 'border-l-accent', warn: 'border-l-warn', danger: 'border-l-danger', na: 'border-l-edge' };

  // Plausible placeholder content shown blurred behind the upgrade CTA.
  const SAMPLE_SIGNALS = [
    { name: 'BTC Risk', label: 'Good DCA zone', value: '16 / 100', meaning: 'BTC is not overheated on the model.', tone: 'good' },
    { name: 'Altcoin Breadth', label: 'Selective strength', value: '43% beating BTC', meaning: 'Some alts outperform BTC.', tone: 'warn' },
    { name: 'Social Risk', label: 'Quiet', value: '0.22 (active)', meaning: 'Retail attention is quiet.', tone: 'good' },
    { name: 'Exit Signal', label: 'Hold', value: '31 / 100', meaning: 'No major exit pressure yet.', tone: 'good' },
    { name: 'Ecosystem Rotation', label: 'Selective', value: '2/12 improving', meaning: 'Few ecosystems improving.', tone: 'warn' },
    { name: 'Stablecoin Liquidity', label: 'Liquidity base', value: '$307B', meaning: 'Liquidity on the sidelines.', tone: 'good' }
  ];

  const SIGNAL_ICON: Record<string, typeof Gauge> = {
    btc_risk: Gauge,
    altcoin_breadth: BarChart3,
    social_risk: Users,
    exit_strategy: DoorOpen,
    ecosystem_rotation: Layers,
    stablecoin_liquidity: CircleDollarSign,
    derivatives: Flame
  };

  const metricDefs = $derived(
    data
      ? [
          { label: 'BTC Price', value: fmtUsd(data.metrics.btc_price), icon: Bitcoin, meaning: 'Current Bitcoin market price.' },
          { label: 'ETH Price', value: fmtUsd(data.metrics.eth_price), icon: Gem, meaning: 'Current Ethereum market price.' },
          { label: 'Total Market Cap', value: fmtUsd(data.metrics.total_market_cap, { compact: true }), icon: Globe, meaning: 'Total value of the tracked crypto market.' },
          { label: '24h Volume', value: fmtUsd(data.metrics.volume_24h, { compact: true }), icon: BarChart3, meaning: 'Trading activity over the last 24 hours.' },
          { label: 'BTC Dominance', value: `${data.metrics.btc_dominance?.toFixed(1)}%`, icon: PieChart, meaning: 'Bitcoin still controls market direction when this is high.' },
          { label: 'ETH Dominance', value: `${data.metrics.eth_dominance?.toFixed(1)}%`, icon: PieChart, meaning: 'Rising ETH dominance can support altcoin rotation.' },
          { label: 'Stablecoin Cap', value: fmtUsd(data.metrics.stablecoin_cap, { compact: true }), icon: CircleDollarSign, meaning: 'Liquidity sitting on the sidelines.' },
          {
            label: 'Mcap 24h',
            value: fmtPct(data.metrics.market_cap_change_24h),
            icon: TrendingUp,
            meaning: Math.abs(Number(data.metrics.market_cap_change_24h ?? 0)) < 1 ? 'Market is mostly flat today.' : Number(data.metrics.market_cap_change_24h) >= 0 ? 'Market is expanding today.' : 'Market is contracting today.'
          }
        ]
      : []
  );

  const EXPLORE = [
    { href: '/app/risk', icon: Gauge, title: 'Check BTC Risk', why: 'See whether BTC is in DCA, neutral, caution or distribution zone.' },
    { href: '/app/altcoin-btc-lab', icon: BarChart3, title: 'Compare Altcoins vs BTC', why: 'See which coins are truly outperforming Bitcoin.' },
    { href: '/app/ecosystems', icon: Layers, title: 'Ecosystem Rankings', why: 'Spot which ecosystems are rotating into strength.' },
    { href: '/app/exit-strategy', icon: DoorOpen, title: 'Open Exit Strategy', why: 'Check whether market risk is high enough to consider scaling out.' },
    { href: '/app/charts/logarithmic-regression', icon: Spline, title: 'Log Regression', why: 'See if BTC/ETH is near long-term value or overheated.' },
    { href: '/app/reports', icon: FileText, title: 'Read Latest Report', why: 'Get the full market summary without checking every dashboard.' }
  ];

  const freshnessRows = $derived(
    data?.data_freshness
      ? [
          ['Market', data.data_freshness.market],
          ['Risk', data.data_freshness.risk],
          ['On-chain', data.data_freshness.onchain],
          ['Social', data.data_freshness.social],
          ['Reports', data.data_freshness.reports]
        ]
      : []
  );
  const anyStale = $derived(freshnessRows.some(([, f]) => (f as { stale?: boolean })?.stale));
  const moverBadge = (vs: string) => (vs === 'strong' ? { t: 'Strong vs BTC', c: 'bg-mint/15 text-mint' } : vs === 'weak' ? { t: 'Weak vs BTC', c: 'bg-danger/15 text-danger' } : { t: 'In line w/ BTC', c: 'bg-edge text-muted' });
</script>

<header class="mb-4 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h1 class="text-xl font-semibold text-strong">Market Overview</h1>
    <p class="text-sm text-muted">Your daily crypto market command center — what is the market telling you today?</p>
  </div>
  {#if data?.data_freshness}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      {#each freshnessRows as [label, f]}
        <span class="inline-flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full {(f as { stale?: boolean }).stale ? 'bg-warn' : 'bg-mint'}"></span>{label}: {(f as { label: string }).label}</span>
      {/each}
    </div>
  {/if}
</header>

{#if anyStale}<div class="mb-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-1.5 text-xs text-warn">Some data is stale — the figures below may lag the live market until the next sync.</div>{/if}

{#if loading}
  <div class="space-y-3">
    <div class="card h-28 animate-pulse"></div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{#each Array(6) as _}<div class="card h-20 animate-pulse"></div>{/each}</div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">{#each Array(8) as _}<div class="card h-20 animate-pulse"></div>{/each}</div>
  </div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">
    {error}
    <p class="mt-1 text-sm text-muted">If this is a fresh install, run a data sync from the Admin panel first.</p>
  </div>
{:else if data}
  <!-- ── Hero: Daily Market Read ── -->
  <div class="hero-card mb-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="stat-label flex items-center gap-1.5"><Activity class="h-4 w-4 text-accent" /> Daily Market Read</span>
      <span class="pill {toneClass[data.signals?.btc_risk?.tone ?? 'neutral']}">{data.market_posture.label}</span>
    </div>
    <p class="mt-2 max-w-4xl text-[15px] leading-relaxed text-soft">{data.daily_market_read}</p>
    <p class="mt-1.5 text-xs text-muted">{data.market_posture.interpretation}</p>

    {#if data.strongest_signal_today || data.biggest_warning_today}
      <div class="mt-3 grid gap-2 md:grid-cols-2">
        {#if data.strongest_signal_today}
          <div class="flex items-start gap-2 rounded-lg border border-mint/30 bg-mint/5 px-3 py-2 text-sm">
            <Zap class="mt-0.5 h-4 w-4 shrink-0 text-mint" /><span><span class="font-medium text-mint">Strongest signal today:</span> <span class="text-soft">{data.strongest_signal_today}</span></span>
          </div>
        {/if}
        {#if data.biggest_warning_today}
          <div class="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm">
            <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-warn" /><span><span class="font-medium text-warn">Biggest warning today:</span> <span class="text-soft">{data.biggest_warning_today}</span></span>
          </div>
        {/if}
      </div>
    {:else if !data.has_interpretation}
      <div class="relative mt-3">
        <div class="grid gap-2 blur-[3px] md:grid-cols-2" aria-hidden="true">
          <div class="flex items-start gap-2 rounded-lg border border-mint/30 bg-mint/5 px-3 py-2 text-sm"><Zap class="mt-0.5 h-4 w-4 shrink-0 text-mint" /><span><span class="font-medium text-mint">Strongest signal today:</span> <span class="text-soft">An altcoin is confirming strength against Bitcoin while overall breadth stays selective.</span></span></div>
          <div class="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm"><AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-warn" /><span><span class="font-medium text-warn">Biggest warning today:</span> <span class="text-soft">Altcoin strength is still selective — do not assume full altcoin season yet.</span></span></div>
        </div>
        <div class="absolute inset-0 flex items-center justify-center">
          <a href="/pricing" class="btn-primary text-sm shadow-lg"><Lock class="h-4 w-4" /> Unlock with Premium</a>
        </div>
      </div>
    {/if}
  </div>

  <!-- ── Signal row ── -->
  {#if data.signals}
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {#each Object.values(data.signals) as sig}
        {@const s = sig as { key: string; name: string; label: string; value: string | null; meaning: string; tone: string; link: string }}
        {@const Icon = SIGNAL_ICON[s.key] ?? Activity}
        <a href={s.link} class="card border-l-4 {toneBorder[s.tone]} p-3 transition hover:bg-panel-2/50">
          <div class="flex items-center justify-between gap-1">
            <span class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <Icon class="h-3.5 w-3.5" />{s.name}
            </span>
          </div>
          <p class="mt-1"><span class="rounded px-1.5 py-0.5 text-xs font-semibold {toneClass[s.tone]}">{s.label}</span></p>
          {#if s.value}<p class="mt-1 text-[11px] text-soft">{s.value}</p>{/if}
          <p class="mt-1 text-[11px] leading-snug text-muted">{s.meaning}</p>
        </a>
      {/each}
    </div>
  {:else}
    <div class="relative mb-4">
      <div class="grid grid-cols-2 gap-3 blur-[3px] md:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
        {#each SAMPLE_SIGNALS as s}
          <div class="card border-l-4 {toneBorder[s.tone]} p-3">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.name}</span>
            <p class="mt-1"><span class="rounded px-1.5 py-0.5 text-xs font-semibold {toneClass[s.tone]}">{s.label}</span></p>
            <p class="mt-1 text-[11px] text-soft">{s.value}</p>
            <p class="mt-1 text-[11px] leading-snug text-muted">{s.meaning}</p>
          </div>
        {/each}
      </div>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <a href="/pricing" class="btn-primary text-sm shadow-lg"><Lock class="h-4 w-4" /> Unlock signal cards</a>
        <p class="text-xs text-muted">BTC risk · altcoin breadth · social · exit · ecosystem · liquidity — on Mid & Premium</p>
      </div>
    </div>
  {/if}

  <!-- ── Metric grid ── -->
  <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {#each metricDefs as m}
      <div class="stat-tile" title={m.meaning}>
        <div class="flex items-start justify-between">
          <p class="stat-label">{m.label}</p>
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-mint/10 text-mint"><m.icon class="h-4 w-4" /></span>
        </div>
        <p class="stat-value mt-1.5 text-xl tracking-tight">{m.value}</p>
        <p class="mt-1 text-[11px] leading-snug text-muted">{m.meaning}</p>
      </div>
    {/each}
  </div>

  <!-- ── What changed today ── -->
  {#if data.what_changed_today?.length}
    <div class="card mb-4">
      <p class="stat-label">What changed today</p>
      <ul class="mt-2 grid gap-1.5 text-sm text-muted sm:grid-cols-2">
        {#each data.what_changed_today as c}<li class="flex items-start gap-1.5"><span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent"></span>{c}</li>{/each}
      </ul>
    </div>
  {/if}

  <!-- ── Movers ── -->
  <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
    <h2 class="font-semibold text-strong">Market movers (24h)</h2>
    <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
      <button class="px-2.5 py-1.5 font-medium {universe === 'clean' ? 'bg-panel-2 text-strong' : 'text-muted'}" onclick={() => (universe = 'clean')}>Premium clean</button>
      <button class="px-2.5 py-1.5 font-medium {universe === 'all' ? 'bg-panel-2 text-strong' : 'text-muted'}" onclick={() => (universe = 'all')}>All coins</button>
    </div>
  </div>
  {#if universe === 'all'}<p class="mb-2 text-[11px] text-warn">All Coins may include low-liquidity or noisy assets.</p>{/if}
  <div class="grid gap-4 md:grid-cols-2">
    {#each [{ title: 'Top Gainers', list: data.top_gainers, icon: TrendingUp, tone: 'text-mint', ctx: 'Top gainers show short-term price movement, not necessarily strong long-term signals. Confirm with Alt/BTC strength before treating a coin as a leader.' }, { title: 'Top Losers', list: data.top_losers, icon: TrendingDown, tone: 'text-danger', ctx: 'Top losers show short-term weakness. Some may be normal pullbacks, others may be underperforming BTC.' }] as col}
      <div class="card">
        <h3 class="mb-2 flex items-center gap-2 font-semibold text-strong"><col.icon class="h-4 w-4 {col.tone}" />{col.title}</h3>
        <ul class="divide-y divide-edge">
          {#each col.list as coin}
            {@const b = moverBadge(coin.vs_btc)}
            <li class="flex items-center justify-between gap-2 py-2">
              <div class="flex min-w-0 items-center gap-2">
                {#if coin.image_url}<img src={coin.image_url} alt="" class="h-5 w-5 shrink-0 rounded-full" />{/if}
                <span class="text-sm font-medium text-strong">{coin.symbol}</span>
                <span class="hidden truncate text-xs text-muted sm:inline">{coin.name}</span>
                <span class="rounded px-1.5 py-0.5 text-[10px] font-medium {b.c}">{b.t}</span>
                {#if coin.low_liquidity}<span class="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">low liq</span>{/if}
              </div>
              <div class="shrink-0 text-right">
                <span class="text-sm text-soft">{fmtUsd(coin.current_price)}</span>
                <span class="ml-2 text-sm {changeColor(coin.price_change_pct_24h)}">{fmtPct(coin.price_change_pct_24h)}</span>
              </div>
            </li>
          {/each}
        </ul>
        <p class="mt-2 text-[11px] leading-snug text-muted">{col.ctx}</p>
      </div>
    {/each}
  </div>

  <!-- ── Latest report + Explore next ── -->
  <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
    {#if data.latest_report}
      <div class="card flex flex-col">
        <p class="stat-label">Latest market report</p>
        <p class="mt-1 font-semibold text-strong">{data.latest_report.title}</p>
        <p class="text-xs capitalize text-muted">{data.latest_report.report_type} report{data.latest_report.posture ? ` · ${data.latest_report.posture}` : ''}</p>
        {#if data.latest_report.takeaway}<p class="mt-2 line-clamp-4 text-sm leading-relaxed text-soft">{data.latest_report.takeaway}</p>{/if}
        <a href="/app/reports" class="btn-primary mt-3 inline-flex w-fit text-sm">Read report <ArrowRight class="h-4 w-4" /></a>
      </div>
    {/if}
    <div class="card">
      <p class="stat-label">Explore next</p>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        {#each EXPLORE as e}
          <a href={e.href} class="group flex items-start gap-2 rounded-lg border border-edge px-3 py-2 transition hover:bg-panel-2/50">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mint/10 text-mint"><e.icon class="h-4 w-4" /></span>
            <span class="min-w-0">
              <span class="flex items-center gap-1 text-sm font-medium text-strong">{e.title}<ArrowRight class="h-3 w-3 text-muted transition group-hover:translate-x-0.5" /></span>
              <span class="block text-[11px] leading-snug text-muted">{e.why}</span>
            </span>
          </a>
        {/each}
      </div>
    </div>
  </div>

  <!-- ── Coverage + disclaimer ── -->
  <p class="mt-4 text-[11px] text-muted">{data.coverage?.note}</p>
  <div class="mt-2"><Disclaimer /></div>
{/if}
