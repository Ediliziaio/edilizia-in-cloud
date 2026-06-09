import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

export interface EditField {
  key: string;
  label: string;
  type?: "text" | "email";
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
}

/**
 * EditEntityDialog — dialog generico per modificare l'anagrafica di un'entità
 * admin (produttore, studio, …). Campi configurabili, validazione required +
 * email, stato di salvataggio. onSave riceve i valori e può lanciare per errore.
 */
export function EditEntityDialog({
  open, onOpenChange, title, description, fields, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  fields: EditField[];
  initial: Record<string, string>;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>(initial);
  const [wasOpen, setWasOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset del form ad ogni apertura (render-phase, converge dopo un giro).
  if (open && !wasOpen) { setWasOpen(true); setForm(initial); }
  if (!open && wasOpen) setWasOpen(false);

  const requiredOk = fields.every((f) => !f.required || (form[f.key] ?? "").trim().length > 0);

  async function save() {
    for (const f of fields) {
      const v = (form[f.key] ?? "").trim();
      if (f.required && !v) { toast.error(`${f.label} è obbligatorio`); return; }
      if (f.type === "email" && v && !/^\S+@\S+\.\S+$/.test(v)) { toast.error(`${f.label} non valida`); return; }
    }
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } catch (e) {
      toast.error("Salvataggio fallito", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`edit-${f.key}`}>
                {f.label}{f.required && <span className="text-red-600"> *</span>}
              </Label>
              <Input
                id={`edit-${f.key}`}
                type={f.type === "email" ? "email" : "text"}
                value={form[f.key] ?? ""}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                disabled={saving}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              />
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={save} disabled={saving || !requiredOk} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
