/**
 * PecBadge — MP-EMAIL-AI-17 · marca visibile dei messaggi PEC (valore legale)
 *
 * Mostra che il messaggio è PEC e, se è un invio tracciato, il suo stato
 * (inviata → accettata → consegnata, o mancata consegna in rosso).
 */
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { etichettaPecStato, etichettaPecTipo, pecRichiedeAlert } from "@/lib/email-ai/pec";

export function PecBadge({
  isPec, pecTipo, pecStato, className = "",
}: {
  isPec?: boolean | null;
  pecTipo?: string | null;
  pecStato?: string | null;
  className?: string;
}) {
  if (!isPec) return null;
  const mancata = pecRichiedeAlert(pecStato);

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      <Badge variant="outline" className="gap-1 border-violet-200 bg-violet-50 text-[10px] text-violet-700">
        <ShieldCheck className="h-3 w-3" /> PEC
      </Badge>
      {pecTipo && pecTipo !== "messaggio" && (
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
          {etichettaPecTipo(pecTipo)}
        </Badge>
      )}
      {pecStato && (
        <Badge
          variant="outline"
          className={
            mancata
              ? "gap-1 border-rose-200 bg-rose-50 text-[10px] text-rose-700"
              : pecStato === "consegnata"
              ? "border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
              : "border-blue-200 bg-blue-50 text-[10px] text-blue-700"
          }
        >
          {mancata && <AlertTriangle className="h-3 w-3" />}
          {etichettaPecStato(pecStato)}
        </Badge>
      )}
    </span>
  );
}
