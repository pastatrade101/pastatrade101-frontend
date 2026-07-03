<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { ChevronDown, CreditCard, DoorOpen, FileText, Flame, Languages, LayoutDashboard, LogIn, LogOut, Mail, Menu, Moon, Phone, Radar, Shield, Spline, Sun, Tag, X } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import { authReady, initAuth, logout, user } from '$lib/stores/auth';
  import { clearMembership, loadMembership, membership } from '$lib/stores/membership';
  import { sidebarOpen } from '$lib/stores/ui';
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

<div class="flex min-h-screen flex-col">
  <header class="sticky top-0 z-20 border-b border-edge bg-ink/80 backdrop-blur">
    <div class="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-3 lg:px-8">
      <div class="flex items-center gap-2">
        {#if $authReady && $user && onApp}
          <button
            class="rounded-lg border border-edge p-2 text-body transition hover:bg-panel-2 lg:hidden"
            aria-label="Toggle menu"
            onclick={() => sidebarOpen.update((v) => !v)}
          >
            <Menu class="h-5 w-5" />
          </button>
        {/if}
        <!-- On desktop app pages the sidebar owns the brand — avoid stacking it twice. -->
        <a href="/" class="flex items-center gap-2 font-semibold text-strong {onApp && $user ? 'lg:hidden' : ''}">
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
  <main class={onApp && $user ? 'w-full flex-1' : 'mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-8'}>
    {@render children()}
  </main>

  <footer class="border-t border-edge px-4 py-6 text-center text-xs text-muted">
    <nav class="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      <a href="/insights" class="transition hover:text-soft">Insights</a>
      <a href="/pricing" class="transition hover:text-soft">{$t('nav.pricing')}</a>
      <a href="/journey" class="transition hover:text-soft">My Journey</a>
      <a href="/methodology" class="transition hover:text-soft">Methodology</a>
      <a href="https://www.youtube.com/@pastatrade101" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 transition hover:text-soft" aria-label="Pastatrade on YouTube">
        <svg viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.5 15.5v-7l6.3 3.5-6.3 3.5z"/></svg>
        YouTube
      </a>
      <a href="https://www.instagram.com/_pastory_" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 transition hover:text-soft" aria-label="Pastory on Instagram">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
        Instagram
      </a>
      <a href="https://x.com/pastatrade101" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 transition hover:text-soft" aria-label="Pastatrade on X">
        <svg viewBox="0 0 24 24" fill="currentColor" class="h-3 w-3" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25h6.83l4.713 6.231 5.447-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z"/></svg>
        X
      </a>
    </nav>
    <div class="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      <a href="tel:+255752093014" class="inline-flex items-center gap-1 transition hover:text-soft" aria-label="Call Pastatrade">
        <Phone class="h-3.5 w-3.5" /> 0752 093 014
      </a>
      <a href="mailto:pastatrade101@gmail.com" class="inline-flex items-center gap-1 transition hover:text-soft" aria-label="Email Pastatrade">
        <Mail class="h-3.5 w-3.5" /> pastatrade101@gmail.com
      </a>
    </div>
    {$t('footer.tagline')}
  </footer>
</div>
