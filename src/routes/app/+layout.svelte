<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Activity, BarChart3, Bitcoin, Crosshair, DoorOpen, FileText, Flame, FlaskConical, Gauge, Globe, LayoutDashboard, Layers, Radar, Rocket, Scale, Search, SlidersHorizontal, Spline, Star, Users, X } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import { api } from '$lib/api';
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

  // ── Grouped navigation (same routes/keys as before, now organised) ──
  interface NavItem { href: string; key: string; icon: typeof Gauge; badge?: { text: string; cls: string } }
  const groups: { key: string; items: NavItem[] }[] = [
    {
      key: 'app.nav.group.market',
      items: [
        { href: '/app', key: 'app.nav.overview', icon: LayoutDashboard },
        { href: '/app/risk', key: 'app.nav.risk', icon: Gauge },
        { href: '/app/social-metrics', key: 'app.nav.social', icon: Users },
        { href: '/app/derivatives', key: 'app.nav.derivatives', icon: Flame },
        { href: '/app/macro-regime', key: 'app.nav.macro', icon: Globe }
      ]
    },
    {
      key: 'app.nav.group.cycle',
      items: [
        { href: '/app/charts', key: 'app.nav.charts', icon: BarChart3 },
        { href: '/app/btc', key: 'app.nav.btc', icon: Bitcoin, badge: { text: 'Hot', cls: 'text-[10px] font-bold text-warn' } },
        { href: '/app/btc-cycle-lab', key: 'app.nav.cyclelab', icon: FlaskConical },
        { href: '/app/altcoin-btc-lab', key: 'app.nav.altbtc', icon: Scale },
        { href: '/app/alt-btc-bottom-radar', key: 'app.nav.altbtcbottom', icon: Activity },
        { href: '/app/charts/logarithmic-regression', key: 'app.nav.logreg', icon: Spline }
      ]
    },
    {
      key: 'app.nav.group.discovery',
      items: [
        { href: '/app/ecosystems', key: 'app.nav.ecosystems', icon: Layers },
        { href: '/app/early-opportunity-radar', key: 'app.nav.radar', icon: Radar },
        { href: '/app/early-project-radar', key: 'app.nav.projectradar', icon: Rocket },
        { href: '/app/token-radar', key: 'app.nav.tokenradar', icon: Crosshair, badge: { text: 'LIVE', cls: 'rounded-full bg-mint px-2 py-0.5 text-[9px] font-bold tracking-wider text-ink' } }
      ]
    },
    {
      key: 'app.nav.group.strategy',
      items: [
        { href: '/app/watchlist', key: 'app.nav.watchlist', icon: Star },
        { href: '/app/exit-strategy', key: 'app.nav.exit', icon: DoorOpen },
        { href: '/app/reports', key: 'app.nav.reports', icon: FileText }
      ]
    }
  ];

  // Active when it's the exact route or a true sub-route. Plain startsWith() is
  // wrong here because `/app/btc` is a string prefix of `/app/btc-cycle-lab`.
  const isActive = (href: string) => {
    const path = $page.url.pathname;
    if (href === '/app') return path === '/app';
    return path === href || path.startsWith(`${href}/`);
  };

  // ── Menu search (client-side filter, "/" focuses it) ──
  let navQuery = $state('');
  let searchEl = $state<HTMLInputElement | null>(null);
  const visibleGroups = $derived(
    navQuery.trim()
      ? groups
          .map((g) => ({ ...g, items: g.items.filter((i) => $t(i.key).toLowerCase().includes(navQuery.trim().toLowerCase())) }))
          .filter((g) => g.items.length)
      : groups
  );
  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const first = visibleGroups[0]?.items[0];
      if (first) {
        navQuery = '';
        void goto(first.href);
      }
    } else if (e.key === 'Escape') {
      navQuery = '';
      searchEl?.blur();
    }
  };
  const onGlobalKey = (e: KeyboardEvent) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
    e.preventDefault();
    searchEl?.focus();
  };

  // ── Live market widget — public /market/global (btc price, 24h, condition). ──
  interface GlobalSnap { btc_price: number | null; market_cap_change_24h: number | null; market_condition: string | null; captured_at: string }
  let snap = $state<GlobalSnap | null>(null);
  let nowTick = $state(Date.now());
  onMount(() => {
    api<GlobalSnap>('/market/global').then((d) => (snap = d)).catch(() => {});
    const t1 = setInterval(() => (nowTick = Date.now()), 30_000); // refresh "synced ago"
    const t2 = setInterval(() => api<GlobalSnap>('/market/global').then((d) => (snap = d)).catch(() => {}), 5 * 60_000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  });
  const syncedAgo = $derived.by(() => {
    if (!snap?.captured_at) return '';
    const s = Math.max(0, Math.round((nowTick - new Date(snap.captured_at).getTime()) / 1000));
    if (s < 60) return `${s} sec ago`;
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return `${Math.round(s / 3600)}h ago`;
  });
  const conditionTone = (c: string | null | undefined) => {
    const v = (c ?? '').toLowerCase();
    if (/risk-on|accumulation/.test(v)) return 'bg-mint/15 text-mint border-mint/30';
    if (/overheated|distribution|capitulation/.test(v)) return 'bg-danger/15 text-danger border-danger/30';
    return 'bg-warn/15 text-warn border-warn/30';
  };
  const fmtBtc = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
  const fmt24 = (n: number | null | undefined) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
</script>

<svelte:window onkeydown={onGlobalKey} />

<Seo title="Dashboard" description="Your Pastatrade market-intelligence dashboard." noindex />

{#snippet sidebarContent()}
  <!-- Brand -->
  <div class="mb-4 flex items-center gap-2.5">
    <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-mint/25 to-accent/20 ring-1 ring-mint/30">
      <BrandMark class="h-5 w-5 text-mint" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-[17px] font-bold leading-tight text-strong">Pasta<span class="text-mint">trade101</span></p>
      <p class="text-[9px] font-semibold uppercase tracking-[0.28em] text-muted">Crypto Intelligence</p>
    </div>
    <a href="/app/account" aria-label="Account settings" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-muted transition hover:border-mint/40 hover:text-soft">
      <SlidersHorizontal class="h-4 w-4" />
    </a>
  </div>

  <!-- Live market widget -->
  {#if snap}
    <div class="mb-3 rounded-xl border border-edge bg-panel-2/50 p-3">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="flex items-center gap-1.5 text-sm font-semibold text-strong"><span class="relative flex h-2 w-2"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60"></span><span class="relative inline-flex h-2 w-2 rounded-full bg-mint"></span></span>Market live</p>
          <p class="mt-0.5 truncate text-[11px] text-muted">Synced {syncedAgo}</p>
        </div>
        {#if snap.market_condition}
          <span class="shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wide {conditionTone(snap.market_condition)}">{snap.market_condition}</span>
        {/if}
      </div>
      <div class="mt-2.5 grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-edge/70 bg-panel px-2.5 py-2">
          <p class="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">BTC</p>
          <p class="mt-0.5 truncate text-sm font-bold text-strong">{fmtBtc(snap.btc_price)}</p>
        </div>
        <div class="rounded-lg border border-edge/70 bg-panel px-2.5 py-2" title="Total crypto market cap, 24h change">
          <p class="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">24H</p>
          <p class="mt-0.5 truncate text-sm font-bold {(snap.market_cap_change_24h ?? 0) >= 0 ? 'text-mint' : 'text-danger'}">{fmt24(snap.market_cap_change_24h)}</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Menu search -->
  <div class="relative mb-4">
    <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
    <input
      bind:this={searchEl}
      bind:value={navQuery}
      onkeydown={onSearchKey}
      placeholder={$t('app.nav.search')}
      class="w-full rounded-xl border border-edge bg-panel-2/50 py-2 pl-9 pr-9 text-sm text-soft placeholder:text-muted focus:border-mint/40 focus:outline-none"
    />
    <kbd class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-edge bg-panel px-1.5 py-0.5 text-[10px] text-muted">/</kbd>
  </div>

  <!-- Grouped nav -->
  <nav class="flex flex-col gap-4">
    {#each visibleGroups as g (g.key)}
      <div>
        <p class="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">{$t(g.key)}</p>
        <div class="flex flex-col gap-0.5">
          {#each g.items as item (item.href)}
            {@const active = isActive(item.href)}
            <a
              href={item.href}
              onclick={() => sidebarOpen.set(false)}
              class="group relative flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition {active ? 'bg-mint/10' : 'hover:bg-panel-2/60'}"
            >
              {#if active}<span class="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-mint"></span>{/if}
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition {active ? 'bg-mint/15 text-mint' : 'bg-panel-2 text-muted group-hover:text-soft'}">
                <item.icon class="h-4 w-4" />
              </span>
              <span class="min-w-0 flex-1 truncate text-sm {active ? 'font-semibold text-strong' : 'text-soft'}">{$t(item.key)}</span>
              {#if item.badge}<span class="shrink-0 {item.badge.cls}">{item.badge.text}</span>{/if}
            </a>
          {/each}
        </div>
      </div>
    {:else}
      <p class="px-1 text-xs text-muted">No tools match “{navQuery}”.</p>
    {/each}
  </nav>
{/snippet}

{#if $authReady && $user}
  <!-- Desktop: fixed-height shell under the header — sidebar and content are two
       INDEPENDENT scroll areas (each scrolls itself, the page never scrolls). -->
  <div class="lg:grid lg:h-[calc(100vh-61px)] lg:grid-cols-[272px_1fr] lg:overflow-hidden">
    <aside class="hidden lg:block lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-edge lg:bg-panel lg:p-4">
      {@render sidebarContent()}
    </aside>

    <div class="min-w-0 px-4 py-6 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:px-8">
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
      class="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-edge bg-panel p-4 lg:hidden"
      transition:fly={{ x: -300, duration: 220 }}
    >
      <button aria-label="Close menu" class="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel text-muted" onclick={() => sidebarOpen.set(false)}><X class="h-4 w-4" /></button>
      {@render sidebarContent()}
    </aside>
  {/if}
{:else}
  <div class="py-20 text-center text-muted">Loading…</div>
{/if}
