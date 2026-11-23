import { Label } from "@/components/ui/label";
import { AlertTriangle, CircleDashed } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { validateDocumento, type ValidationError } from "@/lib/fatturazione/calcoli";
import type { EditorState } from "./useEditorState";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
  onValidationErrors?: (errors: ValidationError[]) => void;
  /** Le mancanze già calcolate dalla pagina (con i controlli PA del contesto). */
  errori?: ValidationError[];
  /** false: si sta ancora compilando, le mancanze sono «da completare» in grigio. */
  errorePieno?: boolean;
  /** Un clic su una mancanza porta al campo. */
  onVaiAlCampo?: (campo: string) => void;
}

export function EditorTotaliSection({ state, errori, errorePieno = true, onVaiAlCampo }: Props) {
  const t = useT();
  const errors = errori ?? validateDocumento(state);
  const criticalErrors = errors.filter((e) => e.severity === "error");
  const warnings = errors.filter((e) => e.severity === "warning");

  // Per i DDT, il documento NON è un titolo di pagamento: nascondi tutti i
  // concetti fiscali/pagamento (Totale da pagare, ritenute, cassa, split,
  // bollo). Mostra solo il subtotale come riferimento interno + validation.
  const isDDT = state.tipo === "ddt";

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2 shadow-sm border-t-[3px] border-t-primary">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">{t("Riepilogo")}</Label>

      {/* Competenze / Subtotale */}
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{isDDT ? t("Valore merce") : t("Competenze")}</span>
        <span className="tabular-nums font-medium">{formatCurrency(state.subtotale ?? 0)}</span>
      </div>

      {/* Sconto globale */}
      {(state.sconto_globale_valore ?? 0) > 0 && (
        <div className="flex justify-between text-xs text-destructive">
          <span>{t("Sconto ({sconto_globale_percentuale}%)", { sconto_globale_percentuale: String((state.sconto_globale_percentuale ?? 0) ?? "") })}</span>
          <span className="tabular-nums">-{formatCurrency(state.sconto_globale_valore ?? 0)}</span>
        </div>
      )}

      {/* Imponibile */}
      {(state.sconto_globale_valore ?? 0) > 0 && !isDDT && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t("Imponibile")}</span>
          <span className="tabular-nums font-medium">{formatCurrency(state.imponibile_totale ?? 0)}</span>
        </div>
      )}

      {!isDDT && (state.riepilogo_iva ?? []).map((r, i) => (
        <div key={`${r.aliquota}-${r.natura ?? ''}-${r.esigibilita ?? ''}-${i}`} className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            IVA {r.aliquota}%
            {r.natura ? ` (${String(r.natura).replace("_", ".")})` : ""}
            {r.esigibilita === "S" ? " SP" : r.esigibilita === "D" ? ` ${t("diff.")}` : ""}
          </span>
          <span className="tabular-nums">{formatCurrency(r.imposta)}</span>
        </div>
      ))}

      {/* Cassa previdenziale */}
      {!isDDT && state.cassa_previdenziale && (state.cassa_importo ?? 0) > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t("Cassa prev. ({cassa_aliquota}%)", { cassa_aliquota: String((state.cassa_aliquota ?? 4) ?? "") })}</span>
          <span className="tabular-nums">+{formatCurrency(state.cassa_importo ?? 0)}</span>
        </div>
      )}

      {/* Rivalsa INPS */}
      {!isDDT && state.rivalsa_inps && (state.rivalsa_importo ?? 0) > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t("Rivalsa INPS ({rivalsa_aliquota}%)", { rivalsa_aliquota: String((state.rivalsa_aliquota ?? 4) ?? "") })}</span>
          <span className="tabular-nums">+{formatCurrency(state.rivalsa_importo ?? 0)}</span>
        </div>
      )}

      {/* Bollo */}
      {!isDDT && state.bollo_virtuale && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t("Bollo virtuale")}</span>
          <span className="tabular-nums">+{formatCurrency(state.bollo_importo ?? 2)}</span>
        </div>
      )}

      {/* Totale documento */}
      {!isDDT && (
        <div className="flex justify-between text-xs font-semibold pt-1 border-t">
          <span>{t("Totale documento")}</span>
          <span className="tabular-nums">{formatCurrency(state.totale_documento ?? 0)}</span>
        </div>
      )}

      {/* Ritenuta */}
      {!isDDT && state.ritenuta_acconto && (state.ritenuta_importo ?? 0) > 0 && (
        <div className="flex justify-between text-xs text-destructive">
          <span>{t("Ritenuta d'acconto ({ritenuta_aliquota}%)", { ritenuta_aliquota: String((state.ritenuta_aliquota ?? 20) ?? "") })}</span>
          <span className="tabular-nums">-{formatCurrency(state.ritenuta_importo ?? 0)}</span>
        </div>
      )}

      {/* Altra ritenuta */}
      {!isDDT && state.altra_ritenuta && (state.altra_ritenuta_importo ?? 0) > 0 && (
        <div className="flex justify-between text-xs text-destructive">
          <span>{t("Altra ritenuta ({altra_ritenuta_aliquota}%)", { altra_ritenuta_aliquota: String((state.altra_ritenuta_aliquota ?? 0) ?? "") })}</span>
          <span className="tabular-nums">-{formatCurrency(state.altra_ritenuta_importo ?? 0)}</span>
        </div>
      )}

      {/* Split Payment indicator */}
      {!isDDT && state.esigibilita_iva === "S" && (
        <div className="flex justify-between text-xs text-blue-600">
          <span>{t("Split Payment (IVA non incassata)")}</span>
          <span className="tabular-nums">-{formatCurrency(state.iva_totale ?? 0)}</span>
        </div>
      )}

      {/* ═══ TOTALE DA PAGARE (non per DDT, che è un documento di trasporto) ═══ */}
      {!isDDT && (
        <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-primary/20">
          <span className="text-sm font-bold text-foreground">{t("Totale da pagare")}</span>
          <span className="text-lg font-extrabold tabular-nums text-primary">{formatCurrency(state.totale_da_pagare ?? 0)}</span>
        </div>
      )}

      {/* Cosa manca per emettere: in grigio mentre si compila, in rosso dopo «Emetti». */}
      {(criticalErrors.length > 0 || warnings.length > 0) && (
        <div className="space-y-1 border-t pt-2" data-testid="mancanze-riepilogo">
          {criticalErrors.length > 0 && (
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${errorePieno ? "text-destructive" : "text-muted-foreground"}`}>
              {errorePieno ? t("Per emettere manca") : t("Da completare")}
            </p>
          )}
          {criticalErrors.map((e, i) => (
            <button
              type="button"
              key={`err-${i}`}
              onClick={() => onVaiAlCampo?.(e.field)}
              disabled={!onVaiAlCampo}
              className={`flex w-full items-start gap-1 text-left text-[11px] enabled:hover:underline ${errorePieno ? "text-destructive" : "text-muted-foreground"}`}
            >
              {errorePieno ? <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> : <CircleDashed className="h-3 w-3 shrink-0 mt-0.5" />}
              <span>{errorePieno ? e.message : t("Da completare: {message}", { message: String(e.message ?? "") })}</span>
            </button>
          ))}
          {warnings.map((e, i) => (
            <button
              type="button"
              key={`warn-${i}`}
              onClick={() => onVaiAlCampo?.(e.field)}
              disabled={!onVaiAlCampo}
              className="flex w-full items-start gap-1 text-left text-[11px] text-amber-600 enabled:hover:underline dark:text-amber-400"
            >
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{e.message}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
