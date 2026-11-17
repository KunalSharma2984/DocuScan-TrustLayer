import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronLeft,
  Copy,
  Download,
  Eye,
  FileCode2,
  MinusCircle,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import type { ExtractedField, ScanResult } from "../types";
import { validateResult } from "../lib/fieldValidation";
import { cn } from "../utils/cn";
import { Chip } from "./ui";

function ConfidenceBadge({ field }: { field: ExtractedField }) {
  if (field.confidence === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
        <ShieldCheck className="h-3 w-3" /> verified
      </span>
    );
  }
  if (field.confidence === "missing")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
        <MinusCircle className="h-3 w-3" /> missing
      </span>
    );
  if (field.confidence === "low")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
        <ShieldAlert className="h-3 w-3" /> check
      </span>
    );
  return null;
}

function qualityTone(q: ScanResult["quality"]) {
  return q === "Readable" ? "good" : q === "Blurred" ? "warn" : "bad";
}

function documentTag(result: ScanResult) {
  const typeLabel = result.documentType === "aadhaar" ? "Aadhaar" : "Passport";
  const subtypeLabels: Record<string, string> = {
    digilocker: "Digi",
    full: "Full",
    small: "PVC",
    front: "Front",
    back: "Back",
  };
  return `${typeLabel} - ${subtypeLabels[result.subtype] ?? result.subtype}`;
}

