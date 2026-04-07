import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Tipo principale ──────────────────────────────────────

export interface DunningTemplate {
  id: string;
  step_number: number;
  step_name: string;
  trigger_days_overdue: number;
  subject: string;
  body_html: string;
  body_text: string;
  is_active: boolean;
  /** Variabili disponibili per la sostituzione nel template */
  variables: { available: string[] };
  updated_at: string;
  updated_by: string | null;
}

/** Payload per aggiornamento template */
export interface UpdateDunningTemplatePayload {
  id: string;
  subject: string;
  body_html: string;
  body_text: string;
  is_active: boolean;
}

// ─── Chiave query condivisa ───────────────────────────────

const QUERY_KEY = ["dunning-templates"] as const;

// ─── Lista template ───────────────────────────────────────

/** Hook per caricare tutti i template dunning ordinati per step_number */
export function useDunningTemplatesList() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<DunningTemplate[]> => {
      const { data, error } = await supabase
        .from("dunning_email_templates")
        .select(
          "id, step_number, step_name, trigger_days_overdue, subject, body_html, body_text, is_active, variables, updated_at, updated_by"
        )
        .order("step_number", { ascending: true });

      if (error) throw new Error("Impossibile caricare i template dunning: " + error.message);

      // Normalizza il campo variables (può essere null o JSON grezzo)
      return (data ?? []).map((row) => {
        const raw = row as Record<string, unknown>;
        const vars =
          raw.variables !== null &&
          typeof raw.variables === "object" &&
          !Array.isArray(raw.variables)
            ? (raw.variables as { available?: string[] })
            : {};

        return {
          id: raw.id as string,
          step_number: raw.step_number as number,
          step_name: raw.step_name as string,
          trigger_days_overdue: raw.trigger_days_overdue as number,
          subject: raw.subject as string,
          body_html: raw.body_html as string,
          body_text: raw.body_text as string,
          is_active: raw.is_active as boolean,
          variables: { available: vars.available ?? [] },
          updated_at: raw.updated_at as string,
          updated_by: (raw.updated_by as string | null) ?? null,
        };
      });
    },
    staleTime: 2 * 60 * 1000, // 2 minuti
  });
}

// ─── Aggiornamento template ───────────────────────────────

/** Hook mutation per aggiornare un template dunning */
export function useUpdateDunningTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateDunningTemplatePayload): Promise<void> => {
      const { error } = await supabase
        .from("dunning_email_templates")
        .update({
          subject: payload.subject,
          body_html: payload.body_html,
          body_text: payload.body_text,
          is_active: payload.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Template salvato con successo");
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: () => {
      toast.error("Errore salvataggio template");
    },
  });
}
