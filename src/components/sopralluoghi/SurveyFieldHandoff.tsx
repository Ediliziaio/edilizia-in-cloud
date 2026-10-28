import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { submitFieldSurvey } from "@/lib/surveys/fieldAccess";
import { surveyCompletion } from "@/lib/surveys/completion";
import type { SurveyDetail } from "@/lib/api/surveys";
import { toast } from "sonner";
/** A single hand-off action from the read/element-edit workspace, no detour through general settings. */
export function SurveyFieldHandoff({
  detail,
  disabled = false,
  compact = false,
}: {
  detail: SurveyDetail;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false),
    qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => submitFieldSurvey(detail.survey.id),
    onSuccess: () => {
      setOpen(false);
      toast.success("Consegnato all’ufficio");
      void qc.invalidateQueries({
        queryKey: ["sopralluogo", detail.survey.id],
      });
      void qc.invalidateQueries({ queryKey: ["field-survey-access"] });
      void qc.invalidateQueries({ queryKey: ["field-surveys"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <Button
        className="min-h-11 rounded-xl px-3"
        aria-label="Consegna all’ufficio"
        disabled={disabled || mutation.isPending || !detail.elements.length}
        onClick={() => setOpen(true)}
      >
        {compact ? "Consegna" : "Consegna all’ufficio"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Consegnare il rilievo?</AlertDialogTitle>
            <AlertDialogDescription>
              Compilazione al {surveyCompletion(detail)}%. I dati mancanti
              restano segnalati. Dopo la consegna puoi consultare foto,
              posizionamenti e PDF, ma solo l’ufficio può restituirti il rilievo
              per modificarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              Continua a compilare
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={disabled || mutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              Conferma consegna
            </AlertDialogAction>
          </AlertDialogFooter>
          {mutation.isError && (
            <p role="alert" className="text-sm text-red-700">
              {mutation.error.message}
            </p>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
