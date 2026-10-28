import type { FieldSurveyListRow } from "@/hooks/useFieldSurveys";
export type FieldSurveyFilter = "all" | "todo" | "office" | "done";
export const fieldSurveyGroup = (
  status: string,
): Exclude<FieldSurveyFilter, "all"> =>
  status === "completed"
    ? "office"
    : ["draft", "in_progress"].includes(status)
      ? "todo"
      : "done";
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .trim();
export function filterFieldSurveys(
  rows: FieldSurveyListRow[],
  filter: FieldSurveyFilter,
  query: string,
) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return rows.filter(
    (s) =>
      (filter === "all" || fieldSurveyGroup(s.status) === filter) &&
      terms.every((term) =>
        normalize(
          [s.code, s.address, s.city, s.template?.name]
            .filter(Boolean)
            .join(" "),
        ).includes(term),
      ),
  );
}
