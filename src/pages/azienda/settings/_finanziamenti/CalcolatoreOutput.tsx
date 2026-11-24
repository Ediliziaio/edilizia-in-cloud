/**
 * Componente di output del calcolatore finanziamento.
 * Riusato sia nella pagina dettaglio tabella sia nella pagina calcolatore globale.
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TrendingUp,
} from "lucide-react";
import { differenzaTotaleVisibile } from "@/lib/finanziamenti/riconciliaTotale";
import type { RisultatoCalcolo } from "@/lib/finanziamenti/types";
import { formattaPercentuale } from "./comuni";
import { TitoloAvviso } from "./pezzi";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function CalcolatoreOutput({
  risultato,
}: {
  risultato: RisultatoCalcolo | null;
}) {
  const t = useT();
  if (!risultato) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <TitoloAvviso>{t("Inserisci importo e durata")}</TitoloAvviso>
        <AlertDescription>
          {t("Compila i due campi sopra per vedere il calcolo della rata e dei tassi.")}
        </AlertDescription>
      </Alert>
    );
  }

  if (risultato.modalita === "errore") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <TitoloAvviso>{risultato.messaggio}</TitoloAvviso>
        <AlertDescription>
          {risultato.errore === "durata_non_disponibile" &&
            risultato.durate_disponibili && (
              <p className="text-sm mt-1">
                {t("Durate disponibili in tabella:")}{" "}
                <strong>{t("{n} rate", { n: risultato.durate_disponibili.join(", ") })}</strong>
                .
              </p>
            )}
          {risultato.errore === "importo_fuori_range" && (
            <p className="text-sm mt-1">
              {t("Scegli un importo entro il range della tabella o carica una tabella con un range più ampio.")}
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const differenza = differenzaTotaleVisibile(risultato);
  return (
    <div className="space-y-4">
      {differenza !== null && <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <TitoloAvviso>{t("Verifica il totale con la tabella originale")}</TitoloAvviso>
        <AlertDescription>{t("Il totale riportato differisce di € {differenza} dalla somma delle rate e delle spese di istruttoria visibili. Potrebbero mancare componenti o esserci dati da correggere: verifica la fonte prima di usare questa simulazione. Gli importi della tabella non sono stati modificati.", { differenza: formatEur(differenza, 2) })}</AlertDescription>
      </Alert>}
      {/* Highlight: rata + totale */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Highlight
          label={t("Rata mensile (spese di incasso comprese)")}
          value={`€ ${formatEur(risultato.rata_completa ?? 0, 2)}`}
          accent
        />
        <Highlight
          label={t("Totale dovuto dal cliente")}
          value={`€ ${formatEur(risultato.importo_totale_dovuto ?? 0, 2)}`}
        />
        <Highlight
          label="TAEG"
          value={formattaPercentuale(risultato.taeg ?? 0)}
        />
      </div>

      {/* Modalità del calcolo */}
      <div className="flex items-center gap-2 text-xs">
        {risultato.modalita === "esatto" ? (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t("Importo presente in tabella")}
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
            <TrendingUp className="h-3 w-3 mr-1" />
            {t("Calcolato tra le righe di € {sotto} e € {sopra}", { sotto: formatEur(risultato.righe_interpolazione?.sotto.importo_erogato ?? 0), sopra: formatEur(risultato.righe_interpolazione?.sopra.importo_erogato ?? 0) })}
          </Badge>
        )}
        <span className="text-muted-foreground">{t("Importo richiesto: € {importo_richiesto} · {numero_rate} rate", { importo_richiesto: formatEur(risultato.importo_richiesto, 2), numero_rate: String(risultato.numero_rate ?? "") })}</span>
      </div>

      {/* Tabella dettagli */}
      <div className="rounded-md border bg-muted/20 divide-y">
        <DetailRow
          label={t("Importo finanziato")}
          value={`€ ${formatEur(risultato.importo_richiesto, 2)}`}
        />
        <DetailRow
          label={t("Importo della rata (senza spese di incasso)")}
          value={`€ ${formatEur(risultato.importo_rata ?? 0, 2)}`}
        />
        <DetailRow
          label={t("Spese di incasso della rata")}
          value={`€ ${formatEur(risultato.spese_incasso_rata ?? 0, 2)}`}
        />
        <DetailRow
          label={t("Spese di istruttoria (una sola volta)")}
          value={`€ ${formatEur(risultato.spese_istruttoria ?? 0, 2)}`}
        />
        <DetailRow
          label={t("Importo totale del credito")}
          value={`€ ${formatEur(risultato.importo_totale_credito ?? 0, 2)}`}
        />
        <DetailRow
          label={t("Costo totale del credito")}
          value={`€ ${formatEur(Math.max(0, (risultato.importo_totale_dovuto ?? 0) - risultato.importo_richiesto), 2)}`}
        />
        <DetailRow
          label={t("Interessi totali al cliente")}
          value={`€ ${formatEur(risultato.interessi_cliente ?? 0, 2)}`}
        />
        <DetailRow
          label="TAN"
          value={formattaPercentuale(risultato.tan ?? 0)}
        />
        <DetailRow
          label={t("ICC (Indicatore Costo Credito)")}
          value={
            risultato.icc != null
              ? formattaPercentuale(risultato.icc)
              : "—"
          }
        />
        <DetailRow
          label={t("Provvigione")}
          value={`€ ${formatEur(risultato.provvigione_dealer ?? 0, 2)}`}
          muted
        />
      </div>

      <p className="text-xs text-muted-foreground italic">{t("I dati provengono dalla tabella ufficiale della finanziaria. La rata finale al cliente è di € {valore} per {numero_rate} mesi (€ {valore2} di quota + € {valore3} di spese di incasso). Simulazione indicativa: prima di presentare l'offerta verifica documenti, validità condizioni e approvazione dell'istituto.", { valore: formatEur(risultato.rata_completa ?? 0, 2), numero_rate: String(risultato.numero_rate ?? ""), valore2: formatEur(risultato.importo_rata ?? 0, 2), valore3: formatEur(risultato.spese_incasso_rata ?? 0, 2) })}</p>
    </div>
  );
}

function Highlight({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border p-4 " +
        (accent ? "bg-primary/10 border-primary/20" : "bg-card")
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          "font-bold tabular-nums mt-1 " +
          (accent ? "text-2xl text-primary" : "text-xl")
        }
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between px-3 py-2 text-sm " +
        (muted ? "text-muted-foreground" : "")
      }
    >
      <span>{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatEur(n: number, frac = 0): string {
  return n.toLocaleString(intlCampo(), {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });
}
