/**
 * Input tipizzato per un campo personalizzato (Sprint C — Catalogo Esteso).
 * Supporta: text, number, date, select.
 * I valori sono persistiti in JSONB inline sull'entità host.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface CustomFieldInputProps {
  fieldId: string;
  label: string;
  type: "text" | "number" | "date" | "select" | string;
  value: unknown;
  options?: string[] | null;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  className?: string;
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
}: CustomFieldInputProps) {
  const id = `cf-${fieldId}`;
  const stringVal = value === null || value === undefined ? "" : String(value);

  const renderInput = () => {
    switch (type) {
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

      case "select":
        return (
          <Select
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
          </Select>
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
      </Label>
      {renderInput()}
    </div>
  );
}