export function ResultsView({
  results,
  active,
  onActive,
  onFieldChange,
  onExportJson,
  onExportCsv,
  onCopyJson,
  onNewScan,
  onSaveCurrent,
  onSaveAll,
  onRemoveResult,
  onRemoveResults,
  onRemoveAll,
  copied,
}: {
  results: ScanResult[];
  active: number;
  onActive: (i: number) => void;
  onFieldChange: (resultIdx: number, key: string, value: string) => void;
  onExportJson: (r: ScanResult) => void;
  onExportCsv: () => void;
  onCopyJson: (r: ScanResult) => void;
  onNewScan: () => void;
  onSaveCurrent: () => void;
  onSaveAll: () => void;
  onRemoveResult: (id: string) => void;
  onRemoveResults: (ids: string[]) => void;
  onRemoveAll: () => void;
  copied: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const result = results[active];
  if (!result) return null;

  const found = result.fields.filter((f) => f.value !== "NOT FOUND");
  const verified = result.fields.filter((f) => f.verified);
  const needsReview = (candidate: ScanResult) =>
    candidate.fields.some(
      (field) => !validateResult({ ...candidate, fields: [field] }).valid
    );
  const needsReviewCount = results.filter(needsReview).length;
  const orderedResults = results
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      // saved → always bottom; then unsaved review-needed → top
      const aScore = a.item.saved ? 2 : needsReview(a.item) ? 0 : 1;
      const bScore = b.item.saved ? 2 : needsReview(b.item) ? 0 : 1;
      return aScore - bScore;
    });
  const allSelected = results.length > 0 && selectedIds.length === results.length;
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleAll = () => setSelectedIds(allSelected ? [] : results.map((item) => item.id));

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-5 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={onNewScan}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-line bg-panel text-ink-soft transition hover:border-ink/30 hover:text-ink"
            aria-label="New scan"
          >             <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Review documents</h2>
            <p className="text-sm text-ink-soft">
              {results.length} document{results.length === 1 ? "" : "s"} scanned     {" "}
              {needsReviewCount ? `${needsReviewCount} need${needsReviewCount === 1 ? "s" : ""} review` : "all fields checked"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex items-center rounded-2xl border border-line bg-panel p-1">
            <button onClick={onSaveCurrent} className="rounded-md bg-brand-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-brand-700">Save document</button>
            <button onClick={onSaveAll} className="rounded-md px-3.5 py-2 text-sm font-semibold text-ink-soft transition hover:bg-paper hover:text-ink">Save all</button>
          </div>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-line bg-panel px-3.5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"><Download className="h-4 w-4" /> Export</summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-line bg-panel p-1 shadow-lg">
              <button onClick={() => onExportJson(result)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper"><Download className="h-4 w-4" /> Current JSON</button>
              <button onClick={onExportCsv} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper"><FileCode2 className="h-4 w-4" /> Batch CSV</button>
              <button onClick={() => onCopyJson(result)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper">{copied ? <Check className="h-4 w-4 text-ink" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy JSON"}</button>
            </div>
          </details>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center rounded-2xl border border-line bg-panel px-3.5 py-2.5 text-sm font-semibold text-ink-soft transition hover:border-ink/30 hover:text-ink">More</summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-panel p-1 shadow-lg">
              {selectedIds.length > 0 && <button onClick={() => { if (window.confirm(`Remove ${selectedIds.length} selected document${selectedIds.length === 1 ? "" : "s"}>`)) { onRemoveResults(selectedIds); setSelectedIds([]); } }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper"><X className="h-4 w-4" /> Remove selected ({selectedIds.length})</button>}
              <button onClick={onRemoveAll} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper"><X className="h-4 w-4" /> Remove all documents</button>
            </div>
          </details>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        {/* left column: rail + preview */}
        <div className="space-y-5">
          {results.length > 1 && (
            <div className="overflow-hidden border border-line bg-panel">
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">Documents</h3>
                    <p className="mt-0.5 text-[11px] text-ink-soft">{needsReviewCount} need review  {results.length - needsReviewCount} complete</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-1.5 normal-case tracking-normal">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-[var(--color-brand-600)]" />
                    <span className="text-[11px] font-semibold text-ink-soft">Select all</span>
                  </label>
                </div>
              </div>
              <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                {orderedResults.map(({ item: r, originalIndex }) => (
                  <li key={r.id}>
                    <div className={cn(
                      "flex items-center gap-2 border-l-2 transition",
                      originalIndex === active ? "border-brand-600 bg-brand-50/70" : "border-transparent"
                    )}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelected(r.id)}
                      aria-label={`Select ${r.pageLabel}`}
                      className="ml-3 h-3.5 w-3.5 shrink-0 accent-[var(--color-brand-600)]"
                    />
                    <button
                      onClick={() => onActive(originalIndex)}
                      aria-current={originalIndex === active ? "true" : undefined}
                      aria-label={`${r.pageLabel}, ${needsReview(r) ? "needs review" : "complete"}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-2 py-3 text-left transition hover:bg-paper"
                    >                                           {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="h-10 w-8 rounded-md border border-line object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-8 items-center justify-center rounded-md border border-line bg-paper text-[9px] text-ink-soft">Open</span>
                    )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{r.pageLabel}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-soft">
                          <span>{documentTag(r)}</span>
                          <span aria-hidden></span>
                          <span>{r.fields.filter((f) => f.value !== "NOT FOUND").length}/{r.fields.length} fields</span>
                        </span>
                      </span>
                      <Chip tone={r.saved ? (needsReview(r) ? "warn" : "good") : needsReview(r) ? "warn" : "neutral"}>{r.saved ? (needsReview(r) ? "Review" : "Saved") : needsReview(r) ? "Review" : "Ready"}</Chip>
                    </button>
                    <button
                      onClick={() => onRemoveResult(r.id)}
                      className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-soft/60 transition hover:bg-paper hover:text-ink"
                      aria-label={`Remove ${r.pageLabel}`}
                    >                       <X className="h-3.5 w-3.5" />
                    </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* preview */}
          <div className="overflow-hidden border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                <Eye className="h-3.5 w-3.5" /> Source preview
              </h3>
              <div className="flex items-center gap-2">
                <Chip tone={qualityTone(result.quality)}>{result.quality}</Chip>
                <Chip tone="neutral">{Math.round(result.ocrConfidence)}% OCR</Chip>
              </div>
            </div>
            <button
              onClick={() => result.imageUrl && setZoom(true)}
              className="group relative block w-full bg-paper p-4"
              aria-label={result.imageUrl ? "Zoom document" : "Document preview unavailable"}
              disabled={!result.imageUrl}
            >
              {result.imageUrl ? (
                <img
                  src={result.imageUrl}
                  alt={result.pageLabel}
                  className="mx-auto max-h-105 border border-line object-contain"
                />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-ink-soft">
                  Loading secure preview…
                </div>
              )}
            </button>
            <div className="flex items-center justify-between px-4 py-2.5 text-[11px] font-medium text-ink-soft">
              <span className="max-w-55 truncate">{result.pageLabel}</span>
              <span>{(result.durationMs / 1000).toFixed(1)}s scan</span>
            </div>
          </div>
        </div>

        {/* right column: fields */}
        <div className="space-y-5">
          {result.warnings.length > 0 && (
            <div className="space-y-2">
              {result.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-ink-soft"
                >                   <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-xs leading-relaxed">{w}</p>
                </div>
              ))}
            </div>
          )}

          {verified.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-ink/5 px-4 py-3 text-ink">
              <BadgeCheck className="h-4 w-4 shrink-0" />
              <p className="text-xs leading-relaxed">
                <strong>{verified.length} field{verified.length === 1 ? "" : "s"}</strong> passed
                a formal checksum validation. This is not proof of authenticity; review policy still applies.
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-3xl border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="font-display text-base font-bold text-ink">Extracted details</h3>
              <span className="text-xs font-semibold text-ink-soft">
                {found.length}/{result.fields.length} found
              </span>
            </div>

            <div className="grid gap-x-6 gap-y-1 p-5 sm:grid-cols-2">
              {result.fields.map((fld) => (
                <div key={fld.key} className="border-b border-line/70 py-3 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                      {fld.key}
                    </label>
                    <ConfidenceBadge field={fld} />
                  </div>
                  {fld.key === "Gender" ? (
                    <select
                      value={fld.value === "NOT FOUND" ? "" : fld.value}
                      onChange={(e) => onFieldChange(active, fld.key, e.target.value)}
                      className="mt-1.5 w-full rounded-3xl border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200/60"
                    >                       <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <input
                      value={fld.value === "NOT FOUND" ? "" : fld.value}
                      placeholder="Not found  type to fill"
                      onChange={(e) => onFieldChange(active, fld.key, e.target.value)}
                      className={cn(
                        "mt-1.5 w-full rounded-3xl border bg-paper px-3 py-2 font-mono text-[13px] text-ink transition placeholder:text-ink-soft/40 focus:outline-none focus:ring-2",
                        fld.confidence === "verified"
                          ? "border-line focus:ring-emerald-300/50"
                          : fld.value === "NOT FOUND" || fld.value === ""
                            ? "border-line focus:ring-red-300/40"
                            : "border-line focus:border-brand-300 focus:ring-brand-200/60"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <details className="group overflow-hidden border border-line bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-ink transition hover:bg-paper">
              <div>
                <h3 className="font-display text-base font-bold">Evidence &amp; validation</h3>
                <p className="mt-1 text-xs text-ink-soft">Click to view how each value was assessed.</p>
              </div>
              <span className="text-xs font-semibold text-ink-soft transition group-open:rotate-180">⌄</span>
            </summary>
            <div className="border-t border-line">
              <div className="flex justify-end px-5 py-3 text-[11px] text-ink-soft">Coordinates unavailable in browser OCR</div>
              <div className="divide-y divide-line">
                {result.fields.slice(0, 6).map((field) => {
                  const check = validateResult({ ...result, fields: [field] }).checks[0].check;
                  return (
                    <div key={field.key} className="grid gap-2 px-5 py-3 sm:grid-cols-[minmax(120px,0.8fr)_auto_minmax(180px,1.4fr)] sm:items-center">
                      <span className="truncate text-xs font-bold text-ink">{field.key}</span>
                      <Chip tone={check.valid ? "good" : field.value === "NOT FOUND" ? "bad" : "neutral"}>
                        {check.valid ? "Validated" : field.value === "NOT FOUND" ? "Missing" : "Format check"}
                      </Chip>
                      <span className="text-[11px] text-ink-soft">
                        {field.evidence ? `Page ${field.evidence.page}      source coordinates available` : "No source location returned"}
                        <span className="ml-2 font-medium text-ink-soft">{check.message}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>

          <details className="group rounded-3xl border border-line bg-panel">
            <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-bold text-ink transition hover:text-brand-700">
              Raw OCR output
              <span className="text-xs font-semibold text-ink-soft transition group-open:rotate-180"></span>
            </summary>
            <div className="border-t border-line px-5 py-4">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-3xl bg-ink p-4 font-mono text-[11px] leading-relaxed text-paper">
                {result.rawText || "(no text recognised)"}
              </pre>
            </div>
          </details>
        </div>
      </div>

      {/* zoom modal */}
      {zoom && (
        <div
          className="animate-pop fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6 backdrop-blur-sm"
          onClick={() => setZoom(false)}
        >           <button
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-paper/10 text-paper transition hover:bg-paper/20"
            aria-label="Close zoom"
          >             <X className="h-5 w-5" />
          </button>
          <img
            src={result.imageUrl}
            alt={result.pageLabel}
            className="max-h-full max-w-full cursor-pointer rounded-3xl object-contain shadow-lg"
            onClick={() => setZoom(false)}
          />
        </div>
      )}
    </div>
  );
}
