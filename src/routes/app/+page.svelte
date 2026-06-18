<script lang="ts">
  import { onMount } from 'svelte';
  import { BarChart3, Bitcoin, CircleDollarSign, Gem, Globe, PieChart, TrendingDown, TrendingUp } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { changeColor, fmtPct, fmtUsd, signalColor } from '$lib/format';
  import Disclaimer from '$lib/components/Disclaimer.svelte';

  interface Mover {
    coingecko_id: string;
    symbol: string;
    name: string;
    image_url: string | null;
    current_price: number;
    price_change_pct_24h: number;
  }
  interface Overview {
    btc_price: number;
    eth_price: number;
    total_market_cap: number;
    total_volume: number;
    btc_dominance: number;
    eth_dominance: number;
    stablecoin_market_cap: number | null;
    market_cap_change_24h: number;
    market_condition: string;
    summary: string;
    top_gainers: Mover[];
    top_losers: Mover[];
    as_of: string;
  }

  let data = $state<Overview | null>(null);
  let error = $state('');
  let loading = $state(true);

  onMount(async () => {
    try {
      data = await api<Overview>('/market/overview');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load market data.';
    } finally {
      loading = false;
    }
  });

  const stats = $derived(
    data
      ? [
          { label: 'BTC Price', value: fmtUsd(data.btc_price), icon: Bitcoin },
          { label: 'ETH Price', value: fmtUsd(data.eth_price), icon: Gem },
          { label: 'Total Market Cap', value: fmtUsd(data.total_market_cap, { compact: true }), icon: Globe },
          { label: '24h Volume', value: fmtUsd(data.total_volume, { compact: true }), icon: BarChart3 },
          { label: 'BTC Dominance', value: `${data.btc_dominance?.toFixed(1)}%`, icon: PieChart },
          { label: 'ETH Dominance', value: `${data.eth_dominance?.toFixed(1)}%`, icon: PieChart },
          { label: 'Stablecoin Cap', value: fmtUsd(data.stablecoin_market_cap, { compact: true }), icon: CircleDollarSign },
          { label: 'Mcap 24h', value: fmtPct(data.market_cap_change_24h), icon: TrendingUp }
        ]
      : []
  );
</script>

<header class="mb-5">
  <h1 class="text-xl font-semibold text-strong">Market Overview</h1>
  <p class="text-sm text-muted">Global conditions and where the market sits in the cycle.</p>
</header>

{#if loading}
  <div class="card text-center text-muted">Loading market data…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">
    {error}
    <p class="mt-1 text-sm text-muted">If this is a fresh install, run a data sync from the Admin panel first.</p>
  </div>
{:else if data}
  <!-- Market condition banner -->
  <div class="card mb-5 border-l-4" style="border-left-color: var(--cond)">
    <div class="flex flex-wrap items-center gap-3">
      <span class="stat-label">Market condition</span>
      <span class="pill {signalColor(data.market_condition)}">{data.market_condition}</span>
    </div>
    <p class="mt-2 text-sm leading-relaxed text-soft">{data.summary}</p>
  </div>

  <!-- Stat grid -->
  <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {#each stats as s}
      <div class="stat-tile">
        <div class="flex items-start justify-between">
          <p class="stat-label">{s.label}</p>
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-mint/10 text-mint">
            <s.icon class="h-4 w-4" />
          </span>
        </div>
        <p class="stat-value mt-1.5 text-xl tracking-tight">{s.value}</p>
      </div>
    {/each}
  </div>

  <!-- Movers -->
  <div class="grid gap-4 md:grid-cols-2">
    {#each [{ title: 'Top Gainers (24h)', list: data.top_gainers, icon: TrendingUp, tone: 'text-mint' }, { title: 'Top Losers (24h)', list: data.top_losers, icon: TrendingDown, tone: 'text-danger' }] as col}
      <div class="card">
        <h2 class="mb-3 flex items-center gap-2 font-semibold text-strong">
          <col.icon class="h-4 w-4 {col.tone}" />
          {col.title}
        </h2>
        <ul class="divide-y divide-edge">
          {#each col.list as coin}
            <li class="flex items-center justify-between py-2">
              <div class="flex items-center gap-2">
                {#if coin.image_url}<img src={coin.image_url} alt="" class="h-5 w-5 rounded-full" />{/if}
                <span class="text-sm font-medium text-strong">{coin.symbol}</span>
                <span class="text-xs text-muted">{coin.name}</span>
              </div>
              <div class="text-right">
                <span class="text-sm text-soft">{fmtUsd(coin.current_price)}</span>
                <span class="ml-2 text-sm {changeColor(coin.price_change_pct_24h)}">{fmtPct(coin.price_change_pct_24h)}</span>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>

  <div class="mt-6"><Disclaimer /></div>
{/if}

<style>
  .card {
    --cond: #5b8cff;
  }
</style>
