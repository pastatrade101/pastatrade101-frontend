<script lang="ts">
  // Speedometer-style 0→1 risk gauge (green → red) built on ECharts.
  // Replaces the hand-rolled SVG semicircle: real needle, tick marks, animated
  // readout, and bands that follow the theme. Props are unchanged so every
  // existing call site keeps working.
  import EChart from './EChart.svelte';
  import { gaugeOption } from '$lib/charts/presets';
  import { adaptHue } from '$lib/charts/presets';
  import { readChartTokens } from '$lib/charts/theme';
  import { theme } from '$lib/stores/theme';

  interface Props {
    value: number | null; // 0..1
    title?: string;
    size?: number;
  }
  let { value, title, size = 180 }: Props = $props();

  // A 240° sweep plus the readout stacked under the hub needs more vertical
  // room than the old 180° arc.
  const height = $derived(Math.round(size * 0.86));

  const option = $derived.by(() => {
    void $theme; // re-read tokens when the theme flips
    const t = readChartTokens();
    const rgb = (triplet: string, a = 1) => {
      const [r, g, b] = triplet.split(/[\s,]+/);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    };
    return gaugeOption({
      value,
      size,
      muted: rgb(t.muted),
      strong: rgb(t.strong),
      track: rgb(t.edge, 0.9),
      panel: rgb(t.panel),
      adapt: $adaptHue
    });
  });
</script>

<div class="flex flex-col items-center">
  {#if title}<p class="mb-1 text-sm font-medium text-soft">{title}</p>{/if}
  <div style="width:{size}px" role="img" aria-label="{title ?? 'risk gauge'}: {value == null ? 'unavailable' : value.toFixed(3)} out of 1">
    <EChart {option} height={height} minWidth={0} />
  </div>
</div>
