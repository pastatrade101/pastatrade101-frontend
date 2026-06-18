// Ecosystem rotation intelligence — turns raw ecosystem_metrics into plain-language
// signals, confidence, drivers, breadth and a market-wide regime. All pure/derived
// from the rankings payload so the page stays sync-driven (no extra API calls).

export interface EcoMetrics {
  tvl: number | null;
  tvl_change_7d: number | null;
  tvl_change_30d: number | null;
  stablecoin_mcap: number | null;
  dex_volume_24h: number | null;
  dex_volume_change_7d: number | null;
  fees_24h: number | null;
  revenue_24h: number | null;
  native_token_30d: number | null;
  strength_score: number | null;
  signal: string | null;
}

export interface EcoItem {
  rank: number;
  id: string;
  slug: string;
  name: string;
  metrics: EcoMetrics | null;
}

export type RichSignal =
  | 'Strong rotation'
  | 'Improving'
  | 'Selective strength'
  | 'Neutral'
  | 'Under pressure'
  | 'Weak'
  | 'Deteriorating'
  | 'No data';

export type Confidence = 'High' | 'Medium' | 'Low';
export type Tone = 'pos' | 'accent' | 'neutral' | 'warn' | 'neg' | 'muted';

// Which side of the ledger a signal sits on (for breadth + filtering).
export const IMPROVING_SIGNALS: RichSignal[] = ['Strong rotation', 'Improving', 'Selective strength'];
export const WEAK_SIGNALS: RichSignal[] = ['Weak', 'Deteriorating'];

const num = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v);

// Deadband: moves smaller than these are treated as flat (noise), not directional.
// DEX volume is noisier week-to-week so it gets a wider band.
const dir = (v: number | null, band: number): -1 | 0 | 1 => (v == null ? 0 : v > band ? 1 : v < -band ? -1 : 0);

/**
 * Richer ladder than the raw backend signal. Driven by 30D TVL growth, 7D DEX
 * volume change and 30D native-token momentum, with the composite score as a
 * tie-breaker for the strongest tier.
 */
export const richSignal = (m: EcoMetrics | null): RichSignal => {
  if (!m) return 'No data';
  const tvl = num(m.tvl_change_30d);
  const dex = num(m.dex_volume_change_7d);
  const nat = num(m.native_token_30d);
  const score = m.strength_score ?? 50;

  const present = [tvl, dex, nat].filter((v): v is number => v != null);
  if (present.length === 0) return 'No data';

  const tvlD = dir(tvl, 2);
  const natD = dir(nat, 2);
  const dexD = dir(dex, 4);
  const dirs = [tvl != null ? tvlD : null, dex != null ? dexD : null, nat != null ? natD : null].filter((d): d is -1 | 0 | 1 => d != null);

  const pos = dirs.filter((d) => d > 0).length;
  const neg = dirs.filter((d) => d < 0).length;
  const tvlPos = tvlD > 0;
  const natPos = natD > 0;
  const dexPos = dexD > 0;
  const allKnown = tvl != null && dex != null && nat != null;
  const allPos = allKnown && tvlPos && dexPos && natPos;
  const allNeg = allKnown && tvl < 0 && dex < 0 && nat < 0;

  // Broad, confirmed strength across every pillar + a high composite score.
  if (allPos && score >= 66) return 'Strong rotation';
  // Broadly AND sharply negative across all three pillars.
  if (allNeg && tvl <= -15 && dex <= -30 && nat <= -15) return 'Deteriorating';
  // Both structural pillars (capital + token) rising → genuine improvement.
  if (tvlPos && natPos) return 'Improving';
  // Two or more pillars negative → weak momentum vs other chains.
  if (neg >= 2) return 'Weak';
  // One pillar clearly leading but the rest lag → unconfirmed, selective.
  if (pos >= 1 && ((tvl ?? 0) >= 8 || (nat ?? 0) >= 15)) return 'Selective strength';
  // At least one pillar slipping, nothing strong → softening.
  if (neg >= 1) return 'Under pressure';
  return 'Neutral';
};

