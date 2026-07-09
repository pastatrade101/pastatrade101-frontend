<script lang="ts">
  // Small "AI interpretation" heading with the breathing AI icon. Used to brand
  // every interpretation / takeaway / reading block as AI across the app.
  import AiLottie from './AiLottie.svelte';

  let { text = 'AI interpretation', size = 18, class: klass = '' }: { text?: string; size?: number; class?: string } = $props();
</script>

<span class="stat-label inline-flex items-center gap-1.5 text-mint {klass}"><AiLottie {size} /> {text}</span>
