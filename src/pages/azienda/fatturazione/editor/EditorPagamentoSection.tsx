import { useState } from "react";
import { Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  { label: "90gg", days: [90] },
  { label: "30/60gg", days: [30, 60] },
  { label: "30/60/90gg", days: [30, 60, 90] },
];

function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  return /^IT\d{2}[A-Z]\d{22}$/.test(cleaned);
}

export function EditorPagamentoSection({ state, dispatch, disabled }: Props) {
  const { data: azienda } = useAnagraficaAzienda();
  const scadenze = state.scadenze_pagamento ?? [];
  const isBonifico = state.metodo_pagamento_codice === "MP05";

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
    <div className="space-y-4 rounded-lg border p-4 bg-card">
      <Label className="text-sm font-semibold">Pagamento</Label>

      {/* Metodo pagamento (grouped) */}
      <div>
        <Label className="text-xs text-muted-foreground">Metodo di pagamento</Label>
        <Select
          value={state.metodo_pagamento_codice ?? "MP05"}
          onValueChange={(v) => setField("metodo_pagamento_codice", v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PAYMENT_GROUPS).map(([group, codes]) => (
              <SelectGroup key={group}>
                <SelectLabel className="text-xs font-semibold">{group}</SelectLabel>
                {codes.map((code) => (
                  <SelectItem key={code} value={code} className="text-xs">
                    {code} – {METODI_PAGAMENTO_SDI[code as keyof typeof METODI_PAGAMENTO_SDI]}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* IBAN fields for bonifico */}
      {isBonifico && (
        <div className="space-y-3 rounded border p-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Coordinate bancarie</Label>
            {azienda?.iban_principale && !disabled && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={autoFillBanca}>
                Auto-compila da azienda
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">IBAN</Label>
              <Input
                value={ibanValue}
                onChange={(e) => setField("iban_pagamento", e.target.value.toUpperCase())}
                className={cn("h-8 text-sm font-mono", !ibanValid && "border-destructive")}
                placeholder="IT60X0542811101000000123456"
                disabled={disabled}
              />
              {!ibanValid && (
                <p className="text-xs text-destructive mt-0.5">Formato IBAN italiano non valido</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">BIC/SWIFT</Label>
              <Input
                value={state.bic_pagamento ?? ""}
                onChange={(e) => setField("bic_pagamento", e.target.value.toUpperCase())}
                className="h-8 text-sm font-mono"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Banca</Label>
              <Input
                value={state.nome_banca ?? ""}
                onChange={(e) => setField("nome_banca", e.target.value)}
                className="h-8 text-sm"
                disabled={disabled}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Intestatario</Label>
              <Input
                value={state.intestatario_conto ?? ""}
                onChange={(e) => setField("intestatario_conto", e.target.value)}
                className="h-8 text-sm"
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      )}

      {/* Scadenze */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Scadenze pagamento</Label>
        </div>

        {/* Preset chips */}
        {!disabled && (
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_DAYS.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => applyPreset(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        )}

        {/* Scadenze rows */}
        {scadenze.map((sc, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-7 w-32 justify-start text-left text-xs font-normal"
                  disabled={disabled}
                >
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {sc.data_scadenza
                    ? format(parseISO(sc.data_scadenza), "d MMM yy", { locale: it })
                    : "Data"}
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
              className="h-7 w-24 text-xs text-right"
              disabled={disabled}
            />
            {!disabled && (
              <>
                <Button
                  variant={sc.pagato ? "default" : "ghost"}
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => dispatch({ type: "UPDATE_SCADENZA", index: i, scadenza: { pagato: !sc.pagato } })}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => dispatch({ type: "REMOVE_SCADENZA", index: i })}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ))}

        {!disabled && (
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={addScadenza}>
            <Plus className="h-3 w-3 mr-1" />
            Aggiungi scadenza
          </Button>
        )}

        {/* Mismatch warning */}
        {mismatch && (
          <div className="flex items-center gap-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Somma scadenze ({formatCurrency(sumScadenze)}) ≠ totale da pagare ({formatCurrency(state.totale_da_pagare ?? 0)})
            </span>
            {!disabled && (
              <Button variant="ghost" size="sm" className="h-5 text-xs ml-auto" onClick={distribuisciAutomaticamente}>
                Distribuisci
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
