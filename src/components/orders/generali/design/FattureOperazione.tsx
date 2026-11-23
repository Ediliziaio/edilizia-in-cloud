/**
 * Le fatture dei fornitori dell'operazione (16/11/2026).
 *
 * Una fattura importata diventa un costo (`company_costs`), e il costo ha — se qualcuno gliela
 * dà — la commessa. Finché non ce l'ha, la fattura non compare da nessuna parte dentro la
 * commessa e non entra nello speso: su URBAN VISION, il 16/11/2026, 17 costi su 40 (23.805 €)
 * erano senza commessa e nessuna pagina lo diceva. Qui si vedono quelle dell'operazione, e si
 * dice quante restano da assegnare.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { leggiCostiOperazione } from "@/lib/orders/generali/costiOperazione";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { quoteDelCosto } from "@/lib/fatturazione/ripartizioneFattura";
import { dataBreve, euro } from "../piano/formato";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// I join fra costo e fattura superano la profondità dei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface FatturaOperazione {
  id: string;
  fornitore: string;
  numero: string | null;
  data: string | null;
  imponibile: number;
  /** Su quale commessa è il costo: la generale o una delle figlie. */
  orderId: string | null;
}

export interface DatiFattureOperazione {
  fatture: FatturaOperazione[];
  totale: number;
  /** Costi dell'azienda ancora senza commessa: non sono nello speso di nessuna operazione. */
  senzaCommessa: { quante: number; totale: number };
}

async function leggi(companyId: string, ids: string[]): Promise<DatiFattureOperazione> {
  const [costi, nonAssegnati] = await Promise.all([
    leggiCostiOperazione(companyId, ids),
    allPaymentRows<{ amount: number; allocations: unknown; quota_magazzino: number | null }>((a, b) =>
      db.from("company_costs").select("amount,allocations,quota_magazzino").eq("company_id", companyId)
        .is("order_id", null).order("id").range(a, b)),
  ]);
  const orfani = nonAssegnati.filter(c => !quoteDelCosto(c).length && !c.quota_magazzino);
  const fatture: FatturaOperazione[] = [];
  for (let i = 0; i < costi.length; i += 50) {
    const lotto = costi.slice(i, i + 50);
    const documenti = await allPaymentRows<{ id: string; cedente_ragione_sociale: string; numero_fattura: string; data_fattura: string; imponibile_totale: number; company_cost_id: string }>((a,b) =>
      db.from("fatture_ricevute").select("id,cedente_ragione_sociale,numero_fattura,data_fattura,imponibile_totale,company_cost_id")
        .eq("company_id", companyId).in("company_cost_id", lotto.map(c => c.id)).order("id").range(a,b));
    for (const costo of lotto) {
      const documentiCosto = documenti.filter(f => f.company_cost_id === costo.id);
      const quote = quoteDelCosto(costo).filter(q => ids.includes(q.order_id));
      if (!quote.length) continue;
      const percentuale = quote.reduce((n,q) => n + q.pct, 0);
      let cumulato = 0;
      for (const f of documentiCosto) {
        const netto = Number(f.imponibile_totale ?? 0);
        const prima = Math.round(cumulato);
        cumulato += documentiCosto.length === 1
          ? quote.reduce((n,q) => n + (q.importo != null ? Math.sign(netto) * q.importo * 100 : netto * q.pct), 0)
          : netto * percentuale;
        fatture.push({ id: f.id, fornitore: f.cedente_ragione_sociale ?? "Fornitore", numero: f.numero_fattura,
          data: f.data_fattura, imponibile: (Math.round(cumulato) - prima) / 100, orderId: quote.length === 1 ? quote[0].order_id : null });
      }
    }
  }
  fatture.sort((a,b) => (b.data ?? "").localeCompare(a.data ?? "") || a.id.localeCompare(b.id));
  return {
    fatture,
    totale: fatture.reduce((t, f) => t + f.imponibile, 0),
    senzaCommessa: { quante: orfani.length, totale: orfani.reduce((t, c) => t + Number(c.amount ?? 0), 0) },
  };
}

export function FattureOperazione({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const tr = useT();
  const generaleId = riepilogo.generale.id;
  const companyId = useEffectiveCompanyId();
  const ids = [generaleId, ...riepilogo.figlie.map((f) => f.id)];
  const q = useQuery({
    queryKey: ["generale-fatture-fornitori", companyId, ids],
    enabled: !!companyId && riepilogo.permessi.costi,
    staleTime: 60_000,
    queryFn: () => leggi(companyId!, ids),
  });

  if (!riepilogo.permessi.costi) return null;
  // Il riquadro vive nella Panoramica: qualunque cosa torni, non deve farla cadere.
  const fatture = Array.isArray(q.data?.fatture) ? q.data!.fatture : [];
  const senzaCommessa = q.data?.senzaCommessa ?? { quante: 0, totale: 0 };
  const totale = typeof q.data?.totale === "number" ? q.data.totale : 0;
  // Niente fatture e niente da assegnare: non si occupa spazio per dire zero.
  if (fatture.length === 0 && senzaCommessa.quante === 0) return null;
  const d = { fatture, senzaCommessa, totale };

  const codici = new Map(riepilogo.figlie.map((f) => [f.id, f.codice] as const));
  const dove = (orderId: string | null) =>
    !orderId || orderId === generaleId ? null : codici.get(orderId) ?? null;

  return (
    <section aria-labelledby="fatture-operazione" className="generale-panel overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 id="fatture-operazione" className="flex items-center gap-2 text-sm font-semibold">
          <span className="generale-section-icon"><ReceiptText aria-hidden="true" /></span>
          {tr("Fatture dei fornitori")}
          {d.fatture.length > 0 && <span className="generale-count">{d.fatture.length}</span>}
        </h2>
        {d.fatture.length > 0 && (
          <span className="text-sm font-semibold tabular-nums">{euro(d.totale)}</span>
        )}
      </header>

      {d.fatture.length > 0 && (
        <ul className="divide-y">
          {d.fatture.slice(0, 6).map((f) => (
            <li key={f.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {f.fornitore}
                <span className="text-xs text-muted-foreground">
                  {f.numero ? ` · n. ${f.numero}` : ""}{f.data ? ` · ${dataBreve(f.data)}` : ""}
                  {dove(f.orderId) ? ` · ${dove(f.orderId)}` : ""}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{euro(f.imponibile)}</span>
            </li>
          ))}
          {d.fatture.length > 6 && (
            <li className="px-4 py-2 text-xs text-muted-foreground">
              {tr("e altre {n}, per {importo}.", { n: d.fatture.length - 6, importo: euro(d.totale - d.fatture.slice(0, 6).reduce((t, f) => t + f.imponibile, 0)) })}
            </li>
          )}
        </ul>
      )}

      {d.senzaCommessa.quante > 0 && (
        <details className="border-t bg-amber-50/60 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <summary className="w-fit cursor-pointer font-medium">
            {d.senzaCommessa.quante === 1 ? tr("1 costo aziendale da attribuire") : tr("{quante} costi aziendali da attribuire", { quante: String(d.senzaCommessa.quante ?? "") })}
          </summary>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <p className="min-w-0 flex-1">
              {tr("{importo} complessivi da ripartire tra le commesse dell’azienda.", { importo: euro(d.senzaCommessa.totale) })}
              {d.fatture.length === 0 && ` ${tr("0 fatture collegate a questa operazione.")}`}
            </p>
            <Link to="/azienda/documenti/fatture-ricevute" className="generale-text-link shrink-0">
              {tr("Apri fatture ricevute")} <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        </details>
      )}
    </section>
  );
}
