import { ArrowRight, BookOpen, CreditCard, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { DocumentOption, DocumentType } from "../types";
import { cn } from "../utils/cn";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Checksum-verified",
    text: "Verhoeff validation on Aadhaar numbers and ICAO check-digit repair on passport MRZs.",
  },
  {
    icon: Zap,
    title: "Two-pass OCR engine",
    text: "Adaptive contrast normalisation, sparse-text retry and a dedicated MRZ glyph pass.",
  },
  {
    icon: Sparkles,
    title: "Nothing leaves the browser",
    text: "All recognition runs locally in a WASM worker. Your documents are never uploaded.",
  },
];

export function HomeSelect({
  documents,
  onSelect,
}: {
  documents: DocumentOption[];
  onSelect: (id: DocumentType) => void;
}) {
  return (
    <div>
      <section className="w-full max-w-5xl border-b border-line pb-8 pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-700">New batch</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">Choose a document type</h1>
        <p
          className="animate-fade-up mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft sm:text-base"
          style={{ animationDelay: "160ms" }}
        >           Drop a photo or PDF of an Indian Aadhaar card or passport. DocuScan reads it, verifies
          it against official checksums, and hands you clean, editable JSON  all on-device.
        </p>
      </section>

      <section className="mt-8 grid w-full max-w-5xl gap-5 sm:grid-cols-2">
        {documents.map((doc, i) => (
          <button
            key={doc.id}
            onClick={() => onSelect(doc.id)}
            className="group animate-fade-up relative overflow-hidden border border-line bg-panel p-6 text-left transition duration-200 hover:border-brand-400 hover:bg-brand-50/30 sm:p-7"
            style={{ animationDelay: `${240 + i * 90}ms` }}
          >             <div className="relative">
              <span
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-2xl border transition duration-300",
                  doc.icon === "aadhaar"
                    ? "border-brand-200 bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white"
                    : "border-line bg-paper text-ink-soft group-hover:bg-saffron group-hover:text-white"
                )}
              >                 {doc.icon === "aadhaar" ? <CreditCard className="h-6 w-6" /> : <BookOpen className="h-6 w-6" />}
              </span>
              <h2 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink">{doc.label}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{doc.description}</p>

              <div className="mt-5 flex flex-wrap gap-1.5">
                {doc.subtypes.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink-soft"
                  >                     {s.label}
                  </span>
                ))}
              </div>

              <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-brand-700">
                Start scanning
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white transition duration-300 group-hover:translate-x-1">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </span>
            </div>
          </button>
        ))}
      </section>

      <section className="mt-12 grid w-full max-w-5xl gap-6 border-t border-line pt-6 sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="animate-fade-up border-l-2 border-brand-300 pl-4"
            style={{ animationDelay: `${420 + i * 80}ms` }}
          >             <f.icon className="h-5 w-5 text-brand-600" />
            <h3 className="mt-3 text-sm font-bold text-ink">{f.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}




