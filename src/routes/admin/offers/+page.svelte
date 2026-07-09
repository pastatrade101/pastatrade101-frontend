<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { X, Plus, Pencil, Trash2, Tag } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import { fmtMoney } from '$lib/format';
  import AdminTabs from '$lib/components/AdminTabs.svelte';

  type Status = 'active' | 'scheduled' | 'expired' | 'disabled';
  interface AdminOffer {
    id: string;
    plan_id: string;
    billing_interval: string;
    offer_price: number;
    original_price: number;
    offer_label: string;
    starts_at: string;
    ends_at: string;
    is_active: boolean;
    plan_name: string | null;
    plan_slug: string | null;
    status: Status;
  }
  interface AdminPlan {
    id: string;
    name: string;
    slug: string;
    monthly_price: number;
    yearly_price: number;
    currency: string;
  }

  const LABEL_PRESETS = ['Limited Offer', 'Launch Offer', '50% OFF', 'New Year Offer', 'Ramadan Offer'];
  const STATUS_TABS: { key: Status | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'expired', label: 'Expired' },
    { key: 'disabled', label: 'Disabled' }
  ];
  const STATUS_TONE: Record<Status, string> = {
    active: 'bg-mint/15 text-mint',
    scheduled: 'bg-accent/15 text-accent',
    expired: 'bg-edge text-muted',
    disabled: 'bg-warn/15 text-warn'
  };

  let plans = $state<AdminPlan[]>([]);
  let offersList = $state<AdminOffer[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let tab = $state<Status | 'all'>('all');

  // Toast
  let toast = $state<{ text: string; tone: 'ok' | 'err' } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout>;
  const showToast = (text: string, tone: 'ok' | 'err' = 'ok') => {
    toast = { text, tone };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3200);
  };

  // Admin guard.
  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    const [p, o] = await Promise.all([
      api<{ items: AdminPlan[] }>('/admin/plans', { auth: true }),
      api<{ items: AdminOffer[] }>('/admin/offers', { auth: true })
    ]);
    plans = p.items;
    offersList = o.items;
  };

  onMount(() => {
    load()
      .catch((err) => showToast(err instanceof Error ? err.message : 'Failed to load.', 'err'))
      .finally(() => (loading = false));
  });

  const planCurrency = (planId: string) => plans.find((p) => p.id === planId)?.currency ?? 'TZS';
  const discountPct = (offer: number, original: number) => (original > 0 ? Math.round((1 - offer / original) * 100) : 0);

  const filtered = $derived(tab === 'all' ? offersList : offersList.filter((o) => o.status === tab));
  const countOf = (s: Status) => offersList.filter((o) => o.status === s).length;

  // ── datetime-local <-> ISO ────────────────────────────────────────────────
  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toIso = (local: string) => new Date(local).toISOString();

  // ── Form ──────────────────────────────────────────────────────────────────
  interface Form {
    id: string | null;
    plan_id: string;
    billing_interval: 'monthly' | 'yearly';
    offer_price: number | string;
    original_price: number | string;
    offer_label: string;
    starts_at: string;
    ends_at: string;
    is_active: boolean;
  }
  let form = $state<Form | null>(null);

  const planPrice = (planId: string, interval: 'monthly' | 'yearly') => {
    const p = plans.find((x) => x.id === planId);
    if (!p) return 0;
    return interval === 'yearly' ? p.yearly_price : p.monthly_price;
  };

  const openNew = () => {
    const firstPaid = plans.find((p) => p.monthly_price > 0) ?? plans[0];
    const now = new Date();
    const week = new Date(Date.now() + 7 * 86_400_000);
    form = {
      id: null,
      plan_id: firstPaid?.id ?? '',
      billing_interval: 'monthly',
      offer_price: '',
      original_price: firstPaid ? firstPaid.monthly_price : '',
      offer_label: 'Limited Offer',
      starts_at: toLocalInput(now.toISOString()),
      ends_at: toLocalInput(week.toISOString()),
      is_active: true
    };
  };

  const openEdit = (o: AdminOffer) => {
    form = {
      id: o.id,
      plan_id: o.plan_id,
      billing_interval: o.billing_interval === 'yearly' ? 'yearly' : 'monthly',
      offer_price: o.offer_price,
      original_price: o.original_price,
      offer_label: o.offer_label,
      starts_at: toLocalInput(o.starts_at),
      ends_at: toLocalInput(o.ends_at),
      is_active: o.is_active
    };
  };

  // When the plan or interval changes, refresh the "normal price" reference.
  const syncOriginal = () => {
    if (form) form.original_price = planPrice(form.plan_id, form.billing_interval);
  };

  const validate = (f: Form): string | null => {
    if (!f.plan_id) return 'Pick a plan.';
    if (!f.offer_label.trim()) return 'Add an offer label.';
    if (Number(f.original_price) <= 0) return 'Original price must be greater than 0.';
    if (Number(f.offer_price) < 0) return 'Offer price cannot be negative.';
    if (Number(f.offer_price) > Number(f.original_price)) return 'Offer price cannot be higher than the original price.';
    if (new Date(f.ends_at).getTime() <= new Date(f.starts_at).getTime()) return 'End time must be after the start time.';
    return null;
  };

  const save = async () => {
    if (!form) return;
    const err = validate(form);
    if (err) return showToast(err, 'err');
    saving = true;
    try {
      const body = {
        plan_id: form.plan_id,
        billing_interval: form.billing_interval,
        offer_price: Number(form.offer_price),
        original_price: Number(form.original_price),
        offer_label: form.offer_label.trim(),
        starts_at: toIso(form.starts_at),
        ends_at: toIso(form.ends_at),
        is_active: form.is_active
      };
      if (form.id) await api(`/admin/offers/${form.id}`, { method: 'PATCH', body, auth: true });
      else await api('/admin/offers', { method: 'POST', body, auth: true });
      form = null;
      await load();
      showToast('Offer saved.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed.', 'err');
    } finally {
      saving = false;
    }
  };

  // Quick enable/disable toggle from the list.
  const toggleActive = async (o: AdminOffer) => {
    try {
      await api(`/admin/offers/${o.id}`, { method: 'PATCH', body: { is_active: !o.is_active }, auth: true });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Update failed.', 'err');
    }
  };

  const remove = async (o: AdminOffer) => {
    if (!confirm(`Delete the “${o.offer_label}” offer on ${o.plan_name ?? 'this plan'}? This can't be undone.`)) return;
    try {
      await api(`/admin/offers/${o.id}`, { method: 'DELETE', auth: true });
      form = null;
      await load();
      showToast('Offer deleted.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed.', 'err');
    }
  };

  const fmtWindow = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<!-- Toast -->
{#if toast}
  <div class="fixed left-1/2 top-4 z-[60] -translate-x-1/2" transition:fly={{ y: -16, duration: 200 }}>
    <div
      class="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-2xl {toast.tone === 'ok' ? 'border-mint/40 text-mint' : 'border-danger/40 text-danger'}"
      style="background: rgb(var(--c-panel))"
    >
      <span class="h-2 w-2 rounded-full {toast.tone === 'ok' ? 'bg-mint' : 'bg-danger'}"></span>{toast.text}
    </div>
  </div>
{/if}

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Pricing Offers</h1>
  <p class="text-sm text-muted">Temporary discounts shown on the pricing page with a countdown. The real plan price is never changed — offers only override it while live.</p>
</header>
<AdminTabs />

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
  <div class="flex flex-wrap gap-1 text-sm">
    {#each STATUS_TABS as st}
      <button
        class="rounded-lg px-3 py-1.5 font-medium transition {tab === st.key ? 'bg-accent/15 text-accent' : 'text-muted hover:text-soft'}"
        onclick={() => (tab = st.key)}
      >
        {st.label}{#if st.key !== 'all'}<span class="ml-1 text-xs opacity-70">{countOf(st.key as Status)}</span>{/if}
      </button>
    {/each}
  </div>
  <button class="btn-primary" onclick={openNew} disabled={loading || !plans.length}><Plus class="h-4 w-4" /> New offer</button>
</div>

{#if loading}
  <div class="card text-center text-muted">Loading offers…</div>
{:else if !filtered.length}
  <div class="card text-center text-muted">
    {tab === 'all' ? 'No offers yet. Create one to run a limited-time discount.' : `No ${tab} offers.`}
  </div>
{:else}
  <div class="space-y-3">
    {#each filtered as o (o.id)}
      {@const cur = planCurrency(o.plan_id)}
      <div class="card flex flex-wrap items-center justify-between gap-3 {o.status === 'expired' || o.status === 'disabled' ? 'opacity-70' : ''}">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="pill bg-danger/15 text-danger"><Tag class="h-3 w-3" /> {o.offer_label}</span>
            <span class="font-semibold text-strong">{o.plan_name ?? '—'}</span>
            <span class="pill {STATUS_TONE[o.status]} capitalize">{o.status}</span>
            <span class="pill bg-edge text-muted">{o.billing_interval}</span>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span class="font-semibold text-strong">{fmtMoney(o.offer_price, cur)}</span>
            <span class="text-muted line-through">{fmtMoney(o.original_price, cur)}</span>
            {#if discountPct(o.offer_price, o.original_price) > 0}<span class="pill bg-mint/15 text-mint">−{discountPct(o.offer_price, o.original_price)}%</span>{/if}
          </div>
          <p class="mt-1 text-xs text-muted">{fmtWindow(o.starts_at)} → {fmtWindow(o.ends_at)}</p>
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={o.is_active} onchange={() => toggleActive(o)} /> Enabled
          </label>
          <button class="btn-ghost px-3 py-1.5 text-xs" onclick={() => openEdit(o)}><Pencil class="h-3.5 w-3.5" /> Edit</button>
          <button class="btn-ghost px-2.5 py-1.5 text-xs text-danger" onclick={() => remove(o)} aria-label="Delete offer"><Trash2 class="h-3.5 w-3.5" /></button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Create / edit modal -->
{#if form}
  {@const preview = Number(form.offer_price) >= 0 && Number(form.original_price) > 0 ? discountPct(Number(form.offer_price), Number(form.original_price)) : 0}
  <div class="fixed inset-0 z-40 bg-black/50" onclick={() => (form = null)} role="presentation"></div>
  <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
    <div class="my-8 w-full max-w-lg rounded-2xl border border-edge bg-panel shadow-2xl" transition:fly={{ y: 16, duration: 180 }}>
      <div class="flex items-center justify-between border-b border-edge px-5 py-3.5">
        <h2 class="font-semibold text-strong">{form.id ? 'Edit offer' : 'New offer'}</h2>
        <button class="text-muted hover:text-strong" onclick={() => (form = null)} aria-label="Close"><X class="h-5 w-5" /></button>
      </div>

      <div class="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block text-xs text-muted">Plan
            <select class="input mt-1" bind:value={form.plan_id} onchange={syncOriginal}>
              {#each plans as p}<option value={p.id}>{p.name}</option>{/each}
            </select>
          </label>
          <label class="block text-xs text-muted">Billing interval
            <select class="input mt-1" bind:value={form.billing_interval} onchange={syncOriginal}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label class="block text-xs text-muted">Original price <span class="text-muted/70">(reference)</span>
            <input type="number" min="0" class="input mt-1" bind:value={form.original_price} />
          </label>
          <label class="block text-xs text-muted">Offer price
            <input type="number" min="0" class="input mt-1" bind:value={form.offer_price} />
          </label>
        </div>

        <div>
          <label class="block text-xs text-muted" for="offlabel">Offer label</label>
          <input id="offlabel" class="input mt-1" placeholder="Limited Offer" bind:value={form.offer_label} />
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each LABEL_PRESETS as preset}
              <button
                type="button"
                class="rounded-full border px-2.5 py-1 text-xs transition {form.offer_label === preset ? 'border-danger/50 bg-danger/15 text-danger' : 'border-edge text-muted hover:bg-panel-2'}"
                onclick={() => form && (form.offer_label = preset)}
              >
                {preset}
              </button>
            {/each}
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block text-xs text-muted">Starts at
            <input type="datetime-local" class="input mt-1" bind:value={form.starts_at} />
          </label>
          <label class="block text-xs text-muted">Ends at
            <input type="datetime-local" class="input mt-1" bind:value={form.ends_at} />
          </label>
        </div>

        <label class="flex items-center gap-2 text-sm text-soft"><input type="checkbox" bind:checked={form.is_active} /> Enabled (turn off to hide without deleting)</label>

        {#if preview > 0}
          <p class="rounded-lg border border-mint/25 bg-mint/5 px-3 py-2 text-xs text-soft">Customers save <span class="font-semibold text-mint">{preview}%</span> while this offer is live.</p>
        {/if}
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-edge px-5 py-3.5">
        {#if form.id}
          <button class="btn-ghost text-danger" onclick={() => { const o = offersList.find((x) => x.id === form?.id); if (o) remove(o); }}>Delete</button>
        {:else}<span></span>{/if}
        <div class="flex items-center gap-2">
          <button class="btn-ghost" onclick={() => (form = null)}>Cancel</button>
          <button class="btn-primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save offer'}</button>
        </div>
      </div>
    </div>
  </div>
{/if}
