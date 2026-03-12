import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CAUSALI_RITENUTA, TIPI_CASSA_PREVIDENZIALE } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

function fmt(n: number | undefined): string {
  return (n ?? 0).toFixed(2);
}

export function EditorTotaliSection({ state, dispatch, disabled }: Props) {
  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
      <Label className="text-sm font-semibold">Riepilogo</Label>

      {/* Subtotale */}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotale</span>
        <span className="tabular-nums font-medium">€{fmt(state.subtotale)}</span>
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
          <span className="tabular-nums">-€{fmt(state.sconto_globale_valore)}</span>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Imponibile</span>
        <span className="tabular-nums font-medium">€{fmt(state.imponibile_totale)}</span>
      </div>

      {/* IVA breakdown */}
      {(state.riepilogo_iva ?? []).map((r, i) => (
        <div key={i} className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            IVA {r.aliquota}% {r.natura ? `(${r.natura})` : ""}
          </span>
          <span className="tabular-nums">€{fmt(r.imposta)}</span>
        </div>
      ))}

      <div className="flex justify-between text-sm font-semibold">
        <span>Totale documento</span>
        <span className="tabular-nums">€{fmt(state.totale_documento)}</span>
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
          <span className="text-muted-foreground">Bollo virtuale (€{fmt(state.bollo_importo ?? 2)})</span>
        </div>
      </div>

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
              <Select
                value={state.ritenuta_tipo ?? "RT01"}
                onValueChange={(v) => setField("ritenuta_tipo", v)}
                disabled={disabled}
              >
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
              <Select
                value={state.ritenuta_causale ?? "A"}
                onValueChange={(v) => setField("ritenuta_causale", v)}
                disabled={disabled}
              >
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
              <span className="tabular-nums">-€{fmt(state.ritenuta_importo)}</span>
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
              <Select
                value={state.cassa_tipo ?? "TC06"}
                onValueChange={(v) => setField("cassa_tipo", v)}
                disabled={disabled}
              >
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
              <span className="tabular-nums">+€{fmt(state.cassa_importo)}</span>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Totale da pagare */}
      <div className="flex justify-between text-base font-bold">
        <span>Totale da pagare</span>
        <span className="tabular-nums text-primary">€{fmt(state.totale_da_pagare)}</span>
      </div>
    </div>
  );
}
