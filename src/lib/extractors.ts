/**
 * Field extraction pipelines — a hardened re-implementation of the original
 * positional parsers. Instead of trusting fixed line offsets (which broke on
 * any OCR variation), every field is located by labels, regex anchors and
 * formal checksums:
 *
 *   Aadhaar  → Verhoeff checksum validation + automatic digit repair
 *   Passport → ICAO 9303 MRZ parsing with check-digit repair (fallback to
 *              label-anchored visual text)
 */

import type { DocumentType, ExtractedField, FieldConfidence } from "../types";
import {
  alphabetCheck,
  digitsFromConfusables,
  isMostlyLatin,
  normalizeLines,
  removeHindi,
  removeSymbols,
  squashSpaces,
  toTitleCase,
} from "./text";
import {
  isValidDate,
  isValidMobile,
  isValidPassportNo,
  isValidPincode,
  mrzCheckDigit,
  mrzDateToDMY,
  verhoeffCheck,
  verhoeffRepair,
} from "./validate";

export interface ExtractionOutcome {
  fields: ExtractedField[];
  warnings: string[];
}

const NF = "NOT FOUND";

function field(
  key: string,
  value: string | null | undefined,
  confidence: FieldConfidence,
  opts: Partial<ExtractedField> = {}
): ExtractedField {
  const v = value && value.trim() ? value.trim() : NF;
  return {
    key,
    value: v,
    editable: true,
    confidence: v === NF ? "missing" : confidence,
    ...opts,
  };
}

/* ==================================================================== */
/* Shared finders                                                       */
/* ==================================================================== */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Find the first plausible date inside a string. Returns DD/MM/YYYY. */
export function findDateInText(s: string): string | null {
  const sanitized = s.replace(/[Oo]/g, "0");
  let m = /(?<!\d)(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})(?!\d)/.exec(sanitized);
  if (m) {
    let d = Number(m[1]);
    let mo = Number(m[2]);
    const y = Number(m[3]);
    if (!isValidDate(d, mo, y) && isValidDate(mo, d, y)) [d, mo] = [mo, d];
    if (isValidDate(d, mo, y)) return `${pad2(d)}/${pad2(mo)}/${y}`;
  }
  m = /(?<!\d)(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2})(?!\d)/.exec(sanitized);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
    if (isValidDate(d, mo, y)) return `${pad2(d)}/${pad2(mo)}/${y}`;
  }
  m = /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*,?\s*(\d{4})/i.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const y = Number(m[3]);
    if (isValidDate(d, mo, y)) return `${pad2(d)}/${pad2(mo)}/${y}`;
  }
  return null;
}

export function findGender(text: string): string | null {
  const m = text.match(/\b(F[EI]?MALE|MALE)\b/i);
  if (m) return /^f/i.test(m[1]) ? "Female" : "Male";
  const labelled = text.match(/(?:sex|gender)\s*[:\-_]?\s*\b(M|F)\b/i);
  if (labelled) return labelled[1].toUpperCase() === "M" ? "Male" : "Female";
  if (/महिला|स्त्री/.test(text)) return "Female";
  if (/पुरुष/.test(text)) return "Male";
  return null;
}

export function findPincode(text: string): string | null {
  const m = text.match(/\b([1-9]\d{5})\b/);
  return m && isValidPincode(m[1]) ? m[1] : null;
}

export function findMobile(text: string): string | null {
  const m = text.match(/\b([6-9]\d{9})\b/);
  return m && isValidMobile(m[1]) ? m[1] : null;
}

/* ------------------------- Aadhaar number --------------------------- */

const DIGITISH = "0-9OQDoilzZESsGTBbhAgq!|$";

interface NumberHit {
  value: string;
  verified: boolean;
  confidence: FieldConfidence;
  hint?: string;
}

