<script lang="ts">
  // Bar chart that handles negative values (bars drop below a zero baseline).
  // Was a hand-rolled SVG with no tooltip, no theming and no axis labels; now it
  // runs through the shared ECharts layer so it inherits light/dark, Branding
  // colours and hover readouts. Props are unchanged.
  import EChart from './EChart.svelte';
  import { adaptHue, barSeries, categoryAxis, grid, valueAxis, axisTooltip } from '$lib/charts/presets';

  interface Bar {
    label: string;
    value: number;
  }
  interface Props {
    bars: Bar[];
    unit?: string;
    height?: number;
  }
  let { bars, unit = '', height = 240 }: Props = $props();

  const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}${unit}`;

  const option = $derived.by(() => {
    if (!bars?.length) return {};
    const up = $adaptHue('#22C55E');
    const down = $adaptHue('#EF4444');
    return {
      grid: grid({ left: 8, right: 12, top: 22, bottom: 4 }),
      tooltip: axisTooltip({ valueFormatter: (v: number) => fmt(v) }),
      xAxis: categoryAxis(
        bars.map((b) => b.label),
        { axisTick: { show: false }, axisLabel: { fontSize: 10, interval: 0, hideOverlap: true } }
      ),
      yAxis: valueAxis({ axisLabel: { fontSize: 10, formatter: (v: number) => `${v}${unit}` } }),
      series: [
        barSeries({
          name: 'value',
          data: bars.map((b) => b.value),
          // Sign is encoded twice — bar direction AND colour.
          color: (p) => ((p.value as number) >= 0 ? up : down),
          width: '58%',
          extra: {
            label: {
              show: true,
              position: 'top',
              fontSize: 10,
              formatter: (p: { value: number }) => fmt(p.value)
            }
          }
        })
      ]
    };
  });
</script>

<EChart {option} {height} minWidth={0} />
