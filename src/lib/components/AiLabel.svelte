<script lang="ts">
  // Two distinct interpretation identities so the deterministic read and the live
  // AI read never look the same when both appear on one page:
  //   • default (ai = false) → "Signal read"      — rule-based / configured
  //     intelligence computed from the signals. Static mint pulse icon, no glow.
  //   • ai = true            → "AI interpretation" — a live Claude read. Breathing
  //     coral Lottie (paired with the .ai-glow card treatment).
  import { Activity } from '@lucide/svelte';
  import AiLottie from './AiLottie.svelte';

  let { ai = false, text = '', size = 26, class: klass = '' }: { ai?: boolean; text?: string; size?: number; class?: string } = $props();

  const label = $derived(text || (ai ? 'AI interpretation' : 'Signal read'));
</script>

{#if ai}
  <span class="stat-label inline-flex items-center gap-1.5 text-[#f87d7f] {klass}"><AiLottie {size} /> {label}</span>
{:else}
  <span class="stat-label inline-flex items-center gap-1.5 text-mint {klass}"><Activity size={15} /> {label}</span>
{/if}
