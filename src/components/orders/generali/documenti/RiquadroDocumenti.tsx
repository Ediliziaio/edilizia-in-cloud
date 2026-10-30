// src/components/orders/generali/documenti/RiquadroDocumenti.tsx
// In Panoramica, sotto i quattro numeri: «3 documenti mancanti, 1 in scadenza», e un tocco apre
// la scheda Documenti. Se è tutto a posto lo dice in una riga; mentre legge, non occupa spazio.
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronRight, FileCheck2 } from "lucide-react";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { useChecklistGenerale } from "@/hooks/useGeneraleDocumenti";
import { testoConteggi } from "@/lib/orders/generali/documenti";
import { cn } from "@/lib/utils";

export function RiquadroDocumenti({ riepilogo }: PropsScheda) {
  const { checklist } = useChecklistGenerale(riepilogo);
  const [parametri, setParametri] = useSearchParams();
  if (!checklist) return null;
  const c = checklist.conteggi;
  if (c.richiesti === 0 && c.inScadenza === 0 && c.scaduti === 0) return null;
  const testo = testoConteggi(c);
  const apri = () => {
    const dopo = new URLSearchParams(parametri);
    dopo.set("scheda", "documenti");
    setParametri(dopo, { replace: true });
  };
  return (
    <button
      type="button"
      onClick={apri}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
        testo
          ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100/70 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          : "bg-card hover:bg-muted/40",
      )}
    >
      {testo
        ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        : <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">Documenti</span>
        {" · "}
        {testo ?? `tutti presenti (${c.presenti} di ${c.richiesti})`}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
    </button>
  );
}
