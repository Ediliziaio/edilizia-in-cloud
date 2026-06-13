import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles, Camera, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiSerramentiDraftDialog } from "./AiSerramentiDraftDialog";
import { useAddSerramento } from "@/lib/serramenti/queries";
import { calcolaM2 } from "@/lib/serramenti/calcoli";
import type { SrMaterialePrincipale, SrProgettoDetail } from "@/types/serramenti";
import type { SrAiDraftItem } from "@/lib/serramenti/aiDraft";

type AiLauncherContext = "contact" | "bom";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
  context?: AiLauncherContext;
  onInserted?: (id: string) => void;
  onGoToComposition?: () => void;
  /** Apre automaticamente la dialog AI quando diventa true (one-shot).
   *  Usato dal flusso "Avvia con Silvio AI" del primo step. */
  autoOpen?: boolean;
}

const COPY: Record<AiLauncherContext, {
  title: string;
  description: string;
  cta: string;
}> = {
  contact: {
    title: "Silvio AI — crea il preventivo",
    description: "Scatta una foto del rilievo, detta a voce o scrivi cosa serve: Silvio prepara la bozza usando anche cliente, indirizzo e cantiere già inseriti. Nulla viene salvato senza la tua approvazione.",
    cta: "Apri Silvio AI",
  },
  bom: {
    title: "Silvio AI — assistente offerta",
    description: "Foto del rilievo, dettatura o testo: Silvio prepara le righe, tu approvi solo quelle corrette.",
    cta: "Crea con Silvio AI",
  },
};

export function AiSerramentiDraftLauncher({
  progettoId,
  detail,
  context = "bom",
  onInserted,
  onGoToComposition,
  autoOpen,
}: Props) {
  const [open, setOpen] = useState(false);
  const addMut = useAddSerramento(progettoId);
  const insertedCountRef = useRef(0);
  const copy = COPY[context];
  const isContactContext = context === "contact";

  useEffect(() => {
    if (open) insertedCountRef.current = 0;
  }, [open]);

  // Apertura automatica one-shot (flusso "Avvia con Silvio AI" dal primo step).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [autoOpen]);

  const handleApproveAiDraftItem = async (item: SrAiDraftItem) => {
    const qty = item.quantita || 1;
    const noteParts = [
      "Bozza AI approvata dal commerciale",
      item.note,
      item.warnings.length > 0 ? `Avvisi AI: ${item.warnings.join("; ")}` : null,
    ].filter(Boolean);

    const created = await addMut.mutateAsync({
      tipologia: item.tipologia || "voce_manuale",
      tipologia_label: item.tipologia_label || item.family_nome || "Serramento da AI",
      ambiente: item.ambiente,
      materiale: item.materiale as SrMaterialePrincipale | null,
      serie: item.serie,
      vetro: item.vetro,
      apertura: item.apertura,
      colore_interno: item.colore_interno,
      colore_esterno: item.colore_esterno,
      larghezza_mm: item.larghezza_mm,
      altezza_mm: item.altezza_mm,
      quantita: qty,
      metri_quadri: item.larghezza_mm && item.altezza_mm
        ? calcolaM2(item.larghezza_mm, item.altezza_mm, qty)
        : null,
      prezzo_unitario: item.prezzo_unitario,
      prezzo_totale: item.prezzo_totale,
      family_id: item.family_id,
      listino_voce_id: item.listino_voce_id,
      supplier_catalog_id: item.supplier_catalog_id,
      supplier_product_line_id: item.supplier_product_line_id,
      note: noteParts.join(" · ") || null,
      position: detail.serramenti.length + insertedCountRef.current,
    });

    insertedCountRef.current += 1;
    onInserted?.(created.id);
  };

  return (
    <>
      <div className={isContactContext
        ? "rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2"
        : "rounded-md border border-orange-200 bg-gradient-to-r from-orange-50 to-white p-3"
      }>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-950">
              <Sparkles className="h-4 w-4 text-orange-500" />
              {copy.title}
            </p>
            <p className="text-xs leading-relaxed text-slate-600">{copy.description}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> Foto rilievo</span>
              <span className="inline-flex items-center gap-1"><Mic className="h-3.5 w-3.5" /> Detta a voce</span>
              <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Testo</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {context === "contact" && onGoToComposition && detail.serramenti.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-slate-700 hover:bg-orange-50"
                onClick={onGoToComposition}
              >
                Vai alla composizione
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className={isContactContext
                ? "h-8 gap-1.5 border-slate-200 bg-white px-3 text-xs text-slate-700 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                : "gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
              }
              onClick={() => setOpen(true)}
              disabled={addMut.isPending}
            >
              <Sparkles className="h-4 w-4" />
              {copy.cta}
            </Button>
          </div>
        </div>
      </div>

      <AiSerramentiDraftDialog
        open={open}
        onOpenChange={setOpen}
        progettoId={progettoId}
        detail={detail}
        onApproveItem={handleApproveAiDraftItem}
        approving={addMut.isPending}
      />
    </>
  );
}
