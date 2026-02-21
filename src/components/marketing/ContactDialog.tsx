import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagSelector } from "@/components/marketing/TagSelector";

export interface ContactFormData {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  company_name: string;
  tags: string[];
  notes: string;
  source: string;
}

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: ContactFormData) => Promise<void>;
  initialData?: Partial<ContactFormData>;
  isEditing?: boolean;
}

const emptyForm: ContactFormData = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  company_name: "",
  tags: [],
  notes: "",
  source: "manuale",
};

export function ContactDialog({ open, onOpenChange, onSave, initialData, isEditing }: ContactDialogProps) {
  const [form, setForm] = useState<ContactFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, ...initialData });
    }
  }, [open, initialData]);

  const handleSubmit = async () => {
    if (!form.first_name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Modifica Contatto" : "Nuovo Contatto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Cognome</Label>
              <Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefono</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Azienda</Label>
            <Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Tag</Label>
            <TagSelector
              selectedTags={form.tags}
              onTagsChange={(tags) => setForm((f) => ({ ...f, tags }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.first_name.trim()}>
            {saving ? "Salvataggio..." : isEditing ? "Salva" : "Aggiungi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
