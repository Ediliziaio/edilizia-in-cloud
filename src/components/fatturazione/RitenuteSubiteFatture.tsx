/**
 * Ritenute d'acconto subite sulle nostre fatture (01/11/2026): il condominio (4%) e gli altri sostituti
 * d'imposta pagano la fattura al netto e versano loro la ritenuta. Per l'impresa è un acconto d'imposta,
 * da usare in dichiarazione: prima stava solo dentro ogni fattura, senza un posto che le sommasse.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { readAllPages } from "@/lib/personale/readAllPages";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { FiscalMetric } from "./FiscalSectionLayout";

interface Riga {
  id: string;
  numero: string;
  data_emissione: string;
  stato: string;
  tipo: string;
  ritenuta_importo: number | null;
  ritenuta_aliquota: number | null;
  ritenuta_causale: string | null;
  cliente_snapshot: { ragione_sociale?: string; denominazione?: string; nome?: string; cognome?: string } | null;
}

const cliente = (r: Riga) => {
  const c = r.cliente_snapshot ?? {};
  return c.ragione_sociale || c.denominazione || [c.nome, c.cognome].filter(Boolean).join(" ") || "Cliente";
};

export function RitenuteSubiteFatture({ anno, primoMese, ultimoMese }: { anno: number; primoMese: number; ultimoMese: number }) {
  const companyId = useEffectiveCompanyId();
  const q = useQuery({
    queryKey: ["ritenute-subite-fatture", companyId, anno],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      readAllPages<Riga>((from, to) =>
        supabase
          .from("documenti_fiscali")
          .select("id,numero,data_emissione,stato,tipo,ritenuta_importo,ritenuta_aliquota,ritenuta_causale,cliente_snapshot")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .gt("ritenuta_importo", 0)
          .not("stato", "in", "(bozza,annullata,stornata)")
          .gte("data_emissione", `${anno}-01-01`)
          .lte("data_emissione", `${anno}-12-31`)
          .order("data_emissione", { ascending: false })
          .order("id")
          .range(from, to)
          .abortSignal(signal) as never,
      ),
  });
  // Le fatture d'appalto di prima del 01/11/2026 scrivevano la garanzia come RT02: non è un acconto d'imposta.
  const righe = (q.data ?? []).filter((r) => {
    if (/garanzia/i.test(r.ritenuta_causale ?? "")) return false;
    const m = Number(r.data_emissione.slice(5, 7));
    return m >= primoMese && m <= ultimoMese;
  });
  // La nota di credito restituisce la ritenuta: si sottrae.
  const segno = (r: Riga) => (r.tipo === "nota_credito" ? -1 : 1);
  const somma = (rs: Riga[]) => rs.reduce((t, r) => t + segno(r) * Number(r.ritenuta_importo ?? 0), 0);
  const incassate = righe.filter((r) => r.stato === "pagata");

  if (q.isLoading || q.isError || righe.length === 0) return null;
  return (
    <section className="space-y-3 border-t pt-4" aria-label="Ritenute subite sulle fatture">
      <div>
        <h3 className="font-semibold">Ritenute subite sulle nostre fatture</h3>
        <p className="text-sm text-muted-foreground">
          Condominio (4%) e altri sostituti d’imposta: pagano la fattura al netto e versano loro la ritenuta.
          È un acconto d’imposta dell’impresa, da riportare in dichiarazione con la loro certificazione.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FiscalMetric
          label="Ritenute sulle fatture del periodo"
          value={formatCurrency(somma(righe))}
          description={`${righe.length} ${righe.length === 1 ? "fattura" : "fatture"} per data di emissione`}
        />
        <FiscalMetric
          label="Già incassate (credito maturato)"
          value={formatCurrency(somma(incassate))}
          description="La ritenuta conta quando il cliente paga la fattura"
        />
      </div>
      <ul className="divide-y rounded-xl border text-sm">
        {righe.slice(0, 50).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <Link to={`/azienda/documenti/${r.id}/dettaglio`} className="min-w-0 font-medium hover:underline">
              {r.tipo === "nota_credito" ? "Nota di credito" : "Fattura"} {r.numero}
              <span className="ml-2 font-normal text-muted-foreground">{cliente(r)} · {formatDateIt(r.data_emissione)}</span>
            </Link>
            <span className="tabular-nums">
              {formatCurrency(segno(r) * Number(r.ritenuta_importo ?? 0))}
              {r.ritenuta_aliquota ? <span className="ml-1 text-muted-foreground">({Number(r.ritenuta_aliquota)}%)</span> : null}
              <span className={`ml-2 text-xs ${r.stato === "pagata" ? "text-emerald-700" : "text-amber-700"}`}>
                {r.stato === "pagata" ? "incassata" : "da incassare"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
