import type { Config } from 'tailwindcss';

// Colors are driven by CSS variables (RGB triplets in app.css) so the whole app
// can switch between dark and light at the core level via [data-theme].
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        ink: v('ink'),
        panel: v('panel'),
        'panel-2': v('panel-2'),
        edge: v('edge'),
        muted: v('muted'),
        // theme-aware text tokens (replace hardcoded white/slate).
        // Named "body" not "base" to avoid clashing with Tailwind's text-base font size.
        strong: v('strong'),
        body: v('body'),
        soft: v('soft'),
        // accents
        mint: v('mint'),
        'mint-dim': v('mint-dim'),
        danger: v('danger'),
        warn: v('warn'),
        accent: v('accent')
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
} satisfies Config;
