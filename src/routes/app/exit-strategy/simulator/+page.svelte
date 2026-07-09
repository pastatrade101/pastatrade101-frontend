<script lang="ts">
  import { Calculator, Save, Trash2, Lock, Info, ArrowUpRight, ArrowLeft } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import Gauge from '$lib/components/Gauge.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import AiLottie from '$lib/components/AiLottie.svelte';

  const canSim = $derived(hasFeature($membership, 'access_exit_simulator'));
  const isPremium = $derived(!!$membership && ($membership.is_admin || $membership.plan === 'premium'));

  // ── Inputs ──
  let portfolioType = $state<'btc' | 'altcoin' | 'mixed' | 'custom'>('mixed');
  let portfolioValue = $state<number | ''>(10000);
  let originalCapital = $state<number | ''>('');
  let profile = $state<'conservative' | 'balanced' | 'aggressive'>('balanced');
  let mode = $state<'total_portfolio' | 'profit_only' | 'recover_capital' | 'moonbag'>('total_portfolio');
  let moonbagPercent = $state(20);
  let useCustomRisk = $state(false);
  let customRisk = $state(0.5);
  let userNote = $state('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result = $state<any>(null);
  let loading = $state(false);
  let error = $state('');
  let saving = $state(false);
  let saveMsg = $state('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let savedList = $state<any[]>([]);

  const MODES = [
    { key: 'total_portfolio', label: 'Total portfolio', premium: false },
    { key: 'profit_only', label: 'Profit only', premium: true },
    { key: 'recover_capital', label: 'Recover capital', premium: true },
    { key: 'moonbag', label: 'Moonbag', premium: true }
  ] as const;
  const PROFILE_DESC: Record<string, string> = {
    conservative: 'Scales out earlier and gives more caution.',
    balanced: 'Default approach. Scales out gradually as multiple risk categories rise.',
    aggressive: 'Allows higher risk before reducing exposure.'
  };

  const usd = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`);
  const usdRange = (a: number | null, b: number | null) => (a == null || b == null ? '—' : Math.round(a) === Math.round(b) ? usd(a) : `${usd(a)}–${usd(b)}`);
  const pctRange = (a: number, b: number) => (a === b ? `${a}%` : `${a}–${b}%`);
  const zonePill = (s: number) => (s < 0.5 ? 'bg-mint/15 text-mint' : s < 0.75 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger');

  const body = () => ({
    portfolio_type: portfolioType,
    portfolio_value: Number(portfolioValue),
    original_capital: originalCapital === '' ? null : Number(originalCapital),
    strategy_profile: profile,
    simulation_mode: mode,
    moonbag_percent: moonbagPercent,
    custom_risk_score: isPremium && useCustomRisk ? customRisk : null
  });

  const simulate = async () => {
    loading = true;
    error = '';
    try {
      result = await api('/exit-strategy/simulate', { method: 'POST', auth: true, body: body() });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Simulation failed.';
    } finally {
      loading = false;
    }
  };

  // Debounced auto-simulation when inputs change.
  $effect(() => {
    // track dependencies
    const _ = [portfolioType, portfolioValue, originalCapital, profile, mode, moonbagPercent, useCustomRisk, customRisk, canSim];
    void _;
    if (!$membershipReady || !canSim) return;
    if (!(Number(portfolioValue) > 0)) {
      result = null;
      return;
    }
    const id = setTimeout(() => void simulate(), 350);
    return () => clearTimeout(id);
  });

  // Saved simulations (premium).
  let loadedSaved = $state(false);
  $effect(() => {
    if (!$membershipReady || !isPremium || loadedSaved) return;
    loadedSaved = true;
    void loadSaved();
  });
  const loadSaved = async () => {
    try {
      savedList = (await api<{ items: typeof savedList }>('/exit-strategy/simulations', { auth: true })).items ?? [];
    } catch {
      /* optional */
    }
  };

  const save = async () => {
    saving = true;
    saveMsg = '';
    try {
      await api('/exit-strategy/simulations/save', { method: 'POST', auth: true, body: { ...body(), user_note: userNote } });
      saveMsg = 'Saved.';
      await loadSaved();
    } catch (e) {
      saveMsg = e instanceof Error ? e.message : 'Save failed.';
    } finally {
      saving = false;
    }
  };

  const removeSaved = async (id: string) => {
    try {
      await api(`/exit-strategy/simulations/${id}`, { method: 'DELETE', auth: true });
      await loadSaved();
    } catch {
      /* ignore */
    }
  };
</script>

<header class="mb-5">
  <a href="/app/exit-strategy" class="mb-2 inline-flex items-center gap-1 text-xs text-muted transition hover:text-soft"><ArrowLeft class="h-3.5 w-3.5" /> Back to Exit Strategy</a>
  <h1 class="flex items-center gap-2 text-xl font-semibold text-strong"><Calculator class="h-5 w-5 text-accent" /> Portfolio Exit Simulator</h1>
  <p class="text-sm text-muted">Convert the current Exit Risk Score into a practical, risk-based scale-out scenario for your own portfolio size.</p>
</header>

{#if !$membershipReady}
  <p class="text-sm text-muted">Loading…</p>
{:else if !canSim}
  <LockedFeature
    title="Portfolio Exit Simulator is a premium feature"
    plan="Premium"
    bullets={['Enter your portfolio value and see a risk-based simulated scale-out range', 'Profit-only, recover-capital and moonbag simulation modes', 'A scenario table showing suggested exits at each risk level', 'Save your simulations privately — your portfolio values are never shared']}
  />
{:else}
  <div class="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
    <!-- ── Inputs ── -->
    <div class="space-y-3">
      <div class="card space-y-3">
        <div>
          <label class="text-xs font-medium text-muted" for="ptype">Portfolio type</label>
          <select id="ptype" class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-2 py-2 text-sm text-strong" bind:value={portfolioType}>
            <option value="btc">BTC only</option>
            <option value="altcoin">Altcoin only</option>
            <option value="mixed">Mixed portfolio</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-medium text-muted" for="pval">Current portfolio value (USD)</label>
          <input id="pval" type="number" min="0" step="100" class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-strong" bind:value={portfolioValue} placeholder="10000" />
        </div>
        <div>
          <label class="text-xs font-medium text-muted" for="ocap">Original capital invested (optional)</label>
          <input id="ocap" type="number" min="0" step="100" class="mt-1 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-strong" bind:value={originalCapital} placeholder="4000" />
          {#if result?.profit_info}
            <p class="mt-1 text-[11px] {result.profit_info.profit >= 0 ? 'text-mint' : 'text-danger'}">P/L: {usd(result.profit_info.profit)}{result.profit_info.profit_percentage != null ? ` (${result.profit_info.profit_percentage}%)` : ''}</p>
          {/if}
        </div>
        <div>
          <span class="text-xs font-medium text-muted">Strategy profile</span>
          <div class="mt-1 inline-flex w-full overflow-hidden rounded-lg border border-edge text-xs">
            {#each ['conservative', 'balanced', 'aggressive'] as p}
              <button class="flex-1 px-2 py-1.5 font-medium capitalize transition-colors {profile === p ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (profile = p as typeof profile)}>{p}</button>
            {/each}
          </div>
          <p class="mt-1 text-[11px] text-muted">{PROFILE_DESC[profile]}</p>
        </div>
        <div>
          <span class="text-xs font-medium text-muted">Simulation mode</span>
          <div class="mt-1 grid grid-cols-2 gap-1.5">
            {#each MODES as m}
              <button
                class="rounded-lg border px-2 py-1.5 text-xs font-medium transition {mode === m.key ? 'border-accent/50 bg-accent/10 text-accent' : 'border-edge text-muted hover:text-soft'} {m.premium && !isPremium ? 'cursor-not-allowed opacity-50' : ''}"
                disabled={m.premium && !isPremium}
                onclick={() => (mode = m.key)}
              >
                {m.label}{#if m.premium && !isPremium}<Lock class="ml-1 inline h-3 w-3" />{/if}
              </button>
            {/each}
          </div>
        </div>
        {#if mode === 'moonbag' && isPremium}
          <div>
            <label class="text-xs font-medium text-muted" for="mb">Keep moonbag: {moonbagPercent}%</label>
            <input id="mb" type="range" min="0" max="90" step="5" class="mt-1 w-full accent-mint" bind:value={moonbagPercent} />
          </div>
        {/if}
        {#if isPremium}
          <div class="rounded-lg border border-edge p-2">
            <label class="flex items-center gap-2 text-xs font-medium text-soft"><input type="checkbox" class="accent-mint" bind:checked={useCustomRisk} /> Simulate a custom risk score</label>
            {#if useCustomRisk}
              <label class="mt-2 block text-[11px] text-muted" for="cr">Exit Risk Score: {customRisk.toFixed(2)}</label>
              <input id="cr" type="range" min="0" max="1" step="0.01" class="mt-1 w-full accent-accent" bind:value={customRisk} />
            {:else}
              <p class="mt-1 text-[11px] text-muted">Using the current live Exit Risk Score.</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- ── Result ── -->
    <div class="min-w-0 space-y-3">
      {#if error}
        <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
      {/if}
      {#if !result && loading}
        <p class="text-sm text-muted">Simulating…</p>
      {:else if result}
        {@const r = result}
        <!-- Headline -->
        <div class="hero-card grid items-center gap-4 sm:grid-cols-[auto_1fr]">
          <div class="mx-auto"><Gauge value={r.current_exit_risk_score} title="Exit Risk" /></div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xl font-bold text-strong">{r.current_exit_risk_score.toFixed(2)} <span class="text-sm text-muted">/ {r.exit_risk_percent}</span></span>
              <span class="pill {zonePill(r.current_exit_risk_score)}">{r.signal}</span>
              {#if r.used_custom_risk}<span class="pill bg-accent/15 text-accent">simulated risk</span>{/if}
            </div>
            <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><p class="text-[11px] text-muted">Suggested simulated exit</p><p class="text-lg font-semibold text-strong">{pctRange(r.suggested_exit.min_percent, r.suggested_exit.max_percent)}</p></div>
              <div><p class="text-[11px] text-muted">Simulated exit amount</p><p class="text-lg font-semibold text-strong">{usdRange(r.suggested_exit_amount.min, r.suggested_exit_amount.max)}</p></div>
              <div><p class="text-[11px] text-muted">Remaining position</p><p class="text-lg font-semibold text-strong">{usdRange(r.remaining_position.min, r.remaining_position.max)}</p></div>
            </div>
            {#if r.next_threshold}<p class="mt-2 text-xs text-muted">Next threshold: <span class="font-medium text-soft">{r.next_threshold.score.toFixed(2)} — {r.next_threshold.label}</span></p>{/if}
          </div>
        </div>

        <!-- What this means -->
        <div class="card">
          <p class="stat-label">What this means</p>
          <p class="mt-1 text-sm leading-relaxed text-soft">{r.interpretation}</p>
        </div>

        <!-- Mode-specific detail -->
        {#if r.profit_info && (mode === 'profit_only' || mode === 'total_portfolio')}
          <div class="card">
            <p class="stat-label text-mint">Profit-only scale-out</p>
            <div class="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p class="text-[11px] text-muted">Profit available</p><p class="font-semibold text-strong">{usd(r.profit_info.profit)}</p></div>
              <div><p class="text-[11px] text-muted">Suggested profit exit</p><p class="font-semibold text-strong">{usdRange(r.profit_info.profit_exit_min, r.profit_info.profit_exit_max)}</p></div>
              <div><p class="text-[11px] text-muted">Profit remaining</p><p class="font-semibold text-strong">{usdRange(r.profit_info.profit_remaining_min, r.profit_info.profit_remaining_max)}</p></div>
              <div><p class="text-[11px] text-muted">Return on capital</p><p class="font-semibold text-strong">{r.profit_info.profit_percentage != null ? `${r.profit_info.profit_percentage}%` : '—'}</p></div>
            </div>
          </div>
        {/if}
        {#if r.recover_capital && (mode === 'recover_capital' || mode === 'total_portfolio')}
          <div class="card">
            <p class="stat-label text-accent">Recover initial capital</p>
            <div class="mt-2 grid grid-cols-3 gap-3 text-sm">
              <div><p class="text-[11px] text-muted">Exit to recover capital</p><p class="font-semibold text-strong">{usd(r.recover_capital.amount_to_recover)}</p></div>
              <div><p class="text-[11px] text-muted">% of portfolio</p><p class="font-semibold text-strong">{r.recover_capital.percent_of_portfolio}%</p></div>
              <div><p class="text-[11px] text-muted">Remaining moonbag</p><p class="font-semibold text-strong">{usd(r.recover_capital.remaining_moonbag)}</p></div>
            </div>
          </div>
        {/if}
        {#if r.moonbag && mode === 'moonbag'}
          <div class="card">
            <p class="stat-label text-mint">Moonbag mode</p>
            <div class="mt-2 grid grid-cols-3 gap-3 text-sm">
              <div><p class="text-[11px] text-muted">Moonbag kept ({r.moonbag.moonbag_percent}%)</p><p class="font-semibold text-strong">{usd(r.moonbag.moonbag_amount)}</p></div>
              <div><p class="text-[11px] text-muted">Max removable</p><p class="font-semibold text-strong">{usd(r.moonbag.max_removable)}</p></div>
              <div><p class="text-[11px] text-muted">Simulated exit</p><p class="font-semibold text-strong">{usdRange(r.suggested_exit_amount.min, r.suggested_exit_amount.max)}</p></div>
            </div>
          </div>
        {/if}

        <!-- Scenario table (premium) -->
        {#if r.scenario_table?.length}
          <div class="card overflow-x-auto p-0">
            <div class="border-b border-edge px-4 py-3"><h2 class="text-sm font-semibold text-strong">Scenario table · {usd(r.portfolio_value)} portfolio</h2></div>
            <table class="w-full min-w-[560px] text-sm">
              <thead>
                <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
                  <th class="px-3 py-2">Risk</th><th class="px-3 py-2">Signal</th><th class="px-3 py-2">Suggested exit</th><th class="px-3 py-2">Exit amount</th><th class="px-3 py-2">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {#each r.scenario_table as row}
                  <tr class="border-b border-edge/60 last:border-0 {r.current_exit_risk_score >= row.risk ? 'bg-panel-2/40' : ''}">
                    <td class="px-3 py-2 font-mono text-xs text-soft">{row.risk.toFixed(2)}</td>
                    <td class="px-3 py-2 text-soft">{row.signal}</td>
                    <td class="px-3 py-2 text-muted">{row.exit_max_percent <= 0 ? '0%' : pctRange(row.exit_min_percent, row.exit_max_percent)}</td>
                    <td class="px-3 py-2 text-muted">{row.exit_max_percent <= 0 ? usd(0) : usdRange(row.exit_min_amount, row.exit_max_amount)}</td>
                    <td class="px-3 py-2 text-muted">{usdRange(row.remaining_min, row.remaining_max)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        <!-- What would change -->
        {#if r.what_would_change?.length}
          <div class="card">
            <p class="flex items-center gap-1.5 stat-label text-warn"><ArrowUpRight class="h-3.5 w-3.5" /> What would change the suggestion</p>
            <ul class="mt-2 space-y-1 text-sm text-muted">
              {#each r.what_would_change as w}<li class="flex items-start gap-1.5"><span class="mt-1 h-1 w-1 shrink-0 rounded-full bg-warn"></span>{w}</li>{/each}
            </ul>
          </div>
        {/if}

        <!-- Save (premium) + note -->
        {#if isPremium}
          <div class="card">
            <label class="text-xs font-medium text-muted" for="note">Notes (optional)</label>
            <textarea id="note" class="mt-1 h-16 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-soft" bind:value={userNote} placeholder="e.g. plan for next cycle top"></textarea>
            <div class="mt-2 flex items-center gap-3">
              <button class="btn-primary text-sm" disabled={saving} onclick={save}><Save class="h-4 w-4" /> {saving ? 'Saving…' : 'Save simulation'}</button>
              {#if saveMsg}<span class="text-xs {saveMsg === 'Saved.' ? 'text-mint' : 'text-danger'}">{saveMsg}</span>{/if}
            </div>
          </div>

          {#if savedList.length}
            <div class="card p-0">
              <div class="border-b border-edge px-4 py-3"><h2 class="text-sm font-semibold text-strong">Saved simulations</h2></div>
              <ul class="divide-y divide-edge/60">
                {#each savedList as s}
                  <li class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div class="min-w-0">
                      <p class="truncate text-soft">{usd(s.portfolio_value)} · <span class="capitalize">{s.strategy_profile}</span> · {s.current_signal}</p>
                      <p class="text-[11px] text-muted">Exit {s.suggested_exit_min_percent}–{s.suggested_exit_max_percent}% · {usdRange(s.suggested_exit_min_amount, s.suggested_exit_max_amount)} · {new Date(s.created_at).toISOString().slice(0, 10)}{s.user_note ? ` · ${s.user_note}` : ''}</p>
                    </div>
                    <button class="rounded-lg border border-edge p-1.5 text-muted hover:text-danger" aria-label="Delete" onclick={() => removeSaved(s.id)}><Trash2 class="h-4 w-4" /></button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        {:else}
          <div class="card border-accent/30 bg-accent/5">
            <AiLottie size={44} class="mx-auto mb-2" />
            <p class="flex items-center gap-1.5 stat-label text-accent"><Lock class="h-3.5 w-3.5" /> Upgrade to Premium</p>
            <p class="mt-1 text-sm text-soft">You're using the basic simulator (total-portfolio, current risk). Premium unlocks profit-only, recover-capital and moonbag modes, a custom risk score, the full scenario table, and saving your simulations privately.</p>
            <a href="/pricing" class="btn-primary mt-3 inline-flex">See Premium</a>
          </div>
        {/if}

        <!-- Disclaimer + warning -->
        <div class="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs font-medium text-warn">This is a simulation, not an instruction to sell.</div>
        <div class="flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
          <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{r.disclaimer}</span>
        </div>
      {:else}
        <p class="text-sm text-muted">Enter a portfolio value to run a simulation.</p>
      {/if}
    </div>
  </div>
{/if}
