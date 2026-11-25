/**
 * «Scrivi rapportini» dalla scheda Commesse → Rapportini (25/11/2026, richiesta di Florin).
 *
 * Dentro la commessa il bottone c'era già (RapportiniUfficio); dall'elenco di tutti i rapportini no,
 * e per scriverne uno bisognava aprire la commessa. Qui si sceglie prima la commessa, poi si apre la
 * stessa finestra della commessa: il rapportino finisce lì, entra da approvare e compare nell'elenco
 * (RapportiniUfficio invalida le liste dei rapportini al salvataggio).
 */
import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import { RapportiniUfficio } from "@/components/orders/RapportiniUfficio";
import { BOTTONE_NUOVO } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ScriviRapportiniScegliCommessa({ className }: { className?: string }) {
  const t = useT();
  const [scelta, setScelta] = useState(false);
  const [commessa, setCommessa] = useState<string | null>(null);
  const [scrivi, setScrivi] = useState(false);

  const apri = () => { setCommessa(null); setScelta(true); };
  const continua = () => {
    if (!commessa) return;
    setScelta(false);
    setScrivi(true);
  };

  return (
    <>
      <Button size="sm" className={cn(BOTTONE_NUOVO, className)} onClick={apri}>
        <NotebookPen className="h-3.5 w-3.5" />{t("Scrivi rapportini")}
      </Button>
      <Dialog open={scelta} onOpenChange={setScelta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Scrivi rapportini")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{t("Commessa")}</Label>
            <CommessaCombobox value={commessa} onChange={setCommessa} nessunaLabel={t("Scegli la commessa")} ariaLabel={t("Scegli la commessa")} className="w-full" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScelta(false)}>{t("Annulla")}</Button>
            <Button disabled={!commessa} onClick={continua}>{t("Continua")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* La finestra della commessa, col suo bottone nascosto: si apre da qui. */}
      {commessa && (
        <RapportiniUfficio
          key={commessa}
          orderId={commessa}
          className="hidden"
          aperta={scrivi}
          onApertaChange={(v) => { setScrivi(v); if (!v) setCommessa(null); }}
        />
      )}
    </>
  );
}
