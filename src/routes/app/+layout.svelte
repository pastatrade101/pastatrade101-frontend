<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Activity, BarChart3, Bitcoin, Crosshair, DoorOpen, FileText, Flame, FlaskConical, Gauge, Globe, LayoutDashboard, Layers, Radar, Rocket, Scale, Spline, Star, Users, X } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import { authReady, user } from '$lib/stores/auth';
  import { sidebarOpen } from '$lib/stores/ui';
  import { t } from '$lib/i18n';
  import Seo from '$lib/components/Seo.svelte';

  let { children } = $props();

  // Client-side route guard: once auth has resolved, bounce guests to /login,
  // remembering where they were headed so login can return them there.
  $effect(() => {
    if ($authReady && !$user) {
      const target = $page.url.pathname + $page.url.search;
      goto(`/login?redirect=${encodeURIComponent(target)}`);
    }
  });

  // Close the mobile drawer whenever the route changes.
  let lastPath = $state('');
  $effect(() => {
    const path = $page.url.pathname;
    if (path !== lastPath) {
      lastPath = path;
      sidebarOpen.set(false);
    }
  });

  const nav = [
    { href: '/app', key: 'app.nav.overview', icon: LayoutDashboard },
    { href: '/app/risk', key: 'app.nav.risk', icon: Gauge },
    { href: '/app/social-metrics', key: 'app.nav.social', icon: Users },
    { href: '/app/derivatives', key: 'app.nav.derivatives', icon: Flame },
    { href: '/app/macro-regime', key: 'app.nav.macro', icon: Globe },
    { href: '/app/charts', key: 'app.nav.charts', icon: BarChart3 },
    { href: '/app/btc', key: 'app.nav.btc', icon: Bitcoin },
    { href: '/app/btc-cycle-lab', key: 'app.nav.cyclelab', icon: FlaskConical },
    { href: '/app/altcoin-btc-lab', key: 'app.nav.altbtc', icon: Scale },
    { href: '/app/alt-btc-bottom-radar', key: 'app.nav.altbtcbottom', icon: Activity },
    { href: '/app/charts/logarithmic-regression', key: 'app.nav.logreg', icon: Spline },
    { href: '/app/ecosystems', key: 'app.nav.ecosystems', icon: Layers },
    { href: '/app/early-opportunity-radar', key: 'app.nav.radar', icon: Radar },
    { href: '/app/early-project-radar', key: 'app.nav.projectradar', icon: Rocket },
    { href: '/app/token-radar', key: 'app.nav.tokenradar', icon: Crosshair },
    { href: '/app/watchlist', key: 'app.nav.watchlist', icon: Star },
    { href: '/app/exit-strategy', key: 'app.nav.exit', icon: DoorOpen },
    { href: '/app/reports', key: 'app.nav.reports', icon: FileText }
  ];

  // Active when it's the exact route or a true sub-route. Plain startsWith() is
  // wrong here because `/app/btc` is a string prefix of `/app/btc-cycle-lab`.
  const isActive = (href: string) => {
    const path = $page.url.pathname;
    if (href === '/app') return path === '/app';
    return path === href || path.startsWith(`${href}/`);
  };
</script>

<Seo title="Dashboard" description="Your Pastatrade market-intelligence dashboard." noindex />

{#snippet navList()}
  <nav class="flex flex-col gap-1">
    {#each nav as item}
      <a
        href={item.href}
        onclick={() => sidebarOpen.set(false)}
        class="nav-link flex items-center gap-2 whitespace-nowrap"
        class:nav-link-active={isActive(item.href)}
      >
        <item.icon class="h-4 w-4" />
        {$t(item.key)}
      </a>
    {/each}
  </nav>
{/snippet}

{#if $authReady && $user}
  <div class="grid gap-6 lg:grid-cols-[200px_1fr]">
    <!-- Desktop sidebar -->
    <aside class="hidden lg:sticky lg:top-20 lg:block lg:h-fit">
      {@render navList()}
    </aside>

    <div class="min-w-0">
      {@render children()}
    </div>
  </div>

  <!-- Mobile drawer (toggled from the header hamburger) -->
  {#if $sidebarOpen}
    <button
      class="fixed inset-0 z-40 bg-black/60 lg:hidden"
      aria-label="Close menu"
      onclick={() => sidebarOpen.set(false)}
      transition:fade={{ duration: 150 }}
    ></button>
    <aside
      class="fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto border-r border-edge bg-panel p-4 lg:hidden"
      transition:fly={{ x: -280, duration: 220 }}
    >
      <div class="mb-4 flex items-center justify-between">
        <span class="flex items-center gap-1.5 font-semibold text-strong"><BrandMark class="h-5 w-5 text-mint" />Pasta<span class="text-mint">trade101</span></span>
        <button aria-label="Close menu" onclick={() => sidebarOpen.set(false)}><X class="h-5 w-5 text-muted" /></button>
      </div>
      {@render navList()}
    </aside>
  {/if}
{:else}
  <div class="py-20 text-center text-muted">Loading…</div>
{/if}
