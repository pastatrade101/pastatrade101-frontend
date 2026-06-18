<script lang="ts">
  // Semicircular 0→1 risk gauge (green → red), matching the risk-dashboard look.
  interface Props {
    value: number | null; // 0..1
    title?: string;
    size?: number;
  }
  let { value, title, size = 180 }: Props = $props();

  const cx = 100;
  const cy = 100;
  const R = 80;

  // value→point on the semicircle (v=0 → left, v=1 → right, v=0.5 → top).
  const pointFor = (v: number) => {
    const a = ((180 - v * 180) * Math.PI) / 180;
    return { x: cx + R * Math.cos(a), y: cy - R * Math.sin(a) };
  };

  const arc = (vStart: number, vEnd: number) => {
    const p0 = pointFor(vStart);
    const p1 = pointFor(vEnd);
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${R} ${R} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  };

  // Coloured bands (green → red) like the reference dashboard.
  const bands = [
    { from: 0.0, to: 0.2, color: '#2fbf71' },
    { from: 0.2, to: 0.4, color: '#9acd3e' },
    { from: 0.4, to: 0.6, color: '#ffd23f' },
    { from: 0.6, to: 0.8, color: '#ff8c42' },
    { from: 0.8, to: 1.0, color: '#ff5d6c' }
  ];

  const v = $derived(value === null ? null : Math.max(0, Math.min(1, value)));
  const needle = $derived(v === null ? null : pointFor(v));
  const needleColor = $derived(
    v === null ? '#8b97a8' : v < 0.2 ? '#2fbf71' : v < 0.4 ? '#9acd3e' : v < 0.6 ? '#ffd23f' : v < 0.8 ? '#ff8c42' : '#ff5d6c'
  );
</script>

<div class="flex flex-col items-center">
  {#if title}<p class="mb-1 text-sm font-medium text-soft">{title}</p>{/if}
  <svg viewBox="0 0 200 120" width={size} height={(size * 120) / 200} role="img" aria-label={title ?? 'risk gauge'}>
    {#each bands as b}
      <path d={arc(b.from, b.to)} fill="none" stroke={b.color} stroke-width="12" stroke-linecap="butt" />
    {/each}
    <!-- tick labels -->
    {#each [0, 0.2, 0.4, 0.6, 0.8, 1] as t}
      {@const p = pointFor(t)}
      <text
        x={cx + (p.x - cx) * 1.18}
        y={cy + (p.y - cy) * 1.18}
        fill="#8b97a8"
        font-size="8"
        text-anchor="middle"
        dominant-baseline="middle">{t}</text>
    {/each}
    {#if needle}
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} style="stroke: rgb(var(--c-strong))" stroke-width="2.5" stroke-linecap="round" />
      <circle cx={cx} cy={cy} r="4" fill={needleColor} />
    {/if}
    <text x={cx} y={cy + 16} style="fill: rgb(var(--c-strong))" font-size="16" font-weight="700" text-anchor="middle">
      {v === null ? '—' : v.toFixed(3)}
    </text>
  </svg>
</div>
