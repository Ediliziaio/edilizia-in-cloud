import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { etichettaFasePdf, FASE_ANNULLABILE, type FasePdf } from "@/lib/sicurezza/posPdfErrori";

/**
 * L'avanzamento del PDF del POS (anteprima, approvazione, copia di un contenuto archiviato): il testo di ogni fase sta
 * in posPdfErrori.ts, qui l'annuncio per gli screen reader e «Annulla» a sola icona (regola del telefono: azioni
 * secondarie solo icona, l'azione principale occupa il resto della riga). Si annulla finché si prepara o si disegna.
 */

/** Chi usa uno screen reader sente la fase anche se il testo sta già dentro il pulsante. */
export function AnnunciaFasePdf({ fase }: { fase: FasePdf | null | undefined }) {
  return <span role="status" aria-live="polite" className="sr-only">{etichettaFasePdf(fase) ?? ""}</span>;
}

export function AnnullaPdf({ fase, onAnnulla, className }: { fase: FasePdf | null | undefined; onAnnulla?: () => void; className?: string }) {
  if (!fase || !FASE_ANNULLABILE.has(fase) || !onAnnulla) return null;
  return (
    <Button type="button" variant="outline" size="icon" aria-label="Annulla" title="Annulla" className={className ?? "tap-compact max-sm:shrink-0"} onClick={onAnnulla}>
      <X className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
