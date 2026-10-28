import sql from "../../../supabase/migrations/20260511150000_survey_template_infissi_v4.sql?raw";
import type { TemplateSchema } from "@/types/surveys";
import { makeSurveyDetail } from "./surveyDetail";

// Test the actual shipped v4 template, including its cm units and global finishes.
export function makeWindowSurveyDetail() {
  const detail = makeSurveyDetail();
  detail.template.schema = JSON.parse(sql.split("$sch$")[1]) as TemplateSchema;
  detail.elements[0].element_type = "infisso";
  detail.elements[0].values = {
    tipologia: "finestra_2ante",
    apertura: "battente_dx",
    materiale_richiesto: "pvc",
    larghezza_foro: 120,
    altezza_foro: 140,
    tipo_telaio: "l",
    vetro: "doppio_camera",
    complementi: [],
  };
  detail.survey.header_data = {
    colore_interno_infissi: "RAL 9010",
    colore_esterno_infissi: "RAL 7016",
  };
  return detail;
}
