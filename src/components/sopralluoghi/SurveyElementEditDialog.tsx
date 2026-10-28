import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SurveyDetail } from "@/lib/api/surveys";
import type { SurveyElementRow } from "@/types/surveys";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  SurveyElementEditor,
  type SurveyEditState,
  type SurveyElementEditorHandle,
} from "./SurveyElementEditor";
import { nextSurveyElement } from "@/lib/surveys/elementWorkflow";

/** The full editor uses the same element form/save/recovery path as the commessa popup. */
export function SurveyElementEditDialog({
  detail,
  element,
  onClose,
  onNextElement,
}: {
  detail: SurveyDetail;
  element: SurveyElementRow;
  onClose: () => void;
  onNextElement?: (element: SurveyElementRow) => void;
}) {
  const editor = useRef<SurveyElementEditorHandle>(null);
  const next = nextSurveyElement(detail, element.id);
  const [keepFailed, setKeepFailed] = useState(false);
  const [state, setState] = useState<SurveyEditState>({
      dirty: false,
      saving: false,
    }),
    [confirm, setConfirm] = useState(false);
  function close() {
    if (state.saving) return;
    if (state.dirty) {
      setKeepFailed(false);
      setConfirm(true);
    } else onClose();
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="flex h-[94dvh] max-h-[94dvh] w-[96vw] max-w-6xl flex-col overflow-clip rounded-2xl p-0">
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>
              {element.element_label ||
                detail.template.schema.element_types.find(
                  (t) => t.key === element.element_type,
                )?.label ||
                "Scheda elemento"}
            </DialogTitle>
            <DialogDescription>
              Misure, disegno e dettagli. Le modifiche entrano nel rilievo
              soltanto con Salva.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <SurveyElementEditor
              ref={editor}
              key={`${element.id}:${element.updated_at}`}
              detail={detail}
              element={element}
              onStateChange={setState}
              onCancel={close}
              onSaved={onClose}
              onNext={
                next && onNextElement ? () => onNextElement(next) : undefined
              }
              nextLabel={
                next?.element_label ||
                detail.template.schema.element_types.find(
                  (t) => t.key === next?.element_type,
                )?.label
              }
            />
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hai modifiche non salvate</AlertDialogTitle>
            <AlertDialogDescription>
              Puoi continuare, conservare la bozza su questo browser o
              scartarla. I dati già salvati non cambiano.
            </AlertDialogDescription>
            {keepFailed && (
              <p role="alert" className="text-sm text-orange-900">
                La bozza non può essere conservata completamente. Torna alla
                scheda: controlla le foto ancora da caricare e gli avvisi sul
                salvataggio locale.
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua a modificare</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (editor.current?.keepDraft()) {
                  setConfirm(false);
                  onClose();
                } else setKeepFailed(true);
              }}
            >
              Conserva bozza e chiudi
            </Button>
            <AlertDialogAction
              onClick={() => {
                editor.current?.discardDraft();
                setConfirm(false);
                onClose();
              }}
            >
              Scarta modifiche
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
