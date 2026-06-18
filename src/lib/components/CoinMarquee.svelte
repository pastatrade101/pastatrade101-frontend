<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  interface Coin {
    coingecko_id: string;
    symbol: string;
    name: string;
    image_url: string | null;
  }

  let coins = $state<Coin[]>([]);
  onMount(async () => {
    try {
      coins = (await api<{ items: Coin[] }>('/market/coins')).items.filter((c) => c.image_url);
    } catch {
      /* marquee is decorative — stay empty if market data isn't synced yet */
    }
  });

  // Duplicate the list so the -50% translate loops seamlessly.
  const loop = $derived([...coins, ...coins]);
</script>

{#if coins.length}
  <div class="marquee">
    <div class="marquee-track">
      {#each loop as c, i (c.coingecko_id + '-' + i)}
        <div class="group/coin relative shrink-0">
          <img
            src={c.image_url}
            alt={c.name}
            loading="lazy"
            class="h-9 w-9 rounded-full ring-1 ring-edge transition group-hover/coin:scale-110 group-hover/coin:ring-mint/50"
          />
          <span
            class="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-edge bg-panel px-2 py-1 text-[11px] font-medium text-strong opacity-0 shadow-lg transition group-hover/coin:opacity-100"
          >
            {c.symbol.toUpperCase()} · {c.name}
          </span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .marquee {
    overflow: hidden;
    /* Top padding keeps the hover tooltip inside the clip box (overflow:hidden
       is needed for the scroll + edge fade, so the tooltip can't escape it). */
    padding: 2.75rem 0 0.75rem;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
    mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
  }
  .marquee-track {
    display: flex;
    width: max-content;
    gap: 1.5rem;
    animation: coin-marquee 45s linear infinite;
  }
  /* Pause so a user can hover a specific coin */
  .marquee:hover .marquee-track {
    animation-play-state: paused;
  }
  @keyframes coin-marquee {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-50%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .marquee-track {
      animation: none;
      flex-wrap: wrap;
      justify-content: center;
    }
  }
</style>
