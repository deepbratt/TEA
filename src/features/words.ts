/** Small text helpers shared by the inventory and the docs check. */

const STOP = new Set(
  'a an and are as at be been by can do does done for from has have in into is it its of on or our the their them then this that to was we were will with you your after before all any each every when where which who how what also only just more most some such than very via per built works working page pages app user users using use used able allow allows lets let show shows shown see view new'.split(' '),
);

/** "orders" -> "order", "categories" -> "category", "boxes" -> "box". Good enough for route names. */
export function singular(w: string): string {
  if (w.length <= 3 || /ss$|us$|is$/.test(w)) return w;
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/(x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Lowercase words of a text, singular, without paths and stop words. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(?<![\w.])\/[\w/[\]{}:.-]*/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .map(singular);
}

/** A short id from the start of a text: "Gift cards (not started)" -> "gift-card". */
export function slugify(text: string, max = 3): string {
  const head = text.replace(/\([^)]*\)/g, ' ').split(/[:.;]\s| - | — /)[0]!;
  return words(head).slice(0, max).join('-') || 'feature';
}

export const titleCase = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
