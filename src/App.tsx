import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { Header, type Step } from "./components/Header";
import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./components/Dashboard";
import { HomeSelect } from "./components/HomeSelect";
import { UploadStage } from "./components/UploadStage";
import { ResultsView } from "./components/ResultsView";
import { useScanner } from "./hooks/useScanner";
import { fieldsToObject } from "./lib/extractors";
import { validateResult } from "./lib/fieldValidation";
import { verhoeffRepair } from "./lib/validate";
import { warmEngine } from "./lib/ocr";
import { deleteAllDocuments, deleteDocument, deleteDocuments, getSession, getSignedImageUrl, isApiConfigured, loadDocuments, signOut, subscribeToAuth, saveDocument } from "./lib/api";
import type { Session } from "@supabase/supabase-js";
import type { DocumentOption, DocumentType, ScanResult, Toast } from "./types";
import { cn } from "./utils/cn";

const DOCUMENTS: DocumentOption[] = [
  {
    id: "aadhaar",
    label: "Aadhaar",
    tagline: "UIDAI identity card  DigiLocker PDF, full print or PVC card",
    description: "DigiLocker PDFs, printed full cards and small PVC cards  with Verhoeff checksum verification of the 12-digit number.",
    icon: "aadhaar",
    subtypes: [
      {
        id: "digilocker",
        label: "DigiLocker",
        description: "PDF or screenshot from DigiLocker",
        fields: ["Name", "Date of Birth", "Gender", "Aadhaar No.", "Address", "PIN Code"],
      },
      {
        id: "full",
        label: "Full Card",
        description: "Full printed Aadhaar letter / e-Aadhaar",
        fields: ["Name", "Date of Birth", "Gender", "Aadhaar No.", "Father's Name", "Address", "District", "State", "PIN Code", "Mobile No."],
      },
      {
        id: "small",
        label: "Small PVC Card",
        description: "Compact PVC Aadhaar card photo",
        fields: ["Name", "Date of Birth", "Gender", "Aadhaar No."],
      },
    ],
  },
  {
    id: "passport",
    label: "Passport",
    tagline: "Indian passport  personal page or address page",
    description: "Front and back pages with ICAO MRZ parsing  check-digit-verified passport numbers, dates and names.",
    icon: "passport",
    subtypes: [
      {
        id: "front",
        label: "Front Page",
        description: "Photo & personal details page",
        fields: ["Passport No.", "Name", "Nationality", "Gender", "Date of Birth", "Place of Issue", "Date of Expiry"],
      },
      {
        id: "back",
        label: "Back Page",
        description: "Address & family details page",
        fields: ["Father's / Guardian's Name", "Mother's Name", "Address", "PIN Code", "File No."],
      },
    ],
  },
];

function resultPayload(r: ScanResult) {
  return {
    file: r.pageLabel,
    documentType: r.documentType,
    subtype: r.subtype,
    quality: r.quality,
    ocrConfidence: Math.round(r.ocrConfidence),
    scannedAt: new Date().toISOString(),
    fields: fieldsToObject(r.fields),
    warnings: r.warnings,
  };
}

function safeName(base: string) {
  return base.replace(/\.[^/.]+$/, "").replace(/[^\w.-]+/g, "_") || "scan";
}

function saveResult(result: ScanResult): ScanResult {
  const fields = result.fields.map((field) => {
    let value = field.value.trim() || "NOT FOUND";
    let hint = field.hint;
    if (field.key === "Aadhaar No." && /^\d[\d\s-]*$/.test(value)) {
      const digits = value.replace(/\D/g, "");
      if (/^\d{12}$/.test(digits)) {
        const repaired = verhoeffRepair(digits, 1);
        if (repaired && repaired !== digits) {
          value = repaired.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");
          hint = "One misread digit auto-corrected via checksum";
        }
      }
    }
    const candidate = { ...field, value };
    const check = validateResult({ ...result, fields: [candidate] }).checks[0].check;
    return {
      ...candidate,
      confidence: check.valid ? check.confidence : "low",
      reviewStatus: check.valid ? "approved" as const : "pending" as const,
      hint: hint ?? check.message,
    };
  });
  const validated = validateResult({ ...result, fields });
  const warnings = result.warnings.filter(
    (warning) => !(fields.find((field) => field.key === "Aadhaar No.")?.value !== "NOT FOUND" &&
      warning.startsWith("Aadhaar number could not be located"))
  );
  return {
    ...result,
    fields,
    warnings,
    saved: true,
    reviewStatus: validated.valid ? "complete" : "needs_review",
  };
}

