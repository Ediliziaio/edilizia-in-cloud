import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { filtraRateFornitori, rataDaPagare, ribaDaContabilizzare } from "@/lib/fatturazione/rateFornitoriScadenzario";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/**
 * Con «Ri.Ba.» scelto: le Ri.Ba. che stanno solo dentro fatture ricevute non ancora registrate come costo.
 * Non sono nell'elenco (non hanno ancora una scadenza): senza questo avviso sparirebbero. Prima stavano
 * nella vista «Rate fornitori», tolta il 28/11/2026.
 */
export function RibaNonRegistrate({ companyId, dal, al, cerca, abilitato, fornitoreId }: { companyId: string; dal: string | null; al: string | null; cerca: string; abilitato: boolean; fornitoreId?: string | null }) {
  const t = useT();
  const fatture = useQuery({
    queryKey: ["fatture-ricevute", "piano-riba", companyId, fornitoreId ?? null],
    enabled: abilitato,
    staleTime: 60_000,
    queryFn: () => tutteLePagine((from, to) => {
      const q = supabase.from("fatture_ricevute")
        .select("id, numero_fattura, cedente_ragione_sociale, tipo_documento, piano_pagamento, pagata_il")
        .eq("company_id", companyId).is("company_cost_id", null).not("stato", "in", "(annullata,scartata,rifiutata,contabilizzata)")
        .contains("piano_pagamento", JSON.stringify([{ modalita: "MP12" }]));
      return (fornitoreId ? q.eq("fornitore_id", fornitoreId) : q).order("id").range(from, to);
    }),
  });
  // Le fatture che hanno già rate registrate non vanno contate due volte (come faceva la vecchia vista «Rate fornitori»).
  const registrate = useQuery({
    queryKey: ["scadenzario", "rate-fornitori", companyId, "residui"],
    enabled: abilitato,
    staleTime: 60_000,
    queryFn: () => tutteLePagine((from, to) => supabase.rpc("scadenzario_rate_fornitori", { p_company_id: companyId })
      .order("scadenza", { nullsFirst: false }).order("id").range(from, to)),
  });
  const rate = useMemo(() => {
    const collegate = new Set((registrate.data ?? []).map((r) => r.fattura_id));
    return filtraRateFornitori((fatture.data ?? []).filter((f) => !collegate.has(f.id)).flatMap(ribaDaContabilizzare),
    { anno: "all", da: dal ?? "", a: al ?? "", soloAperte: true, soloRiba: true, cerca });
  }, [fatture.data, registrate.data, dal, al, cerca]);
  if (!abilitato || fatture.isLoading || registrate.isLoading || fatture.isError || registrate.isError || rate.length === 0) return null;
  const totale = rate.filter(rataDaPagare).reduce((c, r) => c + Math.round((r.residuo ?? 0) * 100), 0) / 100;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>{t(rate.length === 1 ? "{n} Ri.Ba. in una fattura non ancora registrata, {importo}" : "{n} Ri.Ba. in fatture non ancora registrate, {importo}", { n: rate.length, importo: formatCurrency(totale) })}</span>
      <Link className="font-semibold underline underline-offset-2"
        to="/azienda/documenti/fatture-ricevute">
        {t("Apri Fatture ricevute")}
      </Link>
    </div>
  );
}
