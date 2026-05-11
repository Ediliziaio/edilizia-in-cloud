/**
 * FieldRenderer — renderizza UN campo del template basato su field.type
 *
 * Supporta: text, textarea, number, dimension, select, multiselect, boolean,
 * compound_boolean (con nested_fields), date, color, currency.
 *
 * Gestisce: show_if (visibility), required (validation), width (grid-12), help.
 */
import { useMemo } from "react";
import type { FieldDefinition } from "@/types/surveys";
import { isVisible } from "./evalConditions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FieldRendererProps {
  field: FieldDefinition;
  value: unknown;
  /** Tutti i valori del form, per valutare show_if */
  allValues: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  showErrors?: boolean;
}

const WIDTH_TO_CLASS: Record<number, string> = {
  3: "col-span-12 md:col-span-3",
  4: "col-span-12 md:col-span-4",
  6: "col-span-12 md:col-span-6",
  8: "col-span-12 md:col-span-8",
  12: "col-span-12",
};

export function FieldRenderer({ field, value, allValues, onChange, showErrors }: FieldRendererProps) {
  const visible = useMemo(() => isVisible(field.show_if, allValues), [field.show_if, allValues]);
  if (!visible) return null;

  const widthClass = field.width ? WIDTH_TO_CLASS[field.width] : "col-span-12";
  const hasError = showErrors && field.required && (value == null || value === "");

  return (
    <div className={cn(widthClass, "space-y-1.5")}>
      {field.type !== "boolean" && field.type !== "compound_boolean" && (
        <Label className="text-xs flex items-center gap-1">
          {field.label}
          {field.required && <span className="text-rose-500">*</span>}
        </Label>
      )}
      <FieldInput field={field} value={value} allValues={allValues} onChange={onChange} hasError={hasError} />
      {field.help && (
        <p className="text-[11px] text-muted-foreground">{field.help}</p>
      )}
      {hasError && (
        <p className="text-[11px] text-rose-600">Campo obbligatorio</p>
      )}
    </div>
  );
}

function FieldInput({
  field, value, allValues, onChange, hasError,
}: FieldRendererProps & { hasError?: boolean }) {
  const errClass = hasError ? "border-rose-500 focus-visible:ring-rose-500" : "";

  switch (field.type) {
    case "text":
      return (
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.max_length}
          className={cn("h-9", errClass)}
        />
      );

    case "textarea":
      return (
        <Textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={errClass}
        />
      );

    case "number":
    case "dimension":
    case "currency": {
      const isCurrency = field.type === "currency";
      const isDim = field.type === "dimension";
      return (
        <div className="relative">
          {isCurrency && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>}
          <Input
            type="number"
            value={value == null ? "" : String(value)}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(field.key, raw === "" ? null : Number(raw));
            }}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step ?? (field.decimals ? 1 / Math.pow(10, field.decimals) : 1)}
            className={cn("h-9", errClass, isCurrency && "pl-6", isDim && field.unit && "pr-12")}
          />
          {isDim && field.unit && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {field.unit}
            </span>
          )}
        </div>
      );
    }

    case "select": {
      const opts = field.options ?? [];
      // Radio group se ≤4 opzioni; altrimenti dropdown
      if (opts.length <= 4) {
        return (
          <RadioGroup
            value={(value as string) ?? ""}
            onValueChange={(v) => onChange(field.key, v)}
            className="grid grid-cols-2 sm:flex sm:gap-3 sm:flex-wrap gap-2"
          >
            {opts.map((o) => (
              <div key={o.value} className="flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
                <RadioGroupItem value={o.value} id={`${field.key}-${o.value}`} />
                <Label htmlFor={`${field.key}-${o.value}`} className="text-xs cursor-pointer">{o.label}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      }
      return (
        <Select value={(value as string) ?? ""} onValueChange={(v) => onChange(field.key, v)}>
          <SelectTrigger className={cn("h-9 text-xs", errClass)}>
            <SelectValue placeholder={field.placeholder ?? "Seleziona…"} />
          </SelectTrigger>
          <SelectContent>
            {opts.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "multiselect": {
      const opts = field.options ?? [];
      const arr = Array.isArray(value) ? value as string[] : [];
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {opts.map((o) => {
            const checked = arr.includes(o.value);
            return (
              <label
                key={o.value}
                className={cn(
                  "flex items-center gap-2 border rounded-md px-2.5 py-1.5 cursor-pointer text-xs",
                  checked && "border-orange-500 bg-orange-50",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    if (v) onChange(field.key, [...arr, o.value]);
                    else onChange(field.key, arr.filter((x) => x !== o.value));
                  }}
                />
                {o.label}
              </label>
            );
          })}
        </div>
      );
    }

    case "boolean":
      return (
        <div className="flex items-center justify-between border rounded-md p-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{field.label}</p>
            {field.help && <p className="text-[11px] text-muted-foreground mt-0.5">{field.help}</p>}
          </div>
          <Switch checked={!!value} onCheckedChange={(v) => onChange(field.key, v)} />
        </div>
      );

    case "compound_boolean": {
      const isOn = !!value;
      // value può essere boolean (false) o object (true con nested values)
      const nested = (typeof value === "object" && value !== null) ? (value as Record<string, unknown>) : {};
      return (
        <div className="border rounded-md overflow-hidden">
          <div className="flex items-center justify-between p-2.5 bg-muted/30">
            <p className="text-sm font-medium">{field.toggle_label ?? field.label}</p>
            <Switch
              checked={isOn}
              onCheckedChange={(v) => onChange(field.key, v ? (nested ?? {}) : false)}
            />
          </div>
          {isOn && (field.nested_fields?.length ?? 0) > 0 && (
            <div className="p-3 bg-muted/10 grid grid-cols-12 gap-3">
              {field.nested_fields!.map((nf) => (
                <FieldRenderer
                  key={nf.key}
                  field={nf}
                  value={nested[nf.key]}
                  allValues={{ ...allValues, ...nested }}
                  onChange={(k, v) => {
                    const newNested = { ...nested, [k]: v };
                    onChange(field.key, newNested);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    case "date":
      return (
        <Input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={cn("h-9", errClass)}
        />
      );

    case "color":
      return (
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={(value as string) ?? "#ffffff"}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="h-9 w-14 p-1 cursor-pointer"
          />
          <Input
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder="RAL 9010 / #ffffff"
            className={cn("h-9 flex-1", errClass)}
          />
        </div>
      );

    default:
      return (
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={cn("h-9", errClass)}
        />
      );
  }
}
