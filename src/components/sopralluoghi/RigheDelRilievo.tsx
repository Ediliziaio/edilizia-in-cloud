/**
 * «Dalla misura all'ordine»: nella scheda del rilievo, dove sono finite le sue righe
 * (piano sopralluoghi, lotto 5). Misure da confermare, da ordinare, in ordine, arrivate.
 * Si vede solo se il rilievo ha già portato misure in commessa.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ETICHETTA_PASSO, righePerPasso, type Passo, type RigaDelRilievo } from "@/lib/sopralluoghi/statoRighe";

const TONO: Record<Passo, string> = {
  da_confermare: "bg-amber-50 text-amber-800 ring-amber-200",
  da_ordinare: "bg-slate-100 text-slate-700 ring-slate-200",
  ordinata: "bg-sky-50 text-sky-700 ring-sky-200",
  in_arrivo: "bg-blue-50 text-blue-700 ring-blue-200",
  arrivata: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export function RigheDelRilievo({ surveyId, orderId }: { surveyId: string; orderId: string | null }) {
  const stato = useQuery({
    queryKey: ["sopralluogo-stato-righe", surveyId],
    enabled: !!orderId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sopralluogo_stato_righe" as never, { p_survey: surveyId } as never);
      if (error) throw error;
      return (data ?? []) as unknown as RigaDelRilievo[];
    },
  });
  const gruppi = righePerPasso(stato.data ?? []);
  if (!orderId || !gruppi.length) return null;
  const conteggi = gruppi.reduce<Record<string, number>>((t, g) => ({ ...t, [g.passo]: (t[g.passo] ?? 0) + 1 }), {});
  return (
    <section aria-label="Dalla misura all'ordine" className="my-3 space-y-2 rounded-2xl border bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><PackageCheck className="h-4 w-4 text-emerald-600" />Dalla misura all'ordine</h2>
        <p className="text-xs text-muted-foreground">
          {(Object.keys(ETICHETTA_PASSO) as Passo[]).filter((p) => conteggi[p]).map((p) => `${conteggi[p]} ${ETICHETTA_PASSO[p].toLowerCase()}`).join(" · ")}
        </p>
      </div>
      <ul className="divide-y text-sm">
        {gruppi.map(({ riga, ordini, passo }) => (
          <li key={riga.order_item_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="min-w-0 flex-1 truncate">
              {riga.riferimento && <span className="mr-1.5 font-mono text-xs font-semibold">{riga.riferimento}</span>}
              {riga.nome}
            </span>
            <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${TONO[passo]}`}>{ETICHETTA_PASSO[passo]}</span>
            {ordini.map((o) => (
              <Link key={o.oda_id} to={`/azienda/ordini-acquisto/${o.oda_id}`} className="w-full text-xs text-primary hover:underline sm:w-auto">
                Ordine {o.oda_numero}{o.quantita_ordinata ? ` · ${Number(o.quantita_arrivata ?? 0)}/${Number(o.quantita_ordinata)} arrivati` : ""}
              </Link>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
