import { useState } from "react";
import { ChevronDown, Building2, Mail, FileText, Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ESIGIBILITA_IVA, METODI_PAGAMENTO_SDI } from "@/types/fatturazione";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorFatturazioneElettronicaSection({ state, dispatch, disabled }: Props) {
  const [open, setOpen] = useState(true);
  const { data: azienda } = useAnagraficaAzienda();
  const snap = state.cliente_snapshot;
  const isPA = snap?.tipo_cliente === "PA";
  const isBonifico = state.metodo_pagamento_codice === "MP05";

  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  function updateSnapshotField(field: string, value: string) {
    if (!snap) return;
    dispatch({
      type: "SET_CLIENTE",
      anagrafica_id: state.anagrafica_id ?? "",
      snapshot: { ...snap, [field]: value },
    });
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-accent/30 transition-colors">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600/80 dark:text-blue-400/80">
                Fatturazione Elettronica
              </span>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4 border-t">
            {/* ─── Destinatario SDI ─── */}
            <div className="pt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px] text-muted-foreground">Codice Destinatario (SDI)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          {isPA
                            ? "Per la PA: codice IPA a 6 caratteri (obbligatorio)"
                            : "Codice a 7 caratteri per privati (es. 0000000 se non noto). Per forfettari/B2C: 0000000"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    value={snap?.codice_sdi ?? ""}
                    onChange={(e) => updateSnapshotField("codice_sdi", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, isPA ? 6 : 7))}
                    className="h-7 text-xs font-mono uppercase"
                    placeholder={isPA ? "XXXXXX" : "0000000"}
                    maxLength={isPA ? 6 : 7}
                    disabled={disabled || !snap}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Indirizzo PEC</Label>
                  <div className="relative">
                    <Mail className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      value={snap?.pec ?? ""}
                      onChange={(e) => updateSnapshotField("pec", e.target.value.toLowerCase())}
                      className="h-7 text-xs pl-7"
                      placeholder="fatture@pec.esempio.it"
                      disabled={disabled || !snap}
                    />
                  </div>
                </div>
              </div>

              {/* PA indicator */}
              {isPA && (
                <div className="flex items-center gap-2 p-2 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <span className="font-medium">Pubblica Amministrazione</span>
                    <span className="text-blue-600 dark:text-blue-400 ml-1">— Codice IPA obbligatorio (6 caratteri), Split Payment applicato automaticamente</span>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Esigibilità IVA ─── */}
            <div>
              <Label className="text-[10px] text-muted-foreground">Esigibilità IVA</Label>
              <Select
                value={state.esigibilita_iva ?? (isPA && azienda?.split_payment_pa ? "S" : "I")}
                onValueChange={(v) => setField("esigibilita_iva", v)}
                disabled={disabled}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ESIGIBILITA_IVA).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {k} – {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ─── Dati bancari per XML (visibili sempre, non solo per bonifico) ─── */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Dati pagamento per XML</Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Metodo pagamento</Label>
                  <div className="text-xs px-2 py-1.5 rounded bg-muted/50 border">
                    {state.metodo_pagamento_codice
                      ? `${state.metodo_pagamento_codice} – ${METODI_PAGAMENTO_SDI[state.metodo_pagamento_codice as keyof typeof METODI_PAGAMENTO_SDI] ?? ""}`
                      : "Non impostato"}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Emesso in seguito a</Label>
                  <Input
                    value={state.emesso_in_seguito_a ?? ""}
                    onChange={(e) => setField("emesso_in_seguito_a", e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Es: Ordine n. 123"
                    disabled={disabled}
                  />
                </div>
              </div>

              {isBonifico && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Nome istituto di credito</Label>
                    <Input
                      value={state.nome_banca ?? ""}
                      onChange={(e) => dispatch({ type: "SET_PAGAMENTO", fields: { nome_banca: e.target.value } })}
                      className="h-7 text-xs"
                      placeholder="Banca Esempio"
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">IBAN</Label>
                    <Input
                      value={state.iban_pagamento ?? ""}
                      onChange={(e) => dispatch({ type: "SET_PAGAMENTO", fields: { iban_pagamento: e.target.value.toUpperCase() } })}
                      className="h-7 text-xs font-mono"
                      placeholder="IT60X0542811101..."
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Intestatario conto</Label>
                    <Input
                      value={state.intestatario_conto ?? ""}
                      onChange={(e) => dispatch({ type: "SET_PAGAMENTO", fields: { intestatario_conto: e.target.value } })}
                      className="h-7 text-xs"
                      placeholder={azienda?.ragione_sociale ?? ""}
                      disabled={disabled}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ─── Allega PDF al documento elettronico (default true = default DB) ─── */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch
                  id="allega-pdf-sdi"
                  checked={state.allega_pdf_sdi ?? true}
                  onCheckedChange={(v) => setField("allega_pdf_sdi", v)}
                  disabled={disabled}
                />
                <Label htmlFor="allega-pdf-sdi" className="text-xs cursor-pointer">
                  Allega PDF al documento elettronico
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Inserisce il PDF della fattura come allegato nell'XML FatturaPA (tag &lt;Allegati&gt;).
                      Il destinatario riceverà sia l'XML sia il PDF leggibile.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* ─── CIG / CUP (for PA) ─── */}
            {isPA && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Riferimenti PA</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">CIG</Label>
                    <Input
                      value={state.cig ?? ""}
                      onChange={(e) => setField("cig", e.target.value.toUpperCase())}
                      className="h-7 text-xs font-mono uppercase"
                      placeholder="Z1234567AB"
                      maxLength={15}
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">CUP</Label>
                    <Input
                      value={state.cup ?? ""}
                      onChange={(e) => setField("cup", e.target.value.toUpperCase())}
                      className="h-7 text-xs font-mono uppercase"
                      placeholder="B12C34000050006"
                      maxLength={15}
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Codice commessa/convenzione</Label>
                    <Input
                      value={state.codice_commessa_convenzione ?? ""}
                      onChange={(e) => setField("codice_commessa_convenzione", e.target.value)}
                      className="h-7 text-xs"
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
