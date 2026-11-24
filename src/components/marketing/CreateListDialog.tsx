import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { name: string; description: string }) => Promise<void>;
  initialData?: { name: string; description: string };
  isEditing?: boolean;
}

export function CreateListDialog({ open, onOpenChange, onSave, initialData, isEditing }: CreateListDialogProps) {
  const t = useT();
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialData?.name || "");
    setDescription(initialData?.description || "");
  }, [initialData?.description, initialData?.name, open]);

  const handleOpen = (o: boolean) => {
    if (o) {
      setName(initialData?.name || "");
      setDescription(initialData?.description || "");
    }
    onOpenChange(o);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("Modifica Lista") : t("Nuova Lista")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="list-name">{t("Nome *")}</Label>
            <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("es. Contatti Milano")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-desc">{t("Descrizione")}</Label>
            <Textarea id="list-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Descrizione opzionale...")} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? t("Salvataggio...") : isEditing ? t("Salva") : t("Crea Lista")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
