import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarIcon, Info } from "lucide-react";
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
    <div className="rounded-lg border bg-card p-4 space-y-3 border-l-[3px] border-l-amber-400/60 shadow-sm">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">Dati documento</Label>

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

      {/* Banner informativo TD16 Reverse Charge Interno */}
      {state.tipo === 'reverse_charge_interno' && (
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Reverse Charge Interno (TD16)</strong> — Il committente è responsabile del versamento IVA.
            Applicare Natura IVA <strong>N6.3</strong> per subappalti edili o <strong>N6.7</strong> per altri casi.
            L&apos;importo IVA non viene addebitato al cliente.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
