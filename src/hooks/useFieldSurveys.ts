import { useQuery } from "@tanstack/react-query";
import { useIsCampo } from "@/hooks/useIsCampo";
import { fieldSurveyAccess } from "@/lib/surveys/fieldAccess";
import { supabase } from "@/integrations/supabase/client";

export function useFieldSurveyAccess(id: string | null = null) {
  const { isCampo, user, profile } = useIsCampo();
  return useQuery({
    queryKey: ["field-survey-access", profile?.company_id, user?.id, id],
    enabled: isCampo && !!user?.id && !!profile?.company_id,
    queryFn: () => fieldSurveyAccess(id),
    // 31/10/2026: era sempre scaduta e ogni 15 secondi (15.500 chiamate in 2 giorni,
    // 64 ms l'una). Un permesso non cambia ogni 15 secondi: 2 minuti.
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });
}
export type FieldSurveyListRow = {
  id: string;
  code: string | null;
  status: string;
  address: string | null;
  city: string | null;
  scheduled_at: string | null;
  field_review_note: string | null;
  updated_at?: string | null;
  template?: { name: string; category: string } | null;
  elements?: Array<{ count: number }>;
  media?: Array<{ count: number }>;
};
export function useFieldSurveys(enabled: boolean) {
  const { isCampo, user, profile } = useIsCampo();
  return useQuery({
    queryKey: ["field-surveys", profile?.company_id, user?.id],
    enabled: enabled && isCampo && !!user?.id && !!profile?.company_id,
    // Un sopralluogo assegnato compare entro un minuto (era ogni 15 secondi).
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("surveys" as never)
        .select(
          "id,code,status,address,city,scheduled_at,field_review_note,updated_at,template:survey_templates(name,category),elements:survey_elements(count),media:survey_media(count)",
        )
        .eq("company_id", profile!.company_id!)
        .is("deleted_at", null)
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (error) throw new Error("Sopralluoghi non disponibili. Riprova.");
      // RLS enforces authorization AND assignment. No user/company override in the URL.
      return (data ?? []) as unknown as FieldSurveyListRow[];
    },
  });
}
