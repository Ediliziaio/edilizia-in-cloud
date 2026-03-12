import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export function usePhoneNumbers(companyId: string | null) {
  return useQuery({
    queryKey: ["virtual-phone-numbers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("virtual_phone_numbers")
        .select("*, assigned_profile:profiles!virtual_phone_numbers_assigned_to_fkey(id, first_name, last_name, email)")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("purchased_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useCompanyProfiles(companyId: string | null) {
  return useQuery({
    queryKey: ["company-profiles-for-phone", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!)
        .order("first_name");

      if (error) throw error;
      return data;
    },
  });
}

export function useSearchAvailableNumbers() {
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const search = async (params: { country_code?: string; prefix?: string; limit?: number }) => {
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("telnyx-proxy", {
        body: {
          action: "list_available_numbers",
          payload: {
            country_code: params.country_code || "IT",
            prefix: params.prefix || "",
            limit: params.limit || 20,
          },
        },
      });
      if (error) throw error;
      setResults(data?.numbers || []);
      return data?.numbers || [];
    } catch (err: any) {
      toast.error("Errore nella ricerca numeri: " + (err.message || "Errore sconosciuto"));
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  return { results, isSearching, search, setResults };
}

export function usePurchaseNumber(companyId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      phone_number: string;
      monthly_cost?: number;
      label?: string;
      country_code?: string;
      number_type?: string;
      capabilities?: Record<string, boolean>;
    }) => {
      // 1. Buy on Telnyx
      const { data: telnyxResult, error: telnyxErr } = await supabase.functions.invoke("telnyx-proxy", {
        body: {
          action: "buy_number",
          payload: {
            phone_number: params.phone_number,
            monthly_cost: params.monthly_cost || 0,
            label: params.label || null,
          },
        },
      });
      if (telnyxErr) throw telnyxErr;

      // 2. Save in virtual_phone_numbers
      const { error: dbErr } = await supabase.from("virtual_phone_numbers").insert({
        company_id: companyId!,
        phone_number: params.phone_number,
        friendly_name: params.label || null,
        telnyx_phone_id: telnyxResult?.order?.phone_numbers?.[0]?.id || null,
        country_code: params.country_code || "IT",
        number_type: params.number_type || "local",
        capabilities: params.capabilities || { sms: true, voice: false },
        monthly_cost_eur: params.monthly_cost || 0,
      });
      if (dbErr) throw dbErr;

      return telnyxResult;
    },
    onSuccess: () => {
      toast.success("Numero acquistato con successo");
      queryClient.invalidateQueries({ queryKey: ["virtual-phone-numbers"] });
    },
    onError: (err: any) => {
      toast.error("Errore acquisto numero: " + (err.message || "Errore sconosciuto"));
    },
  });
}

export function useReleaseNumber(companyId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; telnyx_phone_id: string | null }) => {
      // 1. Release on Telnyx if we have the ID
      if (params.telnyx_phone_id) {
        const { error: telnyxErr } = await supabase.functions.invoke("telnyx-proxy", {
          body: {
            action: "release_number",
            payload: { phone_number_id: params.telnyx_phone_id },
          },
        });
        if (telnyxErr) throw telnyxErr;
      }

      // 2. Mark as inactive in DB
      const { error: dbErr } = await supabase
        .from("virtual_phone_numbers")
        .update({ is_active: false, released_at: new Date().toISOString() })
        .eq("id", params.id);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      toast.success("Numero rilasciato con successo");
      queryClient.invalidateQueries({ queryKey: ["virtual-phone-numbers"] });
    },
    onError: (err: any) => {
      toast.error("Errore rilascio numero: " + (err.message || "Errore sconosciuto"));
    },
  });
}

export function useAssignNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; assigned_to: string | null }) => {
      const { error } = await supabase
        .from("virtual_phone_numbers")
        .update({ assigned_to: params.assigned_to, updated_at: new Date().toISOString() })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assegnazione aggiornata");
      queryClient.invalidateQueries({ queryKey: ["virtual-phone-numbers"] });
    },
    onError: (err: any) => {
      toast.error("Errore assegnazione: " + (err.message || "Errore sconosciuto"));
    },
  });
}
