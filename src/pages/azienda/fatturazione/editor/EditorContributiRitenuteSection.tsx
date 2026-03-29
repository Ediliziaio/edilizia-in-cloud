import { useState } from "react";
import { ChevronDown, Receipt } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/formatters";
import { CAUSALI_RITENUTA, TIPI_CASSA_PREVIDENZIALE } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorContributiRitenuteSection({ state, dispatch, disabled }: Props) {
  const [open, setOpen] = useState(false);

  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  const hasContributiActive = (state.ritenuta_acconto ?? false)
    || (state.cassa_previdenziale ?? false)
    || (state.rivalsa_inps ?? false)
    || (state.altra_ritenuta ?? false);

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-accent/30 transition-colors">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-orange-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-orange-600/80 dark:text-orange-400/80">
                Contributi e Ritenute
              </span>
              {hasContributiActive && (
                <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-[9px] font-bold text-orange-700 dark:text-orange-300">
                  attive
                </span>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4 border-t pt-3">

            {/* ─── Cassa professionisti ─── */}
            <div className="space-y-2">
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

            {/* ─── Rivalsa INPS ─── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={state.rivalsa_inps ?? false}
                  onCheckedChange={(v) => setField("rivalsa_inps", v)}
                  disabled={disabled}
                  className="scale-75"
                />
                <Label className="text-xs text-muted-foreground">Rivalsa INPS (Gestione Separata)</Label>
              </div>
              {state.rivalsa_inps && (
                <div className="space-y-2 pl-5 border-l-2 border-muted ml-1">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Tipo</Label>
                      <Select value={state.rivalsa_tipo ?? "TC22"} onValueChange={(v) => setField("rivalsa_tipo", v)} disabled={disabled}>
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
                        value={state.rivalsa_aliquota ?? 4}
                        onChange={(e) => setField("rivalsa_aliquota", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Rivalsa</Label>
                      <div className="h-7 flex items-center text-xs font-medium px-2 bg-muted/50 rounded border">
                        +{formatCurrency(state.rivalsa_importo ?? 0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Ritenuta d'acconto ─── */}
            <div className="space-y-2">
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

            {/* ─── Altra ritenuta ─── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={state.altra_ritenuta ?? false}
                  onCheckedChange={(v) => setField("altra_ritenuta", v)}
                  disabled={disabled}
                  className="scale-75"
                />
                <Label className="text-xs text-muted-foreground">Altra ritenuta</Label>
              </div>
              {state.altra_ritenuta && (
                <div className="space-y-2 pl-5 border-l-2 border-muted ml-1">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Tipo</Label>
                      <Select value={state.altra_ritenuta_tipo ?? "RT03"} onValueChange={(v) => setField("altra_ritenuta_tipo", v)} disabled={disabled}>
                        <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
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
                        value={state.altra_ritenuta_aliquota ?? 0}
                        onChange={(e) => setField("altra_ritenuta_aliquota", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Importo</Label>
                      <div className="h-7 flex items-center text-xs text-destructive font-medium px-2 bg-muted/50 rounded border">
                        -{formatCurrency(state.altra_ritenuta_importo ?? 0)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Causale pagamento</Label>
                    <Select value={state.altra_ritenuta_causale ?? "A"} onValueChange={(v) => setField("altra_ritenuta_causale", v)} disabled={disabled}>
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
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
