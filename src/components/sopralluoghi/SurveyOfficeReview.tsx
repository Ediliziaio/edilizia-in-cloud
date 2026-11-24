import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reviewFieldSurvey } from "@/lib/surveys/fieldAccess";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSurveyAccess } from "@/contexts/SurveyAccessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { buildSurveyReport } from "@/lib/surveys/report";
import type { SurveyDetail } from "@/lib/api/surveys";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
function OfficeReviewForm({ detail }: { detail: SurveyDetail }) {
  const t = useT();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const report = buildSurveyReport(detail);
  const mutation = useMutation({
    mutationFn: (accept: boolean) =>
      reviewFieldSurvey(detail.survey.id, accept, note.trim()),
    onSuccess: (_, accept) => {
      setNote("");
      toast.success(
        accept ? t("Revisione registrata") : t("Rilievo restituito con il motivo"),
      );
      void qc.invalidateQueries({
        queryKey: ["sopralluogo", detail.survey.id],
      });
      void qc.invalidateQueries({ queryKey: ["field-survey-access"] });
      void qc.invalidateQueries({ queryKey: ["field-surveys"] });
      void qc.invalidateQueries({ queryKey: ["sopralluoghi-list"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section
      aria-label={t("Revisione finale dell’ufficio")}
      className="my-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4"
    >
      <h2 className="font-semibold">{t("Revisione finale dell’ufficio")}</h2>
      <p className="text-sm">
        {t("Controlla dati, foto e PDF prima di approvare. La revisione non è una certificazione automatica di conformità.")}
      </p>
      <p className="text-sm text-orange-900">{t("Da controllare: {missingFields} campi obbligatori e {missingPhotos} foto richieste mancanti.", { missingFields: report.missingFields, missingPhotos: report.missingPhotos })}</p>
      <label className="block text-sm" htmlFor="survey-review-note">
        {t("Esito della verifica o motivo della restituzione")}
      </label>
      <Textarea
        id="survey-review-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={mutation.isPending}
        className="rounded-xl"
        placeholder={t("Indica cosa hai verificato o cosa va integrato…")}
      />
      {mutation.isError && (
        <p role="alert" className="text-sm text-red-700">
          {mutation.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-11 rounded-xl"
          disabled={note.trim().length < 5 || mutation.isPending}
          onClick={() => mutation.mutate(false)}
        >
          {t("Restituisci per integrazione")}
        </Button>
        <Button
          className="min-h-11 rounded-xl"
          disabled={note.trim().length < 5 || mutation.isPending}
          onClick={() => mutation.mutate(true)}
        >
          {t("Conferma revisione dell’ufficio")}
        </Button>
      </div>
    </section>
  );
}

export function SurveyOfficeReview({ detail }: { detail: SurveyDetail }) {
  // Il riquadro per l'operaio si traduce; il modulo di revisione dell'ufficio resta in italiano.
  const t = useT();
  const access = useSurveyAccess(),
    permissions = usePermissions(),
    status = detail.survey.status;
  const feedback = (
    detail.survey as typeof detail.survey & {
      field_review_note?: string | null;
    }
  ).field_review_note;
  if (access.field)
    return (
      <section className="my-3 rounded-2xl border bg-blue-50 p-3 text-sm sm:p-4">
        <p className="font-semibold">
          {status === "completed"
            ? t("Consegnato: in attesa dell’ufficio")
            : status === "reviewed"
              ? t("Revisionato dall’ufficio")
              : t("Compilazione sul posto")}
        </p>
        <p className="mt-1">
          {access.canEdit
            ? t("Compila misure, foto e posizionamenti, poi consegna all’ufficio.")
            : t("Misure, foto e PDF restano consultabili. Modifiche solo dopo restituzione dell’ufficio.")}
        </p>
        {feedback && (
          <p className="mt-2 whitespace-pre-wrap">
            <strong>{t("Ultimo riscontro dell’ufficio:")}</strong> <span dir="auto">{feedback}</span>
          </p>
        )}
      </section>
    );
  if (
    status !== "completed" ||
    permissions.solaLettura ||
    !permissions.canViewSopralluoghi
  )
    return null;

  return <OfficeReviewForm detail={detail} />;
}