export const signalTone = (s: RichSignal): Tone => {
  switch (s) {
    case 'Strong rotation':
      return 'pos';
    case 'Improving':
    case 'Selective strength':
      return 'accent';
    case 'Under pressure':
      return 'warn';
    case 'Weak':
    case 'Deteriorating':
      return 'neg';
    case 'No data':
      return 'muted';
    default:
      return 'neutral';
  }
};

const toneClass: Record<Tone, string> = {
  pos: 'bg-mint/15 text-mint',
  accent: 'bg-accent/15 text-accent',
  neutral: 'bg-warn/10 text-warn',
  warn: 'bg-warn/15 text-warn',
  neg: 'bg-danger/15 text-danger',
  muted: 'bg-edge text-muted'
};
export const tonePill = (t: Tone): string => toneClass[t];

export interface ConfidenceResult {
  level: Confidence;
  reason: string;
}

/**
 * Confidence reflects how much we trust the signal: data completeness first
 * (missing pillars cut confidence — never punish the score), then whether the
 * available metrics agree or conflict.
 */
export const confidence = (m: EcoMetrics | null): ConfidenceResult => {
  if (!m) return { level: 'Low', reason: 'No ecosystem metrics available yet.' };
  const tvl = num(m.tvl_change_30d);
  const dex = num(m.dex_volume_change_7d);
  const nat = num(m.native_token_30d);
  const stable = num(m.stablecoin_mcap);

  const core = [tvl, dex, nat];
  const missingCore = core.filter((v) => v == null).length;
  const missingTotal = missingCore + (stable == null ? 1 : 0);

  const missLabels: string[] = [];
  if (tvl == null) missLabels.push('TVL history');
  if (dex == null) missLabels.push('DEX volume');
  if (nat == null) missLabels.push('native token');
  if (stable == null) missLabels.push('stablecoin depth');
  const missText = missLabels.join(' and ');

  if (missingCore >= 2 || missingTotal >= 2) {
    return { level: 'Low', reason: `Limited data coverage — ${missText} ${missLabels.length > 1 ? 'are' : 'is'} missing or incomplete.` };
  }
  if (missingTotal === 1) {
    return { level: 'Medium', reason: `Reduced because ${missText} data is unavailable.` };
  }
  // Complete data → judge agreement.
  const known = core.filter((v): v is number => v != null);
  const strongPos = known.some((v) => v > 15);
  const strongNeg = known.some((v) => v < -15);
  if (strongPos && strongNeg) {
    return { level: 'Medium', reason: 'Drivers conflict — some metrics are strongly positive while others are strongly negative.' };
  }
  return { level: 'High', reason: 'Data is complete and the metrics point in a consistent direction.' };
};

export const confidenceTone = (c: Confidence): Tone => (c === 'High' ? 'pos' : c === 'Medium' ? 'warn' : 'muted');

/** Plain-language "why is it ranked here" using the actual driver numbers. */
export const whyRanked = (name: string, rank: number, m: EcoMetrics | null, sig: RichSignal): string => {
  if (!m) return `${name} has no metric data yet, so its position is provisional and not based on momentum.`;
  const tvl = num(m.tvl_change_30d);
  const dex = num(m.dex_volume_change_7d);
  const nat = num(m.native_token_30d);

  const parts: string[] = [];
  if (tvl != null) parts.push(`TVL is ${tvl >= 0 ? 'up' : 'down'} ${Math.abs(tvl).toFixed(1)}% over 30 days`);
  if (nat != null) parts.push(`its native token is ${nat >= 0 ? 'up' : 'down'} ${Math.abs(nat).toFixed(1)}% over 30 days`);
  if (dex != null) parts.push(`DEX volume is ${dex >= 0 ? 'up' : 'down'} ${Math.abs(dex).toFixed(1)}% over 7 days`);

  const lead = `${name} is ranked #${rank}`;
  if (!parts.length) return `${lead}, but its key momentum metrics are unavailable.`;

  const dexPos = (dex ?? 0) > 0;
  let close = '';
  switch (sig) {
    case 'Strong rotation':
      close = ' Strength is broad — capital, on-chain activity and token price all point up, a confirmed rotation.';
      break;
    case 'Improving':
      close = dexPos
        ? ' Capital and token momentum are rising together and trading activity is following — a building uptrend.'
        : ' Capital and token momentum are positive, but DEX volume is still soft, so the improvement is not fully confirmed yet.';
      break;
    case 'Selective strength':
      close = ' Strength is selective: one or two metrics lead while the rest lag, so the move is not yet confirmed.';
      break;
    case 'Neutral':
      close = ' Metrics are mixed with no clear direction.';
      break;
    case 'Under pressure':
      close = ' Several metrics are slipping, though it is not broadly weak yet.';
      break;
    case 'Weak':
      close = ' Most metrics are negative, showing weak ecosystem momentum against other chains.';
      break;
    case 'Deteriorating':
      close = ' Momentum is broadly and sharply negative across TVL, DEX volume and token price.';
      break;
  }
  return `${lead} because ${parts.join(', ')}.${close}`;
};

