import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, Lightbulb, ChevronDown } from "lucide-react";
import { CAUSALI_RITENUTA, TIPI_CASSA_PREVIDENZIALE } from "@/types/fatturazione";
import { formatCurrency } from "@/lib/formatters";
import { validateDocumento, shouldSuggestBollo, type ValidationError } from "@/lib/fatturazione/calcoli";
import type { EditorState } from "./useEditorState";
import { useState } from "react";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
  onValidationErrors?: (errors: ValidationError[]) => void;
}

export function EditorTotaliSection({ state, dispatch, disabled }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  const errors = validateDocumento(state);
  const criticalErrors = errors.filter((e) => e.severity === "error");
  const warnings = errors.filter((e) => e.severity === "warning");
  const suggestBollo = !state.bollo_virtuale && shouldSuggestBollo(state.righe ?? [], state.totale_documento ?? 0);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 self-start sticky top-4 shadow-md border-t-[3px] border-t-primary">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">Riepilogo</Label>

      {/* Competenze / Subtotale */}
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Competenze</span>
        <span className="tabular-nums font-medium">{formatCurrency(state.subtotale ?? 0)}</span>
      </div>

      {/* Sconto globale */}
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="text-muted-foreground">Sconto %</span>
        <Input
          type="number"
          step="0.01"
          value={state.sconto_globale_percentuale ?? 0}
          onChange={(e) => setField("sconto_globale_percentuale", parseFloat(e.target.value) || 0)}
          className="h-6 w-16 text-[11px] text-right px-1.5"
          disabled={disabled}
        />
      </div>

      {(state.sconto_globale_valore ?? 0) > 0 && (
        <div className="flex justify-between text-xs text-destructive">
          <span>Sconto</span>
          <span className="tabular-nums">-{formatCurrency(state.sconto_globale_valore ?? 0)}</span>
        </div>
      )}

      {/* IVA breakdown */}
      {(state.riepilogo_iva ?? []).map((r, i) => (
        <div key={i} className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            IVA {r.aliquota}%{r.natura ? ` (${r.natura})` : ""}{r.esigibilita === "S" ? " SP" : ""}
          </span>
          <span className="tabular-nums">{formatCurrency(r.imposta)}</span>
        </div>
      ))}

      {/* Totale documento */}
      <div className="flex justify-between text-xs font-semibold pt-1 border-t">
        <span>Totale documento</span>
        <span className="tabular-nums">{formatCurrency(state.totale_documento ?? 0)}</span>
      </div>

      {/* ─── Contributi & ritenute (collapsible) ─── */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-full justify-center transition-colors py-0.5">
            <ChevronDown className={`h-2.5 w-2.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            Contributi e ritenute
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-1">
          {/* Bollo */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={state.bollo_virtuale ?? false}
                onCheckedChange={(v) => setField("bollo_virtuale", v)}
                disabled={disabled}
                className="scale-75"
              />
              <span className="text-muted-foreground">Bollo ({formatCurrency(state.bollo_importo ?? 2)})</span>
            </div>
          </div>
          {suggestBollo && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1">
              <Lightbulb className="h-3 w-3 shrink-0" />
              <span>Bollo consigliato per importi esenti &gt; 77,47</span>
            </div>
          )}

          {/* Ritenuta */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs">
              <Switch
                checked={state.ritenuta_acconto ?? false}
                onCheckedChange={(v) => setField("ritenuta_acconto", v)}
                disabled={disabled}
                className="scale-75"
              />
              <span className="text-muted-foreground">Ritenuta d'acconto</span>
            </div>
            {state.ritenuta_acconto && (
              <div className="space-y-1.5 pl-6">
                <div className="grid grid-cols-2 gap-1.5">
                  <Select value={state.ritenuta_tipo ?? "RT01"} onValueChange={(v) => setField("ritenuta_tipo", v)} disabled={disabled}>
                    <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RT01" className="text-xs">RT01</SelectItem>
                      <SelectItem value="RT02" className="text-xs">RT02</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={state.ritenuta_aliquota ?? 20}
                    onChange={(e) => setField("ritenuta_aliquota", parseFloat(e.target.value) || 0)}
                    className="h-6 text-[10px] text-right"
                    disabled={disabled}
                  />
                </div>
                <Select value={state.ritenuta_causale ?? "A"} onValueChange={(v) => setField("ritenuta_causale", v)} disabled={disabled}>
                  <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CAUSALI_RITENUTA).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">{k} – {v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-between text-[11px] text-destructive">
                  <span>Ritenuta</span>
                  <span className="tabular-nums">-{formatCurrency(state.ritenuta_importo ?? 0)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Cassa */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs">
              <Switch
                checked={state.cassa_previdenziale ?? false}
                onCheckedChange={(v) => setField("cassa_previdenziale", v)}
                disabled={disabled}
                className="scale-75"
              />
              <span className="text-muted-foreground">Cassa previdenziale</span>
            </div>
            {state.cassa_previdenziale && (
              <div className="space-y-1.5 pl-6">
                <div className="grid grid-cols-2 gap-1.5">
                  <Select value={state.cassa_tipo ?? "TC06"} onValueChange={(v) => setField("cassa_tipo", v)} disabled={disabled}>
                    <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPI_CASSA_PREVIDENZIALE).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{k} – {v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={state.cassa_aliquota ?? 4}
                    onChange={(e) => setField("cassa_aliquota", parseFloat(e.target.value) || 0)}
                    className="h-6 text-[10px] text-right"
                    disabled={disabled}
                  />
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Contributo</span>
                  <span className="tabular-nums">+{formatCurrency(state.cassa_importo ?? 0)}</span>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ═══ TOTALE DA PAGARE ═══ */}
      <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-primary/20">
        <span className="text-sm font-bold text-foreground">Totale da pagare</span>
        <span className="text-lg font-extrabold tabular-nums text-primary">{formatCurrency(state.totale_da_pagare ?? 0)}</span>
      </div>

      {/* Validation errors */}
      {(criticalErrors.length > 0 || warnings.length > 0) && (
        <div className="space-y-1 pt-1">
          {criticalErrors.map((e, i) => (
            <div key={`err-${i}`} className="flex items-start gap-1 text-[10px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{e.message}</span>
            </div>
          ))}
          {warnings.map((e, i) => (
            <div key={`warn-${i}`} className="flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
