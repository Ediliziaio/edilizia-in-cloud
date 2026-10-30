/**
 * OrderTypeChoiceDialog — bivio iniziale "Nuova Commessa"
 * ──────────────────────────────────────────────────────
 * Quando c'è più di un tipo di commessa possibile, intercettiamo il click su
 * "Nuova Commessa" e mostriamo le scelte:
 *
 *   1. Commessa cliente (default, comportamento esistente)
 *      → /azienda/ordini/nuovo
 *
 *   2. Lavoro per appaltatore — solo col Modulo Appaltatori
 *      → /azienda/ordini/nuovo-lavoro-appaltatore
 *      Sola manodopera commissionata da un'impresa committente.
 *
 *   3. Commessa generale — una scheda per ogni modello acceso in
 *      Impostazioni → Commesse generali (appalto, sviluppo, compravendita).
 *      Apre la finestra di creazione della generale (`onScegliGenerale`).
 *
 *   4. Valuta un'operazione — con sviluppo o compravendita accesi e il permesso
 *      di vedere i margini: il simulatore prima dell'acquisto
 *      → /azienda/ordini/simulatore
 *
 * Se non c'è niente da scegliere, questo componente NON viene mai montato
 * (l'OrdersList porta direttamente al flusso esistente).
 */
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Calculator, HardHat, Layers, ShoppingCart, type LucideIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { usePermissions } from "@/hooks/usePermissions";

interface OrderTypeChoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modulo Appaltatori attivo: mostra «Lavoro per appaltatore». */
  appaltatore?: boolean;
  /** Modelli di commessa generale accesi dall'azienda. */
  modelliGenerali?: ModelloGenerale[];
  onScegliGenerale?: (modello: ModelloGenerale) => void;
}

const ICONE_GENERALE: Record<ModelloGenerale, LucideIcon> = { appalto: Layers, sviluppo: Building2, compravendita: Building2 };

const SCHEDA = "group rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Scheda({ icona: Icona, titolo, testo, tono = "primary" }: { icona: LucideIcon; titolo: string; testo: string; tono?: "primary" | "amber" }) {
  return (
    <div className="flex items-start gap-3">
      <div className={tono === "amber" ? "h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0" : "h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"}>
        <Icona className={tono === "amber" ? "h-5 w-5 text-amber-600 dark:text-amber-500" : "h-5 w-5 text-primary"} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-sm leading-tight">{titolo}</h3>
        <p className="text-xs text-muted-foreground mt-1">{testo}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary group-hover:translate-x-0.5 transition" />
    </div>
  );
}

export function OrderTypeChoiceDialog({ open, onOpenChange, appaltatore = false, modelliGenerali = [], onScegliGenerale }: OrderTypeChoiceDialogProps) {
  const permissions = usePermissions();
  const simulatore = (permissions.isAdmin || permissions.canViewMargins)
    && modelliGenerali.some((m) => m === "sviluppo" || m === "compravendita");
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
          <Link to="/azienda/ordini/nuovo" onClick={() => onOpenChange(false)} className={SCHEDA}>
            <Scheda icona={ShoppingCart} titolo="Commessa cliente" testo="Un lavoro per un cliente (privato o azienda). Comportamento standard." />
          </Link>

          {/* Lavoro per appaltatore — sola manodopera */}
          {appaltatore && (
            <Link to="/azienda/ordini/nuovo-lavoro-appaltatore" onClick={() => onOpenChange(false)} className={`${SCHEDA} hover:border-amber-500`}>
              <Scheda
                icona={HardHat}
                tono="amber"
                titolo="Lavoro per appaltatore"
                testo="Sola manodopera commissionata da un'impresa committente: cantiere, descrizione, materiali e date."
              />
            </Link>
          )}

          {/* Commesse generali — una per modello acceso */}
          {modelliGenerali.map((m) => (
            <button
              key={m}
              type="button"
              className={SCHEDA}
              onClick={() => { onOpenChange(false); onScegliGenerale?.(m); }}
            >
              <Scheda icona={ICONE_GENERALE[m]} titolo={`Commessa generale · ${DEFINIZIONI_MODELLI[m].nome}`} testo={DEFINIZIONI_MODELLI[m].perChi} />
            </button>
          ))}

          {/* Prima di comprare: il simulatore, senza creare ancora la commessa */}
          {simulatore && (
            <Link to="/azienda/ordini/simulatore" onClick={() => onOpenChange(false)} className={SCHEDA}>
              <Scheda icona={Calculator} titolo="Valuta un'operazione" testo="Prima di comprare: acquisto, costi, prezzi, tempi e mutuo. Vedi subito se conviene, poi la trasformi in commessa." />
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
