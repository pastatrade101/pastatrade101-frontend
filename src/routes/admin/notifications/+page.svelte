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
  interface Template { name: string; language: string; status: string }
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
  let busy = $state('');
  let message = $state('');

  // Announcement composer
  let announceTemplate = $state('');
  let announceVars = $state('');
  let announceNote = $state('');

  const approved = $derived(templates.filter((t) => t.status.toUpperCase() === 'APPROVED'));

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
    busy = rule.key;
    try {
      const res = await api<{ count: number }>(`/admin/notifications/rules/${rule.key}/audience`, { auth: true });
      message = `${rule.label}: ${res.count} member${res.count === 1 ? '' : 's'} would receive this right now.`;
    } catch (error) {
      message = error instanceof Error ? error.message : 'Could not resolve the audience.';
    } finally {
      busy = '';
    }
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
            variables: announceVars.split('|').map((v) => v.trim()).filter(Boolean),
            note: announceNote || undefined
          }
        }
      );
      message = summary.reason ?? `Sent to ${summary.sent} of ${summary.audience} — ${summary.skipped} skipped, ${summary.failed} failed.`;
      announceNote = '';
      await load();
    } catch (error) {
      message = error instanceof Error ? error.message : 'Could not send the announcement.';
    } finally {
      busy = '';
    }
  };

  onMount(() => {
    if ($authReady && $user?.role !== 'admin') return;
    void load();
  });
</script>

<AdminTabs />

<div class="mx-auto max-w-5xl px-4 py-6 space-y-6">
  <header class="flex items-start gap-3">
    <MessageCircle class="mt-1 size-6 text-emerald-400" />
    <div>
      <h1 class="text-xl font-bold">WhatsApp notifications</h1>
      <p class="text-sm text-slate-400">
        Delivered through Makutano Connect, which owns the number, the templates and Meta compliance.
      </p>
    </div>
  </header>

  {#if !connected}
    <div class="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
      <ShieldAlert class="mt-0.5 size-5 shrink-0 text-amber-400" />
      <div>
        <p class="font-semibold text-amber-300">Not connected yet</p>
        <p class="text-slate-300">
          Set <code class="rounded bg-slate-800 px-1">CONNECT_API_KEY</code> on the backend. Until then rules can be
          edited but nothing is ever sent.
        </p>
      </div>
    </div>
  {/if}

  <div class="grid gap-4 sm:grid-cols-3">
    <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p class="text-xs uppercase tracking-wide text-slate-500">Members opted in</p>
      <p class="mt-1 text-2xl font-bold">{optedIn}</p>
      <p class="mt-1 text-xs text-slate-500">Only these people can ever be messaged.</p>
    </div>
    <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p class="text-xs uppercase tracking-wide text-slate-500">Approved templates</p>
      <p class="mt-1 text-2xl font-bold">{approved.length}</p>
      <p class="mt-1 text-xs text-slate-500">{templates.length} total in Connect.</p>
    </div>
    <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p class="text-xs uppercase tracking-wide text-slate-500">Connection</p>
      <p class="mt-1 text-2xl font-bold">{connected ? 'Live' : 'Off'}</p>
    </div>
  </div>

  {#if message}
    <p class="rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm text-slate-200">{message}</p>
  {/if}

  <section class="space-y-3">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Rules</h2>
    {#if loading}
      <p class="text-sm text-slate-500">Loading…</p>
    {:else}
      {#each rules as rule (rule.key)}
        <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-semibold">{rule.label}</p>
              <p class="text-sm text-slate-400">{rule.description}</p>
            </div>
            <button
              class="rounded-lg px-3 py-1.5 text-sm font-semibold {rule.enabled
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-slate-800 text-slate-400'}"
              disabled={busy === rule.key}
              onclick={() => saveRule(rule, { enabled: !rule.enabled })}
            >
              {rule.enabled ? 'On' : 'Off'}
            </button>
          </div>

          <div class="mt-3 grid gap-3 sm:grid-cols-3">
            <label class="text-xs text-slate-400">
              Template
              <select
                class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                value={rule.template_name ?? ''}
                onchange={(e) => saveRule(rule, { template_name: (e.currentTarget as HTMLSelectElement).value || null })}
              >
                <option value="">— none —</option>
                {#each approved as t (t.name)}
                  <option value={t.name}>{t.name}</option>
                {/each}
              </select>
            </label>
            <label class="text-xs text-slate-400">
              Plans (blank = everyone)
              <input
                class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                value={rule.plan_codes.join(', ')}
                onchange={(e) =>
                  saveRule(rule, {
                    plan_codes: (e.currentTarget as HTMLInputElement).value
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean)
                  })}
              />
            </label>
            <div class="flex items-end">
              <button
                class="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
                disabled={busy === rule.key}
                onclick={() => previewAudience(rule)}
              >
                <Users class="size-4" /> Who gets this?
              </button>
            </div>
          </div>

          {#if rule.enabled && !rule.template_name}
            <p class="mt-3 text-xs text-amber-300">
              This rule is on but has no approved template, so it cannot send. Business-initiated WhatsApp messages must
              be templates.
            </p>
          {/if}
        </div>
      {/each}
    {/if}
  </section>

  <section class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
    <h2 class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
      <Send class="size-4" /> Send an announcement
    </h2>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <label class="text-xs text-slate-400">
        Approved template
        <select
          bind:value={announceTemplate}
          class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
        >
          <option value="">— choose —</option>
          {#each approved as t (t.name)}
            <option value={t.name}>{t.name}</option>
          {/each}
        </select>
      </label>
      <label class="text-xs text-slate-400">
        Variables, separated by |
        <input
          bind:value={announceVars}
          placeholder="Weekly | Risk-off | pastatrade.com/reports"
          class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
        />
      </label>
    </div>
    <input
      bind:value={announceNote}
      placeholder="Internal note (why you sent this)"
      class="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
    />
    <button
      class="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
      disabled={!connected || !announceTemplate || busy === 'announce'}
      onclick={sendAnnouncement}
    >
      <Send class="size-4" />
      {busy === 'announce' ? 'Sending…' : 'Send to opted-in members'}
    </button>
  </section>

  <section class="space-y-2">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Recent sends</h2>
    {#if batches.length === 0}
      <p class="text-sm text-slate-500">Nothing has been sent yet.</p>
    {:else}
      <div class="overflow-x-auto rounded-xl border border-slate-800">
        <table class="w-full text-sm">
          <thead class="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th class="p-3">When</th><th class="p-3">Rule</th><th class="p-3">Audience</th><th class="p-3">Sent</th><th class="p-3">Skipped</th><th class="p-3">Failed</th></tr>
          </thead>
          <tbody>
            {#each batches as b (b.id)}
              <tr class="border-t border-slate-800">
                <td class="p-3 text-slate-400">{new Date(b.created_at).toLocaleString()}</td>
                <td class="p-3">{b.rule_key}</td>
                <td class="p-3">{b.audience_count}</td>
                <td class="p-3 text-emerald-300">{b.sent_count}</td>
                <td class="p-3 text-slate-400">{b.skipped_count}</td>
                <td class="p-3 {b.failed_count ? 'text-rose-300' : 'text-slate-500'}">{b.failed_count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <p class="flex items-start gap-2 text-xs text-slate-500">
    <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-slate-600" />
    Members opt in themselves under Settings. A number captured for mobile-money checkout is not consent to be
    messaged, and is never used here.
  </p>
</div>
