<script lang="ts">
  import { onMount } from 'svelte';
  import { MessageCircle, Send, Users, ShieldAlert, CheckCircle2 } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import AdminTabs from '$lib/components/AdminTabs.svelte';

  interface Rule {
    key: string;
    label: string;
    description: string | null;
    enabled: boolean;
    plan_codes: string[];
    template_name: string | null;
    template_language: string;
    min_hours_between: number;
    max_per_day: number;
  }
  interface Template { name: string; language: string; status: string; variableCount: number; body: string | null }
  interface Batch {
    id: string; rule_key: string; subject_type: string; audience_count: number;
    sent_count: number; skipped_count: number; failed_count: number;
    status: string; created_at: string; note: string | null;
  }

  let connected = $state(false);
  let optedIn = $state(0);
  let rules = $state<Rule[]>([]);
  let templates = $state<Template[]>([]);
  let batches = $state<Batch[]>([]);
  let loading = $state(true);
  let plans = $state<Array<{ slug: string; name: string }>>([]);
  // Counts live per rule so the answer appears beside the button that asked,
  // not in a status bar at the top of a page you have scrolled away from.
  let counts = $state<Record<string, number | 'loading'>>({});
  let busy = $state('');
  let message = $state('');

  // Announcement composer
  let announceTemplate = $state('');
  // One entry per {{n}} — a single pipe-separated string was asking someone to
  // count placeholders in their head and get the order right blind.
  let announceValues = $state<string[]>([]);
  let announceNote = $state('');
  let announcePlans = $state<string[]>([]);
  let announceCount = $state<number | null>(null);

  const approved = $derived(templates.filter((t) => t.status.toUpperCase() === 'APPROVED'));

  // One entry per template NAME, not per name+language.
  //
  // A rule stores template_name and template_language as separate fields, so the
  // picker chooses a name — listing the same template once per approved language
  // showed a duplicate option AND, because that {#each} was keyed on the name,
  // threw Svelte's each_key_duplicate the moment a second language was approved.
  // That error aborts the render, which is why the whole Rules section stayed on
  // "Loading…" while the rest of the page looked fine.
  const approvedNames = $derived([...new Set(approved.map((t) => t.name))]);
  let announceLanguage = $state('');
  const chosen = $derived(
    approved.find((t) => t.name === announceTemplate && (!announceLanguage || t.language === announceLanguage)) ?? null
  );
  const varsOk = $derived(
    !chosen || (announceValues.length >= chosen.variableCount && announceValues.slice(0, chosen.variableCount).every((v) => v.trim()))
  );

  /** The approved text with the values dropped in — exactly what will arrive. */
  const preview = $derived.by(() => {
    if (!chosen?.body) return '';
    return chosen.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
      const v = announceValues[Number(n) - 1];
      return v?.trim() ? v : `\u2588\u2588\u2588`;
    });
  });

  // Where the prefilled values came from, shown under the blanks. Typing a
  // threshold or a ladder action by hand is how a message goes out saying
  // something the dashboard does not, so the form offers the live numbers and
  // the admin corrects them rather than the other way round.
  let suggestSource = $state('');
  let suggestLabels = $state<string[]>([]);
  let suggesting = $state(false);

  const pickTemplate = async (value: string) => {
    const [name, language = ''] = value.split('|');
    announceTemplate = name;
    announceLanguage = language;
    const t = approved.find((x) => x.name === name && (!language || x.language === language));
    announceValues = Array.from({ length: t?.variableCount ?? 0 }, () => '');
    suggestSource = '';
    suggestLabels = [];
    if (!name || !t?.variableCount) return;

    suggesting = true;
    try {
      const s = await api<{ live: boolean; variables: string[]; labels: string[]; source: string }>(
        `/admin/notifications/suggest?template=${encodeURIComponent(name)}`,
        { auth: true }
      );
      suggestLabels = s.labels ?? [];
      suggestSource = s.source ?? '';
      if (s.live && s.variables?.length) {
        // Only fill the blanks this template actually has, and never overwrite
        // one with an empty value — a blank suggestion means "you decide".
        announceValues = Array.from({ length: t.variableCount }, (_, i) => s.variables[i] ?? '');
      }
    } catch {
      suggestSource = 'Could not read live data — fill these in by hand.';
    } finally {
      suggesting = false;
    }
  };

  /** Refill from live data, discarding edits. */
  const refillFromLive = () => void pickTemplate(`${announceTemplate}|${announceLanguage}`);

  // Each rule feeds its OWN variables into whatever template it points at, so
  // pairing a rule with another rule's template does not just read oddly — the
  // blank counts differ and Meta rejects the send with 132000, after it is
  // already logged. Mirrors ruleForTemplate() on the backend.
  const TEMPLATE_HINT: Record<string, RegExp> = {
    'risk.band_changed': /risk_band/i,
    'exit.threshold_crossed': /exit/i,
    'altcoin.signal': /altcoin|breadth/i,
    'report.published': /report/i
  };
  const mismatched = (rule: Rule): boolean => {
    const hint = TEMPLATE_HINT[rule.key];
    // 'manual' has no expected template — an announcement may use any of them.
    return Boolean(hint && rule.template_name && !hint.test(rule.template_name));
  };

  // ── Coin picker ──────────────────────────────────────────────────────────
  // Naming coins from memory is how a ticker that already rolled over ends up in
  // a broadcast. This is the live list of what is beating BTC, carrying the same
  // confidence/quality verdict the Alt/BTC Lab shows.
  interface Candidate {
    symbol: string;
    name: string;
    strength_30d: number | null;
    confidence: string;
    quality: string;
    confirmed: boolean;
  }
  let coins = $state<Candidate[]>([]);
  let coinsAsOf = $state<string | null>(null);
  let coinsLoading = $state(false);
  let coinsOpen = $state(false);
  let confirmedOnly = $state(true);
  let picked = $state<string[]>([]);

  const visibleCoins = $derived(confirmedOnly ? coins.filter((c) => c.confirmed) : coins);
  const pickedList = $derived(picked.join(', '));

  const loadCoins = async () => {
    if (coins.length || coinsLoading) return;
    coinsLoading = true;
    try {
      const res = await api<{ items: Candidate[]; as_of: string | null }>('/admin/notifications/outperformers', { auth: true });
      coins = res.items ?? [];
      coinsAsOf = res.as_of;
    } catch {
      coins = [];
    } finally {
      coinsLoading = false;
    }
  };

  const toggleCoin = (symbol: string) => {
    picked = picked.includes(symbol) ? picked.filter((s) => s !== symbol) : [...picked, symbol];
  };

  /** Drop the picked tickers into one blank as a comma-separated list. */
  const insertCoins = (index: number) => {
    if (!pickedList) return;
    announceValues[index] = pickedList;
    announceValues = [...announceValues];
  };

  /** How many people this announcement would reach, with the plans chosen here. */
  const countAudience = async () => {
    announceCount = null;
    try {
      const res = await api<{ count: number }>('/admin/notifications/rules/manual/audience', { auth: true });
      announceCount = res.count;
    } catch {
      announceCount = null;
    }
  };

  /**
   * Three independent fetches, in parallel, each allowed to fail on its own.
   *
   * They used to run sequentially behind one `loading` flag, so a single slow or
   * hanging call left the whole Rules section on "Loading…" forever while the
   * sections outside the flag rendered normally — and fetch() has no timeout, so
   * "forever" was literal. The plans list is a nice-to-have for the plan chips;
   * it must never be able to hide the rules.
   */
  const load = async () => {
    loading = true;
    const T = 20_000;

    // try/finally is not optional here. Reading `.value.connected` off a
    // response whose envelope carried no `data` throws a TypeError, and because
    // onMount() swallows a rejected promise the page would sit on "Loading…"
    // with nothing in the console — the exact failure this function exists to
    // stop. Every access below is optional-chained for the same reason.
    try {
      const [statusRes, historyRes, plansRes] = await Promise.allSettled([
        api<{ connected: boolean; opted_in_members: number; templates: Template[]; rules: Rule[] }>('/admin/notifications', { auth: true, timeoutMs: T }),
        api<{ items: Batch[] }>('/admin/notifications/history', { auth: true, timeoutMs: T }),
        api<{ items: Array<{ slug: string; name: string; is_active: boolean }> }>('/admin/plans', { auth: true, timeoutMs: T })
      ]);

      if (statusRes.status === 'fulfilled') {
        connected = Boolean(statusRes.value?.connected);
        optedIn = statusRes.value?.opted_in_members ?? 0;
        templates = statusRes.value?.templates ?? [];
        rules = statusRes.value?.rules ?? [];
      } else {
        // Only this one is worth interrupting the admin for — without it there
        // are no rules and no templates, so the page cannot do its job.
        message = statusRes.reason instanceof Error ? statusRes.reason.message : 'Could not load notifications.';
      }

      if (historyRes.status === 'fulfilled') batches = historyRes.value?.items ?? [];
      if (plansRes.status === 'fulfilled') {
        plans = (plansRes.value?.items ?? []).filter((p) => p.is_active).map((p) => ({ slug: p.slug, name: p.name }));
      }
    } catch (error) {
      message = error instanceof Error ? error.message : 'Could not load notifications.';
    } finally {
      loading = false;
    }
  };

  const saveRule = async (rule: Rule, patch: Partial<Rule>) => {
    busy = rule.key;
    try {
      const updated = await api<Rule>(`/admin/notifications/rules/${rule.key}`, { auth: true, method: 'PUT', body: patch });
      rules = rules.map((r) => (r.key === rule.key ? { ...r, ...updated } : r));
      message = `${rule.label} updated.`;
    } catch (error) {
      message = error instanceof Error ? error.message : 'Could not save the rule.';
    } finally {
      busy = '';
    }
  };

  const previewAudience = async (rule: Rule) => {
    counts[rule.key] = 'loading';
    try {
      const res = await api<{ count: number }>(`/admin/notifications/rules/${rule.key}/audience`, { auth: true });
      counts[rule.key] = res.count;
    } catch (error) {
      delete counts[rule.key];
      counts = { ...counts };
      message = error instanceof Error ? error.message : 'Could not resolve the audience.';
    }
  };

  /** Tick a plan on or off for a rule and save immediately. */
  const togglePlan = (rule: Rule, slug: string) => {
    const next = rule.plan_codes.includes(slug)
      ? rule.plan_codes.filter((p) => p !== slug)
      : [...rule.plan_codes, slug];
    delete counts[rule.key]; // the audience just changed; the old number is a lie
    counts = { ...counts };
    return saveRule(rule, { plan_codes: next });
  };

  const sendAnnouncement = async () => {
    if (!announceTemplate) return;
    busy = 'announce';
    try {
      const summary = await api<{ audience: number; sent: number; skipped: number; failed: number; reason?: string }>(
        '/admin/notifications/announce',
        {
          auth: true,
          method: 'POST',
          body: {
            template_name: announceTemplate,
            template_language: announceLanguage || undefined,
            variables: announceValues.map((v) => v.trim()),
            note: announceNote || undefined
          }
        }
      );
      message = summary.reason ?? `Sent to ${summary.sent} of ${summary.audience} — ${summary.skipped} skipped, ${summary.failed} failed.`;
      announceNote = '';
      announceValues = announceValues.map(() => '');
      await load();
    } catch (error) {
      message = error instanceof Error ? error.message : 'Could not send the announcement.';
    } finally {
      busy = '';
    }
  };

  $effect(() => {
    if (connected) void countAudience();
  });

  onMount(() => {
    if ($authReady && $user?.role !== 'admin') return;
    void load();
  });
