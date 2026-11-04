/**
 * «Fatture e debiti» del fornitore (01/11/2026): le fatture ricevute col loro stato di pagamento, le
 * rate e le RiBa ancora aperte, l'estratto conto dare/avere. Le fatture si trovano dal fornitore
 * collegato E dalla P.IVA scritta nell'XML: il 01/11/2026 solo 907 fatture su 14.445 avevano il
 * fornitore collegato, e senza la P.IVA la scheda ne avrebbe mostrate quasi nessuna.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Le letture con i join (costo, fornitore, commessa proposta) superano la profondità dei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { readAllPages } from "@/lib/personale/readAllPages";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import {
  ETICHETTA_STATO_PAGAMENTO,
  estrattoConto,
  statoFatture,
  totaliFornitore,
  variantiPartitaIva,
  type FatturaFornitore,
  type RataFornitore,
  type StatoPagamento,
} from "@/lib/fornitori/estrattoConto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const COLORE: Record<StatoPagamento, string> = {
  pagata: "bg-emerald-100 text-emerald-800",
  parziale: "bg-sky-100 text-sky-800",
  scaduta: "bg-rose-100 text-rose-800",
  da_pagare: "bg-amber-100 text-amber-800",
  da_registrare: "bg-slate-100 text-slate-700",
  nota_credito: "bg-violet-100 text-violet-800",
  stornata: "bg-slate-100 text-slate-700",
};

const METODO: Record<string, string> = { riba: "RiBa", bonifico: "Bonifico", carta: "Carta", contanti: "Contanti" };

const oggi = () => new Date().toLocaleDateString("en-CA");

export function FattureDebitiFornitore({ supplierId, partitaIva }: { supplierId: string | null; partitaIva: string | null }) {
  const companyId = useEffectiveCompanyId();
  const [vista, setVista] = useState<"fatture" | "conto">("fatture");

  const q = useQuery({
    queryKey: ["fornitore-fatture-debiti", companyId, supplierId, partitaIva],
    enabled: !!companyId && (!!supplierId || variantiPartitaIva(partitaIva).length > 0),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const filtro = [
        ...(supplierId ? [`fornitore_id.eq.${supplierId}`] : []),
        ...variantiPartitaIva(partitaIva).map((v) => `cedente_piva.eq.${v}`),
      ].join(",");
      const fatture = await readAllPages<FatturaFornitore>((from, to) =>
        db
          .from("fatture_ricevute")
          .select("id,numero_fattura,data_fattura,tipo_documento,totale_documento,netto_a_pagare,stato,company_cost_id,storico_esterno,costo:company_costs(is_paid,paid_date,order_id)")
          .eq("company_id", companyId!)
          .or(filtro)
          .order("data_fattura", { ascending: false })
          .order("id")
          .range(from, to)
          .abortSignal(signal) as never,
      );
      // Le rate: quelle dei costi del fornitore e quelle delle sue fatture.
      const rate = !supplierId ? [] : await readAllPages<RataFornitore>((from, to) =>
        db
          .from("rate_fornitori")
          .select("id,fattura_ricevuta_id,company_cost_id,numero,scadenza,importo,metodo,stato,pagata_il,cost:company_costs!inner(supplier_id)")
          .eq("company_id", companyId!)
          .eq("cost.supplier_id", supplierId)
          .order("scadenza")
          .order("id")
          .range(from, to)
          .abortSignal(signal) as never,
      );
      const viste = new Set(rate.map((r) => r.id));
      const ids = fatture.map((f) => f.id);
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await db
          .from("rate_fornitori")
          .select("id,fattura_ricevuta_id,company_cost_id,numero,scadenza,importo,metodo,stato,pagata_il")
          .eq("company_id", companyId!)
          .in("fattura_ricevuta_id", ids.slice(i, i + 150))
          .abortSignal(signal);
        if (error) throw error;
        for (const r of (data ?? []) as RataFornitore[]) if (!viste.has(r.id)) rate.push(r);
      }
      return { fatture, rate };
    },
  });

  const giorno = oggi();
  const righe = useMemo(() => (q.data ? statoFatture(q.data.fatture, q.data.rate, giorno) : []), [q.data, giorno]);
  const totali = useMemo(() => totaliFornitore(righe, giorno), [righe, giorno]);
  const conto = useMemo(() => estrattoConto(righe), [righe]);
  const aperte = useMemo(
    () => (q.data?.rate ?? []).filter((r) => r.stato !== "pagata" && r.stato !== "stornata").sort((a, b) => (a.scadenza ?? "9999").localeCompare(b.scadenza ?? "9999")),
    [q.data],
  );

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError)
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-4 text-sm">
        <p>Non riesco a leggere fatture e debiti del fornitore.</p>
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Riprova</Button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Fatturato", totali.fatturato, ""],
          ["Pagato", totali.pagato, "text-emerald-700"],
          ["Da pagare", totali.daPagare, totali.daPagare > 0 ? "text-amber-700" : ""],
          ["Scaduto", totali.scaduto, totali.scaduto > 0 ? "text-rose-700" : ""],
          ["Da registrare", totali.daRegistrare, ""],
          ["Note di credito", totali.noteCredito, ""],
        ].map(([nome, valore, cls]) => (
          <div key={nome as string} className="rounded-lg border p-2.5">
            <p className="text-xs text-muted-foreground">{nome}</p>
            <p className={`text-base font-semibold tabular-nums ${cls}`}>{formatCurrency(valore as number)}</p>
          </div>
        ))}
      </div>
      {totali.daRegistrare > 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
          {formatCurrency(totali.daRegistrare)} di fatture arrivate ma non ancora registrate come costo: il debito c’è,
          le scadenze sono quelle scritte in fattura.{" "}
          <Link to="/azienda/documenti/fatture-ricevute" className="font-medium underline">Registrale</Link>
        </p>
      )}

      {aperte.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Rate e RiBa da pagare</h3>
          <ul className="divide-y rounded-lg border text-sm">
            {aperte.slice(0, 30).map((r) => {
              const scaduta = !!r.scadenza && r.scadenza < giorno;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                  <span className={scaduta ? "text-rose-700" : ""}>
                    {r.scadenza ? formatDateIt(r.scadenza) : "Senza data"} · {METODO[r.metodo ?? ""] ?? "Pagamento"}
                    {scaduta && " · scaduta"}
                  </span>
                  <span className="font-medium tabular-nums">{formatCurrency(Number(r.importo) || 0)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant={vista === "fatture" ? "default" : "outline"} onClick={() => setVista("fatture")}>
          Fatture ({righe.length})
        </Button>
        <Button size="sm" variant={vista === "conto" ? "default" : "outline"} onClick={() => setVista("conto")}>
          Estratto conto
        </Button>
      </div>

      {righe.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Nessuna fattura ricevuta da questo fornitore{partitaIva ? "" : ": aggiungi la P.IVA in anagrafica per trovare quelle arrivate dallo SDI"}.
        </p>
      ) : vista === "fatture" ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Fattura</th>
                <th className="px-3 py-2 text-left font-medium">Stato</th>
                <th className="px-3 py-2 text-right font-medium">Importo</th>
                <th className="px-3 py-2 text-right font-medium">Residuo</th>
                <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Prossima scadenza</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {righe.slice(0, 200).map((r) => (
                <tr key={r.fattura.id}>
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{r.fattura.numero_fattura ?? "—"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.fattura.data_fattura ? formatDateIt(r.fattura.data_fattura) : ""}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge className={`${COLORE[r.stato]} font-normal`}>{ETICHETTA_STATO_PAGAMENTO[r.stato]}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(r.importo)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.residuo > 0 ? formatCurrency(r.residuo) : "—"}</td>
                  <td className="hidden px-3 py-1.5 sm:table-cell">{r.prossimaScadenza ? formatDateIt(r.prossimaScadenza) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Data</th>
                <th className="px-3 py-2 text-left font-medium">Movimento</th>
                <th className="px-3 py-2 text-right font-medium">Dare</th>
                <th className="px-3 py-2 text-right font-medium">Avere</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {conto.map((m, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-3 py-1.5">{m.data ? formatDateIt(m.data) : "—"}</td>
                  <td className="px-3 py-1.5">{m.descrizione}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m.dare ? formatCurrency(m.dare) : ""}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m.avere ? formatCurrency(m.avere) : ""}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{formatCurrency(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Avere: le fatture (il debito sale). Dare: pagamenti e note di credito (il debito scende). Il saldo è quanto resta da pagare.
          </p>
        </div>
      )}
    </div>
  );
}
