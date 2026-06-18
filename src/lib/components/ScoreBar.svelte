<script lang="ts">
  interface Props {
    score: number; // 0–100
    label?: string;
  }
  let { score, label }: Props = $props();

  const pct = $derived(Math.max(0, Math.min(100, score)));
  const color = $derived(pct >= 71 ? '#37e0a6' : pct >= 51 ? '#5b8cff' : pct >= 31 ? '#ffb547' : '#ff5d6c');
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between">
    <span class="text-2xl font-semibold text-strong">{Math.round(score)}<span class="text-sm text-muted">/100</span></span>
    {#if label}<span class="text-sm font-medium" style="color: {color}">{label}</span>{/if}
  </div>
  <div class="h-2 w-full overflow-hidden rounded-full bg-edge">
    <div class="h-full rounded-full transition-all" style="width: {pct}%; background: {color}"></div>
  </div>
</div>
