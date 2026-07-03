<script lang="ts">
  import { onMount } from 'svelte';
  import { Crosshair, Search, ExternalLink, AlertTriangle, Info, ShieldCheck, Loader } from '@lucide/svelte';
  import { api } from '$lib/api';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Any = any;
  interface Chain { slug: string; name: string; native: string }

  let chains = $state<Chain[]>([]);
  let allowance = $state<{ limit: number | null; used: number; remaining: number | null } | null>(null);
  let chain = $state('bsc');
  let input = $state('');
  let error = $state('');

  let analyzing = $state(false);
  let stepIdx = $state(0);
  let report = $state<Any>(null);
  let matches = $state<Any[] | null>(null);

  const STEPS = ['Detecting token', 'Checking liquidity', 'Reading holder data', 'Checking contract risk', 'Calculating score', 'Preparing report'];
  let stepTimer: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    try {
      const d = await api<{ chains: Chain[]; allowance: typeof allowance }>('/token-radar/chains', { auth: true });
      chains = d.chains;
      allowance = d.allowance;
      if (chains.length && !chains.find((c) => c.slug === chain)) chain = chains[0].slug;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load networks.';
    }
  });

  const runSteps = () => {
    stepIdx = 0;
    stepTimer = setInterval(() => {
      if (stepIdx < STEPS.length - 1) stepIdx += 1;
    }, 700);
  };
  const stopSteps = () => {
    if (stepTimer) clearInterval(stepTimer);
    stepTimer = null;
  };

  const analyze = async (chosen?: string, fresh = false) => {
    const value = (chosen ?? input).trim();
    error = '';
    if (!chain) return (error = 'Please select a network.');
    if (!value) return (error = 'Please enter a token address or ticker.');
    analyzing = true;
    report = null;
    matches = null;
    runSteps();
    try {
      const d = await api<{ status: string; report?: Any; matches?: Any[]; message?: string }>('/token-radar/analyze', {
        method: 'POST',
        auth: true,
        body: { chain, input: value, fresh }
      });
      if (d.status === 'completed') {
        report = d.report;
        allowance = allowance ? { ...allowance, used: allowance.used + (report.cached ? 0 : 1), remaining: allowance.remaining == null ? null : Math.max(0, allowance.remaining - (report.cached ? 0 : 1)) } : allowance;
      } else if (d.status === 'matches') {
        matches = d.matches ?? [];
      } else {
        error = d.message ?? 'Token not found.';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Analysis failed.';
    } finally {
      stopSteps();
      analyzing = false;
    }
  };

  const pickMatch = (m: Any) => {
    input = m.address;
    matches = null;
    void analyze(m.address);
  };

  // ── display helpers ──
  const fmtUsd = (n: number | null) => (n == null ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Number(n).toLocaleString()}`);
  const fmtPrice = (n: number | null) => (n == null ? '—' : n < 0.01 ? `$${n.toPrecision(2)}` : `$${n.toLocaleString(undefined, { maximumFractionDigits: 6 })}`);
  const short = (a: string) => (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
  const ratingColor = (r: string) =>
    r === 'Strong Opportunity' ? 'bg-mint/15 text-mint border-mint/40'
    : r === 'Good Watchlist Candidate' ? 'bg-mint/10 text-mint border-mint/30'
    : r === 'Neutral / Wait for Confirmation' ? 'bg-warn/15 text-warn border-warn/40'
    : r === 'Weak Setup' ? 'bg-orange-500/15 text-orange-400 border-orange-500/40'
    : 'bg-danger/15 text-danger border-danger/40';
  const scoreColor = (n: number | null, invert = false) => {
    if (n == null) return 'text-muted';
    const good = invert ? n <= 35 : n >= 65;
    const mid = invert ? n <= 60 : n >= 45;
    return good ? 'text-mint' : mid ? 'text-warn' : 'text-danger';
  };
  const barColor = (n: number | null, invert = false) => {
    if (n == null) return 'bg-edge';
    const good = invert ? n <= 35 : n >= 65;
    const mid = invert ? n <= 60 : n >= 45;
    return good ? 'bg-mint' : mid ? 'bg-warn' : 'bg-danger';
  };

  const SCORE_ROWS = $derived(
    report
      ? [
          { label: 'Opportunity Score', v: report.scores.opportunity, invert: false },
          { label: 'Risk Score', v: report.scores.risk, invert: true },
          { label: 'Momentum', v: report.scores.momentum, invert: false },
          { label: 'Liquidity', v: report.scores.liquidity, invert: false },
          { label: 'Holder Health', v: report.scores.holder_health, invert: false },
          { label: 'Contract Safety', v: report.scores.contract_safety, invert: false },
          { label: 'Timing', v: report.scores.timing, invert: false },
          { label: 'Confidence', v: report.scores.confidence, invert: false }
        ]
      : []
  );
</script>

<header class="mb-4 flex items-center gap-2">
  <Crosshair class="h-5 w-5 text-accent" />
  <div>
    <h1 class="text-xl font-semibold text-strong">Token Position Radar</h1>
    <p class="text-sm text-muted">Analyze any token using liquidity, holder behavior, volume, risk checks, and market timing.</p>
  </div>
</header>

<!-- Input -->
<div class="card mb-4">
  <div class="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
    <label class="block text-xs text-muted">Network
      <select bind:value={chain} class="input mt-1 w-full">
        {#each chains as c}<option value={c.slug}>{c.name}</option>{/each}
      </select>
    </label>
    <label class="block text-xs text-muted">Token address or ticker
      <input bind:value={input} onkeydown={(e) => e.key === 'Enter' && analyze()} placeholder="0x… / PEPE" class="input mt-1 w-full font-mono" />
    </label>
    <div class="flex items-end">
      <button class="btn-primary w-full sm:w-auto" disabled={analyzing} onclick={() => analyze()}>
        {#if analyzing}<Loader class="h-4 w-4 animate-spin" />{:else}<Search class="h-4 w-4" />{/if} Analyze Token
      </button>
    </div>
  </div>
  <p class="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Info class="h-3 w-3" />For accurate analysis, paste the token contract address. Tickers can have fake duplicates.</p>
  {#if allowance && allowance.limit !== null}
    <p class="mt-1 text-[11px] text-muted">Scans today: <span class="text-soft">{allowance.used}/{allowance.limit}</span>{allowance.remaining === 0 ? ' — limit reached, upgrade for more.' : ''}</p>
  {/if}
  {#if error}<p class="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>{/if}
</div>

<!-- Loading -->
{#if analyzing}
  <div class="card mb-4">
    <p class="mb-3 text-sm font-medium text-soft">Analyzing token data…</p>
    <ul class="space-y-1.5">
      {#each STEPS as s, i}
        <li class="flex items-center gap-2 text-sm {i < stepIdx ? 'text-mint' : i === stepIdx ? 'text-soft' : 'text-muted'}">
          {#if i < stepIdx}<ShieldCheck class="h-3.5 w-3.5" />{:else if i === stepIdx}<Loader class="h-3.5 w-3.5 animate-spin" />{:else}<span class="h-3.5 w-3.5"></span>{/if}
          {s}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<!-- Ticker matches -->
{#if matches}
  <div class="card mb-4">
    <p class="stat-label mb-2">Multiple tokens matched — pick the exact one</p>
    <p class="mb-3 text-xs text-muted">Tickers aren't unique. Choose the token you meant (highest liquidity first), or paste the contract address instead.</p>
    <div class="space-y-2">
      {#each matches as m}
        <button class="flex w-full items-center justify-between gap-3 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-left transition hover:border-mint/40" onclick={() => pickMatch(m)}>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-strong">{m.name} <span class="text-muted">{m.symbol}</span></p>
            <p class="truncate font-mono text-[11px] text-muted">{short(m.address)} · {m.dex}</p>
          </div>
          <div class="shrink-0 text-right text-xs">
            <div class="text-soft">Liq {fmtUsd(m.liquidity_usd)}</div>
            <div class="text-muted">Vol {fmtUsd(m.volume_24h)}</div>
          </div>
        </button>
      {/each}
    </div>
  </div>
{/if}

<!-- Report -->
{#if report}
  {@const t = report.token}
  <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-3">
      <div>
        <h2 class="text-lg font-semibold text-strong">{t.name ?? 'Unknown'} <span class="text-sm text-muted">{t.symbol ?? ''}</span></h2>
        <p class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span class="pill bg-panel-2 text-soft">{t.chain_name}</span>
          <a href={t.explorer_url} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 font-mono hover:text-mint">{short(t.address)}<ExternalLink class="h-3 w-3" /></a>
          {#if t.pair_url}<a href={t.pair_url} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 hover:text-mint">{t.dex}<ExternalLink class="h-3 w-3" /></a>{/if}
        </p>
      </div>
    </div>
    <span class="pill border {ratingColor(report.rating)} px-3 py-1.5 text-sm font-semibold">{report.rating}</span>
  </div>

  <!-- token stats -->
  <div class="card mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
    {#each [['Price', fmtPrice(t.price)], ['Market cap', fmtUsd(t.market_cap)], ['FDV', fmtUsd(t.fdv)], ['Liquidity', fmtUsd(t.liquidity)], ['24h volume', fmtUsd(t.volume_24h)], ['Holders', t.holders != null ? Number(t.holders).toLocaleString() : '—'], ['Age', t.age_days != null ? `${t.age_days}d` : '—']] as [k, v]}
      <div><div class="text-[11px] uppercase tracking-wide text-muted">{k}</div><div class="mt-0.5 font-semibold text-strong">{v}</div></div>
    {/each}
  </div>

  <div class="mb-3 grid gap-3 lg:grid-cols-[1.1fr_1fr]">
    <!-- scores -->
    <div class="card">
      <p class="stat-label mb-3">Scores</p>
      <div class="space-y-2.5">
        {#each SCORE_ROWS as row}
          <div>
            <div class="mb-0.5 flex items-center justify-between text-xs">
              <span class="text-muted">{row.label}</span>
              <span class="font-semibold {scoreColor(row.v, row.invert)}">{row.v ?? 'n/a'}{row.v != null ? '/100' : ''}</span>
            </div>
            <div class="meter"><div class="meter-fill {barColor(row.v, row.invert)}" style="width: {row.v ?? 0}%"></div></div>
          </div>
        {/each}
      </div>
    </div>

    <!-- narrative -->
    <div class="space-y-3">
      <div class="card">
        <p class="stat-label">Summary</p>
        <p class="mt-1 text-sm leading-relaxed text-soft">{report.summary}</p>
        <p class="mt-2 text-xs text-muted">Suggested action: <span class="font-medium text-soft">{report.action_label}</span></p>
      </div>
      {#if report.positives?.length}
        <div class="card">
          <p class="stat-label text-mint">What looks good</p>
          <ul class="mt-1.5 space-y-1 text-sm text-soft">{#each report.positives as p}<li class="flex gap-1.5">✅ <span>{p}</span></li>{/each}</ul>
        </div>
      {/if}
      {#if report.warnings?.length}
        <div class="card border-warn/25 bg-warn/[0.04]">
          <p class="stat-label flex items-center gap-1.5 text-warn"><AlertTriangle class="h-3.5 w-3.5" />Main risks</p>
          <ul class="mt-1.5 space-y-1 text-sm text-soft">{#each report.warnings as w}<li class="flex gap-1.5">⚠️ <span>{w}</span></li>{/each}</ul>
        </div>
      {/if}
    </div>
  </div>

  {#if report.timing_view}
    <div class="card mb-3">
      <p class="stat-label">Timing view</p>
      <p class="mt-1 text-sm leading-relaxed text-soft">{report.timing_view}</p>
      {#if report.confidence_note}<p class="mt-1.5 text-xs text-muted">{report.confidence_note}</p>{/if}
    </div>
  {/if}

  <div class="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-relaxed text-danger">
    <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>{report.disclaimer}{report.cached ? ' · Cached result (analyzed within the last 30 min).' : ''}</span>
  </div>
{/if}
