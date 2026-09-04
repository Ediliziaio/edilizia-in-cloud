import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";

import { ConfermaQuantita, useConfermaQuantita } from "@/components/shared/ConfermaQuantita";
interface CostsDialogsProps {
  // Delete confirm
  deleteConfirmId: string | null;
  onDeleteConfirmChange: (id: string | null) => void;
  onDeleteConfirm: (id: string) => void;

  // Group delete
  deleteGroupName: string | null;
  onDeleteGroupChange: (name: string | null) => void;
  onDeleteGroupConfirm: (name: string) => void;
  costNameCounts: Map<string, number>;

  // Bulk delete
  bulkDeleteConfirm: boolean;
  onBulkDeleteChange: (open: boolean) => void;
  onBulkDeleteConfirm: () => void;
  selectedCount: number;

  // Payment dialog
  payDialogOpen: boolean;
  onPayDialogChange: (open: boolean) => void;
  payingCostId: string | null;
  paymentDate: string;
  onPaymentDateChange: (date: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  onPaymentConfirm: () => void;
  isPaymentPending: boolean;

  // Task dialog
  taskCostId: string | null;
  onTaskDialogChange: (open: boolean) => void;
}

export function CostsDialogs({
  deleteConfirmId,
  onDeleteConfirmChange,
  onDeleteConfirm,
  deleteGroupName,
  onDeleteGroupChange,
  onDeleteGroupConfirm,
  costNameCounts,
  bulkDeleteConfirm,
  onBulkDeleteChange,
  onBulkDeleteConfirm,
  selectedCount,
  payDialogOpen,
  onPayDialogChange,
  payingCostId,
  paymentDate,
  onPaymentDateChange,
  paymentMethod,
  onPaymentMethodChange,
  onPaymentConfirm,
  isPaymentPending,
  taskCostId,
  onTaskDialogChange,
}: CostsDialogsProps) {
  const conferma = useConfermaQuantita(selectedCount, bulkDeleteConfirm);
  return (
    <>
      {/* Delete Confirm */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => onDeleteConfirmChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo costo?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteConfirmId) onDeleteConfirm(deleteConfirmId); onDeleteConfirmChange(null); }}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Group Confirm */}
      <AlertDialog open={!!deleteGroupName} onOpenChange={() => onDeleteGroupChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare tutti i costi "{deleteGroupName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare {costNameCounts.get(deleteGroupName || "") || 0} costi con il nome "{deleteGroupName}". Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteGroupName) onDeleteGroupConfirm(deleteGroupName); }}>
              Elimina tutti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirm */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={onBulkDeleteChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {selectedCount} costi selezionati?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          {/* Sono dati che entrano nei margini: cancellarne un blocco per
              sbaglio sposta i conti di ogni commessa collegata. */}
          <ConfermaQuantita stato={conferma} cosa="costi" />
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                if (!conferma.valida) { e.preventDefault(); return; }
                onBulkDeleteConfirm();
              }}
              disabled={!conferma.valida}
            >
              Elimina selezionati
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={(open) => { if (!open) onPayDialogChange(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registra Pagamento</DialogTitle>
            <DialogDescription>Seleziona data e metodo di pagamento.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label>Data pagamento</Label>
              <Input type="date" value={paymentDate} onChange={(e) => onPaymentDateChange(e.target.value)} className="mt-2" />
            </div>
            <div>
              <Label className="mb-2 block">Metodo di pagamento</Label>
              <RadioGroup value={paymentMethod} onValueChange={onPaymentMethodChange} className="grid grid-cols-3 gap-2">
                {[
                  { value: "bonifico", label: "Bonifico" },
                  { value: "contanti", label: "Contanti" },
                  { value: "carta", label: "Carta" },
                  { value: "rid", label: "RID" },
                  { value: "assegno", label: "Assegno" },
                  { value: "altro", label: "Altro" },
                ].map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`pm-${opt.value}`} />
                    <Label htmlFor={`pm-${opt.value}`} className="text-sm cursor-pointer">{opt.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onPayDialogChange(false)}>Annulla</Button>
            <Button onClick={onPaymentConfirm} disabled={!paymentDate || isPaymentPending}>
              {isPaymentPending ? "Salvataggio..." : "Conferma Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task dialog for cost */}
      <Dialog open={!!taskCostId} onOpenChange={(v) => { if (!v) onTaskDialogChange(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Task collegate</DialogTitle>
            <DialogDescription>Attività collegate a questo costo</DialogDescription>
          </DialogHeader>
          {taskCostId && <LinkedTasks costId={taskCostId} category="costi" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
