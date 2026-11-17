/**
 * Formal validators used by the extraction pipelines.
 *
 * - Verhoeff checksum for Aadhaar numbers (UIDAI uses the Verhoeff
 *   dihedral-group algorithm — lets us *verify* and *repair* OCR digits)
 * - ICAO 9303 MRZ check digits (7-3-1 weighting) for passports
 * - Indian PIN / mobile / date sanity checks
 */

/* ------------------------------------------------------------------ */
/* Verhoeff (Aadhaar)                                                  */
/* ------------------------------------------------------------------ */

const D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffCheck(num: string): boolean {
  if (!/^\d{12}$/.test(num)) return false;
  let c = 0;
  for (let i = 0; i < 12; i++) {
    c = D[c][P[(i + 1) % 8][Number(num[11 - i])]];
  }
  return c === 0;
}

/** Common digit-confusion alternatives OCR makes, ordered by likelihood. */
const DIGIT_ALTS: Record<string, string[]> = {
  "0": ["8", "6", "9"],
  "1": ["7", "4", "2"],
  "2": ["7", "1", "3"],
  "3": ["8", "5", "9"],
  "4": ["1", "7", "9"],
  "5": ["6", "8", "3"],
  "6": ["5", "8", "0"],
  "7": ["1", "2", "9"],
  "8": ["0", "6", "3", "5"],
  "9": ["7", "4", "0"],
};

/**
 * Try to repair up to `maxFixes` mis-read digits so the number satisfies the
 * Verhoeff checksum. Returns the corrected digits or null when unrecoverable.
 */
export function verhoeffRepair(num: string, maxFixes = 2): string | null {
  if (verhoeffCheck(num)) return num;
  const chars = num.split("");
  for (let i = 0; i < chars.length; i++) {
    for (const alt of DIGIT_ALTS[chars[i]] ?? []) {
      const candidate = chars.slice();
      candidate[i] = alt;
      const joined = candidate.join("");
      if (verhoeffCheck(joined)) return joined;
      if (maxFixes > 1) {
        for (let j = i + 1; j < chars.length; j++) {
          for (const alt2 of DIGIT_ALTS[candidate[j]] ?? []) {
            const c2 = candidate.slice();
            c2[j] = alt2;
            if (verhoeffCheck(c2.join(""))) return c2.join("");
          }
        }
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* ICAO 9303 MRZ check digit                                           */
/* ------------------------------------------------------------------ */

function mrzCharValue(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 55;
  return 0; // '<' filler and anything else
}

export function mrzCheckDigit(data: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += mrzCharValue(data[i]) * weights[i % 3];
  return sum % 10;
}

export function mrzFieldCheck(data: string, checkChar: string): boolean {
  const expected = mrzCheckDigit(data);
  const actual = /^\d$/.test(checkChar) ? Number(checkChar) : -1;
  return expected === actual;
}

/* ------------------------------------------------------------------ */
/* Common Indian document sanity checks                                */
/* ------------------------------------------------------------------ */

export function isValidPincode(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin);
}

export function isValidMobile(m: string): boolean {
  return /^[6-9]\d{9}$/.test(m);
}

export function isValidPassportNo(p: string): boolean {
  return /^[A-Z]\d{7}$/.test(p);
}

export function isValidDate(d: number, m: number, y: number): boolean {
  if (y < 1900 || y > new Date().getFullYear()) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if ([4, 6, 9, 11].includes(m) && d > 30) return false;
  if (m === 2) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (d > (leap ? 29 : 28)) return false;
  }
  return true;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatDMY(d: number, m: number, y: number): string {
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

/** MRZ YYMMDD → DD/MM/YYYY. `kind` decides the century pivot. */
export function mrzDateToDMY(yymmdd: string, kind: "dob" | "expiry"): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  const now = new Date().getFullYear();
  let year = 2000 + yy;
  if (kind === "dob") {
    if (year > now) year -= 100;
  } else if (year > now + 20) {
    year -= 100;
  }
  if (!isValidDate(dd, mm, year)) return null;
  return formatDMY(dd, mm, year);
}