/** Data-quality warnings for an ecosystem (empty when coverage is complete). */
export const dataNotes = (m: EcoMetrics | null): string[] => {
  if (!m) return ['This ecosystem has no metric data yet.'];
  const notes: string[] = [];
  if (m.tvl_change_30d == null) notes.push('TVL history unavailable.');
  if (m.stablecoin_mcap == null) notes.push('Stablecoin data unavailable.');
  if (m.dex_volume_change_7d == null) notes.push('DEX volume data unavailable.');
  if (m.native_token_30d == null) notes.push('Native token data unavailable.');
  if (notes.length) notes.push('Signal confidence reduced due to incomplete data — missing metrics are not counted as zero.');
  return notes;
};

// ── Enriched item ───────────────────────────────────────────────────────────
export interface EnrichedEco extends EcoItem {
  signal: RichSignal;
  tone: Tone;
  confidence: ConfidenceResult;
  why: string;
  notes: string[];
  improving: boolean;
  weak: boolean;
  hasDex: boolean;
  hasNative: boolean;
}

export const enrich = (item: EcoItem): EnrichedEco => {
  const sig = richSignal(item.metrics);
  const conf = confidence(item.metrics);
  return {
    ...item,
    signal: sig,
    tone: signalTone(sig),
    confidence: conf,
    why: whyRanked(item.name, item.rank, item.metrics, sig),
    notes: dataNotes(item.metrics),
    improving: IMPROVING_SIGNALS.includes(sig),
    weak: WEAK_SIGNALS.includes(sig),
    hasDex: item.metrics?.dex_volume_change_7d != null,
    hasNative: item.metrics?.native_token_30d != null
  };
};

