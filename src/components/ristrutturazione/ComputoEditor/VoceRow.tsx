/**
 * VoceRow — una riga di computo "premium" (NON spreadsheet).
 *
 * Layout responsive:
 *   • desktop ≥ md: riga elegante a colonne (descrizione prominente, UdM chip,
 *     quantità · prezzo · sconto · importo) con azioni hover.
 *   • mobile: card compatta a due righe.
 *
 * Caratteristiche:
 *   • importo LIVE bold da `calcRigaImporto` (ricalcolo in render via useMemo).
 *   • breakdown materiali + manodopera espandibile (barrette proporzionali).
 *   • badge margine €/% (toggle `showMargine`), colorato per fascia.
 *   • sconto% in popover (UX pulita: la riga base resta minimale).
 *   • drag-handle (dnd-kit `useSortable`) per il riordino dentro al capitolo.
 *
 * Purezza React: nessun setState in effect/render; i valori derivati (importo,
 * margine, costo) sono `useMemo`; l'editing è controllato via props (`onChange`).
 */
import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, Copy, Trash2, Percent, ChevronDown, Package, HardHat, MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { calcRigaImporto } from "@/lib/ristrutturazione/calcoli";
import type { RstComputoVoce, RstUnitaMisura } from "@/types/ristrutturazione";
import type { ConfrontoVoce } from "@/lib/prezzario/confronto";
import { ScostamentoVoce } from "@/components/prezzario/ScostamentoVoce";

/** Unità di misura selezionabili (allineate a `RstUnitaMisura`). */
const UM_OPTIONS: RstUnitaMisura[] = ["mq", "ml", "cad", "corpo", "kg", "h", "a corpo"];

