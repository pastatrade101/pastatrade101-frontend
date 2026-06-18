<script lang="ts">
  import { Lock } from '@lucide/svelte';

  interface Props {
    title?: string;
    plan?: string; // required plan slug/name to show on the CTA
    bullets?: string[];
  }
  let { title = 'This feature is premium', plan = 'Premium', bullets = [] }: Props = $props();
  const planLabel = $derived(plan.charAt(0).toUpperCase() + plan.slice(1));
</script>

<div class="hero-card mx-auto max-w-xl text-center">
  <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/12 text-accent">
    <Lock class="h-6 w-6" />
  </div>
  <h2 class="text-lg font-semibold text-strong">{title}</h2>
  <p class="mt-1 text-sm text-muted">Available on <span class="font-medium text-body">{planLabel}</span>. Upgrade to unlock:</p>
  {#if bullets.length}
    <ul class="mx-auto mt-3 max-w-sm space-y-1 text-left text-sm text-soft">
      {#each bullets as b}
        <li class="flex items-start gap-2"><span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>{b}</li>
      {/each}
    </ul>
  {/if}
  <div class="mt-5 flex items-center justify-center gap-2">
    <a href="/app/account" class="btn-primary">Upgrade to {planLabel}</a>
    <a href="/pricing" class="btn-ghost">Compare plans</a>
  </div>
</div>
