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
function OfficeReviewForm({ detail }: { detail: SurveyDetail }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const report = buildSurveyReport(detail);
  const mutation = useMutation({
    mutationFn: (accept: boolean) =>
      reviewFieldSurvey(detail.survey.id, accept, note.trim()),
    onSuccess: (_, accept) => {
      setNote("");
      toast.success(
        accept ? "Revisione registrata" : "Rilievo restituito con il motivo",
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
      aria-label="Revisione finale dell’ufficio"
      className="my-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4"
    >
      <h2 className="font-semibold">Revisione finale dell’ufficio</h2>
      <p className="text-sm">
        Controlla dati, foto e PDF prima di approvare. La revisione non è una
        certificazione automatica di conformità.
      </p>
      <p className="text-sm text-orange-900">
        Da controllare: {report.missingFields} campi obbligatori e{" "}
        {report.missingPhotos} foto richieste mancanti.
      </p>
      <label className="block text-sm" htmlFor="survey-review-note">
        Esito della verifica o motivo della restituzione
      </label>
      <Textarea
        id="survey-review-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={mutation.isPending}
        className="rounded-xl"
        placeholder="Indica cosa hai verificato o cosa va integrato…"
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
          Restituisci per integrazione
        </Button>
        <Button
          className="min-h-11 rounded-xl"
          disabled={note.trim().length < 5 || mutation.isPending}
          onClick={() => mutation.mutate(true)}
        >
          Conferma revisione dell’ufficio
        </Button>
      </div>
    </section>
  );
}

export function SurveyOfficeReview({ detail }: { detail: SurveyDetail }) {
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
            ? "Consegnato: in attesa dell’ufficio"
            : status === "reviewed"
              ? "Revisionato dall’ufficio"
              : "Compilazione sul posto"}
        </p>
        <p className="mt-1">
          {access.canEdit
            ? "Compila misure, foto e posizionamenti, poi consegna all’ufficio."
            : "Misure, foto e PDF restano consultabili. Modifiche solo dopo restituzione dell’ufficio."}
        </p>
        {feedback && (
          <p className="mt-2 whitespace-pre-wrap">
            <strong>Ultimo riscontro dell’ufficio:</strong> {feedback}
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
