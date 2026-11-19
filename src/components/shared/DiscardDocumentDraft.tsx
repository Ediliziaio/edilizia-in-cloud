import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DiscardDocumentDraft({ disabled, onDiscard, etichetta = "Annulla modifiche", descrizione }: {
  disabled?: boolean;
  onDiscard: () => void;
  etichetta?: string;
  descrizione?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{etichetta}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Scartare le modifiche alla bozza?</AlertDialogTitle>
          <AlertDialogDescription>
            {descrizione ?? "Ritroverai i valori con cui hai aperto il modello o quelli dell’ultimo salvataggio."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continua a modificare</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>Scarta modifiche</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