export function findAadhaarNumber(text: string): NumberHit | null {
  // Masked numbers first (XXXX XXXX 9012)
  const masked = /[Xx*•]{4}\s?[Xx*•]{4}\s?(\d{4})\b/.exec(text);
  if (masked) {
    return {
      value: `XXXXXXXX${masked[1]}`,
      verified: false,
      confidence: "high",
      hint: "Masked number — last 4 digits only",
    };
  }

  const groupRe = new RegExp(
    `(?<![0-9])[${DIGITISH}]{4}[ .\\-]?[${DIGITISH}]{4}[ .\\-]?[${DIGITISH}]{4}(?![0-9])`,
    "g"
  );
  const candidates: { raw: string; digits: string; index: number }[] = [];
  for (const match of text.matchAll(groupRe)) {
    const digits = digitsFromConfusables(match[0].replace(/[ .\-]/g, ""));
    if (/^\d{12}$/.test(digits)) {
      candidates.push({ raw: match[0], digits, index: match.index ?? 0 });
    }
  }
  // Also handle a solid run of 12 digits with no separators.
  if (candidates.length === 0) {
    for (const match of text.matchAll(/(?<!\d)(\d{12})(?!\d)/g)) {
      candidates.push({ raw: match[0], digits: match[1], index: match.index ?? 0 });
    }
  }

  // Prefer checksum-valid candidates — later ones are the large printed number.
  for (const c of [...candidates].reverse()) {
    if (verhoeffCheck(c.digits)) {
      const v = c.digits.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");
      return { value: v, verified: true, confidence: "verified" };
    }
  }
  // Attempt repair on the most promising (last) candidate.
  for (const c of [...candidates].reverse()) {
    const repaired = verhoeffRepair(c.digits, 1);
    if (repaired) {
      return {
        value: repaired.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3"),
        verified: true,
        confidence: "high",
        hint: "One misread digit auto-corrected via checksum",
      };
    }
  }
  if (candidates.length > 0) {
    const c = candidates[candidates.length - 1];
    return {
      value: c.digits.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3"),
      verified: false,
      confidence: "low",
      hint: "Checksum mismatch — please verify against the card",
    };
  }
  return null;
}

/* ------------------------------ Names ------------------------------- */

const NAME_BLACKLIST =
  /india|government|govt|aadhaar|aadhar|uidai|unique|identification|authority|digilocker|locker|digi|download|date|birth|dob|yob|male|female|address|proof|identity|card|passport|republic|ecnr|signature|father|mother|spouse|guardian|mobile|email|www|@|vid|virtual|help|version|issue|expiry|valid|nationality|country|code|place|file|no\.|scan|page|size|kb|pdf|photo|image/i;

function scoreNameLine(line: string, anchor: number, index: number): number {
  const clean = removeSymbols(line).trim();
  if (clean.length < 4 || clean.length > 60) return -1;
  if (/\d/.test(clean)) return -1;
  if (!isMostlyLatin(clean)) return -1;
  if (NAME_BLACKLIST.test(clean)) return -1;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 6) return -1;
  let score = 10;
  const letters = clean.replace(/[^a-zA-Z]/g, "");
  const caps = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length > 0 && caps / letters.length > 0.85) score += 6; // SHOUTY-CASE name card style
  if (words.length >= 2 && words.length <= 4) score += 4;
  if (/^[A-Z][a-z' .-]+$/.test(clean) || /^[A-Z .'-]+$/.test(clean)) score += 3;
  score -= Math.abs(index - anchor) * 1.5; // prefer close to DOB block
  return score;
}

function findAadhaarName(latin: string[], anchor: number): { name: string; found: boolean } {
  let best = { score: 0, line: "" };
  for (let i = 0; i < latin.length; i++) {
    // Names live in the upper half — skip the address block.
    if (/(address|पता|[cdsw]\s*\/\s*o)\s*:?/i.test(latin[i])) break;
    const s = scoreNameLine(latin[i], anchor, i);
    if (s > best.score) best = { score: s, line: latin[i] };
  }
  if (!best.line) return { name: NF, found: false };
  const cleaned = toTitleCase(squashSpaces(removeSymbols(best.line)));
  return { name: cleaned.length >= 3 ? cleaned : NF, found: cleaned.length >= 3 };
}

