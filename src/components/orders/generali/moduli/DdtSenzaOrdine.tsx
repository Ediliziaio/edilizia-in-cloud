import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";
import type { DocumentoConsegna, riconciliaDdtDiretto } from "@/lib/orders/generali/controlloForniture";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface ControlloDdtDiretto {
  bolla: DocumentoConsegna;
  controllo: ReturnType<typeof riconciliaDdtDiretto>;
}

export function DdtSenzaOrdine({
  righe,
  nomi,
  soloProblemi,
  onApriFattura,
}: {
  righe: ControlloDdtDiretto[];
  nomi: Map<string, string>;
  soloProblemi: boolean;
  onApriFattura: (id: string) => void;
}) {
  const tr = useT();
  if (!righe.length) return null;
  const visibili = soloProblemi ? righe.filter((r) => r.controllo.avvisi.length) : righe;
  return (
    <section aria-labelledby="ddt-senza-ordine" className="space-y-3">
      <h3 id="ddt-senza-ordine" className="font-semibold">
        {tr("DDT senza ordine d'acquisto")}
      </h3>
      <p className="text-sm text-muted-foreground">
        {tr("DDT → fattura → pagamento. L'ordine è facoltativo. Il valore della bolla descrive la merce; il costo contabile e il pagamento restano sulla fattura, senza sommare di nuovo il DDT. Per completare un collegamento apri la fattura e usa «Aggiungi un DDT».")}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" aria-label={tr("Riconciliazione DDT senza ordine")}>
          <thead className="bg-muted text-left">
            <tr>
              {[
                "Commessa / DDT",
                "Merce ricevuta",
                "Valore della bolla",
                "Fatture collegate",
                "Controlli",
              ].map((t) => (
                <th key={t} className="p-3">
                  {tr(t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibili.map(({ bolla, controllo: c }) => (
              <tr key={bolla.id}>
                <td className="p-3">
                  <span className="block text-xs text-muted-foreground">
                    {nomi.get(bolla.order_id ?? "") ?? tr("Commessa collegata")}
                  </span>
                  <Link to={`/azienda/ddt/${bolla.id}`} className="text-primary underline">
                    DDT {bolla.numero_ddt}
                  </Link>
                </td>
                <td className="p-3">
                  {c.righe.map((r) => (
                    <p key={r.id}>
                      {r.descrizione ?? tr("Materiale")} · {r.quantita ?? tr("Quantità da completare")}{" "}
                      {r.unita_misura ?? ""}
                    </p>
                  ))}
                </td>
                <td className="p-3 tabular-nums">
                  {c.valore === null ? tr("Da completare") : formatCurrency(c.valore)}
                </td>
                <td className="space-y-1 p-3">
                  {c.fatture.map((f) => (
                    <button
                      key={f.id}
                      className="block text-left text-primary underline"
                      onClick={() => onApriFattura(f.id)}
                    >
                      {tr("Fattura {numero}", { numero: f.numero_fattura })}
                    </button>
                  ))}
                  {!c.fatture.length && (
                    <span className="text-muted-foreground">{tr("Nessuna fattura collegata")}</span>
                  )}
                  {c.fatturato !== null && (
                    <p className="text-xs text-muted-foreground">
                      {tr("Fatturato netto {importo}", { importo: formatCurrency(c.fatturato) })}
                    </p>
                  )}
                </td>
                <td className="space-y-1 p-3">
                  {c.avvisi.map((a) => (
                    <p key={a} className="text-xs text-amber-800">
                      {a}
                    </p>
                  ))}
                  {c.fatturaCondivisa && (
                    <p className="text-xs text-muted-foreground">
                      {tr("Fattura su più DDT: importi non ripartiti tra le bolle.")}
                    </p>
                  )}
                  {c.bollaMista && (
                    <p className="text-xs text-muted-foreground">
                      {tr("La bolla comprende anche righe con ordine; confronto del totale escluso.")}
                    </p>
                  )}
                  {!c.avvisi.length && !c.fatturaCondivisa && !c.bollaMista && (
                    <span className="text-emerald-700">{tr("Importi coerenti")}</span>
                  )}
                </td>
              </tr>
            ))}
            {!visibili.length && (
              <tr>
                <td colSpan={5} className="p-4 text-muted-foreground">
                  {tr("Nessuna anomalia nei DDT senza ordine letti.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
