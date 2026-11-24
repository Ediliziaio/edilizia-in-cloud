import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function DiscardDocumentDraft({ disabled, onDiscard, etichetta = "Annulla modifiche", descrizione }: {
  disabled?: boolean;
  onDiscard: () => void;
  etichetta?: string;
  descrizione?: string;
}) {
  const t = useT();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{t(etichetta)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Scartare le modifiche alla bozza?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {descrizione ?? t("Ritroverai i valori con cui hai aperto il modello o quelli dell’ultimo salvataggio.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Continua a modificare")}</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>{t("Scarta modifiche")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
