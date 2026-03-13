import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
}

export function useDashboardBillingKPI(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dashboard-billing-kpi", companyId],
    enabled: enabled && !!companyId,
    queryFn: async (): Promise<DashboardBillingKPI> => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const yearStart = `${year}-01-01`;
      const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

      const [docRes, incassiRes, pagStRes] = await Promise.all([
        // 1. Documenti fiscali aggregation
        supabase
          .from("documenti_fiscali")
          .select("tipo, stato, data_emissione, totale_da_pagare, imponibile_totale")
          .eq("company_id", companyId!)
          .is("deleted_at", null),

        // 2. Incassi mese (movimenti_cassa_native entrata linked to documento)
        supabase
          .from("movimenti_cassa_native" as never)
          .select("importo, data_movimento")
          .eq("company_id", companyId!)
          .eq("tipo", "entrata")
          .not("documento_id", "is", null)
          .gte("data_movimento", monthStart)
          .lt("data_movimento", nextMonth),

        // 3. fattura_pagamento_stato for outstanding/overdue
        supabase
          .from("fattura_pagamento_stato" as never)
          .select("importo_residuo, stato_pagamento")
          .eq("company_id", companyId!),
      ]);

      if (docRes.error) throw docRes.error;

      const docs = (docRes.data ?? []) as Array<{
        tipo: string;
        stato: string;
        data_emissione: string;
        totale_da_pagare: number;
        imponibile: number;
      }>;

      const fattureTipo = ["fattura", "fattura_pa", "fattura_accompagnatoria", "autofattura"];

      let fatturato_mese = 0;
      let fatturato_ytd = 0;
      let fatture_emesse_mese = 0;
      let fatture_in_bozza = 0;
      let proforma_aperti = 0;

      for (const d of docs) {
        const isFattura = fattureTipo.includes(d.tipo);
        const isEmessa = d.stato !== "annullata";
        const dataStr = d.data_emissione ?? "";

        if (isFattura && isEmessa) {
          if (dataStr >= yearStart) {
            fatturato_ytd += d.imponibile ?? 0;
            if (dataStr >= monthStart && dataStr < nextMonth) {
              fatturato_mese += d.imponibile ?? 0;
              fatture_emesse_mese++;
            }
          }
        }

        if (d.stato === "bozza" && isFattura) fatture_in_bozza++;
        if (d.tipo === "proforma" && d.stato !== "annullata") proforma_aperti++;
      }

      // Incassi
      const incassi = ((incassiRes.data as any[]) ?? []);
      const incassato_mese = incassi.reduce((s: number, r: any) => s + (r.importo ?? 0), 0);

      // Outstanding
      const pagSt = ((pagStRes.data as any[]) ?? []);
      let da_incassare_totale = 0;
      let scaduto = 0;
      let fatture_scadute_count = 0;

      for (const p of pagSt) {
        const residuo = p.importo_residuo ?? 0;
        if (residuo > 0) {
          da_incassare_totale += residuo;
          if (p.stato_pagamento === "scaduta") {
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
        in_scadenza_30gg: 0, // not available from current view
        fatture_scadute_count,
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
}

export function useTopClientiByFatturato(companyId: string | null, limit = 5) {
  return useQuery({
    queryKey: ["top-clienti-fatturato", companyId, limit],
    enabled: !!companyId,
    queryFn: async (): Promise<TopCliente[]> => {
      const yearStart = `${new Date().getFullYear()}-01-01`;

      const { data, error } = await supabase
        .from("documenti_fiscali")
        .select("anagrafica_id, imponibile, stato")
        .eq("company_id", companyId!)
        .in("tipo", ["fattura", "fattura_pa", "fattura_accompagnatoria", "autofattura"])
        .neq("stato", "annullata")
        .is("deleted_at", null)
        .gte("data_emissione", yearStart);

      if (error) throw error;

      // Aggregate by anagrafica_id
      const map = new Map<string, { fatturato: number; daIncassare: number }>();
      for (const d of data ?? []) {
        const key = (d as any).anagrafica_id ?? "unknown";
        if (!map.has(key)) map.set(key, { fatturato: 0, daIncassare: 0 });
        const entry = map.get(key)!;
        entry.fatturato += (d as any).imponibile ?? 0;
        if ((d as any).stato !== "pagata") entry.daIncassare += (d as any).imponibile ?? 0;
      }

      const ids = Array.from(map.keys()).filter((k) => k !== "unknown");
      if (!ids.length) return [];

      const { data: anag } = await supabase
        .from("anagrafiche_native")
        .select("id, ragione_sociale, nome, cognome")
        .in("id", ids);

      const nameMap = new Map<string, string>();
      for (const a of anag ?? []) {
        nameMap.set(a.id, a.ragione_sociale || [a.nome, a.cognome].filter(Boolean).join(" ") || "Sconosciuto");
      }

      return Array.from(map.entries())
        .map(([id, v]) => ({
          id,
          nome: nameMap.get(id) ?? "Sconosciuto",
          fatturato: v.fatturato,
          daIncassare: v.daIncassare,
        }))
        .sort((a, b) => b.fatturato - a.fatturato)
        .slice(0, limit);
    },
    staleTime: 10 * 60_000,
  });
}
