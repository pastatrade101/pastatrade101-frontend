<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowRight, Radar, Layers, Waves, Gauge, Star, ShieldCheck, Check, Zap, TrendingUp,
    Coins, Database, RefreshCw, Clock, LayoutGrid, HeartCrack, UserPlus, LineChart, Rocket,
    PiggyBank, Repeat, Quote, Plus
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
  import { inview, whenInView } from '$lib/actions/inview';

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
  onMount(async () => {
    try {
      plans = (await api<{ items: Plan[] }>('/plans')).items;
    } catch {
      /* pricing teaser is optional on the landing page */
    }
  });
  const topFeatures = (p: Plan) => FEATURE_ORDER.filter((k) => p.features?.[k]).slice(0, 4);

  // ── Marketing content (i18n keys; icons + numbers stay here) ─────────────
  const trust: { v?: string; vKey?: string; lKey: string; icon: typeof Coins }[] = [
    { v: 'Top 100+', lKey: 'landing.stat.coins', icon: Coins },
    { v: '11+', lKey: 'landing.stat.eco', icon: Layers },
    { v: '6+', lKey: 'landing.stat.sources', icon: Database },
    { vKey: 'landing.stat.daily', lKey: 'landing.stat.refresh', icon: RefreshCw },
    { v: '0–1', lKey: 'landing.stat.riskmodel', icon: Gauge }
  ];
  const pains = [
    { icon: Clock, tKey: 'landing.prob.1.t', bKey: 'landing.prob.1.b', fixKey: 'landing.prob.1.fix' },
    { icon: LayoutGrid, tKey: 'landing.prob.2.t', bKey: 'landing.prob.2.b', fixKey: 'landing.prob.2.fix' },
    { icon: HeartCrack, tKey: 'landing.prob.3.t', bKey: 'landing.prob.3.b', fixKey: 'landing.prob.3.fix' }
  ];
  const features = [
    { icon: Gauge, tKey: 'landing.feat.risk.t', bKey: 'landing.feat.risk.b' },
    { icon: Radar, tKey: 'landing.feat.radar.t', bKey: 'landing.feat.radar.b' },
    { icon: TrendingUp, tKey: 'landing.feat.alt.t', bKey: 'landing.feat.alt.b' },
    { icon: Layers, tKey: 'landing.feat.eco.t', bKey: 'landing.feat.eco.b' },
    { icon: Waves, tKey: 'landing.feat.social.t', bKey: 'landing.feat.social.b' },
    { icon: Star, tKey: 'landing.feat.watch.t', bKey: 'landing.feat.watch.b' }
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
  const faqs = [
    { qKey: 'landing.faq.1.q', aKey: 'landing.faq.1.a' },
    { qKey: 'landing.faq.2.q', aKey: 'landing.faq.2.a' },
    { qKey: 'landing.faq.3.q', aKey: 'landing.faq.3.a' },
    { qKey: 'landing.faq.4.q', aKey: 'landing.faq.4.a' },
    { qKey: 'landing.faq.5.q', aKey: 'landing.faq.5.a' },
    { qKey: 'landing.faq.6.q', aKey: 'landing.faq.6.a' }
  ];
</script>

<!-- ── 1 · HERO ───────────────────────────────────────────────────────────── -->
<section class="relative overflow-hidden py-10 sm:py-12 lg:py-16">
  <div class="hero-grid"></div>
  <div class="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.05fr_minmax(0,0.95fr)] lg:gap-12">
    <div class="min-w-0">
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

    <!-- Product preview mock -->
    <div class="relative min-w-0">
      <div class="hero-glow"></div>
      <div class="hero-card relative">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{$t('landing.preview.title')}</span>
          <span class="pill inline-flex items-center gap-1.5 bg-mint/15 text-[10px] text-mint">
            <span class="relative flex h-1.5 w-1.5">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75"></span>
              <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint"></span>
            </span>
            {$t('landing.preview.synced')}
          </span>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <!-- BTC risk -->
          <div class="rounded-xl border border-edge bg-panel-2/40 p-3">
            <div class="flex items-center justify-between text-xs"><span class="text-muted">{$t('landing.preview.btcrisk')}</span><span class="font-semibold text-mint">{$t('landing.preview.gooddca')}</span></div>
            <div class="mt-2 h-2 w-full overflow-hidden rounded-full" style="background: linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)">
              <div class="h-full w-[32%] border-r-2 border-strong bg-transparent"></div>
            </div>
            <div class="mt-1 text-2xl font-semibold text-strong">0.32</div>
          </div>
          <!-- Social risk -->
          <div class="rounded-xl border border-edge bg-panel-2/40 p-3">
            <div class="flex items-center justify-between text-xs"><span class="text-muted">{$t('landing.preview.socialrisk')}</span><span class="font-semibold text-soft">{$t('landing.preview.normalatt')}</span></div>
            <div class="mt-2 flex items-end gap-0.5">
              {#each [40, 55, 48, 62, 70, 58, 41] as h}<div class="w-full rounded-sm bg-accent/50" style="height: {h * 0.4}px"></div>{/each}
            </div>
            <div class="mt-1 text-2xl font-semibold text-strong">0.41</div>
          </div>
        </div>

        <!-- Signal rows -->
        <div class="mt-3 space-y-2 rounded-xl border border-edge bg-panel-2/40 p-3 text-sm">
          <div class="flex items-center justify-between"><span class="text-muted">{$t('landing.preview.altmarket')}</span><span class="pill bg-warn/15 text-warn text-[10px]">{$t('landing.preview.selective')}</span></div>
          <div class="flex items-center justify-between"><span class="text-muted">{$t('landing.preview.ecorotation')}</span><span class="pill bg-accent/15 text-accent text-[10px]">NEAR · {$t('landing.preview.improving')}</span></div>
          <div class="flex items-center justify-between"><span class="text-muted">{$t('landing.preview.altbtcsignal')}</span><span class="pill bg-mint/15 text-mint text-[10px]">INJ · {$t('landing.preview.confirmed')}</span></div>
        </div>

        <!-- Premium takeaway -->
        <div class="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
          <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent"><Zap class="h-3.5 w-3.5" /> {$t('landing.preview.takeawayLabel')}</div>
          <p class="mt-1 text-xs leading-relaxed text-soft">{$t('landing.preview.takeaway')}</p>
        </div>
      </div>
    </div>

    <!-- Live coin logos marquee (hover for label) -->
    <div class="col-span-full mt-2 lg:mt-6">
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
<section class="py-6">
  <div class="mx-auto mb-8 max-w-2xl text-center">
    <span class="pill bg-mint/10 text-mint">{$t('landing.feat.eyebrow')}</span>
    <h2 class="mt-3 text-2xl font-semibold text-strong sm:text-3xl">{$t('landing.feat.title')}</h2>
  </div>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each features as f, i}
      <div class="card rail-card" use:inview={{ delay: i * 70 }}>
        <span class="icon-badge bg-mint/12 text-mint"><f.icon class="h-5 w-5" /></span>
        <h3 class="mt-3 font-semibold text-strong">{$t(f.tKey)}</h3>
        <p class="mt-1.5 text-sm leading-relaxed text-muted">{$t(f.bKey)}</p>
      </div>
    {/each}
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
            {#each topFeatures(p) as fk}
              <li class="flex items-center gap-2 text-soft"><Check class="h-4 w-4 shrink-0 text-mint" />{FEATURE_LABELS[fk]}</li>
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
<section class="py-6">
  <div class="mx-auto mb-8 max-w-2xl text-center">
    <span class="pill bg-mint/10 text-mint">{$t('landing.faq.eyebrow')}</span>
    <h2 class="mt-3 text-2xl font-semibold text-strong sm:text-3xl">{$t('landing.faq.title')}</h2>
  </div>
  <div class="mx-auto max-w-3xl space-y-2.5">
    {#each faqs as f, i}
      <details class="card group transition-colors hover:border-mint/30" use:inview={{ delay: i * 60 }}>
        <summary class="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-strong">
          {$t(f.qKey)}
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-edge text-muted transition group-open:rotate-45 group-open:border-mint/40 group-open:bg-mint/10 group-open:text-mint"
          >
            <Plus class="h-3.5 w-3.5" />
          </span>
        </summary>
        <p class="mt-3 border-t border-edge/50 pt-3 text-sm leading-relaxed text-muted">{$t(f.aKey)}</p>
      </details>
    {/each}
  </div>
</section>

<!-- ── 9 · FINAL CTA ──────────────────────────────────────────────────────── -->
<section class="py-10 sm:py-14">
  <div class="hero-card text-center" use:inview>
    <span class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-mint/15 text-mint"><Zap class="h-6 w-6" /></span>
    <h2 class="text-2xl font-semibold text-strong sm:text-3xl">{$t('landing.final.title')}</h2>
    <p class="mx-auto mt-2 max-w-xl text-muted">{$t('landing.final.sub')}</p>
    <div class="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
      <a href="/register" class="btn-primary w-full justify-center px-6 py-3 text-base sm:w-auto">{$t('landing.cta.startFree')} <ArrowRight class="h-4 w-4" /></a>
      <a href="/pricing" class="btn-ghost w-full justify-center px-6 py-3 text-base sm:w-auto">{$t('landing.cta.viewPricing')}</a>
    </div>
    <p class="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck class="h-3.5 w-3.5 text-mint" /> {$t('landing.final.trust')}</p>
  </div>
</section>

<style>
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
