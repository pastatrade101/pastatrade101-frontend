<script lang="ts">
  import { onMount } from 'svelte';
  import { MessageCircle, Check, X } from '@lucide/svelte';
  import { api } from '$lib/api';

  // The member's own consent, asked for plainly.
  //
  // Built on the app's own card/input/button classes rather than hand-picked
  // colours, so it reads correctly in both themes instead of being a dark panel
  // pasted onto a light page. Nothing is pre-ticked — consent has to be an
  // affirmative act, and Meta can ask us to show when it was given.

  let enabled = $state(false);
  let number = $state('');
  let loading = $state(true);
  let busy = $state(false);
  let message = $state('');
  let error = $state('');

  const load = async () => {
    try {
      const pref = await api<{ number: string | null; enabled: boolean }>('/me/whatsapp', { auth: true });
      enabled = pref.enabled;
      number = pref.number ? `+${pref.number}` : '';
    } catch {
      // A member who has never set this simply has nothing to load.
    } finally {
      loading = false;
    }
  };

  const save = async () => {
    error = '';
    message = '';
    busy = true;
    try {
      const res = await api<{ enabled: boolean; number?: string }>('/me/whatsapp', { auth: true, method: 'PUT',
        body: { enabled: true, number }
      });
      enabled = res.enabled;
      if (res.number) number = `+${res.number}`;
      message = 'WhatsApp alerts are on. You can turn them off here, or reply STOP on WhatsApp.';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save your number.';
    } finally {
      busy = false;
    }
  };

  const turnOff = async () => {
    busy = true;
    error = '';
    try {
      await api('/me/whatsapp', { auth: true, method: 'PUT', body: { enabled: false } });
      enabled = false;
      message = 'WhatsApp alerts are off.';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not update your settings.';
    } finally {
      busy = false;
    }
  };

  onMount(load);
</script>

{#if !loading}
  <div class="card">
    <div class="flex items-start gap-3">
      <span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-mint/15">
        <MessageCircle class="size-5 text-mint" />
      </span>

      <div class="min-w-0 flex-1">
        <h3 class="text-base font-semibold text-strong">Get reports on WhatsApp</h3>
        <p class="mt-1 text-sm text-body">
          When a new market intelligence report is published, we send you a short message with the headline and a
          link. A few times a week at most — never price calls, never anyone else's number.
        </p>

        {#if enabled}
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <span class="pill bg-mint/15 text-mint">
              <Check class="size-3.5" /> On for {number}
            </span>
            <button class="btn-ghost" disabled={busy} onclick={turnOff}>
              <X class="size-4" /> Turn off
            </button>
          </div>
        {:else}
          <div class="mt-4 flex flex-wrap items-end gap-3">
            <label class="block">
              <span class="mb-1 block text-xs text-muted">Your WhatsApp number</span>
              <input
                bind:value={number}
                inputmode="tel"
                placeholder="+255 712 345 678"
                class="input w-56"
              />
            </label>
            <button class="btn-primary" disabled={busy || number.trim().length < 9} onclick={save}>
              {busy ? 'Saving…' : 'Turn on alerts'}
            </button>
          </div>
          <p class="mt-2 text-xs text-muted">
            Include the country code — a number starting 07 is read as Tanzanian. By turning this on you agree to
            receive these messages; stop them here or by replying STOP.
          </p>
        {/if}

        {#if message}<p class="mt-3 text-sm text-mint">{message}</p>{/if}
        {#if error}<p class="mt-3 text-sm text-danger">{error}</p>{/if}
      </div>
    </div>
  </div>
{/if}
