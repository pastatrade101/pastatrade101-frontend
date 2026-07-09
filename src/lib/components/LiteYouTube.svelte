<script lang="ts">
  // Lightweight YouTube facade: shows the thumbnail + play button, and only
  // loads the (heavy) iframe once the user clicks — keeps the landing page fast.
  let {
    id,
    title = '',
    views = null,
    featured = false,
    compact = false,
    fill = false
  }: { id: string; title?: string; views?: number | null; featured?: boolean; compact?: boolean; fill?: boolean } = $props();
  let playing = $state(false);
  const fmtViews = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : `${n}`);
</script>

<div class="group relative overflow-hidden border border-white/15 bg-panel-2 {fill ? 'aspect-video lg:h-full lg:flex-1 lg:aspect-auto' : 'aspect-video'} {compact ? 'rounded-xl' : 'rounded-2xl'} {featured ? 'ring-1 ring-danger/25' : ''}">
  {#if playing}
    <iframe
      class="absolute inset-0 h-full w-full"
      src="https://www.youtube-nocookie.com/embed/{id}?autoplay=1&rel=0&modestbranding=1"
      title={title || 'YouTube video'}
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  {:else}
    <button type="button" class="absolute inset-0 h-full w-full text-left" onclick={() => (playing = true)} aria-label={title ? `Play: ${title}` : 'Play video'}>
      <img
        src="https://i.ytimg.com/vi/{id}/hqdefault.jpg"
        alt={title}
        loading="lazy"
        class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
      <span class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/10"></span>
      {#if views != null}
        <span class="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
          <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
          {fmtViews(views)} views
        </span>
      {/if}
      <!-- Play button -->
      <span class="absolute left-1/2 top-1/2 flex {featured ? 'h-14 w-14' : 'h-11 w-11'} -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 ring-1 ring-black/10 backdrop-blur transition duration-300 group-hover:scale-110 group-hover:bg-white">
        <svg viewBox="0 0 24 24" class="ml-0.5 {featured ? 'h-6 w-6' : 'h-5 w-5'}" fill="#111827" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      </span>
      {#if title}
        <span class="absolute inset-x-0 bottom-0 line-clamp-2 {featured ? 'px-5 pb-5 pt-12 text-lg sm:text-xl' : compact ? 'px-3 pb-3 pt-8 text-xs sm:text-sm' : 'px-3.5 pb-3 pt-8 text-sm'} font-semibold leading-snug text-white">{title}</span>
      {/if}
    </button>
  {/if}
</div>
