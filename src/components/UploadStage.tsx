import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  FileText,
  Lightbulb,
  Loader2,
  Play,
  RotateCcw,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import type { DocumentOption, QueueItem } from "../types";
import { cn } from "../utils/cn";
import { Chip, ProgressBar } from "./ui";

const TIPS: Record<string, string[]> = {
  aadhaar: [
    "Lay the card perfectly flat with even, glare-free light.",
    "Fill the frame  keep all four corners visible.",
    "Avoid flash on holograms and the QR code.",
  ],
  passport: [
    "Open the page fully flat and include the two MRZ lines  at the bottom.",
    "Make sure laminated pages have no reflections.",
    "The MRZ zone gives checksum-verified results  keep it sharp.",
  ],
};

function statusChip(item: QueueItem) {
  switch (item.status) {
    case "reading":
      return (
        <Chip tone="brand">
          <Loader2 className="h-3 w-3 animate-spin" /> Preparing
        </Chip>
      );
    case "queued":
      return <Chip>{item.statusText === "Ready" ? "Ready" : "Queued"}</Chip>;
    case "ocr":
      return (
        <Chip tone="brand">
          <Loader2 className="h-3 w-3 animate-spin" /> {Math.round(item.progress)}%
        </Chip>
      );
    case "parsing":
      return (
        <Chip tone="brand">
          <Loader2 className="h-3 w-3 animate-spin" /> Extracting
        </Chip>
      );
    case "done":
      return (
        <Chip tone="good">
          <Check className="h-3 w-3" /> Done
        </Chip>
      );
    case "error":
      return (
        <Chip tone="bad">
          <AlertTriangle className="h-3 w-3" /> Failed
        </Chip>
      );
  }
}

