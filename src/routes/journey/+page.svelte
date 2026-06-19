<script lang="ts">
  import { ArrowLeft, ArrowRight, Compass, TrendingUp, ShieldCheck, Rocket, Activity, Quote, BookOpen, GraduationCap } from '@lucide/svelte';
  import Seo from '$lib/components/Seo.svelte';

  const milestones = [
    {
      year: '2012–14',
      icon: BookOpen,
      title: 'A-Level (Form 5–6) · Economics, Geography & Maths',
      body: 'My advanced-level combination — economics, geography and mathematics — was an early grounding in how incentives, systems and numbers interact. Those are the exact lenses I now apply to markets.'
    },
    {
      year: '2014–17',
      icon: GraduationCap,
      title: 'BSc in Information & Communication Technology',
      body: 'A bachelor of science in ICT gave me the engineering foundation to turn market theory into working data pipelines, models and software — the technical backbone behind Pastatrade.'
    },
    {
      year: '2019',
      icon: Compass,
      title: 'Entered the market — without a framework',
      body: 'I started in crypto in 2019: curious, ambitious, and completely unstructured. The first lesson came fast — the market does not reward intelligence, it rewards discipline. I had neither, yet, and it would cost me.'
    },
    {
      year: '2020–21',
      icon: TrendingUp,
      title: 'My first cycle: a 10x I gave back',
      body: 'I rode an altcoin to a 10x — then watched it round-trip, because I had no plan to take profit and exited late, after the crash. Chasing momentum, I rotated into random coins in 2021 and missed the real upside. The conviction was there; the structure was not.'
    },
    {
      year: '2022',
      icon: ShieldCheck,
      title: 'The bear market that explained everything',
      body: 'When the cycle turned, I finally studied what I had missed. The market moves in a sequence: BTC leads the bull, large caps follow, and broad altcoin rotation only arrives in euphoria — not at random. My 2021 mistakes were not bad luck; they were a misread of where we were in the cycle.'
    },
    {
      year: '2024–25',
      icon: Activity,
      title: 'Second cycle — sharper, but still late',
      body: 'Living a second full cycle, the patterns were obvious in hindsight — yet I still became fully aware only in the late stages. Two complete bull-and-bear cycles taught me the most expensive lesson of all: timing the rotation matters as much as picking the asset.'
    },
    {
      year: '2026',
      icon: Rocket,
      title: 'Built Pastatrade',
      body: 'So I built the tool I wish I had in 2021 — one that measures BTC risk, tracks when altcoin rotation is actually confirming, and separates real strength from coins that only look strong. Pastatrade turns the lessons I paid for into a process anyone can follow.'
    }
  ];

  const principles = [
    {
      icon: ShieldCheck,
      title: 'Risk is the only thing you control',
      body: 'Returns are uncertain; drawdowns are survivable only with discipline. Take profit by plan, not by feeling — capital preservation first, upside second.'
    },
    {
      icon: Compass,
      title: "Respect the cycle's sequence",
      body: 'BTC leads the bull, large caps follow, and broad altcoin rotation comes in euphoria — not at random. Knowing where you are in that sequence is half the edge.'
    },
    {
      icon: Activity,
      title: 'Evidence over emotion',
      body: 'Price is a story the crowd tells itself. On-chain valuation, market breadth and relative strength tell a more honest one. I follow the data, not the headlines.'
    }
  ];
</script>

<Seo
  title="My Journey"
  type="profile"
  description="The story and philosophy behind Pastatrade — two full crypto cycles of hard-won lessons since 2019, an analytical foundation in economics, maths and ICT, turned into a disciplined, probability-based market-intelligence platform."
/>

<a href="/" class="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-soft"><ArrowLeft class="h-4 w-4" /> Back to home</a>

