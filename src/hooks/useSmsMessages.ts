/**
 * @file useSmsMessages.ts
 * @description Hook per la lista messaggi SMS transazionali con filtri e paginazione.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { SmsMessage, SmsMessageFiltri } from "@/types/sms";

const PAGE_SIZE = 30;

interface UseSmsMessagesOptions {
  filtri?: SmsMessageFiltri;
  page?: number;
}

interface UseSmsMessagesResult {
  messages: SmsMessage[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
}

export function useSmsMessages({
  filtri = {},
  page = 1,
}: UseSmsMessagesOptions = {}): UseSmsMessagesResult {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["sms-messages", companyId, filtri, page],
    queryFn: async (): Promise<{ messages: SmsMessage[]; totalCount: number }> => {
      let query = supabase
        .from("sms_messages")
        .select(
          "id, company_id, direction, status, to_number, from_number, body, telnyx_id, trigger_type, trigger_ref, trigger_entity, error_message, sent_at, delivered_at, received_at, created_by, created_at, updated_at",
          { count: "exact" }
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (filtri.status) {
        query = query.eq("status", filtri.status);
      }
      if (filtri.direction) {
        query = query.eq("direction", filtri.direction);
      }
      if (filtri.dateFrom) {
        query = query.gte("created_at", filtri.dateFrom);
      }
      if (filtri.dateTo) {
        query = query.lte("created_at", filtri.dateTo);
      }
      if (filtri.search) {
        query = query.or(
          `to_number.ilike.%${filtri.search}%,from_number.ilike.%${filtri.search}%,body.ilike.%${filtri.search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        messages: (data ?? []) as SmsMessage[],
        totalCount: count ?? 0,
      };
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  return {
    messages: data?.messages ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    isError,
    hasNextPage: (data?.totalCount ?? 0) > page * PAGE_SIZE,
  };
}
