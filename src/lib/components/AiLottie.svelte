<script lang="ts">
  // Breathing AI animation used on every premium / "Unlock with Premium" upsell.
  // Browser-guarded (SSR renders a static sparkle fallback so nothing flashes).
  import { browser } from '$app/environment';
  import { Sparkles } from '@lucide/svelte';
  import { DotLottieSvelte } from '@lottiefiles/dotlottie-svelte';

  let { size = 44, class: klass = '' }: { size?: number; class?: string } = $props();
</script>

{#if browser}
  <div class="shrink-0 {klass}" style="width:{size}px;height:{size}px" aria-hidden="true">
    <DotLottieSvelte src="/Ai.lottie" loop autoplay />
  </div>
{:else}
  <span class="flex shrink-0 items-center justify-center rounded-full bg-[#f87d7f]/15 {klass}" style="width:{size}px;height:{size}px" aria-hidden="true">
    <Sparkles class="text-[#f87d7f]" style="width:{Math.round(size * 0.5)}px;height:{Math.round(size * 0.5)}px" />
  </span>
{/if}
