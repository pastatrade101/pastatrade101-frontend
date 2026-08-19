<script lang="ts">
  import { Info, Flame } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import Gauge from '$lib/components/Gauge.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import EChart from '$lib/components/EChart.svelte';
  import { grid, valueAxis, axisTooltip, categorical, categoryAxis, itemTooltip, rankedBars, tipBody, tipRow } from '$lib/charts/presets';
  import { readChartTokens } from '$lib/charts/theme';
  import { theme } from '$lib/stores/theme';
  import AiInterpret from '$lib/components/AiInterpret.svelte';
  import AiLabel from '$lib/components/AiLabel.svelte';

  const canDeriv = $derived(hasFeature($membership, 'access_derivatives'));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r = $state<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hist = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let started = $state(false);

  const load = async () => {
    loading = true;
    error = '';
    try {
      const [live, h] = await Promise.all([
        api('/derivatives', { auth: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api<{ points: any[] }>('/derivatives/history?days=90', { auth: true }).catch(() => ({ points: [] as any[] }))
      ]);
      r = live;
      hist = (h?.points ?? []).filter((p: any) => p.leverage_percent != null);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load derivatives data.';
    } finally {
      loading = false;
    }
  };

  // Leverage-risk trend chart (grows as the daily sync accumulates rows).
  const chartOption = $derived.by(() => {
    if (hist.length < 2) return null;
    const dates = hist.map((p) => p.date);
    const lev = hist.map((p) => p.leverage_percent);
    const hue = $categorical[0];
    const alert = $categorical[3];
    return {
      grid: grid({ left: 38, right: 16, top: 16, bottom: 28, containLabel: false }),
      tooltip: axisTooltip({ valueFormatter: (v: number) => `${Math.round(v)}/100` }),
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10 } },
      yAxis: valueAxis({ min: 0, max: 100, axisLabel: { fontSize: 10 } }),
      series: [
        {
          name: 'Leverage Risk',
          type: 'line',
          data: lev,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: hue, width: 2 },
          areaStyle: { color: hue, opacity: 0.08 },
          markLine: { silent: true, symbol: 'none', lineStyle: { color: alert, type: 'dashed', opacity: 0.5 }, data: [{ yAxis: 75 }], label: { formatter: 'Overheated', color: alert, fontSize: 9 } }
        }
      ]
    };
  });
  // Funding extremes, as one picture instead of two columns of strings.
  //
  // The lists below already print every number; what they cannot show is the
  // BALANCE — whether the crowded-long side dwarfs the fearful side or the two
  // are evenly matched. Both lists share a single signed metric (funding per
  // 8h) that crosses zero, so plotting them on one shared baseline turns
  // "0.087% vs -0.004%" into a shape you read without arithmetic.
  interface FundingRow {
    symbol: string;
    funding: number;
  }
  const fundingRows = $derived.by<FundingRow[]>(() => {
    const top: FundingRow[] = r?.top_funding ?? [];
    const bottom: FundingRow[] = r?.bottom_funding ?? [];
    // The API sends top highest-first and bottom most-negative-first; reversing
    // bottom makes the joined list monotonically descending, so the chart reads
    // top-to-bottom as most crowded → most fearful.
    return [...top, ...[...bottom].reverse()];
  });

  // ~26px a row keeps the coin tickers legible without scrolling on a phone.
  const fundingChartHeight = $derived(Math.max(170, Math.min(330, fundingRows.length * 26 + 30)));

  const fundingOption = $derived.by(() => {
    const rows = fundingRows;
    if (!rows.length) return null;
    void $theme; // re-read tokens when the theme (or admin branding) changes
    const t = readChartTokens();
    const rgb = (triplet: string, a = 1) => {
      const [x, y, z] = triplet.split(/[\s,]+/);
      return `rgba(${x}, ${y}, ${z}, ${a})`;
    };
    // Exactly the two tokens the section headings and list values already use —
    // warn = "Most crowded longs", accent = "Most fearful" — so the chart and
    // the text underneath it are visibly the same colour language.
    const hot = rgb(t.warn);
    const cold = rgb(t.accent);
    const vals = rows.map((c) => c.funding * 100);
    // Symmetric domain: both sides measured with the same ruler, so a
    // crowded-long market LOOKS lopsided. The 1.45 padding keeps the longest
    // bar clear of the edge, leaving room for its value label inside the plot.
    const span = Math.max(...vals.map((v) => Math.abs(v)), 0.001) * 1.45;
    return {
      grid: grid({ left: 4, right: 6, top: 6, bottom: 4 }),
      tooltip: itemTooltip({
        textStyle: { fontSize: 11 },
        formatter: (p: { dataIndex: number }) => {
          const c = rows[p.dataIndex];
          return `<b>${c.symbol}</b><br/>${tipBody([
            tipRow(c.funding >= 0 ? hot : cold, 'Funding (8h)', `${(c.funding * 100).toFixed(3)}%`),
            c.funding >= 0 ? 'Longs are paying shorts to stay long' : 'Shorts are paying longs'
          ])}`;
        }
      }),
      xAxis: valueAxis({ min: -span, max: span, splitNumber: 4, axisLabel: { fontSize: 9, formatter: (v: number) => `${Number(v.toFixed(3))}%` } }),
      yAxis: categoryAxis(
        rows.map((c) => c.symbol),
        // `inverse` puts row 0 at the TOP, matching the descending order above.
        { inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 11 } }
      ),
      series: [
        rankedBars({
          name: 'Funding (8h)',
          // Per-item label position: the outer end of the bar on either side, so
          // a negative bar's number never lands on top of the zero line.
          data: rows.map((c) => ({ value: Number((c.funding * 100).toFixed(4)), label: { position: c.funding >= 0 ? 'right' : 'left' } })),
          colorFor: (v: number) => (v >= 0 ? hot : cold),
          extra: {
            label: { show: true, fontSize: 10, color: 'inherit', formatter: (p: { value: number }) => `${Number(p.value).toFixed(3)}%` },
            // The zero line is the whole story here, so it gets its own stroke
            // rather than blending into the split lines.
            markLine: { silent: true, symbol: 'none', data: [{ xAxis: 0 }], lineStyle: { color: rgb(t.muted, 0.5), width: 1 }, label: { show: false } }
          }
        })
      ]
    };
  });

  $effect(() => {
    if (!$membershipReady || started) return;
    started = true;
    if (!canDeriv) {
      loading = false;
      return;
    }
    void load();
  });

  const zonePill = (s: number) => (s < 0.4 ? 'bg-mint/15 text-mint' : s < 0.6 ? 'bg-accent/15 text-accent' : s < 0.75 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger');
  const zoneBar = (s: number) => (s < 0.4 ? 'bg-mint' : s < 0.6 ? 'bg-accent' : s < 0.75 ? 'bg-warn' : 'bg-danger');
  const confPill = (c: string) => (c === 'High' ? 'bg-mint/15 text-mint' : c === 'Low' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const fundingPct = (f: number | null) => (f == null ? 'n/a' : `${(f * 100).toFixed(4)}%`);
  const fundTone = (f: number | null) => (f == null ? 'text-muted' : f < 0 ? 'text-accent' : f > 0.0003 ? 'text-warn' : 'text-soft');
  const lsTone = (v: number | null) => (v == null ? 'text-muted' : v > 1.6 ? 'text-warn' : v < 0.9 ? 'text-accent' : 'text-soft');

  // AI interpretation signals — built from the page's own computed live values.
  const zoneTone = (s: number) => (s < 0.4 ? 'good' : s < 0.6 ? 'neutral' : s < 0.75 ? 'warn' : 'danger');
  const fundSigTone = (f: number | null) => (f == null ? 'neutral' : f < 0 ? 'good' : f > 0.0003 ? 'warn' : 'neutral');
  const lsSigTone = (v: number | null) => (v == null ? 'neutral' : v > 1.6 ? 'warn' : v < 0.9 ? 'good' : 'neutral');
  const aiSignals = $derived(
    r && r.leverage_risk != null
      ? [
          { name: 'Leverage risk', label: r.label, value: `${r.leverage_risk.toFixed(2)} (${r.leverage_percent}/100)`, tone: zoneTone(r.leverage_risk) },
          { name: 'Confidence', label: `${r.confidence} confidence`, value: r.confidence, tone: r.confidence === 'High' ? 'good' : r.confidence === 'Low' ? 'danger' : 'warn' },
          { name: 'BTC funding (8h)', label: 'BTC funding rate', value: fundingPct(r.btc_funding_rate), tone: fundSigTone(r.btc_funding_rate) },
          { name: 'ETH funding (8h)', label: 'ETH funding rate', value: fundingPct(r.eth_funding_rate), tone: fundSigTone(r.eth_funding_rate) },
          { name: 'BTC long/short', label: 'BTC long/short ratio', value: r.btc_long_short == null ? 'n/a' : r.btc_long_short.toFixed(2), tone: lsSigTone(r.btc_long_short) },
          ...(r.hot_funding_breadth != null
            ? [{ name: 'Hot funding breadth', label: 'Share of futures with hot funding', value: `${r.hot_funding_breadth}%`, tone: r.hot_funding_breadth > 60 ? 'warn' : 'neutral' }]
            : [])
        ]
      : []
  );
</script>

<header class="mb-5 flex items-center gap-2">
  <Flame class="h-5 w-5 text-warn" />
  <div>
    <h1 class="text-xl font-semibold text-strong">Derivatives · Leverage Risk</h1>
    <p class="text-sm text-muted">How crowded and leveraged the futures market is right now — funding, open interest and positioning.</p>
  </div>
</header>

{#if !$membershipReady || loading}
  <p class="text-sm text-muted">Reading the futures market…</p>
{:else if !canDeriv}
  <LockedFeature
    title="Derivatives / Leverage Risk is a Mid & Premium feature"
    plan="Mid"
    bullets={['A single leverage-risk score from funding, open interest and long/short positioning', 'See when the market is crowded-long (fragile) or fearful (calmer)', 'Feeds the Overview and the Exit Strategy cycle read']}
  />
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if r}
  {#if r.leverage_risk == null}
    <div class="card border-warn/30 bg-warn/5">
      <p class="stat-label text-warn">Live derivatives data unavailable</p>
      <p class="mt-1 text-sm text-soft">{r.interpretation}</p>
    </div>
  {:else}
    <!-- Hero -->
    <div class="hero-card mb-3 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
      <div class="mx-auto"><Gauge value={r.leverage_risk} title="Leverage Risk" /></div>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-2xl font-bold text-strong">{r.leverage_risk.toFixed(2)} <span class="text-base text-muted">/ {r.leverage_percent}</span></span>
          <span class="pill {zonePill(r.leverage_risk)}">{r.label}</span>
          <span class="pill {confPill(r.confidence)}">{r.confidence} confidence</span>
        </div>
        <div class="meter mt-2 max-w-md"><div class="meter-fill {zoneBar(r.leverage_risk)}" style="width: {r.leverage_percent}%"></div></div>
        <p class="mt-2 max-w-2xl text-sm leading-relaxed text-soft">{r.interpretation}</p>
        {#if r.hot_funding_breadth != null}<p class="mt-1.5 text-xs text-muted">Funding breadth: <span class="font-medium text-soft">{r.hot_funding_breadth}%</span> of futures have hot (positive) funding.</p>{/if}
      </div>
    </div>

    <!-- AI interpretation -->
    <div class="mb-4">
      <AiInterpret module="derivatives" title="Leverage Risk" signals={aiSignals} />
    </div>

    <!-- Metric cards -->
    <div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
      <div class="card p-3" title="Funding rate per 8h. High positive = crowded longs paying to hold; negative = shorts pay (fear).">
        <p class="text-[11px] uppercase tracking-wide text-muted">BTC funding (8h)</p>
        <p class="text-lg font-bold {fundTone(r.btc_funding_rate)}">{fundingPct(r.btc_funding_rate)}</p>
      </div>
      <div class="card p-3" title="ETH funding rate per 8h.">
        <p class="text-[11px] uppercase tracking-wide text-muted">ETH funding (8h)</p>
        <p class="text-lg font-bold {fundTone(r.eth_funding_rate)}">{fundingPct(r.eth_funding_rate)}</p>
      </div>
      <div class="card p-3" title="Long/short account ratio. Above 1 = more longs; extremes are contrarian.">
        <p class="text-[11px] uppercase tracking-wide text-muted">BTC long / short</p>
        <p class="text-lg font-bold {lsTone(r.btc_long_short)}">{r.btc_long_short == null ? 'n/a' : r.btc_long_short.toFixed(2)}</p>
      </div>
      <div class="card p-3" title="ETH long/short account ratio.">
        <p class="text-[11px] uppercase tracking-wide text-muted">ETH long / short</p>
        <p class="text-lg font-bold {lsTone(r.eth_long_short)}">{r.eth_long_short == null ? 'n/a' : r.eth_long_short.toFixed(2)}</p>
      </div>
      <div class="card p-3" title="Total open interest in BTC — how much leverage is in the system.">
        <p class="text-[11px] uppercase tracking-wide text-muted">BTC open interest</p>
        <p class="text-lg font-bold text-strong">{r.btc_open_interest == null ? 'n/a' : `${Math.round(r.btc_open_interest).toLocaleString()} BTC`}</p>
      </div>
      <div class="card p-3" title="Total open interest in ETH.">
        <p class="text-[11px] uppercase tracking-wide text-muted">ETH open interest</p>
        <p class="text-lg font-bold text-strong">{r.eth_open_interest == null ? 'n/a' : `${Math.round(r.eth_open_interest).toLocaleString()} ETH`}</p>
      </div>
    </div>

    <!-- Leverage trend -->
    <div class="card mb-3">
      <div class="mb-1 flex items-center justify-between">
        <p class="stat-label">Leverage risk · last 90 days</p>
        <span class="text-[11px] text-muted">stored daily sync</span>
      </div>
      {#if chartOption}
        <EChart option={chartOption} height={220} />
      {:else}
        <p class="py-6 text-center text-sm text-muted">History is building — the daily sync adds one point per day. The trend chart appears once a few days have accumulated.</p>
      {/if}
    </div>

    <!-- Funding extremes -->
    {#if r.top_funding?.length || r.bottom_funding?.length}
      {#if fundingOption}
        <div class="card mb-3">
          <div class="mb-1 flex items-center justify-between">
            <p class="stat-label">Funding extremes · who is paying whom</p>
            <span class="text-[11px] text-muted">per 8h</span>
          </div>
          <p class="mb-1 text-xs leading-relaxed text-muted">
            Bars to the <span class="font-medium text-warn">right</span> = longs paying to stay long (crowded). Bars to the <span class="font-medium text-accent">left</span> = shorts
            paying longs (fear). Both sides use the same scale, so the longer side is where the crowd is.
          </p>
          <EChart option={fundingOption} height={fundingChartHeight} minWidth={0} />
        </div>
      {/if}
      <div class="mb-3 grid gap-3 sm:grid-cols-2">
        <div class="card p-3">
          <p class="stat-label text-warn">Most crowded longs <span class="font-normal text-muted">· highest funding</span></p>
          {#if r.top_funding?.length}
            <ul class="mt-2 space-y-1">
              {#each r.top_funding as c}
                <li class="flex items-center justify-between text-sm"><span class="font-medium text-soft">{c.symbol}</span><span class="text-warn">{(c.funding * 100).toFixed(3)}%</span></li>
              {/each}
            </ul>
          {:else}<p class="mt-2 text-sm text-muted">No coins with hot positive funding right now.</p>{/if}
        </div>
        <div class="card p-3">
          <p class="stat-label text-accent">Most fearful <span class="font-normal text-muted">· negative funding</span></p>
          {#if r.bottom_funding?.length}
            <ul class="mt-2 space-y-1">
              {#each r.bottom_funding as c}
                <li class="flex items-center justify-between text-sm"><span class="font-medium text-soft">{c.symbol}</span><span class="text-accent">{(c.funding * 100).toFixed(3)}%</span></li>
              {/each}
            </ul>
          {:else}<p class="mt-2 text-sm text-muted">No coins with negative funding right now.</p>{/if}
        </div>
      </div>
    {/if}

    <!-- How to read -->
    <div class="card mb-3">
      <AiLabel />
      <ul class="mt-1.5 space-y-1 text-sm text-muted">
        <li>• <span class="text-soft">Funding rate</span> — what longs pay shorts (or vice-versa) every 8h. Very high positive = crowded longs / overheated; negative = fear.</li>
        <li>• <span class="text-soft">Long / short ratio</span> — how traders are positioned. Extremes (very long or very short) often reverse.</li>
        <li>• <span class="text-soft">Open interest</span> — total leverage in the market. Rising OI with rising price = leverage building (more fragile).</li>
      </ul>
      <p class="mt-2 text-[12px] text-muted/80">This is a positioning/leverage gauge, not a price prediction. It works best alongside BTC risk, on-chain and social signals.</p>
    </div>

    <div class="mb-3 flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-xs leading-relaxed text-soft">
      <Info class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <span>Live page data comes directly from Bitget. The <span class="font-medium">Overview</span> and <span class="font-medium">Exit Strategy</span> use the stored daily sync for stable historical scoring, so their numbers may differ slightly from this live read.</span>
    </div>

    <div class="flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
      <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>Not financial advice. Derivatives data is live from Bitget public market endpoints and describes current leverage/positioning conditions — it does not predict price. Always do your own research.</span>
    </div>
  {/if}
{/if}
