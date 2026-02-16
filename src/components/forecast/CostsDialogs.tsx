import { format } from "date-fns";
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
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import type { UnifiedCost } from "@/hooks/useCompanyCostsData";

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
  onPaymentConfirm,
  isPaymentPending,
  taskCostId,
  onTaskDialogChange,
}: CostsDialogsProps) {
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
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={onBulkDeleteConfirm}>Elimina selezionati</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={(open) => { if (!open) onPayDialogChange(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registra Pagamento</DialogTitle>
            <DialogDescription>Seleziona la data del pagamento.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Data pagamento</Label>
            <Input type="date" value={paymentDate} onChange={(e) => onPaymentDateChange(e.target.value)} className="mt-2" />
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