// ── Market-wide breadth + regime + narrative ────────────────────────────────
export interface Breadth {
  total: number;
  improving: number;
  neutral: number;
  weak: number;
  pctTvlPos: number;
  pctDexPos: number;
  pctNatPos: number;
  completeData: number;
  incompleteData: number;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export const breadthOf = (items: EnrichedEco[]): Breadth => {
  const total = items.length;
  const improving = items.filter((i) => i.improving).length;
  const weak = items.filter((i) => i.weak).length;
  const neutral = total - improving - weak;
  const tvlPos = items.filter((i) => (i.metrics?.tvl_change_30d ?? 0) > 0).length;
  const dexPos = items.filter((i) => (i.metrics?.dex_volume_change_7d ?? 0) > 0).length;
  const natPos = items.filter((i) => (i.metrics?.native_token_30d ?? 0) > 0).length;
  const completeData = items.filter((i) => i.confidence.level !== 'Low').length;
  return {
    total,
    improving,
    neutral,
    weak,
    pctTvlPos: pct(tvlPos, total),
    pctDexPos: pct(dexPos, total),
    pctNatPos: pct(natPos, total),
    completeData,
    incompleteData: total - completeData
  };
};

export type Regime =
  | 'Broad ecosystem rotation'
  | 'Selective ecosystem strength'
  | 'Neutral ecosystem market'
  | 'Ecosystems under pressure'
  | 'Broad ecosystem weakness'
  | 'No data';

export interface RegimeResult {
  label: Regime;
  tone: Tone;
  blurb: string;
}

export const regimeOf = (b: Breadth): RegimeResult => {
  if (!b.total) return { label: 'No data', tone: 'muted', blurb: 'No ecosystem metrics have been synced yet.' };
  if (b.pctTvlPos >= 50 && b.pctDexPos >= 50)
    return { label: 'Broad ecosystem rotation', tone: 'pos', blurb: 'A majority of ecosystems show rising TVL and DEX volume together — strength is broad.' };
  if (b.weak >= b.total * 0.6 && b.pctTvlPos < 25 && b.pctNatPos < 25)
    return { label: 'Broad ecosystem weakness', tone: 'neg', blurb: 'Most ecosystems are negative across TVL, DEX volume and token momentum.' };
  if (b.pctTvlPos < 30 && b.pctDexPos < 30)
    return { label: 'Ecosystems under pressure', tone: 'warn', blurb: 'TVL and DEX volume are falling across most chains.' };
  if (b.improving >= 1 && b.improving <= Math.max(3, Math.round(b.total * 0.35)))
    return { label: 'Selective ecosystem strength', tone: 'accent', blurb: 'Only a few ecosystems are improving while most remain neutral or weak — strength is selective, not broad.' };
  return { label: 'Neutral ecosystem market', tone: 'neutral', blurb: 'Metrics are mixed and no clear ecosystem leadership exists yet.' };
};

/** Premium plain-language takeaway summarising the whole board. */
export const buildTakeaway = (b: Breadth, regime: RegimeResult, strongest: EnrichedEco | undefined): string => {
  if (!b.total) return 'No ecosystem data is available yet. Run a DefiLlama sync to populate metrics.';

  const lead =
    regime.label === 'Broad ecosystem rotation'
      ? 'Ecosystem strength is broad'
      : regime.label === 'Selective ecosystem strength'
        ? 'Ecosystem strength is currently weak-to-selective'
        : regime.label === 'Broad ecosystem weakness'
          ? 'Ecosystem strength is broadly weak'
          : regime.label === 'Ecosystems under pressure'
            ? 'Ecosystems are broadly under pressure'
            : 'The ecosystem market is neutral';

  let topClause = '';
  if (strongest && (strongest.improving || strongest.signal === 'Neutral')) {
    const m = strongest.metrics;
    const drivers: string[] = [];
    if ((m?.tvl_change_30d ?? 0) > 0) drivers.push('its 30D TVL is positive');
    if ((m?.native_token_30d ?? 0) > 0) drivers.push('native-token momentum is positive');
    topClause = drivers.length
      ? ` ${strongest.name} leads because ${drivers.join(' and ')}, while most other major ecosystems are still under pressure.`
      : ` ${strongest.name} ranks highest, but even the leader is not showing broad strength.`;
  }

  const breadthClause = ` ${b.improving} of ${b.total} tracked ecosystems ${b.improving === 1 ? 'is' : 'are'} improving and ${b.weak} ${b.weak === 1 ? 'is' : 'are'} weak; only ${b.pctTvlPos}% have positive 30D TVL growth.`;

  const closer =
    regime.label === 'Broad ecosystem rotation'
      ? ' This points to a broad altcoin rotation underway.'
      : regime.label === 'Selective ecosystem strength'
        ? ' This suggests there is no broad ecosystem rotation yet — strength is selective.'
        : ' Until breadth improves, altcoin exposure should stay selective.';

  return `${lead}.${topClause}${breadthClause}${closer}`;
};

/** "What this means for altcoins" — practical interpretation of the regime. */
export const altcoinView = (b: Breadth, regime: RegimeResult): string => {
  if (!b.total) return 'No data yet.';
  if (regime.label === 'Broad ecosystem rotation')
    return 'Because most large ecosystems are strengthening together, this is broad altcoin rotation. Altcoins within leading ecosystems become better candidates for relative-strength screening.';
  if (regime.label === 'Selective ecosystem strength')
    return 'Because only a few ecosystems are improving while most stay neutral or weak, this is not yet broad altcoin rotation. Focus on ecosystems with improving TVL and native-token strength, and avoid those with falling TVL, weak DEX volume and weak token performance.';
  if (regime.label === 'Broad ecosystem weakness' || regime.label === 'Ecosystems under pressure')
    return 'With most ecosystems weak or under pressure, broad altcoin exposure carries elevated risk. Keep exposure minimal and selective until TVL and on-chain activity start turning up across more chains.';
  return 'Ecosystem leadership is unclear, so altcoin rotation is not broad. If strength becomes broader, altcoins in leading ecosystems may become better relative-strength candidates — until then, keep exposure selective.';
};
