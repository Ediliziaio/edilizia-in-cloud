/**
 * AiTemplateGenerator — componente condiviso che incapsula l'INTERO flusso
 * "Genera testi con AI": bottone + dialog con le 6 domande (profilo vendita) +
 * chiamata alla edge function di settore + anteprima pre-apply.
 *
 * L'editor che lo usa passa solo: la function di settore, il companyId, e una
 * callback onApply(draft) che mappa i 13 campi generici sui propri campi.
 * Usato da Fotovoltaico e Serramenti (che non avevano scaffolding).
 */
import * as React from "react";
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  useCompanySalesProfile, EMPTY_SALES_PROFILE, type CompanySalesProfile,
} from "@/hooks/useCompanySalesProfile";
import { AiSalesProfileForm } from "@/components/preventivi/AiSalesProfileForm";
import { AiTemplateReviewDialog, type AiTemplateDraft } from "@/components/preventivi/AiTemplateReviewDialog";

interface Props {
  /** Nome edge function di settore, es. "ai-genera-template-fotovoltaico". */
  settoreFn: string;
  /** Mappa il draft generato (13 campi generici) sui campi del template del modulo. */
  onApply: (draft: AiTemplateDraft) => void;
  className?: string;
}

export function AiTemplateGenerator({ settoreFn, onApply, className }: Props) {
  const companyId = useEffectiveCompanyId();
  const { profile: salesProfile, save: saveSalesProfile } = useCompanySalesProfile();
  const [intake, setIntake] = useState<CompanySalesProfile>(EMPTY_SALES_PROFILE);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiTemplateDraft | null>(null);
  // Sincronizza dal profilo solo a dialog chiuso → non sovrascrive le risposte in corso.
  useEffect(() => { if (!aiOpen) setIntake(salesProfile); }, [salesProfile, aiOpen]);

  const handleGenerate = async () => {
    if (aiLoading) return;
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    setAiLoading(true);
    try {
      const descrizione = [
        intake.attivita.trim() && `Cosa fa / da quanto / zona: ${intake.attivita.trim()}`,
        intake.problema.trim() && `Problema tipico del cliente: ${intake.problema.trim()}`,
        intake.usp.trim() && `Cosa lo differenzia (USP): ${intake.usp.trim()}`,
        intake.prove.trim() && `Fatti veri (numeri, garanzie, certificazioni): ${intake.prove.trim()}`,
        intake.offerta.trim() && `Incluso e condizioni: ${intake.offerta.trim()}`,
        intake.obiezioni.trim() && `Domande frequenti del cliente: ${intake.obiezioni.trim()}`,
        intake.vietati.trim() && `Da NON dire mai: ${intake.vietati.trim()}`,
      ].filter(Boolean).join("\n");
      void saveSalesProfile(intake).catch(() => undefined);
      const { data, error } = await supabase.functions.invoke(settoreFn, {
        body: {
          company_id: companyId,
          descrizione: descrizione || undefined,
          cliente_tipo: intake.cliente_tipo,
          tono: intake.voce.trim() || undefined,
        },
      });
      if (error) throw error;
      const payload = data as { success?: boolean; error?: string; generated?: AiTemplateDraft };
      if (!payload?.success || !payload.generated) {
        throw new Error(payload?.error ?? "Generazione non riuscita");
      }
      setAiDraft(payload.generated);
      setAiOpen(false);
      setReviewOpen(true);
    } catch (e) {
      toast.error("Generazione non riuscita", {
        description: e instanceof Error ? e.message : "Riprova tra poco.",
      });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setAiOpen(true)}
        className={className ?? "gap-1.5 bg-orange-500 hover:bg-orange-600"}
      >
        <Sparkles className="h-4 w-4" />
        Genera testi con AI
      </Button>

      <Dialog open={aiOpen} onOpenChange={(o) => !aiLoading && setAiOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              Genera testi con AI
            </DialogTitle>
            <DialogDescription>
              Rispondi a poche domande sulla tua impresa: l&apos;AI scrive la bozza dei testi.
              Le risposte si salvano nel profilo vendita e si riusano in ogni modulo.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <AiSalesProfileForm value={intake} onChange={setIntake} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAiOpen(false)} disabled={aiLoading}>
              Annulla
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={aiLoading}
              className="gap-1.5 bg-orange-500 hover:bg-orange-600"
            >
              {aiLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Generazione…</>
              ) : (
                <><Wand2 className="h-4 w-4" />Genera bozza</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AiTemplateReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        draft={aiDraft}
        onApply={(d) => {
          onApply(d);
          setReviewOpen(false);
          toast.success("Testi applicati al template", { description: "Rivedi le sezioni e salva." });
        }}
      />
    </>
  );
}

export default AiTemplateGenerator;
