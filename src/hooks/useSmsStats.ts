/**
 * @file useSmsStats.ts
 * @description Hook per i KPI aggregati del modulo SMS transazionale.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { SmsStats } from "@/types/sms";

export function useSmsStats() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery<SmsStats>({
    queryKey: ["sms-stats", companyId],
    queryFn: async () => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);

      // Periodo corrente (30 gg)
      const { data: corrente, error: errCorrenti } = await supabase
        .from("sms_messages")
        .select("id, status, direction, created_at")
        .eq("company_id", companyId!)
        .gte("created_at", new Date(now.getTime() - 30 * 86400 * 1000).toISOString());
      if (errCorrenti) throw errCorrenti;

      const msgs = corrente ?? [];

      const outbound   = msgs.filter((m) => m.direction === "outbound");
      const delivered  = outbound.filter((m) => m.status === "delivered");
      const failed     = outbound.filter((m) => m.status === "failed");
      const inbound    = msgs.filter((m) => m.direction === "inbound");

      // Periodo precedente (30 gg prima) per trend
      const { data: precedente } = await supabase
        .from("sms_messages")
        .select("id, status, direction, created_at")
        .eq("company_id", companyId!)
        .eq("direction", "outbound")
        .gte("created_at", new Date(now.getTime() - 60 * 86400 * 1000).toISOString())
        .lt("created_at", new Date(now.getTime() - 30 * 86400 * 1000).toISOString());

      const prevDelivered   = (precedente ?? []).filter((m) => m.status === "delivered").length;
      const prevOutbound    = (precedente ?? []).filter((m) => m.direction === "outbound").length;
      const tassoPrec       = prevOutbound > 0 ? (prevDelivered / prevOutbound) * 100 : 0;

      // Oggi e settimana
      const inviatoOggi      = outbound.filter((m) => m.created_at >= todayStart.toISOString()).length;
      const inviatoSettimana = outbound.filter((m) => m.created_at >= weekStart.toISOString()).length;

      const tassoConsegna = outbound.length > 0
        ? (delivered.length / outbound.length) * 100
        : 0;

      return {
        totaleInviati:           outbound.length,
        totaleConsegnati:        delivered.length,
        totaleRicevuti:          inbound.length,
        totaleFalliti:           failed.length,
        tassoConsegna:           Math.round(tassoConsegna * 10) / 10,
        tassoConsegnaPrecedente: Math.round(tassoPrec * 10) / 10,
        inviatoOggi,
        inviatoSettimana,
      };
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}