export function UploadStage({
  doc,
  subtype,
  onSubtype,
  items,
  running,
  onAddFiles,
  onRemove,
  onScan,
  onCancel,
  onBack,
}: {
  doc: DocumentOption;
  subtype: string;
  onSubtype: (s: string) => void;
  items: QueueItem[];
  running: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onScan: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const queued = items.filter((i) => i.status === "queued").length;
  const preparing = items.some((i) => i.status === "reading");
  const active = items.find((i) => i.status === "ocr" || i.status === "parsing");
  const doneCount = items.filter((i) => i.status === "done").length;

  const scannable = queued;
  const activeSubtype = doc.subtypes.find((s) => s.id === subtype);

  return (
    <div className="animate-fade-up w-full max-w-[1280px]">
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel text-ink-soft transition hover:-translate-x-0.5 hover:text-ink"
          aria-label="Back"
        >           <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
            Upload {doc.label}
          </h2>
          <p className="text-sm text-ink-soft">{doc.tagline}</p>
        </div>
      </div>

      {/* subtype selector */}
      <div className="mt-6 flex flex-wrap gap-2">
        {doc.subtypes.map((s) => {
          const on = s.id === subtype;
          return (
            <button
              key={s.id}
              onClick={() => onSubtype(s.id)}
              disabled={running}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                on
                  ? "border-ink bg-ink text-paper shadow-[3px_3px_0_0_var(--color-brand-500)]"
                  : "border-line bg-panel text-ink-soft hover:border-ink/30 hover:text-ink"
              )}
            >               {s.label}
            </button>
          );
        })}
      </div>
      {activeSubtype && (
        <p className="mt-2 text-xs text-ink-soft">
          {activeSubtype.description}  extracts {activeSubtype.fields.slice(0, 3).join(", ")}
          {activeSubtype.fields.length > 3 ? ` +${activeSubtype.fields.length - 3} more` : ""}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* dropzone */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault();
              setDrag(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onAddFiles(Array.from(e.dataTransfer.files));
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            className={cn(
              "group cursor-pointer rounded-3xl border-2 border-dashed p-8 text-center transition sm:p-10",
              drag
                ? "border-brand-500 bg-brand-50"
                : "border-ink/15 bg-panel hover:border-brand-400 hover:bg-brand-50/40"
            )}
          >             <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,.pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                onAddFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <div
              className={cn(
                "mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border transition",
                drag
                  ? "border-brand-300 bg-brand-100 text-brand-600"
                  : "border-line bg-paper text-ink-soft group-hover:text-brand-600"
              )}
            >               <UploadCloud className="h-7 w-7" />
            </div>
            <p className="mt-4 font-display text-lg font-bold text-ink">
              {drag ? "Drop to add files" : "Drag & drop documents here"}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              or <span className="font-semibold text-brand-700 underline underline-offset-2">browse files</span>{" "}
               JPG, PNG, WebP or PDF  up to 25 MB each
            </p>
          </div>

          {/* queue */}
          {items.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h3 className="text-sm font-bold text-ink">
                  Queue <span className="ml-1 text-ink-soft">({items.length})</span>
                </h3>
                {running && active && (
                  <span className="max-w-55 truncate text-xs font-medium text-brand-700">
                    {active.statusText}
                  </span>
                )}
              </div>
              <ul className="max-h-105 divide-y divide-line overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="relative h-16 w-13 shrink-0 overflow-hidden rounded-3xl border border-line bg-paper">
                      {item.dataUrl ? (
                        <>
                          <img src={item.dataUrl} alt="" className="h-full w-full object-cover" />
                          {item.status === "ocr" && (
                            <span className="animate-scanline absolute inset-x-0 h-0.5 bg-brand-500 shadow-[0_0_12px_2px_rgba(90,85,227,0.7)]" />
                          )}
                        </>
                      ) : (
                        <FileText className="absolute inset-0 m-auto h-5 w-5 text-ink-soft/50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                      {item.status === "error" ? (
                        <p className="mt-0.5 truncate text-xs text-ink">{item.error}</p>
                      ) : item.status === "ocr" || item.status === "parsing" ? (
                        <ProgressBar value={item.progress} className="mt-2 max-w-60" />
                      ) : (
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {item.status === "done" && item.result
                            ? `${item.result.fields.filter((f) => f.value !== "NOT FOUND").length} fields      ${(item.result.durationMs / 1000).toFixed(1)}s`
                            : item.statusText}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {statusChip(item)}
                      {!running && (
                        <button
                          onClick={() => onRemove(item.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft/60 transition hover:bg-paper hover:text-ink"
                          aria-label={`Remove ${item.name}`}
                        >                           <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* side panel */}
        <aside className="space-y-5">
          <div className="rounded-3xl border border-line bg-panel p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Lightbulb className="h-4 w-4 text-ink" />
              Get a perfect scan
            </h3>
            <ul className="mt-3 space-y-2.5">
              {TIPS[doc.id].map((tip) => (
                <li key={tip} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-saffron" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-ink bg-ink p-5 text-paper">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-paper/60">
              Ready when you are
            </p>
            <p className="mt-2 font-display text-3xl font-extrabold">
              {doneCount > 0 && scannable === 0 ? doneCount : scannable}
              <span className="text-lg text-paper/50"> file{scannable === 1 && doneCount === 0 ? "" : "s"}</span>
            </p>
            {running ? (
              <button
                onClick={onCancel}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/90 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500"
              >                 <Square className="h-4 w-4" /> Stop scanning
              </button>
            ) : (
              <button
                onClick={onScan}
                disabled={scannable === 0 || preparing}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-3xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
              >                 <Play className="h-4 w-4" />
                {doneCount > 0 && scannable > 0
                  ? `Scan ${scannable} more`
                  : scannable > 0
                    ? `Scan ${scannable} document${scannable === 1 ? "" : "s"}`
                    : preparing
                      ? "Preparing files       "
                      : "Add files to scan"}
              </button>
            )}
            {running && active && (
              <div className="mt-4">
                <ProgressBar value={active.progress} />
                <p className="mt-2 text-center text-[11px] font-medium text-paper/60">
                  First run downloads the engine (~15 MB, cached after)
                </p>
              </div>
            )}
            {!running && doneCount > 0 && scannable === 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-paper">
                <Check className="h-3.5 w-3.5" /> Entire queue processed  review results below
              </p>
            )}
          </div>

          {items.some((i) => i.status === "error") && !running && (
            <button
              onClick={onScan}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-bold text-ink-soft transition hover:bg-brand-100"
            >               <RotateCcw className="h-4 w-4" /> Retry failed files
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}



