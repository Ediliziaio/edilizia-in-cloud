import { FormField } from "@/hooks/useFormBuilder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

const CONTACT_MAPPINGS = [
  { value: "", label: "Nessuno" },
  { value: "first_name", label: "Nome" },
  { value: "last_name", label: "Cognome" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefono" },
  { value: "company_name", label: "Azienda" },
  { value: "address", label: "Indirizzo" },
  { value: "city", label: "Città" },
  { value: "notes", label: "Note" },
];

interface Props {
  field: FormField | null;
  onUpdate: (updates: Partial<FormField>) => void;
  onDelete: () => void;
}

export function FormFieldProperties({ field, onUpdate, onDelete }: Props) {
  if (!field) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Seleziona un campo per modificarne le proprietà
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proprietà</h3>

      <div className="space-y-2">
        <Label className="text-xs">Label</Label>
        <Input
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Nome campo</Label>
        <Input
          value={field.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Placeholder</Label>
        <Input
          value={field.placeholder || ""}
          onChange={(e) => onUpdate({ placeholder: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Obbligatorio</Label>
        <Switch
          checked={field.required}
          onCheckedChange={(v) => onUpdate({ required: v })}
        />
      </div>

      {field.type === "select" && (
        <div className="space-y-2">
          <Label className="text-xs">Opzioni (una per riga)</Label>
          <Textarea
            value={(field.options || []).join("\n")}
            onChange={(e) => onUpdate({ options: e.target.value.split("\n").filter(Boolean) })}
            rows={4}
            className="text-sm"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Mappatura contatto</Label>
        <Select value={field.mapping || ""} onValueChange={(v) => onUpdate({ mapping: v || undefined })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Nessuna mappatura" />
          </SelectTrigger>
          <SelectContent>
            {CONTACT_MAPPINGS.map((m) => (
              <SelectItem key={m.value} value={m.value || "none"}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="destructive" size="sm" className="w-full mt-4" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 mr-1" /> Elimina campo
      </Button>
    </div>
  );
}
