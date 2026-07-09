<script lang="ts">
  import { Rocket, ExternalLink, Info, Search, AlertTriangle, Lock } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membershipReady } from '$lib/stores/membership';
  import AiInterpret from '$lib/components/AiInterpret.svelte';
  import AiLottie from '$lib/components/AiLottie.svelte';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Project = any;
  let items = $state<Project[]>([]);
  let disclaimer = $state('This is research data only, not financial advice.');
  let loading = $state(true);
  let error = $state('');
  let started = $state(false);
  let locked = $state(false); // free tier → single-card preview
  let total = $state(0);
  let requiredPlan = $state('Mid');

  let fClass = $state('');
  let fStatus = $state('');
  let search = $state('');
  let category = $state(''); // client-side filter over loaded items (ICO Drops-style)

  const categories = $derived([...new Set(items.map((p) => p.category).filter(Boolean))].sort());
  const shown = $derived(category ? items.filter((p) => p.category === category) : items);

  const load = async () => {
    loading = true;
    error = '';
    try {
      const qs = new URLSearchParams();
      if (fClass) qs.set('classification', fClass);
      if (fStatus) qs.set('status', fStatus);
      if (search) qs.set('search', search);
      const data = await api<{ items: Project[]; disclaimer: string; locked?: boolean; total?: number; required_plan?: string }>(`/ico-projects${qs.toString() ? `?${qs}` : ''}`, { auth: true });
      items = data.items ?? [];
      locked = !!data.locked;
      total = data.total ?? items.length;
      if (data.required_plan) requiredPlan = data.required_plan.charAt(0).toUpperCase() + data.required_plan.slice(1);
      if (data.disclaimer) disclaimer = data.disclaimer;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load projects.';
    } finally {
      loading = false;
    }
  };
  $effect(() => {
    if (!$membershipReady || started) return;
    started = true;
    void load();
  });

  const CLASS_META: Record<string, { light: string; label: string; cls: string; pill: string }> = {
    strong_watchlist: { light: '🟢', label: 'Strong Watchlist', cls: 'text-mint', pill: 'bg-mint/15 text-mint' },
    needs_research: { light: '🟡', label: 'Needs Research', cls: 'text-warn', pill: 'bg-warn/15 text-warn' },
    high_risk: { light: '🔴', label: 'High Risk', cls: 'text-danger', pill: 'bg-danger/15 text-danger' }
  };
  const meta = (c: string) => CLASS_META[c] ?? { light: '', label: c ?? '—', cls: 'text-muted', pill: 'bg-edge text-muted' };
  const scoreTone = (n: number | null) => (n == null ? 'text-muted' : n >= 70 ? 'text-mint' : n >= 45 ? 'text-warn' : 'text-danger');
  const statusPill = (s: string) => (s === 'active' ? 'bg-mint/15 text-mint' : s === 'upcoming' ? 'bg-accent/15 text-accent' : 'bg-edge text-muted');

  // Decision-first summary of what's on the radar today.
  const radarSummary = $derived.by(() => {
    const by = (c: string) => items.filter((p) => p.classification === c).length;
    const s = by('strong_watchlist');
    const n = by('needs_research');
    const h = by('high_risk');
    const line =
      s > 0
        ? `${s} project${s === 1 ? '' : 's'} score${s === 1 ? 's' : ''} well enough to research — but a high score is never a buy signal.`
        : 'Nothing scores strongly today — most are high-risk. Be very selective.';
    return { s, n, h, line };
  });

  // Signals for the AI interpretation — built from the same counts the radar already shows.
  const aiSignals = $derived(
    !locked && shown.length
      ? [
          { name: 'Worth researching', label: 'Strong watchlist', value: radarSummary.s, tone: radarSummary.s > 0 ? 'good' : 'neutral' },
          { name: 'Need research', label: 'Needs research', value: radarSummary.n, tone: 'warn' },
          { name: 'High risk', label: 'High risk', value: radarSummary.h, tone: radarSummary.h > 0 ? 'danger' : 'neutral' },
          { name: 'Projects on radar', label: 'Total scored today', value: shown.length, tone: 'neutral' }
        ]
      : []
  );
</script>

<header class="mb-4 flex items-center gap-2">
  <Rocket class="h-5 w-5 text-accent" />
  <div>
    <h1 class="text-lg font-semibold text-strong sm:text-xl">Early Project Radar</h1>
    <p class="text-sm text-muted">Which new token projects are worth a closer look — and which to avoid. Research only, never a buy signal.</p>
  </div>
</header>

