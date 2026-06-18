<script lang="ts">
  interface Props {
    status?: string;
    audience?: string;
    type?: string;
  }
  let { status, audience, type }: Props = $props();

  const statusClass = (s: string) =>
    s === 'published'
      ? 'bg-mint/15 text-mint'
      : s === 'archived'
        ? 'bg-edge text-muted'
        : s === 'reviewed'
          ? 'bg-accent/15 text-accent'
          : s === 'generated'
            ? 'bg-warn/15 text-warn'
            : 'bg-panel-2 text-muted';
</script>

{#if type}<span class="pill bg-panel-2 capitalize text-soft">{type}</span>{/if}
{#if audience}<span class="pill bg-edge capitalize text-muted">{audience}</span>{/if}
{#if status}<span class="pill capitalize {statusClass(status)}">{status}</span>{/if}
