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
  const chosen = $derived(approved.find((t) => t.name === announceTemplate) ?? null);
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

  const pickTemplate = (name: string) => {
    announceTemplate = name;
    const t = approved.find((x) => x.name === name);
    announceValues = Array.from({ length: t?.variableCount ?? 0 }, () => '');
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

  const load = async () => {
    loading = true;
    try {
      const status = await api<{ connected: boolean; opted_in_members: number; templates: Template[]; rules: Rule[] }>(
        '/admin/notifications',
        { auth: true }
      );
      connected = status.connected;
      optedIn = status.opted_in_members;
      templates = status.templates ?? [];
      rules = status.rules ?? [];
      const history = await api<{ items: Batch[] }>('/admin/notifications/history', { auth: true });
      batches = history.items ?? [];
      const planList = await api<{ items: Array<{ slug: string; name: string; is_active: boolean }> }>('/admin/plans', {
        auth: true
      });
      plans = (planList.items ?? []).filter((p) => p.is_active).map((p) => ({ slug: p.slug, name: p.name }));
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
        {#each approved as tpl (tpl.name + tpl.language)}
          <option value={tpl.name}>{tpl.name} ({tpl.language})</option>
        {/each}
      </select>
    </label>

    {#if chosen}
      {#if chosen.variableCount > 0}
        <div class="mt-4 space-y-2">
          <span class="block text-xs text-muted">
            Fill in the blanks — {chosen.variableCount} value{chosen.variableCount === 1 ? '' : 's'}
          </span>
          {#each Array(chosen.variableCount) as _, i (i)}
            <div class="flex items-center gap-2">
              <span class="w-10 shrink-0 text-xs text-muted">{`{{${i + 1}}}`}</span>
              <input bind:value={announceValues[i]} class="input" placeholder={`Value for {{${i + 1}}}`} />
            </div>
          {/each}
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
                {#each approved as t (t.name)}
                  <option value={t.name}>{t.name}</option>
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
