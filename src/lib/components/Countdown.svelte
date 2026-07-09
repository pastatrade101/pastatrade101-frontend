<script lang="ts">
  import { browser } from '$app/environment';

  // Reusable countdown to an ISO timestamp. Ticks every second and calls
  // onExpire() exactly once when it reaches zero, so the parent can drop the
  // offer and revert to the normal price without a reload.
  let { endsAt, onExpire, label = '' }: { endsAt: string; onExpire?: () => void; label?: string } = $props();

  let now = $state(0);
  let mounted = $state(false);
  let fired = false;

  const target = $derived(new Date(endsAt).getTime());
  const remaining = $derived(Math.max(0, target - now));
  const done = $derived(mounted && remaining <= 0);

  $effect(() => {
    if (!browser) return;
    mounted = true;
    let id: ReturnType<typeof setInterval>;
    const tick = () => {
      now = Date.now();
      if (target - now <= 0 && !fired) {
        fired = true;
        clearInterval(id);
        onExpire?.();
      }
    };
    id = setInterval(tick, 1000);
    tick(); // render correct time immediately (and fire if already past)
    return () => clearInterval(id);
  });

  const parts = $derived.by(() => {
    const s = Math.floor(remaining / 1000);
    return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  });
  const pad = (n: number) => String(n).padStart(2, '0');
</script>

{#if mounted && !done}
  <div class="cd" role="timer" aria-label={label || 'Offer countdown'}>
    {#if parts.d > 0}
      <span class="seg"><b>{parts.d}</b><i>{parts.d === 1 ? 'day' : 'days'}</i></span><span class="sep">:</span>
    {/if}
    <span class="seg"><b>{pad(parts.h)}</b><i>hrs</i></span><span class="sep">:</span>
    <span class="seg"><b>{pad(parts.m)}</b><i>min</i></span><span class="sep">:</span>
    <span class="seg"><b>{pad(parts.s)}</b><i>sec</i></span>
  </div>
{/if}

<style>
  .cd {
    display: inline-flex;
    align-items: flex-start;
    gap: 0.25rem;
  }
  .seg {
    display: inline-flex;
    min-width: 2.5rem;
    flex-direction: column;
    align-items: center;
    border-radius: 0.6rem;
    border: 1px solid rgb(var(--c-edge));
    background: rgb(var(--c-panel-2) / 0.7);
    padding: 0.32rem 0.35rem;
  }
  .seg b {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
    color: rgb(var(--c-strong));
    font-variant-numeric: tabular-nums;
  }
  .seg i {
    margin-top: 0.18rem;
    font-size: 0.55rem;
    font-style: normal;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgb(var(--c-muted));
  }
  .sep {
    align-self: center;
    padding-top: 0.35rem;
    font-weight: 700;
    color: rgb(var(--c-muted));
  }
</style>