export default function App() {
  const [step, setStep] = useState<Step>("dashboard");
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [subtype, setSubtype] = useState("");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [active, setActive] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [copied, setCopied] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const toastId = useRef(0);
  const scanner = useScanner();

  const doc = DOCUMENTS.find((d) => d.id === docType) ?? null;

  const pushToast = useCallback((kind: Toast["kind"], message: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

  // Warm the OCR engine shortly after the app loads so the first scan is fast.
  useEffect(() => {
    const t = window.setTimeout(() => warmEngine(), 1200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch((error: Error) => pushToast("error", `Authentication could not be loaded: ${error.message}`))
      .finally(() => setAuthLoading(false));
    return subscribeToAuth((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setResults([]);
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    loadDocuments()
      .then(setResults)
      .catch((error: Error) => pushToast("error", `Supabase workspace could not be loaded: ${error.message}`));
  }, [session]);

  useEffect(() => {
    const result = results[active];
    if (!result?.imagePath || result.imageUrl) return;
    getSignedImageUrl(result.imagePath)
      .then((imageUrl) => {
        setResults((prev) => prev.map((item) => item.id === result.id ? { ...item, imageUrl } : item));
      })
      .catch((error: Error) => pushToast("error", `Document preview could not be loaded: ${error.message}`));
  }, [active, results, pushToast]);

  /* ------------------------------ actions ----------------------------- */

  const selectDoc = (id: DocumentType) => {
    setDocType(id);
    const first = DOCUMENTS.find((d) => d.id === id)?.subtypes[0];
    setSubtype(first?.id ?? "");
    setStep("prepare");
  };

  const handleAddFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const summary = await scanner.addFiles(files);
    if (summary.added > 0) {
      pushToast("success", `${summary.added} page${summary.added === 1 ? "" : "s"} ready to scan`);
    }
    summary.skipped.slice(0, 3).forEach((s) => pushToast("error", s));
  };

  const handleScan = async () => {
    if (!docType) return;
    const hasQueued = scanner.items.some((i) => i.status === "queued");
    const hasErrors = scanner.items.some((i) => i.status === "error");
    if (!hasQueued && hasErrors) scanner.retryErrors();
    const res = await scanner.start(docType, subtype);
    if (res.length > 0) {
      setActive(results.length);
      setResults((prev) => [...prev, ...res]);
      setStep("results");
      pushToast("success", `Extracted ${res.reduce((a, r) => a + r.fields.filter((f) => f.value !== "NOT FOUND").length, 0)} fields from ${res.length} document${res.length === 1 ? "" : "s"}`);
    } else {
      pushToast("error", "Nothing could be scanned  check the failed items and retry.");
    }
  };

  const handleSaveCurrent = async () => {
    if (!results[active]) return;
    const savedResult = saveResult(results[active]);
    try {
      const imagePath = await saveDocument(savedResult);
      setResults((prev) => prev.map((result, index) => index === active ? { ...savedResult, imagePath } : result));
      const next = results.findIndex((result, index) => index > active && !result.saved);
      if (next >= 0) setActive(next);
      const statusMessage = savedResult.reviewStatus === "complete"
        ? "Document saved and marked Ready."
        : "Document saved, but it still needs review.";
      pushToast(savedResult.reviewStatus === "complete" ? "success" : "info",
        next >= 0 ? `${statusMessage} Ready for the next document.` : statusMessage);
    } catch (error) {
      pushToast("error", `Document could not be saved to Supabase: ${(error as Error).message}`);
    }
  };

  const handleSaveAll = async () => {
    const savedResults = results.map(saveResult);
    try {
      const imagePaths = await Promise.all(savedResults.map(saveDocument));
      setResults(savedResults.map((result, index) => ({ ...result, imagePath: imagePaths[index] })));
      setStep("dashboard");
      pushToast("success", `Saved ${results.length} document${results.length === 1 ? "" : "s"} to Supabase.`);
    } catch (error) {
      pushToast("error", `Documents could not be saved to Supabase: ${(error as Error).message}`);
    }
  };

  const handleRemoveResult = async (id: string) => {
    try {
      await deleteDocument(id);
    } catch (error) {
      pushToast("error", `Document could not be removed from Supabase: ${(error as Error).message}`);
      return;
    }
    setResults((prev) => {
      const next = prev.filter((result) => result.id !== id);
      if (next.length === 0) setStep("dashboard");
      return next;
    });
    setActive((current) => Math.max(0, Math.min(current, results.length - 2)));
    pushToast("info", "Document removed from review.");
  };

  const handleRemoveResults = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      await deleteDocuments(ids);
      setResults((prev) => prev.filter((result) => !ids.includes(result.id)));
      setActive((current) => Math.max(0, Math.min(current, results.length - ids.length - 1)));
      pushToast("info", `${ids.length} document${ids.length === 1 ? "" : "s"} removed.`);
    } catch (error) {
      pushToast("error", `Documents could not be removed from Supabase: ${(error as Error).message}`);
    }
  };

  const handleRemoveAll = async () => {
    if (!window.confirm("Remove all documents from Review & export> This cannot be undone.")) return;
    try {
      await deleteAllDocuments();
    } catch (error) {
      pushToast("error", `Documents could not be removed from Supabase: ${(error as Error).message}`);
      return;
    }
    setResults([]);
    setActive(0);
    setStep("dashboard");
    pushToast("info", "All documents removed from review.");
  };

  const handleNewScan = () => {
    scanner.clear();
    setActive(0);
    setStep("dashboard");
    setDocType(null);
    setSubtype("");
  };

  const handleNavigate = (s: Step) => {
    if (s === "dashboard") setStep("dashboard");
    else if (s === "select") setStep("select");
    else if (s === "prepare" && docType) setStep("prepare");
    else if (s === "results" && results.length > 0) setStep("results");
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      pushToast("error", `Could not sign out: ${(error as Error).message}`);
    }
  };

  const handleFieldChange = (idx: number, key: string, value: string) => {
    setResults((prev) =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              warnings:
                key === "Aadhaar No." && value.trim()
                  ? r.warnings.filter((warning) => !warning.startsWith("Aadhaar number could not be located"))
                  : r.warnings,
              fields: r.fields.map((f) => {
                if (f.key !== key) return f;
                const edited = {
                  ...f,
                  value: value || "NOT FOUND",
                  verified: value.trim() ? false : f.verified,
                };
                const check = validateResult({ ...r, fields: [edited] }).checks[0].check;
                return {
                  ...edited,
                  confidence: check.valid ? check.confidence : value.trim() ? "low" : "missing",
                  reviewStatus: check.valid ? "approved" : "pending",
                  hint: check.message,
                };
              }),
            }
          : r
      )
    );
  };

  const download = (name: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleExportJson = (r: ScanResult) => {
    download(`${safeName(r.pageLabel)}.json`, JSON.stringify(resultPayload(r), null, 2), "application/json");
    pushToast("info", "JSON downloaded");
  };

  const handleExportCsv = () => {
    if (results.length === 0) return;
    const keys: string[] = [];
    for (const r of results) {
      for (const f of r.fields) if (!keys.includes(f.key)) keys.push(f.key);
    }
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ["File", "Document", ...keys].map(esc).join(",");
    const rows = results.map((r) => {
      const obj = fieldsToObject(r.fields);
      return [esc(r.pageLabel), esc(`${r.documentType}/${r.subtype}`), ...keys.map((k) => esc(obj[k] ?? ""))].join(",");
    });
    download("docuscan-results.csv", [header, ...rows].join("\n"), "text/csv");
    pushToast("info", `CSV with ${results.length} row${results.length === 1 ? "" : "s"} downloaded`);
  };

  const handleCopyJson = async (r: ScanResult) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(resultPayload(r), null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      pushToast("error", "Clipboard is blocked by the browser  use Export instead.");
    }
  };

  /* -------------------------------- view ------------------------------ */

  if (!isApiConfigured) {
    return <AuthScreen />;
  }
  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-paper text-sm font-semibold text-ink-soft">Loading secure workspace</div>;
  }
  if (!session) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-paper font-sans text-ink antialiased">
      <Header step={step} onNavigate={handleNavigate} email={session.user.email ?? "Signed in"} onSignOut={handleSignOut} />

      <main className="mx-auto w-full max-w-[1440px] px-6 pb-24 pt-8 sm:px-10 sm:pt-12">
        {step === "dashboard" && (
          <Dashboard
            results={results}
            queued={scanner.items.filter((item) => item.status === "queued" || item.status === "reading").length}
            onNewBatch={() => setStep("select")}
            onOpenResults={() => setStep("results")}
          />
        )}
        {step === "select" && <HomeSelect documents={DOCUMENTS} onSelect={selectDoc} />}

        {step === "prepare" && doc && (
          <UploadStage
            doc={doc}
            subtype={subtype}
            onSubtype={setSubtype}
            items={scanner.items}
            running={scanner.running}
            onAddFiles={handleAddFiles}
            onRemove={scanner.removeItem}
            onScan={handleScan}
            onCancel={scanner.cancel}
            onBack={handleNewScan}
          />
        )}

        {step === "results" && results.length > 0 && (
          <ResultsView
            results={results}
            active={active}
            onActive={setActive}
            onFieldChange={handleFieldChange}
            onExportJson={handleExportJson}
            onExportCsv={handleExportCsv}
            onCopyJson={handleCopyJson}
            onNewScan={handleNewScan}
            onSaveCurrent={handleSaveCurrent}
            onSaveAll={handleSaveAll}
            onRemoveResult={handleRemoveResult}
            onRemoveResults={handleRemoveResults}
            onRemoveAll={handleRemoveAll}
            copied={copied}
          />
        )}
      </main>

      <footer className="border-t border-line bg-panel/60">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 px-6 py-4 text-[11px] font-medium text-ink-soft sm:px-10">
          <span>DocuScan TrustLayer  Evidence-first document intelligence</span>
          <span className="font-mono">
            Tesseract WASM  Verhoeff  ICAO 9303  private mode
          </span>
        </div>
      </footer>

      {/* toasts */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-pop pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur",
              t.kind === "error" && "border-line bg-paper/95 text-ink",
              t.kind === "success" && "border-line bg-ink/5/95 text-ink",
              t.kind === "info" && "border-line bg-panel/95 text-ink"
            )}
          >             {t.kind === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : t.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p className="flex-1 text-xs font-medium leading-relaxed">{t.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="opacity-50 transition hover:opacity-100"
              aria-label="Dismiss"
            >               <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
