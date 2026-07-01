<script lang="ts">
  import { fade } from 'svelte/transition';
  import { Search, Percent, MessageSquare, RefreshCw, Scale, Gauge } from '@lucide/svelte';
  import Seo from '$lib/components/Seo.svelte';

  const principles = [
    { icon: Search, title: 'Research, not advice', body: 'Every score describes market conditions. It never says “buy” or “sell.”' },
    { icon: Percent, title: 'Probabilities, not predictions', body: 'We map risk and structure — not where price goes next.' },
    { icon: MessageSquare, title: 'Plain language', body: 'Every score becomes a clear, everyday sentence anyone can act on.' },
    { icon: RefreshCw, title: 'Graceful degradation', body: 'If a data source is down, the model reweights over what’s available and lowers confidence.' },
    { icon: Scale, title: 'Relative strength matters', body: 'Altcoins are judged against Bitcoin (the BTC pair), not just USD.' },
    { icon: Gauge, title: 'Confidence is shown', body: 'We tell you when a read is weak, incomplete, or based on thin data.' }
  ];

  // Weights below mirror the live models. Research signals only — never advice.
  const models = [
    { name: 'BTC Risk & DCA', scale: '0–1', measures: 'How cheap or overheated Bitcoin is on a blended risk model.', inputs: 'Drawdown from all-time high, distance from long-term moving averages, RSI, and on-chain context.', scoring: 'Each factor is normalised to 0–1 and blended into one score. Low = accumulation-friendly (DCA zone), high = distribution risk.', labels: 'Good DCA zone (<0.35) · Neutral (0.35–0.55) · Caution (0.55–0.75) · Distribution risk (>0.75).', limits: 'A risk model, not a price prediction. It describes conditions, not timing.' },
    { name: 'BTC Cycle', scale: '0–100', measures: 'Where BTC sits in its long-term cycle.', inputs: 'Full price history since 2010 (blockchain.com), halving anchors and past cycle lows/highs.', scoring: 'Cycle position is mapped against historical halving cycles and prior extremes.', labels: 'Accumulation → early → mid → late → euphoria / capitulation zones.', limits: 'Cycles rhyme but never repeat exactly; treat as context, not certainty.' },
    { name: 'Logarithmic Regression Bands', scale: 'zones + 0–1 risk', measures: 'Whether BTC/ETH is stretched above or below long-term fair value.', inputs: 'Full daily price history (BTC since 2010, ETH since listing) fit to a log-log regression.', scoring: 'A fair-value line plus lower / upper / bubble bands. Distance from the fair-value line becomes a zone + risk score. Only shown when the fit is trustworthy (≥3 years of history, no large gaps).', labels: 'Deep value → value → fair → elevated → bubble.', limits: 'A historical statistical model. Past band behaviour does not guarantee future support / resistance.' },
    { name: 'Altcoin vs BTC & Altcoin Season', scale: 'index 0–100', measures: 'Whether altcoins are truly outperforming Bitcoin.', inputs: 'ALT/BTC ratios, an oscillator and reaction scores; the Altcoin Season Index = % of the liquid top-alt universe beating BTC over the chosen timeframe.', scoring: 'Relative-strength math on the BTC pair (not USD), with breadth, regime and a confidence read.', labels: 'BTC-led → selective → broadening → broad / altcoin season.', limits: 'Breadth is measured over a liquid universe; thin or renamed coins are excluded.' },
    { name: 'Social & Sentiment Risk', scale: '0–1', measures: 'Whether the crowd is calm or getting greedy (hype risk).', inputs: 'Fear & Greed, Google Trends, YouTube activity, Wikipedia views, plus a small leverage-euphoria overlay.', scoring: 'Weighted 30% Fear & Greed · 25% Google Trends · 20% YouTube · 15% Wikipedia · 10% Leverage Euphoria — reweighted over whatever sources are live. Leverage only counts when at least one attention source is present, so it can never dominate.', labels: 'Quiet / accumulation-friendly → normal → elevated → hype / overheated.', limits: 'Attention ≠ price direction; it sharpens other signals rather than standing alone.' },
    { name: 'Derivatives / Leverage Risk', scale: '0–1', measures: 'How crowded and leveraged the futures market is.', inputs: 'Bitget funding rate, open interest and long/short positioning (public market data).', scoring: 'Blended 60% funding + 40% positioning. Breadth = share of liquid futures with hot funding.', labels: 'Low leverage → normal → elevated → overheated / crowded longs (or fearful / short-heavy when funding is negative).', limits: 'A positioning gauge, not a price prediction. Works best alongside BTC risk and social.' },
    { name: 'Alt/BTC Bottom Radar — Recovery Score', scale: '0–100', measures: 'Whether an altcoin has stopped bleeding against BTC and is recovering.', inputs: 'The ALT/BTC ratio, MA20/50/100/200, 90/180/365-day drawdowns, distance from lows, 7–90d returns, higher-low structure and volume.', scoring: '25% drawdown exhaustion · 20% distance from recent low · 20% moving-average recovery · 15% momentum · 10% structure (higher low) · 5% volume · 5% data quality. Paired with a Confirmation Score and an Invalidation Risk.', labels: 'Still bleeding → bottoming attempt → early recovery → confirmed recovery → relative-strength leader (or failed recovery).', limits: 'A low ratio alone is not enough — the model separates “cheap but bleeding” from “bottoming and improving.” It does not predict price appreciation.' },
    { name: 'Early Opportunity Radar', scale: '2× 0–100', measures: 'Early market attention on new / trending assets — for research, not buying.', inputs: 'CoinGecko trending, GeckoTerminal DEX pools, CoinGecko narratives, and GoPlus security screening.', scoring: 'Opportunity Score: 25% volume growth · 20% liquidity · 15% transactions · 15% trend rank · 10% narrative · 10% momentum · 5% data quality. Risk Score rises with low liquidity, very new pools, abnormal spikes, high FDV/liquidity, buy/sell imbalance, weak security and single-source listings.', labels: 'Weak → low interest → watchlist candidate → strong / high attention. Paired with a risk score + confidence.', limits: 'New tokens are the highest-risk corner of crypto. These are research candidates with risk flags, never buy signals.' },
    { name: 'Dynamic Exit Strategy', scale: '0–100', measures: 'When risk is high enough to consider taking profit.', inputs: 'BTC risk, on-chain risk, social risk, altcoin breadth and cycle extension — plus a leverage confluence check.', scoring: 'A weighted average of the available categories (reweighted when some are missing), with a bounded overlay that raises exit pressure when leverage is building AND price / crowd risk corroborates. Confidence reflects how many categories agree.', labels: 'Accumulate / hold → be selective → light profit-taking → scale-out zones, via a configurable ladder.', limits: 'A risk-based framework, not an instruction to sell. Major exits require several categories to align.' }
  ];

  let active = $state(0);
