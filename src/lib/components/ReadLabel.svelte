<script lang="ts">
  // Label for a rule-based read computed from the signals ("Signal read" by default).
  import { Activity } from '@lucide/svelte';

  let { text = '', class: klass = '' }: { text?: string; class?: string } = $props();
</script>

<span class="stat-label inline-flex items-center gap-1.5 text-mint {klass}"><Activity size={15} /> {text || 'Signal read'}</span>
