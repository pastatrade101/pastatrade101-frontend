<script lang="ts">
  // Mark for premium / locked features ("Unlock with Premium"): a crown in a soft mint disc.
  import { Crown } from '@lucide/svelte';

  let { size = 44, class: klass = '' }: { size?: number; class?: string } = $props();
</script>

<span class="flex shrink-0 items-center justify-center rounded-full bg-mint/15 text-mint {klass}" style="width:{size}px;height:{size}px" aria-hidden="true">
  <Crown style="width:{Math.round(size * 0.5)}px;height:{Math.round(size * 0.5)}px" />
</span>
