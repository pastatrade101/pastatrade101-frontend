<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowRight, Radar, Layers, Waves, Gauge, Star, ShieldCheck, Check, Zap, TrendingUp,
    Coins, Database, RefreshCw, Clock, LayoutGrid, HeartCrack, UserPlus, LineChart, Rocket,
    PiggyBank, Repeat, Quote, Plus, Activity, BarChart3, User, Compass, Download, FileText,
    DoorOpen, Spline, Flame
  } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { fmtMoney } from '$lib/format';
  import { FEATURE_LABELS, FEATURE_ORDER } from '$lib/membership-labels';
  import { t } from '$lib/i18n';
  import { browser } from '$app/environment';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  const reduceMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  import CoinMarquee from '$lib/components/CoinMarquee.svelte';
  import CountUp from '$lib/components/CountUp.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import { inview, whenInView } from '$lib/actions/inview';

  const SITE_URL = 'https://pastatrade101.com';
  const baseJsonLd = [
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'Pastatrade', url: SITE_URL, logo: `${SITE_URL}/favicon.svg`, description: 'Crypto rotation intelligence — BTC risk, Alt/BTC strength, on-chain data, ecosystem rotation and social attention in one clear read.' },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Pastatrade', url: SITE_URL },
    { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Pastatrade', applicationCategory: 'FinanceApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }
  ];

  // ── Pricing teaser (DB-driven) ──────────────────────────────────────────
  interface Plan {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    badge: string | null;
    monthly_price: number;
    currency: string;
    is_popular: boolean;
    features: Record<string, boolean>;
  }
  let plans = $state<Plan[]>([]);
  let pricingVisible = $state(false); // gates the staggered fly-in for pricing cards
  let userCount = $state<number | null>(null); // real registered users (from /stats)
  onMount(async () => {
    try {
      plans = (await api<{ items: Plan[] }>('/plans')).items;
    } catch {
      /* pricing teaser is optional on the landing page */
    }
    try {
      userCount = (await api<{ users: number }>('/stats')).users;
    } catch {
      /* social-proof count is optional */
    }
  });
  // Every feature the plan includes (ordered). No longer truncated to 4.
  const planFeatures = (p: Plan) => FEATURE_ORDER.filter((k) => p.features?.[k]);

  // Real user count → friendly label (e.g. 1240 → "1.2k+", 127 → "120+", 8 → "8").
  const fmtInvestors = (n: number): string =>
    n >= 1000 ? `${(Math.floor(n / 100) / 10).toString()}k+` : n >= 100 ? `${Math.floor(n / 10) * 10}+` : `${n}`;

  // ── Marketing content (i18n keys; icons + numbers stay here) ─────────────
  const trust: { v?: string; vKey?: string; lKey: string; icon: typeof Coins }[] = [
    { v: 'Top 100+', lKey: 'landing.stat.coins', icon: Coins },
    { v: '11+', lKey: 'landing.stat.eco', icon: Layers },
    { v: '9+', lKey: 'landing.stat.sources', icon: Database },
    { vKey: 'landing.stat.daily', lKey: 'landing.stat.refresh', icon: RefreshCw },
    { v: '0–1', lKey: 'landing.stat.riskmodel', icon: Gauge }
  ];
  const pains = [
    { icon: Clock, tKey: 'landing.prob.1.t', bKey: 'landing.prob.1.b', fixKey: 'landing.prob.1.fix' },
    { icon: LayoutGrid, tKey: 'landing.prob.2.t', bKey: 'landing.prob.2.b', fixKey: 'landing.prob.2.fix' },
    { icon: HeartCrack, tKey: 'landing.prob.3.t', bKey: 'landing.prob.3.b', fixKey: 'landing.prob.3.fix' }
  ];
  const commandFeature = { icon: LayoutGrid, tKey: 'landing.feat.overview.t', bKey: 'landing.feat.overview.b' };
  const featurePreviewStats = [
    { labelKey: 'landing.preview.btcrisk', valueKey: 'landing.preview.gooddca', level: '32%', color: '--c-mint' },
    { labelKey: 'landing.preview.altmarket', valueKey: 'landing.preview.selective', level: '58%', color: '--c-accent' },
    { labelKey: 'landing.preview.socialrisk', valueKey: 'landing.preview.normalatt', level: '42%', color: '--c-warn' }
  ];
  const riskSignals = [
    { icon: Gauge, tKey: 'landing.feat.risk.t', bKey: 'landing.feat.risk.b', level: '32%', color: '--c-mint' },
    { icon: Radar, tKey: 'landing.feat.radar.t', bKey: 'landing.feat.radar.b', level: '64%', color: '--c-accent' },
    { icon: DoorOpen, tKey: 'landing.feat.exit.t', bKey: 'landing.feat.exit.b', level: '28%', color: '--c-warn' }
  ];
  const rotationSignals = [
    { icon: TrendingUp, tKey: 'landing.feat.alt.t', bKey: 'landing.feat.alt.b', level: '56%', color: '--c-accent' },
    { icon: Activity, tKey: 'landing.feat.altbottom.t', bKey: 'landing.feat.altbottom.b', level: '46%', color: '--c-mint' },
    { icon: Layers, tKey: 'landing.feat.eco.t', bKey: 'landing.feat.eco.b', level: '68%', color: '--c-mint' },
    { icon: Compass, tKey: 'landing.feat.eor.t', bKey: 'landing.feat.eor.b', level: '52%', color: '--c-warn' }
  ];
  const contextSignals = [
    { icon: Spline, tKey: 'landing.feat.logreg.t', bKey: 'landing.feat.logreg.b', level: '62%', color: '--c-accent' },
    { icon: Flame, tKey: 'landing.feat.deriv.t', bKey: 'landing.feat.deriv.b', level: '38%', color: '--c-danger' },
    { icon: Waves, tKey: 'landing.feat.social.t', bKey: 'landing.feat.social.b', level: '42%', color: '--c-warn' }
  ];
  const deliverySignals = [
    { icon: FileText, tKey: 'landing.feat.reports.t', bKey: 'landing.feat.reports.b', color: '--c-accent' },
    { icon: Star, tKey: 'landing.feat.watch.t', bKey: 'landing.feat.watch.b', color: '--c-mint' }
  ];
  const steps = [
    { n: '01', icon: UserPlus, tKey: 'landing.steps.1.t', bKey: 'landing.steps.1.b' },
    { n: '02', icon: LineChart, tKey: 'landing.steps.2.t', bKey: 'landing.steps.2.b' },
    { n: '03', icon: Rocket, tKey: 'landing.steps.3.t', bKey: 'landing.steps.3.b' }
  ];
  const personas = [
    { icon: PiggyBank, tKey: 'landing.persona.1.t', bKey: 'landing.persona.1.b' },
    { icon: Repeat, tKey: 'landing.persona.2.t', bKey: 'landing.persona.2.b' },
    { icon: ShieldCheck, tKey: 'landing.persona.3.t', bKey: 'landing.persona.3.b' }
  ];
  // Ordered as a funnel: what it is → who it's for → plans/value → trust →
  // accuracy → support/payment → logistics/safety → differentiation.
  const faqs = [
    { qKey: 'landing.faq.7.q', aKey: 'landing.faq.7.a', groupKey: 'landing.faq.group.platform' }, // What is Pastatrade101?
    { qKey: 'landing.faq.8.q', aKey: 'landing.faq.8.a', groupKey: 'landing.faq.group.platform' }, // Who is it for?
    { qKey: 'landing.faq.9.q', aKey: 'landing.faq.9.a', groupKey: 'landing.faq.group.plans' }, // Free vs Mid vs Premium
    { qKey: 'landing.faq.10.q', aKey: 'landing.faq.10.a', groupKey: 'landing.faq.group.plans' }, // What do I get with Premium?
    { qKey: 'landing.faq.2.q', aKey: 'landing.faq.2.a', groupKey: 'landing.faq.group.plans' }, // What do I get for free?
    { qKey: 'landing.faq.11.q', aKey: 'landing.faq.11.a', groupKey: 'landing.faq.group.risk' }, // Does it tell me what to buy/sell?
    { qKey: 'landing.faq.1.q', aKey: 'landing.faq.1.a', groupKey: 'landing.faq.group.risk' }, // Is this financial advice?
    { qKey: 'landing.faq.12.q', aKey: 'landing.faq.12.a', groupKey: 'landing.faq.group.risk' }, // How accurate are the signals?
    { qKey: 'landing.faq.13.q', aKey: 'landing.faq.13.a', groupKey: 'landing.faq.group.support' }, // Can I call/ask questions?
    { qKey: 'landing.faq.14.q', aKey: 'landing.faq.14.a', groupKey: 'landing.faq.group.support' }, // Payment methods
    { qKey: 'landing.faq.4.q', aKey: 'landing.faq.4.a', groupKey: 'landing.faq.group.data' }, // How often is data updated?
    { qKey: 'landing.faq.3.q', aKey: 'landing.faq.3.a', groupKey: 'landing.faq.group.safety' }, // Do you touch my funds/keys?
    { qKey: 'landing.faq.5.q', aKey: 'landing.faq.5.a', groupKey: 'landing.faq.group.plans' }, // Cancel/downgrade?
    { qKey: 'landing.faq.6.q', aKey: 'landing.faq.6.a', groupKey: 'landing.faq.group.compare' } // Different from CoinGecko/DefiLlama?
  ];
  const faqHighlights = [
    { icon: ShieldCheck, tKey: 'landing.faq.highlight.1.t', bKey: 'landing.faq.highlight.1.b', color: '--c-mint' },
    { icon: Coins, tKey: 'landing.faq.highlight.2.t', bKey: 'landing.faq.highlight.2.b', color: '--c-accent' },
    { icon: User, tKey: 'landing.faq.highlight.3.t', bKey: 'landing.faq.highlight.3.b', color: '--c-warn' }
  ];
  const finalProofs = [
    { icon: Gauge, labelKey: 'landing.preview.btcrisk', valueKey: 'landing.preview.gooddca', level: '32%', color: '--c-mint' },
    { icon: Activity, labelKey: 'landing.preview.altbtcsignal', valueKey: 'landing.preview.confirmed', level: '58%', color: '--c-accent' },
    { icon: FileText, labelKey: 'landing.final.preview.report', valueKey: 'landing.final.preview.ready', level: '78%', color: '--c-warn' }
  ];
  const finalTrust = ['landing.trust.free', 'landing.trust.noexchange', 'landing.trust.readonly'];

  // Base structured data + a FAQPage built from the FAQ section (rich-result eligible).
  const seoJsonLd = $derived([
    ...baseJsonLd,
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({ '@type': 'Question', name: $t(f.qKey), acceptedAnswer: { '@type': 'Answer', text: $t(f.aKey) } }))
    }
  ]);
