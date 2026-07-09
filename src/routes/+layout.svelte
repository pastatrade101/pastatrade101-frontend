<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { ArrowRight, Check, ChevronDown, CreditCard, DoorOpen, FileText, Flame, Languages, LayoutDashboard, LogIn, LogOut, Mail, Menu, Moon, PanelLeftClose, PanelLeftOpen, Phone, Radar, Shield, Spline, Sun, Tag, X } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import { authReady, initAuth, logout, user } from '$lib/stores/auth';
  import { clearMembership, loadMembership, membership } from '$lib/stores/membership';
  import { sidebarCollapsed, sidebarOpen } from '$lib/stores/ui';
  import { initTheme, theme, toggleTheme } from '$lib/stores/theme';
  import { initLocale, locale, setLocale, t } from '$lib/i18n';

  let { children } = $props();

  let menuOpen = $state(false); // account dropdown

  onMount(() => {
    initAuth();
    initTheme();
    initLocale();
  });

  // Two locales → a simple toggle that shows the other language.
  const toggleLocale = () => setLocale($locale === 'en' ? 'sw' : 'en');

  // Keep plan access in sync with the signed-in user.
  $effect(() => {
    if ($user) loadMembership();
    else clearMembership();
  });

  const handleLogout = () => {
    menuOpen = false;
    logout();
    clearMembership();
    goto('/');
  };

  const onApp = $derived($page.url.pathname.startsWith('/app'));
  const initial = $derived(($user?.name || $user?.email || '?').trim().charAt(0).toUpperCase());
</script>

