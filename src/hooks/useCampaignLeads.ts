/**
 * useCampaignLeads — recupera i lead Meta arrivati per una specifica campagna.
 *
 * Source: webhook_events processati da meta-process-leads → tabella `customers`
 *   (oppure se esiste, una linkage table specifica come `meta_leads`).
 *
 * Per ora estraiamo dalla tabella `customers` filtrando per source_metadata.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CampaignLead {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: string | null;
  created_at: string;
  /** Meta lead form ID dal payload */
  meta_lead_id?: string;
  /** Campo "tipo intervento" o qualificazione */
  qualification?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (n: string) => (supabase as any).from(n);

export function useCampaignLeads(opts: {
  companyId: string | undefined;
  /** Meta campaign_id (testo Meta, non UUID locale) */
  metaCampaignId?: string | null;
  daysBack?: number;
}) {
  const { companyId, metaCampaignId, daysBack = 90 } = opts;

  const fromDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysBack);
    return d.toISOString();
  }, [daysBack]);

  const query = useQuery({
    queryKey: ["campaign-leads", companyId, metaCampaignId, daysBack],
    queryFn: async (): Promise<CampaignLead[]> => {
      if (!companyId) return [];
      try {
        // Strategia 1: cerca in customers filtrando per source/notes che contengono campaign_id
        let q = fromTable("customers")
          .select("id, full_name, email, phone, city, status, created_at, notes, source")
          .eq("company_id", companyId)
          .gte("created_at", fromDate)
          .order("created_at", { ascending: false })
          .limit(100);

        if (metaCampaignId) {
          // Match in notes (formato libero) o source field
          q = q.or(`notes.ilike.%${metaCampaignId}%,source.ilike.%${metaCampaignId}%`);
        } else {
          // Solo lead Meta (source = facebook / meta / instagram)
          q = q.in("source", ["facebook", "meta", "instagram", "lead_form_meta"]);
        }

        const { data, error } = await q;
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
          throw error;
        }
        return (data ?? []) as CampaignLead[];
      } catch {
        return [];
      }
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  return {
    leads: query.data ?? [],
    isLoading: query.isLoading,
    count: query.data?.length ?? 0,
  };
}
