<script lang="ts">
  import { onMount } from 'svelte';
  import { MessageCircle, Check, X } from '@lucide/svelte';
  import { api } from '$lib/api';

  // The member's own consent, asked for plainly.
  //
  // Two things this component is careful about. It never pre-ticks the toggle —
  // consent has to be an affirmative act, and Meta can ask us to show when it was
  // given. And it says what will actually arrive and how often, because "alerts"
  // with no promise attached is how people end up replying STOP.

  let { compact = false }: { compact?: boolean } = $props();

  let enabled = $state(false);
  let number = $state('');
  let loading = $state(true);
  let busy = $state(false);
  let message = $state('');
  let error = $state('');

  const load = async () => {
    try {
      const pref = await api<{ number: string | null; enabled: boolean }>('/membership/whatsapp');
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
      const res = await api<{ enabled: boolean; number?: string }>('/membership/whatsapp', {
        method: 'PUT',
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
      await api('/membership/whatsapp', { method: 'PUT', body: { enabled: false } });
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
  <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
    <div class="flex items-start gap-3">
      <span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15">
        <MessageCircle class="size-5 text-emerald-400" />
      </span>
      <div class="min-w-0 flex-1">
        <h3 class="font-semibold text-slate-100">Get reports on WhatsApp</h3>
        <p class="mt-1 text-sm text-slate-400">
          When a new market intelligence report is published, we send you a short message with the headline and a link.
          A few times a week at most — never price calls, never anyone else's number.
        </p>

        {#if enabled}
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <span class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-300">
              <Check class="size-4" /> On for {number}
            </span>
            <button
              class="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-50"
              disabled={busy}
              onclick={turnOff}
            >
              <X class="size-4" /> Turn off
            </button>
          </div>
        {:else}
          <div class="mt-3 flex flex-wrap items-end gap-2">
            <label class="text-xs text-slate-400">
              Your WhatsApp number
              <input
                bind:value={number}
                inputmode="tel"
                placeholder="+255 712 345 678"
                class="mt-1 w-56 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              />
            </label>
            <button
              class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
              disabled={busy || number.trim().length < 9}
              onclick={save}
            >
              {busy ? 'Saving…' : 'Turn on alerts'}
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-500">
            Include the country code. By turning this on you agree to receive these messages; you can stop them here or
            by replying STOP.
          </p>
        {/if}

        {#if message}<p class="mt-2 text-sm text-emerald-300">{message}</p>{/if}
        {#if error}<p class="mt-2 text-sm text-rose-300">{error}</p>{/if}
      </div>
    </div>
  </div>
{/if}
