<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { Maximize2, X } from '@lucide/svelte';

  // Thin ECharts wrapper. echarts is imported dynamically so it never runs during
  // SSR; the chart re-renders whenever `option` changes.
  //
  // Mobile readability: on phones the chart is given a min-width (so it renders
  // wider than the screen and scrolls horizontally instead of cramming every
  // label into ~360px), plus a "Landscape" button that opens a rotated
  // fullscreen view. Both are phone-only (< md); tablet/desktop are unchanged.
  // Pass minWidth={0} to opt a small/inline chart out of the wide treatment.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { option, height = 440, minWidth = 720 }: { option: any; height?: number; minWidth?: number } = $props();

  let el: HTMLDivElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chart: any = null;
  let ro: ResizeObserver | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let echartsLib: any = null;

  // Landscape fullscreen view.
  let landscapeOpen = $state(false);
  let lsEl = $state<HTMLDivElement | undefined>(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lsChart: any = null;

  onMount(async () => {
    echartsLib = await import('echarts');
    chart = echartsLib.init(el, null, { renderer: 'canvas' });
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
    if (lsChart) lsChart.setOption(next, true);
  });

  const openLandscape = async () => {
    landscapeOpen = true;
    await tick();
    if (!echartsLib || !lsEl) return;
    lsChart = echartsLib.init(lsEl, null, { renderer: 'canvas' });
    lsChart.setOption(option, true);
    lsChart.resize();
  };
  const closeLandscape = () => {
    lsChart?.dispose();
    lsChart = null;
    landscapeOpen = false;
  };

  onDestroy(() => {
    ro?.disconnect();
    chart?.dispose();
    lsChart?.dispose();
  });
</script>

<div class="relative">
  {#if minWidth}
    <button
      type="button"
      class="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-md border border-edge bg-panel/90 px-2 py-1 text-[11px] font-medium text-soft shadow-sm backdrop-blur md:hidden"
      onclick={openLandscape}
    >
      <Maximize2 class="h-3 w-3" /> Landscape
    </button>
  {/if}
  <div class={minWidth ? 'overflow-x-auto overflow-y-hidden md:overflow-visible' : ''}>
    <div bind:this={el} class="echart-inner" style="height:{height}px; --echart-min-w: {minWidth}px"></div>
  </div>
</div>

{#if landscapeOpen}
  <div class="fixed inset-0 z-[100] bg-ink">
    <button
      type="button"
      class="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-lg border border-edge bg-panel px-3 py-1.5 text-sm font-medium text-soft shadow-lg"
      onclick={closeLandscape}
    >
      <X class="h-4 w-4" /> Close
    </button>
    <div class="landscape-stage">
      <div bind:this={lsEl} class="h-full w-full"></div>
    </div>
  </div>
{/if}

<style>
  .echart-inner {
    width: 100%;
  }
  /* Wide, scrollable on phones only; normal on tablet/desktop. */
  @media (max-width: 767px) {
    .echart-inner {
      min-width: var(--echart-min-w, 0);
    }
  }
  /* Rotate the stage 90° so a portrait phone renders the chart in landscape. */
  .landscape-stage {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100vh;
    height: 100vw;
    transform: translate(-50%, -50%) rotate(90deg);
    transform-origin: center center;
    padding: 14px;
  }
</style>
