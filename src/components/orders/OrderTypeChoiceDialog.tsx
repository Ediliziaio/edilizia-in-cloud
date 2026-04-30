/**
 * OrderTypeChoiceDialog — bivio iniziale "Nuova Commessa"
 * ──────────────────────────────────────────────────────
 * Quando il Modulo Appaltatori è attivo, intercettiamo il click su
 * "Nuova Commessa" e mostriamo due scelte:
 *
 *   1. Commessa cliente (default, comportamento esistente)
 *      → /azienda/ordini/nuovo
 *      Fornitura + posa per cliente finale o impresa committente
 *      "tradizionale".
 *
 *   2. Lavoro per appaltatore
 *      → /azienda/ordini/nuovo-lavoro-appaltatore
 *      Sola manodopera commissionata da un'impresa committente
 *      con campi dedicati (cantiere, descrizione, posizione materiali,
 *      date inizio/fine).
 *
 * Se la feature è disattivata, questo componente NON viene mai montato
 * (l'OrdersList porta direttamente al flusso esistente).
 */
import { Link } from "react-router-dom";
import { ArrowRight, ShoppingCart, HardHat } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface OrderTypeChoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderTypeChoiceDialog({ open, onOpenChange }: OrderTypeChoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Che tipo di commessa vuoi creare?</DialogTitle>
          <DialogDescription>
            Scegli il flusso più adatto al lavoro che stai gestendo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          {/* Commessa cliente standard — flusso esistente */}
          <Link
            to="/azienda/ordini/nuovo"
            onClick={() => onOpenChange(false)}
            className="group rounded-lg border border-border bg-card p-4 transition-all hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm leading-tight">
                  Commessa cliente
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Fornitura + posa per cliente finale (privato o azienda).
                  Comportamento standard.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          {/* Lavoro per appaltatore — sola manodopera */}
          <Link
            to="/azienda/ordini/nuovo-lavoro-appaltatore"
            onClick={() => onOpenChange(false)}
            className="group rounded-lg border border-border bg-card p-4 transition-all hover:border-amber-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <HardHat className="h-5 w-5 text-amber-600 dark:text-amber-500" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm leading-tight">
                  Lavoro per appaltatore
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Sola manodopera commissionata da un'impresa committente:
                  cantiere, descrizione, materiali e date.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-amber-600 group-hover:translate-x-0.5 transition" />
            </div>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
