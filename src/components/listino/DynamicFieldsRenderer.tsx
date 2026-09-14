/**
 * DynamicFieldsRenderer — Rende dinamicamente la scheda tecnica di una macrocategoria.
 *
 * Input:
 *   - macroId: id della macrocategoria di cui leggere lo schema (campi tipizzati).
 *   - values: oggetto chiave→valore (di solito da `article_families.custom_field_values`).
 *   - onChange: callback con nuova mappa values.
 *   - mode: 'edit' (form completo per anagrafica articolo) | 'display' (read-only).
 *
 * Renderizza i campi nell'ordine `sort_order` dello schema. Tipi supportati:
 *   text/textarea → <Input>/<Textarea>
 *   number        → <Input type=number> + unità a destra
 *   select        → <Select>
 *   multiselect   → checkbox group
 *   boolean       → <Switch>
 *   color         → input type=color + hex
 *
 * Se la macro non ha schema definito (fields vuoto), mostra un hint per
 * configurare la scheda tecnica nelle impostazioni.
 */
import { useMemo } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMacroFields } from "@/lib/serramenti/queries";
import type { ListinoMacroField } from "@/lib/serramenti/api";

export type DynamicFieldValues = Record<string, unknown>;

interface Props {
  macroId: string | null | undefined;
  values: DynamicFieldValues;
  onChange?: (values: DynamicFieldValues) => void;
  mode?: "edit" | "display";
}

export function DynamicFieldsRenderer({
  macroId,
  values,
  onChange,
  mode = "edit",
}: Props) {
  const { data: schema = [], isLoading } = useMacroFields(macroId);

  // In lettura solo i campi da mostrare nel picker; in modifica tutti.
  const visibleFields = useMemo(
    () => (mode === "display" ? schema.filter((f) => f.show_in_picker) : schema),
    [schema, mode],
  );

  const updateField = (key: string, value: unknown) => {
    if (!onChange) return;
    const next = { ...values, [key]: value };
    // Cancella la chiave se valore "vuoto" per non sporcare il JSONB
    if (value === "" || value === null || value === undefined) {
      delete next[key];
    }
    onChange(next);
  };

  if (!macroId) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
        Seleziona prima una macrocategoria per vedere la scheda tecnica.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carico scheda tecnica…
      </div>
    );
  }

  if (visibleFields.length === 0) {
    if (mode === "display") return null;
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center space-y-1">
        <Settings2 className="h-5 w-5 mx-auto opacity-60" />
        <p>Nessuna scheda tecnica configurata per questa macrocategoria.</p>
        <p className="text-xs">
          Vai in <em>Impostazioni → Listino → Macrocategorie</em>, clicca sull'icona{" "}
          <Settings2 className="h-3 w-3 inline" /> accanto alla macrocategoria
          per definire i campi (es. vetro, Uw, potenza…).
        </p>
      </div>
    );
  }

  if (mode === "display") {
    // Read-only badges/lista compatta per picker preview o PDF preview.
    // Variant="outline" con classi custom: prima si usava "secondary" (scuro),
    // che su card slate-50 creava pillole nere stilisticamente scollegate dal
    // resto del dialog (chips quasi "isola scura" nel dialog chiaro).
    return (
      <div className="flex flex-wrap gap-1.5">
        {visibleFields.map((f) => {
          const v = values[f.field_key];
          if (v === undefined || v === null || v === "") return null;
          return (
            <Badge
              key={f.id}
              variant="outline"
              className="font-normal bg-white border-slate-300 text-slate-800 text-[10.5px] py-0.5"
            >
              <span className="font-semibold mr-1 text-slate-600">{f.field_label}:</span>
              <span>{formatDisplayValue(f, v)}</span>
              {f.field_unit && <span className="ml-0.5 text-muted-foreground">{f.field_unit}</span>}
            </Badge>
          );
        })}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
      {visibleFields.map((f) => (
        <FieldRow
          key={f.id}
          field={f}
          value={values[f.field_key]}
          onChange={(v) => updateField(f.field_key, v)}
        />
      ))}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ListinoMacroField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { field_type, field_label, field_unit, field_placeholder, field_help, required, field_options } = field;

  // Per textarea + multiselect → occupa l'intera larghezza
  const fullWidth = field_type === "textarea" || field_type === "multiselect";

  return (
    <div className={fullWidth ? "sm:col-span-2 space-y-1" : "space-y-1"}>
      <Label className="text-sm flex items-center gap-1">
        {field_label}
        {required && <span className="text-destructive">*</span>}
        {field_unit && (
          <span className="text-xs text-muted-foreground font-normal">({field_unit})</span>
        )}
      </Label>

      {field_type === "text" && (
        <Input
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field_placeholder ?? ""}
        />
      )}

      {field_type === "textarea" && (
        <Textarea
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field_placeholder ?? ""}
          rows={2}
        />
      )}

      {field_type === "number" && (
        <Input
          type="number"
          step="any"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") onChange("");
            else onChange(Number(raw));
          }}
          placeholder={field_placeholder ?? ""}
        />
      )}

      {field_type === "select" && (
        <Select value={asString(value)} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={field_placeholder ?? "Seleziona…"} />
          </SelectTrigger>
          <SelectContent>
            {(field_options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field_type === "multiselect" && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 rounded-md border p-2">
          {(field_options ?? []).map((o) => {
            const current = Array.isArray(value) ? (value as string[]) : [];
            const checked = current.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => {
                    if (checked) onChange(current.filter((x) => x !== o.value));
                    else onChange([...current, o.value]);
                  }}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {field_type === "boolean" && (
        <div className="flex items-center gap-2 h-9">
          <Switch checked={!!value} onCheckedChange={(v) => onChange(v)} />
          <span className="text-sm text-muted-foreground">
            {value ? "Sì" : "No"}
          </span>
        </div>
      )}

      {field_type === "color" && (
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={asString(value) || "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-14 p-1"
          />
          <Input
            value={asString(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#RRGGBB o nome RAL"
            className="flex-1"
          />
        </div>
      )}

      {field_help && (
        <p className="text-xs text-muted-foreground">{field_help}</p>
      )}
    </div>
  );
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatDisplayValue(f: ListinoMacroField, v: unknown): string {
  if (f.field_type === "select" && typeof v === "string") {
    return f.field_options?.find((o) => o.value === v)?.label ?? v;
  }
  if (f.field_type === "multiselect" && Array.isArray(v)) {
    const labels = (v as string[]).map(
      (val) => f.field_options?.find((o) => o.value === val)?.label ?? val,
    );
    return labels.join(", ");
  }
  if (f.field_type === "boolean") return v ? "Sì" : "No";
  return String(v ?? "");
}
