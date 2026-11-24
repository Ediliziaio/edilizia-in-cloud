import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
  isPending?: boolean;
}

export function CreateFolderDialog({ open, onOpenChange, onConfirm, isPending }: CreateFolderDialogProps) {
  const t = useT();
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Nuova cartella")}</DialogTitle>
          <DialogDescription>{t("Inserisci il nome della nuova cartella")}</DialogDescription>
        </DialogHeader>
        <div>
          <Label>{t("Nome cartella")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Es. Promozioni")}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                onConfirm(name.trim());
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
          <Button onClick={() => onConfirm(name.trim())} disabled={!name.trim() || isPending}>
            {isPending ? t("Creazione...") : t("Crea cartella")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
