<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowRight, ArrowDown, Gauge, ShieldCheck, Coins, Database, Layers, RefreshCw, User, Plus,
    Download, FileText, Languages, LayoutGrid, MessageSquareText
  } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { user } from '$lib/stores/auth';
  import { fmtMoney } from '$lib/format';
  import { FEATURE_LABELS, FEATURE_ORDER } from '$lib/membership-labels';
  import { t } from '$lib/i18n';
  import { browser } from '$app/environment';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import CoinMarquee from '$lib/components/CoinMarquee.svelte';
  import CountUp from '$lib/components/CountUp.svelte';
  import LiteYouTube from '$lib/components/LiteYouTube.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import { buildPlainRead, plainReadFooter } from '$lib/plain-read';
  import { en } from '$lib/i18n/locales/en';
  import { sw } from '$lib/i18n/locales/sw';
  import { inview, whenInView } from '$lib/actions/inview';

  // Landing page. One editorial system: numbered sections divided by hairlines,
  // at most one level of box (only pricing plans and the plain-read card are
  // boxed), 8px corners, mint as the single accent. Copy lives in the locales.

  const reduceMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  // Videos about the platform itself, from the Pastatrade101 channel. Hand-picked
  // (not the latest uploads) — update the ids when a new walkthrough goes up.
  const HERO_VIDEO = { id: '3Oujv9Xp7UM', title: 'Pastatrade101.com — stop reacting, start reading the crypto market', duration: '1:13' };
  const videos = [
    { id: 'dnbd2-k-5Io', title: 'Is Bitcoin cheap or expensive right now? The risk score explained', duration: '5:23' },
    { id: 'dcvpZab_tX4', title: 'One dashboard, every crypto signal — 19 tools in 72 seconds', duration: '1:12' }
  ];

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

  const planFeatures = (p: Plan) => FEATURE_ORDER.filter((k) => p.features?.[k]);
  const teaserFeatures = (p: Plan) => planFeatures(p).slice(0, p.is_popular ? 6 : 5);
  const extraFeatureCount = (p: Plan) => Math.max(0, planFeatures(p).length - teaserFeatures(p).length);
  const planAudienceKey = (p: Plan) => (p.monthly_price === 0 ? 'landing.price.audience.free' : p.is_popular ? 'landing.price.audience.mid' : 'landing.price.audience.premium');
  const maxPlanFeatureCount = () => plans.reduce((max, p) => Math.max(max, planFeatures(p).length), 0);

  // Real user count → friendly label (e.g. 1240 → "1.2k+", 127 → "120+", 8 → "8").
  const fmtInvestors = (n: number): string =>
    n >= 1000 ? `${(Math.floor(n / 100) / 10).toString()}k+` : n >= 100 ? `${Math.floor(n / 10) * 10}+` : `${n}`;

  // ── Content (copy in the locales; numbers and structure here) ─────────────
  const heroTrust = ['landing.trust.free', 'landing.trust.noexchange', 'landing.trust.readonly', 'landing.trust.nfa'];
  const trust: { v?: string; vKey?: string; lKey: string; icon: typeof Coins }[] = [
    { v: 'Top 100', lKey: 'landing.stat.coins', icon: Coins },
    { v: '11', lKey: 'landing.stat.eco', icon: Layers },
    { v: '9+', lKey: 'landing.stat.sources', icon: Database },
    { vKey: 'landing.stat.daily', lKey: 'landing.stat.refresh', icon: RefreshCw },
    { v: '0–1', lKey: 'landing.stat.riskmodel', icon: Gauge }
  ];
  const pains = [
    { tKey: 'landing.prob.1.t', bKey: 'landing.prob.1.b', fixKey: 'landing.prob.1.fix' },
    { tKey: 'landing.prob.2.t', bKey: 'landing.prob.2.b', fixKey: 'landing.prob.2.fix' },
    { tKey: 'landing.prob.3.t', bKey: 'landing.prob.3.b', fixKey: 'landing.prob.3.fix' }
  ];
  // The 18 tools behind the Overview, grouped exactly as the app's sidebar
  // groups them (Overview + 18 = the "19 tools" in the headline and the videos).
  const featureGroups = [
    { labelKey: 'app.nav.group.market', color: '--c-mint', items: ['risk', 'social', 'deriv', 'macro'] },
    { labelKey: 'app.nav.group.cycle', color: '--c-accent', items: ['charts', 'btc', 'cyclelab', 'alt', 'altbottom', 'logreg'] },
    { labelKey: 'app.nav.group.discovery', color: '--c-warn', items: ['eco', 'eor', 'projects', 'tokenradar'] },
    { labelKey: 'app.nav.group.strategy', color: '--c-soft', items: ['watch', 'exit', 'rotation', 'reports'] }
  ];
  // The Risk Dashboard's zones (0.2 / 0.4 / 0.6 / 0.8) — same cut-offs as the app.
  const zones = [
    { key: 'landing.zones.z1', color: 'rgb(var(--c-mint))' },
    { key: 'landing.zones.z2', color: 'rgb(var(--c-mint) / 0.5)' },
    { key: 'landing.zones.z3', color: 'rgb(var(--c-muted) / 0.45)' },
    { key: 'landing.zones.z4', color: 'rgb(var(--c-warn))' },
    { key: 'landing.zones.z5', color: 'rgb(var(--c-danger))' }
  ];
  const steps = [
    { n: '1', tKey: 'landing.steps.1.t', bKey: 'landing.steps.1.b' },
    { n: '2', tKey: 'landing.steps.2.t', bKey: 'landing.steps.2.b' },
    { n: '3', tKey: 'landing.steps.3.t', bKey: 'landing.steps.3.b' }
  ];
  const personas = [
    { tKey: 'landing.persona.1.t', bKey: 'landing.persona.1.b' },
    { tKey: 'landing.persona.2.t', bKey: 'landing.persona.2.b' },
    { tKey: 'landing.persona.3.t', bKey: 'landing.persona.3.b' }
  ];
  // Ordered as a funnel: what it is → who it's for → plans/value → trust →
  // accuracy → support/payment → logistics/safety → differentiation.
  const faqs = [
    { qKey: 'landing.faq.7.q', aKey: 'landing.faq.7.a', groupKey: 'landing.faq.group.platform' },
    { qKey: 'landing.faq.8.q', aKey: 'landing.faq.8.a', groupKey: 'landing.faq.group.platform' },
    { qKey: 'landing.faq.9.q', aKey: 'landing.faq.9.a', groupKey: 'landing.faq.group.plans' },
    { qKey: 'landing.faq.10.q', aKey: 'landing.faq.10.a', groupKey: 'landing.faq.group.plans' },
    { qKey: 'landing.faq.2.q', aKey: 'landing.faq.2.a', groupKey: 'landing.faq.group.plans' },
    { qKey: 'landing.faq.11.q', aKey: 'landing.faq.11.a', groupKey: 'landing.faq.group.risk' },
    { qKey: 'landing.faq.1.q', aKey: 'landing.faq.1.a', groupKey: 'landing.faq.group.risk' },
    { qKey: 'landing.faq.12.q', aKey: 'landing.faq.12.a', groupKey: 'landing.faq.group.risk' },
    { qKey: 'landing.faq.13.q', aKey: 'landing.faq.13.a', groupKey: 'landing.faq.group.support' },
    { qKey: 'landing.faq.14.q', aKey: 'landing.faq.14.a', groupKey: 'landing.faq.group.support' },
    { qKey: 'landing.faq.4.q', aKey: 'landing.faq.4.a', groupKey: 'landing.faq.group.data' },
    { qKey: 'landing.faq.3.q', aKey: 'landing.faq.3.a', groupKey: 'landing.faq.group.safety' },
    { qKey: 'landing.faq.5.q', aKey: 'landing.faq.5.a', groupKey: 'landing.faq.group.plans' },
    { qKey: 'landing.faq.6.q', aKey: 'landing.faq.6.a', groupKey: 'landing.faq.group.compare' }
  ];
  const faqHighlights = [
    { icon: ShieldCheck, tKey: 'landing.faq.highlight.1.t', bKey: 'landing.faq.highlight.1.b' },
    { icon: Coins, tKey: 'landing.faq.highlight.2.t', bKey: 'landing.faq.highlight.2.b' },
    { icon: User, tKey: 'landing.faq.highlight.3.t', bKey: 'landing.faq.highlight.3.b' }
  ];

  // ── Plain read section ───────────────────────────────────────────────────
  const readPoints = [
    { icon: ShieldCheck, tKey: 'landing.read.b1.t', bKey: 'landing.read.b1.b' },
    { icon: Languages, tKey: 'landing.read.b2.t', bKey: 'landing.read.b2.b' },
    { icon: LayoutGrid, tKey: 'landing.read.b3.t', bKey: 'landing.read.b3.b' }
  ];
  // Three sample signals the demo reads.
  const demoSignals = [
    { labelKey: 'landing.preview.btcrisk', valueKey: 'landing.preview.gooddca', color: '--c-mint' },
    { labelKey: 'landing.preview.altmarket', valueKey: 'landing.preview.selective', color: '--c-accent' },
    { labelKey: 'landing.preview.socialrisk', valueKey: 'landing.preview.normalatt', color: '--c-warn' }
  ];
  // Modules that show the same plain read.
  const readModules = ['BTC Risk', 'Alt/BTC Strength', 'Exit Strategy', 'Ecosystems', 'Derivatives', 'Social Risk', 'Log Regression', 'Token Radar'];
  // The demo runs the app's real read rules ($lib/plain-read) on the sample
  // signals. It has its own language switch, independent of the site language,
  // so a visitor can see the same read in Kiswahili.
  const READ_LANGS = ['en', 'sw'] as const;
  type ReadDemoLang = (typeof READ_LANGS)[number];
  let readDemoLang = $state<ReadDemoLang>('en');
  const DICTS: Record<ReadDemoLang, Record<string, string>> = { en, sw };
  const tr = (lang: ReadDemoLang, key: string) => DICTS[lang][key] ?? DICTS.en[key] ?? key;
  const demoTone: Record<string, string> = { 'landing.preview.btcrisk': 'good' };
  const readDemo = $derived(
    buildPlainRead(
      demoSignals.map((s) => ({ name: tr(readDemoLang, s.labelKey), label: tr(readDemoLang, s.valueKey), tone: demoTone[s.labelKey] ?? 'neutral' })),
      readDemoLang
    )
  );

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
  <!-- Preload the LCP hero video thumbnail. -->
  <link rel="preload" as="image" href="https://i.ytimg.com/vi_webp/{HERO_VIDEO.id}/maxresdefault.webp" type="image/webp" fetchpriority="high" />
