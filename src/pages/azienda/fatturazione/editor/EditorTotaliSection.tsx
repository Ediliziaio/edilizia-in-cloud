import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { validateDocumento, type ValidationError } from "@/lib/fatturazione/calcoli";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
  onValidationErrors?: (errors: ValidationError[]) => void;
}

export function EditorTotaliSection({ state }: Props) {
  const errors = validateDocumento(state);
  const criticalErrors = errors.filter((e) => e.severity === "error");
  const warnings = errors.filter((e) => e.severity === "warning");

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 self-start sticky top-4 shadow-md border-t-[3px] border-t-primary">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">Riepilogo</Label>

      {/* Competenze / Subtotale */}
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Competenze</span>
        <span className="tabular-nums font-medium">{formatCurrency(state.subtotale ?? 0)}</span>
      </div>

      {/* Sconto globale */}
      {(state.sconto_globale_valore ?? 0) > 0 && (
        <div className="flex justify-between text-xs text-destructive">
          <span>Sconto ({state.sconto_globale_percentuale ?? 0}%)</span>
          <span className="tabular-nums">-{formatCurrency(state.sconto_globale_valore ?? 0)}</span>
        </div>
      )}

      {/* Imponibile */}
      {(state.sconto_globale_valore ?? 0) > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Imponibile</span>
          <span className="tabular-nums font-medium">{formatCurrency(state.imponibile_totale ?? 0)}</span>
        </div>
      )}

      {/* IVA breakdown */}
      {(state.riepilogo_iva ?? []).map((r, i) => (
        <div key={i} className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            IVA {r.aliquota}%
            {r.natura ? ` (${String(r.natura).replace("_", ".")})` : ""}
            {r.esigibilita === "S" ? " SP" : r.esigibilita === "D" ? " diff." : ""}
          </span>
          <span className="tabular-nums">{formatCurrency(r.imposta)}</span>
        </div>
      ))}

      {/* Cassa previdenziale */}
      {state.cassa_previdenziale && (state.cassa_importo ?? 0) > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Cassa prev. ({state.cassa_aliquota ?? 4}%)</span>
          <span className="tabular-nums">+{formatCurrency(state.cassa_importo ?? 0)}</span>
        </div>
      )}

      {/* Bollo */}
      {state.bollo_virtuale && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Bollo virtuale</span>
          <span className="tabular-nums">+{formatCurrency(state.bollo_importo ?? 2)}</span>
        </div>
      )}

      {/* Totale documento */}
      <div className="flex justify-between text-xs font-semibold pt-1 border-t">
        <span>Totale documento</span>
        <span className="tabular-nums">{formatCurrency(state.totale_documento ?? 0)}</span>
      </div>

      {/* Ritenuta */}
      {state.ritenuta_acconto && (state.ritenuta_importo ?? 0) > 0 && (
        <div className="flex justify-between text-xs text-destructive">
          <span>Ritenuta d'acconto ({state.ritenuta_aliquota ?? 20}%)</span>
          <span className="tabular-nums">-{formatCurrency(state.ritenuta_importo ?? 0)}</span>
        </div>
      )}

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
