<script lang="ts">
  // Minimal dependency-free SVG line chart. Good enough for Phase 1; swap for
  // TradingView Lightweight Charts / ECharts when candles + indicators are needed.
  interface Props {
    points: number[];
    height?: number;
    stroke?: string;
    fill?: boolean;
  }
  let { points, height = 80, stroke = '#37e0a6', fill = true }: Props = $props();

  const width = 600;

  const path = $derived.by(() => {
    const valid = points.filter((p) => Number.isFinite(p));
    if (valid.length < 2) return { line: '', area: '' };
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    const step = width / (valid.length - 1);
    const coords = valid.map((p, i) => [i * step, height - ((p - min) / range) * (height - 8) - 4] as const);
    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  });
</script>

<svg viewBox={`0 0 ${width} ${height}`} class="w-full" preserveAspectRatio="none" role="img" aria-label="price chart">
  {#if fill && path.area}
    <path d={path.area} fill={stroke} opacity="0.08" />
  {/if}
  {#if path.line}
    <path d={path.line} fill="none" stroke={stroke} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
  {/if}
</svg>
