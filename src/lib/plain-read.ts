// The plain read: a short, human summary of the signals a module already shows,
// written by fixed rules — no model, no network call, the same words every time
// for the same data. It counts which signals look supportive and which flag
// caution, names the strongest of each, and never adds a number, a forecast or a
// buy/sell call that is not already on the page.

export type ReadLang = 'en' | 'sw';
export type ReadStance = 'positive' | 'neutral' | 'caution' | 'negative';

export interface ReadSignal {
  name: string;
  label?: string | null;
  value?: string | number | null;
  meaning?: string | null;
  /** The page's own colour/tone word for the signal ('good', 'warn', 'danger', 'neutral', …). */
  tone?: string | null;
}

export interface PlainRead {
  stance: ReadStance;
  headline: string;
  body: string;
  /** Signals that look supportive / flag caution / were used. */
  supportive: number;
  warnings: number;
  total: number;
}

type Kind = 'good' | 'warn' | 'bad' | 'neutral';

// Pages pass their own tone words; these are every one they use today.
const GOOD = new Set(['good', 'ok', 'pos', 'positive', 'bullish', 'breakout', 'mint', 'text-mint', 'bg-mint']);
const WARN = new Set(['warn', 'caution', 'mid', 'text-warn', 'bg-warn']);
const BAD = new Set(['bad', 'danger', 'negative', 'bearish', 'weakness', 'text-danger', 'bg-danger']);

const kindOf = (tone: string | null | undefined): Kind => {
  const k = String(tone ?? '').toLowerCase();
  return GOOD.has(k) ? 'good' : BAD.has(k) ? 'bad' : WARN.has(k) ? 'warn' : 'neutral';
};

/** Signals with a real reading (the same filter the page cards use). */
export const usableSignals = (signals: ReadSignal[]): ReadSignal[] =>
  (signals ?? []).filter((s) => s?.name && s?.label && String(s.label).toLowerCase() !== 'unavailable');

