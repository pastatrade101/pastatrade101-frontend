<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<!-- Regulatory guardrail: scores are intelligence signals, never predictions. -->
<p class="rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs text-muted {compact ? '' : 'leading-relaxed'}">
  <strong class="text-soft">Not financial advice.</strong>
  Pastatrade surfaces ranking-based intelligence and probability-style scoring from market indicators. Scores describe
  current conditions — they are not predictions that any asset will rise or fall. Always do your own research.
</p>
