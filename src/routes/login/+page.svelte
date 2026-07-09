<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { Mail, Lock, Eye, EyeOff, ArrowRight } from '@lucide/svelte';
  import { login, user, authReady } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import AuthShell from '$lib/components/AuthShell.svelte';
  import GoogleButton from '$lib/components/GoogleButton.svelte';
  import Seo from '$lib/components/Seo.svelte';

  let email = $state('');
  let password = $state('');
  let showPw = $state(false);
  let remember = $state(true);
  let error = $state('');
  let loading = $state(false);

  // Where the user was trying to go before being bounced to /login.
  const redirectTarget = $derived($page.url.searchParams.get('redirect'));

  // Already signed in (e.g. arriving here from a landing CTA) → skip the form.
  $effect(() => {
    if ($authReady && $user) {
      const dest = redirectTarget && redirectTarget.startsWith('/') ? redirectTarget : $user.role === 'admin' ? '/admin' : '/app';
      goto(dest);
    }
  });

  const submit = async (e: Event) => {
    e.preventDefault();
    error = '';
    loading = true;
    try {
      await login(email, password);
      // Plan-aware redirect: back to the attempted page (its own gating decides
      // access), otherwise role-based home.
      const dest = redirectTarget && redirectTarget.startsWith('/') ? redirectTarget : get(user)?.role === 'admin' ? '/admin' : '/app';
      goto(dest);
    } catch (err) {
      error = err instanceof Error ? err.message : $t('auth.login.failed');
    } finally {
      loading = false;
    }
  };
</script>

<Seo title="Sign in" description="Sign in to your Pastatrade account." noindex />

<div class="flex min-h-[78vh] items-center">
  <AuthShell mobileBrand={false}>
    <h2 class="text-2xl font-semibold text-strong">{$t('auth.login.title')}</h2>
    <p class="mt-1 text-sm text-muted">{$t('auth.login.sub')}</p>

    {#if redirectTarget}
      <p class="mt-4 rounded-lg border border-edge bg-panel-2/60 px-3 py-2 text-xs text-muted">{$t('auth.login.continue', { target: redirectTarget })}</p>
    {/if}

    <form class="mt-6 space-y-4" onsubmit={submit}>
      {#if error}
        <p class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      {/if}

      <div>
        <label class="stat-label" for="email">{$t('auth.email')}</label>
        <div class="relative mt-1">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Mail class="h-4 w-4" /></span>
          <input id="email" class="input pl-10" type="email" placeholder="you@email.com" bind:value={email} required autocomplete="email" />
        </div>
      </div>

      <div>
        <label class="stat-label" for="password">{$t('auth.password')}</label>
        <div class="relative mt-1">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Lock class="h-4 w-4" /></span>
          <input
            id="password"
            class="input px-10"
            type={showPw ? 'text' : 'password'}
            placeholder="••••••••"
            bind:value={password}
            required
            autocomplete="current-password"
          />
          <button
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-soft"
            onclick={() => (showPw = !showPw)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {#if showPw}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between text-sm">
        <label class="flex items-center gap-2 text-muted"><input type="checkbox" class="accent-mint" bind:checked={remember} /> {$t('auth.login.remember')}</label>
        <a href="/forgot-password" class="text-muted hover:text-mint">{$t('auth.login.forgot')}</a>
      </div>

      <button class="btn-primary w-full" type="submit" disabled={loading}>
        {#if loading}{$t('auth.login.signingin')}{:else}{$t('auth.login.signin')} <ArrowRight class="h-4 w-4" />{/if}
      </button>
    </form>

    <div class="my-4 flex items-center gap-3 text-xs text-muted"><span class="h-px flex-1 bg-edge"></span>{$t('auth.or')}<span class="h-px flex-1 bg-edge"></span></div>
    <GoogleButton redirect={redirectTarget && redirectTarget.startsWith('/') ? redirectTarget : '/app'} />

    <div class="my-5 flex items-center gap-3 text-xs text-muted"><span class="h-px flex-1 bg-edge"></span>{$t('auth.login.newhere')}<span class="h-px flex-1 bg-edge"></span></div>

    <div class="flex items-center gap-2">
      <a href={redirectTarget && redirectTarget.startsWith('/') ? `/register?redirect=${encodeURIComponent(redirectTarget)}` : '/register'} class="btn-ghost flex-1">{$t('auth.login.create')}</a>
      <a href="/pricing" class="btn-ghost flex-1">{$t('auth.login.viewpricing')}</a>
    </div>

    <p class="mt-4 text-center text-xs text-muted">{$t('auth.login.note')}</p>
  </AuthShell>
</div>
