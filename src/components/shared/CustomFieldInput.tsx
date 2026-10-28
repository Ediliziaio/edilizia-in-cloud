/**
 * Input tipizzato per un campo personalizzato (Sprint C — Catalogo Esteso).
 * Supporta i tipi principali configurabili in Impostazioni.
 * I valori sono persistiti in JSONB inline sull'entità host.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { multipleFieldValues } from "@/lib/custom-fields/values";

export interface CustomFieldInputProps {
  fieldId: string;
  label: string;
  type: "text" | "number" | "date" | "select" | string;
  value: unknown;
  options?: string[] | null;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  className?: string;
  // v8.6.46 — C5 minimal: validazione + UX hint
  required?: boolean;
  helpText?: string | null;
}

export function CustomFieldInput({
  fieldId,
  label,
  type,
  value,
  options,
  onChange,
  disabled,
  className,
  required,
  helpText,
}: CustomFieldInputProps) {
  const id = `cf-${fieldId}`;
  const stringVal = value === null || value === undefined ? "" : String(value);

  const renderInput = () => {
    switch (type) {
      case "textarea":
        return (
          <Textarea
            id={id}
            disabled={disabled}
            value={stringVal}
            onChange={(e) => onChange(e.target.value || null)}
            rows={3}
          />
        );

      case "checkbox":
        return (
          <div className="flex h-10 items-center gap-2">
            <Checkbox
              id={id}
              disabled={disabled}
              checked={value === true || stringVal === "true"}
              onCheckedChange={(checked) => onChange(checked === true)}
            />
            <span className="text-sm text-muted-foreground">Sì / No</span>
          </div>
        );

      case "email":
      case "phone":
      case "url":
      case "time":
        return (
          <Input
            id={id}
            type={type === "phone" ? "tel" : type}
            disabled={disabled}
            value={stringVal}
            onChange={(e) => onChange(e.target.value || null)}
          />
        );

      case "currency":
      case "percent":
      case "number":
        return (
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            step="0.01"
            disabled={disabled}
            value={stringVal}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange(null);
              } else {
                const n = Number(raw);
                onChange(Number.isFinite(n) ? n : raw);
              }
            }}
          />
        );

      case "date":
        return (
          <Input
            id={id}
            type="date"
            disabled={disabled}
            value={stringVal}
            onChange={(e) => onChange(e.target.value || null)}
          />
        );

      case "multiselect": {
        const selected = multipleFieldValues(value);
        const choices = [...new Set([...(options ?? []), ...selected])];
        return <div id={id} role="group" aria-label={label} className="flex flex-wrap gap-2 rounded-md border p-2">
          {choices.length === 0 && <span className="text-xs text-muted-foreground">Nessuna opzione configurata</span>}
          {choices.map((option, index) => <label key={option} htmlFor={`${id}-${index}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
            <Checkbox id={`${id}-${index}`} disabled={disabled} checked={selected.includes(option)} onCheckedChange={checked => onChange(checked === true ? [...selected, option] : selected.filter(v => v !== option))} />{option}
          </label>)}
        </div>;
      }
      case "file":
        return <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground"><p>{stringVal || "Nessun riferimento salvato"}</p><p>Gli allegati si gestiscono nell’area Documenti, con i relativi permessi.</p></div>;
      case "radio":
      case "select":
        return (
          <div className="flex items-center gap-1"><Select
            value={stringVal || undefined}
            onValueChange={(v) => onChange(v)}
            disabled={disabled}
          >
            <SelectTrigger id={id}>
              <SelectValue placeholder="Seleziona…" />
            </SelectTrigger>
            <SelectContent>
              {(options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>{!!stringVal && !disabled && <button type="button" className="shrink-0 px-2 text-xs underline" onClick={() => onChange(null)} aria-label={`Svuota ${label}`}>Svuota</button>}</div>
        );

      case "text":
      default:
        return (
          <Input
            id={id}
            type="text"
            disabled={disabled}
            value={stringVal}
            onChange={(e) => onChange(e.target.value || null)}
          />
        );
    }
  };

  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-label="obbligatorio">*</span>}
      </Label>
      {renderInput()}
      {helpText && (
        <p className="text-[11px] text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}
