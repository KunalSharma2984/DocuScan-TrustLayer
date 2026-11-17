import { LogOut, Lock, ScanText } from "lucide-react";
import { cn } from "../utils/cn";

export type Step = "dashboard" | "select" | "prepare" | "results";

const STEPS: { id: Step; label: string }[] = [
  { id: "dashboard", label: "Workspace" },
  { id: "select", label: "Document" },
  { id: "prepare", label: "Upload & scan" },
  { id: "results", label: "Review" },
];

export function Header({ step, onNavigate, email, onSignOut }: { step: Step; onNavigate: (s: Step) => void; email: string; onSignOut: () => void }) {
  const activeIdx = STEPS.findIndex((s) => s.id === step);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-6 sm:px-10">
        <button
          onClick={() => onNavigate("dashboard")}
          className="group flex items-center gap-3"
          aria-label="DocuScan home"
        >           <span className="relative flex h-9 w-9 items-center justify-center rounded-3xl bg-ink text-paper shadow-[3px_3px_0_0_var(--color-brand-500)] transition-transform duration-300 group-hover:-translate-y-0.5">
            <ScanText className="h-5 w-5" />
          </span>
          <span className="text-left">
            <span className="block font-display text-[17px] font-bold leading-none tracking-tight">
              DocuScan
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              ID OCR Studio
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 rounded-2xl border border-line bg-panel p-1 md:flex">
          {STEPS.map((s, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
              <button
                key={s.id}
                onClick={() => ((done || active) ? onNavigate(s.id) : undefined)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                  active && "bg-ink text-paper",
                  done && "text-brand-700 hover:bg-brand-50",
                  !done && !active && "cursor-default text-ink-soft/60"
                )}
              >                 <span
                  className={cn(
                    "flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[9px]",
                    active ? "border-paper/40" : done ? "border-brand-300 bg-brand-100" : "border-line"
                  )}
                >                   {i + 1}
                </span>
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 text-[11px] font-semibold text-ink-soft">
          <Lock className="h-3.5 w-3.5 text-mint" />
          <span className="hidden max-w-35 truncate sm:inline">{email}</span>
          <button onClick={onSignOut} className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-1.5 hover:text-ink" title="Sign out">
            <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}




