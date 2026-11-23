import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Scadenza } from "@/hooks/useScadenzario";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  scadenza: Scadenza | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
  isPending: boolean;
}

export function AnnullaIncassoDialog({ scadenza, onClose, onConfirm, isPending }: Props) {
  const t = useT();
  return (
    <AlertDialog open={!!scadenza} onOpenChange={(aperto) => { if (!aperto && !isPending) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Annullare l'incasso di {importo}?", { importo: formatCurrency(scadenza?.paid_amount ?? 0) })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("«{descrizione}» torna da incassare e il movimento sparisce dalla prima nota.", { descrizione: scadenza?.description ?? "" })}
            {scadenza?.invoice_id ? ` ${t("Se la fattura è importata da XML, si riaprono anche lei e la rata della commessa.")}` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("Lascia così")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => { e.preventDefault(); if (scadenza) onConfirm(scadenza.id); }}
          >
            {t("Annulla incasso")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
