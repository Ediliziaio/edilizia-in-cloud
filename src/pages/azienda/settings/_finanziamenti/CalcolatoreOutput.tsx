/**
 * Componente di output del calcolatore finanziamento.
 * Riusato sia nella pagina dettaglio tabella sia nella pagina calcolatore globale.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TrendingUp,
} from "lucide-react";
import type { RisultatoCalcolo } from "@/lib/finanziamenti/types";

export function CalcolatoreOutput({
  risultato,
}: {
  risultato: RisultatoCalcolo | null;
}) {
  if (!risultato) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Inserisci importo e durata</AlertTitle>
        <AlertDescription>
          Compila i due campi sopra per vedere il calcolo della rata e dei
          tassi.
        </AlertDescription>
      </Alert>
    );
  }

  if (risultato.modalita === "errore") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{risultato.messaggio}</AlertTitle>
        <AlertDescription>
          {risultato.errore === "durata_non_disponibile" &&
            risultato.durate_disponibili && (
              <p className="text-sm mt-1">
                Durate disponibili in tabella:{" "}
                <strong>
                  {risultato.durate_disponibili.join(", ")} rate
                </strong>
                .
              </p>
            )}
          {risultato.errore === "importo_fuori_range" && (
            <p className="text-sm mt-1">
              Scegli un importo entro il range della tabella o carica una
              tabella con un range più ampio.
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Highlight: rata + totale */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Highlight
          label="Rata mensile (con incasso)"
          value={`€ ${formatEur(risultato.rata_completa ?? 0, 2)}`}
          accent
        />
        <Highlight
          label="Totale dovuto dal cliente"
          value={`€ ${formatEur(risultato.importo_totale_dovuto ?? 0, 2)}`}
        />
        <Highlight
          label="TAEG"
          value={`${(risultato.taeg ?? 0).toFixed(2)} %`}
        />
      </div>

      {/* Modalità del calcolo */}
      <div className="flex items-center gap-2 text-xs">
        {risultato.modalita === "esatto" ? (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Lookup esatto
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
            <TrendingUp className="h-3 w-3 mr-1" />
            Interpolato tra €{" "}
            {formatEur(risultato.righe_interpolazione?.sotto.importo_erogato ?? 0)}
            {" e € "}
            {formatEur(risultato.righe_interpolazione?.sopra.importo_erogato ?? 0)}
          </Badge>
        )}
        <span className="text-muted-foreground">
          Importo richiesto: € {formatEur(risultato.importo_richiesto, 2)} ·{" "}
          {risultato.numero_rate} rate
        </span>
      </div>

      {/* Tabella dettagli */}
      <div className="rounded-md border bg-muted/20 divide-y">
        <DetailRow
          label="Importo finanziato"
          value={`€ ${formatEur(risultato.importo_richiesto, 2)}`}
        />
        <DetailRow
          label="Importo rata (esclusi spese incasso)"
          value={`€ ${formatEur(risultato.importo_rata ?? 0, 2)}`}
        />
        <DetailRow
          label="Spese incasso rata"
          value={`€ ${formatEur(risultato.spese_incasso_rata ?? 0, 2)}`}
        />
        <DetailRow
          label="Spese istruttoria una tantum"
          value={`€ ${formatEur(risultato.spese_istruttoria ?? 0, 2)}`}
        />
        <DetailRow
          label="Importo totale del credito"
          value={`€ ${formatEur(risultato.importo_totale_credito ?? 0, 2)}`}
        />
        <DetailRow
          label="Costo totale credito"
          value={`€ ${formatEur(Math.max(0, (risultato.importo_totale_dovuto ?? 0) - risultato.importo_richiesto), 2)}`}
        />
        <DetailRow
          label="Interessi totali al cliente"
          value={`€ ${formatEur(risultato.interessi_cliente ?? 0, 2)}`}
        />
        <DetailRow
          label="TAN"
          value={`${(risultato.tan ?? 0).toFixed(2)} %`}
        />
        <DetailRow
          label="ICC (Indicatore Costo Credito)"
          value={
            risultato.icc != null
              ? `${risultato.icc.toFixed(2)} %`
              : "—"
          }
        />
        <DetailRow
          label="Provvigione dealer"
          value={`€ ${formatEur(risultato.provvigione_dealer ?? 0, 2)}`}
          muted
        />
      </div>

      <p className="text-xs text-muted-foreground italic">
        I dati provengono dalla tabella ufficiale della finanziaria. La rata
        finale al cliente è di € {formatEur(risultato.rata_completa ?? 0, 2)}{" "}
        per {risultato.numero_rate} mesi (€{" "}
        {formatEur(risultato.importo_rata ?? 0, 2)} di quota +{" € "}
        {formatEur(risultato.spese_incasso_rata ?? 0, 2)} di spese incasso).
        Simulazione indicativa: prima di presentare l&apos;offerta verifica
        documenti, validità condizioni e approvazione dell&apos;istituto.
      </p>
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
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });
}