</svelte:head>

{#snippet sectionHead(n: string, eyebrowKey: string, titleKey: string, subKey?: string)}
  <div class="max-w-2xl">
    <p class="lp-eyebrow"><span class="lp-eyebrow-n">{n}</span>{$t(eyebrowKey)}</p>
    <h2 class="lp-h2">{$t(titleKey)}</h2>
    {#if subKey}<p class="lp-sub">{$t(subKey)}</p>{/if}
  </div>
{/snippet}

<!-- ── HERO ─────────────────────────────────────────────────────────────── -->
<section class="lp-wrap pb-12 pt-6 sm:pt-10 lg:pb-16 lg:pt-14">
  <div class="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-14">
    <div class="min-w-0">
      <p class="lp-kicker">{$t('landing.eyebrow')}</p>
      <h1 class="lp-h1">
        <span class="block">{$t('landing.h1.a')}</span>
        <span class="block text-mint">{$t('landing.h1.accent')}</span>
      </h1>
      <p class="lp-lead">{$t('landing.sub')}</p>

      <div class="mt-8 flex flex-col gap-3 sm:flex-row">
        <a href="/register" class="btn-primary justify-center px-6 py-3 text-base">{$t('landing.cta.startFree')} <ArrowRight class="h-4 w-4" /></a>
        <a href="/pricing" class="btn-ghost justify-center px-6 py-3 text-base">{$t('landing.cta.viewPricing')}</a>
      </div>

      <ul class="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        {#each heroTrust as k}
          <li class="flex items-center gap-1.5"><span class="h-1 w-1 rounded-full bg-mint" aria-hidden="true"></span>{$t(k)}</li>
        {/each}
      </ul>

      <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-edge/60 pt-5 text-sm">
        {#if userCount != null}
          <p class="text-soft">{$t('landing.hero.proof', { count: fmtInvestors(userCount) })}</p>
        {/if}
        <a href="/journey" class="lp-link">{$t('landing.cta.journey')} <ArrowRight class="h-3.5 w-3.5" /></a>
      </div>
    </div>

    <!-- Platform tour (thumbnail until clicked). Flat: thin border, no drop shadow. -->
    <div class="min-w-0">
      <LiteYouTube id={HERO_VIDEO.id} title={HERO_VIDEO.title} duration={HERO_VIDEO.duration} cta={$t('landing.hero.watchTour')} eager />
    </div>
  </div>

  <div class="mt-12 lg:mt-16">
    <CoinMarquee />
  </div>
</section>

<!-- ── PROOF STRIP ─────────────────────────────────────────────────────── -->
<section class="lp-wrap">
  <div class="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-edge/60 py-8 sm:grid-cols-3 lg:grid-cols-5">
    {#each trust as s}
      <div class="min-w-0">
        <p class="text-2xl font-semibold tracking-tight text-strong sm:text-3xl"><CountUp value={s.v ?? $t(s.vKey ?? '')} /></p>
        <p class="mt-1 text-sm leading-snug text-muted">{$t(s.lKey)}</p>
      </div>
    {/each}
  </div>
</section>

<!-- ── 01 · THE PROBLEM ─────────────────────────────────────────────────── -->
<section class="lp-section">
  <div class="lp-wrap" use:inview>
    {@render sectionHead('01', 'landing.prob.eyebrow', 'landing.prob.title', 'landing.prob.sub')}
    <div class="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
      {#each pains as p}
        <div class="border-t border-edge pt-6">
          <h3 class="lp-h3">{$t(p.tKey)}</h3>
          <p class="mt-2 text-[15px] leading-relaxed text-muted">{$t(p.bKey)}</p>
          <p class="mt-4 flex items-start gap-2 text-[15px] font-medium leading-snug text-mint">
            <ArrowRight class="mt-1 h-4 w-4 shrink-0" />{$t(p.fixKey)}
          </p>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ── 02 · THE PLATFORM ────────────────────────────────────────────────── -->
<section class="lp-section">
  <div class="lp-wrap" use:inview>
    <div class="grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-12">
      <div class="lg:col-span-7">
        {@render sectionHead('02', 'landing.feat.eyebrow', 'landing.feat.title', 'landing.feat.overview.b')}
      </div>

      <!-- The one graphic on the page: the risk score's five zones -->
      <figure class="lg:col-span-5">
        <figcaption class="lp-label">{$t('landing.zones.title')}</figcaption>
        <div class="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-sm" aria-hidden="true">
          {#each zones as z}<span class="flex-1" style="background: {z.color};"></span>{/each}
        </div>
        <div class="mt-2 grid grid-cols-5 gap-x-2 text-[11px] leading-tight text-muted">
          {#each zones as z}<span>{$t(z.key)}</span>{/each}
        </div>
        <div class="mt-1 flex justify-between text-[11px] tabular-nums text-muted/70" aria-hidden="true">
          {#each ['0', '0.2', '0.4', '0.6', '0.8', '1'] as tick}<span>{tick}</span>{/each}
        </div>
        <p class="mt-4 text-sm leading-relaxed text-muted">{$t('landing.zones.caption')}</p>
      </figure>
    </div>

    <div class="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
      {#each featureGroups as g}
        <div class="min-w-0">
          <h3 class="lp-label flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full" style="background: rgb(var({g.color}));"></span>{$t(g.labelKey)}
          </h3>
          <ul class="mt-4 divide-y divide-edge/60 border-t border-edge">
            {#each g.items as k}
              <li class="py-4">
                <p class="text-[15px] font-semibold text-strong">{$t(`landing.feat.${k}.t`)}</p>
                <p class="mt-1 text-sm leading-relaxed text-muted">{$t(`landing.feat.${k}.b`)}</p>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ── 03 · PLAIN LANGUAGE ──────────────────────────────────────────────── -->
<section id="plain-read" class="lp-section scroll-mt-24">
  <div class="lp-wrap grid gap-12 lg:grid-cols-2 lg:gap-16" use:inview>
    <div class="flex min-w-0 flex-col">
      {@render sectionHead('03', 'landing.read.eyebrow', 'landing.read.title', 'landing.read.sub')}
      <ul class="mt-8 space-y-5">
        {#each readPoints as p}
          <li class="flex items-start gap-3">
            <p.icon class="mt-0.5 h-4 w-4 shrink-0 text-mint" />
            <div class="min-w-0">
              <h3 class="text-[15px] font-semibold text-strong">{$t(p.tKey)}</h3>
              <p class="mt-0.5 text-sm leading-relaxed text-muted">{$t(p.bKey)}</p>
            </div>
          </li>
        {/each}
      </ul>
      <div class="mt-8 flex flex-wrap items-center gap-3 lg:mt-auto lg:pt-8">
        <a href={$user ? '/app' : '/register'} class="btn-primary">{$t('landing.read.cta.primary')} <ArrowRight class="h-4 w-4" /></a>
        <a href="/pricing" class="btn-ghost">{$t('landing.read.cta.secondary')}</a>
      </div>
    </div>

    <!-- Demo: three sample signals → the read the rules write, in either language -->
    <div class="min-w-0 lg:pt-14">
      <p class="lp-label">{$t('landing.read.demo.from')}</p>
      <ul class="mt-3 divide-y divide-edge/60 border-y border-edge/60">
        {#each demoSignals as s}
          <li class="flex items-center justify-between gap-4 py-3 text-sm">
            <span class="flex min-w-0 items-center gap-2 text-muted">
              <span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background: rgb(var({s.color}));"></span>
              <span class="truncate">{tr(readDemoLang, s.labelKey)}</span>
            </span>
            <span class="font-medium text-strong">{tr(readDemoLang, s.valueKey)}</span>
          </li>
        {/each}
      </ul>

      <p class="lp-label mt-6 flex items-center gap-2"><ArrowDown class="h-3.5 w-3.5" /> {$t('landing.read.demo.reads')}</p>

      {#if readDemo}
        <div class="mt-3 rounded-lg border border-mint/25 bg-mint/[0.05] p-5">
          <div class="flex items-center justify-between gap-3">
            <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-mint">
              <MessageSquareText class="h-3.5 w-3.5" /> {readDemoLang === 'sw' ? 'Kwa lugha rahisi' : 'Plain read'}
            </span>
            <div class="lp-toggle" role="group" aria-label="Language">
              {#each READ_LANGS as lng}
                <button type="button" class:is-active={readDemoLang === lng} aria-pressed={readDemoLang === lng} onclick={() => (readDemoLang = lng)}>{lng === 'en' ? 'EN' : 'SW'}</button>
              {/each}
            </div>
          </div>
          <p class="mt-3 text-base font-semibold leading-snug text-strong">{readDemo.headline}</p>
          <p class="mt-1.5 text-sm leading-relaxed text-soft">{readDemo.body}</p>
          <p class="mt-4 border-t border-edge/60 pt-3 text-[11px] text-muted">{plainReadFooter(readDemoLang)}</p>
        </div>
      {/if}

      <p class="mt-5 text-xs leading-relaxed text-muted">
        <span class="font-medium text-soft">{$t('landing.read.demo.everywhere')}:</span> {readModules.join(' · ')}
      </p>
    </div>
  </div>
</section>

<!-- ── 04 · HOW IT WORKS ────────────────────────────────────────────────── -->
<section class="lp-section">
  <div class="lp-wrap" use:inview>
    {@render sectionHead('04', 'landing.steps.eyebrow', 'landing.steps.title')}
    <ol class="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
      {#each steps as s}
        <li class="border-t border-edge pt-6">
          <span class="lp-num">{s.n}</span>
          <h3 class="lp-h3 mt-4">{$t(s.tKey)}</h3>
          <p class="mt-2 text-[15px] leading-relaxed text-muted">{$t(s.bKey)}</p>
        </li>
      {/each}
    </ol>

    <!-- Overview deck (PDF) — bilingual on purpose -->
    <div class="mt-14 flex flex-col gap-5 border-t border-edge/60 pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div class="flex min-w-0 items-start gap-4">
        <FileText class="mt-0.5 h-5 w-5 shrink-0 text-mint" />
        <div class="min-w-0">
          <h3 class="font-semibold text-strong">New to Pastatrade? Start here.</h3>
          <p class="mt-1 text-sm leading-relaxed text-muted">A short PDF that explains the whole platform in plain language — English &amp; Kiswahili — and answers the everyday crypto questions you already ask.</p>
          <p class="mt-1 text-sm italic leading-relaxed text-muted/80">Mpya kwa Pastatrade? PDF fupi inayoeleza jukwaa zima kwa lugha rahisi — Kiingereza na Kiswahili.</p>
        </div>
      </div>
      <a href="/pastatrade-overview.pdf" download class="btn-ghost shrink-0 whitespace-nowrap">
        <Download class="h-4 w-4" /> Download overview (PDF)
      </a>
    </div>
  </div>
</section>

<!-- ── 05 · WATCH ───────────────────────────────────────────────────────── -->
<section class="lp-section">
  <div class="lp-wrap" use:inview>
    {@render sectionHead('05', 'landing.videos.eyebrow', 'landing.videos.title', 'landing.videos.sub')}

    <div class="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-10">
      <div class="min-w-0">
        <p class="lp-label mb-3">{$t('landing.videos.featured')}</p>
        <LiteYouTube id={videos[0].id} title={videos[0].title} duration={videos[0].duration} cta={$t('landing.videos.watch')} featured caption={false} />
        <h3 class="mt-3 text-lg font-semibold leading-snug text-strong">{videos[0].title}</h3>
      </div>

      <div class="flex min-w-0 flex-col">
        <p class="lp-label mb-3">{$t('landing.videos.playlist')}</p>
        {#each videos.slice(1, 3) as v}
          <div class="mb-6">
            <LiteYouTube id={v.id} title={v.title} duration={v.duration} cta={$t('landing.videos.watch')} compact caption={false} />
            <h3 class="mt-2.5 text-[15px] font-semibold leading-snug text-strong">{v.title}</h3>
          </div>
        {/each}
        <div class="mt-auto border-t border-edge/60 pt-5">
          <p class="text-sm text-muted">{$t('landing.videos.note')}</p>
          <a href="https://www.youtube.com/@pastatrade101" target="_blank" rel="noopener noreferrer" class="lp-link mt-2">
            {$t('landing.videos.cta')} <ArrowRight class="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── 06 · PRICING ─────────────────────────────────────────────────────── -->
{#if plans.length}
  <section class="lp-section" use:whenInView={() => (pricingVisible = true)}>
    <div class="lp-wrap grid gap-12 lg:grid-cols-12 lg:gap-12">
      <div class="min-w-0 lg:col-span-4" use:inview>
        {@render sectionHead('06', 'landing.price.eyebrow', 'landing.price.title', 'landing.price.sub')}

        <div class="mt-8 border-t border-edge pt-5">
          <p class="lp-label text-mint">{$t('landing.price.route')}</p>
          <p class="mt-2 text-sm leading-relaxed text-muted">{$t('landing.price.route.copy')}</p>
        </div>
        <div class="mt-6 grid grid-cols-3 gap-4 border-t border-edge pt-5">
          <div><p class="text-2xl font-semibold text-strong">{plans.length}</p><p class="mt-0.5 text-xs text-muted">{$t('landing.price.stat.plans')}</p></div>
          <div><p class="text-2xl font-semibold text-strong">{maxPlanFeatureCount()}</p><p class="mt-0.5 text-xs text-muted">{$t('landing.price.stat.tools')}</p></div>
          <div><p class="text-2xl font-semibold text-strong">0</p><p class="mt-0.5 text-xs text-muted">{$t('landing.price.stat.keys')}</p></div>
        </div>
        <a href="/pricing" class="lp-link mt-6">{$t('landing.price.compare')}</a>
      </div>

      <div class="grid min-w-0 gap-4 md:grid-cols-3 lg:col-span-8">
        {#if pricingVisible}
          {#each plans as p, i}
            <article
              class="lp-plan {p.is_popular ? 'is-featured' : ''}"
              in:fly={{ y: reduceMotion ? 0 : 20, duration: reduceMotion ? 0 : 480, delay: reduceMotion ? 0 : i * 110, easing: cubicOut }}
            >
              <div class="flex items-start justify-between gap-3">
                <h3 class="text-lg font-semibold text-strong">{p.name}</h3>
                {#if p.badge}<span class="rounded-md bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent">{p.badge}</span>{/if}
              </div>
              <p class="mt-1 text-xs text-muted">{$t(planAudienceKey(p))}</p>

              <p class="mt-5 flex items-baseline gap-1">
                <span class="text-3xl font-semibold tracking-tight text-strong">{fmtMoney(p.monthly_price, p.currency)}</span>
                <span class="text-sm text-muted">{$t('common.perMonth')}</span>
              </p>
              {#if p.description}<p class="mt-2 text-sm leading-relaxed text-muted">{p.description}</p>{/if}

              <ul class="mt-5 space-y-2 border-t border-edge/70 pt-4 text-sm">
                {#each teaserFeatures(p) as fk}
                  <li class="flex items-start gap-2 text-soft"><span class="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-mint"></span>{FEATURE_LABELS[fk] ?? fk}</li>
                {/each}
              </ul>
              {#if extraFeatureCount(p) > 0}
                <p class="mt-3 text-xs text-muted">{$t('landing.price.more', { count: extraFeatureCount(p) })}</p>
              {/if}

              <a href={planHref(p)} class="{p.is_popular ? 'btn-primary' : 'btn-ghost'} mt-6 w-full justify-center lg:mt-auto">
                {p.monthly_price === 0 ? $t('landing.price.startFree') : $t('landing.price.get', { name: p.name })}
              </a>
            </article>
          {/each}
        {/if}
      </div>
    </div>
  </section>
{/if}

<!-- ── 07 · WHO IT'S FOR ────────────────────────────────────────────────── -->
<section class="lp-section">
  <div class="lp-wrap" use:inview>
    {@render sectionHead('07', 'landing.persona.eyebrow', 'landing.persona.title')}
    <div class="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
      {#each personas as p}
        <div class="border-t border-edge pt-6">
          <h3 class="lp-label text-mint">{$t(p.tKey)}</h3>
          <p class="mt-3 text-lg leading-relaxed text-soft">{$t(p.bKey)}</p>
        </div>
      {/each}
    </div>
    <p class="mt-14 text-2xl font-semibold tracking-tight text-strong sm:text-3xl">{$t('landing.persona.quote')}</p>
  </div>
</section>

<!-- ── 08 · FAQ ─────────────────────────────────────────────────────────── -->
<section class="lp-section">
  <div class="lp-wrap grid gap-12 lg:grid-cols-12 lg:gap-12">
    <div class="min-w-0 lg:col-span-4" use:inview>
      {@render sectionHead('08', 'landing.faq.eyebrow', 'landing.faq.title', 'landing.faq.sub')}
      <ul class="mt-8 space-y-5">
        {#each faqHighlights as h}
          <li class="flex items-start gap-3">
            <h.icon class="mt-0.5 h-4 w-4 shrink-0 text-mint" />
            <div class="min-w-0">
              <h3 class="text-[15px] font-semibold text-strong">{$t(h.tKey)}</h3>
              <p class="mt-0.5 text-sm leading-relaxed text-muted">{$t(h.bKey)}</p>
            </div>
          </li>
        {/each}
      </ul>
    </div>

    <div class="min-w-0 border-t border-edge lg:col-span-8">
      {#each faqs as f, i}
        <details class="lp-faq group" open={i === 0}>
          <summary>
            <span class="min-w-0 flex-1">
              <span class="block text-[11px] font-semibold uppercase tracking-wider text-muted">{$t(f.groupKey)}</span>
              <span class="mt-1 block text-[15px] font-semibold leading-snug text-strong sm:text-base">{$t(f.qKey)}</span>
            </span>
            <Plus class="lp-faq-icon mt-5 h-4 w-4 shrink-0 text-muted" />
          </summary>
          <p class="max-w-2xl pb-6 pr-8 text-[15px] leading-relaxed text-muted">{$t(f.aKey)}</p>
        </details>
      {/each}
    </div>
  </div>
</section>

<!-- ── FINAL CTA (one panel, nothing nested) ───────────────────────────── -->
<section class="lp-section">
  <div class="lp-wrap">
    <div class="rounded-lg border border-mint/20 bg-mint/[0.05] px-6 py-14 text-center sm:px-12 sm:py-20" use:inview>
      <p class="lp-eyebrow justify-center">{$t('landing.final.eyebrow')}</p>
      <h2 class="lp-h2 mx-auto max-w-3xl">{$t('landing.final.title')}</h2>
      <p class="lp-sub mx-auto">{$t('landing.final.sub')}</p>
      <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <a href="/register" class="btn-primary justify-center px-6 py-3 text-base">{$t('landing.cta.startFree')} <ArrowRight class="h-4 w-4" /></a>
        <a href="/pricing" class="btn-ghost justify-center px-6 py-3 text-base">{$t('landing.cta.viewPricing')}</a>
      </div>
      <p class="mx-auto mt-6 flex max-w-xl items-start justify-center gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck class="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" /> {$t('landing.final.trust')}
      </p>
    </div>
  </div>
</section>

<style>
  /* Content measure: the layout's container is 1440px; the landing reads at 1200. */
  .lp-wrap {
    width: 100%;
    max-width: 75rem;
    margin-inline: auto;
  }
  .lp-section {
    border-top: 1px solid rgb(var(--c-edge) / 0.6);
    padding-block: 4rem;
  }
  @media (min-width: 640px) {
    .lp-section {
      padding-block: 5.5rem;
    }
  }
  @media (min-width: 1024px) {
    .lp-section {
      padding-block: 6.5rem;
    }
  }

  /* ── Type ── */
  .lp-kicker {
    font-size: 0.8125rem;
    font-weight: 500;
    color: rgb(var(--c-muted));
  }
  .lp-h1 {
    margin-top: 1rem;
    font-size: clamp(2.375rem, 5.4vw, 4.25rem);
    font-weight: 700;
    line-height: 1.03;
    letter-spacing: -0.035em;
    color: rgb(var(--c-strong));
    text-wrap: balance;
  }
  .lp-lead {
    margin-top: 1.5rem;
    max-width: 36rem;
    font-size: 1.0625rem;
    line-height: 1.65;
    color: rgb(var(--c-muted));
  }
  @media (min-width: 640px) {
    .lp-lead {
      font-size: 1.1875rem;
    }
  }
  .lp-eyebrow {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgb(var(--c-mint));
  }
  .lp-eyebrow-n {
    font-variant-numeric: tabular-nums;
    color: rgb(var(--c-muted));
  }
  .lp-eyebrow-n::after {
    content: '';
    display: inline-block;
    width: 1.5rem;
    height: 1px;
    margin-left: 0.75rem;
    vertical-align: middle;
    background: rgb(var(--c-edge));
  }
  .lp-h2 {
    margin-top: 1rem;
    font-size: clamp(1.875rem, 3.6vw, 2.875rem);
    font-weight: 650;
    line-height: 1.08;
    letter-spacing: -0.028em;
    color: rgb(var(--c-strong));
    text-wrap: balance;
  }
  .lp-sub {
    margin-top: 1.125rem;
    max-width: 40rem;
    font-size: 1.0625rem;
    line-height: 1.65;
    color: rgb(var(--c-muted));
  }
  .lp-h3 {
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.3;
    color: rgb(var(--c-strong));
  }
  .lp-label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgb(var(--c-muted));
  }
  .lp-num {
    display: block;
    font-size: 2.75rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    color: rgb(var(--c-mint));
  }
  .lp-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: rgb(var(--c-mint));
  }
  .lp-link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* ── Plain-read language toggle ── */
  .lp-toggle {
    display: inline-flex;
    gap: 2px;
    border-radius: 0.375rem;
    border: 1px solid rgb(var(--c-edge));
    padding: 2px;
  }
  .lp-toggle button {
    border-radius: 0.25rem;
    padding: 0.125rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    color: rgb(var(--c-muted));
  }
  .lp-toggle button.is-active {
    background: rgb(var(--c-mint) / 0.15);
    color: rgb(var(--c-mint));
  }

  /* ── Pricing plan: the only boxed item besides the plain-read card ── */
  .lp-plan {
    display: flex;
    flex-direction: column;
    border-radius: 0.5rem;
    border: 1px solid rgb(var(--c-edge));
    background: rgb(var(--c-panel) / 0.45);
    padding: 1.5rem;
  }
  .lp-plan.is-featured {
    border-color: rgb(var(--c-mint) / 0.5);
    background: rgb(var(--c-mint) / 0.04);
  }

  /* ── FAQ: rows separated by hairlines, no boxes ── */
  .lp-faq {
    border-bottom: 1px solid rgb(var(--c-edge) / 0.6);
  }
  .lp-faq summary {
    display: flex;
    cursor: pointer;
    list-style: none;
    align-items: flex-start;
    gap: 1.5rem;
    padding-block: 1.25rem;
  }
  .lp-faq summary::-webkit-details-marker {
    display: none;
  }
  .lp-faq summary:hover :global(.lp-faq-icon) {
    color: rgb(var(--c-strong));
  }
  .lp-faq :global(.lp-faq-icon) {
    transition: transform 200ms ease;
  }
  .lp-faq[open] :global(.lp-faq-icon) {
    transform: rotate(45deg);
    color: rgb(var(--c-mint));
  }
</style>
