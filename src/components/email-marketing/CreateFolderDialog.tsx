import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
  isPending?: boolean;
}

export function CreateFolderDialog({ open, onOpenChange, onConfirm, isPending }: CreateFolderDialogProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuova cartella</DialogTitle>
          <DialogDescription>Inserisci il nome della nuova cartella</DialogDescription>
        </DialogHeader>
        <div>
          <Label>Nome cartella</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Promozioni"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                onConfirm(name.trim());
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => onConfirm(name.trim())} disabled={!name.trim() || isPending}>
            {isPending ? "Creazione..." : "Crea cartella"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
