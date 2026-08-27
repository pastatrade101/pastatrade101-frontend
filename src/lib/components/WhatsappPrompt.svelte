<script lang="ts">
  import { onMount } from 'svelte';
  import { MessageCircle, X } from '@lucide/svelte';
  import { browser } from '$app/environment';
  import { api } from '$lib/api';

  // The ask, for members who have not given us a number.
  //
  // Deliberately a quiet strip rather than a modal: this is a nice-to-have, and a
  // dialog over the market data a member came to read would be an interruption
  // they did not ask for. Dismissing it is remembered, and it never returns for
  // somebody who has already said no — asking twice is how a prompt becomes nagging.

  const DISMISSED = 'pastatrade.whatsapp-prompt.dismissed';

  let show = $state(false);
  let number = $state('');
  let busy = $state(false);
  let done = $state(false);
  let error = $state('');

  const save = async () => {
    error = '';
    busy = true;
    try {
      await api('/me/whatsapp', { auth: true, method: 'PUT', body: { enabled: true, number } });
      done = true;
      setTimeout(() => (show = false), 2200);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save that number.';
    } finally {
      busy = false;
    }
  };

  const dismiss = () => {
    show = false;
    if (browser) localStorage.setItem(DISMISSED, '1');
  };

  onMount(async () => {
    if (!browser || localStorage.getItem(DISMISSED)) return;
    try {
      const pref = await api<{ enabled: boolean; number: string | null }>('/me/whatsapp', { auth: true });
      // Never ask someone who already answered — including someone who opted out.
      show = !pref.enabled && !pref.number;
    } catch {
      // Signed out, or the endpoint is unavailable: say nothing.
    }
  });
</script>

{#if show}
  <div class="card mb-4 border-mint/30 bg-mint/5">
    {#if done}
      <p class="text-sm font-medium text-mint">
        Done — we'll message you when a new report is published.
      </p>
    {:else}
      <div class="flex flex-wrap items-center gap-3">
        <MessageCircle class="size-5 shrink-0 text-mint" />
        <p class="min-w-0 flex-1 text-sm text-body">
          <span class="font-semibold">Want new reports on WhatsApp?</span>
          <span class="text-muted">A short message with the headline and a link, a few times a week at most.</span>
        </p>
        <div class="flex items-center gap-2">
          <input
            bind:value={number}
            inputmode="tel"
            placeholder="+255 712 345 678"
            class="input-sm w-44"
          />
          <button
            class="btn-primary py-1.5"
            disabled={busy || number.trim().length < 9}
            onclick={save}
          >
            {busy ? 'Saving…' : 'Yes, send them'}
          </button>
          <button class="rounded-lg p-1.5 text-muted hover:text-strong" aria-label="Not now" onclick={dismiss}>
            <X class="size-4" />
          </button>
        </div>
      </div>
      {#if error}<p class="mt-2 text-sm text-danger">{error}</p>{/if}
    {/if}
  </div>
{/if}
