import { FormField } from "@/hooks/useFormBuilder";
import { Button } from "@/components/ui/button";
import { GripVertical, Type, Mail, Phone, Hash, AlignLeft, List, CheckSquare } from "lucide-react";

const FIELD_TYPES: { type: FormField["type"]; label: string; icon: React.ReactNode }[] = [
  { type: "text", label: "Testo", icon: <Type className="h-4 w-4" /> },
  { type: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { type: "phone", label: "Telefono", icon: <Phone className="h-4 w-4" /> },
  { type: "number", label: "Numero", icon: <Hash className="h-4 w-4" /> },
  { type: "textarea", label: "Testo lungo", icon: <AlignLeft className="h-4 w-4" /> },
  { type: "select", label: "Selezione", icon: <List className="h-4 w-4" /> },
  { type: "checkbox", label: "Checkbox", icon: <CheckSquare className="h-4 w-4" /> },
];

interface Props {
  onAddField: (type: FormField["type"]) => void;
}

export function FormFieldLibrary({ onAddField }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Campi</h3>
      {FIELD_TYPES.map((ft) => (
        <Button
          key={ft.type}
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          onClick={() => onAddField(ft.type)}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
          {ft.icon}
          {ft.label}
        </Button>
      ))}
    </div>
  );
}
