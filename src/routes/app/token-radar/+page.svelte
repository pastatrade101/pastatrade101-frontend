<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { Crosshair, Search, ExternalLink, AlertTriangle, Info, ShieldCheck, Loader, TrendingUp, Activity, Wallet, Landmark, BarChart3, Globe, Timer, Coins, Users, Sparkles, Gauge, Zap, Lock } from '@lucide/svelte';
  import { api } from '$lib/api';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Any = any;
  interface Chain { slug: string; name: string; native: string; type: string; status: 'active' | 'limited' | 'coming_soon'; popular: boolean }

  let chains = $state<Chain[]>([]);
  let allowance = $state<{ limit: number | null; used: number; remaining: number | null } | null>(null);
  let chain = $state('bsc');
  let input = $state('');
  let error = $state('');
  let premium = $state(false);

  let analyzing = $state(false);
  let stepIdx = $state(0);
  let report = $state<Any>(null);
  let matches = $state<Any[] | null>(null);
  let chainChoices = $state<{ slug: string; name: string; liquidity_usd: number }[] | null>(null);
  let limitInfo = $state<{ limit: number; used: number; required_plan: string } | null>(null);

  // ── Searchable grouped network selector ──
  let pickerOpen = $state(false);
  let pickerSearch = $state('');
  const selected = $derived(chain === 'auto' ? null : chains.find((c) => c.slug === chain) ?? null);
  const filtered = $derived(pickerSearch ? chains.filter((c) => c.name.toLowerCase().includes(pickerSearch.toLowerCase()) || c.slug.includes(pickerSearch.toLowerCase())) : chains);
  const groups = $derived([
    { label: 'Popular', items: filtered.filter((c) => c.popular) },
    { label: 'EVM Chains', items: filtered.filter((c) => !c.popular && c.type === 'evm' && c.status !== 'coming_soon') },
    { label: 'Non-EVM Chains', items: filtered.filter((c) => !c.popular && c.type !== 'evm' && c.status !== 'coming_soon') },
    { label: 'Coming Soon', items: filtered.filter((c) => !c.popular && c.status === 'coming_soon') }
  ].filter((g) => g.items.length));
  const badge = (s: Chain['status']) => (s === 'active' ? 'Full support' : s === 'limited' ? 'Limited support' : 'Coming soon');
  const badgeCls = (s: Chain['status']) => (s === 'active' ? 'bg-mint/15 text-mint' : s === 'limited' ? 'bg-warn/15 text-warn' : 'bg-edge text-muted');
  const pickChainSlug = (c: Chain) => {
    if (c.status === 'coming_soon') return;
    chain = c.slug;
    pickerOpen = false;
    pickerSearch = '';
  };

  const STEPS = ['Resolving token', 'Fetching DEX markets', 'Checking holders', 'Reading contract risk', 'Finding exchange listings', 'Calculating scores', 'Building report'];
  let stepTimer: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    try {
      const d = await api<{ chains: Chain[]; allowance: typeof allowance }>('/token-radar/chains', { auth: true });
      chains = d.chains;
      allowance = d.allowance;
      premium = allowance?.limit == null || allowance.limit >= 30;
      if (chains.length && !chains.find((c) => c.slug === chain)) chain = chains[0].slug;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load networks.';
    }
  });

  const runSteps = () => {
    stepIdx = 0;
    stepTimer = setInterval(() => {
      if (stepIdx < STEPS.length - 1) stepIdx += 1;
    }, 650);
  };
  const stopSteps = () => {
    if (stepTimer) clearInterval(stepTimer);
    stepTimer = null;
  };

  let exTab = $state<'all' | 'dex' | 'cex'>('all');
  let exShowAll = $state(false);

  const analyze = async (chosen?: string, fresh = false) => {
    const value = (chosen ?? input).trim();
    error = '';
    if (!chain) return (error = 'Please select a network.');
    if (!value) return (error = 'Please enter a token address or ticker.');
    analyzing = true;
    report = null;
    matches = null;
    chainChoices = null;
    limitInfo = null;
    exTab = 'all';
    exShowAll = false;
    runSteps();
    try {
      const d = await api<{ status: string; report?: Any; matches?: Any[]; options?: Any[]; limit?: number; used?: number; required_plan?: string; message?: string }>('/token-radar/analyze', {
        method: 'POST',
        auth: true,
        body: { chain, input: value, fresh }
      });
      if (d.status === 'completed') {
        report = d.report;
        // Quota counts distinct coins/day (cached hits of a new coin consume too)
        // — refresh the allowance from the server instead of guessing locally.
        void api<{ allowance: typeof allowance }>('/token-radar/chains', { auth: true }).then((r) => (allowance = r.allowance)).catch(() => {});
      } else if (d.status === 'matches') {
        matches = d.matches ?? [];
      } else if (d.status === 'chains') {
        chainChoices = d.options ?? [];
      } else if (d.status === 'limit') {
        limitInfo = { limit: d.limit ?? 1, used: d.used ?? 0, required_plan: d.required_plan ?? 'premium' };
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
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const ratingTheme = (r: string) =>
    r === 'Strong Opportunity' ? { pill: 'bg-mint/15 text-mint border-mint/40', dot: 'bg-mint', tone: 'good' }
    : r === 'Good Watchlist Candidate' ? { pill: 'bg-mint/10 text-mint border-mint/30', dot: 'bg-mint', tone: 'good' }
    : r === 'Neutral / Wait for Confirmation' ? { pill: 'bg-warn/15 text-warn border-warn/40', dot: 'bg-warn', tone: 'mid' }
    : r === 'Weak Setup' ? { pill: 'bg-orange-500/15 text-orange-400 border-orange-500/40', dot: 'bg-orange-400', tone: 'bad' }
    : r === 'High Risk / Avoid for Now' ? { pill: 'bg-danger/15 text-danger border-danger/40', dot: 'bg-danger', tone: 'bad' }
    : { pill: 'bg-edge text-muted border-edge', dot: 'bg-muted', tone: 'na' };

  const state3 = (n: number | null, invert = false): 'good' | 'mid' | 'bad' | 'na' => {
    if (n == null) return 'na';
    if (invert) return n <= 35 ? 'good' : n <= 60 ? 'mid' : 'bad';
    return n >= 65 ? 'good' : n >= 45 ? 'mid' : 'bad';
  };
  const dotCls = (s: string) => (s === 'good' ? 'bg-mint' : s === 'mid' ? 'bg-warn' : s === 'bad' ? 'bg-danger' : 'bg-muted');
  const textCls = (s: string) => (s === 'good' ? 'text-mint' : s === 'mid' ? 'text-warn' : s === 'bad' ? 'text-danger' : 'text-muted');
  const barCls = (s: string) => (s === 'good' ? 'bg-mint' : s === 'mid' ? 'bg-warn' : s === 'bad' ? 'bg-danger' : 'bg-edge');

  const INTERP: Record<string, [string, string, string]> = {
    Risk: ['Low risk', 'Moderate risk', 'Elevated risk'],
    Momentum: ['Improving', 'Needs confirmation', 'Weak'],
    Liquidity: ['Healthy', 'Acceptable', 'Thin'],
    'Holder Health': ['Well distributed', 'Moderate', 'Concentrated'],
    'Contract Safety': ['Above average', 'Acceptable', 'Risky'],
    Timing: ['Supportive', 'Mixed', 'Headwind'],
    'Listing Strength': ['Strong access', 'Moderate', 'Limited']
  };
  const interp = (label: string, v: number | null, invert = false) => {
    if (v == null) return 'Unavailable';
    const st = state3(v, invert);
    const t = INTERP[label];
    return t ? (st === 'good' ? t[0] : st === 'mid' ? t[1] : t[2]) : '';
  };
  const TIP: Record<string, string> = {
    Risk: 'Downside risk from weak liquidity, poor holder distribution, suspicious contract features, low activity, and bad market conditions.',
    Momentum: 'Whether price, volume, and transaction activity are improving.',
    Liquidity: 'Available trading liquidity — but must be confirmed by real activity.',
    'Holder Health': 'Holder count, wallet concentration, and ownership distribution. Weight depends on holder-data source confidence.',
    'Contract Safety': 'Contract risks such as honeypot, tax, mint, blacklist, owner control, and verification.',
    Timing: 'Broader market support from BTC regime, altcoin environment, and macro conditions.',
    'Listing Strength': 'How widely the token is listed across DEXs and CEXs, weighted by real volume.'
  };

  const SUB_SCORES = $derived(
    report
      ? [
          { label: 'Risk', v: report.scores.risk, invert: true },
          { label: 'Momentum', v: report.scores.momentum, invert: false },
          { label: 'Liquidity', v: report.scores.liquidity, invert: false },
          { label: 'Holder Health', v: report.scores.holder_health, invert: false },
          { label: 'Contract Safety', v: report.scores.contract_safety, invert: false },
          { label: 'Timing', v: report.scores.timing, invert: false },
          { label: 'Listing Strength', v: report.exchanges?.listingStrengthScore ?? null, invert: false }
        ]
      : []
  );

  // Market snapshot mini-cards (real data + honest status dots)
  const METRICS = $derived.by(() => {
    if (!report) return [] as Any[];
    const t = report.token;
    const fdvRatio = t.fdv && t.market_cap ? t.fdv / t.market_cap : null;
    const volSt = t.volume_24h == null ? 'na' : t.volume_24h < 100 ? 'bad' : t.volume_24h < 50_000 ? 'mid' : 'good';
    const ageSt = t.age_days == null ? 'na' : t.age_days < 7 ? 'bad' : t.age_days < 30 ? 'mid' : 'good';
    const hConf = report.holder?.confidence;
    const holderSt = report.holder?.count == null ? 'na' : report.holder?.verified ? (hConf === 'high' ? 'good' : 'mid') : 'bad';
    return [
      { label: 'Price', value: fmtPrice(t.price), icon: Coins, st: 'na', hint: '' },
      { label: 'Market Cap', value: fmtUsd(t.market_cap), icon: BarChart3, st: 'na', hint: '' },
      { label: 'FDV', value: fmtUsd(t.fdv), icon: Landmark, st: fdvRatio && fdvRatio > 3 ? 'mid' : 'na', hint: fdvRatio && fdvRatio > 3 ? `High dilution (${fdvRatio.toFixed(1)}× cap)` : '' },
      { label: 'Liquidity', value: fmtUsd(t.liquidity), icon: Wallet, st: state3(report.scores.liquidity), hint: interp('Liquidity', report.scores.liquidity) },
      { label: '24h Volume', value: fmtUsd(t.volume_24h), icon: Activity, st: volSt, hint: volSt === 'bad' ? 'Inactive' : volSt === 'mid' ? 'Moderate' : 'Active' },
      { label: 'Holders', value: t.holders != null ? Number(t.holders).toLocaleString() : '—', icon: Users, st: holderSt, hint: report.holder?.count == null ? 'Unavailable' : `${report.holder?.verified ? 'Verified' : 'Unverified'} ${cap(hConf ?? '')}` },
      { label: 'Age', value: t.age_days != null ? `${t.age_days}d` : '—', icon: Timer, st: ageSt, hint: ageSt === 'bad' ? 'Very new' : ageSt === 'mid' ? 'Young' : '' }
    ];
  });

  const drivers = $derived.by(() => {
    if (!report) return [] as Any[];
    const s = report.scores;
    const chip = (k: string, st: string) => ({ k, word: st === 'good' ? 'Positive' : st === 'mid' ? 'Mixed' : st === 'bad' ? 'Weak' : '—', st });
    const d = [chip('Liquidity', state3(s.liquidity)), chip('Momentum', state3(s.momentum)), chip('Timing', state3(s.timing))];
    if (s.contract_safety != null) d.push(chip('Contract', state3(s.contract_safety)));
    d.push({ k: 'Holders', word: report.holder?.verified ? 'Verified' : 'Unverified', st: report.holder?.verified ? 'good' : 'mid' });
    return d;
  });

  const sources = $derived.by(() => {
    if (!report) return [] as string[];
    const s = new Set<string>(['DEXScreener']);
    if (report.exchanges?.cexListings?.length) s.add('CoinGecko');
    const hs = report.holder?.source;
    if (hs === 'moralis') s.add('Moralis');
    if (hs === 'covalent') s.add('Covalent');
    s.add('GoPlus');
    return [...s];
  });
  const genTime = $derived(report?.created_at ? new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

  // Exchange panel
  const exAll = $derived(report?.exchanges ? [...(report.exchanges.dexListings ?? []), ...(report.exchanges.cexListings ?? [])].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)) : []);
  const exList = $derived(exTab === 'dex' ? (report?.exchanges?.dexListings ?? []) : exTab === 'cex' ? (report?.exchanges?.cexListings ?? []) : exAll);
  const exShown = $derived(exShowAll ? exList : exList.slice(0, 5));
  const topMarket = $derived(exAll[0] ?? null);
  const setTab = (t: 'all' | 'dex' | 'cex') => { exTab = t; exShowAll = false; };
  const trustDot = (t?: string) => (t === 'high' ? 'text-mint' : t === 'medium' ? 'text-warn' : t === 'low' ? 'text-danger' : 'text-muted');
  const sevIcon = (s: string) => (s === 'critical' ? 'text-danger' : s === 'high' ? 'text-orange-400' : s === 'medium' ? 'text-warn' : 'text-muted');

  // Donut geometry for the main opportunity score
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const dash = (v: number | null) => `${(CIRC * (v ?? 0)) / 100} ${CIRC}`;

  // Count-up for the big score number (syncs with the donut draw-in).
  let displayOpp = $state(0);
  $effect(() => {
    const target = report?.scores?.opportunity;
    if (target == null) {
      displayOpp = 0;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      displayOpp = Math.round(target * (1 - Math.pow(1 - p, 3))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const HERO_GRAD = 'background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #047857 100%)';
  const PREMIUM_CARD = 'card rounded-2xl shadow-[0_14px_34px_-18px_rgba(2,6,23,0.35)]';
</script>

<div class="max-w-7xl space-y-4">
  <!-- 1 · Hero -->
  <div class="relative overflow-hidden rounded-2xl px-5 py-6 text-white shadow-[0_18px_40px_-20px_rgba(2,6,23,0.5)]" style={HERO_GRAD}>
    <div class="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5 blur-2xl"></div>
    <div class="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur"><Crosshair class="h-6 w-6" /></div>
        <div>
          <h1 class="text-2xl font-bold tracking-tight sm:text-[28px]">Token Position Radar</h1>
          <p class="mt-0.5 max-w-xl text-sm text-white/70">Institutional-style token analysis using liquidity, momentum, holder confidence, exchange listings, contract risk, and market timing.</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
        <div class="flex flex-wrap gap-1.5">
          <span class="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-white/15">● Live Scan</span>
          <span class="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-white/15">Multi-source Data</span>
          {#if premium}<span class="rounded-full bg-mint/20 px-2.5 py-1 text-[11px] font-semibold text-mint ring-1 ring-mint/30">Premium</span>{/if}
        </div>
        {#if allowance && allowance.limit !== null}
          <span class="text-[11px] text-white/60">Scans today: {allowance.used}/{allowance.limit}</span>
        {/if}
      </div>
    </div>
  </div>

  <!-- 2 · Input -->
  <div class={PREMIUM_CARD}>
    <div class="grid gap-3 sm:grid-cols-[200px_1fr_auto]">
      <div class="relative block text-xs text-muted">
        Network
        <button type="button" class="input mt-1 flex w-full items-center justify-between gap-2 text-left" onclick={() => (pickerOpen = !pickerOpen)}>
          <span class="truncate text-sm text-strong">{chain === 'auto' ? '🔍 Auto-detect' : (selected?.name ?? 'Select network')}</span>
          {#if selected}<span class="pill shrink-0 {badgeCls(selected.status)} text-[10px]">{badge(selected.status)}</span>{/if}
        </button>
        {#if pickerOpen}
          <button type="button" aria-label="Close" class="fixed inset-0 z-10 cursor-default" onclick={() => (pickerOpen = false)}></button>
          <div class="absolute z-20 mt-1 max-h-80 w-full min-w-[260px] overflow-y-auto rounded-xl border border-edge bg-panel shadow-xl">
            <div class="sticky top-0 bg-panel p-2"><input bind:value={pickerSearch} placeholder="Search network…" class="input-sm w-full" /></div>
            <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-soft hover:bg-panel-2" onclick={() => { chain = 'auto'; pickerOpen = false; pickerSearch = ''; }}>🔍 Auto-detect <span class="text-[10px] text-muted">paste an address, we find the network</span></button>
            {#each groups as g}
              <p class="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{g.label}</p>
              {#each g.items as c}
                <button type="button" class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm {c.status === 'coming_soon' ? 'cursor-not-allowed opacity-50' : 'hover:bg-panel-2'} {c.slug === chain ? 'bg-panel-2' : ''}" disabled={c.status === 'coming_soon'} onclick={() => pickChainSlug(c)}>
                  <span class="truncate text-soft">{c.name} <span class="text-[10px] text-muted">{c.native}</span></span>
                  <span class="pill shrink-0 {badgeCls(c.status)} text-[10px]">{badge(c.status)}</span>
                </button>
              {/each}
            {/each}
          </div>
        {/if}
      </div>
      <label class="block text-xs text-muted">Token address or ticker
        <input bind:value={input} onkeydown={(e) => e.key === 'Enter' && analyze()} placeholder="0x… / PEPE" class="input mt-1 w-full font-mono" />
      </label>
      <div class="flex items-end">
        <button class="btn-primary w-full bg-gradient-to-r from-mint to-accent sm:w-auto" disabled={analyzing} onclick={() => analyze()}>
          {#if analyzing}<Loader class="h-4 w-4 animate-spin" />{:else}<Search class="h-4 w-4" />{/if} Analyze Token
        </button>
      </div>
    </div>
    <p class="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Info class="h-3 w-3" />For accurate analysis, paste the token contract address. Tickers can have fake duplicates.</p>
    {#if selected?.status === 'limited'}
      <p class="mt-1.5 rounded-lg border border-warn/30 bg-warn/5 px-3 py-1.5 text-[11px] text-warn">Some analysis fields may be unavailable on this network. The report will use available data and reduce confidence where data is missing.</p>
    {/if}
    {#if error}<p class="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>{/if}
  </div>

  <!-- Loading (premium staged steps + skeleton) -->
  {#if analyzing}
    <div class={PREMIUM_CARD}>
      <p class="mb-3 flex items-center gap-2 text-sm font-medium text-soft"><Sparkles class="h-4 w-4 text-accent" />Generating intelligence report…</p>
      <ul class="grid gap-1.5 sm:grid-cols-2">
        {#each STEPS as s, i}
          <li class="flex items-center gap-2 text-sm {i < stepIdx ? 'text-mint' : i === stepIdx ? 'text-soft' : 'text-muted/60'}">
            {#if i < stepIdx}<ShieldCheck class="h-3.5 w-3.5" />{:else if i === stepIdx}<Loader class="h-3.5 w-3.5 animate-spin" />{:else}<span class="inline-block h-1.5 w-1.5 rounded-full bg-muted/40"></span>{/if}{s}
          </li>
        {/each}
      </ul>
      <div class="mt-4 grid gap-3 sm:grid-cols-4">{#each Array(4) as _}<div class="h-16 animate-pulse rounded-xl bg-panel-2"></div>{/each}</div>
    </div>
  {/if}

  <!-- Daily limit reached → upgrade CTA -->
  {#if limitInfo}
    <div class="relative overflow-hidden rounded-2xl p-[1px] shadow-[0_18px_40px_-20px_rgba(2,6,23,0.4)]" style="background: linear-gradient(135deg, rgba(55,224,166,0.55), rgba(91,140,255,0.55))">
      <div class="rounded-2xl bg-panel px-5 py-6">
        <div class="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-mint/20 to-accent/20 ring-1 ring-mint/30">
            <Lock class="h-6 w-6 text-mint" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-lg font-bold text-strong">You've used today's {limitInfo.limit === 1 ? 'free scan' : `${limitInfo.limit} scans`} 🎯</p>
            <p class="mt-1 text-sm leading-relaxed text-soft">
              Your plan includes <span class="font-semibold text-strong">{limitInfo.limit} token scan{limitInfo.limit === 1 ? '' : 's'} per day</span> — and today's {limitInfo.limit === 1 ? 'is' : 'are'} already working for you.
              Upgrade to <span class="font-semibold capitalize text-mint">{limitInfo.required_plan}</span> and keep scanning: more coins, deeper holder intelligence, and full market access on every report.
            </p>
            <div class="mt-2.5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {#each ['Up to 30 scans / day', 'All 24 networks', 'Verified holder data', 'Exchange listings & market access'] as perk}
                <span class="pill bg-panel-2 text-soft"><span class="mr-1 text-mint">✓</span>{perk}</span>
              {/each}
            </div>
          </div>
          <div class="flex shrink-0 flex-col items-center gap-1.5">
            <a href="/pricing" class="btn-primary bg-gradient-to-r from-mint to-accent px-5 py-2.5 text-sm font-semibold shadow-lg">
              <Zap class="h-4 w-4" /> Upgrade to <span class="capitalize">{limitInfo.required_plan}</span>
            </a>
            <span class="text-[10px] text-muted">Resets at midnight UTC · re-scanning today's coin stays free</span>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Multi-chain chooser -->
  {#if chainChoices}
    <div class={PREMIUM_CARD}>
      <p class="stat-label mb-2">This address exists on multiple networks — pick one</p>
      <p class="mb-3 text-xs text-muted">The same contract address can be deployed on several chains (sometimes by copycats). The network with real liquidity is usually the original.</p>
      <div class="flex flex-wrap gap-2">
        {#each chainChoices as o}
          <button type="button" class="rounded-xl border border-edge bg-panel-2 px-3 py-2 text-left text-sm transition hover:border-mint/40" onclick={() => { chain = o.slug; void analyze(); }}>
            <span class="font-medium text-strong">{o.name}</span><span class="block text-[11px] text-muted">top liquidity {fmtUsd(o.liquidity_usd)}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Ticker matches -->
  {#if matches}
    <div class={PREMIUM_CARD}>
      <p class="stat-label mb-2">Multiple tokens matched — pick the exact one</p>
      <p class="mb-3 text-xs text-muted">Tickers aren't unique. Choose the token you meant (highest liquidity first), or paste the contract address instead.</p>
      <div class="space-y-2">
        {#each matches as m}
          <button class="flex w-full items-center justify-between gap-3 rounded-xl border border-edge bg-panel-2 px-3 py-2 text-left transition hover:border-mint/40" onclick={() => pickMatch(m)}>
            <div class="min-w-0"><p class="truncate text-sm font-medium text-strong">{m.name} <span class="text-muted">{m.symbol}</span></p><p class="truncate font-mono text-[11px] text-muted">{short(m.address)} · {m.dex}</p></div>
            <div class="shrink-0 text-right text-xs"><div class="text-soft">Liq {fmtUsd(m.liquidity_usd)}</div><div class="text-muted">Vol {fmtUsd(m.volume_24h)}</div></div>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Empty state -->
  {#if !report && !analyzing && !matches && !chainChoices && !limitInfo}
    <div class="rounded-2xl border border-dashed border-edge bg-panel-2/40 px-6 py-10 text-center">
      <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent"><Crosshair class="h-6 w-6" /></div>
      <p class="text-sm font-medium text-soft">Paste a token address to generate a full Token Position Radar report.</p>
      <div class="mt-3 flex flex-wrap justify-center gap-1.5">
        {#each ['Liquidity', 'Holders', 'Contract Risk', 'Exchange Listings', 'Market Timing'] as c}<span class="pill bg-panel-2 text-muted">{c}</span>{/each}
      </div>
    </div>
  {/if}

  <!-- ─── REPORT ─── -->
  {#if report}
    {@const t = report.token}
    {@const rt = ratingTheme(report.rating)}

    <!-- 3 · Token Overview + Final Rating -->
    <div in:fly={{ y: 18, duration: 450 }} class="{PREMIUM_CARD} grid gap-4 bg-gradient-to-br from-panel to-panel-2/70 lg:grid-cols-[1fr_auto] lg:items-center">
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-lg font-bold text-accent ring-1 ring-accent/20">{(t.symbol ?? t.name ?? '?').slice(0, 3).toUpperCase()}</div>
        <div class="min-w-0">
          <h2 class="truncate text-xl font-bold text-strong">{t.name ?? 'Unknown'} <span class="text-sm font-medium text-muted">{t.symbol ?? ''}</span></h2>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span class="pill bg-panel-2 text-soft">{t.chain_name}</span>
            <a href={t.explorer_url} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 font-mono hover:text-mint">{short(t.address)}<ExternalLink class="h-3 w-3" /></a>
            {#if t.pair_url}<a href={t.pair_url} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 hover:text-mint">{t.dex}<ExternalLink class="h-3 w-3" /></a>{/if}
            {#if report.holder?.verified}<span class="pill bg-mint/15 text-mint">Holder data verified</span>{:else if report.holder?.count != null}<span class="pill bg-warn/15 text-warn">Holder data unverified</span>{/if}
          </div>
          <p class="mt-1.5 text-[11px] text-muted">{report.cached ? 'Cached scan' : 'Fresh scan'} · Generated {genTime} · Sources: {sources.join(', ')}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 lg:flex-col lg:items-end">
        <span class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold {rt.pill}"><span class="h-2 w-2 rounded-full {rt.dot}"></span>{report.rating}</span>
        <span class="text-[11px] text-muted">Suggested: {report.action_label}</span>
      </div>
    </div>

    <!-- Data quality warning -->
    {#if report.data_quality_warnings?.length}
      <div in:fly={{ y: 18, duration: 450, delay: 80 }} class="{PREMIUM_CARD} border-warn/40 bg-warn/[0.06]">
        <p class="stat-label flex items-center gap-1.5 text-warn"><AlertTriangle class="h-3.5 w-3.5" />Data Quality Warning</p>
        <ul class="mt-1.5 space-y-1 text-sm text-soft">{#each report.data_quality_warnings as w}<li class="flex gap-1.5">⚠️ <span>{w}</span></li>{/each}</ul>
      </div>
    {/if}

    <!-- 4 · Why this rating -->
    {#if report.rating_explanation}
      <div in:fly={{ y: 18, duration: 450, delay: 140 }} class="{PREMIUM_CARD} border-l-[3px] {rt.tone === 'good' ? 'border-l-mint/60' : rt.tone === 'mid' ? 'border-l-warn/60' : 'border-l-danger/60'}">
        <p class="stat-label flex items-center gap-1.5"><Info class="h-3.5 w-3.5 text-accent" />Why this rating</p>
        <p class="mt-1.5 text-sm leading-relaxed text-soft">{report.rating_explanation}</p>
        <div class="mt-2.5 flex flex-wrap gap-1.5">
          {#each drivers as d}<span class="inline-flex items-center gap-1 rounded-full bg-panel-2 px-2.5 py-1 text-[11px] font-medium"><span class="h-1.5 w-1.5 rounded-full {dotCls(d.st)}"></span>{d.k}: <span class={textCls(d.st)}>{d.word}</span></span>{/each}
        </div>
      </div>
    {/if}

    <!-- 5 · Market Snapshot -->
    <div in:fly={{ y: 18, duration: 450, delay: 200 }}>
      <p class="stat-label mb-2 px-1">Market Snapshot</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {#each METRICS as m, i}
          {@const Icon = m.icon}
          <div in:fly={{ y: 14, duration: 400, delay: 260 + i * 50 }} class="{PREMIUM_CARD} p-3.5">
            <div class="flex items-center justify-between text-muted"><Icon class="h-3.5 w-3.5" />{#if m.st !== 'na'}<span class="h-1.5 w-1.5 rounded-full {dotCls(m.st)}"></span>{/if}</div>
            <div class="mt-1.5 text-[11px] uppercase tracking-wide text-muted">{m.label}</div>
            <div class="mt-0.5 text-lg font-bold text-strong">{m.value}</div>
            {#if m.hint}<div class="mt-0.5 text-[10px] {m.st === 'na' ? 'text-muted' : textCls(m.st)}">{m.hint}</div>{/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- 6 · Score Intelligence -->
      <div in:fly={{ y: 18, duration: 450, delay: 420 }} class={PREMIUM_CARD}>
        <p class="stat-label mb-3 flex items-center gap-1.5"><Gauge class="h-3.5 w-3.5 text-accent" />Score Intelligence</p>
        <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <!-- Opportunity donut -->
          <div class="relative h-32 w-32 shrink-0">
            <svg viewBox="0 0 120 120" class="h-32 w-32 -rotate-90">
              <circle cx="60" cy="60" r={R} fill="none" class="text-muted/25" stroke="currentColor" stroke-width="10" />
              <circle cx="60" cy="60" r={R} fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray={dash(report.scores.opportunity)} class="donut-anim {textCls(state3(report.scores.opportunity))}" stroke="currentColor" />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-2xl font-extrabold {textCls(state3(report.scores.opportunity))}">{report.scores.opportunity != null ? displayOpp : '—'}</span>
              <span class="text-[10px] text-muted">/100</span>
            </div>
          </div>
          <div class="min-w-0 flex-1 text-center sm:text-left">
            <p class="text-xs uppercase tracking-wide text-muted">Opportunity Score</p>
            <p class="text-sm font-semibold text-strong">{report.rating}</p>
            <p class="mt-1 text-[11px] text-muted">Confidence <span class="font-semibold {textCls(state3(report.confidence.combined))}">{report.confidence.combined}/100</span></p>
            <p class="mt-1 text-[11px] leading-relaxed text-muted">Blends liquidity, momentum, holder health, contract safety and market timing.</p>
          </div>
        </div>
        <div class="mt-4 space-y-2.5 border-t border-edge pt-4">
          {#each SUB_SCORES as row, i}
            {@const st = state3(row.v, row.invert)}
            <div>
              <div class="mb-0.5 flex items-center justify-between text-xs">
                <span class="cursor-help text-muted" title={TIP[row.label] ?? ''}>{row.label}</span>
                <span class="font-semibold {textCls(st)}">{row.v ?? 'n/a'}{row.v != null ? '/100' : ''} {#if row.v != null}<span class="ml-1 font-normal text-muted">· {interp(row.label, row.v, row.invert)}</span>{/if}</span>
              </div>
              <div class="meter"><div class="meter-fill bar-anim {barCls(st)}" style="width: {row.v ?? 0}%; animation-delay: {520 + i * 80}ms"></div></div>
            </div>
          {/each}
        </div>
      </div>

      <!-- 10 · Radar Summary / Insights -->
      <div in:fly={{ y: 18, duration: 450, delay: 500 }} class="space-y-3">
        <div class="{PREMIUM_CARD} border-l-[3px] border-l-accent/50">
          <p class="stat-label flex items-center gap-1.5"><Sparkles class="h-3.5 w-3.5 text-accent" />Radar Summary</p>
          <p class="mt-1.5 text-sm leading-relaxed text-soft">{report.summary}</p>
          <p class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-panel-2 px-2.5 py-1 text-xs"><Zap class="h-3 w-3 text-accent" />Suggested action: <span class="font-medium text-soft">{report.action_label}</span></p>
        </div>
        {#if report.positives?.length}
          <div class="{PREMIUM_CARD} border-l-[3px] border-l-mint/50">
            <p class="stat-label flex items-center gap-1.5 text-mint"><TrendingUp class="h-3.5 w-3.5" />Positive Signals</p>
            <ul class="mt-1.5 space-y-1 text-sm text-soft">{#each report.positives as p}<li class="flex gap-1.5"><span class="text-mint">✓</span><span>{p}</span></li>{/each}</ul>
          </div>
        {/if}
        {#if report.warnings?.length}
          <div class="{PREMIUM_CARD} border-l-[3px] border-l-warn/50">
            <p class="stat-label flex items-center gap-1.5 text-warn"><AlertTriangle class="h-3.5 w-3.5" />Risk Signals</p>
            <ul class="mt-1.5 space-y-1.5 text-sm text-soft">{#each report.warnings as w}<li class="flex gap-1.5"><span class={sevIcon(w.severity)}>⚠</span><span><span class="font-medium {sevIcon(w.severity)}">{w.label}:</span> {w.message}</span></li>{/each}</ul>
          </div>
        {/if}
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[5fr_7fr]">
      <!-- 7 · Confidence + 8 · Holder Intelligence -->
      <div in:fly={{ y: 18, duration: 450, delay: 580 }} class="space-y-3">
        <div class={PREMIUM_CARD}>
          <p class="stat-label mb-3 flex items-center gap-1.5"><ShieldCheck class="h-3.5 w-3.5 text-accent" />Confidence Intelligence</p>
          {#each [{ k: 'Data Availability', v: report.confidence.data_availability, tip: 'Whether the required data providers responded.' }, { k: 'Analysis Quality', v: report.confidence.analysis_quality, tip: 'Whether the data is healthy, complete, and reliable enough to trust the conclusion.' }, { k: 'Combined Confidence', v: report.confidence.combined, tip: 'Weighted blend of availability and quality.' }] as c, i}
            <div class="mb-2.5 last:mb-0">
              <div class="mb-0.5 flex items-center justify-between text-xs"><span class="cursor-help text-muted" title={c.tip}>{c.k}</span><span class="font-semibold {textCls(state3(c.v))}">{c.v}/100</span></div>
              <div class="meter"><div class="meter-fill bar-anim {barCls(state3(c.v))}" style="width: {c.v}%; animation-delay: {680 + i * 90}ms"></div></div>
            </div>
          {/each}
          {#if report.confidence.note}<p class="mt-2 text-[11px] leading-relaxed text-muted">{report.confidence.note}</p>{/if}
        </div>

        <div class={PREMIUM_CARD}>
          <p class="stat-label mb-2 flex items-center gap-1.5"><Users class="h-3.5 w-3.5 text-accent" />Holder Intelligence</p>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="rounded-lg bg-panel-2 px-2.5 py-1.5"><div class="text-[10px] text-muted">Holders</div><div class="font-semibold text-strong">{report.holder?.count != null ? Number(report.holder.count).toLocaleString() : '—'}</div></div>
            <div class="rounded-lg bg-panel-2 px-2.5 py-1.5"><div class="text-[10px] text-muted">Source</div><div class="font-semibold text-strong">{cap(report.holder?.source ?? '—')}</div></div>
            <div class="rounded-lg bg-panel-2 px-2.5 py-1.5"><div class="text-[10px] text-muted">Confidence</div><div class="font-semibold {textCls(report.holder?.confidence === 'high' ? 'good' : report.holder?.confidence === 'medium' ? 'mid' : 'bad')}">{cap(report.holder?.confidence ?? '—')}</div></div>
            <div class="rounded-lg bg-panel-2 px-2.5 py-1.5"><div class="text-[10px] text-muted">Score weight</div><div class="font-semibold text-strong">{Math.round((report.holder?.weight_used ?? 0) * 100)}%</div></div>
          </div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#if report.holder?.verified}<span class="pill bg-mint/15 text-mint">Verified holder data</span>{:else if report.holder?.count != null}<span class="pill bg-warn/15 text-warn">Unverified — not used as severe override</span>{/if}
            {#if report.holder?.used_in_final_score}<span class="pill bg-panel-2 text-soft">Used in score</span>{/if}
          </div>
          {#if report.holder?.warning}<p class="mt-2 text-[11px] leading-relaxed text-muted">{report.holder.warning}</p>{/if}
        </div>
      </div>

      <!-- 9 · Exchange Listings & Market Access -->
      {#if report.exchanges}
        {@const ex = report.exchanges}
        <div in:fly={{ y: 18, duration: 450, delay: 660 }} class={PREMIUM_CARD}>
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p class="stat-label flex items-center gap-1.5"><Globe class="h-3.5 w-3.5 text-accent" />Exchange Listings & Market Access</p>
            <span class="pill {ex.listingStrengthScore >= 65 ? 'bg-mint/15 text-mint' : ex.listingStrengthScore >= 45 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger'}">{ex.listingStrengthLabel} · {ex.listingStrengthScore}/100</span>
          </div>
          <div class="mb-3 grid grid-cols-3 gap-2 text-center">
            <div class="rounded-lg bg-panel-2 px-2 py-1.5"><div class="text-base font-bold text-strong">{ex.totalDexListings}</div><div class="text-[10px] text-muted">DEX pairs</div></div>
            <div class="rounded-lg bg-panel-2 px-2 py-1.5"><div class="text-base font-bold text-strong">{ex.totalCexListings}</div><div class="text-[10px] text-muted">CEX markets</div></div>
            <div class="rounded-lg bg-panel-2 px-2 py-1.5"><div class="truncate text-sm font-bold text-strong">{topMarket ? topMarket.exchangeName : '—'}</div><div class="text-[10px] text-muted">top {topMarket ? fmtUsd(topMarket.volume24h) : ''}</div></div>
          </div>
          <div class="mb-2 inline-flex rounded-lg border border-edge p-0.5 text-xs">
            {#each [['all', `All ${exAll.length}`], ['dex', `DEX ${ex.totalDexListings}`], ['cex', `CEX ${ex.totalCexListings}`]] as [k, lbl]}
              <button type="button" class="rounded-md px-2.5 py-1 font-medium transition {exTab === k ? 'bg-accent/15 text-accent' : 'text-muted hover:text-soft'}" onclick={() => setTab(k as Any)}>{lbl}</button>
            {/each}
          </div>
          {#if exShown.length}
            <ul class="space-y-1.5">
              {#each exShown as l}
                <li class="flex items-center justify-between gap-2 rounded-lg bg-panel-2 px-2.5 py-1.5 text-xs">
                  <div class="flex min-w-0 items-center gap-2">
                    {#if l.logoUrl}<img src={l.logoUrl} alt="" loading="lazy" class="h-5 w-5 shrink-0 rounded-full border border-edge bg-panel object-cover" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{:else}<span class="{trustDot(l.trustScore)}">●</span>{/if}
                    <div class="min-w-0">
                      <p class="truncate font-medium text-soft">{l.exchangeName} <span class="text-muted">{l.pair}</span> <span class="pill bg-panel px-1.5 py-0 text-[9px] {l.exchangeType === 'DEX' ? 'text-accent' : 'text-soft'}">{l.exchangeType}</span>{#if l.url}<a href={l.url} target="_blank" rel="noopener noreferrer" class="ml-1 inline-flex text-muted hover:text-mint"><ExternalLink class="h-3 w-3" /></a>{/if}</p>
                      <p class="text-[10px] text-muted">Source: {l.source}{l.trustScore ? ` · trust ${l.trustScore}` : ''}</p>
                    </div>
                  </div>
                  <div class="shrink-0 text-right"><div class="text-soft">Vol {fmtUsd(l.volume24h)}</div>{#if l.liquidityUsd != null}<div class="text-muted">Liq {fmtUsd(l.liquidityUsd)}</div>{/if}</div>
                </li>
              {/each}
            </ul>
            {#if exList.length > 5}
              <button type="button" class="mt-2 text-xs font-medium text-accent hover:underline" onclick={() => (exShowAll = !exShowAll)}>{exShowAll ? 'Show less' : `Show all ${exList.length} ${exTab === 'cex' ? 'CEX ' : exTab === 'dex' ? 'DEX ' : ''}listings`}</button>
            {/if}
          {:else}<p class="text-xs text-muted">No listings in this view.</p>{/if}
          <p class="mt-3 rounded-lg bg-panel-2/60 px-3 py-2 text-[11px] leading-relaxed text-muted"><span class="font-medium text-soft">Listing insight:</span> {ex.totalCexListings > 0 ? `Listed on ${ex.totalCexListings} CEX market${ex.totalCexListings === 1 ? '' : 's'} and ${ex.totalDexListings} DEX pair${ex.totalDexListings === 1 ? '' : 's'}.` : `${ex.totalDexListings} DEX pair${ex.totalDexListings === 1 ? '' : 's'}, no confirmed CEX markets.`} Listing strength improves confidence only when supported by active volume — it does not confirm a token is safe.</p>
        </div>
      {/if}
    </div>

    <!-- 11 · Market Timing Context -->
    {#if report.timing_view}
      <div in:fly={{ y: 18, duration: 450, delay: 740 }} class={PREMIUM_CARD}>
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p class="stat-label flex items-center gap-1.5"><Timer class="h-3.5 w-3.5 text-accent" />Market Timing Context</p>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            {#if report.market_regime}
              <span class="pill {report.market_regime.score >= 60 ? 'bg-mint/15 text-mint' : report.market_regime.score >= 45 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger'}">{report.market_regime.label} · {report.market_regime.score}/100</span>
            {/if}
            <span class="pill bg-panel-2 text-soft">Timing {report.scores.timing ?? '—'}/100</span>
            <span class="pill bg-panel-2 {textCls(state3(report.scores.momentum))}">Momentum {interp('Momentum', report.scores.momentum)}</span>
          </div>
        </div>
        <p class="text-sm leading-relaxed text-soft">{report.timing_view}</p>
        {#if report.market_regime?.warnings?.length}
          <ul class="mt-2 space-y-1 border-t border-edge/60 pt-2 text-xs text-soft">
            {#each report.market_regime.warnings as w}
              <li class="flex gap-1.5"><span class={sevIcon(w.severity)}>⚠</span><span><span class="font-medium {sevIcon(w.severity)}">{w.label}:</span> {w.message}</span></li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <!-- Disclaimer -->
    <div in:fly={{ y: 18, duration: 450, delay: 820 }} class="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] px-3.5 py-2.5 text-xs leading-relaxed text-warn">
      <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span><span class="font-semibold">Educational analysis only.</span> {report.disclaimer} Token markets are volatile, and data can be incomplete or delayed.{report.cached ? ' Cached result (analyzed within the last 30 min).' : ''}</span>
    </div>
  {/if}
</div>

<style>
  /* Report entrance polish: bars grow to their value, the donut draws itself.
     Both respect prefers-reduced-motion (users who opt out get instant state). */
  @media (prefers-reduced-motion: no-preference) {
    .bar-anim {
      animation: bar-in 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .donut-anim {
      animation: donut-in 1100ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
    }
  }
  @keyframes bar-in {
    from {
      width: 0;
    }
  }
  @keyframes donut-in {
    from {
      stroke-dasharray: 0 327; /* 2π × r(52) ≈ 326.7 */
    }
  }
</style>
