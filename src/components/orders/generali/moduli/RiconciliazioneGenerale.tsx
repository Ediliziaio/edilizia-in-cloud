import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useCollegaRigaFornitura,
  useControlloFornitureGenerale,
} from "@/hooks/useControlloFornitureGenerale";
import {
  riconciliaDdtDiretto,
  riconciliaRiga,
  valoreRigaFattura,
} from "@/lib/orders/generali/controlloForniture";
import { DdtSenzaOrdine } from "./DdtSenzaOrdine";
import { totaliQuadro } from "@/lib/orders/quadroPagamenti";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { formatCurrency } from "@/lib/formatters";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";
import { RiepilogoFatturaRicevuta } from "@/components/fatturazione/RiepilogoFatturaRicevuta";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

const euro = (n: number | null) => (n === null ? "Da completare" : formatCurrency(n));
export function RiconciliazioneGenerale({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const q = useControlloFornitureGenerale(riepilogo);
  const collega = useCollegaRigaFornitura(riepilogo.generale.id);
  const p = usePermissions();
  const [soloProblemi, setSoloProblemi] = useState(false);
  const [costo, setCosto] = useState<string | null>(null);
  const [fatturaAperta, setFatturaAperta] = useState<string | null>(null);
  const companyId = useEffectiveCompanyId();
  if (q.isError)
    return (
      <p role="alert">
        Non riesco a leggere tutti i documenti.{" "}
        <Button variant="link" onClick={() => void q.refetch()}>
          Riprova
        </Button>
      </p>
    );
  if (!q.data) return <Skeleton className="h-64 w-full" />;
  const d = q.data;
  const nomi = new Map([
    [riepilogo.generale.id, "Generale"],
    ...riepilogo.figlie.map((f) => [f.id, f.codice ?? f.nome] as [string, string]),
  ]);
  const righe = d.righe.map((r) => ({ r, c: riconciliaRiga(r, d.consegne, d.fatture) }));
  const visibili = soloProblemi ? righe.filter((x) => x.c.avvisi.length > 0) : righe;
  const pagamenti = d.quadri.map((x) => ({ ...x, totali: totaliQuadro(x.quadro) }));
  const diretti = d.bolle
    .filter((b) => !b.purchase_order_id)
    .map((bolla) => ({
      bolla,
      controllo: riconciliaDdtDiretto(bolla, d.consegne, d.fatture, d.legamiDdt),
    }));
  const nonAbbinate = d.consegne.filter(
    (c) =>
      !c.purchase_order_item_id && d.bolle.some((b) => b.id === c.ddt_ricezione_id && b.purchase_order_id),
  ).length;
  const problemi =
    righe.filter((x) => x.c.avvisi.length).length + diretti.filter((x) => x.controllo.avvisi.length).length;
  return (
    <section className="space-y-4" aria-labelledby="controllo-forniture">
      <div>
        <h2 id="controllo-forniture" className="text-lg font-semibold">
          Forniture: DDT, fatture e pagamenti
        </h2>
        <p className="text-sm text-muted-foreground">
          Tutta l'operazione: generale e unità collegate, con o senza ordine d'acquisto. Ogni passaggio resta
          un documento distinto; questi importi non si sommano per ottenere il costo.
        </p>
      </div>
      <h3 className="font-semibold">Forniture con ordine d'acquisto</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Impegnato nelle righe d'ordine", "impegnato"],
            ["Ricevuto valorizzato al prezzo d'ordine", "maturato"],
            ["Fatturato sulle righe abbinate", "fatturato"],
          ] as const
        ).map(([titolo, campo]) => (
          <div key={campo} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{titolo}</p>
            <p className="text-xl font-semibold">
              {euro(
                righe.some((x) => x.c[campo] === null)
                  ? null
                  : righe.reduce((s, x) => s + (x.c[campo] ?? 0), 0),
              )}
            </p>
            <p className="text-xs text-muted-foreground">IVA esclusa · solo forniture</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Il budget e il costo complessivo sono nel Piano economico. Il ricevuto valorizzato è una stima al
        prezzo d'ordine; la fattura può rettificarla. I pagamenti sotto sono IVA inclusa e comprendono tutte
        le uscite.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={soloProblemi} onChange={(e) => setSoloProblemi(e.target.checked)} />
        Solo righe da controllare ({problemi})
      </label>
      {nonAbbinate > 0 && (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
          {nonAbbinate} righe di DDT non sono abbinate a una riga d'ordine. Apri la bolla per completare il
          collegamento; non sono considerate consegne a valore zero.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {[
                "Commessa / ordine / materiale",
                "Ordinato",
                "Ricevuto",
                "Fatturato netto",
                "Documenti e controlli",
              ].map((s) => (
                <th key={s} className="p-3">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibili.map(({ r, c }) => {
              const o = d.ordini.find((o) => o.id === r.purchase_order_id);
              return (
                <tr key={r.id}>
                  <td className="p-3">
                    <span className="block text-xs text-muted-foreground">{nomi.get(o?.order_id ?? "")}</span>
                    <Link
                      className="text-primary underline"
                      to={`/azienda/ordini-acquisto/${r.purchase_order_id}`}
                    >
                      {o?.oda_number ?? "Ordine"}
                    </Link>
                    <p>{r.description}</p>
                  </td>
                  <td className="p-3 tabular-nums">{c.ordinata}</td>
                  <td className="p-3 tabular-nums">{c.ricevuta}</td>
                  <td className="p-3 tabular-nums">{euro(c.fatturato)}</td>
                  <td className="space-y-1 p-3">
                    {c.bolle.map((id) => (
                      <Link
                        key={id}
                        className="mr-2 inline-block text-primary underline"
                        to={`/azienda/ddt/${id}`}
                      >
                        DDT {d.bolle.find((b) => b.id === id)?.numero_ddt}
                      </Link>
                    ))}
                    {c.fatture.map((id) => (
                      <button
                        key={id}
                        className="mr-2 inline-block text-primary underline"
                        onClick={() => setFatturaAperta(id)}
                      >
                        Fattura {d.fatture.find((f) => f.id === id)?.numero_fattura}
                      </button>
                    ))}
                    {c.avvisi.map((a) => (
                      <p key={a} className="text-xs text-amber-800">
                        {a}
                      </p>
                    ))}
                  </td>
                </tr>
              );
            })}
            {!visibili.length && (
              <tr>
                <td colSpan={5} className="p-4 text-muted-foreground">
                  {soloProblemi
                    ? "Nessuna anomalia nelle righe lette."
                    : "Nessuna riga d'ordine collegata. Puoi registrare una fornitura direttamente sulla generale."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DdtSenzaOrdine
        righe={diretti}
        nomi={nomi}
        soloProblemi={soloProblemi}
        onApriFattura={setFatturaAperta}
      />
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Collega le righe delle fatture agli ordini ({d.fattureConOrdine.length}{" "}
          {d.fattureConOrdine.length === 1 ? "documento" : "documenti"})
        </summary>
        <p className="my-3 text-xs text-muted-foreground">
          L'abbinamento è esplicito: descrizioni simili non spostano automaticamente i costi. Il pagamento
          resta sul documento, senza ripartizioni per riga inventate.
        </p>
        {d.fattureConOrdine.map((f) => (
          <div key={f.id} className="mb-4 space-y-2 border-t pt-3">
            <button className="font-medium text-primary underline" onClick={() => setFatturaAperta(f.id)}>
              Fattura {f.numero_fattura}
            </button>
            {(Array.isArray(f.righe) ? f.righe : []).map((r, i) => (
              <label key={i} className="grid items-center gap-2 text-sm sm:grid-cols-2">
                <span>
                  {r.descrizione || `Riga ${i + 1}`} · {euro(valoreRigaFattura(r))}
                </span>
                <select
                  aria-label={`Riga ordine per fattura ${f.numero_fattura} riga ${i + 1}`}
                  className="h-10 rounded border bg-background px-2"
                  disabled={!(p.canEditOrders && p.canViewBilling) || collega.isPending}
                  value={r.purchase_order_item_id ?? ""}
                  onChange={(e) =>
                    collega.mutate(
                      { fattura: f, indice: i, rigaId: e.target.value || null },
                      { onError: (e) => toast.error(e.message) },
                    )
                  }
                >
                  <option value="">Da abbinare</option>
                  {d.righe
                    .filter(
                      (x) =>
                        (!f.purchase_order_id || x.purchase_order_id === f.purchase_order_id) &&
                        (!f.fornitore_id ||
                          d.ordini.find((o) => o.id === x.purchase_order_id)?.supplier_id === f.fornitore_id),
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {d.ordini.find((o) => o.id === x.purchase_order_id)?.oda_number} · {x.description}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        ))}
      </details>
      <div className="rounded-lg border p-4">
        <h3 className="font-medium">Pagamenti dell'intera operazione · IVA inclusa</h3>
        <div className="mt-3 space-y-2">
          {pagamenti.map((x) => (
            <div key={x.orderId} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm">
              <span>{nomi.get(x.orderId)}</span>
              <span>
                Pagato {euro(x.totali.pagato)} · da pagare {euro(x.totali.daPagare)} · ordinato senza fattura{" "}
                {euro(x.totali.impegnato)}
              </span>
            </div>
          ))}
        </div>
        {d.fatture
          .filter((f) => f.company_cost_id)
          .map((f) => (
            <Button key={f.id} variant="link" onClick={() => setCosto(f.company_cost_id)}>
              Pagamenti fattura {f.numero_fattura}
            </Button>
          ))}
      </div>
      {costo && (
        <ExpensePaymentDialog
          costId={costo}
          onClose={() => {
            setCosto(null);
            void q.refetch();
          }}
        />
      )}
      <RiepilogoFatturaRicevuta
        fatturaId={fatturaAperta}
        companyId={companyId}
        onClose={() => {
          setFatturaAperta(null);
          void q.refetch();
        }}
      />
    </section>
  );
}
