/**
 * Prima di installare un modello di listino (06/10/2026): cosa succederebbe alle maggiorazioni che l'azienda ha già,
 * e se lo stesso modello è appena stato aggiunto. Lo usano le tre finestre che installano — «Aggiungi un'area»,
 * «Modelli di infissi» e l'installazione dal super admin — così dicono tutte la stessa cosa.
 *
 * Il caso da cui nasce: Renova Solution, 05/10. Il modello arriva con ogni variante a «nessuna maggiorazione», perché
 * è la fotografia di un'altra azienda; i prodotti di Renova avevano maggiorazioni % su colore, vetro, telaio, e i
 * prodotti nuovi le hanno perse in silenzio. Qui l'azienda lo vede prima e sceglie.
 */
import { useId } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { haMaggiorazioniDaCopiare, testoMaggiorazioni, type AnteprimaInstallazione } from "@/lib/listino/modelliArea";

interface Props {
  anteprima: AnteprimaInstallazione | undefined;
  caricamento: boolean;
  /** La scelta di chi installa: copiare le maggiorazioni che ha già sui prodotti nuovi. */
  copia: boolean;
  onCopia: (copia: boolean) => void;
  disabilitato?: boolean;
}

const ora = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

export function AvvisoInstallazioneModello({ anteprima, caricamento, copia, onCopia, disabilitato }: Props) {
  const id = useId();

  if (caricamento) {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Controllo cosa hai già nel listino…
      </p>
    );
  }
  if (!anteprima) return null;

  const racconto = haMaggiorazioniDaCopiare(anteprima) ? testoMaggiorazioni(anteprima) : null;

  return (
    <div className="space-y-2">
      {anteprima.installazione_recente && (
        <p
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Questo modello è stato aggiunto alle {ora(anteprima.installazione_recente)}. Aspetta un minuto prima di
          aggiungerlo di nuovo.
        </p>
      )}

      {racconto && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {racconto.titolo}. {racconto.dettaglio}
            </span>
          </p>
          <div className="flex items-start gap-2">
            <Checkbox
              id={id}
              className="mt-0.5"
              checked={copia}
              disabled={disabilitato}
              onCheckedChange={(v) => onCopia(v === true)}
            />
            <label htmlFor={id} className="text-sm leading-snug text-foreground">
              Copia le mie maggiorazioni sui prodotti nuovi
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{racconto.sePiuttosto}</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
