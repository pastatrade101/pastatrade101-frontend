<script lang="ts">
  // The plain read for one module: a headline and a few sentences summing up the
  // signals the page already shows, written by the fixed rules in $lib/plain-read.
  // Free on every plan, instant, follows the site language.
  import { MessageSquareText } from '@lucide/svelte';
  import { locale } from '$lib/i18n';
  import { buildPlainRead, plainReadFooter, type ReadSignal } from '$lib/plain-read';

  let { signals = [] }: { signals: ReadSignal[] } = $props();

  const lang = $derived($locale === 'sw' ? 'sw' : 'en');
  const read = $derived(buildPlainRead(signals, lang));
  const stanceText: Record<string, string> = { positive: 'text-mint', neutral: 'text-accent', caution: 'text-warn', negative: 'text-danger' };
</script>

{#if read}
  <div class="rounded-2xl border border-edge bg-panel-2/40 p-4">
    <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
      <MessageSquareText class="h-3.5 w-3.5" />
      {lang === 'sw' ? 'Kwa lugha rahisi' : 'Plain read'}
    </span>
    <p class="mt-1.5 text-[15px] font-semibold leading-snug {stanceText[read.stance]}">{read.headline}</p>
    <p class="mt-1 text-sm leading-relaxed text-soft">{read.body}</p>
    <p class="mt-2 text-[11px] text-muted">{plainReadFooter(lang)}</p>
  </div>
{/if}
