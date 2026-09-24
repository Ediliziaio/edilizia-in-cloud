import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, FileDown, Loader2, Send, XCircle } from "lucide-react";
import { faseSdi, type DocFaseSdi, type FaseSdi, type StatoSdiVisibile } from "@/lib/fatturazione/sdiCassetto";

// La fase della fattura verso lo SDI, uguale in elenco, editor, dettaglio e
// cassetto (24/09/2026): «Da inviare SDI» → «In elaborazione» → «Inviata».

const TONI: Record<StatoSdiVisibile["tono"], string> = {
  attesa: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  lavoro: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  errore: "bg-destructive/10 text-destructive border-destructive/30",
};

const ICONE: Record<FaseSdi, React.ElementType> = {
  da_inviare: Send,
  invio_in_corso: Loader2,
  in_elaborazione: Clock,
  inviata: CheckCircle2,
  accettata: CheckCircle2,
  scartata: XCircle,
  rifiutata_ente: XCircle,
  manuale: FileDown,
};

export function FaseSdiBadge({ doc, className }: { doc: DocFaseSdi; className?: string }) {
  const f = faseSdi(doc);
  if (!f) return null;
  const Icon = ICONE[f.fase];
  return (
    <span
      title={f.spiegazione}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border whitespace-nowrap",
        TONI[f.tono],
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", f.fase === "invio_in_corso" && "animate-spin")} />
      {f.etichetta}
    </span>
  );
}
