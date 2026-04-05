/**
 * Form per la creazione e modifica di un template SMS.
 *
 * @param initialData - Dati iniziali per modifica (opzionale)
 * @param onSuccess - Callback al salvataggio
 * @param onCancel - Callback annullamento
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SmsMessaggioEditor } from "./SmsMessaggioEditor";
import { useSmsTemplates } from "@/hooks/useSmsTemplates";
import type { SmsTemplate, SmsTemplateFormData, SmsTemplateCategoria } from "@/types/sms-marketing";

const CATEGORIE: { value: SmsTemplateCategoria; label: string }[] = [
  { value: "generico", label: "Generico" },
  { value: "promozionale", label: "Promozionale" },
  { value: "transazionale", label: "Transazionale" },
  { value: "reminder", label: "Reminder" },
  { value: "preventivo", label: "Preventivo" },
];

interface SmsTemplateFormProps {
  initialData?: SmsTemplate;
  onSuccess: () => void;
  onCancel: () => void;
}

const defaultForm: SmsTemplateFormData = {
  nome: "",
  categoria: "generico",
  messaggio: "",
  variabili: [],
  attivo: true,
};

export function SmsTemplateForm({ initialData, onSuccess, onCancel }: SmsTemplateFormProps) {
  const { create, update, isCreating, isUpdating } = useSmsTemplates();
  const isSaving = isCreating || isUpdating;
  const isEditing = !!initialData;

  const [form, setForm] = useState<SmsTemplateFormData>(
    initialData
      ? { nome: initialData.nome, categoria: initialData.categoria, messaggio: initialData.messaggio, variabili: initialData.variabili, attivo: initialData.attivo }
      : defaultForm
  );
  const [errors, setErrors] = useState<Partial<Record<keyof SmsTemplateFormData, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof SmsTemplateFormData, string>> = {};
    if (!form.nome.trim()) newErrors.nome = "Il nome del template è obbligatorio";
    if (!form.messaggio.trim()) newErrors.messaggio = "Il messaggio è obbligatorio";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    // Estrae variabili dal messaggio automaticamente
    const variabili = (form.messaggio.match(/\{\{[^}]+\}\}/g) ?? []) as string[];
    const data = { ...form, variabili };
    if (isEditing && initialData) await update(initialData.id, data);
    else await create(data);
    onSuccess();
  };

  const set = <K extends keyof SmsTemplateFormData>(key: K, val: SmsTemplateFormData[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="nome-template" className="text-sm font-medium">Nome template *</Label>
        <Input
          id="nome-template"
          value={form.nome}
          onChange={(e) => set("nome", e.target.value)}
          placeholder="Es: Benvenuto cliente"
          className={errors.nome ? "border-destructive" : ""}
        />
        {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
      </div>

      <div className="space-y-1">
        <Label className="text-sm font-medium">Categoria</Label>
        <Select value={form.categoria} onValueChange={(v) => set("categoria", v as SmsTemplateCategoria)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIE.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SmsMessaggioEditor
        value={form.messaggio}
        onChange={(v) => set("messaggio", v)}
        error={errors.messaggio}
      />

      <div className="flex items-center gap-2">
        <Switch
          id="attivo-toggle"
          checked={form.attivo}
          onCheckedChange={(v) => set("attivo", v)}
        />
        <Label htmlFor="attivo-toggle" className="text-sm cursor-pointer">Template attivo</Label>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Annulla</Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isEditing ? "Salva modifiche" : "Crea template"}
        </Button>
      </div>
    </form>
  );
}