{#if !$membershipReady || loading}
  <p class="text-sm text-muted">Loading early projects…</p>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else}
  {#if !locked && shown.length}
    <div class="mb-3 rounded-xl border border-edge bg-panel p-3.5">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-muted">On the radar today</p>
      <div class="mt-2 flex flex-wrap gap-2 text-sm">
        <span class="pill bg-mint/15 text-mint">🟢 {radarSummary.s} worth researching</span>
        <span class="pill bg-warn/15 text-warn">🟡 {radarSummary.n} need research</span>
        <span class="pill bg-danger/15 text-danger">🔴 {radarSummary.h} high-risk</span>
      </div>
      <p class="mt-2 text-sm text-soft">{radarSummary.line}</p>
    </div>

    <div class="mb-3">
      <AiInterpret module="early_project" title="Early Project Radar" signals={aiSignals} />
    </div>
  {/if}

  <div class="mb-3 flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
    <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>Score rates <span class="text-soft">backer strength, narrative, tokenomics, vesting, community, docs, timing</span> and red flags. A high score is not a recommendation — new tokens are highly risky.</span>
  </div>

  <!-- Filters (hidden in the free preview) -->
  {#if !locked}
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <select bind:value={fClass} onchange={load} class="input-sm">
      <option value="">All classifications</option>
      <option value="strong_watchlist">🟢 Strong Watchlist</option>
      <option value="needs_research">🟡 Needs Research</option>
      <option value="high_risk">🔴 High Risk</option>
    </select>
    <select bind:value={fStatus} onchange={load} class="input-sm">
      <option value="">All stages</option>
      <option value="upcoming">Upcoming</option>
      <option value="active">Active</option>
      <option value="ended">Ended</option>
    </select>
    {#if categories.length}
      <select bind:value={category} class="input-sm">
        <option value="">All categories</option>
        {#each categories as c}<option value={c}>{c}</option>{/each}
      </select>
    {/if}
    <div class="relative">
      <Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
      <input bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} placeholder="Search project…" class="input-sm pl-7" />
    </div>
  </div>
  {/if}

  {#if !shown.length}
    <div class="card text-center text-sm text-muted">{items.length ? 'No projects in this category.' : "No projects published yet. Once the team reviews and publishes candidates, they'll appear here."}</div>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each shown as p (p.id)}
        {@const m = meta(p.classification)}
        <div class="card flex flex-col gap-2 p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="flex min-w-0 items-start gap-2.5">
              {#if p.image_url}
                <img src={p.image_url} alt="" loading="lazy" class="mt-0.5 h-8 w-8 shrink-0 rounded-full border border-edge bg-panel-2 object-cover" />
              {/if}
              <div class="min-w-0">
              <p class="flex items-center gap-1.5 font-semibold text-strong">
                {p.project_name}{#if p.token_symbol}<span class="text-xs text-muted">{p.token_symbol}</span>{/if}
                {#if p.source_url}<a href={p.source_url} target="_blank" rel="noopener noreferrer" class="text-muted hover:text-mint"><ExternalLink class="h-3 w-3" /></a>{/if}
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-1.5">
                {#if p.category}<span class="pill bg-edge text-muted">{p.category}</span>{/if}
                <span class="pill {statusPill(p.sale_status)}">{p.sale_status}</span>
                {#if p.source_rank}<span class="pill bg-edge text-muted">#{p.source_rank}</span>{/if}
              </div>
              </div>
            </div>
            <div class="shrink-0 text-right">
              <div class="text-xl font-bold {scoreTone(p.score)}">{p.score ?? '—'}</div>
              <div class="text-[10px] {m.cls}">{m.light} {m.label}</div>
            </div>
          </div>

          {#if p.raise_amount_text || p.backers?.length}
            <div class="text-xs text-muted">
              {#if p.raise_amount_text}<span>Raised <span class="font-medium text-soft">{p.raise_amount_text}</span></span>{/if}
              {#if p.backers?.length}<span class="block">Backers: <span class="text-soft">{p.backers.slice(0, 3).join(', ')}</span>{p.backers.length > 3 ? ` +${p.backers.length - 3}` : ''}</span>{/if}
            </div>
          {/if}

          {#if p.rounds?.length}
            <div class="space-y-0.5 rounded-lg bg-panel-2 px-2.5 py-1.5 text-[11px]">
              {#each p.rounds as r}
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-soft">{r.name}{#if r.type} · <span class="text-muted">{r.type}</span>{/if}</span>
                  <span class="shrink-0 {r.status === 'Active' ? 'font-medium text-mint' : 'text-muted'}">
                    {#if r.status}{r.status}{r.when ? ` · ${r.when}` : ''}{:else}{r.amount || r.when || ''}{/if}
                  </span>
                </div>
              {/each}
            </div>
          {/if}

          {#if p.red_flags?.length}
            <p class="flex items-center gap-1 text-[11px] text-danger"><AlertTriangle class="h-3 w-3" />{p.red_flags.length} red flag{p.red_flags.length === 1 ? '' : 's'}</p>
          {:else}
            <p class="text-[11px] text-mint">No red flags</p>
          {/if}

          <div class="mt-auto flex flex-wrap gap-2 pt-1 text-[11px]">
            {#if p.website}<a href={p.website} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">Website</a>{/if}
            {#if p.whitepaper_url}<a href={p.whitepaper_url} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">Docs</a>{/if}
            {#if p.social_links?.twitter}<a href={p.social_links.twitter} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">Twitter</a>{/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if locked}
    <div class="mt-3 flex flex-col items-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-6 text-center">
      <AiLottie size={44} class="mb-2" />
      <Lock class="h-6 w-6 text-accent" />
      <p class="text-sm font-semibold text-strong">{total > 1 ? `${total - 1}+ more early projects are locked` : 'Unlock the full Early Project Radar'}</p>
      <p class="max-w-md text-xs text-muted">Upgrade to <span class="font-medium text-soft">{requiredPlan}</span> to see every scored project with backers, raise, tokenomics, vesting, rounds and red-flag screening — plus filters and search.</p>
      <a href="/pricing" class="btn-primary mt-1 text-sm">Upgrade to {requiredPlan}</a>
    </div>
  {/if}

  <div class="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-relaxed text-danger">
    <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>{disclaimer} New tokens and pre-market assets are highly risky and may be illiquid, volatile or unsafe. Always do your own research.</span>
  </div>
{/if}
