export type DocumentType = "aadhaar" | "passport";

export type FieldConfidence = "verified" | "high" | "medium" | "low" | "missing";
export type FieldReviewStatus = "pending" | "approved" | "unresolved";

export interface FieldEvidence {
  page: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  ocrText: string;
}

export interface ExtractedField {
  key: string;
  value: string;
  editable: boolean;
  confidence: FieldConfidence;
  verified?: boolean;
  hint?: string;
  evidence?: FieldEvidence;
  reviewStatus?: FieldReviewStatus;
}

export type Quality = "Readable" | "Blurred" | "Error";

export interface ScanResult {
  id: string;
  ownerId?: string;
  fileName: string;
  pageLabel: string;
  imageUrl: string;
  imagePath?: string;
  documentType: DocumentType;
  subtype: string;
  fields: ExtractedField[];
  rawText: string;
  quality: Quality;
  blurConstant: number;
  ocrConfidence: number;
  durationMs: number;
  warnings: string[];
  saved?: boolean;
  reviewStatus?: "complete" | "needs_review";
}

export type ItemStatus =
  | "reading"
  | "queued"
  | "ocr"
  | "parsing"
  | "done"
  | "error";

export interface QueueItem {
  id: string;
  name: string;
  sourceName: string;
  pageIndex: number;
  dataUrl: string | null;
  blurConstant: number;
  status: ItemStatus;
  progress: number;
  statusText: string;
  error?: string;
  result?: ScanResult;
}

export interface DocumentOption {
  id: DocumentType;
  label: string;
  tagline: string;
  description: string;
  icon: "aadhaar" | "passport";
  subtypes: {
    id: string;
    label: string;
    description: string;
    fields: string[];
  }[];
}

export interface Toast {
  id: number;
  kind: "error" | "info" | "success";
  message: string;
}