</script>

<Seo title="Methodology — how our models work" description="Transparent documentation of every Pastatrade model: what each score measures, its inputs, how it's calculated, and its limitations. Research signals, not financial advice." />

<div class="mx-auto max-w-4xl px-4 py-10">
  <header class="mb-8 text-center">
    <span class="pill bg-mint/10 text-mint">Transparency</span>
    <h1 class="mt-3 text-3xl font-semibold text-strong sm:text-4xl">Methodology — how our models work</h1>
    <p class="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">Pastatrade is not a black box. Every score is a transparent, rules-based read of market conditions. Below is what each model measures, the data behind it, how it's calculated, and — honestly — its limits.</p>
  </header>

  <!-- Principles -->
  <h2 class="stat-label mb-3">Principles behind every model</h2>
  <div class="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each principles as p}
      <div class="card p-4">
        <span class="icon-badge bg-mint/12 text-mint"><p.icon class="h-4 w-4" /></span>
        <h3 class="mt-2.5 text-sm font-semibold text-strong">{p.title}</h3>
        <p class="mt-1 text-xs leading-relaxed text-muted">{p.body}</p>
      </div>
    {/each}
  </div>

  <!-- Models — tabbed -->
  <h2 class="stat-label mb-3">The models</h2>
  <div class="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-2">
    {#each models as m, i}
      <button
        class="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition {active === i ? 'bg-mint/15 font-medium text-mint' : 'bg-panel-2 text-muted hover:text-soft'}"
        onclick={() => (active = i)}
      >
        {m.name}
      </button>
    {/each}
  </div>

  {#key active}
    <section class="card" in:fade={{ duration: 150 }}>
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-3">
        <h3 class="text-lg font-semibold text-strong">{models[active].name}</h3>
        <span class="pill bg-accent/10 text-accent">Scale: {models[active].scale}</span>
      </div>
      <dl class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div><dt class="text-[11px] font-semibold uppercase tracking-wide text-mint">What it measures</dt><dd class="mt-1 text-sm leading-relaxed text-soft">{models[active].measures}</dd></div>
        <div><dt class="text-[11px] font-semibold uppercase tracking-wide text-mint">Inputs / data</dt><dd class="mt-1 text-sm leading-relaxed text-muted">{models[active].inputs}</dd></div>
        <div class="sm:col-span-2"><dt class="text-[11px] font-semibold uppercase tracking-wide text-mint">How it's scored</dt><dd class="mt-1 text-sm leading-relaxed text-soft">{models[active].scoring}</dd></div>
        <div><dt class="text-[11px] font-semibold uppercase tracking-wide text-mint">Labels</dt><dd class="mt-1 text-sm leading-relaxed text-muted">{models[active].labels}</dd></div>
        <div><dt class="text-[11px] font-semibold uppercase tracking-wide text-warn">Limitations</dt><dd class="mt-1 text-sm leading-relaxed text-muted">{models[active].limits}</dd></div>
      </dl>
    </section>
  {/key}

  <!-- Data sources + cadence -->
  <div class="card mt-8">
    <p class="stat-label mb-2">Data sources &amp; refresh</p>
    <p class="text-sm leading-relaxed text-muted">Models are built from public market data — CoinGecko, blockchain.com, DefiLlama, Fear &amp; Greed (alternative.me), Google Trends, Wikipedia, YouTube, Bitget, GeckoTerminal and GoPlus. Data is refreshed on a scheduled daily sync; when a source is temporarily unavailable the affected model shows “unavailable” or a reduced-confidence read rather than a stale number. Reports summarise all of the above in plain language (English &amp; Swahili).</p>
  </div>

  <!-- Disclaimer -->
  <div class="mt-6 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-xs leading-relaxed text-muted">
    <span class="font-medium text-soft">Not financial advice.</span> Pastatrade shows market conditions and research signals, not price predictions or buy/sell recommendations. Crypto is volatile and risky. Always do your own research and manage your own risk.
  </div>
</div>
