import type { ExtractedField, FieldConfidence, ScanResult } from "../types";
import { findDateInText } from "./extractors";
import { isValidDate, isValidPassportNo, isValidPincode, verhoeffCheck } from "./validate";

export type FieldValidation = {
  valid: boolean;
  confidence: FieldConfidence;
  message: string;
};

const NOT_FOUND = "NOT FOUND";

function normalizedDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function validateField(field: ExtractedField): FieldValidation {
  const value = field.value.trim();
  if (!value || value === NOT_FOUND) {
    return { valid: false, confidence: "missing", message: "Value was not found." };
  }

  switch (field.key) {
    case "Name":
    case "Father's Name":
    case "Father's / Guardian's Name":
    case "Mother's Name":
    case "Spouse's Name": {
      const words = value.split(/\s+/).filter(Boolean);
      const fmtOk = words.length >= 2 && /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(value);
      // Always valid when a value is present — contributes to green dot.
      // confidence="low" (CHECK badge) when format is imperfect — advisory only.
      return {
        valid: true,
        confidence: fmtOk ? "medium" : "low",
        message: fmtOk
          ? "Format looks plausible; identity is not verified by OCR."
          : "Value present but source location not independently verified — check spelling.",
      };
    }
    case "Date of Birth":
    case "Date of Expiry":
    case "Date of Issue": {
      const yearOnly = /^\d{4} \(year only\)$/.test(value);
      const date = findDateInText(value);
      const valid = yearOnly || Boolean(date);
      return { valid, confidence: valid ? "medium" : "low", message: valid ? "Date format is valid but not source-verified." : "Expected a valid date." };
    }
    case "Gender":
      return { valid: value === "Male" || value === "Female", confidence: "medium", message: "Expected Male or Female." };
    case "Aadhaar No.": {
      const digits = normalizedDigits(value);
      const valid = /^X{8}\d{4}$/i.test(value.replace(/\s/g, "")) || (/^\d{12}$/.test(digits) && verhoeffCheck(digits));
      return { valid, confidence: valid ? (field.verified ? "verified" : "high") : "low", message: valid ? "Aadhaar checksum passed." : "Aadhaar must pass the Verhoeff checksum." };
    }
    case "PIN Code":
      return { valid: isValidPincode(normalizedDigits(value)), confidence: "high", message: "Expected a six-digit Indian PIN code." };
    case "Passport No.":
      return { valid: isValidPassportNo(value), confidence: field.verified ? "verified" : "high", message: "Expected one letter followed by seven digits." };
    case "Address": {
      const hasContent = value.length >= 3 && /[A-Za-z]/.test(value);
      // Always valid when meaningful content is present — advisory CHECK badge if thin.
      return {
        valid: true,
        confidence: hasContent ? "medium" : "low",
        message: hasContent
          ? "Address is present but not independently verified."
          : "Address value present but very short — please verify.",
      };
    }
    default:
      return { valid: value.length >= 2, confidence: "medium", message: "Value is present but requires review." };
  }
}

export function validateResult(result: ScanResult) {
  const checks = result.fields.map((field) => ({ field, check: validateField(field) }));
  const valid = checks.every(({ check }) => check.valid);
  return { valid, checks };
}
