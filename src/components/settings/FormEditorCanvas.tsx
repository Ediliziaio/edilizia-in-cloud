import { FormField } from "@/hooks/useFormBuilder";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, Mail, Phone, Type, Hash, AlignLeft, List, CheckSquare,
  CircleDot, Calendar, Heading, FileText, Minus, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ReactNode> = {
  text: <Type className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  phone: <Phone className="h-3.5 w-3.5" />,
  number: <Hash className="h-3.5 w-3.5" />,
  textarea: <AlignLeft className="h-3.5 w-3.5" />,
  select: <List className="h-3.5 w-3.5" />,
  checkbox: <CheckSquare className="h-3.5 w-3.5" />,
  radio: <CircleDot className="h-3.5 w-3.5" />,
  date: <Calendar className="h-3.5 w-3.5" />,
  heading: <Heading className="h-3.5 w-3.5" />,
  paragraph: <FileText className="h-3.5 w-3.5" />,
  divider: <Minus className="h-3.5 w-3.5" />,
  hidden: <EyeOff className="h-3.5 w-3.5" />,
};

const TYPE_LABELS: Record<string, string> = {
  text: "testo", email: "email", phone: "telefono", number: "numero",
  textarea: "testo lungo", select: "selezione", checkbox: "checkbox",
  radio: "scelta singola", date: "data", heading: "titolo",
  paragraph: "paragrafo", divider: "separatore", hidden: "nascosto",
};

function SortableField({
  field,
  isSelected,
  onClick,
}: {
  field: FormField;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isStructural = ["heading", "paragraph", "divider"].includes(field.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border rounded-lg p-3 cursor-pointer transition-colors",
        isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50",
        isDragging && "opacity-50",
        isStructural && "border-dashed"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab touch-none">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        {ICON_MAP[field.type] || ICON_MAP.text}
        <span className="text-sm font-medium flex-1">{field.label}</span>
        {field.required && !isStructural && <span className="text-destructive text-xs">*</span>}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 ml-6">
        {TYPE_LABELS[field.type] || field.type}{field.type !== "divider" ? ` · ${field.name}` : ""}
      </p>
    </div>
  );
}

interface Props {
  fields: FormField[];
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
}

export function FormEditorCanvas({ fields, selectedFieldId, onSelectField }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
        Campi del form ({fields.length})
      </h3>
      {fields.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">
          Aggiungi campi dalla libreria a sinistra
        </div>
      ) : (
        fields.map((f) => (
          <SortableField
            key={f.id}
            field={f}
            isSelected={selectedFieldId === f.id}
            onClick={() => onSelectField(f.id)}
          />
        ))
      )}
    </div>
  );
}
