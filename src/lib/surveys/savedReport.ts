import type { SurveyRow } from "@/types/surveys";
import { supabase } from "@/integrations/supabase/client";
import { riconosciFile } from "@/lib/storage/fileRiservati";

/** Read the original only: never regenerate it or replace its stored URL. */
export async function resolveSavedSurveyReport(
  survey: Pick<SurveyRow, "id" | "company_id" | "pdf_report_url">,
) {
  const value = survey.pdf_report_url;
  if (!value || !/^https?:\/\//i.test(value))
    throw new Error("Documento archiviato non disponibile.");
  const ref = riconosciFile(value);
  if (!ref) return value;
  if (
    ref.bucket !== "surveys" ||
    ref.path
      .split("/")
      .some((part) => part === "." || part === ".." || part.includes("\\")) ||
    !ref.path.startsWith(`${survey.company_id}/${survey.id}/`)
  )
    throw new Error(
      "Il documento archiviato non appartiene a questo sopralluogo.",
    );
  const { data, error } = await supabase.storage
    .from("surveys")
    .createSignedUrl(ref.path, 3600);
  if (error || !data?.signedUrl)
    throw new Error("Non riesco ad aprire il documento archiviato. Riprova.");
  return data.signedUrl;
}