const sentence = (s: string) => {
  const t = s.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

/** "BTC risk — Low (24/100)": the value only when it adds something short. */
const describe = (s: ReadSignal) => {
  const label = String(s.label).trim();
  const value = s.value == null ? '' : String(s.value).trim();
  const showValue = value && value.length <= 24 && !label.toLowerCase().includes(value.toLowerCase());
  return `${s.name} — ${label}${showValue ? ` (${value})` : ''}`;
};

/** The signal's own explanation, when it is short enough to sit in a summary. */
const why = (s: ReadSignal) => {
  const m = String(s.meaning ?? '').trim();
  return m && m.length <= 160 ? ` ${sentence(m)}` : '';
};

const TEXT = {
  en: {
    head: {
      quiet: 'No strong signal either way',
      supportive: 'Signals lean supportive',
      mostly: 'Mostly supportive, with something to watch',
      mixed: 'Mixed signals — no clear edge',
      warnings: 'Some warnings to watch',
      caution: 'Most signals flag caution'
    },
    tally: (g: number, w: number, n: number): string => {
      if (!g && !w) return n === 1 ? 'The one signal here is neutral.' : `All ${n} signals are neutral right now.`;
      if (g === n) return n === 1 ? 'The one signal here looks supportive.' : `All ${n} signals look supportive.`;
      if (w === n) return n === 1 ? 'The one signal here flags caution.' : `All ${n} signals flag caution.`;
      if (!w) return `${g} of ${n} signals ${g === 1 ? 'looks' : 'look'} supportive and none flags caution.`;
      if (!g) return `${w} of ${n} signals ${w === 1 ? 'flags' : 'flag'} caution and none looks clearly supportive.`;
      return `${g} of ${n} signals ${g === 1 ? 'looks' : 'look'} supportive and ${w} ${w === 1 ? 'flags' : 'flag'} caution.`;
    },
    lead: 'Leading the way:',
    watch: 'The one to watch:',
    main: 'The main reading:',
    footer: 'Written by Pastatrade’s fixed rules from the signals on this page — not a forecast, not financial advice.'
  },
  sw: {
    head: {
      quiet: 'Hakuna ishara kali upande wowote',
      supportive: 'Ishara zinaelekea kuunga mkono',
      mostly: 'Nyingi zinaunga mkono, kuna cha kufuatilia',
      mixed: 'Ishara zimechanganyika — hakuna mwelekeo wazi',
      warnings: 'Kuna tahadhari za kufuatilia',
      caution: 'Ishara nyingi zinaonyesha tahadhari'
    },
    tally: (g: number, w: number, n: number): string => {
      const support = (k: number) => (k === 1 ? 'inaunga mkono' : 'zinaunga mkono');
      const flag = (k: number) => (k === 1 ? 'inaashiria tahadhari' : 'zinaashiria tahadhari');
      if (!g && !w) return n === 1 ? 'Ishara pekee hapa haionyeshi mwelekeo.' : `Ishara zote ${n} hazionyeshi mwelekeo kwa sasa.`;
      if (g === n) return n === 1 ? 'Ishara pekee hapa inaunga mkono.' : `Ishara zote ${n} zinaunga mkono.`;
      if (w === n) return n === 1 ? 'Ishara pekee hapa inaashiria tahadhari.' : `Ishara zote ${n} zinaashiria tahadhari.`;
      if (!w) return `Ishara ${g} kati ya ${n} ${support(g)}, na hakuna inayoashiria tahadhari.`;
      if (!g) return `Ishara ${w} kati ya ${n} ${flag(w)}, na hakuna inayounga mkono waziwazi.`;
      return `Ishara ${g} kati ya ${n} ${support(g)}, na ${w} ${flag(w)}.`;
    },
    lead: 'Inayoongoza:',
    watch: 'Ya kufuatilia:',
    main: 'Kinachoonekana zaidi:',
    footer: 'Imeandikwa na kanuni za Pastatrade kutoka kwenye ishara za ukurasa huu — si utabiri, si ushauri wa kifedha.'
  }
} as const;

/** The footer line shown under every plain read. */
export const plainReadFooter = (lang: ReadLang) => TEXT[lang].footer;

/** Sum up a module's signals in a headline and two to four plain sentences, or null when there is nothing to read. */
export const buildPlainRead = (signals: ReadSignal[], lang: ReadLang = 'en'): PlainRead | null => {
  const usable = usableSignals(signals);
  if (!usable.length) return null;
  const T = TEXT[lang];

  const kinds = usable.map((s) => kindOf(s.tone));
  const good = usable.filter((_, i) => kinds[i] === 'good');
  const bad = usable.filter((_, i) => kinds[i] === 'bad');
  const warn = usable.filter((_, i) => kinds[i] === 'warn');
  const g = good.length;
  const w = bad.length + warn.length;
  const n = usable.length;

  const verdict = (): [ReadStance, string] => {
    if (!g && !w) return ['neutral', T.head.quiet];
    if (!w) return ['positive', T.head.supportive];
    if (g > w) return ['positive', T.head.mostly];
    if (g === w) return ['neutral', T.head.mixed];
    return bad.length ? ['negative', T.head.caution] : ['caution', T.head.warnings];
  };
  const [stance, headline] = verdict();

  // Pages list their signals most important first, so the first of each kind leads.
  const parts: string[] = [T.tally(g, w, n)];
  const watch = bad[0] ?? warn[0];
  if (good[0]) parts.push(`${T.lead} ${describe(good[0])}.${why(good[0])}`);
  if (watch) parts.push(`${T.watch} ${describe(watch)}.${why(watch)}`);
  if (!good[0] && !watch) parts.push(`${T.main} ${describe(usable[0])}.${why(usable[0])}`);

  return { stance, headline, body: parts.join(' '), supportive: g, warnings: w, total: n };
};
