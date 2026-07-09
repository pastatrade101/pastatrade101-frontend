<script lang="ts">
  import { get } from 'svelte/store';
  import { browser } from '$app/environment';
  import { Sparkles, Lock, ArrowRight } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import { DotLottieSvelte } from '@lottiefiles/dotlottie-svelte';
  import { api } from '$lib/api';
  import { locale } from '$lib/i18n';
  import { aiUsage, loadAiUsage, setAiUsage } from '$lib/stores/aiUsage';

  export interface Signal {
    name: string;
    label?: string | null;
    value?: string | number | null;
    meaning?: string | null;
    tone?: string | null;
  }

  let { module, title, signals = [] }: { module: string; title: string; signals: Signal[] } = $props();

  interface Read {
    headline: string;
    body: string;
    stance: 'positive' | 'neutral' | 'caution' | 'negative';
    confidence: string;
  }
  const stanceText: Record<string, string> = { positive: 'text-mint', neutral: 'text-accent', caution: 'text-warn', negative: 'text-danger' };

  let read = $state<Read | null>(null);
  let busy = $state(false);
  let error = $state('');

  loadAiUsage(); // shared, cached across all instances

  // Only send signals that carry a real value; cap to the schema limit.
  const payloadSignals = $derived(
    signals
      .filter((s) => s?.name && s?.label && String(s.label).toLowerCase() !== 'unavailable')
      .slice(0, 12)
      .map((s) => ({ name: s.name, label: s.label ?? null, value: s.value ?? null, meaning: s.meaning ?? null, tone: s.tone ?? null }))
  );

  const ask = async () => {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const res = await api<{ read: Read; used: number; limit: number | null; remaining: number | null }>('/ai/interpret', {
        method: 'POST',
        body: { module, title, lang: $locale === 'sw' ? 'sw' : 'en', signals: payloadSignals },
        auth: true
      });
      read = res.read;
      const cur = get(aiUsage);
      setAiUsage({ enabled: cur?.enabled ?? true, allowed: cur?.allowed ?? true, used: res.used, limit: res.limit, remaining: res.remaining });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not generate the interpretation.';
      error = msg;
      if (/all your AI interpretations|quota/i.test(msg)) {
        const cur = get(aiUsage);
        if (cur) setAiUsage({ ...cur, remaining: 0 });
      }
    } finally {
      busy = false;
    }
  };

  const remainingLabel = $derived(
    $aiUsage?.limit == null ? '' : `${$aiUsage?.remaining ?? 0} left this month`
  );
</script>

{#if $aiUsage && !$aiUsage.allowed}
  <!-- Locked upsell teaser (free / mid) — sells the feature -->
  <div class="relative min-h-[168px] overflow-hidden rounded-2xl border border-mint/30 bg-mint/[0.04] p-4">
    <div class="pointer-events-none select-none blur-[6px]" aria-hidden="true">
      <p class="text-sm font-semibold text-mint">The AI's read on {title.toLowerCase()}</p>
      <p class="mt-1 text-sm leading-relaxed text-soft">Bitcoin sits in a healthy zone without overheating, and the surrounding signals point to patience over chasing — a plain-language take, generated for you on demand.</p>
    </div>
    <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-panel/40 text-center backdrop-blur-[2px]">
      {#if browser}
        <div class="h-11 w-11" aria-hidden="true"><DotLottieSvelte src="/Ai.lottie" loop autoplay /></div>
      {:else}
        <span class="flex h-11 w-11 items-center justify-center rounded-full bg-mint/15"><Sparkles class="h-5 w-5 text-mint" /></span>
      {/if}
      <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-mint"><Lock class="h-3 w-3" /> AI interpretation</span>
      <p class="max-w-xs px-4 text-[13px] text-soft">Ask the AI to explain this module in plain language.</p>
      <a href="/pricing" class="btn-primary mt-0.5 px-4 py-1.5 text-sm">Unlock with Premium <ArrowRight class="h-4 w-4" /></a>
    </div>
  </div>
{:else if $aiUsage?.allowed && $aiUsage.enabled}
  <div class="rounded-2xl border border-edge bg-panel-2/40 p-4">
    {#if read}
      <div class="flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><Sparkles class="h-3.5 w-3.5 text-mint" /> AI interpretation</span>
        <button type="button" class="text-[11px] font-medium text-accent hover:underline disabled:opacity-50" onclick={ask} disabled={busy || $aiUsage.remaining === 0}>{busy ? '…' : 'Ask again'}</button>
      </div>
      <p class="mt-1.5 text-[15px] font-semibold leading-snug {stanceText[read.stance] ?? 'text-strong'}">{read.headline}</p>
      <p class="mt-1 text-sm leading-relaxed text-soft" transition:slide={{ duration: 150 }}>{read.body}</p>
    {:else}
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-strong"><Sparkles class="h-4 w-4 text-mint" /> Ask AI to interpret this</p>
          <p class="mt-0.5 text-xs text-muted">Get a plain-language read of {title.toLowerCase()}.{remainingLabel ? ` ${remainingLabel}.` : ''}</p>
        </div>
        <button type="button" class="btn-primary shrink-0" onclick={ask} disabled={busy || $aiUsage.remaining === 0 || payloadSignals.length === 0}>
          {busy ? 'Thinking…' : 'Interpret with AI'}
        </button>
      </div>
      {#if $aiUsage.remaining === 0}
        <p class="mt-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-xs text-warn">You've used all your AI interpretations this month. They reset next month — or <a href="/pricing" class="underline">upgrade</a> for more.</p>
      {/if}
    {/if}
    {#if error}<p class="mt-2 text-xs text-danger">{error}</p>{/if}
  </div>
{/if}
