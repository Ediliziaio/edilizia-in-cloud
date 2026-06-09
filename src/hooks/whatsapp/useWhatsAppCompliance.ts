// Hook di conformità WhatsApp Business Platform per il compose.
//  - useWhatsAppWindow: stato finestra 24h (ultimo inbound del cliente).
//  - useApprovedTemplates: template APPROVATI per il numero scelto.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

const WINDOW_MS = 24 * 60 * 60 * 1000;

function digits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

export interface WhatsAppWindowStatus {
  open: boolean;
  lastInboundAt: string | null;
  hoursLeft: number | null;
}

/** Stato finestra 24h per un numero di telefono destinatario. */
export function useWhatsAppWindow(phone: string | null | undefined) {
  const companyId = useEffectiveCompanyId();
  const clean = digits(phone);
  return useQuery<WhatsAppWindowStatus>({
    queryKey: ["whatsapp", "window", companyId, clean],
    enabled: !!companyId && clean.length >= 6,
    staleTime: 60_000,
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("from_phone, created_at")
        .eq("company_id", companyId!)
        .eq("direction", "inbound")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const match = (data ?? []).find((m) => {
        const f = digits(m.from_phone);
        return f === clean || f.endsWith(clean) || clean.endsWith(f);
      });
      if (!match) return { open: false, lastInboundAt: null, hoursLeft: null };
      const elapsed = Date.now() - new Date(match.created_at).getTime();
      const hoursLeft = Math.max(0, Math.round((WINDOW_MS - elapsed) / 3_600_000));
      return { open: elapsed < WINDOW_MS, lastInboundAt: match.created_at, hoursLeft };
    },
  });
}

export interface ApprovedTemplate {
  id: string;
  template_name: string;
  template_language: string;
  category: string | null;
  variables_count: number;
  // Mappa posizione variabile → chiave campo contatto (per auto-compilazione).
  variable_mapping: Record<string, string> | null;
}

/** Template WhatsApp APPROVATI da Meta, opzionalmente filtrati per numero. */
export function useApprovedTemplates(waNumberId?: string | null) {
  const companyId = useEffectiveCompanyId();
  return useQuery<ApprovedTemplate[]>({
    queryKey: ["whatsapp", "approved-templates", companyId, waNumberId ?? "all"],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabase
        .from("wa_meta_templates")
        .select("id, template_name, template_language, category, variables_count, variable_mapping, status, wa_number_id")
        .eq("company_id", companyId!)
        .eq("status", "APPROVED")
        .order("template_name", { ascending: true });
      if (waNumberId) q = q.eq("wa_number_id", waNumberId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((t) => ({
        id: t.id,
        template_name: t.template_name,
        template_language: t.template_language,
        category: t.category,
        variables_count: Number(t.variables_count ?? 0),
        variable_mapping: (t.variable_mapping ?? null) as Record<string, string> | null,
      }));
    },
  });
}
