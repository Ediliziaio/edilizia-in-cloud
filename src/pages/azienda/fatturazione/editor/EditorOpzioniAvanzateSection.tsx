import { useState } from "react";
import { ChevronDown, Settings2, Stamp, Truck, Receipt, Percent, ArrowUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/formatters";
import { shouldSuggestBollo } from "@/lib/fatturazione/calcoli";
import { CAUSALI_RITENUTA, TIPI_CASSA_PREVIDENZIALE } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorOpzioniAvanzateSection({ state, dispatch, disabled }: Props) {
  const [open, setOpen] = useState(false);

  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  const suggestBollo = !state.bollo_virtuale && shouldSuggestBollo(state.righe ?? [], state.totale_documento ?? 0);
  const hasAdvancedActive = (state.bollo_virtuale ?? false)
    || (state.ritenuta_acconto ?? false)
    || (state.cassa_previdenziale ?? false)
    || (state.sconto_globale_percentuale && state.sconto_globale_percentuale > 0)
    || (state.arrotondamento && state.arrotondamento !== 0);

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-accent/30 transition-colors">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-violet-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-600/80 dark:text-violet-400/80">
                Opzioni avanzate
              </span>
              {hasAdvancedActive && (
                <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-[9px] font-bold text-violet-700 dark:text-violet-300">
                  attive
                </span>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-5 border-t pt-3">

            {/* ─── Bollo Virtuale ─── */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Stamp className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-xs font-medium">Imposta di bollo virtuale</Label>
                </div>
                <Switch
                  checked={state.bollo_virtuale ?? false}
                  onCheckedChange={(v) => setField("bollo_virtuale", v)}
                  disabled={disabled}
                />
              </div>
              {state.bollo_virtuale && (
                <div className="pl-6">
                  <Label className="text-[10px] text-muted-foreground">Importo bollo</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={state.bollo_importo ?? 2}
                    onChange={(e) => setField("bollo_importo", parseFloat(e.target.value) || 2)}
                    className="h-7 text-xs w-24"
                    disabled={disabled}
                  />
                </div>
              )}
              {suggestBollo && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1.5 ml-6">
                  <Stamp className="h-3 w-3 shrink-0" />
                  <span>Bollo obbligatorio per operazioni esenti/escluse &gt; €77,47</span>
                </div>
              )}
            </div>

            {/* ─── Sconto / Maggiorazione Globale ─── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium">Sconto / Maggiorazione globale</Label>
              </div>
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Sconto %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={state.sconto_globale_percentuale ?? 0}
                    onChange={(e) => setField("sconto_globale_percentuale", parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs"
                    disabled={disabled}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Arrotondamento (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={state.arrotondamento ?? 0}
                    onChange={(e) => setField("arrotondamento", parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs"
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>

            {/* ─── Contributi e Ritenute ─── */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium">Contributi e ritenute</Label>
              </div>

              {/* Ritenuta d'acconto */}
              <div className="space-y-2 pl-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={state.ritenuta_acconto ?? false}
                    onCheckedChange={(v) => setField("ritenuta_acconto", v)}
                    disabled={disabled}
                    className="scale-75"
                  />
                  <Label className="text-xs text-muted-foreground">Ritenuta d'acconto</Label>
                </div>
                {state.ritenuta_acconto && (
                  <div className="space-y-2 pl-5 border-l-2 border-muted ml-1">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Tipo</Label>
                        <Select value={state.ritenuta_tipo ?? "RT01"} onValueChange={(v) => setField("ritenuta_tipo", v)} disabled={disabled}>
                          <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RT01" className="text-xs">RT01 – Persone fisiche</SelectItem>
                            <SelectItem value="RT02" className="text-xs">RT02 – Persone giuridiche</SelectItem>
                            <SelectItem value="RT03" className="text-xs">RT03 – Contributo INPS</SelectItem>
                            <SelectItem value="RT04" className="text-xs">RT04 – Contributo ENASARCO</SelectItem>
                            <SelectItem value="RT05" className="text-xs">RT05 – Contributo ENPAM</SelectItem>
                            <SelectItem value="RT06" className="text-xs">RT06 – Altro contributo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Aliquota %</Label>
                        <Input
                          type="number"
                          value={state.ritenuta_aliquota ?? 20}
                          onChange={(e) => setField("ritenuta_aliquota", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs text-right"
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Importo</Label>
                        <div className="h-7 flex items-center text-xs text-destructive font-medium px-2 bg-muted/50 rounded border">
                          -{formatCurrency(state.ritenuta_importo ?? 0)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Causale pagamento</Label>
                      <Select value={state.ritenuta_causale ?? "A"} onValueChange={(v) => setField("ritenuta_causale", v)} disabled={disabled}>
                        <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(CAUSALI_RITENUTA).map(([k, v]) => (
                            <SelectItem key={k} value={k} className="text-xs">{k} – {v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Cassa previdenziale */}
              <div className="space-y-2 pl-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={state.cassa_previdenziale ?? false}
                    onCheckedChange={(v) => setField("cassa_previdenziale", v)}
                    disabled={disabled}
                    className="scale-75"
                  />
                  <Label className="text-xs text-muted-foreground">Cassa previdenziale</Label>
                </div>
                {state.cassa_previdenziale && (
                  <div className="space-y-2 pl-5 border-l-2 border-muted ml-1">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Tipo cassa</Label>
                        <Select value={state.cassa_tipo ?? "TC06"} onValueChange={(v) => setField("cassa_tipo", v)} disabled={disabled}>
                          <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(TIPI_CASSA_PREVIDENZIALE).map(([k, v]) => (
                              <SelectItem key={k} value={k} className="text-xs">{k} – {v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Aliquota %</Label>
                        <Input
                          type="number"
                          value={state.cassa_aliquota ?? 4}
                          onChange={(e) => setField("cassa_aliquota", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs text-right"
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Contributo</Label>
                        <div className="h-7 flex items-center text-xs font-medium px-2 bg-muted/50 rounded border">
                          +{formatCurrency(state.cassa_importo ?? 0)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={state.cassa_ritenuta ?? false}
                        onCheckedChange={(v) => setField("cassa_ritenuta", v)}
                        disabled={disabled}
                        className="scale-75"
                      />
                      <Label className="text-[10px] text-muted-foreground">Soggetta a ritenuta</Label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ─── DDT / Fattura accompagnatoria ─── */}
            {(state.tipo === "fattura" || state.tipo === "fattura_pa") && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-xs font-medium">Trasporto</Label>
                </div>
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Causale trasporto</Label>
                    <Input
                      value={state.ddt_causale_trasporto ?? ""}
                      onChange={(e) => setField("ddt_causale_trasporto", e.target.value)}
                      className="h-7 text-xs"
                      placeholder="Vendita"
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">N. colli</Label>
                    <Input
                      type="number"
                      value={state.ddt_numero_colli ?? ""}
                      onChange={(e) => setField("ddt_numero_colli", parseInt(e.target.value) || undefined)}
                      className="h-7 text-xs"
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Peso (kg)</Label>
                    <Input
                      value={state.ddt_peso ?? ""}
                      onChange={(e) => setField("ddt_peso", e.target.value)}
                      className="h-7 text-xs"
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Aspetto beni</Label>
                    <Input
                      value={state.ddt_aspetto_beni ?? ""}
                      onChange={(e) => setField("ddt_aspetto_beni", e.target.value)}
                      className="h-7 text-xs"
                      placeholder="Scatole"
                      disabled={disabled}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
