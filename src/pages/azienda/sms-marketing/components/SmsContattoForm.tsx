/**
 * Form per la creazione e modifica di un contatto SMS.
 *
 * @param initialData - Dati iniziali per modifica (opzionale)
 * @param onSuccess - Callback al salvataggio completato
 * @param onCancel - Callback annullamento
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { SmsConsensoToggle } from "./SmsConsensoToggle";
import { useSmsContatti } from "@/hooks/useSmsContatti";
import type { SmsContatto, SmsContattoFormData } from "@/types/sms-marketing";

interface SmsContattoFormProps {
  initialData?: SmsContatto;
  onSuccess: () => void;
  onCancel: () => void;
}

const defaultForm: SmsContattoFormData = {
  nome: "",
  cognome: "",
  telefono: "",
  consenso_marketing: false,
  tags: [],
  note: "",
};

function validaE164(tel: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(tel);
}

export function SmsContattoForm({ initialData, onSuccess, onCancel }: SmsContattoFormProps) {
  const { create, update, isCreating, isUpdating } = useSmsContatti();
  const isEditing = !!initialData;
  const isSaving = isCreating || isUpdating;

  const [form, setForm] = useState<SmsContattoFormData>(
    initialData
      ? {
          nome: initialData.nome ?? "",
          cognome: initialData.cognome ?? "",
          telefono: initialData.telefono,
          consenso_marketing: initialData.consenso_marketing,
          tags: initialData.tags,
          note: initialData.note ?? "",
        }
      : defaultForm
  );
  const [errors, setErrors] = useState<Partial<Record<keyof SmsContattoFormData, string>>>({});
  const [tagsInput, setTagsInput] = useState(form.tags.join(", "));

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof SmsContattoFormData, string>> = {};
    if (!form.telefono) newErrors.telefono = "Il numero di telefono è obbligatorio";
    else if (!validaE164(form.telefono)) newErrors.telefono = "Inserisci un numero in formato E.164 (es: +39333123456)";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const tagsArray = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const data = { ...form, tags: tagsArray };
    if (isEditing && initialData) {
      await update(initialData.id, data);
    } else {
      await create(data);
    }
    onSuccess();
  };

  const set = <K extends keyof SmsContattoFormData>(key: K, val: SmsContattoFormData[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="nome" className="text-sm">Nome</Label>
          <Input id="nome" value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Mario" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cognome" className="text-sm">Cognome</Label>
          <Input id="cognome" value={form.cognome} onChange={(e) => set("cognome", e.target.value)} placeholder="Rossi" />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="telefono" className="text-sm font-medium">Telefono *</Label>
        <Input
          id="telefono"
          value={form.telefono}
          onChange={(e) => set("telefono", e.target.value)}
          placeholder="+39333123456"
          className={errors.telefono ? "border-destructive" : ""}
        />
        {errors.telefono && <p className="text-xs text-destructive">{errors.telefono}</p>}
        <p className="text-xs text-muted-foreground">Formato internazionale E.164 (es: +39333123456)</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="tags" className="text-sm">Tag (separati da virgola)</Label>
        <Input
          id="tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="clienti, cantiere-roma, vip"
        />
      </div>

      <SmsConsensoToggle
        value={form.consenso_marketing}
        onChange={(v) => set("consenso_marketing", v)}
      />

      <div className="space-y-1">
        <Label htmlFor="note" className="text-sm">Note</Label>
        <Textarea
          id="note"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
          placeholder="Informazioni aggiuntive..."
          className="resize-none text-sm"
        />
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Annulla
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isEditing ? "Salva modifiche" : "Aggiungi contatto"}
        </Button>
      </div>
    </form>
  );
}
