import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { lazy, Suspense, useRef, useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import type { SurveyEditorHandle } from "@/pages/azienda/sopralluoghi/SopralluogoEditor";
import { SurveyWorkspace, type SurveyWorkspaceHandle } from "./SurveyWorkspace";
const SurveyEditorForm = lazy(() => import("@/pages/azienda/sopralluoghi/SopralluogoEditor").then(m => ({default:m.SurveyEditorForm})));

export function SurveyDetailDialog({
  surveyId,
  orderId,
  onClose, initialEditing = false,
}: {
  surveyId: string;
  orderId: string;
  onClose: () => void;
  initialEditing?: boolean;
}) {
  const workspace = useRef<SurveyWorkspaceHandle>(null);
  const editor = useRef<SurveyEditorHandle>(null);
  const { solaLettura } = usePermissions();
  const [editing, setEditing] = useState(initialEditing);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (editing && !solaLettura && !editor.current) return;
          if (editing && editor.current) editor.current.requestClose(onClose);
          else if (workspace.current) workspace.current.requestClose(onClose);
          else onClose();
        }
      }}
    >
      <DialogContent className="flex h-[94dvh] max-h-[94dvh] w-[96vw] max-w-[1440px] flex-col overflow-clip rounded-2xl p-0 [&>button]:z-30 [&>button]:grid [&>button]:h-8 [&>button]:w-8 [&>button]:place-items-center [&>button]:rounded-full [&>button]:bg-slate-100">
        <DialogHeader className="sr-only">
          <DialogTitle>Sopralluogo della commessa</DialogTitle>
          <DialogDescription>
            Dati, misure, foto, note, firma e documento PDF senza uscire dalla
            commessa.
          </DialogDescription>
        </DialogHeader>
        <div className={editing ? "min-h-0 flex-1 overflow-y-auto" : "min-h-0 flex-1 overflow-clip"}>
          {editing && !solaLettura ? <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Apro la compilazione…</p>}><SurveyEditorForm ref={editor} id={surveyId} expectedOrderId={orderId} embedded onBack={() => setEditing(false)} /></Suspense> : <SurveyWorkspace
            ref={workspace}
            key={surveyId}
            surveyId={surveyId}
            expectedOrderId={orderId}
            embedded
            onEdit={solaLettura ? undefined : () => setEditing(true)}
          />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
