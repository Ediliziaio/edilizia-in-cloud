import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { SurveyDetail } from "@/lib/api/surveys";
import type { SurveyElementRow } from "@/types/surveys";
import {
  surveyDuplicatePayload,
  type SurveyDuplicateRequest,
} from "./copyElement";

/** One insert; a stable client id lets a retry recover the same copy after a lost response. RLS remains active. */
export async function duplicateSurveyElement(
  detail: SurveyDetail,
  source: SurveyElementRow,
  request: SurveyDuplicateRequest,
  companyId: string,
): Promise<SurveyElementRow> {
  const payload = surveyDuplicatePayload(detail, source, request, companyId);
  const { data: survey, error: surveyError } = await supabase
    .from("surveys")
    .select("id,company_id,status,client_signature_at,deleted_at")
    .eq("id", detail.survey.id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (
    surveyError ||
    !survey ||
    survey.deleted_at ||
    survey.client_signature_at ||
    survey.status === "signed"
  )
    throw new Error(
      "Sopralluogo non disponibile, firmato o permessi modificati. Ricarica prima di duplicare.",
    );
  const readCopy = () =>
    supabase
      .from("survey_elements")
      .select("*")
      .eq("id", request.id)
      .eq("survey_id", detail.survey.id)
      .maybeSingle();
  const existing = await readCopy();
  if (existing.error)
    throw new Error(
      "Impossibile verificare la copia. Riprova senza cambiare scheda.",
    );
  if (existing.data) {
    const stored = existing.data.values as Record<string, unknown> | null;
    if (
      existing.data.area_id !== payload.area_id ||
      existing.data.element_type !== payload.element_type ||
      existing.data.element_label !== payload.element_label ||
      existing.data.quantity !== 1 ||
      !stored ||
      Array.isArray(stored) ||
      Object.keys(stored).length !== Object.keys(payload.values).length ||
      Object.keys(payload.values).some(
        (key) =>
          JSON.stringify(stored[key]) !== JSON.stringify(payload.values[key]),
      )
    )
      throw new Error(
        "Questa copia esiste già con dati diversi dalla richiesta. Ricarica il rilievo: non creo una seconda scheda.",
      );
    return existing.data as SurveyElementRow;
  }
  const { data: fresh, error: sourceError } = await supabase
    .from("survey_elements")
    .select("id,updated_at")
    .eq("id", source.id)
    .eq("survey_id", detail.survey.id)
    .eq("updated_at", source.updated_at)
    .maybeSingle();
  if (sourceError || !fresh)
    throw new Error(
      "L’originale è cambiato o non è più disponibile. Ricarica prima di copiare.",
    );
  const { data: area, error: areaError } = await supabase
    .from("survey_areas")
    .select("id")
    .eq("id", request.areaId)
    .eq("survey_id", detail.survey.id)
    .maybeSingle();
  if (areaError || !area)
    throw new Error("Ambiente non più disponibile. Ricarica il sopralluogo.");
  const { data, error } = await supabase
    .from("survey_elements")
    .insert({ ...payload, values: payload.values as Json })
    .select("*")
    .single();
  if (error || !data)
    throw new Error(
      "Copia non confermata. Riprova qui: verrà riutilizzato lo stesso identificativo, senza creare una seconda copia.",
    );
  return data as SurveyElementRow;
}
