<script lang="ts">
  import { Mail, ArrowLeft } from '@lucide/svelte';
  import { t } from '$lib/i18n';
  import AuthShell from '$lib/components/AuthShell.svelte';

  let email = $state('');
  let sent = $state(false);

  // No automated reset endpoint exists yet — this records intent client-side and
  // tells the user how recovery works. Wire to a backend reset flow when ready.
  const submit = (e: Event) => {
    e.preventDefault();
    sent = true;
  };
</script>

<div class="flex min-h-[78vh] items-center">
  <AuthShell>
    <h2 class="text-2xl font-semibold text-strong">{$t('auth.forgot.title')}</h2>
    <p class="mt-1 text-sm text-muted">{$t('auth.forgot.sub')}</p>

    {#if sent}
      <div class="mt-6 rounded-lg border border-mint/25 bg-mint/5 px-4 py-3 text-sm text-soft">
        {$t('auth.forgot.sent', { email })}
        <p class="mt-2 text-xs text-muted">{$t('auth.forgot.note')}</p>
      </div>
    {:else}
      <form class="mt-6 space-y-4" onsubmit={submit}>
        <div>
          <label class="stat-label" for="email">{$t('auth.email')}</label>
          <div class="relative mt-1">
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Mail class="h-4 w-4" /></span>
            <input id="email" class="input pl-10" type="email" placeholder="you@email.com" bind:value={email} required autocomplete="email" />
          </div>
        </div>
        <button class="btn-primary w-full" type="submit">{$t('auth.forgot.send')}</button>
      </form>
    {/if}

    <a href="/login" class="mt-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-mint"><ArrowLeft class="h-4 w-4" /> {$t('auth.forgot.back')}</a>
  </AuthShell>
</div>
