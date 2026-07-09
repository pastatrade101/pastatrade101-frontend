<script lang="ts">
  import { onMount } from 'svelte';
  import { Lock, ChevronDown } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import { api } from '$lib/api';
  import Gauge from '$lib/components/Gauge.svelte';
  import EChart from '$lib/components/EChart.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import AiInterpret from '$lib/components/AiInterpret.svelte';
  import AiLottie from '$lib/components/AiLottie.svelte';
  import AiLabel from '$lib/components/AiLabel.svelte';
  import { fmtPct, fmtUsd } from '$lib/format';
  import { membership, hasFeature } from '$lib/stores/membership';

  // Social Metrics is a Mid+ feature, so the social card is gated here too.
  const canSocial = $derived(hasFeature($membership, 'access_social_metrics'));
  const canOnchain = $derived(hasFeature($membership, 'access_onchain_metrics'));
  // The premium takeaway / interpretation is gated by a feature flag (admin-toggleable
  // per plan) — free sees the score + zone, not the plain-language read.
  const canInterp = $derived(hasFeature($membership, 'access_premium_interpretation'));

  interface MetricRow {
    key: string;
    label: string;
    category: string;
    is_premium: boolean;
    description: string | null;
    raw_value: number | null;
    risk: number | null;
  }
  interface Summary {
    as_of: string;
    summary_risk: number | null;
    categories: { price: number | null; onchain: number | null; social: number | null };
  }
  interface Metrics {
    as_of: string | null;
    price: MetricRow[];
    onchain: MetricRow[];
    social: MetricRow[];
  }
  interface HistPoint {
    date: string;
    risk: number;
    btc_price: number;
  }
  interface ZonePeriod {
    start: string;
    end: string;
    days: number;
    avg_price: number;
    risk_min: number;
    risk_max: number;
    fwd_6m: number | null;
    fwd_12m: number | null;
  }
  interface SocialData {
    as_of: string;
    social_risk_score: number | null;
    label: string;
    coverage_status: string;
    interpretation: string;
    source_status: Record<string, string>;
  }
  interface SocialHistPoint {
    date: string;
    trends_bitcoin: number | null;
    trends_bitcoin_price: number | null;
    fear_greed: number | null;
    social_risk_score: number | null;
    btc_price: number | null;
  }
  interface OnchainHistPoint {
    date: string;
    mvrv_zscore: number | null;
    puell_multiple: number | null;
    nupl: number | null;
    reserve_risk: number | null;
    onchain_risk: number | null;
    btc_price: number | null;
  }

  let bounds = $state<{ start: string; end: string } | null>(null);
  let dayIndex = $state(0);
  let summary = $state<Summary | null>(null);
  let metrics = $state<Metrics | null>(null);
  let hist = $state<HistPoint[]>([]);
  let zones = $state<Record<'aggressive' | 'good' | 'distribution', ZonePeriod[]> | null>(null);
  let social = $state<SocialData | null>(null);
  let socialHist = $state<SocialHistPoint[]>([]);
  let onchainHist = $state<OnchainHistPoint[]>([]);
  let onchainLatest = $state<Record<string, { raw: number | null; risk: number | null }>>({});

  // Mobile disclosure state (mirrors the Overview mobile pattern).
  let showMethodology = $state(false);
  let showZoneLegend = $state(false);
  let expandedTakeaway = $state(false);

  // ── Supply in Profit & Loss (Premium on-chain module) ──
  type SupplyTone = 'profit' | 'healthy' | 'neutral' | 'loss' | 'capitulation' | 'recovery';
  interface SupplySummary {
    date: string;
    btc_price: number | null;
    supply_in_profit_percent: number;
    supply_in_loss_percent: number;
    supply_in_profit_btc: number | null;
    supply_in_loss_btc: number | null;
    profit_loss_ratio: number | null;
    profit_loss_spread: number;
    current_state: string;
    signal: string;
    tone: SupplyTone;
    interpretation: string;
    premium_takeaway: string;
    risk_score: number;
    risk_label: string;
    recent_crossover: { date: string; type: 'profit_above_loss' | 'loss_above_profit'; meaning: string } | null;
    source_name: string;
    source_status: string;
    last_synced: string;
  }
  interface SupplyHistPoint {
    date: string;
    btc_price: number | null;
    supply_in_profit_percent: number | null;
    supply_in_loss_percent: number | null;
    profit_loss_ratio: number | null;
    profit_loss_spread: number | null;
  }
  interface SupplyCrossover { date: string; type: 'profit_above_loss' | 'loss_above_profit'; meaning: string }
  let supplyPL = $state<SupplySummary | null>(null);
  let supplyHist = $state<SupplyHistPoint[]>([]);
  let supplyCrossovers = $state<SupplyCrossover[]>([]);
  let supplyAnalyst = $state(false);
  let supplyMode = $state<'profit' | 'loss' | 'both'>('both'); // which % lines (Supply In)
  let supplyMA = $state(0); // moving-average window in days (0 = none)
  let supplyPriceLog = $state(true); // BTC price axis scale
  let supplyMetricLog = $state(false); // % axis scale
  let supplyRange = $state<'30D' | '90D' | '1Y' | 'All'>('All');
  let sLines = $state({ btc: true, spread: false, ratio: false, crossovers: true });
  const setSupplyView = (analyst: boolean) => {
    supplyAnalyst = analyst;
    sLines = { btc: true, spread: analyst, ratio: false, crossovers: true };
  };
  // On-chain lags price by a day, so today's category can be null — fall back to
  // the latest synced on-chain composite (mirrors the social gauge's fallback).
  const latestOnchainRisk = $derived(onchainHist.length ? (onchainHist[onchainHist.length - 1].onchain_risk ?? null) : null);
  let histLog = $state(true);
  let showRisk = $state(true);
  let showPrice = $state(true);
  let showZones = $state(true);
  let showEvents = $state(false);
  let showCurrent = $state(true);
  let error = $state('');
  let loading = $state(true);

  const DAY = 86_400_000;
  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
  const addDays = (start: string, n: number) => new Date(Date.parse(start) + n * DAY).toISOString().slice(0, 10);

  const maxIndex = $derived(bounds ? daysBetween(bounds.start, bounds.end) : 0);
  const currentDate = $derived(bounds ? addDays(bounds.start, dayIndex) : '');

  // ── DCA zones (0–1 risk → action) ──
  const ZONES = [
    { max: 0.2, label: 'Aggressive DCA zone', action: 'Aggressive DCA', color: '#2fbf71', msg: 'Very low risk. Historically this type of zone has been attractive for aggressive accumulation, but still manage cash and avoid overexposure.' },
    { max: 0.4, label: 'Good DCA zone', action: 'Good DCA', color: '#9acd3e', msg: 'Good DCA zone. Bitcoin appears relatively attractive for disciplined accumulation, but not necessarily at maximum fear.' },
    { max: 0.6, label: 'Neutral / normal DCA', action: 'Normal DCA', color: '#ffd23f', msg: 'Neutral zone. Normal DCA can continue, but risk/reward is less attractive than deep accumulation zones.' },
    { max: 0.8, label: 'Reduce DCA / caution', action: 'Cautious DCA', color: '#ff8c42', msg: 'Caution zone. Consider reducing aggressive DCA and watch for signs of overheating.' },
    { max: 1.01, label: 'Distribution / high-risk zone', action: 'Distribution zone', color: '#ff5d6c', msg: 'High-risk / distribution zone. Historically better suited for caution, profit-taking, or reducing exposure rather than aggressive accumulation.' }
  ];
  const zoneFor = (r: number) => ZONES.find((z) => r < z.max) ?? ZONES[ZONES.length - 1];
  const riskColor = (r: number | null) => (r == null ? '#8b97a8' : zoneFor(r).color);

  // The raw daily risk is noisy, so the headline "current risk" uses the SAME
  // 21-day smoothed value as the chart line — keeping the badge, gauge, "Now"
  // marker and tooltip in agreement.
  const smoothedByDate = $derived.by(() => {
    const m = new Map<string, number>();
    const win = 21;
    hist.forEach((_, i) => {
      const from = Math.max(0, i - win + 1);
      let s = 0;
      for (let j = from; j <= i; j += 1) s += hist[j].risk;
      m.set(hist[i].date, s / (i - from + 1));
    });
    return m;
  });
  const displayRisk = $derived(smoothedByDate.get(currentDate) ?? summary?.summary_risk ?? null);
  const zone = $derived(displayRisk != null ? zoneFor(displayRisk) : null);

  // Plain-language verdict — the decision, not the score (the 0–100 stays as proof).
  const humanVerdict = $derived.by(() => {
    const r = displayRisk;
    if (r == null) return { head: 'Bitcoin risk is unavailable', sub: 'Not enough data to read the market yet.', action: '' };
    if (r < 0.2) return { head: 'Bitcoin looks deeply undervalued', sub: 'A strong zone for disciplined accumulation.', action: 'Good time to buy — slowly and consistently.' };
    if (r < 0.4) return { head: 'Bitcoin is not overheated', sub: 'A good zone for disciplined buying.', action: 'Reasonable time to DCA — no need to rush.' };
    if (r < 0.6) return { head: 'Bitcoin is fairly priced', sub: 'Neutral — not cheap, not expensive.', action: 'Keep buying measured, not aggressive.' };
    if (r < 0.8) return { head: 'Bitcoin is getting expensive', sub: 'Risk is building above healthy levels.', action: 'Be cautious — ease off aggressive buying.' };
    return { head: 'Bitcoin looks overheated', sub: 'Historically a high-risk zone.', action: 'Consider taking some profit, not adding aggressively.' };
  });

  const shortInterp = (r: number) =>
    r < 0.2
      ? 'Aggressive accumulation zone.'
      : r < 0.4
        ? 'Disciplined accumulation remains reasonable, but not extreme fear.'
        : r < 0.6
          ? 'Neutral — normal DCA.'
          : r < 0.8
            ? 'Caution — risk is building.'
            : 'Distribution — historically better suited for caution.';

  // Optional major-event markers.
  const EVENTS = [
    { date: '2013-12-04', label: '2013 top' },
    { date: '2015-01-14', label: '2015 low' },
    { date: '2017-12-17', label: '2017 top' },
    { date: '2018-12-15', label: '2018 low' },
    { date: '2020-03-12', label: 'COVID crash' },
    { date: '2021-11-10', label: '2021 high' },
    { date: '2022-11-21', label: '2022 low' },
    { date: '2024-04-20', label: '2024 halving' }
  ];

  const coverage = $derived({
    price: summary?.categories.price != null,
    onchain: summary?.categories.onchain != null || latestOnchainRisk != null,
    social: summary?.categories.social != null || social?.social_risk_score != null
  });

  // ── On-chain intelligence ───────────────────────────────────────────────
  const onchainComposite = $derived(summary?.categories.onchain ?? latestOnchainRisk ?? null);

  // 0–1 composite → status band (label, meaning, DCA stance, colour classes).
  const ONCHAIN_BANDS = [
    { max: 0.2, label: 'Deep value', meaning: 'Historically a strong accumulation-friendly environment.', dca: 'Deep value — historically a strong accumulation-friendly environment.', pill: 'bg-mint/15 text-mint', text: 'text-mint', bar: 'bg-mint' },
    { max: 0.4, label: 'Low on-chain risk', meaning: 'Bitcoin is not showing strong on-chain overheating.', dca: 'Low on-chain risk — disciplined DCA remains reasonable.', pill: 'bg-mint/15 text-mint', text: 'text-mint', bar: 'bg-mint' },
    { max: 0.6, label: 'Neutral', meaning: 'On-chain conditions are balanced — neither cheap nor stretched.', dca: 'Neutral — on-chain conditions are balanced.', pill: 'bg-warn/15 text-warn', text: 'text-warn', bar: 'bg-warn' },
    { max: 0.8, label: 'Elevated on-chain risk', meaning: 'On-chain valuation is getting rich.', dca: 'Elevated risk — reduce aggressive DCA and watch for overheating.', pill: 'bg-warn/15 text-warn', text: 'text-warn', bar: 'bg-warn' },
    { max: 1.01, label: 'Euphoria / high risk', meaning: 'Historically a caution / distribution-awareness zone.', dca: 'Euphoria / high risk — historically better suited for caution or distribution awareness.', pill: 'bg-danger/15 text-danger', text: 'text-danger', bar: 'bg-danger' }
  ];
  const onchainStatus = $derived(onchainComposite == null ? null : (ONCHAIN_BANDS.find((b) => onchainComposite < b.max) ?? ONCHAIN_BANDS[4]));

  const riskLabel = (r: number | null) => (r == null ? '—' : r < 0.4 ? 'Low' : r < 0.6 ? 'Moderate' : r < 0.8 ? 'Elevated' : 'High');
  const riskPill = (r: number | null) => (r == null ? 'bg-edge text-muted' : r < 0.4 ? 'bg-mint/15 text-mint' : r < 0.8 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger');
  const rawFmt = (key: string, v: number | null) => {
    if (v == null) return '—';
    if (key === 'reserve_risk') return v.toExponential(2);
    return v.toLocaleString('en-US', { maximumFractionDigits: 3 });
  };
  const joinList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

  // Per-metric cards — built from the latest synced on-chain snapshot (not the
  // slider date, since on-chain lags price by a day).
  const ONCHAIN_LABELS: Record<string, string> = { mvrv_zscore: 'MVRV Z-Score', puell_multiple: 'Puell Multiple', nupl: 'NUPL', reserve_risk: 'Reserve Risk' };
  const onchainCards = $derived(
    ['mvrv_zscore', 'puell_multiple', 'nupl', 'reserve_risk']
      .filter((k) => onchainLatest[k]?.risk != null)
      .map((k) => {
        const risk = onchainLatest[k].risk as number;
        return { key: k, label: ONCHAIN_LABELS[k], raw: onchainLatest[k].raw, risk, riskLabel: riskLabel(risk), pill: riskPill(risk), meaning: meaningFor(k, risk) };
      })
  );

  // Which metric is contributing the most.
  const mainDriver = $derived.by(() => {
    if (!onchainCards.length) return null;
    const top = [...onchainCards].sort((a, b) => b.risk - a.risk)[0];
    if (top.risk < 0.4) return { name: null, text: 'No single metric is showing extreme risk.', meaning: 'The on-chain model is broadly calm.' };
    return { name: top.label, text: `${top.label} is currently the highest contributor to on-chain risk.`, meaning: meaningFor(top.key, top.risk) };
  });

  // Summary interpretation + premium takeaway from the composite + drivers.
  const onchainInterpretation = $derived.by(() => {
    if (onchainComposite == null || !onchainCards.length) return '';
    const lo = onchainCards.filter((c) => c.risk < 0.4).map((c) => c.label);
    const mid = onchainCards.filter((c) => c.risk >= 0.4 && c.risk < 0.6).map((c) => c.label);
    const hi = onchainCards.filter((c) => c.risk >= 0.6).map((c) => c.label);
    const parts: string[] = [];
    if (lo.length) parts.push(`${joinList(lo)} ${lo.length > 1 ? 'remain' : 'remains'} relatively low`);
    if (mid.length) parts.push(`${joinList(mid)} ${mid.length > 1 ? 'are' : 'is'} moderate`);
    if (hi.length) parts.push(`${joinList(hi)} ${hi.length > 1 ? 'are' : 'is'} elevated`);
    const head = onchainComposite < 0.6 ? 'On-chain metrics are not showing broad euphoria.' : 'On-chain metrics are showing rising risk.';
    const stance =
      onchainComposite < 0.4
        ? 'This supports a disciplined DCA environment, but not an extreme bottom signal.'
        : onchainComposite < 0.6
          ? 'Conditions are broadly balanced.'
          : onchainComposite < 0.8
            ? 'Risk is building — favour caution over aggressive accumulation.'
            : 'Conditions look historically stretched — closer to distribution than accumulation.';
    return `${head} ${parts.join(', ')}. ${stance}`;
  });
  const onchainPremiumTakeaway = $derived.by(() => {
    if (onchainComposite == null) return '';
    return onchainComposite < 0.6
      ? 'On-chain risk remains low-to-moderate — this supports disciplined accumulation, but it is not an extreme bottom signal. The model does not currently show broad holder euphoria or excessive miner-risk conditions.'
      : 'On-chain risk is rising but watch for MVRV-Z, NUPL and Puell to climb together before treating this as a high-risk distribution environment.';
  });

  const onchainLastSynced = $derived(onchainHist.length ? onchainHist[onchainHist.length - 1].date : null);

  // Beginner-friendly metric explanations (expandable).
  const ONCHAIN_EXPLAIN: Record<string, string> = {
    mvrv_zscore: 'Compares Bitcoin’s market value to its realized value. High values can signal overheating; low values can signal undervaluation.',
    puell_multiple: 'Compares daily miner revenue to its yearly average. High values suggest unusually strong miner revenue (a hot market); low values can show miner stress / cycle lows.',
    nupl: 'Net Unrealized Profit/Loss across the network. High NUPL means holders sit on large paper profits, which can raise distribution risk.',
    reserve_risk: 'Long-term-holder conviction relative to price. Low values support accumulation conditions; high values suggest higher cycle risk.'
  };

  // Chart line visibility — Simple view shows only BTC + composite.
  let analystMode = $state(false);
  let lines = $state({ btc: true, composite: true, mvrv: false, puell: false, nupl: false, reserve: false });
  const setView = (analyst: boolean) => {
    analystMode = analyst;
    lines = { btc: true, composite: true, mvrv: analyst, puell: analyst, nupl: analyst, reserve: analyst };
  };

  // Human list of the categories actually contributing to today's score.
  const coverageList = $derived.by(() => {
    const active: string[] = [];
    if (coverage.price) active.push('Price Metrics');
    if (coverage.social) active.push('Social Metrics');
    if (coverage.onchain) active.push('On-Chain Metrics');
    if (active.length <= 1) return active[0] ?? 'Price Metrics';
    return `${active.slice(0, -1).join(', ')} and ${active[active.length - 1]}`;
  });

  // Map a 0–1 risk value to an AiInterpret tone (low risk is favourable for DCA).
  const riskTone = (r: number | null): 'good' | 'neutral' | 'warn' | 'danger' =>
    r == null ? 'neutral' : r < 0.4 ? 'good' : r < 0.6 ? 'neutral' : r < 0.8 ? 'warn' : 'danger';

  // Signals for the AI interpretation — built from the page's own computed values.
  const aiSignals = $derived(
    displayRisk != null && zone
      ? [
          { name: 'Overall risk verdict', label: humanVerdict.head, value: `${Math.round(displayRisk * 100)}/100`, meaning: humanVerdict.action || humanVerdict.sub, tone: riskTone(displayRisk) },
          { name: 'DCA zone', label: zone.label, value: zone.action, meaning: shortInterp(displayRisk), tone: riskTone(displayRisk) },
          ...(canOnchain && onchainComposite != null && onchainStatus
            ? [{ name: 'On-chain risk', label: onchainStatus.label, value: onchainComposite.toFixed(2), meaning: onchainStatus.meaning, tone: riskTone(onchainComposite) }]
            : []),
          ...(canSocial && social?.social_risk_score != null
            ? [{ name: 'Social risk', label: social.label, value: social.social_risk_score.toFixed(2), meaning: social.interpretation, tone: riskTone(social.social_risk_score) }]
            : [])
        ]
      : []
  );

  const summaryText = $derived.by(() => {
    if (displayRisk == null || !zone) return '';
    const r = displayRisk;
    const tail =
      r < 0.4
        ? 'This suggests the market is still relatively attractive for disciplined accumulation, but it is not an extreme bottom/fear zone.'
        : r < 0.6
          ? 'Risk/reward is balanced — neither historically cheap nor stretched.'
          : 'Conditions are getting rich; favour caution over aggressive accumulation.';
    return `Current risk score is ${r.toFixed(3)}, placing Bitcoin in the ${zone.label}. ${tail}`;
  });

  const premiumTakeaway = $derived.by(() => {
    if (displayRisk == null || !zone) return '';
    const r = displayRisk;
    const band = r < 0.4 ? 'low-to-moderate' : r < 0.6 ? 'moderate' : r < 0.8 ? 'elevated' : 'high';
    const stance = r < 0.4 ? 'The model supports disciplined DCA' : r < 0.6 ? 'The model supports normal DCA' : 'The model favours caution over accumulation';
    return `BTC risk is currently ${band}. ${stance}, ${r < 0.4 ? 'though it does not yet show an extreme bottom zone' : r < 0.8 ? 'with risk building' : 'as conditions look historically stretched'}. Price metrics drive the score today; on-chain and social metrics would give a fuller picture once connected.`;
  });

  // Per-metric plain-language meaning.
  const meaningFor = (key: string, risk: number): string => {
    const lo = risk < 0.4;
    const hi = risk > 0.6;
    switch (key) {
      case 'log_regression':
        return lo ? 'BTC is still relatively low versus its long-term regression band, reducing overall risk.' : hi ? 'BTC is extended above its regression band, which adds risk.' : 'BTC is mid-range versus its long-term regression band.';
      case 'mayer_multiple':
        return lo ? 'Price is near or below the 200-day MA zone, which reduces risk.' : hi ? 'Price is well above the 200-day MA, which adds risk.' : 'Price is moderately above the 200-day MA.';
      case 'price_drawdown':
        return lo ? 'BTC is deeply discounted from its all-time high, which reduces risk.' : hi ? 'BTC is close to its all-time high, which adds risk.' : 'BTC is not deeply discounted from ATH, so this adds moderate risk.';
      case 'rsi_risk':
        return lo ? 'Momentum is oversold, which reduces risk.' : hi ? 'Momentum is overbought, which adds risk.' : 'Momentum is neither deeply oversold nor extremely overheated.';
      case 'fear_greed':
        return lo ? 'Sentiment is still relatively low, which supports accumulation.' : hi ? 'Greed is elevated, which adds risk.' : 'Sentiment is balanced.';
      case 'wikipedia_views':
        return lo ? 'Public attention is low, which can reduce risk.' : hi ? 'Public attention is spiking, which can add risk.' : 'Public attention is moderate.';
      case 'mvrv_zscore':
        return lo ? 'MVRV Z-Score is low — BTC looks undervalued versus realized value (lower risk).' : hi ? 'MVRV Z-Score is elevated — BTC looks richly valued versus realized value (higher risk).' : 'MVRV Z-Score is mid-range.';
      case 'puell_multiple':
        return lo ? 'Miner revenue is low versus its yearly average — historically near cycle lows (lower risk).' : hi ? 'Miner revenue is high versus its yearly average — historically near cycle tops (higher risk).' : 'Miner revenue is moderate versus its yearly average.';
      case 'nupl':
        return lo ? 'Net unrealized profit is low — closer to capitulation/accumulation (lower risk).' : hi ? 'Net unrealized profit is high — closer to euphoria (higher risk).' : 'Net unrealized profit is moderate.';
      case 'reserve_risk':
        return lo ? 'Reserve Risk is low — strong long-term-holder conviction at low prices (attractive risk/reward).' : hi ? 'Reserve Risk is elevated — weaker conviction relative to price (higher risk).' : 'Reserve Risk is mid-range.';
      default:
        return '';
    }
  };

  const CATEGORY_EXPLAIN: Record<string, string> = {
    price: 'Calculated from price-based indicators: logarithmic regression, Mayer Multiple, ATH distance, RSI, and Fear & Greed.',
    onchain: 'On-chain valuation signals — MVRV Z-Score, Puell Multiple, NUPL and Reserve Risk — normalized to 0–1 (Premium).',
    social: 'Measures public attention. High attention during high-price periods may increase risk; low attention during drawdowns may reduce risk.'
  };

  const loadForDate = async (date: string) => {
    const [s, m] = await Promise.all([api<Summary>(`/risk/summary?date=${date}`), api<Metrics>(`/risk/metrics?date=${date}`)]);
    summary = s;
    metrics = m;
  };

  let timer: ReturnType<typeof setTimeout>;
  const onSlide = () => {
    clearTimeout(timer);
    timer = setTimeout(() => loadForDate(currentDate).catch(() => {}), 120);
  };

  onMount(async () => {
    try {
      const tl = await api<{ start: string | null; end: string | null }>('/risk/timeline');
      if (!tl.start || !tl.end) {
        error = 'Risk data is not available yet. Run a risk sync from the Admin panel.';
        return;
      }
      bounds = { start: tl.start, end: tl.end };
      dayIndex = daysBetween(tl.start, tl.end);
      await loadForDate(tl.end);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load risk data.';
    } finally {
      loading = false;
    }
    try {
      hist = await api<{ series: HistPoint[] }>('/risk/history').then((r) => r.series);
    } catch {
      /* chart optional */
    }
    try {
      zones = await api<Record<'aggressive' | 'good' | 'distribution', ZonePeriod[]>>('/risk/dca-zones');
    } catch {
      /* zone history optional */
    }
    try {
      // Social Metrics endpoints require auth + the Mid+ feature.
      social = await api<SocialData>('/social-metrics/btc', { auth: true });
      socialHist = await api<{ series: SocialHistPoint[] }>('/social-metrics/btc/history', { auth: true }).then((r) => r.series);
    } catch {
      /* not entitled (Free) or not synced — handled in the UI */
    }
    try {
      // On-chain history is Premium-gated server-side.
      const r = await api<{ series: OnchainHistPoint[]; latest: Record<string, { raw: number | null; risk: number | null }> }>('/risk/onchain-history', { auth: true });
      onchainHist = r.series;
      onchainLatest = r.latest ?? {};
    } catch {
      /* not entitled or not synced — handled in the UI */
    }
    try {
      // Supply in Profit/Loss is Premium-gated server-side.
      supplyPL = await api<SupplySummary>('/onchain/supply-profit-loss', { auth: true });
      const h = await api<{ available: boolean; series: SupplyHistPoint[]; crossovers: SupplyCrossover[] }>('/onchain/supply-profit-loss/history', { auth: true });
      supplyHist = h.series ?? [];
      supplyCrossovers = h.crossovers ?? [];
    } catch {
      /* not entitled (Free/Mid) or not synced — handled in the UI */
    }
  });

  const onchainHistOption = $derived.by(() => {
    if (!onchainHist.length) return {};
    const line = (name: string, color: string, field: keyof OnchainHistPoint, on: boolean, width = 1, axis = 0) => ({
      name,
      type: 'line',
      yAxisIndex: axis,
      showSymbol: false,
      smooth: true,
      itemStyle: { color },
      lineStyle: { width, color, opacity: on ? 1 : 0 },
      tooltip: { show: on },
      data: on ? onchainHist.filter((p) => p[field] != null).map((p) => [ts(p.date), p[field] as number]) : []
    });
    // Shaded 0–1 risk zones with inline labels (attached to the composite series).
    const zone = (lo: number, hi: number, color: string, name: string) => [
      { yAxis: lo, itemStyle: { color }, label: { show: true, position: 'insideLeft' as const, color: '#6B7280', fontSize: 9, formatter: name } },
      { yAxis: hi }
    ];
    const compositeSeries = {
      name: 'On-chain risk',
      type: 'line',
      yAxisIndex: 0,
      showSymbol: false,
      smooth: true,
      z: 5,
      itemStyle: { color: '#EF4444' },
      lineStyle: { width: 2.6, color: '#EF4444', opacity: lines.composite ? 1 : 0 },
      tooltip: { show: lines.composite },
      data: lines.composite ? onchainHist.filter((p) => p.onchain_risk != null).map((p) => [ts(p.date), p.onchain_risk as number]) : [],
      markArea: {
        silent: true,
        data: [
          zone(0, 0.2, 'rgba(34,197,94,0.07)', 'Deep value'),
          zone(0.2, 0.4, 'rgba(154,205,62,0.06)', 'Low risk'),
          zone(0.4, 0.6, 'rgba(255,210,63,0.06)', 'Neutral'),
          zone(0.6, 0.8, 'rgba(255,140,66,0.07)', 'Elevated'),
          zone(0.8, 1, 'rgba(239,68,68,0.08)', 'Euphoria')
        ]
      }
    };
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { axisValueLabel?: string; axisValue?: number; seriesName: string; value: [number, number]; marker: string }[]) => {
          if (!params?.length) return '';
          const d = new Date(params[0].axisValue ?? params[0].value[0]).toISOString().slice(0, 10);
          const get = (n: string) => params.find((p) => p.seriesName === n)?.value?.[1];
          const oc = get('On-chain risk');
          const band = oc == null ? null : (ONCHAIN_BANDS.find((b) => oc < b.max) ?? ONCHAIN_BANDS[4]);
          let html = `<div style="font-size:11px"><b>${d}</b>`;
          const btc = get('BTC price');
          if (btc != null) html += `<br/>BTC: $${Math.round(btc).toLocaleString()}`;
          if (oc != null) html += `<br/>On-chain risk: <b>${oc.toFixed(3)}</b>${band ? ` · ${band.label}` : ''}`;
          for (const n of ['MVRV-Z', 'Puell', 'NUPL', 'Reserve Risk']) {
            const v = get(n);
            if (v != null) html += `<br/>${n}: ${v.toFixed(3)}`;
          }
          if (band) html += `<br/><span style="color:#9CA3AF">${band.meaning}</span>`;
          return `${html}</div>`;
        }
      },
      legend: { type: 'scroll', top: 0, textStyle: { color: '#9CA3AF' }, data: ['BTC price', 'On-chain risk', 'MVRV-Z', 'Puell', 'NUPL', 'Reserve Risk'] },
      grid: { left: 8, right: 8, top: 32, bottom: 8, containLabel: true },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' } },
      yAxis: [
        { type: 'value', name: 'Risk 0–1', min: 0, max: 1, position: 'left', nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#1F2937' } } },
        { type: 'log', name: 'BTC', position: 'right', nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF' }, splitLine: { show: false } }
      ],
      series: [
        line('BTC price', '#37e0a6', 'btc_price', lines.btc, 1.4, 1),
        compositeSeries,
        line('MVRV-Z', '#3B82F6', 'mvrv_zscore', lines.mvrv, 1, 0),
        line('Puell', '#A855F7', 'puell_multiple', lines.puell, 1, 0),
        line('NUPL', '#F59E0B', 'nupl', lines.nupl, 1, 0),
        line('Reserve Risk', '#22C55E', 'reserve_risk', lines.reserve, 1, 0)
      ]
    };
  });

  // ── Supply in Profit/Loss chart + tone styling ──
  const TONE: Record<SupplyTone, { pill: string; bar: string; text: string }> = {
    profit: { pill: 'bg-warn/15 text-warn', bar: 'bg-warn', text: 'text-warn' },
    healthy: { pill: 'bg-mint/15 text-mint', bar: 'bg-mint', text: 'text-mint' },
    neutral: { pill: 'bg-warn/15 text-warn', bar: 'bg-warn', text: 'text-warn' },
    loss: { pill: 'bg-warn/15 text-warn', bar: 'bg-warn', text: 'text-warn' },
    capitulation: { pill: 'bg-danger/15 text-danger', bar: 'bg-danger', text: 'text-danger' },
    recovery: { pill: 'bg-mint/15 text-mint', bar: 'bg-mint', text: 'text-mint' }
  };
  const supplyTone = $derived(supplyPL ? TONE[supplyPL.tone] : TONE.neutral);
  const fmtBtcAmt = (v: number | null) => (v == null ? '—' : `${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v)} BTC`);

  const RANGE_DAYS: Record<'30D' | '90D' | '1Y' | 'All', number> = { '30D': 30, '90D': 90, '1Y': 365, All: Infinity };
  const supplyView = $derived.by(() => {
    if (!supplyHist.length) return [] as SupplyHistPoint[];
    const days = RANGE_DAYS[supplyRange];
    if (!Number.isFinite(days)) return supplyHist;
    const cutoff = ts(supplyHist[supplyHist.length - 1].date) - days * DAY;
    return supplyHist.filter((p) => ts(p.date) >= cutoff);
  });

  // Trailing moving average over `n` days (n<=1 → raw series).
  const movAvg = (field: keyof SupplyHistPoint, n: number): [number, number][] => {
    const pts = supplyView.filter((p) => p[field] != null).map((p) => [ts(p.date), Number(p[field])] as [number, number]);
    if (n <= 1) return pts;
    return pts.map((pt, i) => {
      const from = Math.max(0, i - n + 1);
      let s = 0;
      for (let j = from; j <= i; j += 1) s += pts[j][1];
      return [pt[0], s / (i - from + 1)];
    });
  };
  const C_BTC = '#4FA3F7';
  const C_PROFIT = '#F5A623';
  const C_LOSS = '#FF5D6C';

  const supplyOption = $derived.by(() => {
    if (!supplyView.length) return {};
    const showProfit = supplyMode !== 'loss';
    const showLoss = supplyMode !== 'profit';
    const line = (field: keyof SupplyHistPoint, name: string, color: string, on: boolean, width = 1.8, extra: Record<string, unknown> = {}) => ({
      name,
      type: 'line',
      yAxisIndex: 1,
      showSymbol: false,
      smooth: true,
      itemStyle: { color },
      lineStyle: { width, color, opacity: on ? 1 : 0 },
      tooltip: { show: on },
      data: on ? movAvg(field, supplyMA) : [],
      ...extra
    });
    // Crossovers cluster heavily when profit/loss oscillate around 50%, which is
    // visual noise — keep only those ≥21 days apart (real regime changes), and
    // never show the default markLine label (it prints the raw timestamp).
    const crossData = (() => {
      if (!sLines.crossovers) return [] as { xAxis: number; lineStyle: Record<string, unknown>; label: { show: false } }[];
      const MIN_GAP = 21 * DAY;
      const out: { xAxis: number; lineStyle: Record<string, unknown>; label: { show: false } }[] = [];
      let lastTs = -Infinity;
      for (const c of supplyCrossovers) {
        const t = ts(c.date);
        if (t < ts(supplyView[0].date) || t - lastTs < MIN_GAP) continue;
        lastTs = t;
        out.push({
          xAxis: t,
          lineStyle: { color: c.type === 'profit_above_loss' ? '#22C55E' : '#EF4444', type: 'dashed' as const, width: 1, opacity: 0.55 },
          label: { show: false }
        });
      }
      return out;
    })();
    // Negatives (spread) need an auto-scaled metric axis; the clean 0–100 look
    // is kept whenever spread/ratio aren't shown.
    const metricNeedsNeg = sLines.spread;
    const metricAxis = supplyMetricLog
      ? { type: 'log' as const, scale: true }
      : metricNeedsNeg
        ? { type: 'value' as const, scale: true }
        : { type: 'value' as const, min: 0, max: 100 };
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0E1117',
        borderColor: '#1F2937',
        textStyle: { color: '#F9FAFB' },
        formatter: (params: { axisValue?: number; value: [number, number]; seriesName: string }[]) => {
          if (!params?.length) return '';
          const d = new Date(params[0].axisValue ?? params[0].value[0]).toISOString().slice(0, 10);
          const get = (n: string) => params.find((p) => p.seriesName === n)?.value?.[1];
          let html = `<div style="font-size:11px"><b>${d}</b>`;
          const btc = get('BTC Price');
          if (btc != null) html += `<br/>BTC: $${Math.round(btc).toLocaleString()}`;
          const pf = get('% Supply In Profit');
          const ls = get('% Supply In Loss');
          if (pf != null) html += `<br/><span style="color:${C_PROFIT}">% Supply In Profit: ${pf.toFixed(1)}%</span>`;
          if (ls != null) html += `<br/><span style="color:${C_LOSS}">% Supply In Loss: ${ls.toFixed(1)}%</span>`;
          const sp = get('Spread');
          if (sp != null) html += `<br/>Spread: ${sp > 0 ? '+' : ''}${sp.toFixed(1)}%`;
          const rt = get('P/L Ratio');
          if (rt != null) html += `<br/>P/L Ratio: ${rt.toFixed(2)}`;
          const cross = supplyCrossovers.find((c) => c.date === d);
          if (cross) html += `<br/><span style="color:${cross.type === 'profit_above_loss' ? '#22C55E' : '#EF4444'}">⟂ ${cross.type === 'profit_above_loss' ? 'Profit crossed above loss' : 'Loss crossed above profit'}</span>`;
          return `${html}</div>`;
        }
      },
      legend: { type: 'scroll', bottom: 0, textStyle: { color: '#9CA3AF' } },
      grid: { left: 8, right: 8, top: 16, bottom: 30, containLabel: true },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#1F2937' } } },
      yAxis: [
        {
          ...(supplyPriceLog ? { type: 'log' as const } : { type: 'value' as const }),
          name: 'Price ($)',
          scale: true,
          position: 'left',
          nameTextStyle: { color: '#9CA3AF' },
          axisLabel: { color: '#9CA3AF', formatter: (v: number) => '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v) },
          splitLine: { lineStyle: { color: '#1F2937' } }
        },
        {
          ...metricAxis,
          name: '% Of Total Supply',
          position: 'right',
          nameTextStyle: { color: '#9CA3AF' },
          axisLabel: { color: '#9CA3AF', formatter: '{value}%' },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: 'BTC Price',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          smooth: true,
          itemStyle: { color: C_BTC },
          lineStyle: { width: 1.4, color: C_BTC, opacity: sLines.btc ? 1 : 0 },
          tooltip: { show: sLines.btc },
          data: sLines.btc ? supplyView.filter((p) => p.btc_price != null).map((p) => [ts(p.date), Number(p.btc_price)]) : []
        },
        line('supply_in_profit_percent', '% Supply In Profit', C_PROFIT, showProfit, 1.6, {
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              ...(metricNeedsNeg || supplyMetricLog ? [] : [{ yAxis: 50, lineStyle: { color: '#6B7280', type: 'dotted' as const }, label: { show: true, formatter: '50%', color: '#6B7280', fontSize: 9 } }]),
              ...crossData
            ]
          }
        }),
        line('supply_in_loss_percent', '% Supply In Loss', C_LOSS, showLoss, 1.6),
        line('profit_loss_spread', 'Spread', '#A855F7', sLines.spread, 1.4),
        line('profit_loss_ratio', 'P/L Ratio', '#22D3EE', sLines.ratio, 1.4)
      ]
    };
  });

  const srcColor = (s: string) =>
    s === 'Active' ? 'bg-mint/15 text-mint' : s.includes('Future') ? 'bg-edge text-muted' : s.includes('Pending') ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-muted';

  const socialOption = $derived.by(() => {
    if (!socialHist.length) return {};
    const compact = (v: number) => '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    return {
      backgroundColor: 'transparent',
      grid: { left: 56, right: 48, top: 24, bottom: 30 },
      legend: { data: ['BTC price', 'Trends (Bitcoin)', 'Social risk'], textStyle: { color: '#9CA3AF' }, top: 0 },
      tooltip: { trigger: 'axis', backgroundColor: '#0E1117', borderColor: '#1F2937', textStyle: { color: '#F9FAFB', fontSize: 11 } },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#1F2937' } }, splitLine: { show: false } },
      yAxis: [
        { type: 'log', name: 'BTC', position: 'left', scale: true, nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF', formatter: compact }, splitLine: { lineStyle: { color: '#1F2937' } } },
        { type: 'value', name: '0–1', min: 0, max: 1, position: 'right', nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF' }, splitLine: { show: false } }
      ],
      series: [
        { name: 'BTC price', type: 'line', yAxisIndex: 0, showSymbol: false, itemStyle: { color: '#37e0a6' }, lineStyle: { width: 1.2, color: '#37e0a6' }, data: socialHist.filter((p) => p.btc_price != null).map((p) => [ts(p.date), p.btc_price]) },
        { name: 'Trends (Bitcoin)', type: 'line', yAxisIndex: 1, showSymbol: false, itemStyle: { color: '#3B82F6' }, lineStyle: { width: 1.2, color: '#3B82F6' }, data: socialHist.filter((p) => p.trends_bitcoin != null).map((p) => [ts(p.date), Number(((p.trends_bitcoin as number) / 100).toFixed(3))]) },
        { name: 'Social risk', type: 'line', yAxisIndex: 1, showSymbol: false, smooth: true, itemStyle: { color: '#F59E0B' }, lineStyle: { width: 2, color: '#F59E0B' }, data: socialHist.filter((p) => p.social_risk_score != null).map((p) => [ts(p.date), p.social_risk_score]) }
      ]
    };
  });

  const histOption = $derived.by(() => {
    if (!hist.length) return {};
    const compact = (v: number) => '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    // 21-day trailing mean so the risk line reads as a clean cycle curve.
    const win = 21;
    const riskSmoothed = hist.map((_, i) => {
      const from = Math.max(0, i - win + 1);
      let sum = 0;
      for (let j = from; j <= i; j += 1) sum += hist[j].risk;
      return sum / (i - from + 1);
    });
    const lastTs = ts(hist[hist.length - 1].date);
    const curRisk = riskSmoothed[riskSmoothed.length - 1];

    const zoneBands = [
      { lo: 0, hi: 0.2, color: 'rgba(34,197,94,0.13)', name: 'Aggressive DCA' },
      { lo: 0.2, hi: 0.4, color: 'rgba(34,197,94,0.06)', name: 'Good DCA' },
      { lo: 0.4, hi: 0.6, color: 'rgba(255,210,63,0.07)', name: 'Neutral' },
      { lo: 0.6, hi: 0.8, color: 'rgba(255,140,66,0.08)', name: 'Caution' },
      { lo: 0.8, hi: 1.0, color: 'rgba(239,68,68,0.13)', name: 'Distribution' }
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = [];

    if (showZones) {
      series.push({
        name: 'zones',
        type: 'line',
        yAxisIndex: 1,
        silent: true,
        showSymbol: false,
        data: [[lastTs, 0]],
        lineStyle: { opacity: 0 },
        tooltip: { show: false },
        markArea: {
          silent: true,
          label: { show: true, position: 'insideEndTop', color: '#9CA3AF', fontSize: 9 },
          data: zoneBands.map((b) => [{ yAxis: b.lo, itemStyle: { color: b.color }, name: b.name }, { yAxis: b.hi }])
        }
      });
    }

    if (showPrice) {
      series.push({
        name: 'BTC price',
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        itemStyle: { color: '#37e0a6' },
        lineStyle: { width: 1.5, color: '#37e0a6' },
        data: hist.map((p) => [ts(p.date), p.btc_price]),
        markLine: showEvents
          ? {
              silent: true,
              symbol: 'none',
              label: { color: '#9CA3AF', fontSize: 9, formatter: (p: { name: string }) => p.name },
              lineStyle: { color: 'rgba(59,130,246,0.5)', type: 'dotted' },
              data: EVENTS.map((e) => ({ name: e.label, xAxis: ts(e.date) }))
            }
          : undefined
      });
    }

    if (showRisk) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const riskMark: any[] = [
        { yAxis: 0.2, lineStyle: { color: 'rgba(47,191,113,0.35)', type: 'dashed' } },
        { yAxis: 0.4, lineStyle: { color: 'rgba(154,205,62,0.35)', type: 'dashed' } },
        { yAxis: 0.6, lineStyle: { color: 'rgba(255,210,63,0.35)', type: 'dashed' } },
        { yAxis: 0.8, lineStyle: { color: 'rgba(255,140,66,0.35)', type: 'dashed' } }
      ];
      if (showCurrent)
        riskMark.push({
          xAxis: lastTs,
          lineStyle: { color: '#F59E0B', width: 1.5 },
          label: { formatter: `Now ${curRisk.toFixed(2)}`, color: '#F59E0B', fontSize: 10, position: 'insideEndTop' }
        });
      series.push({
        name: 'Risk',
        type: 'line',
        yAxisIndex: 1,
        showSymbol: false,
        smooth: true,
        itemStyle: { color: '#F59E0B' },
        lineStyle: { width: 2, color: '#F59E0B' },
        data: hist.map((p, i) => [ts(p.date), Number(riskSmoothed[i].toFixed(3))]),
        markLine: { silent: true, symbol: 'none', data: riskMark }
      });
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 60, right: 70, top: 28, bottom: 32 },
      legend: { data: ['BTC price', 'Risk'], textStyle: { color: '#9CA3AF' }, top: 0 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0E1117',
        borderColor: '#1F2937',
        textStyle: { color: '#F9FAFB', fontSize: 11 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any[]) => {
          const date = new Date(params[0].axisValue).toISOString().slice(0, 10);
          const price = params.find((p) => p.seriesName === 'BTC price')?.value?.[1];
          const risk = params.find((p) => p.seriesName === 'Risk')?.value?.[1];
          let html = `<b>${date}</b>`;
          if (price != null) html += `<br/>BTC: $${new Intl.NumberFormat('en').format(Math.round(price))}`;
          if (risk != null) {
            const z = zoneFor(risk);
            html += `<br/>Risk: ${risk.toFixed(3)}<br/>Zone: ${z.label}<br/><span style="color:#9CA3AF">${shortInterp(risk)}</span>`;
          }
          return html;
        }
      },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#1F2937' } }, splitLine: { show: false } },
      yAxis: [
        { type: histLog ? 'log' : 'value', name: 'BTC', position: 'left', scale: true, nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF', formatter: compact }, splitLine: { lineStyle: { color: '#1F2937' } } },
        { type: 'value', name: 'Risk', min: 0, max: 1, position: 'right', nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF' }, splitLine: { show: false } }
      ],
      series
    };
  });

  const zoneSections = $derived(
    zones
      ? [
          { title: 'Aggressive DCA history (risk < 0.20)', list: zones.aggressive },
          { title: 'Good DCA history (risk 0.20–0.40)', list: zones.good },
          { title: 'Distribution history (risk > 0.80)', list: zones.distribution }
        ]
      : []
  );

  const tables = $derived(
    metrics ? [{ title: 'BTC Price Metrics', rows: metrics.price }, { title: 'BTC On-Chain Metrics', rows: metrics.onchain }, { title: 'Social Metrics', rows: metrics.social }] : []
  );
</script>

<header class="mb-4">
  <h1 class="text-lg font-semibold text-strong sm:text-xl">Pastatrade BTC Risk Model</h1>
  <!-- Compact one-liner on mobile; full intro on desktop -->
  <p class="mt-1 text-sm text-muted lg:hidden">A 0–1 BTC risk score for DCA, neutral and distribution zones.</p>
  <p class="mt-1 hidden max-w-3xl text-sm leading-relaxed text-muted lg:block">
    A proprietary 0–1 risk score for Bitcoin, built to frame disciplined accumulation (DCA), neutral and distribution
    conditions across the market cycle — so you can act on the regime rather than the headlines.
  </p>
  <!-- Methodology & attribution — collapsible so it no longer dominates the page -->
  <div class="mt-3 max-w-3xl overflow-hidden rounded-lg border border-edge bg-panel-2/40 text-xs text-muted">
    <button type="button" class="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left" aria-expanded={showMethodology} onclick={() => (showMethodology = !showMethodology)}>
      <span class="font-semibold uppercase tracking-wide text-soft">Methodology &amp; attribution</span>
      <ChevronDown class="h-4 w-4 shrink-0 transition-transform {showMethodology ? 'rotate-180' : ''}" />
    </button>
    {#if showMethodology}
      <p class="px-3.5 pb-2.5 leading-relaxed" transition:slide={{ duration: 180 }}>
        The score is an independent, transparent composite of market and on-chain indicators — drawdown from cycle highs, the
        Mayer Multiple, long-term moving-average extension and RSI — normalized to a 0–1 scale. It draws on the established
        family of 0–1 cycle-risk frameworks used by quantitative analysts (including work popularized by Benjamin Cowen), but is
        an original Pastatrade implementation. It does <span class="text-soft">not reproduce, replicate or claim affiliation with</span>
        any third party’s proprietary model or formula, and is provided for educational purposes only — not financial advice.
      </p>
    {/if}
  </div>
</header>

{#if loading}
  <div class="card text-center text-muted">Loading risk model…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if summary && bounds && zone && displayRisk != null}
  <!-- Summary card -->
  <div class="card mb-4 border-l-4" style="border-left-color: {zone.color}">
    <!-- Plain-language verdict first (the decision); the gauge + score sit below as proof -->
    <div class="mb-4">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-muted">Bitcoin Today</p>
      <p class="mt-1 text-xl font-bold leading-tight sm:text-2xl" style="color: {zone.color}">{humanVerdict.head}</p>
      <p class="mt-1 text-sm text-soft">{humanVerdict.sub}</p>
      {#if humanVerdict.action}
        <p class="mt-2.5 flex items-start gap-2 rounded-lg border border-edge bg-panel-2/50 px-3 py-2 text-sm text-strong">
          <span class="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style="background: {zone.color}22; color: {zone.color}">Do</span>
          {humanVerdict.action}
        </p>
      {/if}
      <p class="mt-2 text-[11px] text-muted">Risk score {Math.round((displayRisk ?? 0) * 100)}/100 · {zone.label}</p>
    </div>
    <div class="grid gap-4 md:grid-cols-[220px_1fr]">
      <div class="flex flex-col items-center">
        <Gauge value={displayRisk} title="BTC Risk" size={220} />
        <span class="mt-1 rounded-full px-3 py-1 text-sm font-semibold" style="background: {zone.color}22; color: {zone.color}">{zone.action}</span>
        <span class="mt-1 text-[10px] text-muted">21-day smoothed · raw {(summary.summary_risk ?? 0).toFixed(3)}</span>
      </div>
      <div>
        <p class="stat-label">BTC Risk Summary</p>
        <p class="mt-1 text-sm leading-relaxed text-soft">{summaryText}</p>
        <p class="mt-3 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-soft">
          <span class="font-medium text-strong">DCA guidance:</span> {zone.msg}
        </p>
        <!-- Zone legend — collapsible to keep the summary clean -->
        <div class="mt-3">
          <button type="button" class="flex items-center gap-1 text-xs font-medium text-muted transition hover:text-soft" aria-expanded={showZoneLegend} onclick={() => (showZoneLegend = !showZoneLegend)}>
            Risk zones
            <ChevronDown class="h-3.5 w-3.5 transition-transform {showZoneLegend ? 'rotate-180' : ''}" />
          </button>
          {#if showZoneLegend}
            <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" transition:slide={{ duration: 180 }}>
              {#each [{ c: '#2fbf71', t: '0.0–0.2 Aggressive' }, { c: '#9acd3e', t: '0.2–0.4 Good' }, { c: '#ffd23f', t: '0.4–0.6 Neutral' }, { c: '#ff8c42', t: '0.6–0.8 Caution' }, { c: '#ff5d6c', t: '0.8–1.0 Distribution' }] as z}
                <span class="flex items-center gap-1.5"><span class="inline-block h-2 w-2 rounded-sm" style="background: {z.c}"></span>{z.t}</span>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Historical slider -->
    <div class="mt-5">
      <div class="mb-1 flex items-center justify-between text-xs text-muted">
        <span>{bounds.start}</span>
        <span class="rounded bg-panel-2 px-2 py-0.5 font-medium text-strong">{currentDate}</span>
        <span>{bounds.end}</span>
      </div>
      <input type="range" min="0" max={maxIndex} bind:value={dayIndex} oninput={onSlide} class="w-full accent-mint" />
    </div>
  </div>

  <!-- AI interpretation of the verdict + key risk signals -->
  <div class="mb-4"><AiInterpret module="risk" title="BTC Risk Dashboard" signals={aiSignals} /></div>

  <!-- Premium takeaway -->
  {#if canInterp}
    <div class="card mb-4 border border-mint/30 bg-mint/5">
      <AiLabel />
      <p class="mt-1 text-sm leading-relaxed text-soft {expandedTakeaway ? '' : 'line-clamp-3 lg:line-clamp-none'}">{premiumTakeaway}</p>
      <button type="button" class="mt-2 text-xs font-medium text-accent lg:hidden" onclick={() => (expandedTakeaway = !expandedTakeaway)}>{expandedTakeaway ? 'Show less' : 'Read more'}</button>
    </div>
  {:else}
    <div class="relative mb-4">
      <div class="card border border-mint/30 bg-mint/5 blur-[3px]" aria-hidden="true">
        <AiLabel />
        <p class="mt-1 text-sm leading-relaxed text-soft">BTC risk is currently low-to-moderate. The model supports disciplined DCA, though it does not yet show an extreme bottom zone. On-chain and social metrics would give a fuller picture once connected.</p>
      </div>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
        <AiLottie size={44} class="mb-2" />
        <a href="/pricing" class="btn-primary text-sm shadow-lg"><Lock class="h-4 w-4" /> Unlock with Premium</a>
        <p class="text-xs text-muted">Plain-language risk interpretation is a Mid &amp; Premium feature.</p>
      </div>
    </div>
  {/if}

  <!-- Category gauges + explanations -->
  <div class="mb-4 grid gap-4 sm:grid-cols-3">
    {#each [{ key: 'price', label: 'Price Metrics', val: summary.categories.price }, { key: 'onchain', label: 'On-Chain Metrics', val: summary.categories.onchain ?? latestOnchainRisk }, { key: 'social', label: 'Social Metrics', val: summary.categories.social ?? social?.social_risk_score ?? null }] as c}
      <div class="card">
        <Gauge value={(c.key === 'social' && !canSocial) || (c.key === 'onchain' && !canOnchain) ? null : c.val} title={c.label} />
        <p class="mt-2 text-xs leading-relaxed text-muted">{CATEGORY_EXPLAIN[c.key]}</p>
        {#if c.key === 'onchain' && !canOnchain}
          <p class="mt-2 flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-2 py-1.5 text-xs text-soft">
            <span><Lock class="mr-1 inline h-3 w-3 text-accent" />Premium on-chain metrics are included in the full model when available, but the detailed breakdown requires Premium.</span>
            <a href="/app/account" class="shrink-0 font-medium text-accent hover:underline">Upgrade</a>
          </p>
        {:else if c.key === 'onchain' && c.val == null}
          <p class="mt-2 rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-xs text-muted">
            <Lock class="mr-1 inline h-3 w-3" />On-chain data syncs daily — run “Sync on-chain metrics” from Admin (needs a clear BGeometrics quota or an API key).
          </p>
        {:else if c.key === 'social' && !canSocial}
          <p class="mt-2 flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-2 py-1.5 text-xs text-soft">
            <span><Lock class="mr-1 inline h-3 w-3 text-accent" />Social metrics are a Mid &amp; Premium feature.</span>
            <a href="/app/account" class="shrink-0 font-medium text-accent hover:underline">Upgrade</a>
          </p>
        {/if}
      </div>
    {/each}
  </div>
  <p class="mb-2 rounded-lg border border-edge bg-panel-2/40 px-3 py-2 text-xs leading-relaxed text-muted">
    <span class="font-medium text-soft">Model coverage.</span>
    Current risk score includes active categories: {coverageList}. Historical dates before on-chain coverage may use price/social only.
  </p>
  <p class="mb-4 text-[11px] text-muted">On-chain metrics by <a href="https://bitcoin-data.com" target="_blank" rel="noopener" class="hover:text-soft hover:underline">BGeometrics · bitcoin-data.com</a>.</p>

  <!-- Why the score is here -->
  <div class="card mb-4">
    <h2 class="text-sm font-semibold text-strong">Why the score is here</h2>
    <p class="mb-3 text-xs text-muted">Each metric contributes a 0–1 risk. Lower = more accumulation-friendly.</p>
    <div class="divide-y divide-edge/60">
      {#each [...(metrics?.price ?? []), ...(canOnchain ? (metrics?.onchain ?? []) : []), ...(metrics?.social ?? [])] as m}
        {#if m.risk != null}
          <div class="grid gap-1 py-2.5 sm:grid-cols-[200px_70px_1fr] sm:items-center">
            <span class="text-sm font-medium text-strong">{m.label}</span>
            <span class="rounded px-2 py-0.5 text-center font-mono text-xs font-semibold" style="background: {riskColor(m.risk)}22; color: {riskColor(m.risk)}">{m.risk.toFixed(3)}</span>
            <span class="text-xs text-muted">{meaningFor(m.key, m.risk)}</span>
          </div>
        {/if}
      {/each}
    </div>
  </div>

  <!-- Social risk summary + model integration -->
  {#if social}
    {@const priceRisk = summary.categories.price}
    {@const socialRisk = social.social_risk_score}
    {@const onAvail = summary.categories.onchain != null}
    {@const total =
      onAvail && priceRisk != null && socialRisk != null
        ? priceRisk * 0.5 + (summary.categories.onchain ?? 0) * 0.3 + socialRisk * 0.2
        : socialRisk != null && priceRisk != null
          ? priceRisk * 0.75 + socialRisk * 0.25
          : priceRisk}
    <div class="card mb-4">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-strong">Social Risk</h2>
        <a href="/app/social-metrics" class="text-xs text-mint hover:underline">Full breakdown →</a>
      </div>
      <div class="grid gap-4 md:grid-cols-[170px_1fr]">
        <div class="flex flex-col items-center">
          <Gauge value={social.social_risk_score} title="Social" />
          <span class="mt-1 rounded-full px-3 py-1 text-xs font-semibold" style="background: {riskColor(social.social_risk_score)}22; color: {riskColor(social.social_risk_score)}">{social.label}</span>
        </div>
        <div>
          <p class="text-sm leading-relaxed text-soft">{social.interpretation}</p>
          <p class="mt-2 text-xs text-muted">{social.coverage_status}</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each Object.entries(social.source_status) as [k, s]}
              <span class="pill {srcColor(s)} text-[10px]">{k.replace(/_/g, ' ')}: {s}</span>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- Total BTC Risk — category contributions -->
    <div class="card mb-4">
      <h2 class="text-sm font-semibold text-strong">Total BTC Risk — category contributions</h2>
      <p class="mb-2 text-xs text-muted">Integrated model: Price × {onAvail ? '50' : '75'}% {onAvail ? '· On-chain × 30%' : ''} · Social × {onAvail ? '20' : '25'}%.</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p class="stat-label">Price Metrics</p><p class="stat-value text-lg">{priceRisk != null ? priceRisk.toFixed(3) : '—'}</p></div>
        <div><p class="stat-label">On-Chain</p><p class="mt-1 text-sm text-muted">unavailable / premium</p></div>
        <div><p class="stat-label">Social Metrics</p><p class="stat-value text-lg">{socialRisk != null ? socialRisk.toFixed(3) : '—'}</p></div>
        <div><p class="stat-label">Total BTC Risk</p><p class="stat-value text-lg" style="color: {riskColor(total ?? null)}">{total != null ? total.toFixed(3) : '—'}</p></div>
      </div>
      <p class="mt-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
        Current model coverage: price metrics active; social metrics {socialRisk != null ? 'active' : 'unavailable'}; on-chain metrics unavailable / premium.
        {socialRisk != null && socialRisk < 0.4
          ? 'Social risk is low — public attention remains quiet, supporting a balanced-to-lower risk reading.'
          : socialRisk != null && socialRisk >= 0.6
            ? 'Social risk is elevated — if price metrics are also high, total risk moves toward caution / distribution.'
            : 'Social risk is moderate — retail attention is rising but not euphoric.'}
      </p>
    </div>
  {/if}

  <!-- BTC price vs risk history -->
  {#if hist.length}
    <div class="card mb-4">
      <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-strong">BTC Price vs Risk History</h2>
          <p class="text-xs text-muted">Did low-risk zones line up with good accumulation periods, and high-risk zones with overheated tops?</p>
        </div>
        <div class="flex gap-1 text-xs">
          <button class="rounded px-2 py-0.5" class:bg-panel-2={histLog} class:text-strong={histLog} class:text-muted={!histLog} onclick={() => (histLog = true)}>Log</button>
          <button class="rounded px-2 py-0.5" class:bg-panel-2={!histLog} class:text-strong={!histLog} class:text-muted={histLog} onclick={() => (histLog = false)}>Linear</button>
        </div>
      </div>

      <!-- Current status badge + metric coverage -->
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="rounded-lg px-3 py-1.5 text-sm font-semibold" style="background: {zone.color}22; color: {zone.color}" title="21-day smoothed to remove daily noise">
          Current BTC Risk: {(displayRisk ?? 0).toFixed(3)} — {zone.label}
        </span>
        <span class="pill {coverage.price ? 'bg-mint/15 text-mint' : 'bg-edge text-muted'}">Price {coverage.price ? 'active' : '—'}</span>
        <span class="pill {coverage.onchain ? 'bg-mint/15 text-mint' : 'bg-edge text-muted'}">On-chain {coverage.onchain ? 'active' : 'premium / unavailable'}</span>
        <span class="pill {coverage.social ? 'bg-mint/15 text-mint' : 'bg-edge text-muted'}">Social {coverage.social ? 'active' : 'pending'}</span>
      </div>

      <!-- Visibility toggles -->
      <div class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={showRisk} /> Risk line</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={showPrice} /> BTC price</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={showZones} /> Zone shading</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={showCurrent} /> Current marker</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={showEvents} /> Event markers</label>
      </div>

      <EChart option={histOption} height={360} />

      <!-- Takeaway + coverage note below chart -->
      <p class="mt-3 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-soft">
        {#if canInterp}
          <AiLabel /><br /> {premiumTakeaway}
        {:else}
          <Lock class="mr-1 inline h-3 w-3 text-accent" /><span class="font-medium text-strong">Premium Takeaway</span> — the plain-language interpretation is a Mid &amp; Premium feature. <a href="/pricing" class="font-medium text-accent hover:underline">Upgrade</a>
        {/if}
      </p>
      <p class="mt-2 text-xs leading-relaxed text-muted">
        Current model coverage: price metrics {coverage.price ? 'active' : 'inactive'}; on-chain
        {coverage.onchain ? 'active' : 'unavailable / premium'}; social {coverage.social ? 'active' : 'pending'}. The score is
        primarily price-based until full on-chain and social metrics are connected, so it may under- or over-state some cycle
        conditions. This model is not a price prediction — it shows whether conditions are closer to historical accumulation or
        distribution zones.
      </p>
    </div>
  {/if}

  <!-- ── On-chain Risk (Premium) ─────────────────────────────────────────── -->
  {#if canOnchain && onchainComposite != null && onchainStatus}
    <section class="mb-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold text-strong">Pastatrade On-chain Risk</h2>
        <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
          <button class="px-3 py-1.5 font-medium transition-colors {!analystMode ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => setView(false)}>Simple</button>
          <button class="px-3 py-1.5 font-medium transition-colors {analystMode ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => setView(true)}>Analyst</button>
        </div>
      </div>

      <!-- Summary card -->
      <div class="hero-card mb-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">On-chain Risk Summary</span>
            <div class="mt-1 flex items-center gap-2">
              <span class="text-2xl font-bold text-strong">{onchainComposite.toFixed(3)}</span>
              <span class="pill {onchainStatus.pill}">{onchainStatus.label}</span>
            </div>
            <div class="meter mt-2 max-w-md"><div class="meter-fill {onchainStatus.bar}" style="width: {Math.round(onchainComposite * 100)}%"></div></div>
            <p class="mt-2 max-w-2xl text-sm leading-relaxed text-soft">{onchainInterpretation}</p>
          </div>
        </div>
      </div>

      <!-- Metric cards -->
      <div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {#each onchainCards as c}
          <div class="card">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-semibold text-strong">{c.label}</span>
              <span class="pill {c.pill} text-[10px]">{c.riskLabel}</span>
            </div>
            <div class="mt-1 flex items-baseline gap-2">
              <span class="text-lg font-semibold text-strong">{rawFmt(c.key, c.raw)}</span>
              <span class="text-[11px] text-muted">risk {c.risk.toFixed(2)}</span>
            </div>
            <p class="mt-1.5 text-xs leading-relaxed text-muted">{c.meaning}</p>
          </div>
        {/each}
      </div>

      <!-- Main driver + DCA + takeaway -->
      <div class="mb-3 grid gap-3 md:grid-cols-2">
        {#if mainDriver}
          <div class="card">
            <p class="stat-label">Main driver</p>
            <p class="mt-1 text-sm font-medium text-strong">{mainDriver.text}</p>
            <p class="mt-1 text-xs leading-relaxed text-muted">{mainDriver.meaning}</p>
          </div>
        {/if}
        <div class="card">
          <p class="stat-label">DCA interpretation</p>
          <p class="mt-1 text-sm leading-relaxed text-soft">{onchainStatus.dca}</p>
        </div>
      </div>

      <!-- Chart -->
      <div class="card">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-strong">On-chain risk vs BTC price</h3>
          <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={lines.btc} /> BTC price</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={lines.composite} /> On-chain risk</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={lines.mvrv} /> MVRV-Z</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={lines.puell} /> Puell</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={lines.nupl} /> NUPL</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={lines.reserve} /> Reserve Risk</label>
          </div>
        </div>
        <EChart option={onchainHistOption} height={360} />
      </div>

      <!-- Premium takeaway -->
      <div class="mt-3 card border border-mint/30 bg-mint/5">
        <AiLabel />
        <p class="mt-1 text-sm leading-relaxed text-soft">{onchainPremiumTakeaway}</p>
      </div>

      <!-- Beginner explanations -->
      <details class="card group mt-3">
        <summary class="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-strong">
          What do these metrics mean?
          <span class="text-muted transition group-open:rotate-45">+</span>
        </summary>
        <dl class="mt-3 space-y-2 text-xs leading-relaxed">
          {#each onchainCards as c}
            <div><dt class="font-medium text-soft">{c.label}</dt><dd class="text-muted">{ONCHAIN_EXPLAIN[c.key] ?? ''}</dd></div>
          {/each}
        </dl>
      </details>

      <!-- Source + coverage -->
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge bg-panel-2/40 px-3 py-2 text-[11px] text-muted">
        <span>
          <span class="font-medium text-soft">Source:</span> BGeometrics ·
          <a href="https://bitcoin-data.com" target="_blank" rel="noopener" class="hover:text-soft hover:underline">bitcoin-data.com</a>
          · <span class="text-mint">Active</span>{onchainLastSynced ? ` · last synced ${onchainLastSynced}` : ''}
        </span>
        <span>Coverage 2022→present · MVRV-Z, Puell, NUPL, Reserve Risk. Earlier dates use price/social only.</span>
      </div>
    </section>
  {/if}

  <!-- ── Bitcoin Supply in Profit & Loss ── -->
  {#if canOnchain && supplyPL}
    <section class="mb-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-strong">Bitcoin Supply in Profit &amp; Loss</h2>
          <p class="text-xs text-muted">See whether BTC holders are broadly in profit, under stress, or moving through a recovery zone.</p>
        </div>
        <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
          <button class="px-3 py-1.5 font-medium transition-colors {!supplyAnalyst ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => setSupplyView(false)}>Simple</button>
          <button class="px-3 py-1.5 font-medium transition-colors {supplyAnalyst ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => setSupplyView(true)}>Analyst</button>
        </div>
      </div>

      <!-- Summary hero -->
      <div class="hero-card mb-3">
        <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Current Supply State</span>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <span class="pill {supplyTone.pill}">{supplyPL.current_state}</span>
          <span class="text-sm text-soft">{supplyPL.signal}</span>
        </div>
        <div class="mt-3 max-w-xl">
          <div class="flex h-3 overflow-hidden rounded-full border border-edge">
            <div class="bg-mint" style="width: {supplyPL.supply_in_profit_percent}%"></div>
            <div class="bg-danger" style="width: {supplyPL.supply_in_loss_percent}%"></div>
          </div>
          <div class="mt-1 flex justify-between text-[11px]">
            <span class="font-medium text-mint">In profit · {supplyPL.supply_in_profit_percent}%</span>
            <span class="font-medium text-danger">In loss · {supplyPL.supply_in_loss_percent}%</span>
          </div>
        </div>
        <p class="mt-3 max-w-2xl text-sm leading-relaxed text-soft">{supplyPL.interpretation}</p>
      </div>

      <!-- Metric cards -->
      <div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="card">
          <span class="text-sm font-semibold text-strong">Supply in Profit</span>
          <div class="mt-1 text-xl font-bold text-mint">{supplyPL.supply_in_profit_percent}%</div>
          <p class="mt-1 text-xs leading-relaxed text-muted">{fmtBtcAmt(supplyPL.supply_in_profit_btc)} last moved below the current price.</p>
        </div>
        <div class="card">
          <span class="text-sm font-semibold text-strong">Supply in Loss</span>
          <div class="mt-1 text-xl font-bold text-danger">{supplyPL.supply_in_loss_percent}%</div>
          <p class="mt-1 text-xs leading-relaxed text-muted">{fmtBtcAmt(supplyPL.supply_in_loss_btc)} last moved above the current price (underwater).</p>
        </div>
        <div class="card">
          <span class="text-sm font-semibold text-strong">Profit/Loss Spread</span>
          <div class="mt-1 text-xl font-bold {supplyPL.profit_loss_spread >= 0 ? 'text-mint' : 'text-danger'}">{supplyPL.profit_loss_spread > 0 ? '+' : ''}{supplyPL.profit_loss_spread}%</div>
          <p class="mt-1 text-xs leading-relaxed text-muted">{supplyPL.profit_loss_spread >= 0 ? 'Profit supply is dominant.' : 'Loss supply is dominant.'} Ratio {supplyPL.profit_loss_ratio != null ? supplyPL.profit_loss_ratio.toFixed(2) : '—'}.</p>
        </div>
        <div class="card">
          <span class="text-sm font-semibold text-strong">Signal</span>
          <div class="mt-1"><span class="pill {supplyTone.pill}">{supplyPL.current_state}</span></div>
          <p class="mt-1 text-xs leading-relaxed text-muted">{supplyPL.signal}.</p>
        </div>
      </div>

      <!-- Recent crossover -->
      {#if supplyPL.recent_crossover}
        {@const cr = supplyPL.recent_crossover}
        <div class="card mb-3 border {cr.type === 'profit_above_loss' ? 'border-mint/30 bg-mint/5' : 'border-danger/30 bg-danger/5'}">
          <p class="stat-label {cr.type === 'profit_above_loss' ? 'text-mint' : 'text-danger'}">Latest crossover · {cr.date}</p>
          <p class="mt-1 text-sm leading-relaxed text-soft">
            {cr.type === 'profit_above_loss' ? 'Supply in profit crossed back above supply in loss.' : 'Supply in loss crossed above supply in profit.'}
            {cr.meaning}
          </p>
        </div>
      {/if}

      <!-- Chart (Into-The-Cryptoverse-style layout) -->
      <div class="card">
        <h3 class="mb-3 text-sm font-semibold text-strong">Bitcoin Percentage of Supply in Profit and Loss</h3>
        <div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <!-- Supply In -->
          <div class="flex items-center gap-1.5">
            <span class="text-muted">Supply</span>
            <div class="inline-flex overflow-hidden rounded-lg border border-edge">
              {#each [['profit', 'Profit'], ['loss', 'Loss'], ['both', 'Profit & Loss']] as [val, lab]}
                <button class="px-2.5 py-1 font-medium transition-colors {supplyMode === val ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (supplyMode = val as typeof supplyMode)}>{lab}</button>
              {/each}
            </div>
          </div>
          <!-- Moving Average -->
          <label class="flex items-center gap-1.5 text-muted">Moving avg
            <select class="rounded-lg border border-edge bg-panel-2 px-2 py-1 text-soft" bind:value={supplyMA}>
              <option value={0}>None</option>
              <option value={7}>7D</option>
              <option value={30}>30D</option>
              <option value={90}>90D</option>
            </select>
          </label>
          <!-- Price Scale -->
          <div class="flex items-center gap-1.5">
            <span class="text-muted">Price</span>
            <div class="inline-flex overflow-hidden rounded-lg border border-edge">
              <button class="px-2.5 py-1 font-medium transition-colors {!supplyPriceLog ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (supplyPriceLog = false)}>Linear</button>
              <button class="px-2.5 py-1 font-medium transition-colors {supplyPriceLog ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (supplyPriceLog = true)}>Log</button>
            </div>
          </div>
          <!-- Metric Scale -->
          <div class="flex items-center gap-1.5">
            <span class="text-muted">Metric</span>
            <div class="inline-flex overflow-hidden rounded-lg border border-edge">
              <button class="px-2.5 py-1 font-medium transition-colors {!supplyMetricLog ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (supplyMetricLog = false)}>Linear</button>
              <button class="px-2.5 py-1 font-medium transition-colors {supplyMetricLog ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (supplyMetricLog = true)}>Log</button>
            </div>
          </div>
        </div>
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="inline-flex overflow-hidden rounded-lg border border-edge">
            {#each ['30D', '90D', '1Y', 'All'] as r}
              <button class="px-2.5 py-1 font-medium transition-colors {supplyRange === r ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (supplyRange = r as typeof supplyRange)}>{r}</button>
            {/each}
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={sLines.btc} /> BTC price</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={sLines.crossovers} /> Crossovers</label>
            {#if supplyAnalyst}
              <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={sLines.spread} /> Spread</label>
              <label class="flex items-center gap-1.5"><input type="checkbox" class="accent-mint" bind:checked={sLines.ratio} /> Ratio</label>
            {/if}
          </div>
        </div>
        <EChart option={supplyOption} height={380} />
        <p class="mt-2 text-[11px] text-muted">Blue = BTC price · gold = % supply in profit · red = % supply in loss. Green/red dashed lines mark profit↔loss crossovers (recovery / stress); the dotted 50% line is where they’re equal.</p>
      </div>

      <!-- Premium takeaway -->
      <div class="mt-3 card border border-mint/30 bg-mint/5">
        <AiLabel />
        <p class="mt-1 text-sm leading-relaxed text-soft">{supplyPL.premium_takeaway}</p>
      </div>

      <!-- Source + disclaimer -->
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge bg-panel-2/40 px-3 py-2 text-[11px] text-muted">
        <span>
          <span class="font-medium text-soft">Source:</span> {supplyPL.source_name} ·
          <a href="https://bitcoin-data.com" target="_blank" rel="noopener" class="hover:text-soft hover:underline">bitcoin-data.com</a>
          · <span class="text-mint">Active</span> · last synced {supplyPL.last_synced}
        </span>
        <span>On-chain supply profitability — not a price prediction. Confirm with BTC risk, price trend and other on-chain metrics.</span>
      </div>
    </section>
  {:else if canOnchain}
    <div class="card mb-4 border border-warn/30 bg-warn/5">
      <h2 class="text-sm font-semibold text-strong">Bitcoin Supply in Profit &amp; Loss</h2>
      <p class="mt-1 text-xs leading-relaxed text-muted">No supply profit/loss data yet. Run <span class="font-medium text-soft">“Sync on-chain metrics”</span> from Admin to populate this module (it shares the on-chain sync). If the provider hasn’t returned data, this metric is temporarily unavailable from the current provider.</p>
    </div>
  {:else}
    <!-- Locked preview for Free / Mid -->
    <div class="card mb-4 relative overflow-hidden">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="pill bg-edge text-muted"><Lock class="h-3 w-3" /> Premium</span>
            <h2 class="text-sm font-semibold text-strong">Bitcoin Supply in Profit &amp; Loss</h2>
          </div>
          <p class="mt-1 max-w-xl text-xs leading-relaxed text-muted">
            See what share of BTC supply is in profit vs underwater — a real on-chain read on holder stress, capitulation and recovery. Premium unlocks the live state, crossover markers and the full chart.
          </p>
        </div>
        <a href="/pricing" class="btn-primary shrink-0 text-xs">Upgrade to Premium</a>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-2 opacity-50 blur-[2px] select-none" aria-hidden="true">
        <div class="rounded-lg border border-edge bg-panel-2/40 p-2.5"><div class="text-[11px] text-muted">In profit</div><div class="text-lg font-semibold text-mint">5•.•%</div></div>
        <div class="rounded-lg border border-edge bg-panel-2/40 p-2.5"><div class="text-[11px] text-muted">In loss</div><div class="text-lg font-semibold text-danger">4•.•%</div></div>
        <div class="rounded-lg border border-edge bg-panel-2/40 p-2.5"><div class="text-[11px] text-muted">Signal</div><div class="text-sm font-semibold text-soft">•••••••</div></div>
      </div>
    </div>
  {/if}

  <!-- DCA Zone History -->
  {#if zoneSections.some((s) => s.list.length)}
    <div class="card mb-4">
      <h2 class="text-sm font-semibold text-strong">DCA Zone History</h2>
      <p class="mb-3 text-xs text-muted">Past periods in each risk band, with BTC performance 6 and 12 months later.</p>
      <div class="space-y-4">
        {#each zoneSections as sec}
          {#if sec.list.length}
            <div>
              <h3 class="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{sec.title}</h3>
              <div class="overflow-x-auto">
                <table class="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
                      <th class="px-3 py-2">Period</th>
                      <th class="px-3 py-2">Avg price</th>
                      <th class="px-3 py-2">Risk range</th>
                      <th class="px-3 py-2">+6m</th>
                      <th class="px-3 py-2">+12m</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each sec.list as p}
                      <tr class="border-b border-edge/60 last:border-0">
                        <td class="px-3 py-2 text-soft">{p.start} → {p.end}</td>
                        <td class="px-3 py-2 text-soft">{fmtUsd(p.avg_price, { compact: true })}</td>
                        <td class="px-3 py-2 text-muted">{p.risk_min.toFixed(2)}–{p.risk_max.toFixed(2)}</td>
                        <td class="px-3 py-2 {(p.fwd_6m ?? 0) >= 0 ? 'text-mint' : 'text-danger'}">{p.fwd_6m == null ? '—' : fmtPct(p.fwd_6m)}</td>
                        <td class="px-3 py-2 {(p.fwd_12m ?? 0) >= 0 ? 'text-mint' : 'text-danger'}">{p.fwd_12m == null ? '—' : fmtPct(p.fwd_12m)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- Raw metric tables -->
  <div class="grid gap-4 lg:grid-cols-3">
    {#each tables as table}
      <div class="card p-0">
        <div class="border-b border-edge px-4 py-3"><h2 class="text-sm font-semibold text-strong">{table.title}</h2></div>
        <div class="divide-y divide-edge/60">
          {#each table.rows as m}
            <div class="flex items-center justify-between gap-2 px-4 py-2.5">
              <span class="text-sm text-soft" title={m.description ?? ''}>{m.label}</span>
              {#if m.is_premium && !canOnchain}
                <span class="pill bg-edge text-muted"><Lock class="h-3 w-3" /> Premium</span>
              {:else if m.risk == null}
                <span class="text-xs text-muted">—</span>
              {:else}
                <span class="rounded px-2 py-0.5 font-mono text-xs font-semibold" style="background: {riskColor(m.risk)}22; color: {riskColor(m.risk)}">{m.risk.toFixed(3)}</span>
              {/if}
            </div>
          {:else}
            <p class="px-4 py-6 text-center text-xs text-muted">No metrics.</p>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <!-- Transparency -->
  <p class="mt-4 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
    This model is not a price prediction. It is a normalized risk framework that helps identify whether current conditions
    are closer to historical accumulation zones or distribution zones. It is inspired by 0–1 cycle-risk frameworks used by
    quantitative analysts (including Cowen-style cycle analysis) and is the Pastatrade model — it does not reproduce any
    proprietary formula.
  </p>

  <div class="mt-4"><Disclaimer /></div>
{/if}
