import { useId } from "react";
import { FormField } from "@/hooks/useFormBuilder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { normalizeLeadFormOptions, sanitizeLeadFormFieldName } from "@/lib/formBuilder";

const CONTACT_MAPPINGS = [
  { value: "", label: "Non salvare nel contatto" },
  { value: "first_name", label: "Nome" },
  { value: "last_name", label: "Cognome" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefono" },
  { value: "company_name", label: "Azienda" },
  { value: "address", label: "Indirizzo" },
  { value: "city", label: "Città" },
  { value: "notes", label: "Note" },
];

const STRUCTURAL_TYPES = ["heading", "paragraph", "divider"];
const NO_PLACEHOLDER_TYPES = ["checkbox", "consent", "heading", "paragraph", "divider", "hidden"];
const HAS_OPTIONS_TYPES = ["select", "radio"];
// Il consenso non mappa su un campo contatto: è un flag salvato nella submission.
const NO_MAPPING_TYPES = ["consent"];

interface Props {
  field: FormField | null;
  onUpdate: (updates: Partial<FormField>) => void;
  onDelete: () => void;
  disabled?: boolean;
}

export function FormFieldProperties({ field, onUpdate, onDelete, disabled = false }: Props) {
  // Ogni etichetta è collegata al suo campo: chi usa la tastiera o il lettore di schermo sa cosa sta compilando.
  const id = useId();
  const idTesto = `${id}-testo`;
  const idNome = `${id}-nome`;
  const idEsempio = `${id}-esempio`;
  const idValoreFisso = `${id}-valore-fisso`;
  const idLinkUrl = `${id}-link-url`;
  const idLinkTesto = `${id}-link-testo`;
  const idObbligatorio = `${id}-obbligatorio`;
  const idOpzioni = `${id}-opzioni`;
  const idContatto = `${id}-contatto`;

  if (!field) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Seleziona un campo per modificarne le proprietà
      </div>
    );
  }

  const isStructural = STRUCTURAL_TYPES.includes(field.type);

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proprietà</h3>

      <div className="space-y-2">
        <Label htmlFor={idTesto} className="text-xs">Testo del campo</Label>
        <Input
          id={idTesto}
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="h-8 text-sm max-md:h-11"
          disabled={disabled}
        />
      </div>

      {field.type !== "divider" && (
        <div className="space-y-2">
          <Label htmlFor={idNome} className="text-xs">Nome interno</Label>
          <Input
            id={idNome}
            value={field.name}
            onChange={(e) => onUpdate({ name: sanitizeLeadFormFieldName(e.target.value) })}
            className="h-8 text-sm max-md:h-11"
            disabled={disabled}
          />
          <p className="text-[11px] text-muted-foreground">Serve al sistema: non cambiarlo se il modulo è già pubblicato.</p>
        </div>
      )}

      {!NO_PLACEHOLDER_TYPES.includes(field.type) && (
        <div className="space-y-2">
          <Label htmlFor={idEsempio} className="text-xs">Testo di esempio nel campo</Label>
          <Input
            id={idEsempio}
            value={field.placeholder || ""}
            onChange={(e) => onUpdate({ placeholder: e.target.value })}
            className="h-8 text-sm max-md:h-11"
            disabled={disabled}
          />
        </div>
      )}

      {field.type === "hidden" && (
        <div className="space-y-2">
          <Label htmlFor={idValoreFisso} className="text-xs">Valore fisso (o parametro UTM)</Label>
          <Input
            id={idValoreFisso}
            value={field.defaultValue || ""}
            onChange={(e) => onUpdate({ defaultValue: e.target.value })}
            className="h-8 text-sm max-md:h-11"
            placeholder="Valore fisso o parametro UTM"
            disabled={disabled}
          />
        </div>
      )}

      {field.type === "consent" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={idLinkUrl} className="text-xs">Link dell'informativa</Label>
            <Input
              id={idLinkUrl}
              value={field.linkUrl || ""}
              onChange={(e) => onUpdate({ linkUrl: e.target.value })}
              className="h-8 text-sm max-md:h-11"
              placeholder="https://tuosito.it/privacy-policy"
              disabled={disabled}
            />
            <p className="text-[11px] text-muted-foreground">
              Solo link https://. Verrà mostrato come link cliccabile accanto al testo.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={idLinkTesto} className="text-xs">Testo del link</Label>
            <Input
              id={idLinkTesto}
              value={field.linkText || ""}
              onChange={(e) => onUpdate({ linkText: e.target.value })}
              className="h-8 text-sm max-md:h-11"
              placeholder="Informativa privacy"
              disabled={disabled}
            />
          </div>
        </>
      )}

      {!isStructural && field.type !== "hidden" && (
        <div className="flex items-center justify-between max-md:min-h-11">
          <Label htmlFor={idObbligatorio} className="text-xs">Obbligatorio</Label>
          <Switch
            id={idObbligatorio}
            checked={field.required}
            onCheckedChange={(v) => onUpdate({ required: v })}
            disabled={disabled}
            className="max-md:relative max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-2.5 max-md:before:content-['']"
          />
        </div>
      )}

      {HAS_OPTIONS_TYPES.includes(field.type) && (
        <div className="space-y-2">
          <Label htmlFor={idOpzioni} className="text-xs">Opzioni (una per riga)</Label>
          <Textarea
            id={idOpzioni}
            value={(field.options || []).join("\n")}
            onChange={(e) => onUpdate({ options: normalizeLeadFormOptions(e.target.value.split("\n")) })}
            rows={4}
            className="text-sm"
            disabled={disabled}
          />
        </div>
      )}

      {!isStructural && field.type !== "hidden" && !NO_MAPPING_TYPES.includes(field.type) && (
        <div className="space-y-2">
          <Label htmlFor={idContatto} className="text-xs">Salva nel contatto come</Label>
          <Select value={field.mapping || ""} onValueChange={(v) => onUpdate({ mapping: v === "none" ? undefined : v || undefined })} disabled={disabled}>
            <SelectTrigger id={idContatto} className="h-8 text-sm max-md:h-11">
              <SelectValue placeholder="Non salvare nel contatto" />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_MAPPINGS.map((m) => (
                <SelectItem key={m.value} value={m.value || "none"}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button variant="destructive" size="sm" className="w-full mt-4 max-md:h-11" onClick={onDelete} disabled={disabled}>
        <Trash2 className="h-3.5 w-3.5 mr-1" /> Elimina campo
      </Button>
    </div>
  );
}
