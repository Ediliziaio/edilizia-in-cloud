import { useState } from "react";
import { ChevronDown, Settings2, Stamp, Truck, Percent } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/formatters";
import { shouldSuggestBollo } from "@/lib/fatturazione/calcoli";
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
          <div className="px-4 pb-4 space-y-4 border-t pt-3">
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

            {/* ─── DDT / Fattura accompagnatoria ─── */}
            {["fattura", "fattura_pa", "fattura_accompagnatoria"].includes(state.tipo) && (
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
