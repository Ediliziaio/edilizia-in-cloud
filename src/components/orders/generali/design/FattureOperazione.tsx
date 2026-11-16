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
import { dataBreve, euro } from "../piano/formato";

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
  const [costiOperazione, costiOrfani] = await Promise.all([
    db.from("company_costs").select("id, amount, order_id").in("order_id", ids).limit(1000),
    db.from("company_costs").select("amount").eq("company_id", companyId).is("order_id", null).limit(1000),
  ]);
  const costi = (costiOperazione.data ?? []) as { id: string; amount: number | null; order_id: string | null }[];
  const orfani = (costiOrfani.data ?? []) as { amount: number | null }[];

  let fatture: FatturaOperazione[] = [];
  if (costi.length > 0) {
    const { data } = await db
      .from("fatture_ricevute")
      .select("id, cedente_ragione_sociale, numero_fattura, data_fattura, imponibile_totale, company_cost_id")
      .in("company_cost_id", costi.map((c) => c.id))
      .order("data_fattura", { ascending: false })
      .limit(500);
    const commessaDi = new Map(costi.map((c) => [c.id, c.order_id] as const));
    fatture = ((data ?? []) as Record<string, unknown>[]).map((f) => ({
      id: String(f.id),
      fornitore: String(f.cedente_ragione_sociale ?? "Fornitore"),
      numero: (f.numero_fattura as string) ?? null,
      data: (f.data_fattura as string) ?? null,
      imponibile: Number(f.imponibile_totale ?? 0),
      orderId: commessaDi.get(String(f.company_cost_id)) ?? null,
    }));
  }
  return {
    fatture,
    totale: fatture.reduce((t, f) => t + f.imponibile, 0),
    senzaCommessa: { quante: orfani.length, totale: orfani.reduce((t, c) => t + Number(c.amount ?? 0), 0) },
  };
}

export function FattureOperazione({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const generaleId = riepilogo.generale.id;
  const companyId = useEffectiveCompanyId();
  const ids = [generaleId, ...riepilogo.figlie.map((f) => f.id)];
  const q = useQuery({
    queryKey: ["generale-fatture-fornitori", generaleId, ids.length],
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
          Fatture dei fornitori
          {d.fatture.length > 0 && <span className="generale-count">{d.fatture.length}</span>}
        </h2>
        {d.fatture.length > 0 && (
          <span className="text-sm font-semibold tabular-nums">{euro(d.totale)}</span>
        )}
      </header>

      {d.fatture.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Nessuna fattura è ancora attribuita a questa operazione.
        </p>
      ) : (
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
              e altre {d.fatture.length - 6}, per {euro(d.totale - d.fatture.slice(0, 6).reduce((t, f) => t + f.imponibile, 0))}.
            </li>
          )}
        </ul>
      )}

      {d.senzaCommessa.quante > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="min-w-0 flex-1">
            {d.senzaCommessa.quante === 1
              ? "Una fattura dell'azienda non ha ancora una commessa"
              : `${d.senzaCommessa.quante} fatture dell'azienda non hanno ancora una commessa`}
            {" "}<span className="tabular-nums">({euro(d.senzaCommessa.totale)})</span>: finché non ce l'hanno, non entrano nello speso di nessuna operazione.
          </span>
          <Link to="/azienda/documenti/fatture-ricevute" className="generale-text-link shrink-0">
            Assegnale <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}
