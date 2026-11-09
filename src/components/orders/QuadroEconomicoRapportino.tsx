/**
 * I soldi del rapportino: per persona ore, costo orario e costo; nei lavori in
 * appalto anche vendita, ricavo e margine. Il permesso lo controlla il database.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";

interface Riga {
  emp: string | null; nome: string; ditta: boolean; ore: number; costo_orario: number | null; costo: number | null;
  unita: string | null; quantita: number | null; prezzo: number | null; ricavo: number | null;
}
interface Quadro { persone: Riga[]; appalto: boolean; a_corpo: boolean; registrato: boolean }

const ore = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;
const euro = (n: number | null | undefined) => (n == null ? "—" : formatCurrency(Number(n)));
const UNITA: Record<string, string> = { ora: "/h", giornata: "/giorno", uomo_giorno: "/giorno" };

export function QuadroEconomicoRapportino({ rapportinoId }: { rapportinoId: string }) {
  const { data } = useQuery({
    queryKey: ["rapportino-quadro-economico", rapportinoId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { rpc: (f: string, a: object) => Promise<{ data: Quadro | null; error: Error | null }> })
        .rpc("rapportino_quadro_economico", { p_rapportino_id: rapportinoId });
      if (error) throw error;
      return data;
    },
    retry: false,
  });
  if (!data?.persone?.length) return null;

  const conVendita = data.appalto && !data.a_corpo;
  const totCosto = data.persone.reduce((s, r) => s + Number(r.costo ?? 0), 0);
  const totRicavo = data.persone.reduce((s, r) => s + Number(r.ricavo ?? 0), 0);
  const totOre = data.persone.reduce((s, r) => s + Number(r.ore), 0);
  const margine = (r: Riga) => (r.ricavo == null || r.costo == null ? null : Number(r.ricavo) - Number(r.costo));

  return (
    <section aria-label="Costi del rapportino" className="rounded-lg border text-[13px]">
      <h3 className="border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {data.registrato ? "Costi registrati" : "Costi stimati"}
      </h3>
      <ul className="divide-y">
        {data.persone.map((r, i) => (
          <li key={`${r.emp ?? r.nome}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-1.5">
            <span className="min-w-0 truncate font-medium text-slate-900">{r.nome}</span>
            <span className="text-right tabular-nums font-semibold">{r.ditta ? "Da contratto" : euro(r.costo)}</span>
            <span className="text-xs text-muted-foreground">
              {ore(Number(r.ore))}{r.costo_orario ? ` · ${euro(r.costo_orario)}/h` : r.ditta ? "" : " · tariffa da completare"}
            </span>
            <span className="text-right text-xs text-muted-foreground">costo</span>
            {conVendita && (
              <>
                <span className="text-xs text-blue-800">
                  {r.prezzo != null ? `Vendita ${euro(r.prezzo)}${UNITA[r.unita ?? ""] ?? ""} · ricavo ${euro(r.ricavo)}` : "Vendita da impostare"}
                </span>
                <span className={`text-right text-xs font-semibold tabular-nums ${(margine(r) ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {margine(r) == null ? "" : `margine ${euro(margine(r))}`}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <dl className={`grid gap-2 border-t bg-muted/40 px-3 py-1.5 tabular-nums ${conVendita ? "grid-cols-4" : "grid-cols-2"}`}>
        <div><dt className="text-[11px] text-muted-foreground">Ore</dt><dd className="font-semibold">{ore(totOre)}</dd></div>
        <div><dt className="text-[11px] text-muted-foreground">Costo</dt><dd className="font-semibold">{euro(totCosto)}</dd></div>
        {conVendita && <div><dt className="text-[11px] text-muted-foreground">Ricavo</dt><dd className="font-semibold">{euro(totRicavo)}</dd></div>}
        {conVendita && <div><dt className="text-[11px] text-muted-foreground">Margine</dt><dd className={`font-semibold ${totRicavo - totCosto < 0 ? "text-red-700" : "text-emerald-700"}`}>{euro(totRicavo - totCosto)}</dd></div>}
      </dl>
    </section>
  );
}