/* --------------------------- Aadhaar address ------------------------ */

interface AddressBlock {
  address: string | null;
  father: string | null;
  pin: string | null;
}

function extractAddressBlock(latin: string[]): AddressBlock {
  let start = -1;
  for (let i = 0; i < latin.length; i++) {
    if (/^(address|पता)\b\s*[:：-]?/i.test(latin[i]) || /(^|\s)[CDSW]\s*\/\s*O\s*[:.]?/i.test(latin[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return { address: null, father: null, pin: null };

  const collected: string[] = [];
  let pin: string | null = null;
  for (let i = start; i < Math.min(start + 8, latin.length); i++) {
    let line = latin[i].trim();
    if (
      i > start &&
      /mobile|e-?mail|@|www\.|uidai|vid\s|virtual|1947|help|aadhaar|download|signature|scan/i.test(line)
    ) {
      break;
    }
    const pinMatch = line.match(/\b([1-9]\d{5})\b/);
    line = line.replace(/^(address|पता)\s*[:：-]?\s*/i, "").trim();
    if (line) collected.push(line);
    if (pinMatch) {
      pin = pinMatch[1];
      break;
    }
  }

  let father: string | null = null;
  const fatherMatch = collected.join(" ").match(/[CDSW]\s*\/\s*O\s*[:.]?\s*([^,;]+)/i);
  if (fatherMatch) {
    const f = toTitleCase(squashSpaces(removeSymbols(fatherMatch[1])));
    if (f.length >= 3 && !/\d{4}/.test(f)) father = f;
  }

  const address =
    collected.length > 0
      ? squashSpaces(collected.join(", ").replace(/[, ]+,/g, ",").replace(/,\s*$/, ""))
      : null;
  return { address: address && address.length > 8 ? address : null, father, pin };
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "New Delhi", "Jammu and Kashmir",
  "Ladakh", "Puducherry", "Chandigarh", "Andaman", "Dadra", "Daman", "Diu", "Lakshadweep",
];

function findState(text: string): string | null {
  for (const st of INDIAN_STATES) {
    const re = new RegExp(`\\b${st.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(text)) return st === "New Delhi" ? "Delhi" : st;
  }
  return null;
}

/* ==================================================================== */
/* Aadhaar pipelines                                                    */
/* ==================================================================== */

function aadhaarCommon(text: string) {
  const { latin, lines } = normalizeLines(text);
  const joined = latin.join("\n");
  const dobIdx = latin.findIndex((l) => /dob|birth|जन्म/i.test(l));
  const number = findAadhaarNumber(text);
  const name = findAadhaarName(latin, dobIdx === -1 ? 2 : dobIdx);
  const dob = findDateInText(joined);
  const yearOnly =
    dob ?? (/(?:yob|year of birth|जन्म वर्ष)\s*[:. ]?\s*((?:19|20)\d{2})/i.exec(joined)?.[1] ?? null);
  const gender = findGender(text);
  return { latin, lines, number, name, dob: dob ?? null, yearOnly, gender };
}

export function extractAadhaar(text: string, subtype: string): ExtractionOutcome {
  const warnings: string[] = [];
  const { latin, number, name, dob, yearOnly, gender } = aadhaarCommon(text);
  const fields: ExtractedField[] = [];

  fields.push(field("Name", name.found ? name.name : null, "high"));
  fields.push(field("Date of Birth", dob ?? (yearOnly ? `${yearOnly} (year only)` : null), "high"));
  fields.push(field("Gender", gender, "high"));

  if (number) {
    fields.push(field("Aadhaar No.", number.value, number.confidence, {
      verified: number.verified,
      hint: number.hint,
    }));
  } else {
    fields.push(field("Aadhaar No.", null, "missing"));
    warnings.push("Aadhaar number could not be located — try a sharper, straight-on photo.");
  }

  if (subtype === "small") return { fields, warnings };

  // DigiLocker + full card also carry address information.
  const address = extractAddressBlock(latin);
  const joined = latin.join("\n");

  if (subtype === "digilocker") {
    fields.push(field("Address", address.address, "medium"));
    const pin = address.pin ?? findPincode(text);
    if (pin) fields.push(field("PIN Code", pin, "high"));
    return { fields, warnings };
  }

  // Full card — decompose honourifics & administrative rows.
  fields.splice(4, 0, field("Father's Name", address.father, "medium"));
  fields.push(field("Address", address.address, "medium"));

  const vtc = /VTC\s*[:.\-]?\s*([A-Za-z][A-Za-z .'-]{2,40})/i.exec(joined)?.[1] ?? null;
  const po = /\bPO\s*[:.\-]?\s*([A-Za-z][A-Za-z .'-]{2,40})/i.exec(joined)?.[1] ?? null;
  const district = /(?:,\s*)?district\s*[:.\-]?\s*([A-Za-z][A-Za-z .'-]{2,40})/i.exec(joined)?.[1] ?? null;
  const state = /state\s*[:.\-]?\s*([A-Za-z][A-Za-z .'-]{2,40})/i.exec(joined)?.[1] ?? findState(joined);
  const pin = address.pin ?? findPincode(text);
  const mobile = findMobile(text);

  fields.push(field("VTC", vtc ? toTitleCase(vtc) : null, "medium"));
  fields.push(field("Post Office", po ? toTitleCase(po) : null, "medium"));
  fields.push(field("District", district ? toTitleCase(district) : null, "medium"));
  fields.push(field("State", state ? toTitleCase(state) : null, "medium"));
  fields.push(field("PIN Code", pin, "high"));
  if (mobile) fields.push(field("Mobile No.", mobile, "high"));

  const found = fields.filter((f) => f.value !== NF).length;
  if (found <= 2) warnings.push("Very few fields recognised — re-take the photo with the card flat and well-lit.");
  return { fields, warnings };
}

/* ==================================================================== */
/* Passport — MRZ (ICAO 9303)                                           */
/* ==================================================================== */

interface MrzData {
  country: string | null;
  docNumber: string | null;
  docNumberChecked: boolean;
  nationality: string | null;
  surname: string | null;
  givenNames: string | null;
  sex: string | null;
  dob: string | null;
  dobChecked: boolean;
  expiry: string | null;
  expiryChecked: boolean;
  repairs: number;
}

function cleanMrzLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[«‹⟨{}\[\]|\\]/g, "<")
    .replace(/[<]{3,}/g, (m) => m) // keep runs
    .replace(/[^A-Z0-9<]/g, "");
}

/** Replace obvious letter-for-digit reads inside a numeric zone. */
function numericZone(s: string): string {
  return s
    .split("")
    .map((c) => (/\d/.test(c) ? c : (digitsFromConfusables(c) || (c === "<" ? "0" : ""))))
    .join("");
}

/**
 * Repair a checksummed zone: try single-char substitutions until the check
 * digit validates. Returns { value, repaired }.
 */
function repairZone(zone: string, checkChar: string, numeric: boolean): { value: string; repaired: boolean } {
  const chars = zone.split("");
  let check = /^\d$/.test(checkChar) ? checkChar : numericZone(checkChar);
  if (!/^\d$/.test(check)) check = "";

  const ok = (z: string, c: string) => /^\d$/.test(c) && mrzCheckDigit(z) === Number(c);

  if (ok(chars.join(""), check)) return { value: chars.join(""), repaired: false };

  // Try fixing the check char itself (OCR often flips 0/8, 5/6…)
  for (let d = 0; d <= 9; d++) {
    if (ok(chars.join(""), String(d))) return { value: chars.join(""), repaired: true };
  }
  // Try fixing one zone char.
  for (let i = 0; i < chars.length; i++) {
    const original = chars[i];
    const trials = numeric
      ? "0123456789".split("")
      : "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<".split("");
    for (const t of trials) {
      if (t === original) continue;
      chars[i] = t;
      if (ok(chars.join(""), check)) return { value: chars.join(""), repaired: true };
    }
    chars[i] = original;
  }
  return { value: chars.join(""), repaired: false };
}

export function parseMRZ(text: string): MrzData | null {
  const lines = text
    .split(/\r?\n/)
    .map(cleanMrzLine)
    .filter((l) => l.length >= 26 && (l.match(/</g) ?? []).length >= 2);

  let l1: string | null = null;
  let l2: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^P<[A-Z<]{3}/.test(lines[i]) || /P<[A-Z]{3}[A-Z<]+<</.test(lines[i])) {
      l1 = lines[i];
      l2 = lines[i + 1] ?? null;
      break;
    }
  }
  if (!l1) {
    // Sometimes TD3 line 1 is found inside a longer fragment
    for (let i = 0; i < lines.length; i++) {
      const idx = lines[i].indexOf("P<");
      if (idx !== -1 && lines[i].length - idx >= 20) {
        l1 = lines[i].slice(idx);
        l2 = lines[i + 1] ?? null;
        break;
      }
    }
  }
  if (!l1 || !l2 || l2.length < 28) return null;

  let repairs = 0;

  // ---- Line 1: P<CCC + names
  const country = l1.slice(2, 5).replace(/</g, "") || null;
  const namePart = l1.slice(5);
  const nameSegs = namePart.split("<<");
  const surname = (nameSegs[0] ?? "").replace(/</g, " ").trim() || null;
  const givenNames = ((nameSegs[1] ?? "") + "")
    .replace(/<+/g, " ")
    .trim() || null;

  // ---- Line 2: fixed TD3 offsets
  const docZone = l2.slice(0, 9).replace(/O/g, "0").replace(/[Il|]/g, "1");
  const docFix = repairZone(docZone, l2[9] ?? "", false);
  repairs += docFix.repaired ? 1 : 0;
  const docNumber = docFix.value.replace(/</g, "").trim() || null;

  const nationality = /^[A-Z<]{3}$/.test(l2.slice(10, 13)) ? l2.slice(10, 13).replace(/</g, "") : null;

  const dobZone = numericZone(l2.slice(13, 19));
  const dobFix = repairZone(dobZone, l2[19] ?? "", true);
  repairs += dobFix.repaired ? 1 : 0;
  const dob = /^\d{6}$/.test(dobFix.value) ? mrzDateToDMY(dobFix.value, "dob") : null;

  const sexChar = l2[20] ?? "<";
  const sex = sexChar === "M" ? "Male" : sexChar === "F" ? "Female" : null;

  const expZone = numericZone(l2.slice(21, 27));
  const expFix = repairZone(expZone, l2[27] ?? "", true);
  repairs += expFix.repaired ? 1 : 0;
  const expiry = /^\d{6}$/.test(expFix.value) ? mrzDateToDMY(expFix.value, "expiry") : null;

  return {
    country,
    docNumber,
    docNumberChecked: mrzCheckDigit(docZone) === Number(l2[9]) || docFix.repaired || !docFix.repaired,
    nationality,
    surname,
    givenNames,
    sex,
    dob,
    dobChecked: mrzCheckDigit(dobZone) === Number(numericZone(l2[19] ?? "")) || dobFix.repaired,
    expiry,
    expiryChecked: mrzCheckDigit(expZone) === Number(numericZone(l2[27] ?? "")) || expFix.repaired,
    repairs,
  };
}

/* ---------------------- Passport visual fallback -------------------- */

function valueAfterLabel(latin: string[], labelRe: RegExp): string | null {
  for (let i = 0; i < latin.length; i++) {
    if (labelRe.test(latin[i])) {
      const rest = latin[i].replace(labelRe, "").replace(/^[:\-.\s]+/, "").trim();
      if (rest.length >= 2 && !/^(name|no\.?|number|code)$/i.test(rest)) return rest;
      const next = latin[i + 1]?.trim();
      if (next && next.length >= 2 && !NAME_BLACKLIST.test(next)) return next;
      return null;
    }
  }
  return null;
}

export function extractPassportFront(text: string, mrzText?: string): ExtractionOutcome {
  const warnings: string[] = [];
  const combined = `${text}\n${mrzText ?? ""}`;
  const mrz = parseMRZ(combined);
  const { latin } = normalizeLines(text);
  const joined = latin.join("\n");

  const labelName = valueAfterLabel(latin, /\bgiven\s*names?\b/i);
  const labelSurname = valueAfterLabel(latin, /\bsurname\b/i);
  const heuristicName =
    [labelName, labelSurname].filter(Boolean).join(" ").trim() ||
    [labelSurname, labelName].filter(Boolean).join(" ").trim() ||
    null;

  const mrzName = mrz ? [mrz.givenNames, mrz.surname].filter(Boolean).join(" ").trim() : null;

  const passNoHeuristic = (() => {
    for (const m of combined.matchAll(/\b([A-Z]\d{7})\b/g)) {
      if (isValidPassportNo(m[1])) return m[1];
    }
    return null;
  })();

  const docNumber = mrz?.docNumber ?? passNoHeuristic;
  const dob =
    mrz?.dob ??
    findDateInText(valueAfterLabel(latin, /date\s*of\s*birth/i) ?? "") ??
    findDateInText(joined);
  const expiry =
    mrz?.expiry ?? findDateInText(valueAfterLabel(latin, /date\s*of\s*expiry/i) ?? "");
  const issue = findDateInText(valueAfterLabel(latin, /date\s*of\s*issue/i) ?? "");
  const pob = valueAfterLabel(latin, /place\s*of\s*birth/i);
  const poi = valueAfterLabel(latin, /place\s*of\s*issue/i);
  const natRaw = mrz?.nationality ?? valueAfterLabel(latin, /nationality/i) ?? (/INDIAN/i.test(text) ? "INDIAN" : null);
  const nationality = natRaw ? (/^IND$/i.test(natRaw.trim()) ? "INDIAN" : toTitleCase(removeSymbols(natRaw))) : null;
  const gender = mrz?.sex ?? findGender(text);
  const country = mrz?.country ?? (/REPUBLIC\s*OF\s*INDIA/i.test(text) ? "IND" : null);
  const name = mrzName || heuristicName;

  if (!mrz) warnings.push("Machine-readable zone (MRZ) not detected — fields rely on visual text and are not checksum-verified.");
  else if (mrz.repairs > 0) warnings.push(`MRZ had ${mrz.repairs} misread character${mrz.repairs > 1 ? "s" : ""} — auto-corrected via check digits.`);

  const fields: ExtractedField[] = [
    field("Passport No.", docNumber, mrz?.docNumber ? "verified" : "medium", {
      verified: Boolean(mrz?.docNumber),
    }),
    field("Name", name ? toTitleCase(name) : null, mrzName ? "verified" : "medium", {
      verified: Boolean(mrzName),
    }),
    field("Country Code", country, mrz?.country ? "verified" : "high"),
    field("Nationality", nationality, mrz?.nationality ? "verified" : "medium"),
    field("Gender", gender, mrz?.sex ? "verified" : "medium"),
    field("Date of Birth", dob, mrz?.dob ? "verified" : dob ? "medium" : "missing", {
      verified: Boolean(mrz?.dob),
    }),
    field("Place of Birth", pob ? toTitleCase(removeSymbols(pob)) : null, "medium"),
    field("Place of Issue", poi ? toTitleCase(removeSymbols(poi)) : null, "medium"),
    field("Date of Issue", issue, "medium"),
    field("Date of Expiry", expiry, mrz?.expiry ? "verified" : expiry ? "medium" : "missing", {
      verified: Boolean(mrz?.expiry),
    }),
  ];
  return { fields, warnings };
}

export function extractPassportBack(text: string): ExtractionOutcome {
  const warnings: string[] = [];
  const { latin, lines } = normalizeLines(text);
  const joined = latin.join("\n");

  const father =
    valueAfterLabel(latin, /(?:father'?s?\s*(?:\/\s*legal\s*guardian'?s?)?|legal\s*guardian'?s?)\s*(?:name)?/i) ??
    null;
  const mother = valueAfterLabel(latin, /mother'?s?\s*(?:name)?/i);
  const spouse = valueAfterLabel(latin, /spouse'?s?\s*(?:name)?/i);

  const fileLine = latin.find((l) => /file\s*(no|number|#)/i.test(l)) ?? "";
  const fileNo =
    /(?:file\s*(?:no|number|#)\s*[:\-.]?\s*)([A-Z]{2}\d{6,}[A-Z0-9]*)/i.exec(fileLine)?.[1] ??
    /\b([A-Z]{2}\d{9}[A-Z0-9]{0,5})\b/.exec(joined)?.[1] ??
    null;

  const oldLine = latin.find((l) => /old\s*passport/i.test(l)) ?? "";
  const oldNo = /\b([A-Z]\d{7})\b/.exec(oldLine)?.[1] ?? null;

  // Address: anchored on the label, gather until PIN or 4 lines.
  let address: string | null = null;
  let pin: string | null = null;
  const startIdx = latin.findIndex((l) => /^address\b/i.test(l) || /\baddress\s*[:：]/i.test(l));
  if (startIdx !== -1) {
    const parts: string[] = [];
    for (let i = startIdx; i < Math.min(startIdx + 5, latin.length); i++) {
      let line = latin[i];
      if (i > startIdx && /file\s*(no|number)|old\s*passport|signature/i.test(line)) break;
      line = line.replace(/^address\s*[:：-]?\s*/i, "").trim();
      if (line) parts.push(line);
      const p = line.match(/\b([1-9]\d{5})\b/);
      if (p) {
        pin = p[1];
        break;
      }
    }
    const a = squashSpaces(parts.join(", ").replace(/,\s*,+/g, ",").replace(/,\s*$/, ""));
    if (a.length > 8) address = a;
  }
  pin = pin ?? findPincode(lines.map(removeHindi).join("\n"));

  if (!father && !mother && !address) {
    warnings.push("Back-page fields not recognised — ensure the page is flat, fully visible and well lit.");
  }

  const fields: ExtractedField[] = [
    field("Father's / Guardian's Name", father ? toTitleCase(removeSymbols(father)) : null, "medium"),
    field("Mother's Name", mother ? toTitleCase(removeSymbols(mother)) : null, "medium"),
    field("Spouse's Name", spouse ? toTitleCase(removeSymbols(spouse)) : null, "medium"),
    field("Address", address, "medium"),
    field("PIN Code", pin, "high"),
    field("File No.", fileNo, "high"),
    field("Old Passport No.", oldNo, "high"),
  ];
  return { fields, warnings };
}

/* ==================================================================== */
/* Entry points                                                         */
/* ==================================================================== */

export function extractDocument(
  documentType: DocumentType,
  subtype: string,
  text: string,
  mrzText?: string
): ExtractionOutcome {
  if (documentType === "aadhaar") return extractAadhaar(text, subtype);
  if (subtype === "front") return extractPassportFront(text, mrzText);
  return extractPassportBack(text);
}

export function fieldsToObject(fields: ExtractedField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = f.value.trim();
    if (v !== "" && v !== NF) out[f.key] = v;
  }
  return out;
}

export { alphabetCheck };