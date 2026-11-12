import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";
import type { DocumentoConsegna, riconciliaDdtDiretto } from "@/lib/orders/generali/controlloForniture";

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
  if (!righe.length) return null;
  const visibili = soloProblemi ? righe.filter((r) => r.controllo.avvisi.length) : righe;
  return (
    <section aria-labelledby="ddt-senza-ordine" className="space-y-3">
      <h3 id="ddt-senza-ordine" className="font-semibold">
        DDT senza ordine d'acquisto
      </h3>
      <p className="text-sm text-muted-foreground">
        DDT → fattura → pagamento. L'ordine è facoltativo. Il valore della bolla descrive la merce; il costo
        contabile e il pagamento restano sulla fattura, senza sommare di nuovo il DDT. Per completare un
        collegamento apri la fattura e usa «Aggiungi un DDT».
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" aria-label="Riconciliazione DDT senza ordine">
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
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibili.map(({ bolla, controllo: c }) => (
              <tr key={bolla.id}>
                <td className="p-3">
                  <span className="block text-xs text-muted-foreground">
                    {nomi.get(bolla.order_id ?? "") ?? "Commessa collegata"}
                  </span>
                  <Link to={`/azienda/ddt/${bolla.id}`} className="text-primary underline">
                    DDT {bolla.numero_ddt}
                  </Link>
                </td>
                <td className="p-3">
                  {c.righe.map((r) => (
                    <p key={r.id}>
                      {r.descrizione ?? "Materiale"} · {r.quantita ?? "Quantità da completare"}{" "}
                      {r.unita_misura ?? ""}
                    </p>
                  ))}
                </td>
                <td className="p-3 tabular-nums">
                  {c.valore === null ? "Da completare" : formatCurrency(c.valore)}
                </td>
                <td className="space-y-1 p-3">
                  {c.fatture.map((f) => (
                    <button
                      key={f.id}
                      className="block text-left text-primary underline"
                      onClick={() => onApriFattura(f.id)}
                    >
                      Fattura {f.numero_fattura}
                    </button>
                  ))}
                  {!c.fatture.length && (
                    <span className="text-muted-foreground">Nessuna fattura collegata</span>
                  )}
                  {c.fatturato !== null && (
                    <p className="text-xs text-muted-foreground">
                      Fatturato netto {formatCurrency(c.fatturato)}
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
                      Fattura su più DDT: importi non ripartiti tra le bolle.
                    </p>
                  )}
                  {c.bollaMista && (
                    <p className="text-xs text-muted-foreground">
                      La bolla comprende anche righe con ordine; confronto del totale escluso.
                    </p>
                  )}
                  {!c.avvisi.length && !c.fatturaCondivisa && !c.bollaMista && (
                    <span className="text-emerald-700">Importi coerenti</span>
                  )}
                </td>
              </tr>
            ))}
            {!visibili.length && (
              <tr>
                <td colSpan={5} className="p-4 text-muted-foreground">
                  Nessuna anomalia nei DDT senza ordine letti.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
