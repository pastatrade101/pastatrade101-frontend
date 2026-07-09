<script lang="ts">
  import { page } from '$app/stores';

  // One consistent sub-navigation for the whole admin membership section, so the
  // tabs look and behave identically on every page and always show where you are.
  const tabs = [
    { href: '/admin/revenue', label: 'Revenue' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/subscriptions', label: 'Subscriptions' },
    { href: '/admin/payments', label: 'Payments' },
    { href: '/admin/payment-attempts', label: 'Follow-ups' },
    { href: '/admin/plans', label: 'Plans' },
    { href: '/admin/offers', label: 'Offers' }
  ];

  const path = $derived($page.url.pathname);
  const isActive = (href: string) => path === href || path.startsWith(`${href}/`);
</script>

<nav class="mb-4 flex flex-wrap gap-1 border-b border-edge text-sm">
  {#each tabs as t}
    <a
      href={t.href}
      aria-current={isActive(t.href) ? 'page' : undefined}
      class="-mb-px border-b-2 px-3 py-2 font-medium transition {isActive(t.href) ? 'border-mint text-strong' : 'border-transparent text-muted hover:text-soft'}"
    >
      {t.label}
    </a>
  {/each}
</nav>
