<script lang="ts">
  // Lightweight YouTube facade: shows the thumbnail + play button, and only
  // loads the (heavy) iframe once the user clicks — keeps the landing page fast.
  // `cta` swaps the centred play button for a corner pill (for thumbnails with
  // text in the middle) and hides the title overlay; `eager` is for the hero.
  let {
    id,
    title = '',
    views = null,
    duration = '',
    cta = '',
    featured = false,
    compact = false,
    fill = false,
    eager = false,
    caption = true
  }: {
    id: string;
    title?: string;
    views?: number | null;
    duration?: string;
    cta?: string;
    featured?: boolean;
    compact?: boolean;
    fill?: boolean;
    eager?: boolean;
    /** Title text over the thumbnail; off when the page prints it under the video. */
    caption?: boolean;
  } = $props();
  let playing = $state(false);
  const fmtViews = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : `${n}`);
  // Small cards don't need the 1280px frame.
  const thumb = $derived(`https://i.ytimg.com/vi_webp/${id}/${compact ? 'sddefault' : 'maxresdefault'}.webp`);
</script>

<div class="group relative overflow-hidden border border-white/15 bg-panel-2 {fill ? 'aspect-video lg:h-full lg:flex-1 lg:aspect-auto' : 'aspect-video'} {compact ? 'rounded-md' : 'rounded-lg'}">
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
        src={thumb}
        alt={title}
        width="1280"
        height="720"
        loading={eager ? 'eager' : 'lazy'}
        fetchpriority={eager ? 'high' : 'auto'}
        class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
      <span class="absolute inset-0 bg-gradient-to-t {cta || !caption ? 'from-black/35 via-transparent' : 'from-black/75 via-black/10'} to-black/10"></span>
      {#if views != null}
        <span class="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
          <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
          {fmtViews(views)} views
        </span>
      {/if}
      {#if duration}
        <span class="absolute right-2.5 top-2.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{duration}</span>
      {/if}
      {#if cta}
        <!-- Corner play pill: leaves the thumbnail's own headline clear -->
        <span class="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/95 py-1 pl-1 pr-3 text-xs font-semibold text-gray-900 shadow-lg ring-1 ring-black/10 transition duration-300 group-hover:bg-white sm:bottom-4 sm:left-4 sm:gap-2 sm:py-1.5 sm:pl-1.5 sm:pr-4 sm:text-sm">
          <span class="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 transition duration-300 group-hover:scale-110 sm:h-7 sm:w-7">
            <svg viewBox="0 0 24 24" class="ml-0.5 h-3 w-3 sm:h-3.5 sm:w-3.5" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </span>
          {cta}
        </span>
      {:else}
        <!-- Play button -->
        <span class="absolute left-1/2 top-1/2 flex {featured ? 'h-14 w-14' : 'h-11 w-11'} -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 ring-1 ring-black/10 backdrop-blur transition duration-300 group-hover:scale-110 group-hover:bg-white">
          <svg viewBox="0 0 24 24" class="ml-0.5 {featured ? 'h-6 w-6' : 'h-5 w-5'}" fill="#111827" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        </span>
        {#if title && caption}
          <span class="absolute inset-x-0 bottom-0 line-clamp-2 {featured ? 'px-5 pb-5 pt-12 text-lg sm:text-xl' : compact ? 'px-3 pb-3 pt-8 text-xs sm:text-sm' : 'px-3.5 pb-3 pt-8 text-sm'} font-semibold leading-snug text-white">{title}</span>
        {/if}
      {/if}
    </button>
  {/if}
</div>
