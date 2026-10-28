import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { SurveyDetail } from "@/lib/api/surveys";
import type { SurveyElementRow } from "@/types/surveys";
import { surveyElementPatch, type SurveyElementDraft } from "./workspace";

/** Same authenticated client/RLS as the editor; scope and compare the row version. */
export async function saveSurveyElement(
  detail: SurveyDetail,
  element: SurveyElementRow,
  draft: SurveyElementDraft,
  companyId: string,
): Promise<SurveyElementRow> {
  if (
    !companyId ||
    detail.survey.company_id !== companyId ||
    element.survey_id !== detail.survey.id ||
    !detail.elements.some((e) => e.id === element.id) ||
    !element.updated_at
  )
    throw new Error("L’elemento non appartiene al sopralluogo aperto.");
  const patch = surveyElementPatch(detail, element, draft);
  const values = JSON.parse(
    JSON.stringify(patch.values, (_, value) => {
      if (
        (typeof value === "number" && !Number.isFinite(value)) ||
        ["bigint", "function", "symbol"].includes(typeof value)
      )
        throw new Error("Uno dei valori non è valido per il salvataggio.");
      return value;
    }),
  ) as Json;
  const { data: survey, error: readError } = await supabase
    .from("surveys")
    .select("id,company_id,client_signature_at,status")
    .eq("id", detail.survey.id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (readError || !survey)
    throw new Error(
      "Sopralluogo non disponibile o permessi modificati. Ricarica e riprova.",
    );
  if (survey.client_signature_at || survey.status === "signed")
    throw new Error(
      "Il sopralluogo contiene una firma. Non modifico il rilievo sottoscritto.",
    );
  const { data, error } = await supabase
    .from("survey_elements")
    .update({ ...patch, values })
    .eq("id", element.id)
    .eq("survey_id", detail.survey.id)
    .eq("updated_at", element.updated_at)
    .select("*")
    .maybeSingle();
  if (error)
    throw new Error(
      "Salvataggio non riuscito. Le modifiche restano aperte: riprova.",
    );
  if (!data)
    throw new Error(
      "L’elemento è stato aggiornato da un’altra sessione oppure non è più modificabile. Annulla, ricarica il rilievo e riprova: nessun dato è stato sovrascritto.",
    );
  return data as SurveyElementRow;
}
