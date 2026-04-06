/**
 * @file useSmsAutomations.ts
 * @description Hook CRUD per le automazioni SMS transazionali.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { SmsAutomation, SmsAutomationFormData } from "@/types/sms";

const COLS =
  "id, company_id, nome, descrizione, trigger_evento, delay_minuti, template_body, tipo_destinatario, numero_custom, attiva, contatore_invii, ultima_esecuzione, created_by, created_at, updated_at";

export function useSmsAutomations() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const qKey = ["sms-automations", companyId];

  // ── List ──────────────────────────────────────────────────────
  const { data: automations = [], isLoading } = useQuery<SmsAutomation[]>({
    queryKey: qKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_automations")
        .select(COLS)
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SmsAutomation[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // ── Create ────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async (formData: SmsAutomationFormData) => {
      const { data, error } = await supabase
        .from("sms_automations")
        .insert({ ...formData, company_id: companyId })
        .select(COLS)
        .single();
      if (error) throw error;
      return data as SmsAutomation;
    },
    onSuccess: () => {
      toast.success("Automazione creata");
      queryClient.invalidateQueries({ queryKey: qKey });
    },
    onError: (err: Error) => {
      toast.error("Errore", { description: err.message });
    },
  });

  // ── Update ────────────────────────────────────────────────────
  const update = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: Partial<SmsAutomationFormData> }) => {
      const { data, error } = await supabase
        .from("sms_automations")
        .update(formData)
        .eq("id", id)
        .eq("company_id", companyId!)
        .select(COLS)
        .single();
      if (error) throw error;
      return data as SmsAutomation;
    },
    onSuccess: () => {
      toast.success("Automazione aggiornata");
      queryClient.invalidateQueries({ queryKey: qKey });
    },
    onError: (err: Error) => {
      toast.error("Errore", { description: err.message });
    },
  });

  // ── Toggle attiva ──────────────────────────────────────────────
  const toggleAttiva = useMutation({
    mutationFn: async ({ id, attiva }: { id: string; attiva: boolean }) => {
      const { error } = await supabase
        .from("sms_automations")
        .update({ attiva })
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onMutate: async ({ id, attiva }) => {
      queryClient.setQueryData<SmsAutomation[]>(qKey, (old = []) =>
        old.map((a) => (a.id === id ? { ...a, attiva } : a))
      );
    },
    onError: (err: Error) => {
      toast.error("Errore", { description: err.message });
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });

  // ── Delete ────────────────────────────────────────────────────
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sms_automations")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Automazione eliminata");
      queryClient.invalidateQueries({ queryKey: qKey });
    },
    onError: (err: Error) => {
      toast.error("Errore", { description: err.message });
    },
  });

  return {
    automations,
    isLoading,
    create: create.mutate,
    createAsync: create.mutateAsync,
    isCreating: create.isPending,
    update: update.mutate,
    isUpdating: update.isPending,
    toggleAttiva: toggleAttiva.mutate,
    remove: remove.mutate,
    isRemoving: remove.isPending,
  };
}
