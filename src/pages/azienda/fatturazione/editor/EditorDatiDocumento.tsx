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
import { TIPI_DOCUMENTO_FATTURAPA as TIPI_DOC } from "@/types/fatturazione";

// Maps internal tipo to SDI TipoDocumento code (mirrors generateXML.ts)
const TIPO_TO_TD: Record<string, string> = {
  fattura: "TD01", fattura_pa: "TD01",
  acconto_fattura: "TD02", acconto_parcella: "TD03",
  nota_credito: "TD04", nota_debito: "TD05", parcella: "TD06",
  reverse_charge_interno: "TD16",
  integrazione_servizi_estero: "TD17", integrazione_beni_ue: "TD18", integrazione_beni_extra_ue: "TD19",
  autofattura: "TD20", autofattura_splafonamento: "TD21",
  fattura_riepilogativa: "TD24", ddt: "TD24", fattura_accompagnatoria: "TD24",
  fattura_differita_b: "TD25", autoconsumo: "TD27",
};
import type { EditorState, Action } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<Action>;
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
                autoFocus
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

      {/* Tipo SDI / Serie */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Tipo SDI</Label>
          <div className="h-7 flex items-center px-2 rounded-md border bg-muted/50 text-[11px] font-mono text-muted-foreground select-none">
            {state.tipo ? (TIPO_TO_TD[state.tipo] ?? "—") : "—"}
            {state.tipo && TIPO_TO_TD[state.tipo] && (
              <span className="ml-1 text-[10px] font-sans font-normal truncate">
                – {TIPI_DOC[TIPO_TO_TD[state.tipo] as keyof typeof TIPI_DOC] ?? ""}
              </span>
            )}
          </div>
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
                autoFocus
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

      {/* TD16 è l'integrazione di una fattura in reverse charge RICEVUTA. Il
          banner diceva di usarla per fatturare un subappalto con N6.3: chi lo
          seguiva mandava allo SDI un'integrazione al posto della sua fattura
          (24/09/2026). La fattura del subappaltatore è una TD01 con N6.3. */}
      {state.tipo === 'reverse_charge_interno' && (
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Integrazione di una fattura in reverse charge ricevuta (TD16)</strong> — si usa quando un fornitore,
            per esempio un subappaltatore, ti ha fatturato senza IVA (natura N6.3): qui aggiungi l&apos;IVA che versi tu.
            Come «cliente» indica il <strong>fornitore</strong>; il documento torna a te e al cliente non arriva niente.
            Per <strong>fatturare tu</strong> un subappalto in reverse charge usa una <strong>Fattura</strong> normale con
            natura <strong>N6.3</strong> sulle righe.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
