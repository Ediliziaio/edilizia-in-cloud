import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copy only on an explicit gesture, and never claim success on a denied clipboard. */
export function SilvioCopyAnswer({ content }: { content: string }) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    setStatus("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(content);
      if (mounted.current) setStatus("copied");
    } catch {
      if (mounted.current) setStatus("error");
    }
  };
  if (!content.trim()) return null;
  return <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
    <button type="button" onClick={() => void copy()} disabled={status === "copying"}
      aria-label="Copia risposta" className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-50">
      {status === "copied" ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
      {status === "copied" ? "Copiata" : "Copia"}
    </button>
    <span role="status" aria-live="polite">{status === "error" ? "Copia non riuscita. Seleziona il testo e copialo manualmente." : status === "copied" ? "Risposta copiata." : ""}</span>
  </div>;
}
