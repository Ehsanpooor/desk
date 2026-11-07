/**
 * Daily horoscope content, as in the prototype: each reading is put together
 * on the device from a small pool, the same for everyone with that sign on
 * that day. Production can swap `reading()` for
 * GET /api/desk/horoscope?sign=…&date=… (one reading per sign per day).
 * Sign colours live in globals.css under `.dw-hs[data-sign=…]`.
 */

export type SignId =
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces';

export interface Sign {
  id: SignId;
  name: string;
  /** Followed by U+FE0E so it renders as text, not emoji. */
  glyph: string;
  range: string;
  element: 'Fire' | 'Earth' | 'Air' | 'Water';
}

const T = '︎';

export const SIGNS: Sign[] = [
  { id: 'aries', name: 'Aries', glyph: `♈${T}`, range: 'Mar 21 – Apr 19', element: 'Fire' },
  { id: 'taurus', name: 'Taurus', glyph: `♉${T}`, range: 'Apr 20 – May 20', element: 'Earth' },
  { id: 'gemini', name: 'Gemini', glyph: `♊${T}`, range: 'May 21 – Jun 20', element: 'Air' },
  { id: 'cancer', name: 'Cancer', glyph: `♋${T}`, range: 'Jun 21 – Jul 22', element: 'Water' },
  { id: 'leo', name: 'Leo', glyph: `♌${T}`, range: 'Jul 23 – Aug 22', element: 'Fire' },
  { id: 'virgo', name: 'Virgo', glyph: `♍${T}`, range: 'Aug 23 – Sep 22', element: 'Earth' },
  { id: 'libra', name: 'Libra', glyph: `♎${T}`, range: 'Sep 23 – Oct 22', element: 'Air' },
  { id: 'scorpio', name: 'Scorpio', glyph: `♏${T}`, range: 'Oct 23 – Nov 21', element: 'Water' },
  { id: 'sagittarius', name: 'Sagittarius', glyph: `♐${T}`, range: 'Nov 22 – Dec 21', element: 'Fire' },
  { id: 'capricorn', name: 'Capricorn', glyph: `♑${T}`, range: 'Dec 22 – Jan 19', element: 'Earth' },
  { id: 'aquarius', name: 'Aquarius', glyph: `♒${T}`, range: 'Jan 20 – Feb 18', element: 'Air' },
  { id: 'pisces', name: 'Pisces', glyph: `♓${T}`, range: 'Feb 19 – Mar 20', element: 'Water' },
];

export function isSignId(v: unknown): v is SignId {
  return typeof v === 'string' && SIGNS.some((s) => s.id === v);
}

const TRAIT: Record<SignId, string> = {
  aries: 'Your drive is contagious today.',
  taurus: 'Steady wins the day for you.',
  gemini: 'Your curiosity opens a door today.',
  cancer: 'Your instincts about people are spot on today.',
  leo: 'People notice your warmth today.',
  virgo: 'Your eye for detail pays off today.',
  libra: 'You are the calm in the room today.',
  scorpio: 'Your focus is sharp today.',
  sagittarius: 'A fresh idea finds you today.',
  capricorn: 'Your patience is quietly building something.',
  aquarius: 'Your different angle is the useful one today.',
  pisces: 'Your kindness lands where it is needed today.',
};

const DAY = [
  'A conversation you have been putting off goes better than expected, so start it before lunch.',
  'Someone on the team could use a hand this afternoon; offering it will make your own day lighter.',
  'An unexpected gap in the schedule turns into the best part of the day.',
  'A small win early on sets the tone, so tackle the easy task first and build from there.',
  'You may feel pulled in two directions; pick one, finish it, then turn to the other.',
  'A message from someone you have not heard from in a while brings good news.',
  'Patience with a tricky question pays off; the answer is simpler than it first looks.',
  'Your plans may shift mid-morning, and the new version turns out better.',
  'A compliment you give today will be remembered for a long time.',
  'Trust the routine today; it gives you room to handle the one surprise that comes.',
  'You will spot something others missed; say it out loud, kindly.',
  'Energy dips after lunch, so save the creative work for the morning.',
  'A good laugh with a coworker resets the whole afternoon.',
  'Saying a clear no to one thing makes room for a better yes.',
];

const TIP = [
  'Write down the one thing that matters most and do it first.',
  'Take the long way to refill your water bottle; a short walk clears your head.',
  'Answer the oldest message in your inbox before noon.',
  'Thank someone by name today.',
  'Leave five minutes early tonight.',
  'Tidy your desk before you leave; tomorrow-you will be grateful.',
  'Ask one more question before you decide.',
  'Step outside for a few minutes of daylight.',
  'Put your phone face down during your next conversation.',
  'Finish the small task you keep postponing.',
  'Eat lunch away from the screen.',
  'Stretch your shoulders between patients or calls.',
];

const MOOD = ['Calm', 'Bright', 'Focused', 'Playful', 'Grounded', 'Hopeful', 'Curious', 'Confident', 'Gentle', 'Bold'];

/** Lucky colours are content: a name and the swatch shown next to it. */
const COLOR: [string, string][] = [
  ['Sea glass', '#9fd8cb'],
  ['Coral', '#ff8a73'],
  ['Sky blue', '#8cc4f0'],
  ['Sage', '#a9c49a'],
  ['Lavender', '#c3b3ea'],
  ['Marigold', '#f5b83d'],
  ['Rose', '#f2a7bd'],
  ['Teal', '#2fb5a8'],
  ['Plum', '#8e4f86'],
  ['Sand', '#e4cfa6'],
];

const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const pick = <T,>(arr: T[], seed: number): T => arr[seed % arr.length] as T;

export const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export interface Reading {
  text: string;
  tip: string;
  mood: string;
  num: number;
  color: { name: string; swatch: string };
}

export function reading(sign: SignId, d: Date): Reading {
  const h = hash(`${sign}|${ymd(d)}`);
  const h2 = hash(`${ymd(d)}#${sign}`);
  const [name, swatch] = pick(COLOR, h >>> 9);
  return {
    text: `${TRAIT[sign]} ${pick(DAY, h)}`,
    tip: pick(TIP, h2 >>> 3),
    mood: pick(MOOD, h >>> 5),
    num: 1 + (h2 % 49),
    color: { name, swatch },
  };
}

export function sunSign(d: Date): SignId {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  const cut: [number, SignId][] = [
    [120, 'capricorn'],
    [219, 'aquarius'],
    [320, 'pisces'],
    [420, 'aries'],
    [521, 'taurus'],
    [621, 'gemini'],
    [723, 'cancer'],
    [823, 'leo'],
    [923, 'virgo'],
    [1023, 'libra'],
    [1122, 'scorpio'],
    [1222, 'sagittarius'],
    [1232, 'capricorn'],
  ];
  return cut.find(([c]) => md < c)?.[1] ?? 'capricorn';
}

export const ARTS: ['portraits' | 'origami', string][] = [
  ['portraits', 'Portraits'],
  ['origami', 'Origami'],
];

export function artUrl(art: 'portraits' | 'origami', sign: SignId): string {
  return `/widgets/horoscope/${art}/${sign}.webp`;
}
