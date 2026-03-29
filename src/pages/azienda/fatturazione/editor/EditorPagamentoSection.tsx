import { useState } from "react";
import { Plus, Trash2, Check, AlertTriangle, ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { METODI_PAGAMENTO_SDI } from "@/types/fatturazione";
import { formatCurrency } from "@/lib/formatters";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import type { ScadenzaPagamento } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

const PAYMENT_GROUPS = {
  Bancari: ["MP05", "MP12", "MP19", "MP16"],
  Contanti: ["MP01", "MP02", "MP03"],
  Elettronici: ["MP08", "MP23"],
  Altri: ["MP04", "MP06", "MP07", "MP09", "MP10", "MP11", "MP13", "MP14", "MP15", "MP17", "MP18", "MP20", "MP21", "MP22"],
};

const PRESET_DAYS: { label: string; days: number[] }[] = [
  { label: "30gg", days: [30] },
  { label: "60gg", days: [60] },
  { label: "30/60", days: [30, 60] },
  { label: "30/60/90", days: [30, 60, 90] },
];

function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  return /^IT\d{2}[A-Z]\d{22}$/.test(cleaned);
}

export function EditorPagamentoSection({ state, dispatch, disabled }: Props) {
  const { data: azienda } = useAnagraficaAzienda();
  const scadenze = state.scadenze_pagamento ?? [];
  const isBonifico = state.metodo_pagamento_codice === "MP05";
  const [detailsOpen, setDetailsOpen] = useState(false);

  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_PAGAMENTO", fields: { [field]: value } });
  }

  function autoFillBanca() {
    if (azienda) {
      dispatch({
        type: "SET_PAGAMENTO",
        fields: {
          iban_pagamento: azienda.iban_principale ?? "",
          bic_pagamento: azienda.bic_swift ?? "",
          nome_banca: azienda.nome_banca ?? "",
          intestatario_conto: azienda.intestatario_conto ?? azienda.ragione_sociale,
        },
      });
    }
  }

  function applyPreset(days: number[]) {
    const baseDate = state.data_emissione ? parseISO(state.data_emissione) : new Date();
    const totale = state.totale_da_pagare ?? 0;
    const importoPerRata = Math.round((totale / days.length) * 100) / 100;

    const newScadenze: ScadenzaPagamento[] = days.map((d, i) => ({
      numero_rata: i + 1,
      data_scadenza: format(addDays(baseDate, d), "yyyy-MM-dd"),
      importo: i === days.length - 1
        ? Math.round((totale - importoPerRata * (days.length - 1)) * 100) / 100
        : importoPerRata,
      metodo_pagamento: (state.metodo_pagamento_codice ?? "MP05") as ScadenzaPagamento["metodo_pagamento"],
      pagato: false,
    }));
    dispatch({ type: "SET_SCADENZE", scadenze: newScadenze });
  }

  function addScadenza() {
    const baseDate = state.data_emissione ? parseISO(state.data_emissione) : new Date();
    dispatch({
      type: "ADD_SCADENZA",
      scadenza: {
        numero_rata: scadenze.length + 1,
        data_scadenza: format(addDays(baseDate, 30), "yyyy-MM-dd"),
        importo: state.totale_da_pagare ?? 0,
        metodo_pagamento: (state.metodo_pagamento_codice ?? "MP05") as ScadenzaPagamento["metodo_pagamento"],
        pagato: false,
      },
    });
  }

  function distribuisciAutomaticamente() {
    const totale = state.totale_da_pagare ?? 0;
    if (scadenze.length === 0) return;
    const importoPerRata = Math.round((totale / scadenze.length) * 100) / 100;
    const newScadenze = scadenze.map((s, i) => ({
      ...s,
      importo: i === scadenze.length - 1
        ? Math.round((totale - importoPerRata * (scadenze.length - 1)) * 100) / 100
        : importoPerRata,
    }));
    dispatch({ type: "SET_SCADENZE", scadenze: newScadenze });
  }

  const sumScadenze = scadenze.reduce((s, sc) => s + (sc.importo ?? 0), 0);
  const mismatch = scadenze.length > 0 && Math.abs(sumScadenze - (state.totale_da_pagare ?? 0)) > 0.01;
  const ibanValue = state.iban_pagamento ?? "";
  const ibanValid = !ibanValue || validateIBAN(ibanValue);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 border-l-[3px] border-l-emerald-400/60 shadow-sm">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">Metodo di pagamento</Label>

      {/* Metodo pagamento */}
      <Select
        value={state.metodo_pagamento_codice ?? "MP05"}
        onValueChange={(v) => setField("metodo_pagamento_codice", v)}
        disabled={disabled}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PAYMENT_GROUPS).map(([group, codes]) => (
            <SelectGroup key={group}>
              <SelectLabel className="text-[10px] font-semibold">{group}</SelectLabel>
              {codes.map((code) => (
                <SelectItem key={code} value={code} className="text-xs">
                  {code} – {METODI_PAGAMENTO_SDI[code as keyof typeof METODI_PAGAMENTO_SDI]}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {/* Scadenze preset chips */}
      {!disabled && (
        <div className="flex gap-1 flex-wrap">
          {PRESET_DAYS.map((p) => (
            <Button key={p.label} variant="outline" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => applyPreset(p.days)}>
              {p.label}
            </Button>
          ))}
        </div>
      )}

      {/* Scadenze rows */}
      {scadenze.length > 0 && (
        <div className="space-y-1">
          {scadenze.map((sc, i) => (
            <div key={i} className="flex items-center gap-1 text-xs">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-6 w-[5.5rem] justify-start text-left text-[10px] font-normal px-1.5" disabled={disabled}>
                    <CalendarIcon className="mr-0.5 h-2.5 w-2.5" />
                    {sc.data_scadenza ? format(parseISO(sc.data_scadenza), "dd/MM/yy", { locale: it }) : "Data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={sc.data_scadenza ? parseISO(sc.data_scadenza) : undefined}
                    onSelect={(d) => d && dispatch({ type: "UPDATE_SCADENZA", index: i, scadenza: { data_scadenza: format(d, "yyyy-MM-dd") } })}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Input
                type="number"
                step="0.01"
                value={sc.importo}
                onChange={(e) => dispatch({ type: "UPDATE_SCADENZA", index: i, scadenza: { importo: parseFloat(e.target.value) || 0 } })}
                className="h-6 w-20 text-[10px] text-right px-1"
                disabled={disabled}
              />
              {!disabled && (
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => dispatch({ type: "REMOVE_SCADENZA", index: i })}>
                  <Trash2 className="h-2.5 w-2.5 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          {mismatch && (
            <div className="flex items-center gap-1 text-[9px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded px-1.5 py-1">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              <span>Somma ≠ totale</span>
              {!disabled && (
                <button className="ml-auto underline text-[9px]" onClick={distribuisciAutomaticamente}>Correggi</button>
              )}
            </div>
          )}
        </div>
      )}

      {!disabled && (
        <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1.5" onClick={addScadenza}>
          <Plus className="h-2.5 w-2.5 mr-0.5" />
          Scadenza
        </Button>
      )}

      {/* IBAN details (collapsible, only for bonifico) */}
      {isBonifico && (
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-full justify-center transition-colors">
              <ChevronDown className={`h-2.5 w-2.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
              Dettagli bancari
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 pt-1">
            {azienda?.iban_principale && !disabled && (
              <Button variant="ghost" size="sm" className="h-5 text-[9px] w-full" onClick={autoFillBanca}>
                Auto-compila da azienda
              </Button>
            )}
            <div>
              <Label className="text-[10px] text-muted-foreground">IBAN</Label>
              <Input
                value={ibanValue}
                onChange={(e) => setField("iban_pagamento", e.target.value.toUpperCase())}
                className={cn("h-6 text-[10px] font-mono", !ibanValid && "border-destructive")}
                placeholder="IT60X0542811101..."
                disabled={disabled}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[10px] text-muted-foreground">BIC</Label>
                <Input
                  value={state.bic_pagamento ?? ""}
                  onChange={(e) => setField("bic_pagamento", e.target.value.toUpperCase())}
                  className="h-6 text-[10px] font-mono"
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Banca</Label>
                <Input
                  value={state.nome_banca ?? ""}
                  onChange={(e) => setField("nome_banca", e.target.value)}
                  className="h-6 text-[10px]"
                  disabled={disabled}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
