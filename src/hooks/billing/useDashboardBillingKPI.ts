import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { caricaRegistroVendite } from "@/lib/fatturazione/caricaRegistroVendite";
import { tutteLePagine, documentoNelRegistro, isNotaCredito } from "@/lib/fatturazione/registroVendite";
import { classificaClienti, conteggiPreparazione, fatturatoPeriodo } from "@/lib/fatturazione/statisticheVendite";
import { addDays, format } from "date-fns";

export interface DashboardBillingKPI {
  fatturato_mese: number;
  fatturato_ytd: number;
  fatture_emesse_mese: number;
  fatture_in_bozza: number;
  proforma_aperti: number;
  incassato_mese: number;
  da_incassare_totale: number;
  scaduto: number;
  in_scadenza_30gg: number;
  fatture_scadute_count: number;
  fatture_importate_incassi_da_verificare: number;
}

export function useDashboardBillingKPI(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dashboard-billing-kpi", companyId, "native-importate-v2"],
    enabled: enabled && !!companyId,
    queryFn: async (): Promise<DashboardBillingKPI> => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const yearStart = `${year}-01-01`;
      const finoAOggi = format(addDays(now,1),"yyyy-MM-dd");
      const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

      const [docRes, incassiRes, pagStRes] = await Promise.all([
        // 1. Documenti fiscali aggregation
        caricaRegistroVendite(companyId!),

        // 2. Incassi effettivi (il tipo è "incasso", non "entrata")
        tutteLePagine((from, to) => supabase
          .from("movimenti_cassa_native" as never)
          .select("documento_id, importo, data_movimento")
          .eq("company_id", companyId!)
          .eq("tipo", "incasso")
          .not("documento_id", "is", null)
          .gte("data_movimento", monthStart)
          .lt("data_movimento", nextMonth).order("id").range(from, to)),

        // 3. fattura_pagamento_stato for outstanding/overdue
        tutteLePagine((from, to) => supabase
          .from("fattura_pagamento_stato" as never)
          .select("fattura_id, importo_residuo, stato_pagamento")
          .eq("company_id", companyId!).order("fattura_id").range(from, to)),
      ]);

      const { imponibile: fatturato_mese, fatture: fatture_emesse_mese } = fatturatoPeriodo(docRes, monthStart, finoAOggi);
      const { imponibile: fatturato_ytd } = fatturatoPeriodo(docRes, yearStart, finoAOggi);
      const { bozze: fatture_in_bozza, proforma: proforma_aperti } = conteggiPreparazione(docRes);

      // Incassi
      const emesseNative = new Map(docRes.filter(d => d.origine === "nativa" && documentoNelRegistro(d) && !isNotaCredito(d.tipo)).map(d => [d.id,d]));
      const incassi = incassiRes as unknown as { documento_id: string; importo: number }[];
      const incassato_mese = incassi.filter(r => emesseNative.has(r.documento_id)).reduce((s,r) => s + (r.importo ?? 0),0);

      // Outstanding
      const pagSt = pagStRes as unknown as { fattura_id: string; importo_residuo: number; stato_pagamento: string }[];
      let da_incassare_totale = 0;
      let scaduto = 0;
      let fatture_scadute_count = 0;
      let in_scadenza_30gg = 0;
      const dateKey = (d:Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const oggi = dateKey(now);
      const tra30 = new Date(now); tra30.setDate(tra30.getDate()+30);

      for (const p of pagSt) {
        const documento = emesseNative.get(p.fattura_id);
        if (!documento) continue; // la vista contiene anche bozze e righe cancellate
        const residuo = p.importo_residuo ?? 0;
        if (residuo > 0) {
          da_incassare_totale += residuo;
          if (documento.data_scadenza && documento.data_scadenza >= oggi && documento.data_scadenza <= dateKey(tra30)) in_scadenza_30gg += residuo;
          if ((documento.data_scadenza && documento.data_scadenza < oggi) || p.stato_pagamento === "scaduta") {
            scaduto += residuo;
            fatture_scadute_count++;
          }
        }
      }

      return {
        fatturato_mese,
        fatturato_ytd,
        fatture_emesse_mese,
        fatture_in_bozza,
        proforma_aperti,
        incassato_mese,
        da_incassare_totale,
        scaduto,
        in_scadenza_30gg,
        fatture_scadute_count,
        fatture_importate_incassi_da_verificare: docRes.filter(d => d.origine === "importata" && documentoNelRegistro(d) && !isNotaCredito(d.tipo)).length,
      };
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export interface TopCliente {
  id: string;
  nome: string;
  fatturato: number;
  daIncassare: number;
  incassiImportatiDaVerificare?: boolean;
  anagraficaId?: string;
}

export function useTopClientiByFatturato(companyId: string | null, limit = 5, enabled = true) {
  return useQuery({
    queryKey: ["top-clienti-fatturato", companyId, limit, "native-importate-v2"],
    enabled: enabled && !!companyId,
    queryFn: async (): Promise<TopCliente[]> => {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const [docs, payments] = await Promise.all([
        caricaRegistroVendite(companyId!),
        tutteLePagine((from, to) => supabase.from("fattura_pagamento_stato" as never)
          .select("fattura_id, importo_residuo").eq("company_id", companyId!).order("fattura_id").range(from, to)),
      ]);
      const residui = new Map((payments as unknown as { fattura_id: string; importo_residuo: number }[]).map(p => [p.fattura_id, p.importo_residuo]));
      return classificaClienti(docs, residui, yearStart, format(addDays(new Date(),1),"yyyy-MM-dd"), limit);
    },
    staleTime: 10 * 60_000,
  });
}
