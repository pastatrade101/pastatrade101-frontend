<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  // Thin ECharts wrapper. echarts is imported dynamically so it never runs during
  // SSR; the chart re-renders whenever `option` changes.
  let { option, height = 440 }: { option: any; height?: number } = $props();

  let el: HTMLDivElement;
  let chart: any = null;
  let ro: ResizeObserver | null = null;

  onMount(async () => {
    const echarts = await import('echarts');
    chart = echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption(option);
    ro = new ResizeObserver(() => chart?.resize());
    ro.observe(el);
  });

  // Push new options on change (notMerge=true so removed series disappear).
  // Read `option` unconditionally first: an $effect only tracks what it actually
  // reads, and on the first run `chart` is still null — so guarding the read
  // behind `if (chart)` would register no dependency and the effect would never
  // re-run when `option` changes (e.g. toggling a cycle chip).
  $effect(() => {
    const next = option;
    if (chart) chart.setOption(next, true);
  });

  onDestroy(() => {
    ro?.disconnect();
    chart?.dispose();
  });
</script>

<div bind:this={el} style="width:100%;height:{height}px"></div>
