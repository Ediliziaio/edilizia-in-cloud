import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, X } from "lucide-react";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditorPreviewDialog({ state, open, onOpenChange }: Props) {
  const { data: azienda } = useAnagraficaAzienda();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between shrink-0">
          <DialogTitle className="text-sm font-medium">
            Anteprima — {state.numero || "Documento"}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <Printer className="h-3 w-3 mr-1.5" />
              Stampa
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <Download className="h-3 w-3 mr-1.5" />
              PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/30 p-6 flex justify-center">
          <PreviewFattura documento={state} azienda={azienda ?? null} scale={0.85} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