</script>

<Seo
  home
  title="Pastatrade — Crypto rotation intelligence"
  description="Pastatrade turns BTC risk, Alt/BTC strength, on-chain data, ecosystem rotation and social attention into one clear read — so you know what's improving, what's weakening, and what needs confirmation. Free to start. Not financial advice."
  jsonLd={seoJsonLd}
/>

<svelte:head>
  <!-- Preload the LCP hero image (AVIF for modern browsers). -->
  <link rel="preload" as="image" href="/hero-img.avif" type="image/avif" />
</svelte:head>

<!-- ── 1 · HERO ───────────────────────────────────────────────────────────── -->
<section class="relative overflow-hidden py-10 sm:py-12 lg:py-16">
  <div class="hero-grid"></div>
  <div class="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12">
    <div class="min-w-0 lg:order-2">
      <span class="pill bg-mint/10 text-mint">{$t('landing.eyebrow')}</span>
      <h1 class="mt-5 text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem] lg:leading-[1.07]">
        <span class="text-strong">{$t('landing.h1.a')}</span>
        <span class="mt-1 block text-mint">{$t('landing.h1.accent')}</span>
      </h1>
      <p class="mt-4 max-w-xl text-base leading-relaxed text-muted sm:mt-5 sm:text-lg">{$t('landing.sub')}</p>

      <div class="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:flex-wrap sm:items-center">
        <a href="/register" class="btn-primary w-full justify-center px-6 py-3 text-base sm:w-auto">{$t('landing.cta.startFree')} <ArrowRight class="h-4 w-4" /></a>
        <a href="/pricing" class="btn-ghost w-full justify-center px-6 py-3 text-base sm:w-auto">{$t('landing.cta.viewPricing')}</a>
      </div>
      <p class="mt-3 flex items-center gap-1.5 text-xs text-muted"><Star class="h-3.5 w-3.5 text-accent" /> {$t('landing.hero.builtfor')}</p>

      <div class="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
        {#each ['landing.trust.free', 'landing.trust.noexchange', 'landing.trust.readonly', 'landing.trust.nfa'] as b, i}
          {#if i > 0}<span class="text-edge">·</span>{/if}
          <span class="flex items-center gap-1.5"><Check class="h-3.5 w-3.5 text-mint" /> {$t(b)}</span>
        {/each}
      </div>
    </div>

    <!-- Founder portrait on a branded platform, with floating product proof -->
    <div class="relative min-w-0 lg:order-1">
      <div class="hero-glow"></div>
      <div class="relative mx-auto w-full max-w-md lg:ml-0 lg:mr-auto">
        <!-- Soft branded backdrop the cutout stands on -->
        <div class="absolute inset-x-2 bottom-0 top-10 rounded-[2rem] border border-edge/60 bg-gradient-to-b from-mint/12 via-accent/[0.08] to-transparent"></div>

        <picture class="contents">
          <source srcset="/hero-img.avif" type="image/avif" />
          <img
            src="/hero-img.png"
            alt="Pastatrade founder"
            width="900"
            height="900"
            fetchpriority="high"
            class="relative z-[1] mx-auto block w-full max-w-[26rem] object-contain"
            style="filter: drop-shadow(0 22px 45px rgb(0 0 0 / 0.4));"
          />
        </picture>

        <!-- Floating: live BTC risk proof (bottom-left) -->
        <div class="absolute bottom-5 left-3 z-[2] w-44 rounded-xl border border-edge bg-panel/90 p-3 shadow-xl backdrop-blur">
          <div class="flex items-center justify-between text-[11px]"><span class="text-muted">{$t('landing.preview.btcrisk')}</span><span class="font-semibold text-mint">{$t('landing.preview.gooddca')}</span></div>
          <div class="mt-2 h-2 w-full overflow-hidden rounded-full" style="background: linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)">
            <div class="h-full w-[32%] border-r-2 border-strong bg-transparent"></div>
          </div>
          <div class="mt-1 text-xl font-bold text-strong">0.32</div>
        </div>

        <!-- Floating: live status + ecosystem signal (top-right) -->
        <div class="absolute right-0 top-8 z-[2] rounded-xl border border-edge bg-panel/90 px-3 py-2 shadow-xl backdrop-blur sm:-right-3">
          <div class="flex items-center gap-1.5">
            <span class="relative flex h-1.5 w-1.5">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75"></span>
              <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint"></span>
            </span>
            <span class="text-[10px] uppercase tracking-wide text-muted">{$t('landing.preview.synced')}</span>
          </div>
          <span class="mt-1.5 inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">NEAR · {$t('landing.preview.improving')}</span>
        </div>
      </div>

      <!-- Discover my journey CTA -->
      <div class="mt-5 flex justify-center lg:justify-start">
        <a href="/journey" class="inline-flex items-center gap-2 rounded-full border border-mint/40 bg-mint/10 px-5 py-2.5 text-sm font-semibold text-mint transition hover:bg-mint/20">
          <Compass class="h-4 w-4" /> {$t('landing.cta.journey')} <ArrowRight class="h-4 w-4" />
        </a>
      </div>

      <!-- Social proof strip (below the portrait) -->
      <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div class="flex items-center gap-3">
          <div class="flex -space-x-2.5">
            {#each [0, 1, 2] as i}
              <span class="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-panel-2 text-muted">
                <User class="h-4 w-4" />
              </span>
            {/each}
          </div>
          <div>
            <div class="text-sm font-bold text-strong">{userCount != null ? `${fmtInvestors(userCount)} ` : ''}Investors</div>
            <div class="text-xs text-muted">Learn from our analysis</div>
          </div>
        </div>

        <span class="hidden h-8 w-px bg-edge sm:block"></span>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
          <span class="flex items-center gap-1.5"><BarChart3 class="h-4 w-4 text-[#5b8cff]" /> Macro</span>
          <span class="flex items-center gap-1.5"><TrendingUp class="h-4 w-4 text-[#37e0a6]" /> Crypto</span>
          <span class="flex items-center gap-1.5"><Activity class="h-4 w-4 text-[#a855f7]" /> TradFi</span>
        </div>
      </div>
    </div>

    <!-- Live coin logos marquee (hover for label) -->
    <div class="col-span-full mt-2 lg:order-3 lg:mt-6">
      <CoinMarquee />
    </div>
  </div>
</section>

<!-- ── 2 · TRUST BAR (value-based stats, animated count-up) ───────────────── -->
<section class="py-8">
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    {#each trust as s, i}
      <div class="stat-tile text-center" use:inview={{ delay: i * 70 }}>
        <span class="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-mint/10 text-mint"><s.icon class="h-5 w-5" /></span>
        <div class="mt-2.5 text-3xl font-bold tracking-tight text-mint"><CountUp value={s.v ?? $t(s.vKey ?? '')} /></div>
        <div class="mt-1 text-xs leading-snug text-muted">{$t(s.lKey)}</div>
      </div>
    {/each}
  </div>
</section>

<!-- ── 3 · PROBLEM → SOLUTION ─────────────────────────────────────────────── -->
<section class="py-10 sm:py-14">
  <div class="mx-auto max-w-2xl text-center">
    <span class="pill bg-warn/10 text-warn">{$t('landing.prob.eyebrow')}</span>
    <h2 class="mt-3 text-2xl font-semibold text-strong sm:text-3xl">{$t('landing.prob.title')}</h2>
    <p class="mt-2 text-muted">{$t('landing.prob.sub')}</p>
  </div>
  <div class="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
    {#each pains as p, i}
      <div class="card rail-card flex flex-col" style="--rail: var(--c-warn)" use:inview={{ delay: i * 80 }}>
        <span class="icon-badge bg-warn/12 text-warn"><p.icon class="h-5 w-5" /></span>
        <h3 class="mt-3 font-semibold text-strong">{$t(p.tKey)}</h3>
        <p class="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{$t(p.bKey)}</p>
        <p class="mt-3 flex items-start gap-1.5 border-t border-edge/50 pt-3 text-sm text-mint">
          <Check class="mt-0.5 h-4 w-4 shrink-0" /> {$t(p.fixKey)}
        </p>
      </div>
    {/each}
  </div>
</section>

<!-- ── 4 · FEATURES ───────────────────────────────────────────────────────── -->
<section class="py-10 sm:py-14">
  <div class="feature-map">
    <div class="feature-map-grid"></div>
    <div class="relative z-[1] grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10">
      <div class="min-w-0">
        <span class="pill bg-mint/10 text-mint">{$t('landing.feat.eyebrow')}</span>
        <h2 class="mt-4 text-2xl font-semibold leading-tight text-strong sm:text-3xl lg:text-4xl">{$t('landing.feat.title')}</h2>
        <p class="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">{$t(commandFeature.bKey)}</p>

        <div class="feature-preview mt-7" use:inview>
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.command')}</p>
              <h3 class="mt-1 text-lg font-semibold text-strong">{$t(commandFeature.tKey)}</h3>
            </div>
            <span class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
              <span class="h-1.5 w-1.5 rounded-full bg-mint"></span>
              {$t('landing.preview.synced')}
            </span>
          </div>

          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            {#each featurePreviewStats as stat}
              <div class="feature-metric" style="--signal: var({stat.color}); --level: {stat.level};">
                <p class="text-xs text-muted">{$t(stat.labelKey)}</p>
                <p class="mt-1 text-sm font-semibold text-strong">{$t(stat.valueKey)}</p>
                <div class="feature-meter mt-3"><span></span></div>
              </div>
            {/each}
          </div>

          <div class="market-tape mt-5" aria-hidden="true">
            {#each [52, 68, 44, 74, 58, 82, 63, 90, 70, 78, 61, 84] as h, i}
              <span style="height: {h}%; --bar-delay: {i * 60}ms"></span>
            {/each}
          </div>
        </div>
      </div>

      <div class="min-w-0 space-y-4">
        <div class="feature-cluster feature-cluster-risk" use:inview={{ delay: 80 }}>
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.risk')}</p>
              <h3 class="mt-1 text-lg font-semibold text-strong">{$t('landing.feat.radar.t')}</h3>
            </div>
            <span class="icon-badge bg-mint/12 text-mint"><Radar class="h-5 w-5" /></span>
          </div>

          <div class="mt-4 space-y-3">
            {#each riskSignals as item, i}
              <div class="signal-row" style="--signal: var({item.color}); --level: {item.level};" use:inview={{ delay: 120 + i * 70 }}>
                <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-3">
                    <h4 class="truncate text-sm font-semibold text-strong">{$t(item.tKey)}</h4>
                    <div class="signal-line"><span></span></div>
                  </div>
                  <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{$t(item.bKey)}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div class="feature-stack" use:inview={{ delay: 160 }}>
            <div class="mb-4 flex items-center justify-between gap-3">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.rotation')}</p>
              <span class="h-px flex-1 bg-edge/70"></span>
            </div>
            <div class="space-y-3">
              {#each rotationSignals as item, i}
                <div class="compact-signal" style="--signal: var({item.color}); --level: {item.level};" use:inview={{ delay: 180 + i * 60 }}>
                  <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
                  <div class="min-w-0">
                    <h4 class="text-sm font-semibold text-strong">{$t(item.tKey)}</h4>
                    <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{$t(item.bKey)}</p>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <div class="feature-stack" use:inview={{ delay: 220 }}>
            <div class="mb-4 flex items-center justify-between gap-3">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.context')}</p>
              <span class="h-px flex-1 bg-edge/70"></span>
            </div>
            <div class="space-y-3">
              {#each contextSignals as item, i}
                <div class="compact-signal" style="--signal: var({item.color}); --level: {item.level};" use:inview={{ delay: 240 + i * 60 }}>
                  <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
                  <div class="min-w-0">
                    <h4 class="text-sm font-semibold text-strong">{$t(item.tKey)}</h4>
                    <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{$t(item.bKey)}</p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <div class="delivery-strip" use:inview={{ delay: 260 }}>
          <div class="mb-4 flex items-center justify-between gap-3">
            <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.delivery')}</p>
            <span class="h-px flex-1 bg-edge/70"></span>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            {#each deliverySignals as item}
              <div class="delivery-item" style="--signal: var({item.color});">
                <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
                <div>
                  <h4 class="text-sm font-semibold text-strong">{$t(item.tKey)}</h4>
                  <p class="mt-1 text-xs leading-relaxed text-muted">{$t(item.bKey)}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── 5 · HOW IT WORKS ───────────────────────────────────────────────────── -->
<section class="py-10 sm:py-14">
  <div class="mx-auto mb-8 max-w-2xl text-center">
    <span class="pill bg-mint/10 text-mint">{$t('landing.steps.eyebrow')}</span>
    <h2 class="mt-3 text-2xl font-semibold text-strong sm:text-3xl">{$t('landing.steps.title')}</h2>
  </div>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
    {#each steps as s, i}
      <div class="card rail-card relative overflow-hidden" style="--rail: var(--c-mint)" use:inview={{ delay: i * 80 }}>
        <span class="pointer-events-none absolute -right-1 top-1 select-none text-6xl font-bold leading-none text-mint/10">{s.n}</span>
        <span class="icon-badge bg-mint/12 text-mint"><s.icon class="h-5 w-5" /></span>
        <p class="mt-3 text-[11px] font-bold uppercase tracking-wider text-mint/60">{$t('landing.steps.step')} {s.n}</p>
        <h3 class="mt-0.5 font-semibold text-strong">{$t(s.tKey)}</h3>
        <p class="mt-1.5 text-sm leading-relaxed text-muted">{$t(s.bKey)}</p>
      </div>
    {/each}
  </div>

  <!-- Download the full overview deck (PDF) -->
  <div class="mx-auto mt-6 max-w-3xl">
    <div class="card flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3">
        <span class="icon-badge bg-mint/12 text-mint"><FileText class="h-5 w-5" /></span>
        <div>
          <h3 class="font-semibold text-strong">New to Pastatrade? Start here.</h3>
          <p class="mt-0.5 text-sm leading-relaxed text-muted">A simple PDF that explains the whole platform in plain language — English &amp; Swahili. It’s not too technical; it answers the everyday crypto questions you already ask.</p>
          <p class="mt-1 text-sm italic leading-relaxed text-muted/80">Mpya kwa Pastatrade? PDF rahisi inayoeleza platform nzima kwa lugha rahisi — Kiingereza na Kiswahili.</p>
        </div>
      </div>
      <a href="/pastatrade-overview.pdf" download class="btn-primary shrink-0 whitespace-nowrap">
        <Download class="h-4 w-4" /> Download overview (PDF)
      </a>
    </div>
  </div>
</section>

<!-- ── 6 · PRICING TEASER ─────────────────────────────────────────────────── -->
{#if plans.length}
  <section class="py-6" use:whenInView={() => (pricingVisible = true)}>
    <div class="mx-auto mb-8 max-w-2xl text-center">
      <span class="pill bg-accent/10 text-accent">{$t('landing.price.eyebrow')}</span>
      <h2 class="mt-3 text-2xl font-semibold text-strong sm:text-3xl">{$t('landing.price.title')}</h2>
      <p class="mt-2 text-muted">{$t('landing.price.sub')}</p>
    </div>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      {#if pricingVisible}
        {#each plans as p, i}
        <div
          class="card rail-card flex flex-col {p.is_popular ? 'border-accent/40' : ''}"
          style={p.is_popular ? '--rail: var(--c-accent)' : '--rail: var(--c-edge)'}
          in:fly={{ y: reduceMotion ? 0 : 28, duration: reduceMotion ? 0 : 600, delay: reduceMotion ? 0 : i * 160, easing: cubicOut }}
        >
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-strong">{p.name}</h3>
            {#if p.badge}<span class="pill bg-accent/15 text-accent">{p.badge}</span>{/if}
          </div>
          <div class="mt-1 flex items-end gap-1">
            <span class="text-3xl font-semibold text-strong">{fmtMoney(p.monthly_price, p.currency)}</span>
            <span class="mb-1 text-sm text-muted">{$t('common.perMonth')}</span>
          </div>
          {#if p.description}<p class="mt-1 text-sm text-muted">{p.description}</p>{/if}
          <ul class="my-4 space-y-1.5 text-sm">
            {#each planFeatures(p) as fk}
              <li class="flex items-center gap-2 text-soft"><Check class="h-4 w-4 shrink-0 text-mint" />{FEATURE_LABELS[fk] ?? fk}</li>
            {/each}
          </ul>
          <a href="/register" class="{p.is_popular ? 'btn-primary' : 'btn-ghost'} mt-auto w-full">
            {p.monthly_price === 0 ? $t('landing.price.startFree') : $t('landing.price.get', { name: p.name })}
          </a>
        </div>
        {/each}
      {/if}
    </div>
    <div class="mt-4 text-center"><a href="/pricing" class="text-sm text-mint hover:underline">{$t('landing.price.compare')}</a></div>
  </section>
{/if}

<!-- ── 7 · WHO IT'S FOR ───────────────────────────────────────────────────── -->
<section class="py-10 sm:py-14">
  <div class="mx-auto mb-8 max-w-2xl text-center">
    <span class="pill bg-accent/10 text-accent">{$t('landing.persona.eyebrow')}</span>
    <h2 class="mt-3 text-2xl font-semibold text-strong sm:text-3xl">{$t('landing.persona.title')}</h2>
  </div>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
    {#each personas as p, i}
      <div class="card rail-card flex flex-col" style="--rail: var(--c-accent)" use:inview={{ delay: i * 80 }}>
        <Quote class="h-7 w-7 text-accent/30" />
        <p class="mt-2 flex-1 text-[15px] leading-relaxed text-soft">{$t(p.bKey)}</p>
        <div class="mt-4 flex items-center gap-2.5 border-t border-edge/50 pt-3">
          <span class="icon-badge bg-accent/12 text-accent"><p.icon class="h-5 w-5" /></span>
          <span class="text-sm font-medium text-accent">{$t(p.tKey)}</span>
        </div>
      </div>
    {/each}
  </div>
  <p class="mx-auto mt-8 max-w-2xl text-center text-lg italic text-soft">{$t('landing.persona.quote')}</p>
</section>

<!-- ── 8 · FAQ ────────────────────────────────────────────────────────────── -->
<section class="py-10 sm:py-14">
  <div class="faq-center">
    <div class="faq-intro" use:inview>
      <span class="pill bg-mint/10 text-mint">{$t('landing.faq.eyebrow')}</span>
      <h2 class="mt-4 text-2xl font-semibold leading-tight text-strong sm:text-3xl lg:text-4xl">{$t('landing.faq.title')}</h2>
      <p class="mt-3 text-sm leading-relaxed text-muted sm:text-base">{$t('landing.faq.sub')}</p>

      <div class="mt-6 space-y-3">
        {#each faqHighlights as item, i}
          <div class="faq-highlight" style="--signal: var({item.color});" use:inview={{ delay: 100 + i * 70 }}>
            <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
            <div>
              <h3 class="text-sm font-semibold text-strong">{$t(item.tKey)}</h3>
              <p class="mt-1 text-xs leading-relaxed text-muted">{$t(item.bKey)}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="faq-board" use:inview={{ delay: 120 }}>
      <div class="faq-board-head">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.faq.board')}</p>
          <p class="mt-1 text-sm text-soft">{faqs.length} {$t('landing.faq.count')}</p>
        </div>
        <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint/12 text-mint">
          <Quote class="h-5 w-5" />
        </span>
      </div>

      <div class="mt-4 space-y-2.5">
        {#each faqs as f, i}
          <details class="faq-item group" open={i === 0} use:inview={{ delay: 160 + Math.min(i, 8) * 45 }}>
            <summary>
              <span class="faq-index">{String(i + 1).padStart(2, '0')}</span>
              <span class="min-w-0 flex-1">
                <span class="faq-group-label">{$t(f.groupKey)}</span>
                <span class="mt-1 block text-sm font-semibold leading-snug text-strong sm:text-base">{$t(f.qKey)}</span>
              </span>
              <span class="faq-toggle">
                <Plus class="h-4 w-4" />
              </span>
            </summary>
            <p class="faq-answer">{$t(f.aKey)}</p>
          </details>
        {/each}
      </div>
    </div>
  </div>
</section>

<!-- ── 9 · FINAL CTA ──────────────────────────────────────────────────────── -->
<section class="py-10 sm:py-14">
  <div class="final-cta" use:inview>
    <div class="final-cta-grid"></div>
    <div class="relative z-[1] grid gap-7 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.72fr)] lg:items-center">
      <div class="min-w-0">
        <span class="pill bg-mint/10 text-mint"><Zap class="h-3.5 w-3.5" /> {$t('landing.final.eyebrow')}</span>
        <h2 class="mt-4 max-w-3xl text-2xl font-semibold leading-tight text-strong sm:text-3xl lg:text-4xl">{$t('landing.final.title')}</h2>
        <p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{$t('landing.final.sub')}</p>

        <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href="/register" class="btn-primary w-full justify-center px-6 py-3 text-base shadow-lg shadow-mint/15 sm:w-auto">
            {$t('landing.cta.startFree')} <ArrowRight class="h-4 w-4" />
          </a>
          <a href="/pricing" class="btn-ghost w-full justify-center px-6 py-3 text-base sm:w-auto">{$t('landing.cta.viewPricing')}</a>
        </div>

        <div class="mt-5 flex flex-wrap gap-2.5">
          {#each finalTrust as item}
            <span class="final-trust-chip"><Check class="h-3.5 w-3.5 text-mint" /> {$t(item)}</span>
          {/each}
        </div>
      </div>

      <div class="final-proof">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.final.preview.title')}</p>
            <h3 class="mt-1 text-lg font-semibold text-strong">{$t('landing.feat.overview.t')}</h3>
          </div>
          <span class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
            <span class="h-1.5 w-1.5 rounded-full bg-mint"></span>
            {$t('landing.preview.synced')}
          </span>
        </div>

        <div class="mt-5 space-y-3">
          {#each finalProofs as item}
            <div class="final-proof-row" style="--signal: var({item.color}); --level: {item.level};">
              <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm font-semibold text-strong">{$t(item.labelKey)}</span>
                  <span class="text-xs font-medium text-muted">{$t(item.valueKey)}</span>
                </div>
                <div class="feature-meter mt-2"><span></span></div>
              </div>
            </div>
          {/each}
        </div>

        <p class="mt-4 flex items-start gap-2 border-t border-edge/60 pt-4 text-xs leading-relaxed text-muted">
          <ShieldCheck class="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" /> {$t('landing.final.trust')}
        </p>
      </div>
    </div>
  </div>
</section>

<style>
  .feature-map {
    position: relative;
    overflow: hidden;
    border-radius: 2rem;
    border: 1px solid rgb(var(--glass-brd) / var(--glass-brd-a));
    background:
      radial-gradient(90% 80% at 10% 0%, rgb(var(--c-mint) / 0.14), transparent 52%),
      radial-gradient(80% 80% at 100% 20%, rgb(var(--c-accent) / 0.12), transparent 48%),
      radial-gradient(70% 70% at 78% 100%, rgb(var(--c-warn) / 0.08), transparent 54%),
      rgb(var(--c-panel) / calc(var(--card-a) + 0.08));
    box-shadow: var(--glass-sh);
    padding: 1.5rem;
  }
  @supports ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
    .feature-map {
      backdrop-filter: blur(22px) saturate(165%);
      -webkit-backdrop-filter: blur(22px) saturate(165%);
    }
  }
  .feature-map::after {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgb(var(--c-mint) / 0.5), rgb(var(--c-accent) / 0.35), transparent);
    pointer-events: none;
  }
  .feature-map-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgb(127 140 160 / 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgb(127 140 160 / 0.08) 1px, transparent 1px);
    background-size: 36px 36px;
    -webkit-mask-image: radial-gradient(72% 78% at 50% 38%, #000, transparent 78%);
    mask-image: radial-gradient(72% 78% at 50% 38%, #000, transparent 78%);
    pointer-events: none;
  }
  .feature-preview,
  .feature-cluster,
  .feature-stack,
  .delivery-strip {
    position: relative;
    overflow: hidden;
    border: 1px solid rgb(var(--c-edge) / 0.72);
    background: rgb(var(--c-panel) / calc(var(--card-a) + 0.2));
    box-shadow: 0 18px 45px rgb(0 0 0 / 0.12);
  }
  .feature-preview {
    border-radius: 1.5rem;
    padding: 1.15rem;
  }
  .feature-preview::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(90% 80% at 10% 0%, rgb(var(--c-mint) / 0.12), transparent 52%);
    pointer-events: none;
  }
  .feature-preview > * {
    position: relative;
    z-index: 1;
  }
  .feature-metric {
    border-radius: 1rem;
    border: 1px solid rgb(var(--signal) / 0.18);
    background: rgb(var(--signal) / 0.08);
    padding: 0.85rem;
  }
  .feature-meter {
    height: 0.35rem;
    overflow: hidden;
    border-radius: 9999px;
    background: rgb(var(--c-panel-2) / 0.85);
  }
  .feature-meter span {
    display: block;
    height: 100%;
    width: var(--level);
    border-radius: inherit;
    background: linear-gradient(90deg, rgb(var(--signal) / 0.45), rgb(var(--signal)));
  }
  .market-tape {
    display: grid;
    height: 8.5rem;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: end;
    gap: 0.45rem;
    border-radius: 1.1rem;
    border: 1px solid rgb(var(--c-edge) / 0.65);
    background:
      linear-gradient(180deg, rgb(var(--c-panel-2) / 0.4), transparent),
      repeating-linear-gradient(180deg, transparent 0 2rem, rgb(var(--c-edge) / 0.36) 2rem calc(2rem + 1px));
    padding: 0.8rem;
  }
  .market-tape span {
    display: block;
    min-height: 1.2rem;
    border-radius: 9999px 9999px 0.35rem 0.35rem;
    background: linear-gradient(180deg, rgb(var(--c-mint)), rgb(var(--c-accent)));
    box-shadow: 0 0 18px rgb(var(--c-mint) / 0.16);
    animation: tape-rise 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--bar-delay);
    transform-origin: bottom;
  }
  .market-tape span:nth-child(3n) {
    background: linear-gradient(180deg, rgb(var(--c-warn)), rgb(var(--c-accent)));
  }
  .market-tape span:nth-child(4n) {
    background: linear-gradient(180deg, rgb(var(--c-danger)), rgb(var(--c-warn)));
  }
  .feature-cluster,
  .feature-stack,
  .delivery-strip {
    border-radius: 1.35rem;
    padding: 1rem;
  }
  .feature-cluster-risk {
    background:
      radial-gradient(80% 100% at 100% 0%, rgb(var(--c-mint) / 0.11), transparent 48%),
      rgb(var(--c-panel) / calc(var(--card-a) + 0.2));
  }
  .signal-row,
  .compact-signal,
  .delivery-item {
    display: flex;
    min-width: 0;
    gap: 0.85rem;
    border-radius: 1rem;
    border: 1px solid rgb(var(--signal) / 0.16);
    background: rgb(var(--signal) / 0.06);
    padding: 0.85rem;
  }
  .signal-row {
    align-items: flex-start;
  }
  .compact-signal,
  .delivery-item {
    align-items: flex-start;
  }
  .signal-icon {
    display: inline-flex;
    height: 2.1rem;
    width: 2.1rem;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 0.85rem;
    color: rgb(var(--signal));
    background: rgb(var(--signal) / 0.13);
  }
  .signal-line {
    height: 0.35rem;
    width: min(8rem, 34%);
    flex: 0 0 auto;
    overflow: hidden;
    border-radius: 9999px;
    background: rgb(var(--c-panel-2) / 0.9);
  }
  .signal-line span {
    display: block;
    height: 100%;
    width: var(--level);
    border-radius: inherit;
    background: rgb(var(--signal));
  }
  .delivery-strip {
    background:
      radial-gradient(90% 100% at 0% 100%, rgb(var(--c-accent) / 0.1), transparent 48%),
      rgb(var(--c-panel) / calc(var(--card-a) + 0.2));
  }
  @keyframes tape-rise {
    from {
      transform: scaleY(0.35);
      opacity: 0.35;
    }
    to {
      transform: scaleY(1);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .market-tape span {
      animation: none;
    }
  }
  @media (min-width: 640px) {
    .feature-map {
      padding: 2rem;
    }
    .feature-preview,
    .feature-cluster,
    .feature-stack,
    .delivery-strip {
      padding: 1.25rem;
    }
  }
  @media (min-width: 1024px) {
    .feature-map {
      padding: 2.5rem;
    }
  }
  @media (max-width: 520px) {
    .feature-map {
      border-radius: 1.45rem;
      padding: 1rem;
    }
    .feature-preview,
    .feature-cluster,
    .feature-stack,
    .delivery-strip {
      border-radius: 1.1rem;
    }
    .signal-row,
    .compact-signal,
    .delivery-item {
      gap: 0.7rem;
      padding: 0.75rem;
    }
    .signal-line {
      display: none;
    }
    .market-tape {
      height: 6.5rem;
      gap: 0.3rem;
    }
  }

  .faq-center {
    display: grid;
    gap: 1rem;
    align-items: start;
  }
  .faq-intro,
  .faq-board {
    position: relative;
    overflow: hidden;
    border: 1px solid rgb(var(--glass-brd) / var(--glass-brd-a));
    background: rgb(var(--c-panel) / calc(var(--card-a) + 0.16));
    box-shadow: var(--glass-sh);
  }
  .faq-intro {
    border-radius: 1.5rem;
    padding: 1.2rem;
    background:
      radial-gradient(90% 90% at 0% 0%, rgb(var(--c-mint) / 0.13), transparent 55%),
      radial-gradient(85% 90% at 100% 100%, rgb(var(--c-accent) / 0.08), transparent 55%),
      rgb(var(--c-panel) / calc(var(--card-a) + 0.16));
  }
  .faq-intro::after {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, rgb(var(--c-mint) / 0.5), transparent 72%);
    pointer-events: none;
  }
  .faq-highlight {
    display: flex;
    gap: 0.85rem;
    border-radius: 1rem;
    border: 1px solid rgb(var(--signal) / 0.16);
    background: rgb(var(--signal) / 0.07);
    padding: 0.85rem;
  }
  .faq-board {
    border-radius: 1.65rem;
    padding: 0.85rem;
    background:
      radial-gradient(75% 70% at 100% 0%, rgb(var(--c-accent) / 0.1), transparent 52%),
      rgb(var(--c-panel) / calc(var(--card-a) + 0.2));
  }
  .faq-board-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgb(var(--c-edge) / 0.65);
    padding: 0.45rem 0.5rem 1rem;
  }
  .faq-item {
    border-radius: 1rem;
    border: 1px solid transparent;
    transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .faq-item summary {
    display: flex;
    cursor: pointer;
    list-style: none;
    align-items: center;
    gap: 0.85rem;
    padding: 0.95rem;
  }
  .faq-item summary::-webkit-details-marker {
    display: none;
  }
  .faq-item:hover {
    background: rgb(var(--c-panel-2) / 0.42);
  }
  .faq-item[open] {
    border-color: rgb(var(--c-mint) / 0.28);
    background:
      radial-gradient(95% 110% at 0% 0%, rgb(var(--c-mint) / 0.1), transparent 52%),
      rgb(var(--c-panel-2) / 0.52);
    box-shadow: 0 16px 35px rgb(0 0 0 / 0.08);
  }
  .faq-index {
    display: inline-flex;
    height: 2.1rem;
    width: 2.1rem;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 0.85rem;
    background: rgb(var(--c-panel-2) / 0.92);
    color: rgb(var(--c-muted));
    font-size: 0.72rem;
    font-weight: 700;
  }
  .faq-item[open] .faq-index {
    background: rgb(var(--c-mint) / 0.14);
    color: rgb(var(--c-mint));
  }
  .faq-group-label {
    display: inline-flex;
    max-width: 100%;
    border-radius: 9999px;
    background: rgb(var(--c-panel-2) / 0.78);
    padding: 0.18rem 0.5rem;
    color: rgb(var(--c-muted));
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  .faq-toggle {
    display: inline-flex;
    height: 2rem;
    width: 2rem;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    border: 1px solid rgb(var(--c-edge));
    color: rgb(var(--c-muted));
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
  }
  .faq-item[open] .faq-toggle {
    transform: rotate(45deg);
    border-color: rgb(var(--c-mint) / 0.35);
    background: rgb(var(--c-mint) / 0.1);
    color: rgb(var(--c-mint));
  }
  .faq-answer {
    margin: 0;
    padding: 0 0.95rem 1rem 3.95rem;
    color: rgb(var(--c-muted));
    font-size: 0.9rem;
    line-height: 1.75;
  }
  @media (min-width: 1024px) {
    .faq-center {
      grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
      gap: 1.25rem;
    }
    .faq-intro {
      position: sticky;
      top: 6rem;
      padding: 1.45rem;
    }
    .faq-board {
      padding: 1rem;
    }
  }
  @media (max-width: 520px) {
    .faq-intro,
    .faq-board {
      border-radius: 1.2rem;
    }
    .faq-item summary {
      align-items: flex-start;
      gap: 0.7rem;
      padding: 0.8rem;
    }
    .faq-index,
    .faq-toggle {
      height: 1.85rem;
      width: 1.85rem;
    }
    .faq-answer {
      padding: 0 0.8rem 0.9rem 3.35rem;
      font-size: 0.84rem;
    }
  }

  .final-cta {
    position: relative;
    overflow: hidden;
    border-radius: 2rem;
    border: 1px solid rgb(var(--glass-brd) / var(--glass-brd-a));
    background:
      linear-gradient(135deg, rgb(var(--c-panel) / calc(var(--card-a) + 0.24)), rgb(var(--c-panel-2) / calc(var(--card-a) + 0.14))),
      rgb(var(--c-panel));
    box-shadow: var(--glass-sh);
    padding: 1.25rem;
  }
  .final-cta::after {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgb(var(--c-mint) / 0.52), rgb(var(--c-accent) / 0.3), transparent);
    pointer-events: none;
  }
  .final-cta-grid {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgb(127 140 160 / 0.12) 1px, transparent 1.4px);
    background-size: 18px 18px;
    -webkit-mask-image: linear-gradient(120deg, rgba(0, 0, 0, 0.72), transparent 68%);
    mask-image: linear-gradient(120deg, rgba(0, 0, 0, 0.72), transparent 68%);
    pointer-events: none;
  }
  .final-trust-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border-radius: 9999px;
    border: 1px solid rgb(var(--c-edge) / 0.72);
    background: rgb(var(--c-panel) / 0.62);
    padding: 0.45rem 0.7rem;
    color: rgb(var(--c-muted));
    font-size: 0.78rem;
    font-weight: 600;
  }
  .final-proof {
    overflow: hidden;
    border-radius: 1.35rem;
    border: 1px solid rgb(var(--c-edge) / 0.78);
    background:
      linear-gradient(180deg, rgb(var(--c-panel) / calc(var(--card-a) + 0.2)), rgb(var(--c-panel-2) / calc(var(--card-a) + 0.1))),
      rgb(var(--c-panel));
    padding: 1rem;
    box-shadow: 0 18px 44px rgb(0 0 0 / 0.12);
  }
  .final-proof-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.85rem;
    border-radius: 1rem;
    border: 1px solid rgb(var(--signal) / 0.16);
    background: rgb(var(--signal) / 0.06);
    padding: 0.85rem;
  }
  @supports ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
    .final-cta,
    .final-proof {
      backdrop-filter: blur(22px) saturate(165%);
      -webkit-backdrop-filter: blur(22px) saturate(165%);
    }
  }
  @media (min-width: 640px) {
    .final-cta {
      padding: 1.65rem;
    }
    .final-proof {
      padding: 1.2rem;
    }
  }
  @media (min-width: 1024px) {
    .final-cta {
      padding: 2rem;
    }
  }
  @media (max-width: 520px) {
    .final-cta {
      border-radius: 1.35rem;
      padding: 1rem;
    }
    .final-proof {
      border-radius: 1.1rem;
    }
    .final-proof-row {
      align-items: flex-start;
      gap: 0.7rem;
      padding: 0.75rem;
    }
    .final-proof-row .flex.items-center.justify-between {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.15rem;
    }
  }

  /* Faint market-grid behind the hero, fading outward */
  .hero-grid {
    position: absolute;
    inset: -2rem -2rem auto -2rem;
    height: 130%;
    background-image:
      linear-gradient(rgb(127 140 160 / 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgb(127 140 160 / 0.06) 1px, transparent 1px);
    background-size: 44px 44px;
    -webkit-mask-image: radial-gradient(80% 60% at 70% 30%, #000, transparent 75%);
    mask-image: radial-gradient(80% 60% at 70% 30%, #000, transparent 75%);
    pointer-events: none;
    z-index: 0;
  }
  /* Soft green glow behind the dashboard preview */
  .hero-glow {
    position: absolute;
    inset: -12% -8% -12% -8%;
    background: radial-gradient(60% 60% at 60% 40%, rgb(var(--c-mint) / 0.18), transparent 70%);
    filter: blur(36px);
    pointer-events: none;
    z-index: 0;
  }
</style>
