import { supabase } from "@/integrations/supabase/client";

export type FieldSurveyAccess = { can_view: boolean; can_edit: boolean };
export async function fieldSurveyAccess(
  id: string | null,
): Promise<FieldSurveyAccess> {
  const { data, error } = await supabase.rpc(
    "survey_field_access" as never,
    { p_survey_id: id } as never,
  );
  if (error)
    throw new Error(
      "Impossibile verificare l’autorizzazione al sopralluogo. Riprova.",
    );
  const access = data as unknown as FieldSurveyAccess | null;
  return {
    can_view: access?.can_view === true,
    can_edit: access?.can_edit === true,
  };
}
export async function submitFieldSurvey(id: string) {
  const { error } = await supabase.rpc(
    "survey_submit_for_review" as never,
    { p_survey_id: id } as never,
  );
  if (error) throw new Error(error.message);
}
export async function reviewFieldSurvey(
  id: string,
  accept: boolean,
  note: string,
) {
  const { error } = await supabase.rpc(
    "survey_office_review" as never,
    { p_survey_id: id, p_accept: accept, p_note: note } as never,
  );
  if (error) throw new Error(error.message);
}
