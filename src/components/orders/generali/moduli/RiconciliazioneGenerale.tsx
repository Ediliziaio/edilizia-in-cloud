import { UniformSelect } from "@/components/ui/uniform-select";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck } from "lucide-react";
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
export function RiconciliazioneGenerale({ riepilogo, commessaId, onApriPagamenti, onApriFase }: {
  riepilogo: RiepilogoGenerale;
  commessaId?: string;
  onApriPagamenti?: () => void;
  onApriFase?: (commessaId: string, faseId: string) => void;
}) {
  const q = useControlloFornitureGenerale(riepilogo, commessaId);
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
    [riepilogo.generale.id, ["Generale", riepilogo.generale.codice].filter(Boolean).join(" · ")],
    ...riepilogo.figlie.map((f) => [f.id, f.codice ?? f.nome] as [string, string]),
  ]);
  const righe = d.righe.map((r) => ({ r, c: riconciliaRiga(r, d.consegne, d.fatture) }));
  const righeInAmbito = new Set(d.righe.map(r => r.id));
  const ddtsConOrdine = new Set(d.bolleConOrdine ?? []);
  for (const bolla of d.bolle) if (bolla.purchase_order_id) ddtsConOrdine.add(bolla.id);
  const visibili = soloProblemi ? righe.filter((x) => x.c.avvisi.length > 0) : righe;
  const pagamenti = d.quadri.map((x) => ({ ...x, totali: totaliQuadro(x.quadro) }))
    .filter(({ totali }) => totali.pagato !== 0 || totali.daPagare !== 0 || totali.impegnato !== 0);
  const diretti = d.bolle
    .filter((b) => !ddtsConOrdine.has(b.id))
    .map((bolla) => ({
      bolla,
      controllo: riconciliaDdtDiretto(bolla, d.consegne, d.fatture, d.legamiDdt),
    }));
  const nonAbbinate = d.consegne.filter(
    (c) =>
      !c.purchase_order_item_id && ddtsConOrdine.has(c.ddt_ricezione_id),
  ).length;
  const problemi =
    righe.filter((x) => x.c.avvisi.length).length + diretti.filter((x) => x.controllo.avvisi.length).length;
  const haDocumenti = righe.length > 0 || diretti.length > 0 || nonAbbinate > 0;
  const ambito = commessaId ? nomi.get(commessaId) : "Tutta l’operazione";
  return (
    <section id="cantiere-controllo" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="controllo-forniture">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="controllo-forniture" className="flex items-center gap-2 text-base font-semibold">
            <ClipboardCheck className="size-4 text-primary" aria-hidden="true" /> Controllo forniture
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{ambito} · Ordini, DDT e fatture collegate</p>
        </div>
        {onApriPagamenti && <Button size="sm" variant="ghost" onClick={onApriPagamenti}>
          Costi e pagamenti <ArrowRight className="size-4" aria-hidden="true" />
        </Button>}
      </header>
      {!haDocumenti && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Nessun ordine emesso o DDT da confrontare in questo ambito.
      </p>}
      {righe.length > 0 && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Ordinato", "impegnato"],
            ["Ricevuto al prezzo d’ordine", "maturato"],
            ["Fatturato abbinato", "fatturato"],
          ] as const
        ).map(([titolo, campo]) => (
          <div key={campo} className="rounded-lg border bg-muted/25 p-3">
            <p className="text-xs text-muted-foreground">{titolo}</p>
            <p className="text-xl font-semibold">
              {euro(
                righe.some((x) => x.c[campo] === null)
                  ? null
                  : righe.reduce((s, x) => s + (x.c[campo] ?? 0), 0),
              )}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Importi al netto IVA. Il ricevuto è valorizzato al prezzo d’ordine.</p>
      </>}
      {haDocumenti && <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={soloProblemi} onChange={(e) => setSoloProblemi(e.target.checked)} />
        Solo righe da controllare ({problemi})
      </label>}
      {nonAbbinate > 0 && (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
          {nonAbbinate} righe di DDT non sono abbinate a una riga d'ordine. Apri la bolla per completare il
          collegamento; non sono considerate consegne a valore zero.
        </p>
      )}
      {righe.length > 0 && <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" aria-label="Righe d’ordine e consegne">
          <thead className="bg-muted text-left">
            <tr>
              {[
                "Commessa / ordine / materiale",
                "Ordinato",
                "Ricevuto",
                "Da ricevere",
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
              const fase = r.order_item_id ? d.fasiPerMateriale?.[r.order_item_id] : undefined;
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
                    {fase && onApriFase && <button type="button" className="mt-1 block text-left text-xs text-primary hover:underline"
                      onClick={() => onApriFase(fase.order_id, fase.id)}>{fase.name}</button>}
                  </td>
                  <td className="p-3 tabular-nums">{c.ordinata}</td>
                  <td className="p-3 tabular-nums">{c.ricevuta}</td>
                  <td className="p-3 tabular-nums">{c.ricevutaCompleta ? Math.max(0, c.ordinata - c.ricevuta).toLocaleString("it-IT") : "Da verificare"}</td>
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
                <td colSpan={6} className="p-4 text-muted-foreground">
                  Nessuna anomalia nelle righe d’ordine lette.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>}
      <DdtSenzaOrdine
        righe={diretti}
        nomi={nomi}
        soloProblemi={soloProblemi}
        onApriFattura={setFatturaAperta}
      />
      {d.fattureConOrdine.length > 0 && <details className="rounded-lg border p-4">
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
                {r.purchase_order_item_id && !righeInAmbito.has(r.purchase_order_item_id) ? (
                  <span className="text-xs text-muted-foreground">Collegata fuori dall’ambito selezionato</span>
                ) : <UniformSelect
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
                </UniformSelect>}
              </label>
            ))}
          </div>
        ))}
      </details>}
      {(pagamenti.length > 0 || d.fatture.some(f => f.company_cost_id)) && <div className="rounded-lg border p-4">
        <h3 className="font-medium">Pagamenti · IVA inclusa</h3>
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
      </div>}
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
