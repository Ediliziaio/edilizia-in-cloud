import { toast } from "sonner";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "../design/ContestoOperativo";
import { messaggioPiano, useImportaBusinessPlanPiano } from "@/hooks/useGeneralePiano";
import { ImportaBusinessPlan } from "./ImportaBusinessPlan";
import { useAuth } from "@/contexts/AuthContext";

export function ImportaBusinessPlanDialog({
  open,
  onOpenChange,
  generaleId,
  versioneId,
  vociEsistenti,
  onImportato,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generaleId: string;
  versioneId: string | null;
  vociEsistenti: number;
  onImportato?: (versioneId: string) => void;
}) {
  const aggiungi = useImportaBusinessPlanPiano(generaleId, versioneId);
  const { effectiveCompany } = useAuth();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!aggiungi.isPending) onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa business plan</DialogTitle>
          <DialogDescription>
            Scegli un solo scenario, controlla le voci e aggiungile alla bozza. Gli importi restano sulla
            commessa generale.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ImportaBusinessPlan
            companyId={effectiveCompany?.id ?? null}
            vociEsistenti={vociEsistenti}
            occupato={aggiungi.isPending}
            onAnnulla={() => onOpenChange(false)}
            onImporta={(voci, origine) => {
              aggiungi.mutate(
                { voci, origine },
                {
                  onSuccess: ({ ids, versioneId: id }) => {
                    toast.success(`${ids.length} voci aggiunte alla bozza`, {
                      description:
                        "Completa gli importi mancanti e il calendario prima di approvare il piano.",
                    });
                    onImportato?.(id);
                    onOpenChange(false);
                  },
                  onError: (e) => toast.error(messaggioPiano(e, "il business plan")),
                },
              );
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
