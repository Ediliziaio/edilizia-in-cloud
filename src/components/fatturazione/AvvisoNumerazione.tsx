/**
 * L'avviso sulla numerazione dentro il popup di «Emetti» (16/11/2026).
 *
 * Due toni, perché sono due cose diverse:
 *  - «prima fattura»: un invito a guardare il numero prima di emettere, non un errore;
 *  - «conflitto»: il numero che sta per uscire è già stato usato nell'archivio dell'azienda.
 *    Lì si dice il numero giusto e dove si imposta, perché dopo l'emissione il numero è bloccato
 *    e per correggerlo serve un intervento sul database.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, Info } from "lucide-react";
import { useAvvisoNumerazione } from "@/hooks/useAvvisoNumerazione";

// La pagina unica delle impostazioni di fatturazione (`?tab=nativa`), aperta sulla scheda
// «Numerazione» (`?sezione=numeratori`): l'indirizzo apre la scheda anche a pagina già aperta.
const IMPOSTAZIONI = "/azienda/impostazioni/fatturazione?tab=nativa&sezione=numeratori";

export function AvvisoNumerazione({
  companyId, tipo, anno,
}: { companyId: string | null | undefined; tipo: string; anno: number }) {
  const a = useAvvisoNumerazione(companyId, tipo, anno);
  if (a.tipo === "nessuno") return null;

  if (a.tipo === "conflitto") {
    return (
      <div role="alert" className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium">Il numero {a.prossimo} è già stato usato.</p>
          <p>
            Nell'archivio di questa azienda il {anno} arriva già alla <strong>{a.massimoArchivio}</strong>:
            la prossima dovrebbe essere la <strong>{a.suggerito}</strong>. Se emetti adesso, esce un numero doppio —
            e il numero di una fattura emessa non si cambia più da qui.
          </p>
          <p>
            Sistemalo in{" "}
            <Link to={IMPOSTAZIONI} className="font-medium underline underline-offset-2">
              Impostazioni → Fatturazione → Numeratori
            </Link>
            , scrivendo {a.suggerito} in «Prossimo numero».
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">È la prima fattura di questa azienda.</p>
        <p className="text-muted-foreground">
          {a.prossimo !== null
            ? <>Uscirà con il numero <strong className="text-foreground">{a.prossimo}</strong>. </>
            : null}
          Se l'azienda fatturava già con un altro gestionale, il numero va fatto ripartire da dove si era
          fermata: si imposta in{" "}
          <Link to={IMPOSTAZIONI} className="font-medium text-foreground underline underline-offset-2">
            Impostazioni → Fatturazione → Numeratori
          </Link>
          . Dopo l'emissione non si cambia più.
        </p>
      </div>
    </div>
  );
}
