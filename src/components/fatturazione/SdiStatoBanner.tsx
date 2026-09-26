import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Clock, FileDown, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import { faseSdi, motivoSdi, puoInviare, type DocFaseSdi, type StatoSdiVisibile } from "@/lib/fatturazione/sdiCassetto";

// Il riquadro della fattura verso lo SDI, in editor e dettaglio (24/09/2026):
// dice in che fase è, cosa vuol dire e cosa fare adesso. Le tre fasi normali
// sono «Da inviare SDI» → «In elaborazione» → «Inviata».

interface Props {
  doc: DocFaseSdi & { numero?: string | null; sdi_errori?: unknown; sdi_data_consegna?: string | null };
  /** «Fattura», «Nota di credito»… per la conferma. */
  tipoLabel: string;
  onInvia?: () => void;
  isInvio?: boolean;
  onAggiorna?: () => void;
  isAggiorna?: boolean;
  onScaricaXml?: () => void;
  /** barra = a tutta larghezza sotto la testata dell'editor; riquadro = nel dettaglio. */
  variante?: "barra" | "riquadro";
}

const STILI: Record<StatoSdiVisibile["tono"], string> = {
  attesa: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200",
  lavoro: "bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/30 dark:border-sky-900 dark:text-sky-200",
  ok: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200",
  errore: "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/30 dark:border-red-900 dark:text-red-200",
};

const TITOLI: Record<StatoSdiVisibile["fase"], string> = {
  da_inviare: "Da inviare allo SDI",
  invio_in_corso: "Invio in corso…",
  in_elaborazione: "In elaborazione allo SDI",
  inviata: "Inviata allo SDI",
  accettata: "Accettata",
  scartata: "Scartata dallo SDI",
  rifiutata_ente: "Rifiutata dall'ente",
  manuale: "XML da caricare a mano",
};

function quando(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

export function SdiStatoBanner({
  doc, tipoLabel, onInvia, isInvio, onAggiorna, isAggiorna, onScaricaXml, variante = "barra",
}: Props) {
  const f = faseSdi(doc);
  if (!f) return null;

  const inviabile = puoInviare(doc) && !!onInvia;
  const scartata = f.fase === "scartata";
  const motivo = scartata ? motivoSdi(doc.sdi_errori) : null;
  // Un invio fallito prima di arrivare allo SDI (dati mancanti, canale non
  // attivo): il motivo resta sulla fattura finché non riparte.
  const erroreInvio = f.fase === "da_inviare" ? motivoSdi(doc.sdi_errori) : null;
  const consegna = f.fase === "inviata" || f.fase === "accettata" ? quando(doc.sdi_data_consegna) : null;

  const Icona =
    f.tono === "ok" ? CheckCircle2 : f.tono === "errore" ? XCircle : f.fase === "invio_in_corso" ? Loader2 : f.tono === "lavoro" ? Clock : Send;

  return (
    <div
      className={cn(
        // Mobile: titolo e bottone sulla stessa riga, senza la spiegazione.
        "border flex flex-col sm:flex-row sm:items-center gap-3 max-sm:flex-row max-sm:items-center max-sm:gap-2",
        variante === "barra" ? "border-x-0 border-t-0 px-4 sm:px-6 py-3 max-sm:px-3 max-sm:py-2" : "rounded-lg p-4 max-sm:p-2.5",
        STILI[f.tono],
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <Icona className={cn("h-4 w-4 mt-0.5 shrink-0", f.fase === "invio_in_corso" && "animate-spin")} />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">{TITOLI[f.fase]}</p>
          {motivo && <p className="text-sm">Motivo: {motivo}</p>}
          {erroreInvio && <p className="text-sm">Ultimo tentativo non riuscito: {erroreInvio}</p>}
          <p className="text-xs opacity-80 max-sm:hidden">
            {f.spiegazione}
            {consegna && ` Esito arrivato il ${consegna}.`}
            {scartata && " I campi qui sotto sono di nuovo modificabili, tranne numero e data."}
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap shrink-0">
        {onScaricaXml && (f.fase === "da_inviare" || f.fase === "manuale" || f.fase === "inviata" || f.fase === "accettata") && (
          <Button variant="outline" size="sm" className="h-8 text-xs bg-background max-sm:hidden" onClick={onScaricaXml}>
            <FileDown className="h-3.5 w-3.5 mr-1" /> Scarica XML
          </Button>
        )}

        {f.fase === "in_elaborazione" && onAggiorna && (
          <Button variant="outline" size="sm" className="tap-compact h-8 text-xs bg-background" onClick={onAggiorna} disabled={isAggiorna}>
            {isAggiorna ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Aggiorna stato
          </Button>
        )}

        {inviabile && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="tap-compact h-8 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={isInvio}>
                {isInvio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {scartata ? "Rimanda allo SDI" : "Invia allo SDI"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{scartata ? "Rimandare la fattura corretta?" : "Inviare la fattura allo SDI?"}</AlertDialogTitle>
                <AlertDialogDescription>
                  {scartata
                    ? `${tipoLabel} n. ${doc.numero ?? ""} riparte con lo stesso numero e la stessa data, con i dati come sono adesso. Controlla di aver corretto il motivo dello scarto.`
                    : `${tipoLabel} n. ${doc.numero ?? ""} parte verso il Sistema di Interscambio. Dopo l'invio non si modifica più: se lo SDI la scarta, potrai correggerla e rimandarla.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={onInvia} className="bg-blue-600 hover:bg-blue-700">
                  {scartata ? "Rimanda" : "Invia"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
