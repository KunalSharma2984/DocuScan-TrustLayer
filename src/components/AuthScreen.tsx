import { useState, type FormEvent } from "react";
import { LockKeyhole, LogIn, UserPlus } from "lucide-react";
import { signIn, signUp } from "../lib/api";

export function AuthScreen() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const session = mode === "signIn"
        ? await signIn(email, password)
        : await signUp(email, password);
      if (!session) {
        setMessage("Account created. Check your email to confirm the account, then sign in.");
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-line bg-panel p-7 shadow-[8px_8px_0_0_var(--color-brand-500)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-paper">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight text-ink">Private workspace</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">Sign in to access only the documents belonging to your account.</p>
        <label className="mt-6 block text-xs font-bold uppercase tracking-wide text-ink-soft">Email</label>
        <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-3xl border border-line bg-paper px-4 py-3 text-sm text-ink" />
        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink-soft">Password</label>
        <input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-3xl border border-line bg-paper px-4 py-3 text-sm text-ink" />
        {message && <p className="mt-4 rounded-3xl border border-line bg-paper px-3 py-2 text-xs leading-relaxed text-ink-soft">{message}</p>}
        <button disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-3xl bg-brand-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
          {mode === "signIn" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {busy ? "Please wait   " : mode === "signIn" ? "Sign in" : "Create account"}
        </button>
        <button type="button" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setMessage(""); }} className="mt-4 w-full text-center text-xs font-bold text-brand-700 hover:underline">
          {mode === "signIn" ? "Need an account - Create one" : "Already have an account - Sign in"}
        </button>
      </form>
    </main>
  );
}