</script>

<AdminTabs />

<div class="mx-auto max-w-5xl px-4 py-6 space-y-6">
  <header class="flex items-start gap-3">
    <MessageCircle class="mt-1 size-6 text-mint" />
    <div>
      <h1 class="text-xl font-bold text-strong">WhatsApp notifications</h1>
      <p class="text-sm text-muted">
        Delivered through Makutano Connect, which owns the number, the templates and Meta compliance.
      </p>
    </div>
  </header>

  {#if !connected}
    <div class="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm">
      <ShieldAlert class="mt-0.5 size-5 shrink-0 text-warn" />
      <div>
        <p class="font-semibold text-warn">Not connected yet</p>
        <p class="text-soft">
          Set <code class="rounded bg-panel-2 px-1">CONNECT_API_KEY</code> on the backend. Until then rules can be
          edited but nothing is ever sent.
        </p>
      </div>
    </div>
  {/if}

  <div class="grid gap-4 sm:grid-cols-3">
    <div class="card">
      <p class="stat-label">Members opted in</p>
      <p class="stat-value mt-1">{optedIn}</p>
      <p class="mt-1 text-xs text-muted">Only these people can ever be messaged.</p>
    </div>
    <div class="card">
      <p class="stat-label">Approved templates</p>
      <p class="stat-value mt-1">{approved.length}</p>
      <p class="mt-1 text-xs text-muted">{templates.length} total in Connect.</p>
    </div>
    <div class="card">
      <p class="stat-label">Connection</p>
      <p class="stat-value mt-1">{connected ? 'Live' : 'Off'}</p>
    </div>
  </div>

  {#if message}
    <p class="rounded-lg border border-edge bg-panel-2/60 px-4 py-2 text-sm text-body">{message}</p>
  {/if}


  <!-- The announcement is the thing people come here to DO, so it reads top to
       bottom as one task: what to say, what goes in it, who gets it, send. The
       rules below are configuration and sit out of the way underneath. -->
  <section class="card">
    <h2 class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
      <Send class="size-4" /> Send an announcement
    </h2>

    <label class="mt-4 block">
      <span class="mb-1 block text-xs text-muted">Message</span>
      <select
        value={announceTemplate}
        onchange={(e) => pickTemplate((e.currentTarget as HTMLSelectElement).value)}
        class="input"
      >
        <option value="">— choose an approved template —</option>
        <!-- The value carries the language too. Both options used to submit just
             the name, so picking "(en)" and picking "(sw)" were indistinguishable
             and `chosen` always resolved to whichever was listed first — you
             could select English and send Swahili. -->
        {#each approved as tpl (tpl.name + tpl.language)}
          <option value={`${tpl.name}|${tpl.language}`}>{tpl.name} ({tpl.language})</option>
        {/each}
      </select>
    </label>

    {#if chosen}
      {#if chosen.variableCount > 0}
        <div class="mt-4 space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs text-muted">
              {suggesting ? 'Reading live data…' : `Fill in the blanks — ${chosen.variableCount} value${chosen.variableCount === 1 ? '' : 's'}`}
            </span>
            {#if suggestSource}
              <button type="button" class="text-xs font-medium text-accent hover:underline" onclick={refillFromLive}>
                Refill from live data
              </button>
            {/if}
          </div>
          {#each Array(chosen.variableCount) as _, i (i)}
            <div class="flex items-center gap-2">
              <span class="w-24 shrink-0 truncate text-xs text-muted" title={suggestLabels[i] ?? `{{${i + 1}}}`}>
                {suggestLabels[i] ?? `{{${i + 1}}}`}
              </span>
              <input bind:value={announceValues[i]} class="input" placeholder={`Value for {{${i + 1}}}`} />
              {#if picked.length}
                <button
                  type="button"
                  class="btn-ghost shrink-0 px-2 py-1 text-xs"
                  title="Put the {picked.length} picked coin{picked.length === 1 ? '' : 's'} in this blank"
                  onclick={() => insertCoins(i)}
                >
                  Insert coins
                </button>
              {/if}
            </div>
          {/each}
          {#if suggestSource}
            <p class="text-xs text-muted">{suggestSource} Edit anything that looks wrong before sending.</p>
          {/if}
        </div>

        <!-- Coin picker. Naming tickers from memory is how a coin that already
             rolled over ends up in a broadcast; this is the live list. -->
        <div class="mt-4 rounded-xl border border-edge bg-panel-2/40 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              class="text-xs font-semibold text-accent hover:underline"
              onclick={() => { coinsOpen = !coinsOpen; if (coinsOpen) void loadCoins(); }}
            >
              {coinsOpen ? 'Hide' : 'Pick'} coins beating BTC{picked.length ? ` · ${picked.length} selected` : ''}
            </button>
            {#if coinsOpen && coins.length}
              <label class="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" bind:checked={confirmedOnly} class="accent-mint" />
                Confirmed only
              </label>
            {/if}
          </div>

          {#if picked.length}
            <p class="mt-2 text-xs text-soft"><span class="text-muted">Picked:</span> {pickedList}</p>
          {/if}

          {#if coinsOpen}
            {#if coinsLoading}
              <p class="mt-2 text-xs text-muted">Reading the Alt/BTC signals…</p>
            {:else if !coins.length}
              <p class="mt-2 text-xs text-muted">No signals yet — run a Lab price-series sync.</p>
            {:else}
              <div class="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {#each visibleCoins as c (c.symbol)}
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-panel-2 {picked.includes(c.symbol) ? 'bg-mint/10' : ''}"
                    onclick={() => toggleCoin(c.symbol)}
                  >
                    <span class="w-4 shrink-0 text-mint">{picked.includes(c.symbol) ? '✓' : ''}</span>
                    <span class="w-14 shrink-0 font-semibold text-strong">{c.symbol}</span>
                    <span class="w-16 shrink-0 text-mint">{c.strength_30d == null ? '—' : `+${c.strength_30d.toFixed(0)}%`}</span>
                    <span class="min-w-0 flex-1 truncate text-muted">{c.quality} · {c.confidence}</span>
                    {#if c.confirmed}<span class="shrink-0 rounded bg-mint/15 px-1.5 py-0.5 text-[10px] font-semibold text-mint">Confirmed</span>{/if}
                  </button>
                {/each}
              </div>
              <p class="mt-2 text-[11px] leading-relaxed text-muted">
                30-day strength vs BTC{coinsAsOf ? ` as of ${coinsAsOf}` : ''}. “Confirmed” means the app's own checks agree —
                clean signal and high confidence. Coins on a short history or still under the 200-day MA are shown only when
                you untick, because naming those in a broadcast sells a bounce as a trend.
              </p>
            {/if}
          {/if}
        </div>
      {/if}

      <div class="mt-4">
        <span class="mb-1 block text-xs text-muted">This is exactly what they receive</span>
        <pre class="card whitespace-pre-wrap bg-panel-2 p-3 text-sm text-strong">{preview}</pre>
      </div>
    {/if}

    <input bind:value={announceNote} placeholder="Internal note (why you sent this)" class="input mt-4" />

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span class="text-sm text-muted">
        {#if announceCount === null}
          Goes to everyone who opted in.
        {:else}
          Goes to <span class="font-semibold text-strong">{announceCount}</span>
          opted-in member{announceCount === 1 ? '' : 's'}.
        {/if}
      </span>
      <button class="btn-primary" disabled={!connected || !chosen || !varsOk || busy === 'announce'} onclick={sendAnnouncement}>
        <Send class="size-4" />
        {busy === 'announce'
          ? 'Sending…'
          : announceCount === null
            ? 'Send'
            : `Send to ${announceCount} member${announceCount === 1 ? '' : 's'}`}
      </button>
    </div>

    {#if chosen && !varsOk}
      <p class="mt-2 text-xs text-danger">Every blank needs a value before this can send.</p>
    {/if}
  </section>

  <!-- Configuration: which events send automatically, and to whom. -->
  <section class="space-y-3">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">Rules</h2>
    {#if loading}
      <p class="text-sm text-muted">Loading…</p>
    {:else if !rules.length}
      <!-- Distinguish "could not load" from "genuinely none": a blank section
           reads as an empty list and hides the fact that the call failed. -->
      <div class="card">
        <p class="text-sm text-soft">Couldn't load the rules.</p>
        <p class="mt-1 text-xs text-muted">
          {message || 'The notifications endpoint returned nothing. Check the backend is running, then try again.'}
        </p>
        <button class="btn-ghost mt-3 text-xs" onclick={() => void load()}>Retry</button>
      </div>
    {:else}
      {#each rules as rule (rule.key)}
        <div class="card">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-strong">{rule.label}</p>
              <p class="text-sm text-muted">{rule.description}</p>
            </div>
            <button
              class="rounded-lg px-3 py-1.5 text-sm font-semibold {rule.enabled
                ? 'bg-mint/15 text-mint'
                : 'bg-panel-2 text-muted'}"
              disabled={busy === rule.key}
              onclick={() => saveRule(rule, { enabled: !rule.enabled })}
            >
              {rule.enabled ? 'On' : 'Off'}
            </button>
          </div>

          <div class="mt-3 grid gap-3 sm:grid-cols-3">
            <label class="text-xs text-muted">
              Template
              <select
                class="input-sm mt-1 w-full"
                value={rule.template_name ?? ''}
                onchange={(e) => saveRule(rule, { template_name: (e.currentTarget as HTMLSelectElement).value || null })}
              >
                <option value="">— none —</option>
                {#each approvedNames as name (name)}
                  <option value={name}>{name}</option>
                {/each}
              </select>
            </label>
            <div class="text-xs text-muted">
              Plans
              <div class="mt-1 flex flex-wrap items-center gap-2">
                {#each plans as plan (plan.slug)}
                  <button
                    type="button"
                    class="pill border {rule.plan_codes.includes(plan.slug)
                      ? 'border-mint bg-mint/15 text-mint'
                      : 'border-edge text-muted'}"
                    disabled={busy === rule.key}
                    onclick={() => togglePlan(rule, plan.slug)}
                  >
                    {plan.name}
                  </button>
                {/each}
                {#if rule.plan_codes.length === 0}
                  <span class="text-xs text-muted">none picked — everyone who opted in</span>
                {/if}
              </div>
            </div>

            <div class="flex items-end gap-2">
              <button class="btn-ghost text-xs" disabled={busy === rule.key} onclick={() => previewAudience(rule)}>
                <Users class="size-4" /> Who gets this?
              </button>
              {#if counts[rule.key] !== undefined}
                <span class="pill bg-mint/15 text-mint">
                  {counts[rule.key] === 'loading'
                    ? 'counting…'
                    : `${counts[rule.key]} member${counts[rule.key] === 1 ? '' : 's'}`}
                </span>
              {/if}
          </div>
          </div>

          {#if rule.enabled && !rule.template_name}
            <p class="mt-3 text-xs text-warn">
              This rule is on but has no approved template, so it cannot send. Business-initiated WhatsApp messages must
              be templates.
            </p>
          {/if}

          {#if mismatched(rule)}
            <p class="mt-3 text-xs text-danger">
              <span class="font-semibold">{rule.template_name}</span> does not look like this rule's template. This rule
              supplies {rule.label.toLowerCase()} values, so members would get the wrong wording — or the send fails
              outright if the blank counts differ.
            </p>
          {/if}
        </div>
      {/each}
    {/if}
  </section>
  <section class="space-y-2">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">Recent sends</h2>
    {#if batches.length === 0}
      <p class="text-sm text-muted">Nothing has been sent yet.</p>
    {:else}
      <div class="overflow-x-auto rounded-xl border border-edge">
        <table class="w-full text-sm">
          <thead class="bg-panel-2/60 text-left text-xs uppercase tracking-wide text-muted">
            <tr><th class="p-3">When</th><th class="p-3">Rule</th><th class="p-3">Audience</th><th class="p-3">Sent</th><th class="p-3">Skipped</th><th class="p-3">Failed</th></tr>
          </thead>
          <tbody>
            {#each batches as b (b.id)}
              <tr class="border-t border-edge">
                <td class="p-3 text-muted">{new Date(b.created_at).toLocaleString()}</td>
                <td class="p-3">{b.rule_key}</td>
                <td class="p-3">{b.audience_count}</td>
                <td class="p-3 text-mint">{b.sent_count}</td>
                <td class="p-3 text-muted">{b.skipped_count}</td>
                <td class="p-3 {b.failed_count ? 'text-danger' : 'text-muted'}">{b.failed_count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <p class="flex items-start gap-2 text-xs text-muted">
    <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-muted" />
    Members opt in themselves under Settings. A number captured for mobile-money checkout is not consent to be
    messaged, and is never used here.
  </p>
</div>
