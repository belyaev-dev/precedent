// Turning text into search terms. The same function runs over the cards at build time and over
// the caller's query at request time. Nothing here interprets operators: a query is only ever
// reduced to a short list of lower-case words made of letters and digits, in any script.

export const MAX_QUERY_CHARS = 200;
export const MAX_QUERY_TERMS = 12;
const MAX_TERM_CHARS = 40;

const STOPWORDS = new Set(
  (
    "a about after all also an and any are as at be because been before being both but by can could did do does " +
    "each for from had has have how if in instead into is it its may more most must no not of on once only or other our " +
    "out over should so some such than that the their them then there these they this those through to under " +
    "until up use used using very was we were what when where which while who why will with without would you your " +
    "get got just made make makes much many take took too"
  ).split(" "),
);

const VOWEL = /[aeiouy]/;

function undouble(word: string): string {
  const last = word.at(-1)!;
  return word.length > 3 && last === word.at(-2) && !"aeioulsz".includes(last) ? word.slice(0, -1) : word;
}

/** A deliberately small stemmer: plurals, -ed, -ing and a trailing e. Enough for "queues" to meet "queued". */
export function stem(word: string): string {
  if (word.length <= 3 || /[0-9]/.test(word)) return word;
  let w = word;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (/(ch|sh|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);

  if (w.endsWith("ied") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("ing") && w.length > 5 && VOWEL.test(w.slice(0, -3))) w = undouble(w.slice(0, -3));
  else if (w.endsWith("ed") && !w.endsWith("eed") && w.length > 4 && VOWEL.test(w.slice(0, -2))) w = undouble(w.slice(0, -2));

  if (w.endsWith("e") && w.length > 3) w = w.slice(0, -1);
  return w;
}

/** Letters, digits and the marks that belong to them, in any script. No punctuation, spaces, controls or format characters. */
export const WORD = /[\p{L}\p{N}\p{M}]+/gu;

function words(text: string): { kept: string[]; tooLong: number } {
  const plain = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const kept: string[] = [];
  let tooLong = 0;
  for (const match of plain.matchAll(WORD)) {
    const word = match[0];
    if (word.length > MAX_TERM_CHARS) tooLong += 1;
    else if (word.length >= 2 && !STOPWORDS.has(word)) kept.push(word);
  }
  return { kept, tooLong };
}

/** Lower-case terms, stemmed, without stopwords or single characters. Order kept, duplicates kept. */
export function tokenize(text: string): string[] {
  return words(text).kept.map(stem);
}

export interface QueryTerm {
  /** What is looked up in the index. */
  term: string;
  /** The word as the caller wrote it, lower-cased: letters and digits only, so it is safe to echo. */
  word: string;
}

export interface Query {
  terms: QueryTerm[];
  /** Distinct terms beyond MAX_QUERY_TERMS, which were not searched. */
  dropped: number;
  /** Words over the length limit, which were not searched. */
  tooLong: number;
}

/**
 * The caller's query as at most MAX_QUERY_TERMS distinct terms. A word in any script is kept, so that a
 * word the corpus lacks is reported as lacking instead of vanishing.
 */
export function queryTerms(query: string): Query {
  const { kept, tooLong } = words(query.slice(0, MAX_QUERY_CHARS));
  const distinct = new Map<string, string>();
  for (const word of kept) {
    const term = stem(word);
    if (!distinct.has(term)) distinct.set(term, word);
  }
  const terms = [...distinct].map(([term, word]) => ({ term, word }));
  return { terms: terms.slice(0, MAX_QUERY_TERMS), dropped: Math.max(0, terms.length - MAX_QUERY_TERMS), tooLong };
}

const FUZZY_MIN = 5;

/** Near miss: two long terms that share almost all of the shorter one as a prefix ("idempotent", "idempotency"). */
export function nearMiss(a: string, b: string): boolean {
  if (a.length < FUZZY_MIN || b.length < FUZZY_MIN || Math.abs(a.length - b.length) > 4) return false;
  const need = Math.max(FUZZY_MIN, Math.min(a.length, b.length) - 1);
  for (let i = 0; i < need; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const prefixKey = (term: string): string | null => (term.length >= FUZZY_MIN ? term.slice(0, FUZZY_MIN) : null);
