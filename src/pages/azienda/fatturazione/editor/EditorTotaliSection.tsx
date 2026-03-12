import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Lightbulb } from "lucide-react";
import { CAUSALI_RITENUTA, TIPI_CASSA_PREVIDENZIALE } from "@/types/fatturazione";
import { formatCurrency } from "@/lib/formatters";
import { validateDocumento, shouldSuggestBollo, type ValidationError } from "@/lib/fatturazione/calcoli";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
  onValidationErrors?: (errors: ValidationError[]) => void;
}

export function EditorTotaliSection({ state, dispatch, disabled, onValidationErrors }: Props) {
  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  const errors = validateDocumento(state);
  const criticalErrors = errors.filter((e) => e.severity === "error");
  const warnings = errors.filter((e) => e.severity === "warning");

  // Auto-suggest bollo
  const suggestBollo = !state.bollo_virtuale && shouldSuggestBollo(state.righe ?? [], state.totale_documento ?? 0);

  return (
    <div className="space-y-3 rounded-lg border p-4 bg-card">
      <Label className="text-sm font-semibold">Riepilogo</Label>

      {/* Subtotale */}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotale</span>
        <span className="tabular-nums font-medium">{formatCurrency(state.subtotale ?? 0)}</span>
      </div>

      {/* Sconto globale */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Sconto globale %</span>
        <Input
          type="number"
          step="0.01"
          value={state.sconto_globale_percentuale ?? 0}
          onChange={(e) => setField("sconto_globale_percentuale", parseFloat(e.target.value) || 0)}
          className="h-7 w-20 text-xs text-right"
          disabled={disabled}
        />
      </div>
      {(state.sconto_globale_valore ?? 0) > 0 && (
        <div className="flex justify-between text-sm text-destructive">
          <span>Sconto</span>
          <span className="tabular-nums">-{formatCurrency(state.sconto_globale_valore ?? 0)}</span>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Imponibile</span>
        <span className="tabular-nums font-medium">{formatCurrency(state.imponibile_totale ?? 0)}</span>
      </div>

      {/* IVA breakdown */}
      {(state.riepilogo_iva ?? []).map((r, i) => (
        <div key={i} className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            IVA {r.aliquota}% {r.natura ? `(${r.natura})` : ""}
          </span>
          <span className="tabular-nums">{formatCurrency(r.imposta)}</span>
        </div>
      ))}

      <div className="flex justify-between text-sm font-semibold">
        <span>Totale documento</span>
        <span className="tabular-nums">{formatCurrency(state.totale_documento ?? 0)}</span>
      </div>

      <Separator />

      {/* Bollo */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Switch
            checked={state.bollo_virtuale ?? false}
            onCheckedChange={(v) => setField("bollo_virtuale", v)}
            disabled={disabled}
          />
          <span className="text-muted-foreground">Bollo virtuale ({formatCurrency(state.bollo_importo ?? 2)})</span>
        </div>
      </div>
      {suggestBollo && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1.5">
          <Lightbulb className="h-3.5 w-3.5 shrink-0" />
          <span>Consigliato: bollo virtuale €2,00 per importi esenti superiori a €77,47</span>
        </div>
      )}

      {/* Ritenuta */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={state.ritenuta_acconto ?? false}
            onCheckedChange={(v) => setField("ritenuta_acconto", v)}
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">Ritenuta d'acconto</span>
        </div>
        {state.ritenuta_acconto && (
          <div className="grid grid-cols-2 gap-2 pl-8">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={state.ritenuta_tipo ?? "RT01"} onValueChange={(v) => setField("ritenuta_tipo", v)} disabled={disabled}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RT01">RT01 – Persone fisiche</SelectItem>
                  <SelectItem value="RT02">RT02 – Persone giuridiche</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Aliquota %</Label>
              <Input
                type="number"
                value={state.ritenuta_aliquota ?? 20}
                onChange={(e) => setField("ritenuta_aliquota", parseFloat(e.target.value) || 0)}
                className="h-7 text-xs"
                disabled={disabled}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Causale</Label>
              <Select value={state.ritenuta_causale ?? "A"} onValueChange={(v) => setField("ritenuta_causale", v)} disabled={disabled}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CAUSALI_RITENUTA).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{k} – {v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex justify-between text-sm text-destructive">
              <span>Ritenuta</span>
              <span className="tabular-nums">-{formatCurrency(state.ritenuta_importo ?? 0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Cassa previdenziale */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={state.cassa_previdenziale ?? false}
            onCheckedChange={(v) => setField("cassa_previdenziale", v)}
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">Cassa previdenziale</span>
        </div>
        {state.cassa_previdenziale && (
          <div className="grid grid-cols-2 gap-2 pl-8">
            <div>
              <Label className="text-xs">Tipo cassa</Label>
              <Select value={state.cassa_tipo ?? "TC06"} onValueChange={(v) => setField("cassa_tipo", v)} disabled={disabled}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPI_CASSA_PREVIDENZIALE).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{k} – {v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Aliquota %</Label>
              <Input
                type="number"
                value={state.cassa_aliquota ?? 4}
                onChange={(e) => setField("cassa_aliquota", parseFloat(e.target.value) || 0)}
                className="h-7 text-xs"
                disabled={disabled}
              />
            </div>
            <div className="col-span-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Contributo cassa</span>
              <span className="tabular-nums">+{formatCurrency(state.cassa_importo ?? 0)}</span>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Totale da pagare */}
      <div className="flex justify-between text-base font-bold">
        <span>Totale da pagare</span>
        <span className="tabular-nums text-primary">{formatCurrency(state.totale_da_pagare ?? 0)}</span>
      </div>

      {/* Validation errors */}
      {(criticalErrors.length > 0 || warnings.length > 0) && (
        <div className="space-y-1.5 pt-2">
          {criticalErrors.map((e, i) => (
            <div key={`err-${i}`} className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{e.message}</span>
            </div>
          ))}
          {warnings.map((e, i) => (
            <div key={`warn-${i}`} className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