<!-- Hero -->
<section class="grid items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
  <div class="relative mx-auto w-full max-w-sm">
    <div class="absolute inset-x-2 bottom-0 top-8 rounded-[2rem] border border-edge/60 bg-gradient-to-b from-mint/12 via-accent/[0.08] to-transparent"></div>
    <picture class="contents">
      <source srcset="/hero-img.avif" type="image/avif" />
      <img src="/hero-img.png" alt="Pastatrade founder" width="900" height="900" class="relative z-[1] mx-auto block w-full object-contain" style="filter: drop-shadow(0 22px 45px rgb(0 0 0 / 0.4));" />
    </picture>
  </div>

  <div class="min-w-0">
    <span class="pill bg-mint/10 text-mint">My Journey</span>
    <h1 class="mt-4 text-3xl font-bold leading-[1.12] tracking-tight text-strong sm:text-4xl lg:text-5xl">
      Two full cycles taught me<br /><span class="text-mint">what no chart could.</span>
    </h1>
    <p class="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
      I didn't come to crypto for lottery tickets — though I learned that lesson the hard way too. Since 2019 I've lived two
      complete cycles of bull and bear: I rode an altcoin to a 10x and gave it back, chased the wrong coins at the wrong time,
      and only slowly understood the structure the market actually follows — that BTC leads, and rotation comes in euphoria.
    </p>
    <p class="mt-3 max-w-xl text-base leading-relaxed text-soft">
      Pastatrade is everything those expensive lessons taught me, turned into a disciplined, repeatable process — so the next
      person doesn't have to learn it the way I did.
    </p>
  </div>
</section>

<!-- Thesis pull-quote -->
<section class="mt-12">
  <figure class="hero-card mx-auto max-w-3xl text-center">
    <Quote class="mx-auto h-7 w-7 text-mint/40" />
    <blockquote class="mt-3 text-xl font-medium italic leading-relaxed text-soft sm:text-2xl">
      I learned the market's structure the most expensive way possible — by living it. Pastatrade exists so you don't have to.
    </blockquote>
  </figure>
</section>

<!-- Timeline -->
<section class="mt-14">
  <div class="mx-auto mb-8 max-w-2xl text-center">
    <span class="pill bg-accent/10 text-accent">Milestones</span>
    <h2 class="mt-3 text-2xl font-semibold text-strong sm:text-3xl">The road so far</h2>
    <p class="mt-2 text-muted">From an analytical foundation — economics, mathematics and ICT — to two full market cycles and the discipline they forged.</p>
  </div>
  <div class="mx-auto max-w-3xl space-y-3">
    {#each milestones as m}
      <div class="card rail-card flex items-start gap-4" style="--rail: var(--c-mint)">
        <div class="flex flex-col items-center">
          <span class="icon-badge bg-mint/12 text-mint"><m.icon class="h-5 w-5" /></span>
          <span class="mt-1 whitespace-nowrap text-xs font-bold text-mint/70">{m.year}</span>
        </div>
        <div class="min-w-0">
          <h3 class="font-semibold text-strong">{m.title}</h3>
          <p class="mt-1 text-sm leading-relaxed text-muted">{m.body}</p>
        </div>
      </div>
    {/each}
  </div>
</section>

<!-- Principles -->
<section class="mt-14">
  <div class="mx-auto mb-8 max-w-2xl text-center">
    <span class="pill bg-mint/10 text-mint">What I believe</span>
    <h2 class="mt-3 text-2xl font-semibold text-strong sm:text-3xl">The principles behind Pastatrade</h2>
    <p class="mt-2 text-muted">The same rules that govern the platform govern how I trade.</p>
  </div>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
    {#each principles as p}
      <div class="card rail-card" style="--rail: var(--c-accent)">
        <span class="icon-badge bg-accent/12 text-accent"><p.icon class="h-5 w-5" /></span>
        <h3 class="mt-3 font-semibold text-strong">{p.title}</h3>
        <p class="mt-1.5 text-sm leading-relaxed text-muted">{p.body}</p>
      </div>
    {/each}
  </div>
</section>

<!-- CTA -->
<section class="mt-14">
  <div class="hero-card text-center">
    <h2 class="text-2xl font-semibold text-strong sm:text-3xl">Read the market with me</h2>
    <p class="mx-auto mt-2 max-w-xl text-muted">The exact framework I use is built into the platform — free to start, no exchange connection required.</p>
    <div class="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
      <a href="/register" class="btn-primary w-full justify-center px-6 py-3 text-base sm:w-auto">Start free <ArrowRight class="h-4 w-4" /></a>
      <a href="/pricing" class="btn-ghost w-full justify-center px-6 py-3 text-base sm:w-auto">View pricing</a>
    </div>
  </div>
</section>
