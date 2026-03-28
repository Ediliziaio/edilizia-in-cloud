import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
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

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dati documento</Label>

      {/* Data + Numero inline */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Data</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-7 w-full justify-start text-left text-xs font-normal",
                  !state.data_emissione && "text-muted-foreground"
                )}
                disabled={disabled}
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {state.data_emissione
                  ? format(parseISO(state.data_emissione), "dd/MM/yyyy", { locale: it })
                  : "Seleziona"}
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
        <div>
          <Label className="text-[10px] text-muted-foreground">Numero</Label>
          <Input
            value={state.numero ?? ""}
            readOnly
            className="h-7 text-xs font-mono bg-muted/50"
          />
        </div>
      </div>

      {/* Numerazione / Serie */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Numerazione</Label>
          <Select
            value={state.sdi_id_trasmissione ?? "TD01"}
            onValueChange={(v) => setField("sdi_id_trasmissione", v)}
            disabled={disabled}
          >
            <SelectTrigger className="h-7 text-[11px]">
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
        <div>
          <Label className="text-[10px] text-muted-foreground">Serie</Label>
          <Input
            value={state.serie ?? ""}
            onChange={(e) => setField("serie", e.target.value.toUpperCase().slice(0, 3))}
            className="h-7 text-xs uppercase"
            placeholder="A"
            maxLength={3}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Scadenza + Valuta */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className={cn("text-[10px]", isScaduta ? "text-destructive" : "text-muted-foreground")}>
            Scadenza {isScaduta && "!"}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-7 w-full justify-start text-left text-xs font-normal",
                  isScaduta && "border-destructive text-destructive",
                  !state.data_scadenza && "text-muted-foreground"
                )}
                disabled={disabled}
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {state.data_scadenza
                  ? format(parseISO(state.data_scadenza), "dd/MM/yyyy", { locale: it })
                  : "Seleziona"}
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
        <div>
          <Label className="text-[10px] text-muted-foreground">Valuta</Label>
          <Select value="EUR" disabled>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
