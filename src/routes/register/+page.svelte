<script lang="ts">
  import { goto } from '$app/navigation';
  import { User, Mail, Lock, Eye, EyeOff, ArrowRight } from '@lucide/svelte';
  import { register, user, authReady } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import AuthShell from '$lib/components/AuthShell.svelte';
  import GoogleButton from '$lib/components/GoogleButton.svelte';
  import Seo from '$lib/components/Seo.svelte';

  // Already signed in (e.g. a logged-in user clicked "Start free") → go to the app.
  $effect(() => {
    if ($authReady && $user) goto($user.role === 'admin' ? '/admin' : '/app');
  });

  let fullName = $state('');
  let email = $state('');
  let password = $state('');
  let confirm = $state('');
  let showPw = $state(false);
  let error = $state('');
  let loading = $state(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    error = '';
    if (password !== confirm) {
      error = $t('auth.mismatch');
      return;
    }
    loading = true;
    try {
      await register(email, password, fullName || undefined);
      goto('/app');
    } catch (err) {
      error = err instanceof Error ? err.message : $t('auth.register.failed');
    } finally {
      loading = false;
    }
  };
</script>

<Seo title="Create your account" description="Create a free Pastatrade account and start reading crypto market rotation with structure." noindex />

<div class="flex min-h-[78vh] items-center">
  <AuthShell>
    <h2 class="text-2xl font-semibold text-strong">{$t('auth.register.title')}</h2>
    <p class="mt-1 text-sm text-muted">{$t('auth.register.sub')}</p>

    <form class="mt-6 space-y-4" onsubmit={submit}>
      {#if error}
        <p class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      {/if}

      <div>
        <label class="stat-label" for="name">{$t('auth.fullname')}</label>
        <div class="relative mt-1">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><User class="h-4 w-4" /></span>
          <input id="name" class="input pl-10" type="text" placeholder="Jane Doe" bind:value={fullName} required autocomplete="name" />
        </div>
      </div>

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
          <input id="password" class="input px-10" type={showPw ? 'text' : 'password'} placeholder="At least 8 characters" bind:value={password} required minlength={8} autocomplete="new-password" />
          <button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-soft" onclick={() => (showPw = !showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}>
            {#if showPw}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
          </button>
        </div>
      </div>

      <div>
        <label class="stat-label" for="confirm">{$t('auth.confirm')}</label>
        <div class="relative mt-1">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Lock class="h-4 w-4" /></span>
          <input id="confirm" class="input pl-10" type={showPw ? 'text' : 'password'} placeholder="••••••••" bind:value={confirm} required minlength={8} autocomplete="new-password" />
        </div>
      </div>

      <button class="btn-primary w-full" type="submit" disabled={loading}>
        {#if loading}{$t('auth.register.creating')}{:else}{$t('auth.register.create')} <ArrowRight class="h-4 w-4" />{/if}
      </button>
    </form>

    <div class="my-4 flex items-center gap-3 text-xs text-muted"><span class="h-px flex-1 bg-edge"></span>{$t('auth.or')}<span class="h-px flex-1 bg-edge"></span></div>
    <GoogleButton redirect="/app" />

    <p class="mt-4 rounded-lg border border-mint/25 bg-mint/5 px-3 py-2 text-center text-xs text-soft">{$t('auth.register.note')}</p>

    <p class="mt-4 text-center text-sm text-muted">{$t('auth.register.have')} <a href="/login" class="text-mint hover:underline">{$t('auth.register.signin')}</a></p>
  </AuthShell>
</div>
