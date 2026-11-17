import {
  Clock3,
  FileCheck2,
  FileClock,
  Files,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { ScanResult } from "../types";
import { isApiConfigured } from "../lib/api";
import { validateResult } from "../lib/fieldValidation";

type DashboardProps = {
  results: ScanResult[];
  queued: number;
  onNewBatch: () => void;
  onOpenResults: () => void;
};

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

export function Dashboard({ results, queued, onNewBatch, onOpenResults }: DashboardProps) {
  const needsReviewFor = (result: ScanResult) =>
    result.fields.some((field) =>
      !validateResult({ ...result, fields: [field] }).valid
    );
  const found = results.reduce((total, result) => total + result.fields.filter((field) => field.value !== "NOT FOUND").length, 0);
  const verified = results.reduce((total, result) => total + result.fields.filter((field) => field.verified).length, 0);
  const needsReview = results.filter(needsReviewFor).length;
  const processingTime = results.length
    ? `${(results.reduce((total, result) => total + result.durationMs, 0) / results.length / 1000).toFixed(1)}s`
    : "";

  const stats = [
    { label: "Documents processed", value: results.length, detail: "This session", icon: Files, tone: "text-brand-600" },
    { label: "Awaiting review", value: needsReview, detail: "Needs a human decision", icon: FileClock, tone: "text-ink-soft" },
    { label: "Fields verified", value: verified, detail: `${found} fields extracted`, icon: FileCheck2, tone: "text-ink" },
    { label: "Average processing", value: processingTime, detail: "Per document", icon: Clock3, tone: "text-ink-soft" },
  ];

  return (
    <div className="animate-fade-up space-y-8">
      <section className="flex flex-col justify-between gap-5 border-b border-line pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-700">Workspace</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink">Document review</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Process identity documents, resolve uncertain fields, and export only data you trust.
          </p>
        </div>
        <button onClick={onNewBatch} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-bold text-paper transition hover:bg-ink/90">
          <Plus className="h-4 w-4" /> New batch
        </button>
      </section>

      <section className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-3xl bg-paper ${stat.tone}`}><stat.icon className="h-4.5 w-4.5" /></span>
              <stat.icon className={`h-4 w-4 ${stat.tone} opacity-60`} />
            </div>
            <p className="mt-5 font-display text-3xl font-extrabold tracking-tight text-ink">{stat.value}</p>
            <p className="mt-1 text-sm font-bold text-ink">{stat.label}</p>
            <p className="mt-1 text-xs text-ink-soft">{stat.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-3xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-ink">Recent batches</h2>
              <p className="mt-0.5 text-xs text-ink-soft">Only aggregate workflow data is shown here.</p>
            </div>
            {results.length > 0 && <button onClick={onOpenResults} className="text-xs font-bold text-brand-700 hover:underline">Open review</button>}
          </div>
          {results.length === 0 && queued === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Sparkles className="h-8 w-8 text-brand-500" />
              <h3 className="mt-4 font-display text-lg font-bold text-ink">Your workspace is clear</h3>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">Start a batch to see processing progress, validation outcomes, and review work appear here.</p>
              <button onClick={onNewBatch} className="mt-5 rounded-3xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Upload documents</button>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {results.slice(-4).reverse().map((result) => (
                <button key={result.id} onClick={onOpenResults} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-paper">
                  {result.imageUrl ? (
                    <img src={result.imageUrl} alt="" className="h-10 w-8 rounded-md border border-line object-cover" />
                  ) : (
                    <span className="flex h-10 w-8 items-center justify-center rounded-md border border-line bg-paper text-[9px] text-ink-soft">Open</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink">
                      <span className="min-w-0 flex-1 truncate">{result.pageLabel}</span>
                      <span className="flex w-20 shrink-0 justify-center rounded-full bg-paper px-1 py-1 text-[9px] font-bold uppercase tracking-wide text-ink-soft">
                        {documentTag(result)}
                      </span>
                    </span>
                    <span className="text-xs text-ink-soft">{result.fields.filter((field) => field.value !== "NOT FOUND").length}/{result.fields.length} fields</span>
                  </span>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      needsReviewFor(result)
                        ? "bg-paper"
                        : "bg-ink/50"
                    }`}
                    aria-label={needsReviewFor(result) ? "Needs review" : "Complete"}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="border border-line bg-panel p-5">
            <h2 className="font-display text-base font-bold text-ink">Review guidance</h2>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-ink-soft">
              <p><span className="font-bold text-ink">Verified</span> means the value passed a checksum; it is not proof of authenticity.</p>
              <p><span className="font-bold text-ink">Needs review</span> identifies missing or low-confidence fields before export.</p>
              <p><span className="font-bold text-ink">Privacy</span> is enforced by Supabase Auth and row-level security.</p>
            </div>
          </div>
          <div className="rounded-3xl border border-brand-200 bg-brand-50 p-5">
            <div className="flex gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" /><div><h2 className="text-sm font-bold text-brand-900">Privacy guardrails active</h2><p className="mt-1 text-xs leading-relaxed text-brand-800/75">Documents are isolated to your Supabase account. Checksum validation is not authenticity verification.</p></div></div>
          </div>
          {queued > 0 && <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-xs font-semibold text-ink-soft"><TriangleAlert className="h-4 w-4" /> {queued} document{queued === 1 ? "" : "s"} queued for processing.</div>}
        </div>
      </section>

      <div className="flex items-center gap-2 text-xs text-ink-soft"><ShieldCheck className="h-4 w-4 text-ink" /> {isApiConfigured ? "Supabase storage enabled           exports are explicit" : "Supabase configuration required           exports are explicit"}</div>
    </div>
  );
}



