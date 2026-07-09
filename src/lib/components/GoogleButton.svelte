<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { loginWithGoogle } from '$lib/stores/auth';

  let { redirect = '/app' }: { redirect?: string } = $props();

  // Public OAuth client id (safe to ship in the browser).
  const CLIENT_ID = '744124991412-nd76lcjqqq2935f8sqonr90ho2gq4aqj.apps.googleusercontent.com';

  let wrap: HTMLDivElement;
  let btn: HTMLDivElement;
  let error = $state('');
  let busy = $state(false);

  const onCredential = async (resp: { credential?: string }) => {
    if (!resp?.credential) return;
    busy = true;
    error = '';
    try {
      await loginWithGoogle(resp.credential);
      goto(redirect);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Google sign-in failed. Please try again.';
      busy = false;
    }
  };

  const render = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    if (!g?.accounts?.id || !btn) return false;
    g.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCredential });
    const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'outline' : 'filled_black';
    const width = Math.min(400, Math.max(240, Math.floor(wrap?.clientWidth || 320)));
    g.accounts.id.renderButton(btn, { type: 'standard', theme, size: 'large', shape: 'rectangular', text: 'continue_with', logo_alignment: 'center', width });
    return true;
  };

  onMount(() => {
    if (render()) return;
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', render);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = render;
    document.head.appendChild(s);
  });
</script>

<div bind:this={wrap} class="flex w-full flex-col items-center gap-2">
  <div bind:this={btn} class="flex min-h-[40px] justify-center"></div>
  {#if busy}<p class="text-xs text-muted">Signing you in…</p>{/if}
  {#if error}<p class="text-center text-xs text-danger">{error}</p>{/if}
</div>
