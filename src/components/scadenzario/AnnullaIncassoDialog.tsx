import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Scadenza } from "@/hooks/useScadenzario";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  scadenza: Scadenza | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
  isPending: boolean;
}

export function AnnullaIncassoDialog({ scadenza, onClose, onConfirm, isPending }: Props) {
  return (
    <AlertDialog open={!!scadenza} onOpenChange={(aperto) => { if (!aperto && !isPending) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annullare l'incasso di {formatCurrency(scadenza?.paid_amount ?? 0)}?</AlertDialogTitle>
          <AlertDialogDescription>
            «{scadenza?.description}» torna da incassare e il movimento sparisce dalla prima nota.
            {scadenza?.invoice_id ? " Se la fattura è importata da XML, si riaprono anche lei e la rata della commessa." : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Lascia così</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => { e.preventDefault(); if (scadenza) onConfirm(scadenza.id); }}
          >
            Annulla incasso
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
