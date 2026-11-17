/**
 * OCR text-cleaning helpers — hardened ports of the original Python
 * number_check / alphabet_check / remove_symbols / Hindi removal logic,
 * plus token-level digit-confusion mapping used for numeric zones.
 */

const FORBIDDEN = "!@#$%^&*_()-+=[]{}|\\:;'\"<>,.?/";

export function removeSymbols(str: string): string {
  return str
    .split("")
    .filter((c) => !FORBIDDEN.includes(c))
    .join("");
}

export function removeHindi(str: string): string {
  // Strip Devanagari codepoints (U+0900–U+097F) instead of a fragile char list.
  return str.replace(/[\u0900-\u097F]/g, "");
}

/** Map letter → likely digit inside numeric zones (Aadhaar, MRZ, PIN…). */
const LETTER_TO_DIGIT: Record<string, string> = {
  o: "0", O: "0", Q: "0", D: "0",
  i: "1", I: "1", l: "1", "|": "1", "!": "1",
  z: "2", Z: "2",
  E: "3",
  A: "4", h: "4",
  s: "5", S: "5", $: "5",
  b: "6", G: "6",
  T: "7",
  B: "8",
  g: "9", q: "9",
};

/** Normalise a token that is expected to be numeric: letters → digits. */
export function digitsFromConfusables(token: string): string {
  return token
    .split("")
    .map((c) => (/\d/.test(c) ? c : (LETTER_TO_DIGIT[c] ?? "")))
    .join("");
}

/** Alphabet zone cleanup — turn embedded look-alike digits into letters. */
export function alphabetCheck(words: string): string {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const c = words[i];
    if (FORBIDDEN.includes(c)) continue;
    const prev = i > 0 ? words[i - 1] : "";
    if (c === "0") out.push(prev === " " ? "O" : "o");
    else if (c === "1") out.push(prev === " " ? "I" : "i");
    else if (c === "8") out.push("B");
    else if (c === "4") out.push("A");
    else if (c === "5") out.push(prev === " " ? "S" : "s");
    else if (c === "6") out.push("b");
    else if (c === "9") out.push("g");
    else out.push(c);
  }
  return out.join("");
}

export interface CleanLines {
  /** Trimmed, non-empty lines with Hindi kept. */
  lines: string[];
  /** English-only variants, index-aligned to `lines`. */
  latin: string[];
}

export function normalizeLines(text: string): CleanLines {
  const raw = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0 && !/^AADHAAR$/i.test(l));
  return { lines: raw, latin: raw.map((l) => removeHindi(l).trim()) };
}

export function squashSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Title-case a name, preserving internal spacing. */
export function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|\s|[('"/-])([a-z])/g, (m) => m.toUpperCase());
}

export function isMostlyLatin(s: string): boolean {
  if (!s) return false;
  let latin = 0;
  for (const c of s) if (/[a-zA-Z ]/.test(c)) latin++;
  return latin / s.length > 0.75;
}