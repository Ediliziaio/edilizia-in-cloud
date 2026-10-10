import { FormField } from "@/hooks/useFormBuilder";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, Mail, Phone, Type, Hash, AlignLeft, List, CheckSquare,
  CircleDot, Calendar, Heading, FileText, Minus, EyeOff, ShieldCheck,
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
  consent: <ShieldCheck className="h-3.5 w-3.5" />,
  radio: <CircleDot className="h-3.5 w-3.5" />,
  date: <Calendar className="h-3.5 w-3.5" />,
  heading: <Heading className="h-3.5 w-3.5" />,
  paragraph: <FileText className="h-3.5 w-3.5" />,
  divider: <Minus className="h-3.5 w-3.5" />,
  hidden: <EyeOff className="h-3.5 w-3.5" />,
};

const TYPE_LABELS: Record<string, string> = {
  text: "testo", email: "email", phone: "telefono", number: "numero",
  textarea: "testo lungo", select: "selezione", checkbox: "spunta sì/no",
  consent: "consenso privacy",
  radio: "scelta singola", date: "data", heading: "titolo",
  paragraph: "paragrafo", divider: "separatore", hidden: "dato nascosto",
};

function SortableField({
  field,
  isSelected,
  onClick,
  disabled,
}: {
  field: FormField;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled,
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
        "flex items-stretch rounded-lg border transition-colors",
        isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50",
        isDragging && "opacity-50",
        isStructural && "border-dashed"
      )}
    >
      <button
        {...(!disabled ? attributes : {})}
        {...(!disabled ? listeners : {})}
        aria-label={disabled ? "Riordino non disponibile" : `Trascina «${field.label}» per riordinare`}
        className={cn("touch-none px-2 max-md:min-w-11", disabled ? "cursor-not-allowed opacity-40" : "cursor-grab")}
        disabled={disabled}
        type="button"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      {/* La parte cliccabile è un pulsante vero: da tastiera si sceglie il campo da modificare (Invio o Spazio). */}
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isSelected}
        aria-label={`Modifica il campo «${field.label}» (${TYPE_LABELS[field.type] || field.type})`}
        className="min-w-0 flex-1 rounded-r-lg py-3 pr-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
      >
        <span className="flex items-center gap-2">
          {ICON_MAP[field.type] || ICON_MAP.text}
          <span className="flex-1 text-sm font-medium">{field.label}</span>
          {field.required && !isStructural && <span className="text-destructive text-xs" aria-hidden="true">*</span>}
        </span>
        <span className="mt-1 block text-[10px] text-muted-foreground">
          {TYPE_LABELS[field.type] || field.type}{field.type !== "divider" ? ` · ${field.name}` : ""}
        </span>
      </button>
    </div>
  );
}

interface Props {
  fields: FormField[];
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  disabled?: boolean;
}

export function FormEditorCanvas({ fields, selectedFieldId, onSelectField, disabled = false }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
        Campi del modulo ({fields.length})
      </h3>
      {fields.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">
          Aggiungi i campi dall'elenco a sinistra
        </div>
      ) : (
        fields.map((f) => (
          <SortableField
            key={f.id}
            field={f}
            isSelected={selectedFieldId === f.id}
            onClick={() => onSelectField(f.id)}
            disabled={disabled}
          />
        ))
      )}
    </div>
  );
}
