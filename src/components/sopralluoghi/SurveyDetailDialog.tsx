import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useRef } from "react";
import { SurveyWorkspace, type SurveyWorkspaceHandle } from "./SurveyWorkspace";

export function SurveyDetailDialog({
  surveyId,
  orderId,
  onClose,
}: {
  surveyId: string;
  orderId: string;
  onClose: () => void;
}) {
  const workspace = useRef<SurveyWorkspaceHandle>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (workspace.current) workspace.current.requestClose(onClose);
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
        <div className="min-h-0 flex-1 overflow-clip">
          <SurveyWorkspace
            ref={workspace}
            key={surveyId}
            surveyId={surveyId}
            expectedOrderId={orderId}
            embedded
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
