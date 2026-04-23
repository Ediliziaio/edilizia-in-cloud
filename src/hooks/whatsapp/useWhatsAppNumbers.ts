// MP04 — Hook React Query per gestione multi-numero WhatsApp.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";
import type { Database, Json } from "@/integrations/supabase/types";

export type WANumber = Database["public"]["Tables"]["ai_whatsapp_numbers"]["Row"];

export type WAPurpose =
  | "bot_operativo"
  | "assistenza"
  | "lead"
  | "marketing"
  | "notifiche";

export const PURPOSE_LABELS: Record<WAPurpose, string> = {
  bot_operativo: "Bot Operativo Cantiere",
  assistenza: "Assistenza Clienti",
  lead: "Lead Generation",
  marketing: "Marketing / Broadcast",
  notifiche: "Notifiche Transazionali",
};

export const PURPOSE_DESCRIPTIONS: Record<WAPurpose, string> = {
  bot_operativo: "Operai inviano rapportini, DDT, foto. Titolare interroga dati.",
  assistenza: "Clienti aprono ticket, chiedono stato lavori.",
  lead: "Qualifica lead da campagne ads.",
  marketing: "Invia broadcast con template approvati.",
  notifiche: "Alert automatici (scadenze, margini, pagamenti).",
};

const WA_NUMBERS_KEY = ["whatsapp", "numbers"] as const;

export function useWhatsAppNumbers() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: [...WA_NUMBERS_KEY, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_whatsapp_numbers")
        .select(
          "id, company_id, purpose, display_name, nome_account, numero, phone_number_id, waba_id, agent_id, stato, webhook_verified, messaggio_benvenuto, messaggio_fuori_orario, orario_attivo, daily_budget_eur, current_day_spend_eur, creato_il, updated_at",
        )
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("creato_il", { ascending: true });
      if (error) throw error;
      return data as WANumber[];
    },
  });
}

export function useWhatsAppNumber(id: string | undefined) {
  return useQuery({
    queryKey: [...WA_NUMBERS_KEY, "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_whatsapp_numbers")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useWhatsAppNumbersByPurpose() {
  const query = useWhatsAppNumbers();
  const byPurpose = (query.data ?? []).reduce<Record<WAPurpose, WANumber[]>>(
    (acc, n) => {
      const p = n.purpose as WAPurpose;
      if (!acc[p]) acc[p] = [];
      acc[p].push(n);
      return acc;
    },
    { bot_operativo: [], assistenza: [], lead: [], marketing: [], notifiche: [] },
  );
  return { ...query, byPurpose };
}

export function useDeleteWANumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_whatsapp_numbers")
        .update({ deleted_at: new Date().toISOString(), stato: "removed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WA_NUMBERS_KEY });
      toast.success("Numero rimosso.");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}

export interface WANumberUpdate {
  id: string;
  display_name?: string | null;
  messaggio_benvenuto?: string | null;
  messaggio_fuori_orario?: string | null;
  orario_attivo?: Json | null;
  daily_budget_eur?: number | null;
  agent_id?: string | null;
}

export interface ConnectPayload {
  purpose: WAPurpose;
  phone_number: string;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  display_name?: string;
  nome_account?: string;
}

export function useConnectWANumber() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ConnectPayload) => {
      // Chiama whatsapp-connect edge function. Nota: il flusso "canonico"
      // in MP01 richiede `code` OAuth Meta. Per inserimento manuale (debug
      // / staging) facciamo upsert diretto via client — il service_role
      // non è usabile da client. In produzione il wizard deve passare
      // dall'OAuth flow Meta Embedded Signup.
      const { data, error } = await supabase
        .from("ai_whatsapp_numbers")
        .upsert(
          {
            company_id: companyId!,
            purpose: payload.purpose,
            numero: payload.phone_number,
            phone_number_id: payload.phone_number_id,
            waba_id: payload.waba_id,
            access_token_encrypted: payload.access_token,
            display_name: payload.display_name ?? null,
            nome_account: payload.nome_account ?? payload.display_name ?? null,
            stato: "pending",
            webhook_verified: false,
            provider: "meta_cloud",
          },
          { onConflict: "company_id,purpose" },
        )
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...WA_NUMBERS_KEY, companyId] });
      toast.success("Numero WhatsApp registrato. Completa la verifica webhook.");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}

export function useUpdateWANumberSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WANumberUpdate) => {
      const { id, ...updates } = payload;
      const { error } = await supabase
        .from("ai_whatsapp_numbers")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WA_NUMBERS_KEY });
      toast.success("Impostazioni salvate.");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}
