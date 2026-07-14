/**
 * MetaTroubleshootDialog — "Risolvi problemi" per l'integrazione Meta
 * (stile GHL: elenco dei problemi tipici, ognuno con l'azione che lo risolve).
 *
 *  1. Autorizzazioni mancanti  → Ricollega con Facebook (ri-consenso permessi)
 *  2. Mancano alcune pagine    → Ricollega (il callback ripopola l'elenco pagine)
 *  3. Lead non sincronizzati   → backfill ultimi 15/30 giorni su tutti i moduli
 *     attivi (azione proxy "backfill-recent", idempotente: niente duplicati).
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, KeyRound, LayoutList, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useMetaIntegration } from "@/hooks/useMetaIntegration";
import type { Integration } from "@/types/integrations";

interface MetaTroubleshootDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: Integration | null;
  /** Apre il wizard Meta (per il ri-collegamento / aggiornare l'elenco pagine). */
  onReconnect: () => void;
}

export function MetaTroubleshootDialog({
  open,
  onOpenChange,
  integration,
  onReconnect,
}: MetaTroubleshootDialogProps) {
  const hook = useMetaIntegration(integration);
  const [days, setDays] = useState<"15" | "30">("15");
  const [syncing, setSyncing] = useState(false);

  const handleBackfill = async () => {
    setSyncing(true);
    try {
      const res = await hook.callProxy("backfill-recent", { days: Number(days) });
      const imported = Number(res?.imported ?? 0);
      const forms = Number(res?.forms ?? 0);
      if (forms === 0) {
        toast.info("Nessun modulo lead attivo: attiva prima i moduli dal wizard (Gestisci).");
      } else if (imported === 0) {
        toast.success(`Nessun lead nuovo negli ultimi ${days} giorni (${forms} moduli controllati).`);
      } else {
        toast.success(`${imported} lead recuperati da ${forms} moduli: li trovi tra i contatti a breve.`);
      }
    } catch (err) {
      toast.error(`Sincronizzazione non riuscita: ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleReconnect = () => {
    onOpenChange(false);
    onReconnect();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Risoluzione problemi Facebook e Instagram
          </DialogTitle>
          <DialogDescription>Qual è il problema che stai affrontando?</DialogDescription>
        </DialogHeader>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="permessi">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2 text-left">
                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                Alcune funzionalità non funzionano (autorizzazioni mancanti)
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Se lead, commenti o inserzioni danno errore, probabilmente il collegamento è
                stato fatto senza tutti i permessi (o Meta li ha revocati). Rifai il
                collegamento e concedi tutte le autorizzazioni richieste.
              </p>
              <Button size="sm" onClick={handleReconnect}>Ricollega con Facebook</Button>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pagine">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2 text-left">
                <LayoutList className="h-4 w-4 shrink-0 text-muted-foreground" />
                Mancano alcune pagine
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Se una pagina non compare nell'elenco, rifai il collegamento: l'elenco viene
                aggiornato con tutte le pagine a cui il tuo account Facebook ha accesso.
                Se manca ancora, verifica sul Business Manager di avere il ruolo sulla pagina.
              </p>
              <Button size="sm" onClick={handleReconnect}>Aggiorna elenco pagine</Button>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="lead">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2 text-left">
                <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />
                I lead non vengono sincronizzati automaticamente
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Recupera manualmente i lead ricevuti dai tuoi moduli negli ultimi giorni.
                I lead già presenti non vengono duplicati.
              </p>
              <div className="flex items-center gap-2">
                <Select value={days} onValueChange={(v) => setDays(v as "15" | "30")}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Periodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Ultimi 15 giorni</SelectItem>
                    <SelectItem value="30">Ultimi 30 giorni</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleBackfill} disabled={syncing || !integration}>
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sincronizza lead
                </Button>
              </div>
              {!integration && (
                <p className="text-xs text-muted-foreground">
                  Collega prima l'account Meta per usare questa funzione.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
