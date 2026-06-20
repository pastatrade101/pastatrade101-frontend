<script lang="ts">
  // Pastatrade brand mark — a rising logarithmic-regression curve with value
  // bands. Inherits color from the parent (use text-mint). Pure inline SVG so it
  // stays crisp at any size and works in the header, auth shell and reports.
  let { class: cls = 'h-5 w-5' }: { class?: string } = $props();
</script>

<svg viewBox="0 0 24 24" fill="none" class={cls} aria-hidden="true">
  <path d="M2 22 C8 20 13 14 22 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.35" />
  <path d="M2 17 C8 13 13 6 22 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.35" />
  <path d="M2 20 C8 17 13 10 22 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
  <circle cx="22" cy="4" r="1.6" fill="currentColor" />
</svg>
