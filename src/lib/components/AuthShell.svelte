<script lang="ts">
  import { Check } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';

  // mobileBrand=false hides the left brand panel on phones (form-only), while
  // keeping the two-column layout on desktop.
  let { children, mobileBrand = true }: { children: Snippet; mobileBrand?: boolean } = $props();

  const bullets = ['brand.b1', 'brand.b2', 'brand.b3', 'brand.b4', 'brand.b5'];
  const stats: { label: string; value: string; tone: string }[] = [
    { label: 'brand.stat.btcrisk', value: 'brand.stat.gooddca', tone: 'text-mint' },
    { label: 'brand.stat.altbtc', value: 'brand.stat.selective', tone: 'text-accent' },
    { label: 'brand.stat.ecorotation', value: 'brand.stat.nearimproving', tone: 'text-mint' },
    { label: 'brand.stat.socialrisk', value: 'brand.stat.normalatt', tone: 'text-soft' }
  ];
</script>

<div class="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl lg:grid-cols-2 {mobileBrand ? 'border border-edge shadow-2xl' : 'lg:border lg:border-edge lg:shadow-2xl'}">
  <!-- Left brand / value panel -->
  <aside class="brand relative {mobileBrand ? 'flex' : 'hidden lg:flex'} flex-col overflow-hidden p-7 lg:p-10">
    <div class="grid-layer"></div>
    <svg class="chart-layer" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="authArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgb(var(--c-mint))" stop-opacity="0.2" />
          <stop offset="100%" stop-color="rgb(var(--c-mint))" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,120 L60,104 L120,112 L180,72 L240,88 L300,52 L360,66 L420,30 L480,46 L540,20 L600,34 L600,160 L0,160 Z" fill="url(#authArea)" />
      <path
        d="M0,120 L60,104 L120,112 L180,72 L240,88 L300,52 L360,66 L420,30 L480,46 L540,20 L600,34"
        fill="none"
        stroke="rgb(var(--c-mint))"
        stroke-width="2"
        stroke-opacity="0.55"
      />
    </svg>

    <div class="relative z-10 flex flex-1 flex-col">
      <a href="/" class="flex items-center gap-2 text-lg font-semibold text-strong">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-mint/15"><BrandMark class="h-5 w-5 text-mint" /></span>
        Pasta<span class="text-mint">trade101</span>
      </a>

      <div class="mt-8 lg:mt-14">
        <span class="inline-flex items-center gap-1.5 rounded-full border border-edge bg-panel/50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted backdrop-blur">
          <span class="h-1.5 w-1.5 rounded-full bg-mint"></span> {$t('brand.badge')}
        </span>
        <h1 class="mt-3 text-2xl font-semibold leading-tight text-strong lg:text-[28px]">{$t('brand.headline')}</h1>
        <p class="mt-2 max-w-md text-sm leading-relaxed text-soft">{$t('brand.sub')}</p>
      </div>

      <ul class="mt-6 space-y-2">
        {#each bullets as b}
          <li class="flex items-center gap-2.5 text-sm text-soft">
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-mint/12 text-mint"><Check class="h-3.5 w-3.5" /></span>
            {$t(b)}
          </li>
        {/each}
      </ul>

      <div class="mt-7 hidden grid-cols-2 gap-2.5 lg:grid">
        {#each stats as s}
          <div class="rounded-xl border border-edge/70 bg-panel/40 px-3 py-2.5 backdrop-blur">
            <div class="text-[11px] text-muted">{$t(s.label)}</div>
            <div class="text-sm font-semibold {s.tone}">{$t(s.value)}</div>
          </div>
        {/each}
      </div>

      <div class="mt-auto hidden pt-8 sm:block">
        <p class="border-l-2 border-mint/40 pl-3 text-sm italic text-soft">{$t('brand.quote')}</p>
        <p class="mt-3 text-xs text-muted">{$t('brand.trust')}</p>
      </div>
    </div>
  </aside>

  <!-- Right form card -->
  <section class="flex items-center justify-center p-6 sm:p-10 {mobileBrand ? 'bg-ink' : 'lg:bg-ink'}">
    <div class="auth-card w-full max-w-[420px]">
      {@render children()}
    </div>
  </section>
</div>

<style>
  .brand {
    background:
      radial-gradient(120% 80% at 0% 0%, rgb(var(--c-mint) / 0.1), transparent 50%),
      radial-gradient(120% 90% at 100% 100%, rgb(var(--c-accent) / 0.06), transparent 55%),
      linear-gradient(160deg, rgb(var(--c-panel-2)), rgb(var(--c-panel)));
  }
  .grid-layer {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgb(127 140 160 / 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgb(127 140 160 / 0.07) 1px, transparent 1px);
    background-size: 38px 38px;
    -webkit-mask-image: radial-gradient(130% 100% at 50% 0%, #000 38%, transparent 85%);
    mask-image: radial-gradient(130% 100% at 50% 0%, #000 38%, transparent 85%);
    pointer-events: none;
  }
  .chart-layer {
    position: absolute;
    inset: auto 0 0 0;
    height: 10rem;
    width: 100%;
    opacity: 0.55;
    pointer-events: none;
  }
  .auth-card {
    border: 1px solid rgb(var(--c-edge));
    background: rgb(var(--c-panel) / 0.72);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 1rem;
    padding: 1.6rem;
    box-shadow: 0 24px 60px rgb(0 0 0 / 0.3);
  }
</style>
