<script lang="ts">
  // Overlays several ROI series on shared axes (x = day-of-year, y = ROI %).
  // Was a hand-rolled SVG with no tooltip and hardcoded greys; now it runs on
  // the shared ECharts layer, so hovering finally tells you which year is which
  // and what each one returned on that day. Props are unchanged.
  import EChart from './EChart.svelte';
  import { axisTooltip, grid, lineSeries, valueAxis } from '$lib/charts/presets';

  interface Series {
    year: number | string;
    points: { x: number; y: number }[];
    color: string;
    width?: number;
    dash?: string;
    opacity?: number;
  }
  interface Props {
    series: Series[];
    unit?: string;
    height?: number;
  }
  let { series, unit = '%', height = 320 }: Props = $props();

  // Day-of-year → a readable month label, matching the old axis markers.
  const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayLabel = (d: number) => {
    let i = 0;
    while (i < 11 && MONTH_STARTS[i + 1] <= d) i += 1;
    return `${MONTHS[i]} ${d - MONTH_STARTS[i] + 1}`;
  };

  const option = $derived.by(() => {
    if (!series?.length) return {};
    return {
      grid: grid({ left: 8, right: 14, top: 16, bottom: 4 }),
      tooltip: axisTooltip({
        axisPointer: { type: 'line' },
        valueFormatter: (v: number) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}${unit}`),
        // Day-of-year is meaningless as a raw number; show the calendar day.
        formatter: undefined
      }),
      xAxis: valueAxis({
        min: 1,
        max: 366,
        axisLabel: { fontSize: 9, formatter: (d: number) => dayLabel(Math.round(d)).split(' ')[0] },
        splitLine: { show: false }
      }),
      yAxis: valueAxis({ axisLabel: { fontSize: 9, formatter: (v: number) => `${Math.round(v)}${unit}` } }),
      series: series.map((s) =>
        lineSeries({
          name: String(s.year),
          data: s.points.map((p) => [p.x, p.y]),
          color: s.color,
          width: s.width ?? 1.8,
          dashed: !!s.dash,
          extra: { ...(s.opacity != null ? { lineStyle: { width: s.width ?? 1.8, color: s.color, opacity: s.opacity, ...(s.dash ? { type: 'dashed' } : {}) } } : {}) }
        })
      )
    };
  });
</script>

<EChart {option} {height} minWidth={0} />
