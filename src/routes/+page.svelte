<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowRight, Radar, Layers, Waves, Gauge, Star, ShieldCheck, Check, Zap, TrendingUp,
    Coins, Database, RefreshCw, Clock, LayoutGrid, HeartCrack, UserPlus, LineChart, Rocket,
    PiggyBank, Repeat, Quote, Plus, Activity, BarChart3, User, Compass, Download, FileText,
    DoorOpen, Spline, Flame
  } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { user } from '$lib/stores/auth';
  import { fmtMoney } from '$lib/format';
  import { FEATURE_LABELS, FEATURE_ORDER } from '$lib/membership-labels';
  import { t } from '$lib/i18n';
  import { browser } from '$app/environment';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  const reduceMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  import CoinMarquee from '$lib/components/CoinMarquee.svelte';
  import CountUp from '$lib/components/CountUp.svelte';
  import LiteYouTube from '$lib/components/LiteYouTube.svelte';
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
  // Carry the chosen plan through signup/login so checkout opens automatically after.
  const planHref = (p: Plan) => {
    if (p.monthly_price === 0) return $user ? '/app' : '/register';
    const intent = `/app/account?plan=${p.slug}`;
    return $user ? intent : `/register?redirect=${encodeURIComponent(intent)}`;
  };
  let pricingVisible = $state(false); // gates the staggered fly-in for pricing cards
  let userCount = $state<number | null>(null); // real registered users (from /stats)
  let videos = $state<{ id: string; title: string; views: number | null }[]>([]); // latest YouTube uploads
  onMount(async () => {
    try {
      plans = (await api<{ items: Plan[] }>('/plans')).items;
    } catch {
      /* pricing teaser is optional on the landing page */
    }
    try {
      videos = (await api<{ items: { id: string; title: string; views: number | null }[] }>('/youtube/videos?limit=3')).items ?? [];
    } catch {
      /* video section is optional */
    }
    try {
      userCount = (await api<{ users: number }>('/stats')).users;
    } catch {
      /* social-proof count is optional */
    }
  });
  // Every feature the plan includes (ordered). No longer truncated to 4.
  const planFeatures = (p: Plan) => FEATURE_ORDER.filter((k) => p.features?.[k]);
  const teaserFeatures = (p: Plan) => planFeatures(p).slice(0, p.is_popular ? 6 : 5);
  const extraFeatureCount = (p: Plan) => Math.max(0, planFeatures(p).length - teaserFeatures(p).length);
  const planAccent = (p: Plan, i: number) => (p.is_popular ? '--c-accent' : p.monthly_price === 0 ? '--c-mint' : i % 2 === 0 ? '--c-warn' : '--c-accent');
  const planAudienceKey = (p: Plan) => (p.monthly_price === 0 ? 'landing.price.audience.free' : p.is_popular ? 'landing.price.audience.mid' : 'landing.price.audience.premium');
  const maxPlanFeatureCount = () => plans.reduce((max, p) => Math.max(max, planFeatures(p).length), 0);

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
  const videoSignals = [
    { icon: LineChart, tKey: 'landing.videos.signal.1.t', bKey: 'landing.videos.signal.1.b', color: '--c-mint' },
    { icon: ShieldCheck, tKey: 'landing.videos.signal.2.t', bKey: 'landing.videos.signal.2.b', color: '--c-danger' },
    { icon: Activity, tKey: 'landing.videos.signal.3.t', bKey: 'landing.videos.signal.3.b', color: '--c-accent' }
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
          <span class="flex items-center gap-1.5"><BarChart3 class="h-4 w-4 text-accent" /> Macro</span>
          <span class="flex items-center gap-1.5"><TrendingUp class="h-4 w-4 text-mint" /> Crypto</span>
          <span class="flex items-center gap-1.5"><Activity class="h-4 w-4 text-warn" /> TradFi</span>
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
    <div class="relative z-[1]">
      <div class="feature-top">
        <div class="min-w-0">
          <span class="pill bg-mint/10 text-mint">{$t('landing.feat.eyebrow')}</span>
          <h2 class="mt-4 text-2xl font-semibold leading-tight text-strong sm:text-3xl lg:text-4xl">{$t('landing.feat.title')}</h2>
          <p class="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">{$t(commandFeature.bKey)}</p>
        </div>

        <div class="feature-command-strip" use:inview>
          <div class="feature-command-head">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.command')}</p>
              <h3 class="mt-1 text-base font-semibold text-strong">{$t(commandFeature.tKey)}</h3>
            </div>
            <span class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
              <span class="h-1.5 w-1.5 rounded-full bg-mint"></span>
              {$t('landing.preview.synced')}
            </span>
          </div>

          <div class="feature-command-metrics">
            {#each featurePreviewStats as stat}
              <div class="feature-command-metric" style="--signal: var({stat.color}); --level: {stat.level};">
                <p class="text-xs text-muted">{$t(stat.labelKey)}</p>
                <div class="mt-1 flex items-center justify-between gap-3">
                  <p class="truncate text-sm font-semibold text-strong">{$t(stat.valueKey)}</p>
                  <div class="feature-meter"><span></span></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="feature-board mt-5" use:inview={{ delay: 80 }}>
        <section class="feature-column" style="--group: var(--c-mint);">
          <div class="feature-column-head">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.risk')}</p>
              <h3 class="mt-1 text-lg font-semibold text-strong">{$t('landing.feat.radar.t')}</h3>
            </div>
            <Radar class="h-5 w-5 shrink-0 text-mint" />
          </div>
          <div class="feature-list">
            {#each riskSignals as item, i}
              <div class="feature-list-row" style="--signal: var({item.color}); --level: {item.level};" use:inview={{ delay: 120 + i * 45 }}>
                <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
                <div class="feature-list-copy">
                  <h4>{$t(item.tKey)}</h4>
                  <p>{$t(item.bKey)}</p>
                </div>
                <div class="feature-row-meter"><span></span></div>
              </div>
            {/each}
          </div>
        </section>

        <section class="feature-column" style="--group: var(--c-accent);">
          <div class="feature-column-head">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.rotation')}</p>
              <h3 class="mt-1 text-lg font-semibold text-strong">{$t('landing.feat.alt.t')}</h3>
            </div>
            <TrendingUp class="h-5 w-5 shrink-0 text-accent" />
          </div>
          <div class="feature-list">
            {#each rotationSignals as item, i}
              <div class="feature-list-row" style="--signal: var({item.color}); --level: {item.level};" use:inview={{ delay: 180 + i * 45 }}>
                <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
                <div class="feature-list-copy">
                  <h4>{$t(item.tKey)}</h4>
                  <p>{$t(item.bKey)}</p>
                </div>
                <div class="feature-row-meter"><span></span></div>
              </div>
            {/each}
          </div>
        </section>

        <section class="feature-column" style="--group: var(--c-warn);">
          <div class="feature-column-head">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.context')}</p>
              <h3 class="mt-1 text-lg font-semibold text-strong">{$t('landing.feat.logreg.t')}</h3>
            </div>
            <Spline class="h-5 w-5 shrink-0 text-warn" />
          </div>
          <div class="feature-list">
            {#each contextSignals as item, i}
              <div class="feature-list-row" style="--signal: var({item.color}); --level: {item.level};" use:inview={{ delay: 240 + i * 45 }}>
                <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
                <div class="feature-list-copy">
                  <h4>{$t(item.tKey)}</h4>
                  <p>{$t(item.bKey)}</p>
                </div>
                <div class="feature-row-meter"><span></span></div>
              </div>
            {/each}
          </div>
        </section>

        <section class="feature-column" style="--group: var(--c-mint);">
          <div class="feature-column-head">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.feat.map.delivery')}</p>
              <h3 class="mt-1 text-lg font-semibold text-strong">{$t('landing.feat.reports.t')}</h3>
            </div>
            <FileText class="h-5 w-5 shrink-0 text-mint" />
          </div>
          <div class="feature-list">
            {#each deliverySignals as item}
              <div class="feature-list-row feature-list-row-delivery" style="--signal: var({item.color}); --level: 72%;">
                <span class="signal-icon"><item.icon class="h-4 w-4" /></span>
                <div class="feature-list-copy">
                  <h4>{$t(item.tKey)}</h4>
                  <p>{$t(item.bKey)}</p>
                </div>
              </div>
            {/each}
          </div>
        </section>
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

<!-- ── 5b · VIDEOS (latest YouTube uploads) ───────────────────────────────── -->
{#if videos.length}
  <section class="video-studio py-12 sm:py-16" use:inview>
    <div class="video-studio-grid"></div>

    <div class="relative z-[1]">
      <div class="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.45fr)] lg:items-end">
        <div>
          <span class="pill border border-danger/25 bg-danger/10 text-danger"><Flame class="h-3.5 w-3.5" /> {$t('landing.videos.eyebrow')}</span>
          <h2 class="mt-4 max-w-3xl text-3xl font-semibold leading-tight text-strong sm:text-4xl lg:text-5xl">{$t('landing.videos.title')}</h2>
          <p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{$t('landing.videos.sub')}</p>
        </div>

        <div class="video-channel-panel">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.videos.channel')}</p>
          <div class="mt-3 grid grid-cols-3 gap-2">
            {#each videoSignals as signal}
              <div class="video-signal" style="--signal: var({signal.color});">
                <signal.icon class="h-4 w-4" />
                <span>{$t(signal.tKey)}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="mt-8 grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.72fr)]">
        <div class="video-hero-card">
          <div class="mb-3 flex items-center justify-between gap-3">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.videos.featured')}</span>
            <span class="rounded-full border border-edge bg-panel-2/60 px-2.5 py-1 text-xs font-medium text-muted">{$t('landing.videos.signal.1.b')}</span>
          </div>
          <LiteYouTube id={videos[0].id} title={videos[0].title} views={videos[0].views} featured fill />
        </div>

        <div class="video-queue">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.videos.watchNext')}</p>
              <h3 class="mt-1 text-lg font-semibold text-strong">{$t('landing.videos.playlist')}</h3>
            </div>
            <span class="flex h-10 w-10 items-center justify-center rounded-2xl border border-edge bg-panel-2/60 text-danger">
              <Flame class="h-5 w-5" />
            </span>
          </div>

          <div class="mt-4 space-y-3">
            {#each videos.slice(1, 3) as v, i}
              <div class="video-queue-item">
                <span class="video-queue-index">0{i + 2}</span>
                <LiteYouTube id={v.id} title={v.title} views={v.views} compact />
              </div>
            {/each}
          </div>

          <div class="mt-auto pt-4">
            <p class="mb-3 text-sm leading-relaxed text-muted">{$t('landing.videos.note')}</p>
            <a href="https://www.youtube.com/@pastatrade101" target="_blank" rel="noopener noreferrer" class="video-youtube-link">
              <span>{$t('landing.videos.cta')}</span>
              <ArrowRight class="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
{/if}

<!-- ── 6 · PRICING TEASER ─────────────────────────────────────────────────── -->
{#if plans.length}
  <section class="pricing-studio py-10 sm:py-14" use:whenInView={() => (pricingVisible = true)}>
    <div class="grid gap-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-start">
      <div class="pricing-story" use:inview>
        <span class="pill bg-accent/10 text-accent">{$t('landing.price.eyebrow')}</span>
        <h2 class="mt-4 text-2xl font-semibold leading-tight text-strong sm:text-3xl lg:text-4xl">{$t('landing.price.title')}</h2>
        <p class="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">{$t('landing.price.sub')}</p>

        <div class="mt-6 space-y-3">
          <div class="pricing-route">
            <span class="icon-badge bg-accent/12 text-accent"><Rocket class="h-5 w-5" /></span>
            <div>
              <p class="text-sm font-semibold text-strong">{$t('landing.price.route')}</p>
              <p class="mt-1 text-xs leading-relaxed text-muted">{$t('landing.price.route.copy')}</p>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div class="pricing-mini-stat">
              <span class="text-lg font-semibold text-strong">{plans.length}</span>
              <span>{$t('landing.price.stat.plans')}</span>
            </div>
            <div class="pricing-mini-stat">
              <span class="text-lg font-semibold text-strong">{maxPlanFeatureCount()}</span>
              <span>{$t('landing.price.stat.tools')}</span>
            </div>
            <div class="pricing-mini-stat">
              <span class="text-lg font-semibold text-strong">0</span>
              <span>{$t('landing.price.stat.keys')}</span>
            </div>
          </div>
        </div>

        <a href="/pricing" class="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-mint hover:underline">
          {$t('landing.price.compare')} <ArrowRight class="h-4 w-4" />
        </a>
      </div>

      <div class="pricing-plan-grid">
        {#if pricingVisible}
          {#each plans as p, i}
            <article
              class="pricing-plan {p.is_popular ? 'pricing-plan-featured' : ''}"
              style="--signal: var({planAccent(p, i)});"
              in:fly={{ y: reduceMotion ? 0 : 24, duration: reduceMotion ? 0 : 520, delay: reduceMotion ? 0 : i * 120, easing: cubicOut }}
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-lg font-semibold text-strong">{p.name}</h3>
                  <p class="mt-1 text-xs font-medium text-muted">{$t(planAudienceKey(p))}</p>
                </div>
                {#if p.badge}<span class="pill shrink-0 bg-accent/15 text-accent">{p.badge}</span>{/if}
              </div>

              <div class="mt-5 flex items-end gap-1">
                <span class="text-3xl font-semibold tracking-tight text-strong">{fmtMoney(p.monthly_price, p.currency)}</span>
                <span class="mb-1 text-sm text-muted">{$t('common.perMonth')}</span>
              </div>
              {#if p.description}<p class="mt-2 min-h-[2.5rem] text-sm leading-relaxed text-muted">{p.description}</p>{/if}

              <div class="mt-5 rounded-xl border border-edge/70 bg-panel-2/35 p-3">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-xs font-semibold uppercase tracking-wider text-muted">{$t('landing.price.included')}</span>
                  <span class="rounded-full bg-mint/10 px-2 py-0.5 text-xs font-semibold text-mint">{planFeatures(p).length}</span>
                </div>
                <ul class="mt-3 space-y-2 text-sm">
                  {#each teaserFeatures(p) as fk}
                    <li class="flex items-center gap-2 text-soft"><Check class="h-4 w-4 shrink-0 text-mint" />{FEATURE_LABELS[fk] ?? fk}</li>
                  {/each}
                </ul>
                {#if extraFeatureCount(p) > 0}
                  <p class="mt-3 text-xs font-medium text-accent">{$t('landing.price.more', { count: extraFeatureCount(p) })}</p>
                {/if}
              </div>

              <a href={planHref(p)} class="{p.is_popular ? 'btn-primary' : 'btn-ghost'} mt-5 w-full">
                {p.monthly_price === 0 ? $t('landing.price.startFree') : $t('landing.price.get', { name: p.name })}
              </a>
            </article>
          {/each}
        {/if}
      </div>
    </div>
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
  .video-studio {
    position: relative;
    overflow: hidden;
    max-width: 100vw;
    margin-inline: calc(50% - 50vw);
    padding-inline: max(1rem, calc((100vw - 1440px) / 2 + 2rem));
    border-block: 1px solid rgb(var(--c-edge) / 0.6);
    background:
      radial-gradient(90% 80% at 8% 0%, rgb(var(--c-danger) / 0.1), transparent 52%),
      radial-gradient(80% 80% at 100% 20%, rgb(var(--c-accent) / 0.1), transparent 50%),
      radial-gradient(72% 82% at 60% 120%, rgb(var(--c-mint) / 0.08), transparent 54%),
      rgb(var(--c-panel-2) / calc(var(--card-a) + 0.12));
  }
  .video-studio::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle at center, rgb(127 140 160 / 0.22) 1px, transparent 1.5px),
      linear-gradient(110deg, transparent 12%, rgb(var(--c-danger) / 0.14) 44%, transparent 72%);
    background-size: 20px 20px, 100% 100%;
    -webkit-mask-image: linear-gradient(90deg, #000 0%, rgb(0 0 0 / 0.85) 28%, transparent 72%);
    mask-image: linear-gradient(90deg, #000 0%, rgb(0 0 0 / 0.85) 28%, transparent 72%);
    pointer-events: none;
  }
  .video-studio::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(100deg, transparent 0 18%, rgb(var(--c-edge) / 0.5) 18% 18.12%, transparent 18.12% 100%),
      linear-gradient(100deg, transparent 0 66%, rgb(var(--c-accent) / 0.2) 66% 66.1%, transparent 66.1% 100%);
    opacity: 0.6;
    pointer-events: none;
  }
  .video-studio-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgb(127 140 160 / 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgb(127 140 160 / 0.08) 1px, transparent 1px);
    background-size: 72px 72px;
    -webkit-mask-image: linear-gradient(180deg, transparent, #000 16%, #000 72%, transparent);
    mask-image: linear-gradient(180deg, transparent, #000 16%, #000 72%, transparent);
    pointer-events: none;
  }
  .video-channel-panel,
  .video-hero-card,
  .video-queue {
    border: 1px solid rgb(var(--glass-brd) / var(--glass-brd-a));
    background: rgb(var(--c-panel) / var(--card-a));
    backdrop-filter: blur(18px) saturate(150%);
    -webkit-backdrop-filter: blur(18px) saturate(150%);
  }
  .video-channel-panel {
    border-radius: 1.5rem;
    padding: 1rem;
  }
  .video-signal {
    display: flex;
    min-height: 5.25rem;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.7rem;
    border-radius: 1rem;
    border: 1px solid rgb(var(--c-edge) / 0.7);
    background: linear-gradient(180deg, rgb(var(--c-panel-2) / 0.7), rgb(var(--c-panel-2) / 0.4));
    padding: 0.8rem;
    color: rgb(var(--signal));
  }
  .video-signal span {
    color: rgb(var(--c-strong));
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.2;
  }
  .video-hero-card,
  .video-queue {
    border-radius: 1.75rem;
    padding: 1rem;
  }
  .video-hero-card {
    display: flex;
    min-height: 100%;
    flex-direction: column;
  }
  .video-queue {
    display: flex;
    min-height: 100%;
    flex-direction: column;
  }
  .video-queue-item {
    display: grid;
    grid-template-columns: 2.4rem minmax(0, 1fr);
    gap: 0.8rem;
    align-items: start;
    border-radius: 1.25rem;
    border: 1px solid rgb(var(--c-edge) / 0.6);
    background: rgb(var(--c-panel-2) / 0.5);
    padding: 0.65rem;
  }
  .video-queue-index {
    display: flex;
    height: 2rem;
    width: 2rem;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid rgb(var(--c-edge) / 0.7);
    background: rgb(var(--c-panel-2) / 0.8);
    color: rgb(var(--c-muted));
    font-size: 0.7rem;
    font-weight: 800;
  }
  .video-youtube-link {
    display: inline-flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border-radius: 1rem;
    border: 1px solid rgb(var(--c-danger) / 0.35);
    background: rgb(var(--c-danger) / 0.13);
    padding: 0.9rem 1rem;
    color: rgb(var(--c-danger));
    font-weight: 700;
    transition:
      border-color 180ms ease,
      background-color 180ms ease,
      color 180ms ease;
  }
  .video-youtube-link:hover {
    border-color: rgb(var(--c-danger) / 0.55);
    background: rgb(var(--c-danger) / 0.2);
    color: rgb(var(--c-danger));
  }
  @media (max-width: 640px) {
    .video-studio {
      padding-inline: 1rem;
    }
    .video-signal {
      min-height: auto;
    }
    .video-queue-item {
      grid-template-columns: 1fr;
    }
  }

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
  .feature-top {
    display: grid;
    gap: 1.15rem;
    align-items: end;
  }
  .feature-command-strip {
    position: relative;
    overflow: hidden;
    border-radius: 1.35rem;
    border: 1px solid rgb(var(--c-edge) / 0.72);
    background:
      radial-gradient(80% 120% at 0% 0%, rgb(var(--c-mint) / 0.1), transparent 52%),
      rgb(var(--c-panel) / calc(var(--card-a) + 0.14));
    padding: 1rem;
  }
  .feature-command-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .feature-command-metrics {
    display: grid;
    margin-top: 0.85rem;
    border-top: 1px solid rgb(var(--c-edge) / 0.62);
  }
  .feature-command-metric {
    min-width: 0;
    padding: 0.75rem 0 0;
  }
  .feature-meter {
    height: 0.35rem;
    width: min(8.5rem, 38%);
    flex: 0 0 auto;
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
  .feature-board {
    display: grid;
    overflow: hidden;
    border-radius: 1.5rem;
    border: 1px solid rgb(var(--c-edge) / 0.72);
    background:
      linear-gradient(180deg, rgb(var(--c-panel) / calc(var(--card-a) + 0.18)), rgb(var(--c-panel) / calc(var(--card-a) + 0.08))),
      rgb(var(--c-panel));
  }
  .feature-column {
    min-width: 0;
    border-top: 1px solid rgb(var(--c-edge) / 0.62);
    padding: 1rem;
  }
  .feature-column:first-child {
    border-top: 0;
  }
  .feature-column-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgb(var(--group) / 0.24);
    padding-bottom: 0.8rem;
  }
  .feature-list {
    margin-top: 0.35rem;
  }
  .feature-list-row {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: 0.7rem;
    align-items: center;
    border-top: 1px solid rgb(var(--c-edge) / 0.55);
    padding: 0.72rem 0;
  }
  .feature-list-row:first-child {
    border-top: 0;
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
  .feature-list-copy {
    min-width: 0;
  }
  .feature-list-copy h4 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
    font-weight: 650;
    color: rgb(var(--c-strong));
  }
  .feature-list-copy p {
    margin-top: 0.15rem;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    font-size: 0.78rem;
    line-height: 1.45;
    color: rgb(var(--c-muted));
  }
  .feature-row-meter {
    height: 0.35rem;
    overflow: hidden;
    border-radius: 9999px;
    background: rgb(var(--c-panel-2) / 0.9);
  }
  .feature-row-meter span {
    display: block;
    height: 100%;
    width: var(--level);
    border-radius: inherit;
    background: rgb(var(--signal));
  }
  .feature-list-row-delivery {
    grid-template-columns: 2rem minmax(0, 1fr);
  }
  @media (min-width: 640px) {
    .feature-map {
      padding: 2rem;
    }
    .feature-command-metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .feature-command-metric {
      border-left: 1px solid rgb(var(--c-edge) / 0.56);
      padding: 0.15rem 0.85rem 0;
    }
    .feature-command-metric:first-child {
      border-left: 0;
      padding-left: 0;
    }
    .feature-list-row {
      grid-template-columns: 2rem minmax(0, 1fr) minmax(4.5rem, 6.5rem);
      gap: 0.8rem;
    }
  }
  @media (min-width: 1024px) {
    .feature-map {
      padding: 2.5rem;
    }
    .feature-top {
      grid-template-columns: minmax(0, 0.78fr) minmax(520px, 1fr);
    }
    .feature-board {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .feature-column {
      border-top: 0;
      border-left: 1px solid rgb(var(--c-edge) / 0.58);
      padding: 1.1rem;
    }
    .feature-column:nth-child(odd) {
      border-left: 0;
    }
    .feature-column:nth-child(n + 3) {
      border-top: 1px solid rgb(var(--c-edge) / 0.58);
    }
  }
  @media (min-width: 1280px) {
    .feature-board {
      grid-template-columns: 1.05fr 1.12fr 1fr 0.95fr;
    }
    .feature-column,
    .feature-column:nth-child(odd) {
      border-left: 1px solid rgb(var(--c-edge) / 0.58);
      border-top: 0;
    }
    .feature-column:first-child {
      border-left: 0;
    }
  }
  @media (max-width: 520px) {
    .feature-map {
      border-radius: 1.45rem;
      padding: 1rem;
    }
    .feature-command-strip,
    .feature-board {
      border-radius: 1.1rem;
    }
    .feature-command-head {
      display: grid;
    }
    .feature-column {
      padding: 0.85rem;
    }
    .feature-row-meter,
    .feature-meter {
      display: none;
    }
  }

  .pricing-studio {
    position: relative;
  }
  .pricing-story {
    position: relative;
    overflow: hidden;
    border-radius: 1.5rem;
    border: 1px solid rgb(var(--c-edge) / 0.72);
    background:
      radial-gradient(90% 90% at 0% 0%, rgb(var(--c-accent) / 0.12), transparent 54%),
      radial-gradient(80% 80% at 100% 100%, rgb(var(--c-mint) / 0.08), transparent 58%),
      rgb(var(--c-panel) / calc(var(--card-a) + 0.16));
    box-shadow: var(--glass-sh);
    padding: 1.25rem;
  }
  .pricing-story::after {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, rgb(var(--c-accent) / 0.55), transparent 72%);
    pointer-events: none;
  }
  .pricing-route {
    display: flex;
    gap: 0.85rem;
    border-radius: 1.1rem;
    border: 1px solid rgb(var(--c-accent) / 0.18);
    background: rgb(var(--c-accent) / 0.08);
    padding: 0.9rem;
  }
  .pricing-mini-stat {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.15rem;
    border-radius: 1rem;
    border: 1px solid rgb(var(--c-edge) / 0.7);
    background: rgb(var(--c-panel) / 0.58);
    padding: 0.75rem;
  }
  .pricing-mini-stat span:last-child {
    color: rgb(var(--c-muted));
    font-size: 0.72rem;
    line-height: 1.25;
  }
  .pricing-plan-grid {
    display: grid;
    gap: 1rem;
  }
  .pricing-plan {
    position: relative;
    overflow: hidden;
    border-radius: 1.35rem;
    border: 1px solid rgb(var(--c-edge) / 0.78);
    background:
      linear-gradient(180deg, rgb(var(--c-panel) / calc(var(--card-a) + 0.2)), rgb(var(--c-panel-2) / calc(var(--card-a) + 0.08))),
      rgb(var(--c-panel));
    box-shadow: 0 14px 34px rgb(0 0 0 / 0.08);
    padding: 1.15rem;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .pricing-plan::after {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgb(var(--signal) / 0.7), transparent);
    pointer-events: none;
  }
  .pricing-plan:hover {
    transform: translateY(-2px);
    border-color: rgb(var(--signal) / 0.32);
    box-shadow: 0 18px 42px rgb(0 0 0 / 0.14);
  }
  .pricing-plan-featured {
    border-color: rgb(var(--c-accent) / 0.45);
    box-shadow: 0 20px 48px rgb(var(--c-accent) / 0.12);
  }
  @supports ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
    .pricing-story,
    .pricing-plan {
      backdrop-filter: blur(20px) saturate(165%);
      -webkit-backdrop-filter: blur(20px) saturate(165%);
    }
  }
  @media (min-width: 768px) {
    .pricing-plan-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .pricing-plan-featured {
      transform: translateY(-0.5rem);
    }
    .pricing-plan-featured:hover {
      transform: translateY(-0.7rem);
    }
  }
  @media (min-width: 1024px) {
    .pricing-story {
      position: sticky;
      top: 6rem;
      padding: 1.45rem;
    }
  }
  @media (max-width: 520px) {
    .pricing-story,
    .pricing-plan {
      border-radius: 1.15rem;
      padding: 1rem;
    }
    .pricing-mini-stat {
      padding: 0.65rem;
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