interface Props {
  voce: RstComputoVoce;
  onChange: (patch: Partial<RstComputoVoce>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  showMargine: boolean;
  /** Confronto col prezzario regionale per questa voce, se disponibile. */
  confronto?: ConfrontoVoce;
}

/** Coerce numerico da input controllato: vuoto → 0, mai NaN. */
const num = (raw: string): number => {
  const v = Number(raw.replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};

/** Classe colore del badge margine per fascia % (rosso < 15, ambra < 30, verde). */
function margineTone(pct: number): string {
  if (pct < 15) return "border-rose-200 bg-rose-50 text-rose-700";
  if (pct < 30) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function VoceRow({ voce, onChange, onDelete, onDuplicate, showMargine, confronto }: Props) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const sortable = useSortable({ id: voce.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // ─── Valori derivati (ricalcolo live, puro) ───────────────────────────────
  const importo = useMemo(
    () => calcRigaImporto({
      quantita: voce.quantita,
      prezzo_unitario: voce.prezzo_unitario,
      sconto_pct: voce.sconto_pct,
    }),
    [voce.quantita, voce.prezzo_unitario, voce.sconto_pct],
  );
  const costoUnit = useMemo(
    () => Math.max(0, voce.costo_materiali) + Math.max(0, voce.costo_manodopera),
    [voce.costo_materiali, voce.costo_manodopera],
  );
  const costoTot = useMemo(
    () => costoUnit * Math.max(0, voce.quantita),
    [costoUnit, voce.quantita],
  );
  const margineEur = useMemo(() => importo - costoTot, [importo, costoTot]);
  const marginePct = useMemo(
    () => (importo > 0 ? (margineEur / importo) * 100 : 0),
    [margineEur, importo],
  );
  // Quota materiali/manodopera del costo (per le barrette del breakdown).
  const matQuota = costoUnit > 0 ? Math.round((voce.costo_materiali / costoUnit) * 100) : 0;

  const hasSconto = voce.sconto_pct > 0;
  const hasCosto = costoUnit > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // Telefono: righe divise da una linea, non schede dentro la scheda del capitolo.
        "group relative rounded-xl border bg-card transition-shadow max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:shadow-none",
        isDragging ? "z-10 border-orange-300 shadow-lg" : "border-border/70 hover:border-border hover:shadow-sm",
      )}
    >
      <div className="flex items-stretch gap-1 p-2 sm:gap-2 sm:p-2.5 max-sm:px-0.5 max-sm:py-2">
        {/* Drag handle */}
        <button
          type="button"
          aria-label="Trascina per riordinare"
          className="hidden shrink-0 cursor-grab touch-none items-center self-stretch rounded-md px-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground active:cursor-grabbing sm:flex"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Telefono: le due righe diventano una fila sola che va a capo, ordinata:
            descrizione e cestino sopra; quantità, unità × prezzo e totale sotto.
            Via duplica, sconto (se non c'è), prezzo di zona e la colonna di azioni. */}
        <div className="min-w-0 flex-1 max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-1 max-sm:gap-y-1.5">
          {/* Riga 1: descrizione + UdM */}
          <div className="flex items-center gap-2 max-sm:contents">
            <Input
              value={voce.descrizione}
              onChange={(e) => onChange({ descrizione: e.target.value })}
              placeholder="Descrizione lavorazione…"
              className="h-8 flex-1 border-transparent bg-transparent px-1.5 text-sm font-medium shadow-none hover:bg-muted/50 focus-visible:bg-background focus-visible:ring-1 max-sm:order-1 max-sm:min-w-0"
            />
            <Select
              value={voce.unita_misura}
              onValueChange={(v) => onChange({ unita_misura: v as RstUnitaMisura })}
            >
              {/* tap-compact: sul telefono la regola dei 44px gonfiava ogni bottone della riga. */}
              <SelectTrigger className="tap-compact h-7 w-[74px] shrink-0 rounded-full border-dashed px-2 text-[11px] font-medium tabular-nums max-sm:order-5 max-sm:w-[60px] max-sm:px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UM_OPTIONS.map((u) => (
                  <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Telefono: il cestino accanto alla descrizione, poi si va a capo. */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label="Elimina voce"
              className="tap-compact hidden h-7 w-7 shrink-0 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 max-sm:order-2 max-sm:inline-flex"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <span aria-hidden className="hidden max-sm:order-3 max-sm:block max-sm:h-0 max-sm:basis-full" />
          </div>

          {/* Riga 2: quantità × prezzo (− sconto) = importo */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1.5 sm:gap-x-3 max-sm:contents">
            {/* Quantità */}
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground max-sm:order-4">
              <span className="hidden sm:inline">Qtà</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={Number.isFinite(voce.quantita) ? voce.quantita : 0}
                onChange={(e) => onChange({ quantita: num(e.target.value) })}
                className="h-7 w-16 px-1.5 text-right text-sm tabular-nums max-sm:w-[52px]"
              />
            </label>
            <span className="text-muted-foreground/60 max-sm:order-6">×</span>
            {/* Prezzo unitario */}
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground max-sm:order-7">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={Number.isFinite(voce.prezzo_unitario) ? voce.prezzo_unitario : 0}
                onChange={(e) => onChange({ prezzo_unitario: num(e.target.value) })}
                className="h-7 w-20 px-1.5 text-right text-sm tabular-nums max-sm:w-[68px]"
              />
              <span className="text-muted-foreground/70 max-sm:hidden">€/{voce.unita_misura}</span>
            </label>

            {/* Prezzo di zona: quanto questa riga sta sopra o sotto il
                prezzario della regione. Sta accanto al prezzo perché è lì che
                serve, mentre lo si decide. */}
            <span className="max-sm:hidden"><ScostamentoVoce confronto={confronto} /></span>

            {/* Sconto in popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "tap-compact h-7 gap-1 rounded-full px-2 text-[11px] max-sm:order-9",
                    !hasSconto && "max-sm:hidden",
                    hasSconto ? "bg-rose-50 text-rose-600 hover:bg-rose-100" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Percent className="h-3 w-3" />
                  {hasSconto ? `−${voce.sconto_pct}%` : "Sconto"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-52">
                <Label className="text-xs font-medium">Sconto riga (%)</Label>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    value={Number.isFinite(voce.sconto_pct) ? voce.sconto_pct : 0}
                    onChange={(e) => onChange({ sconto_pct: Math.min(100, Math.max(0, num(e.target.value))) })}
                    className="h-8 text-right tabular-nums"
                    autoFocus
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                {hasSconto && (
                  <button
                    type="button"
                    onClick={() => onChange({ sconto_pct: 0 })}
                    className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Rimuovi sconto
                  </button>
                )}
              </PopoverContent>
            </Popover>

            {/* Spacer + importo */}
            <div className="ml-auto flex items-center gap-2 max-sm:order-8">
              {showMargine && hasCosto && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn("gap-0.5 text-[10px] tabular-nums", margineTone(marginePct))}
                    >
                      {formatCurrency(margineEur)} · {marginePct.toFixed(0)}%
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Margine = ricavo {formatCurrency(importo)} − costo {formatCurrency(costoTot)}
                  </TooltipContent>
                </Tooltip>
              )}
              <span className="min-w-[88px] text-right text-base font-bold tabular-nums text-slate-900 max-sm:min-w-0 max-sm:text-sm">
                {formatCurrency(importo)}
              </span>
            </div>
          </div>

          {/* Dettagli espandibili: ambiente/stanza + breakdown costi */}
          {/* Telefono: ambiente e costi si guardano dal computer, come i margini. */}
          <Collapsible open={breakdownOpen} onOpenChange={setBreakdownOpen} className="max-sm:hidden">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="mt-1 ml-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className={cn("h-3 w-3 transition-transform", breakdownOpen && "rotate-180")} />
                {hasCosto
                  ? `Costo unitario ${formatCurrency(costoUnit)} · margine ${marginePct.toFixed(0)}%`
                  : "Dettagli voce"}
                {voce.ambiente ? ` · 📍 ${voce.ambiente}` : ""}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 ml-1.5 space-y-2 rounded-lg bg-muted/40 p-2">
                {/* Ambiente / stanza (opzionale) */}
                <label className="flex items-center gap-1.5 text-[11px]">
                  <MapPin className="h-3 w-3 text-orange-500" />
                  <span className="text-muted-foreground">Ambiente</span>
                  <Input
                    value={voce.ambiente ?? ""}
                    onChange={(e) => onChange({ ambiente: e.target.value || null })}
                    placeholder="es. Bagno, Cucina, Zona notte…"
                    className="h-6 flex-1 px-1.5 text-[11px]"
                  />
                </label>
                {hasCosto && (
                  <>
                    {/* Barra proporzionale materiali/manodopera */}
                    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                      <div className="bg-sky-400" style={{ width: `${matQuota}%` }} title="Materiali" />
                      <div className="bg-violet-400" style={{ width: `${100 - matQuota}%` }} title="Manodopera" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-1.5 text-[11px]">
                        <Package className="h-3 w-3 text-sky-500" />
                        <span className="text-muted-foreground">Materiali</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={Number.isFinite(voce.costo_materiali) ? voce.costo_materiali : 0}
                          onChange={(e) => onChange({ costo_materiali: num(e.target.value) })}
                          className="h-6 w-full px-1.5 text-right text-[11px] tabular-nums"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px]">
                        <HardHat className="h-3 w-3 text-violet-500" />
                        <span className="text-muted-foreground">Manodopera</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={Number.isFinite(voce.costo_manodopera) ? voce.costo_manodopera : 0}
                          onChange={(e) => onChange({ costo_manodopera: num(e.target.value) })}
                          className="h-6 w-full px-1.5 text-right text-[11px] tabular-nums"
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Azioni (hover / sempre su mobile) */}
        <div className="flex shrink-0 flex-col items-center justify-start gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 max-sm:hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDuplicate}
                className="tap-compact h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">Duplica</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="tap-compact h-7 w-7 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">Elimina</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
