/**
 * Hook per gli aggregati della dashboard SMS.
 * Calcola KPI del mese corrente, trend 6 mesi, top 3 campagne.
 */
import { useQuery } from "@tanstack/react-query";
import { startOfMonth, subMonths, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { SmsStatsDashboard, SmsTrendPoint, SmsCampagna } from "@/types/sms-marketing";

const SMS_DASHBOARD_KEY = "sms-dashboard";

export function useSmsDashboard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: [SMS_DASHBOARD_KEY, companyId],
    queryFn: async (): Promise<SmsStatsDashboard> => {
      if (!companyId) {
        return { campagneInviate: 0, smsTotali: 0, tassoConsegnaMedio: 0, costoTotale: 0, trend: [], topCampagne: [] };
      }

      const meseInizio = startOfMonth(new Date()).toISOString();
      const sei_mesi_fa = subMonths(new Date(), 5);

      // Campagne del mese corrente
      const { data: campagneMese, error: campagneErr } = await supabase
        .from("sms_campaigns")
        .select(
          "id, company_id, nome, messaggio, mittente, stato, tipo, programmata_per, totale_destinatari, inviati, consegnati, errori, costo_totale, filtro_tags, created_at, updated_at"
        )
        .eq("company_id", companyId)
        .in("stato", ["completata", "in_corso"])
        .gte("created_at", meseInizio);

      if (campagneErr) {
        console.error("[useSmsDashboard] campagneMese:", campagneErr);
        throw new Error("Impossibile caricare i dati della dashboard.");
      }

      const lista = (campagneMese ?? []) as SmsCampagna[];
      const smsTotali = lista.reduce((s, c) => s + c.inviati, 0);
      const consegnatiTotali = lista.reduce((s, c) => s + c.consegnati, 0);
      const costoTotale = lista.reduce((s, c) => s + c.costo_totale, 0);
      const tassoConsegnaMedio = smsTotali > 0 ? (consegnatiTotali / smsTotali) * 100 : 0;

      // Trend ultimi 6 mesi
      const { data: campagneStoriche, error: storErr } = await supabase
        .from("sms_campaigns")
        .select("inviati, consegnati, costo_totale, created_at")
        .eq("company_id", companyId)
        .in("stato", ["completata"])
        .gte("created_at", sei_mesi_fa.toISOString());

      if (storErr) console.error("[useSmsDashboard] storico:", storErr);

      const trendMap = new Map<string, SmsTrendPoint>();
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        const key = format(d, "yyyy-MM");
        trendMap.set(key, { mese: key, invii: 0, consegnati: 0, costo: 0 });
      }
      for (const c of (campagneStoriche ?? [])) {
        const key = format(new Date(c.created_at), "yyyy-MM");
        const punto = trendMap.get(key);
        if (punto) {
          punto.invii += c.inviati ?? 0;
          punto.consegnati += c.consegnati ?? 0;
          punto.costo += c.costo_totale ?? 0;
        }
      }
      const trend = Array.from(trendMap.values());

      // Top 3 campagne per tasso consegna
      const topCampagne = [...lista]
        .filter((c) => c.inviati > 0)
        .sort((a, b) => (b.consegnati / b.inviati) - (a.consegnati / a.inviati))
        .slice(0, 3);

      return {
        campagneInviate: lista.length,
        smsTotali,
        tassoConsegnaMedio,
        costoTotale,
        trend,
        topCampagne,
      };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    dashboard: data ?? { campagneInviate: 0, smsTotali: 0, tassoConsegnaMedio: 0, costoTotale: 0, trend: [], topCampagne: [] },
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
