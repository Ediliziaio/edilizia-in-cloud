import type { SurveyDetail } from "@/lib/api/surveys";
import { buildSurveyReport } from "./report";
/** Same checklist as the PDF, including area/header photos; an empty survey is never complete. */
export function surveyCompletion(detail: SurveyDetail) {
  const report = buildSurveyReport(detail);
  const total =
    report.requiredCount +
    (detail.areas.length ? 0 : 1) +
    (detail.elements.length ? 0 : 1);
  return total ? Math.round((100 * report.completedCount) / total) : 100;
}
