<script lang="ts">
  // SVG bar chart that handles negative values (bars drop below a zero baseline).
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

  const barW = 46;
  const gap = 14;
  const width = $derived(Math.max(bars.length * (barW + gap) + gap, 200));

  const vmax = $derived(Math.max(0, ...bars.map((b) => b.value)));
  const vmin = $derived(Math.min(0, ...bars.map((b) => b.value)));
  const range = $derived(vmax - vmin || 1);

  const plotTop = 24;
  const plotBottom = $derived(height - 28);
  const plotH = $derived(plotBottom - plotTop);
  const yFor = (v: number) => plotBottom - ((v - vmin) / range) * plotH;
  const zeroY = $derived(yFor(0));
</script>

<svg viewBox={`0 0 ${width} ${height}`} class="w-full" role="img" aria-label="bar chart">
  <!-- zero baseline -->
  <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="#222b39" stroke-width="1" />
  {#each bars as b, i}
    {@const x = gap + i * (barW + gap)}
    {@const y = Math.min(zeroY, yFor(b.value))}
    {@const h = Math.abs(yFor(b.value) - zeroY)}
    <rect {x} {y} width={barW} height={Math.max(h, 1)} rx="3" fill={b.value >= 0 ? '#37e0a6' : '#ff5d6c'} opacity="0.85" />
    <text x={x + barW / 2} y={b.value >= 0 ? y - 5 : y + h + 12} fill="#cbd5e1" font-size="10" text-anchor="middle">
      {b.value.toFixed(2)}{unit}
    </text>
    <text x={x + barW / 2} y={height - 8} fill="#8b97a8" font-size="10" text-anchor="middle">{b.label}</text>
  {/each}
</svg>
