<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    value: string; // e.g. "Top 100+", "11+", "0–1", "Daily"
    duration?: number;
  }
  let { value, duration = 1600 }: Props = $props();

  // Split the string into prefix + number + suffix. Non-numeric values (e.g.
  // "Daily") render as-is and never animate.
  const parsed = $derived.by(() => {
    const m = value.match(/\d[\d,]*/);
    if (!m) return null;
    const num = m[0];
    const idx = m.index ?? 0;
    return { prefix: value.slice(0, idx), suffix: value.slice(idx + num.length), target: parseInt(num.replace(/,/g, ''), 10) };
  });

  let display = $state(0);
  let el = $state<HTMLElement>();

  onMount(() => {
    if (!parsed) return;
    const target = parsed.target;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      display = target;
      return;
    }

    let raf = 0;
    let started = false;
    const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
    const start = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        display = Math.round(easeOutExpo(p) * target);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started) {
            started = true;
            start();
            io.disconnect();
          }
        }
      },
      { threshold: 0.4 }
    );
    if (el) io.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  });

  const fmt = (n: number) => n.toLocaleString('en-US');
</script>

<span bind:this={el}>
  {#if parsed}{parsed.prefix}{fmt(display)}{parsed.suffix}{:else}{value}{/if}
</span>
