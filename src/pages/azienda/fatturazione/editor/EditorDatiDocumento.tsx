import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { TIPI_DOCUMENTO_FATTURAPA } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorDatiDocumento({ state, dispatch, disabled }: Props) {
  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  const dataScadenzaParsed = state.data_scadenza ? parseISO(state.data_scadenza) : undefined;
  const isScaduta = dataScadenzaParsed && isBefore(dataScadenzaParsed, startOfDay(new Date()));
  const isFatturaDifferita = state.tipo === "fattura" && (state.serie === "TD24" || state.serie === "TD25");

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-card">
      <Label className="text-sm font-semibold">Dati documento</Label>

      <div className="grid grid-cols-3 gap-3">
        {/* Tipo Documento FatturaPA */}
        <div>
          <Label className="text-xs text-muted-foreground">Tipo documento SDI</Label>
          <Select
            value={state.sdi_id_trasmissione ?? "TD01"}
            onValueChange={(v) => setField("sdi_id_trasmissione", v)}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIPI_DOCUMENTO_FATTURAPA).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {k} – {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Numero */}
        <div>
          <Label className="text-xs text-muted-foreground">Numero</Label>
          <Input
            value={state.numero ?? ""}
            readOnly
            className="h-8 text-xs font-mono bg-muted/50"
            placeholder="Auto-generato"
          />
        </div>

        {/* Serie */}
        <div>
          <Label className="text-xs text-muted-foreground">Serie</Label>
          <Input
            value={state.serie ?? ""}
            onChange={(e) => setField("serie", e.target.value.toUpperCase().slice(0, 3))}
            className="h-8 text-xs uppercase"
            placeholder="A"
            maxLength={3}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Data Emissione */}
        <div>
          <Label className="text-xs text-muted-foreground">Data emissione</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-8 w-full justify-start text-left text-xs font-normal",
                  !state.data_emissione && "text-muted-foreground"
                )}
                disabled={disabled}
              >
                <CalendarIcon className="mr-1.5 h-3 w-3" />
                {state.data_emissione
                  ? format(parseISO(state.data_emissione), "d MMM yyyy", { locale: it })
                  : "Seleziona data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={state.data_emissione ? parseISO(state.data_emissione) : undefined}
                onSelect={(d) => d && setField("data_emissione", format(d, "yyyy-MM-dd"))}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Data Scadenza */}
        <div>
          <Label className={cn("text-xs", isScaduta ? "text-destructive" : "text-muted-foreground")}>
            Data scadenza {isScaduta && "⚠️"}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-8 w-full justify-start text-left text-xs font-normal",
                  isScaduta && "border-destructive text-destructive",
                  !state.data_scadenza && "text-muted-foreground"
                )}
                disabled={disabled}
              >
                <CalendarIcon className="mr-1.5 h-3 w-3" />
                {state.data_scadenza
                  ? format(parseISO(state.data_scadenza), "d MMM yyyy", { locale: it })
                  : "Seleziona data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dataScadenzaParsed}
                onSelect={(d) => d && setField("data_scadenza", format(d, "yyyy-MM-dd"))}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Valuta */}
        <div>
          <Label className="text-xs text-muted-foreground">Valuta</Label>
          <Select value="EUR" disabled>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR – Euro</SelectItem>
              <SelectItem value="USD">USD – Dollaro</SelectItem>
              <SelectItem value="GBP">GBP – Sterlina</SelectItem>
              <SelectItem value="CHF">CHF – Franco svizzero</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Fattura differita info */}
      {isFatturaDifferita && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Fattura differita</span> — Collega i DDT di riferimento nella sezione note.
          </div>
        </div>
      )}
    </div>
  );
}
