<script lang="ts">
  // Overlays several ROI series on shared axes (x = day-of-year, y = ROI %).
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

  const W = 760;
  const padL = 46;
  const padR = 12;
  const padT = 12;
  const padB = 22;

  const allY = $derived(series.flatMap((s) => s.points.map((p) => p.y)));
  const yMin = $derived(allY.length ? Math.min(0, ...allY) : 0);
  const yMax = $derived(allY.length ? Math.max(0, ...allY) : 1);
  const yRange = $derived(yMax - yMin || 1);
  const xMax = 366;

  const xFor = (x: number) => padL + (x / xMax) * (W - padL - padR);
  const yForBase = (v: number, h: number) => h - padB - ((v - yMin) / yRange) * (h - padT - padB);

  const pathFor = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.x).toFixed(1)},${yForBase(p.y, height).toFixed(1)}`).join(' ');

  // Month start day-of-year markers (label a subset to avoid clutter).
  const months = [
    { d: 1, label: 'Jan' },
    { d: 91, label: 'Apr' },
    { d: 182, label: 'Jul' },
    { d: 274, label: 'Oct' }
  ];
</script>

<svg viewBox={`0 0 ${W} ${height}`} class="w-full" role="img" aria-label="overlay chart">
  <!-- zero line + y labels -->
  {#each [yMax, (yMax + yMin) / 2, 0, yMin] as gy}
    <line x1={padL} y1={yForBase(gy, height)} x2={W - padR} y2={yForBase(gy, height)} stroke="#222b39" stroke-width={gy === 0 ? 1.5 : 0.5} />
    <text x={padL - 6} y={yForBase(gy, height) + 3} fill="#8b97a8" font-size="9" text-anchor="end">{Math.round(gy)}{unit}</text>
  {/each}
  <!-- x labels -->
  {#each months as m}
    <text x={xFor(m.d)} y={height - 6} fill="#8b97a8" font-size="9" text-anchor="middle">{m.label}</text>
  {/each}
  <!-- series -->
  {#each series as s}
    <path d={pathFor(s.points)} fill="none" stroke={s.color} stroke-width={s.width ?? 1.8} stroke-dasharray={s.dash ?? ''} opacity={s.opacity ?? 0.9} stroke-linecap="round" stroke-linejoin="round" />
  {/each}
</svg>