<!-- App desktop: exact-viewport shell (no body scroll) so the panes own all scrolling. -->
<div class="flex min-h-screen flex-col {onApp && $user ? 'lg:h-screen lg:overflow-hidden' : ''}">
  <header class="sticky top-0 z-20 border-b border-edge/70" style="background: rgb(var(--glass-rgb) / 0.62); backdrop-filter: blur(20px) saturate(170%); -webkit-backdrop-filter: blur(20px) saturate(170%);">
    <!-- App pages: full-width bar so the brand aligns with the left-edge sidebar.
         Marketing pages keep the centered container. -->
    <div class={onApp && $user ? 'flex w-full items-center justify-between px-4 py-3 lg:px-5' : 'mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-3 lg:px-8'}>
      <div class="flex items-center gap-2">
        {#if $authReady && $user && onApp}
          <!-- Mobile: drawer toggle -->
          <button
            class="rounded-lg border border-edge p-2 text-body transition hover:bg-panel-2 lg:hidden"
            aria-label="Toggle menu"
            onclick={() => sidebarOpen.update((v) => !v)}
          >
            <Menu class="h-5 w-5" />
          </button>
          <!-- Desktop: collapse sidebar to an icons-only rail -->
          <button
            class="hidden rounded-lg border border-edge p-2 text-muted transition hover:bg-panel-2 hover:text-strong lg:flex"
            aria-label={$sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onclick={() => sidebarCollapsed.update((v) => !v)}
          >
            {#if $sidebarCollapsed}<PanelLeftOpen class="h-4 w-4" />{:else}<PanelLeftClose class="h-4 w-4" />{/if}
          </button>
        {/if}
        <a href="/" class="flex items-center gap-2 font-semibold text-strong">
          <BrandMark class="h-5 w-5 text-mint" />
          Pasta<span class="text-mint">trade101</span>
        </a>
      </div>

      <nav class="flex items-center gap-1">
        <button
          class="flex items-center gap-1 rounded-lg border border-edge px-2 py-2 text-xs font-medium text-muted transition hover:bg-panel-2 hover:text-strong"
          aria-label={$t('lang.label')}
          title={$locale === 'en' ? 'Badili kwenda Kiswahili' : 'Switch to English'}
          onclick={toggleLocale}
        >
          <Languages class="h-4 w-4" />{$locale === 'en' ? 'EN' : 'SW'}
        </button>
        <button
          class="rounded-lg border border-edge p-2 text-muted transition hover:bg-panel-2 hover:text-strong"
          aria-label="Toggle light / dark theme"
          onclick={toggleTheme}
        >
          {#if $theme === 'dark'}<Sun class="h-4 w-4" />{:else}<Moon class="h-4 w-4" />{/if}
        </button>

        {#if $authReady && $user}
          <!-- Account avatar + dropdown -->
          <div class="relative">
            <button
              class="flex items-center gap-1.5 rounded-full border border-edge py-1 pl-1 pr-2 transition hover:bg-panel-2"
              aria-label="Account menu"
              onclick={() => (menuOpen = !menuOpen)}
            >
              <span class="flex h-7 w-7 items-center justify-center rounded-full bg-mint/15 text-sm font-semibold text-mint">{initial}</span>
              <ChevronDown class="h-4 w-4 text-muted transition {menuOpen ? 'rotate-180' : ''}" />
            </button>

            {#if menuOpen}
              <button class="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
              <div
                class="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl"
                transition:fly={{ y: -8, duration: 160 }}
              >
                <div class="border-b border-edge px-4 py-3">
                  <p class="truncate text-sm font-medium text-strong">{$user.name || 'Account'}</p>
                  <p class="truncate text-xs text-muted">{$user.email}</p>
                  <span class="mt-1 inline-flex items-center gap-1.5">
                    <span class="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">{$user.role}</span>
                    {#if $membership}<span class="rounded bg-mint/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mint">{$membership.plan_name}</span>{/if}
                  </span>
                </div>
                <div class="p-1">
                  <a href="/app" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                    <LayoutDashboard class="h-4 w-4" /> {$t('nav.dashboard')}
                  </a>
                  <a href="/app/account" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                    <CreditCard class="h-4 w-4" /> {$t('nav.account')}
                  </a>
                  <a href="/pricing" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                    <Tag class="h-4 w-4" /> {$t('nav.pricing')}
                  </a>
                  {#if $user.role === 'admin'}
                    <a href="/admin" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                      <Shield class="h-4 w-4" /> {$t('nav.admin')}
                    </a>
                    <a href="/admin/plans" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                      <Tag class="h-4 w-4" /> {$t('nav.plansUsers')}
                    </a>
                    <a href="/admin/reports" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                      <FileText class="h-4 w-4" /> Reports
                    </a>
                    <a href="/admin/exit-strategy-settings" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                      <DoorOpen class="h-4 w-4" /> Exit strategy
                    </a>
                    <a href="/admin/charts/log-regression-settings" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                      <Spline class="h-4 w-4" /> Log regression
                    </a>
                    <a href="/admin/derivatives" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                      <Flame class="h-4 w-4" /> Derivatives
                    </a>
                    <a href="/admin/early-opportunity-settings" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                      <Radar class="h-4 w-4" /> Opportunity Radar
                    </a>
                  {/if}
                  <button onclick={handleLogout} class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition hover:bg-panel-2">
                    <LogOut class="h-4 w-4" /> {$t('nav.signout')}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {:else if $authReady}
          <!-- Inline links from sm: up -->
          <div class="hidden items-center gap-1 sm:flex">
            <a href="/pricing" class="nav-link">{$t('nav.pricing')}</a>
            <a href="/login" class="nav-link">{$t('nav.signin')}</a>
            <a href="/register" class="btn-primary">{$t('nav.getstarted')}</a>
          </div>
          <!-- Hamburger on mobile so the header never overflows -->
          <div class="relative sm:hidden">
            <button
              class="rounded-lg border border-edge p-2 text-body transition hover:bg-panel-2"
              aria-label="Open menu"
              onclick={() => (menuOpen = !menuOpen)}
            >
              {#if menuOpen}<X class="h-5 w-5" />{:else}<Menu class="h-5 w-5" />{/if}
            </button>
            {#if menuOpen}
              <button class="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
              <div
                class="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl"
                transition:fly={{ y: -8, duration: 160 }}
              >
                <div class="p-1.5">
                  <a href="/pricing" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                    <Tag class="h-4 w-4" /> {$t('nav.pricing')}
                  </a>
                  <a href="/login" onclick={() => (menuOpen = false)} class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-body transition hover:bg-panel-2">
                    <LogIn class="h-4 w-4" /> {$t('nav.signin')}
                  </a>
                  <a href="/register" onclick={() => (menuOpen = false)} class="btn-primary mt-1 w-full justify-center">{$t('nav.getstarted')}</a>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </nav>
    </div>
  </header>

  <!-- App routes get a full-width shell (the sidebar hugs the left edge and the
       content pads itself); marketing pages keep the centered container. -->
  <main class={onApp && $user ? 'flex w-full flex-1 flex-col lg:min-h-0' : 'mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-8'}>
    {@render children()}
  </main>

  {#if !(onApp && $user)}
  <footer class="relative overflow-hidden border-t border-edge text-sm text-muted">
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-48"
      style="background: radial-gradient(70% 100% at 15% 0%, rgb(var(--c-mint) / 0.12), transparent 58%), radial-gradient(60% 90% at 90% 20%, rgb(var(--c-accent) / 0.11), transparent 58%);"
    ></div>

    <div class="relative w-full px-4 py-10 sm:px-6 lg:px-8 2xl:px-12">
      <div class="rounded-2xl border border-edge bg-panel/75 p-5 sm:p-6 lg:flex lg:items-center lg:justify-between lg:gap-8">
        <div class="max-w-2xl">
          <span class="pill bg-mint/10 text-mint"><Shield class="h-3.5 w-3.5" /> {$t('footer.cta.eyebrow')}</span>
          <h2 class="mt-3 text-2xl font-semibold leading-tight text-strong sm:text-3xl">{$t('footer.cta.title')}</h2>
          <p class="mt-2 text-sm leading-relaxed text-muted">{$t('footer.cta.sub')}</p>
        </div>
        <div class="mt-5 flex flex-col gap-3 sm:flex-row lg:mt-0">
          <a href="/register" class="btn-primary w-full px-5 py-3 sm:w-auto">{$t('nav.getstarted')} <ArrowRight class="h-4 w-4" /></a>
          <a href="/pricing" class="btn-ghost w-full px-5 py-3 sm:w-auto">{$t('nav.pricing')}</a>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[minmax(320px,1.35fr)_minmax(150px,0.55fr)_minmax(160px,0.6fr)_minmax(340px,1fr)] 2xl:grid-cols-[minmax(420px,1.5fr)_minmax(180px,0.6fr)_minmax(190px,0.65fr)_minmax(380px,1fr)]">
        <div class="rounded-2xl border border-edge bg-panel/55 p-5">
          <a href="/" class="inline-flex items-center gap-2 text-base font-semibold text-strong">
            <BrandMark class="h-5 w-5 text-mint" />
            Pasta<span class="text-mint">trade101</span>
          </a>
          <p class="mt-3 max-w-md leading-relaxed">{$t('footer.brand.copy')}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            {#each ['footer.trust.free', 'footer.trust.readonly', 'footer.trust.nfa'] as item}
              <span class="inline-flex items-center gap-1.5 rounded-full border border-edge bg-panel-2/60 px-2.5 py-1 text-xs font-medium text-muted">
                <Check class="h-3.5 w-3.5 text-mint" /> {$t(item)}
              </span>
            {/each}
          </div>
          <div class="mt-5 flex items-center gap-3">
            <a href="https://www.youtube.com/@pastatrade101" target="_blank" rel="noopener noreferrer" class="flex h-9 w-9 items-center justify-center rounded-full border border-edge text-muted transition hover:border-mint/40 hover:bg-mint/10 hover:text-mint" aria-label="Pastatrade on YouTube">
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.5 15.5v-7l6.3 3.5-6.3 3.5z"/></svg>
            </a>
            <a href="https://www.instagram.com/_pastory_" target="_blank" rel="noopener noreferrer" class="flex h-9 w-9 items-center justify-center rounded-full border border-edge text-muted transition hover:border-mint/40 hover:bg-mint/10 hover:text-mint" aria-label="Pastory on Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
            </a>
            <a href="https://x.com/pastatrade101" target="_blank" rel="noopener noreferrer" class="flex h-9 w-9 items-center justify-center rounded-full border border-edge text-muted transition hover:border-mint/40 hover:bg-mint/10 hover:text-mint" aria-label="Pastatrade on X">
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25h6.83l4.713 6.231 5.447-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z"/></svg>
            </a>
          </div>
        </div>

        <div class="p-1">
          <p class="stat-label mb-3">{$t('footer.explore')}</p>
          <ul class="space-y-2.5">
            <li><a href="/insights" class="transition hover:text-strong">{$t('footer.link.insights')}</a></li>
            <li><a href="/pricing" class="transition hover:text-strong">{$t('nav.pricing')}</a></li>
            <li><a href="/journey" class="transition hover:text-strong">{$t('footer.link.journey')}</a></li>
            <li><a href="/methodology" class="transition hover:text-strong">{$t('footer.link.methodology')}</a></li>
            <li><a href="https://www.youtube.com/@pastatrade101" target="_blank" rel="noopener noreferrer" class="transition hover:text-strong">{$t('footer.link.youtube')}</a></li>
          </ul>
        </div>

        <div class="p-1">
          <p class="stat-label mb-3">{$t('footer.account')}</p>
          <ul class="space-y-2.5">
            <li><a href="/register" class="transition hover:text-strong">{$t('nav.getstarted')}</a></li>
            <li><a href="/login" class="transition hover:text-strong">{$t('nav.signin')}</a></li>
            <li><a href="/pricing" class="transition hover:text-strong">{$t('footer.link.compare')}</a></li>
            <li><a href="/app" class="transition hover:text-strong">{$t('nav.dashboard')}</a></li>
          </ul>
        </div>

        <div class="rounded-2xl border border-edge bg-panel/65 p-5">
          <p class="stat-label">{$t('footer.talk')}</p>
          <a href="https://wa.link/iuw1ak" target="_blank" rel="noopener noreferrer" class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 py-3 font-semibold text-ink transition hover:bg-mint/90" aria-label="Chat with Pastatrade on WhatsApp">
            <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
            {$t('footer.whatsapp')}
          </a>
          <div class="mt-4 space-y-2">
            <a href="tel:+255752093014" class="flex items-center gap-2 transition hover:text-strong"><Phone class="h-4 w-4 text-mint" /> 0752 093 014</a>
            <a href="mailto:pastatrade101@gmail.com" class="flex items-center gap-2 break-all transition hover:text-strong"><Mail class="h-4 w-4 text-mint" /> pastatrade101@gmail.com</a>
          </div>
          <div class="mt-4 flex items-center gap-3 rounded-xl border border-edge bg-panel-2/50 p-3">
            <div class="shrink-0 rounded-xl border border-edge bg-white p-2">
              <img src="/qr.png" alt="Scan to chat with Pastatrade on WhatsApp" width="88" height="88" class="h-20 w-20 rounded-lg" />
            </div>
            <p class="text-xs leading-relaxed">{$t('footer.qr')}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="relative border-t border-edge px-4 py-4 sm:px-6 lg:px-8 2xl:px-12">
      <div class="flex w-full flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>{$t('footer.tagline')}</span>
        <span>© 2026 Pasta<span class="text-mint">trade101</span></span>
      </div>
    </div>
  </footer>
  {/if}
</div>
