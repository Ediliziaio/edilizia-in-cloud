import { FormFieldType } from "@/hooks/useFormBuilder";
import { Button } from "@/components/ui/button";
import {
  GripVertical, Type, Mail, Phone, Hash, AlignLeft, List,
  CheckSquare, CircleDot, Calendar, Heading, FileText, Minus, EyeOff,
} from "lucide-react";

const INPUT_FIELDS: { type: FormFieldType; label: string; icon: React.ReactNode }[] = [
  { type: "text", label: "Testo", icon: <Type className="h-4 w-4" /> },
  { type: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { type: "phone", label: "Telefono", icon: <Phone className="h-4 w-4" /> },
  { type: "number", label: "Numero", icon: <Hash className="h-4 w-4" /> },
  { type: "textarea", label: "Testo lungo", icon: <AlignLeft className="h-4 w-4" /> },
  { type: "select", label: "Selezione", icon: <List className="h-4 w-4" /> },
  { type: "radio", label: "Scelta singola", icon: <CircleDot className="h-4 w-4" /> },
  { type: "checkbox", label: "Checkbox", icon: <CheckSquare className="h-4 w-4" /> },
  { type: "date", label: "Data", icon: <Calendar className="h-4 w-4" /> },
];

const STRUCTURE_FIELDS: { type: FormFieldType; label: string; icon: React.ReactNode }[] = [
  { type: "heading", label: "Titolo", icon: <Heading className="h-4 w-4" /> },
  { type: "paragraph", label: "Paragrafo", icon: <FileText className="h-4 w-4" /> },
  { type: "divider", label: "Separatore", icon: <Minus className="h-4 w-4" /> },
  { type: "hidden", label: "Nascosto", icon: <EyeOff className="h-4 w-4" /> },
];

interface Props {
  onAddField: (type: FormFieldType) => void;
}

export function FormFieldLibrary({ onAddField }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Campi</h3>
        {INPUT_FIELDS.map((ft) => (
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
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Struttura</h3>
        {STRUCTURE_FIELDS.map((ft) => (
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
    </div>
  );
}
