import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export type SilvioRequestPhase = "sending" | "waiting" | "recovering";

/** Phase comes from the request, never guessed from the question or elapsed time. */
export function SilvioRequestStatus({ phase, onStop }: {
  phase: SilvioRequestPhase;
  onStop?: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(timer);
  }, []);
  const label = phase === "sending" ? "Invio della domanda…"
    : phase === "recovering" ? "Recupero la risposta salvata…" : "Silvio sta preparando la risposta…";
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
    <p role="status" aria-live="polite" className="flex items-start gap-2 font-medium text-slate-700">
      <Loader2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none text-orange-500" />
      {label}
    </p>
    {(slow || phase === "recovering") && <p className="mt-1 text-xs leading-relaxed text-slate-500">
      {phase === "sending" ? "L’invio non è ancora confermato." : "Non serve reinviare la domanda. La risposta apparirà in questa conversazione."}
    </p>}
    {onStop && <button type="button" onClick={onStop} className="mt-2 min-h-8 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
      Interrompi attesa
    </button>}
  </div>;
}
