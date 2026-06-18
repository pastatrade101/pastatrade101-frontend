<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Activity, ChevronDown, CreditCard, FileText, Languages, LayoutDashboard, LogOut, Menu, Moon, Shield, Sun, Tag } from '@lucide/svelte';
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
    <div class="mx-auto flex w-full max-w-[1760px] items-center justify-between px-4 py-3 lg:px-8">
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
        <a href="/" class="flex items-center gap-2 font-semibold text-strong">
          <Activity class="h-5 w-5 text-mint" />
          Pasta<span class="text-mint">trade</span>
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
                  {/if}
                  <button onclick={handleLogout} class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition hover:bg-panel-2">
                    <LogOut class="h-4 w-4" /> {$t('nav.signout')}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {:else if $authReady}
          <a href="/pricing" class="nav-link">{$t('nav.pricing')}</a>
          <a href="/login" class="nav-link">{$t('nav.signin')}</a>
          <a href="/register" class="btn-primary">{$t('nav.getstarted')}</a>
        {/if}
      </nav>
    </div>
  </header>

  <main class="mx-auto w-full max-w-[1760px] flex-1 px-4 py-6 lg:px-8">
    {@render children()}
  </main>

  <footer class="border-t border-edge px-4 py-6 text-center text-xs text-muted">
    {$t('footer.tagline')}
  </footer>
</div>
