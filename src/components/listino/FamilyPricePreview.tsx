/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.6
 *
 * Preview live del prezzo di un'istanza famiglia. Usa calcolaPrezzoFamiglia,
 * lo stesso motore del preventivo generico, senza fallback o formule locali.
 * I listini fornitore avanzati mantengono la loro politica di prezzo separata.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calcolaPrezzoFamiglia, cellaGriglia } from "@/hooks/useFamilyPricing";
import type { FamilyWithAxes, AxisSelection } from "@/types/articleFamily";
import { assiVisibili, normalizzaSelezione } from "@/lib/serramenti/assiCondizionati";
import { suffissoMaggiorazione } from "@/lib/listino/maggiorazione";
import { useColoriFamiglia } from "@/hooks/useColoriFamiglia";
import { SceltaColoriDentroFuori } from "@/components/serramenti/SceltaColoriDentroFuori";
import { applicaPrezzoOpzioni } from "@/lib/listino/prezzoOpzioni";
import { guidaPrezzoColori } from "@/lib/serramenti/catalogoColori";

// Limiti plausibili per validazione client (#4)
const MIN_DIM_MM = 100;
const MAX_DIM_MM = 10000;

// Unità di misura supportate (#5)
type DimUnit = "mm" | "cm" | "m";
const UNIT_TO_MM: Record<DimUnit, number> = { mm: 1, cm: 10, m: 1000 };
function toMm(value: number, unit: DimUnit): number {
  return value * UNIT_TO_MM[unit];
}
function fromMm(mm: number, unit: DimUnit): number {
  return mm / UNIT_TO_MM[unit];
}

interface GridCell {
  valore_x: number;
  valore_y: number;
  prezzo_vendita: number;
  prezzo_acquisto: number;
}

interface Props {
  family: FamilyWithAxes;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2, useGrouping: "always" }).format(n);
}

/**
 * Strategia di lookup per griglia W×H quando l'utente inserisce dimensioni
 * arbitrarie (es. 1234×1567) che potrebbero non corrispondere esattamente a
 * una cella in griglia.
 *
 * Comportamento — coerente con la prassi del settore serramentisti:
 *   1. Match esatto → usa quella cella (caso ideale).
 *   2. Match round-up → la cella più piccola che CONTENGA W×H (cioè
 *      `valore_x ≥ W AND valore_y ≥ H` con prodotto minimo). Il pezzo
 *      viene "tagliato" da quella misura → si paga il prezzo della cella
 *      superiore. Standard nel mercato.
 *   3. Fuori griglia (richiesta supera la cella massima) → blocca calcolo
 *      e segnala chiaramente la dimensione massima disponibile.
 *   4. Griglia vuota → prezzo non calcolabile, nessun fallback.
 */
type GridLookupResult =
  | { kind: "exact"; cell: GridCell }
  | { kind: "round_up"; cell: GridCell }
  | { kind: "out_of_range"; maxX: number; maxY: number }
  | { kind: "empty_grid" };

function findGridCell(
  w: number,
  h: number,
  cells: GridCell[],
): GridLookupResult {
  if (cells.length === 0) return { kind: "empty_grid" };

  // 1. Match esatto
  const exact = cells.find((c) => c.valore_x === w && c.valore_y === h);
  if (exact) return { kind: "exact", cell: exact };

  // 2. Round-up: cella più piccola che contiene W×H
  const containing = cellaGriglia(cells.map(c => ({ ...c, prezzo_acquisto_netto: c.prezzo_acquisto })), w, h);
  if (containing) {
    const best = cells.find(c => c.valore_x === containing.punto.valore_x && c.valore_y === containing.punto.valore_y)!;
    return { kind: "round_up", cell: best };
  }

  // 3. Fuori griglia: nessuna cella contiene W×H → segnala max disponibile
  const maxX = Math.max(...cells.map((c) => c.valore_x));
  const maxY = Math.max(...cells.map((c) => c.valore_y));
  return { kind: "out_of_range", maxX, maxY };
}

export function FamilyPricePreview({ family }: Props) {
  const companyId = useEffectiveCompanyId();
  const inputId = useId();

  // Selezione default dagli assi
  const initialSelection: AxisSelection = useMemo(() => {
    const sel: AxisSelection = {};
    for (const ax of family.axes) {
      const def = ax.values.find((v) => v.is_default && v.attivo) ?? ax.values.find((v) => v.attivo);
      if (def) sel[ax.codice] = def.id;
    }
    return normalizzaSelezione(family.axes, sel).valori;
  }, [family.axes]);

  const [selectedValues, setSelection] = useState<AxisSelection>(initialSelection);
  const selezioneBase = useMemo(() => normalizzaSelezione(family.axes, selectedValues).valori, [family.axes, selectedValues]);
  // #7 — Persistenza ultima simulazione su localStorage (per family.id).
  const lsKey = `eic:simulator:${family.id}`;
  type Persisted = { larghezza: string; altezza: string; quantita: string; unit: DimUnit };
  const persisted: Persisted | null = useMemo(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      return raw ? (JSON.parse(raw) as Persisted) : null;
    } catch {
      return null;
    }
  }, [lsKey]);

  const [larghezza, setLarghezza] = useState<string>(() => persisted?.larghezza ?? "1200");
  const [altezza, setAltezza] = useState<string>(() => persisted?.altezza ?? "1400");
  const [quantita, setQuantita] = useState<string>(() => persisted?.quantita ?? "1");
  const [unit, setUnit] = useState<DimUnit>(() => persisted?.unit ?? "mm");
  const [lunghezza, setLunghezza] = useState("1");

  // #6 — Mini-heatmap griglia (collapsible)
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);

  // #8 — Confronto multi-dimensione (max 3 alternative)
  type ComparisonRow = { id: string; w: string; h: string };
  const [comparisons, setComparisons] = useState<ComparisonRow[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(
        lsKey,
        JSON.stringify({ larghezza, altezza, quantita, unit }),
      );
    } catch {
      /* Safari Private Browsing */
    }
  }, [lsKey, larghezza, altezza, quantita, unit]);

  // #4 — Validazione client min/max (in mm normalizzato)
  const wMm = toMm(parseFloat(larghezza) || 0, unit);
  const hMm = toMm(parseFloat(altezza) || 0, unit);
  const wInvalid = !Number.isFinite(wMm) || wMm < MIN_DIM_MM || wMm > MAX_DIM_MM;
  const hInvalid = !Number.isFinite(hMm) || hMm < MIN_DIM_MM || hMm > MAX_DIM_MM;

  // #1 — Dimensioni standard ricavate dalla griglia (per dropdown smart-fill)
  // (Calcolato dopo gridCells, vedi sotto.)

  // Carica griglia se serve. Chiave sua (05/10/2026): queste righe non hanno
  // `id`, e sotto grid(id) l'editor della griglia le prendeva per le sue.
  const { data: gridCells = [], isLoading: gridLoading, isError: gridError } = useQuery({
    queryKey: queryKeys.articleFamilies.gridView(family.id, "anteprima"),
    enabled: !!companyId && !!family.id && family.modalita_prezzo_base === "griglia",
    queryFn: async (): Promise<GridCell[]> => {
      const { data, error } = await supabase
        .from("listino_griglia")
        .select("valore_x, valore_y, prezzo_vendita, prezzo_acquisto")
        .eq("family_id", family.id)
        .eq("company_id", companyId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as GridCell[];
    },
    staleTime: 60 * 1000,
  });

  const pricingGrid = useMemo(() => gridCells.map(c => ({
    ...c, prezzo_acquisto_netto: c.prezzo_acquisto,
  })), [gridCells]);
  const colori = useColoriFamiglia(family, selezioneBase, id => {
    const selections = { ...selezioneBase, colore: id };
    const p = calcolaPrezzoFamiglia({ family, selections, larghezza_mm: wMm, altezza_mm: hMm, lunghezza_ml: Number(lunghezza), quantita: 1 }, pricingGrid);
    return p.calcolo_disponibile !== false ? p.unit_price_vendita : applicaPrezzoOpzioni({ vendita: 1000, acquisto: 0, axes: family.axes, selections, mq: 1, ml: 1 }).vendita;
  });
  const selection = colori.selezione;
  const visibleAxes = assiVisibili(family.axes, selection);
  const showDims =
    family.modalita_prezzo_base === "griglia" || family.modalita_prezzo_base === "mq" ||
    visibleAxes.some(a => a.values.some(v => v.id === selection[a.codice] && v.maggiorazione_tipo === "fisso_mq"));
  const showLength = visibleAxes.some(a => a.values.some(v => v.id === selection[a.codice] && v.maggiorazione_tipo === "fisso_ml"));
  const lengthValid = Number.isFinite(Number(lunghezza)) && Number(lunghezza) > 0;
  // Anche le celle di confronto ricalcolano la fascia: a misure diverse un fisso può superare una percentuale.
  const selezioneAlleMisure = (w: number, h: number) => {
    if (!colori.asse || !colori.colori) return selection;
    const guida = guidaPrezzoColori(colori.asse, colori.colori, colori.catalogo, id => {
      const selections = { ...selezioneBase, colore: id };
      const p = calcolaPrezzoFamiglia({ family, selections, larghezza_mm: w, altezza_mm: h, quantita: 1, lunghezza_ml: Number(lunghezza) }, pricingGrid);
      return p.calcolo_disponibile !== false ? p.unit_price_vendita : null;
    });
    const selections = { ...selection };
    delete selections.colore;
    if (guida) selections.colore = guida.valueId;
    return selections;
  };

  // Nessuna formula locale: stessi importi e arrotondamenti del preventivo generico.
  const result = useMemo(() => {
    const w = wMm, h = hMm;
    const q = Number(quantita);
    const famigliaVisibile = { ...family, axes: visibleAxes };
    const input = { family: famigliaVisibile, selections: selection,
      larghezza_mm: w, altezza_mm: h, quantita: q,
      lunghezza_ml: Number(lunghezza) > 0 ? Number(lunghezza) : undefined };
    const calcolo = calcolaPrezzoFamiglia(input, pricingGrid);
    const base = calcolaPrezzoFamiglia({ ...input,
      family: { ...family, axes: [] }, selections: {}, quantita: 1 }, pricingGrid);
    const gridLookupInfo = family.modalita_prezzo_base === "griglia"
      ? findGridCell(w, h, gridCells) : null;
    const disponibile = !colori.stato?.blocca && calcolo.calcolo_disponibile !== false &&
      (!showDims || (!wInvalid && !hInvalid)) && (!showLength || lengthValid) &&
      (family.modalita_prezzo_base !== "griglia" || (!gridLoading && !gridError));
    const prezzoVendita = calcolo.unit_price_vendita;
    const prezzoAcquisto = calcolo.unit_price_acquisto;
    const mq = (w * h) / 1_000_000;
    const s1 = Number(family.sconto_fornitore_1 ?? 0);
    const s2 = Number(family.sconto_fornitore_2 ?? 0);
    const cella = gridLookupInfo && (gridLookupInfo.kind === "exact" || gridLookupInfo.kind === "round_up")
      ? gridLookupInfo.cell : null;
    const lordo = family.modalita_prezzo_base === "griglia"
      ? Number(cella?.prezzo_acquisto ?? 0)
      : Number(family.prezzo_base_acquisto) * (family.modalita_prezzo_base === "mq" ? mq : 1);
    const breakdown = family.prezzo_base_mode === "acquisto_markup" && disponibile
      ? { lordo, dopoS1: lordo * (1 - s1 / 100), netto: base.unit_price_acquisto,
          s1, s2, markupTipo: family.markup_tipo, markupValore: Number(family.markup_valore ?? 0),
          venditaBase: base.unit_price_vendita, maggiorazioneEuro: prezzoVendita - base.unit_price_vendita }
      : null;
    const margine = calcolo.totale_vendita - calcolo.totale_acquisto;
    return {
      base: base.unit_price_vendita, prezzoVendita, prezzoAcquisto,
      totVendita: calcolo.totale_vendita, totAcquisto: calcolo.totale_acquisto,
      margine, marginePerc: calcolo.totale_vendita > 0 ? margine / calcolo.totale_vendita * 100 : 0,
      costoCompleto: calcolo.costo_completo === true,
      warnings: calcolo.warnings.filter(w => !colori.stato?.avvisi.includes(w)), mq, breakdown, gridLookupInfo,
      outOfRange: calcolo.fuori_listino === true, disponibile,
    };
  }, [family, visibleAxes, gridCells, pricingGrid, selection, wMm, hMm, quantita, lunghezza, wInvalid, hInvalid, showDims, showLength, lengthValid, gridLoading, gridError, colori.stato]);

  // #1 — Liste W e H disponibili in griglia (per dropdown smart-fill)
  const availableWidths = useMemo(
    () => Array.from(new Set(gridCells.map((c) => c.valore_x))).sort((a, b) => a - b),
    [gridCells],
  );
  const availableHeights = useMemo(
    () => Array.from(new Set(gridCells.map((c) => c.valore_y))).sort((a, b) => a - b),
    [gridCells],
  );

  // Helpers per applicare dimensioni dal banner / dropdown (input mostra unità corrente)
  const setLarghezzaMm = (mm: number) => setLarghezza(String(fromMm(mm, unit)));
  const setAltezzaMm = (mm: number) => setAltezza(String(fromMm(mm, unit)));

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4" aria-hidden="true" />
          Simulatore prezzo
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Prova il prezzo con misure e varianti: prezzi IVA esclusa, posa esclusa.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {showDims ? (
          <div className="space-y-2">
            {/* #5 — Switch unità mm/cm/m + #1 dropdown dimensioni standard */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground">Unità:</span>
                {(["mm", "cm", "m"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      // Converti i valori correnti nella nuova unità (mantieni il valore in mm)
                      const wMmCurrent = toMm(parseFloat(larghezza) || 0, unit);
                      const hMmCurrent = toMm(parseFloat(altezza) || 0, unit);
                      setUnit(u);
                      if (wMmCurrent > 0) setLarghezza(String(fromMm(wMmCurrent, u)));
                      if (hMmCurrent > 0) setAltezza(String(fromMm(hMmCurrent, u)));
                      setComparisons(rows => rows.map(row => ({ ...row,
                        w: String(fromMm(toMm(Number(row.w), unit), u)),
                        h: String(fromMm(toMm(Number(row.h), unit), u)),
                      })));
                    }}
                    className={`px-2 py-0.5 rounded border ${
                      unit === u
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
              {availableWidths.length > 0 && availableHeights.length > 0 ? (
                <span className="text-[10px] text-muted-foreground">
                  Griglia: {availableWidths.length}W × {availableHeights.length}H
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor={`${inputId}-larghezza`} className="text-xs text-muted-foreground">Larghezza ({unit})</label>
                {availableWidths.length > 0 ? (
                  <Select
                    value={availableWidths.includes(wMm) ? String(wMm) : "_custom"}
                    onValueChange={(v) => {
                      if (v !== "_custom") setLarghezzaMm(parseFloat(v));
                    }}
                  >
                    <SelectTrigger className="h-8 mb-1">
                      <SelectValue placeholder="Standard…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_custom">— personalizzata —</SelectItem>
                      {availableWidths.map((w) => (
                        <SelectItem key={w} value={String(w)}>
                          {fromMm(w, unit)} {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Input
                  id={`${inputId}-larghezza`}
                  type="number"
                  value={larghezza}
                  onChange={(e) => setLarghezza(e.target.value)}
                  className={`h-8 ${wInvalid ? "border-destructive" : ""}`}
                  aria-invalid={wInvalid}
                />
                {wInvalid ? (
                  <p className="text-[10px] text-destructive mt-0.5">
                    Min {fromMm(MIN_DIM_MM, unit)} · Max {fromMm(MAX_DIM_MM, unit)} {unit}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor={`${inputId}-altezza`} className="text-xs text-muted-foreground">Altezza ({unit})</label>
                {availableHeights.length > 0 ? (
                  <Select
                    value={availableHeights.includes(hMm) ? String(hMm) : "_custom"}
                    onValueChange={(v) => {
                      if (v !== "_custom") setAltezzaMm(parseFloat(v));
                    }}
                  >
                    <SelectTrigger className="h-8 mb-1">
                      <SelectValue placeholder="Standard…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_custom">— personalizzata —</SelectItem>
                      {availableHeights.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {fromMm(h, unit)} {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Input
                  id={`${inputId}-altezza`}
                  type="number"
                  value={altezza}
                  onChange={(e) => setAltezza(e.target.value)}
                  className={`h-8 ${hInvalid ? "border-destructive" : ""}`}
                  aria-invalid={hInvalid}
                />
                {hInvalid ? (
                  <p className="text-[10px] text-destructive mt-0.5">
                    Min {fromMm(MIN_DIM_MM, unit)} · Max {fromMm(MAX_DIM_MM, unit)} {unit}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor={`${inputId}-quantita`} className="text-xs text-muted-foreground">Quantità</label>
                <Input
                  id={`${inputId}-quantita`}
                  type="number"
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  className="h-8"
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor={`${inputId}-quantita`} className="text-xs text-muted-foreground">Quantità</label>
            <Input
              id={`${inputId}-quantita`}
              type="number"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              className="h-8 w-24"
            />
          </div>
        )}

        {showLength ? <div>
          <label htmlFor={`${inputId}-lunghezza`} className="text-xs text-muted-foreground">Lunghezza (m)</label>
          <Input id={`${inputId}-lunghezza`} type="number" min="0" step="any" value={lunghezza}
            onChange={e => setLunghezza(e.target.value)} aria-invalid={!lengthValid} className="h-8 w-28" />
          <p className="text-xs text-muted-foreground">Sviluppo usato per i supplementi al metro lineare.</p>
        </div> : null}

        {family.axes.length > 0 ? (
          <div className="space-y-2">
            {visibleAxes.map((ax) => ax.codice === "colore" && colori.asse && colori.colori ? (
              <div key={ax.id} className="grid grid-cols-2 gap-3"><SceltaColoriDentroFuori asse={colori.asse} colori={colori.colori} catalogo={colori.catalogo} guidaId={colori.guida?.valueId} piuCaraId={colori.guida?.valueId} formato="listino" onChange={colori.cambia} onScrivi={colori.scrivi} onElenco={colori.elenco} /></div>
            ) : (
              <div key={ax.id}>
                <label className="text-xs text-muted-foreground">{ax.nome}</label>
                <Select
                  value={selection[ax.codice] ?? ""}
                  onValueChange={(v) =>
                    setSelection(normalizzaSelezione(family.axes, { ...selection, [ax.codice]: v }).valori)
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Seleziona…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ax.values
                      .filter((v) => v.attivo)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.label}
                          {v.maggiorazione_tipo !== "none"
                            ? suffissoMaggiorazione(v.maggiorazione_tipo, v.maggiorazione_valore)
                            : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        ) : null}

        {/* Stato griglia: banner colorato per esatto/round-up/out-of-range/empty */}
        {family.modalita_prezzo_base === "griglia" && (gridLoading || gridError) ? (
          <p role="status" className="text-xs text-muted-foreground">
            {gridError ? "Impossibile caricare la griglia prezzi. Riprova prima di simulare." : "Caricamento griglia prezzi…"}
          </p>
        ) : result.gridLookupInfo ? (
          <GridStatusBanner
            info={result.gridLookupInfo}
            requestedW={wMm}
            requestedH={hMm}
            onUseMax={
              result.outOfRange && availableWidths.length > 0 && availableHeights.length > 0
                ? () => {
                    const cell = gridCells.reduce((best, c) => c.valore_x * c.valore_y > best.valore_x * best.valore_y ? c : best);
                    setLarghezzaMm(cell.valore_x);
                    setAltezzaMm(cell.valore_y);
                  }
                : undefined
            }
          />
        ) : null}

        {result.warnings.length > 0 && !(family.modalita_prezzo_base === "griglia" && (gridLoading || gridError)) ? (
          <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-md p-2 space-y-0.5">
            {result.warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        ) : null}

        {/* #6 — Mini-heatmap griglia (collapsible, click cella → carica nel form) */}
        {family.modalita_prezzo_base === "griglia" && gridCells.length > 0 ? (
          <div className="border rounded-md bg-background">
            <button
              type="button"
              onClick={() => setShowHeatmap((s) => !s)}
              className="w-full px-3 py-1.5 text-xs font-medium flex items-center justify-between hover:bg-muted/40"
            >
              <span>📐 Griglia disponibile ({availableWidths.length}×{availableHeights.length} celle)</span>
              <span className="text-muted-foreground">{showHeatmap ? "▼" : "▶"}</span>
            </button>
            {showHeatmap ? (
              <div className="px-3 pb-3 overflow-x-auto">
                <table className="text-[10px] border-collapse">
                  <thead>
                    <tr>
                      <th className="border-b border-r p-1 bg-muted/40 sticky left-0">H \ W</th>
                      {availableWidths.map((w) => (
                        <th key={w} className="border-b p-1 bg-muted/40 font-mono">
                          {fromMm(w, unit)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {availableHeights.map((h) => (
                      <tr key={h}>
                        <th className="border-r p-1 bg-muted/40 font-mono sticky left-0">
                          {fromMm(h, unit)}
                        </th>
                        {availableWidths.map((w) => {
                          const cell = gridCells.find(
                            (c) => c.valore_x === w && c.valore_y === h,
                          );
                          const prezzoCella = cell ? calcolaPrezzoFamiglia({
                            family: { ...family, axes: visibleAxes }, selections: selezioneAlleMisure(w, h),
                            larghezza_mm: w, altezza_mm: h, quantita: 1,
                            lunghezza_ml: lengthValid ? Number(lunghezza) : undefined,
                          }, pricingGrid) : null;
                          const isCurrent = wMm === w && hMm === h;
                          return (
                            <td
                              key={`${w}-${h}`}
                              className={`p-1 text-center border ${
                                isCurrent
                                  ? "bg-primary/30 ring-2 ring-primary"
                                  : cell
                                    ? "bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 cursor-pointer"
                                    : "bg-rose-50 dark:bg-rose-900/10 text-muted-foreground"
                              }`}
                              onClick={() => {
                                if (cell) {
                                  setLarghezzaMm(w);
                                  setAltezzaMm(h);
                                }
                              }}
                              title={
                                cell
                                  ? `${w}×${h} mm: ${!showLength || lengthValid ? formatEur(prezzoCella!.unit_price_vendita) : "lunghezza da impostare"}`
                                  : `${w}×${h} mm: non disponibile`
                              }
                            >
                              {cell ? "✓" : "·"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Click su una cella verde per caricarla nel simulatore.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Breakdown tabellare per mode=acquisto_markup — nascosto se fuori griglia */}
        {result.breakdown && !result.outOfRange ? (
          <div className="border rounded-md overflow-hidden bg-background">
            <div className="bg-muted/40 px-3 py-1.5 text-xs font-medium">
              Breakdown prezzo (acquisto → vendita)
            </div>
            <div className="divide-y text-sm">
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-muted-foreground">Listino fornitore (lordo)</span>
                <span className="font-mono">{formatEur(result.breakdown.lordo)}</span>
              </div>
              {result.breakdown.s1 > 0 ? (
                <div className="flex justify-between px-3 py-1.5 text-emerald-700 dark:text-emerald-400">
                  <span>− Sconto 1 ({result.breakdown.s1}%)</span>
                  <span className="font-mono">
                    −{formatEur(result.breakdown.lordo - result.breakdown.dopoS1)}
                  </span>
                </div>
              ) : null}
              {result.breakdown.s2 > 0 ? (
                <div className="flex justify-between px-3 py-1.5 text-emerald-700 dark:text-emerald-400">
                  <span>− Sconto 2 cascata ({result.breakdown.s2}%)</span>
                  <span className="font-mono">
                    −{formatEur(result.breakdown.dopoS1 - result.breakdown.netto)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between px-3 py-1.5 bg-muted/20 font-medium">
                <span>= Acquisto netto</span>
                <span className="font-mono">{formatEur(result.breakdown.netto)}</span>
              </div>
              {result.breakdown.markupTipo !== "none" ? (
                <div className="flex justify-between px-3 py-1.5 text-amber-700 dark:text-amber-400">
                  <span>
                    + Markup{" "}
                    {result.breakdown.markupTipo === "percentuale"
                      ? `${result.breakdown.markupValore}%`
                      : `${formatEur(result.breakdown.markupValore)}/pz`}
                  </span>
                  <span className="font-mono">
                    +{formatEur(result.breakdown.venditaBase - result.breakdown.netto)}
                  </span>
                </div>
              ) : null}
              {Math.abs(result.breakdown.maggiorazioneEuro) > 0.001 ? (
                <div className="flex justify-between px-3 py-1.5 text-indigo-700 dark:text-indigo-400">
                  <span>+ Maggiorazioni variabili</span>
                  <span className="font-mono">
                    {result.breakdown.maggiorazioneEuro >= 0 ? "+" : ""}
                    {formatEur(result.breakdown.maggiorazioneEuro)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between px-3 py-1.5 bg-primary/10 font-semibold">
                <span>= Vendita unitaria</span>
                <span className="font-mono text-primary">
                  {formatEur(result.prezzoVendita)}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {!result.disponibile ? (
          <div className="border-t pt-3 text-sm text-muted-foreground">
            Calcolo non disponibile: verifica quantità, misure, colori e griglia prezzi.
          </div>
        ) : (
          <div className="border-t pt-3 space-y-1 text-sm">
            {!result.breakdown ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prezzo base</span>
                  <span className="font-mono">{formatEur(result.base)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendita unitario</span>
                  <span className="font-mono">{formatEur(result.prezzoVendita)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Acquisto unitario</span>
                  <span className="font-mono text-muted-foreground">
                    {result.costoCompleto ? formatEur(result.prezzoAcquisto) : "Da impostare"}
                  </span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>Totale vendita ({quantita} pz)</span>
              <span className="font-mono text-primary">{formatEur(result.totVendita)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {result.costoCompleto
                  ? `Margine: ${formatEur(result.margine)} (${result.marginePerc.toFixed(1)}%)`
                  : "Margine non calcolabile: manca il costo fornitore."}
              </span>
              {showDims ? (
                <span className="text-muted-foreground">
                  {result.mq.toFixed(2)} m²
                </span>
              ) : null}
            </div>
            {/* #3 — Prezzo per m² come info aggiuntiva */}
            {showDims && result.mq > 0 && result.prezzoVendita > 0 ? (
              <div className="flex justify-between text-xs pt-0.5">
                <span className="text-muted-foreground">Prezzo vendita / m²</span>
                <span className="font-mono text-muted-foreground">
                  {formatEur(result.prezzoVendita / result.mq)}/m²
                </span>
              </div>
            ) : null}
          </div>
        )}

        {/* #8 — Confronto multi-dimensione (max 3 alternative side-by-side) */}
        {showDims && family.modalita_prezzo_base === "griglia" && gridCells.length > 0 ? (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Confronto dimensioni</span>
              {comparisons.length < 3 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    setComparisons((prev) => [
                      ...prev,
                      { id: crypto.randomUUID(), w: larghezza, h: altezza },
                    ])
                  }
                >
                  + Aggiungi confronto
                </Button>
              ) : null}
            </div>
            {comparisons.length > 0 ? (
              <div className="space-y-1.5">
                {comparisons.map((c) => {
                  const cWMm = toMm(parseFloat(c.w) || 0, unit);
                  const cHMm = toMm(parseFloat(c.h) || 0, unit);
                  const cLookup =
                    cWMm > 0 && cHMm > 0
                      ? findGridCell(cWMm, cHMm, gridCells)
                      : null;
                  const confronto = calcolaPrezzoFamiglia({
                    family: { ...family, axes: visibleAxes }, selections: selezioneAlleMisure(cWMm, cHMm),
                    larghezza_mm: cWMm, altezza_mm: cHMm, quantita: 1,
                    lunghezza_ml: Number(lunghezza) > 0 ? Number(lunghezza) : undefined,
                  }, pricingGrid);
                  const cellPrice = cLookup && (cLookup.kind === "exact" || cLookup.kind === "round_up") && confronto.calcolo_disponibile !== false && (!showLength || lengthValid) && !gridLoading && !gridError
                    ? confronto.unit_price_vendita : null;
                  const delta = cellPrice !== null && result.prezzoVendita > 0
                    ? cellPrice - result.prezzoVendita
                    : null;
                  return (
                    <div key={c.id} className="flex items-center gap-1.5 text-xs">
                      <Input
                        type="number"
                        value={c.w}
                        onChange={(e) =>
                          setComparisons((prev) =>
                            prev.map((p) => (p.id === c.id ? { ...p, w: e.target.value } : p)),
                          )
                        }
                        placeholder={`W (${unit})`}
                        className="h-7 w-20 text-xs"
                      />
                      <span className="text-muted-foreground">×</span>
                      <Input
                        type="number"
                        value={c.h}
                        onChange={(e) =>
                          setComparisons((prev) =>
                            prev.map((p) => (p.id === c.id ? { ...p, h: e.target.value } : p)),
                          )
                        }
                        placeholder={`H (${unit})`}
                        className="h-7 w-20 text-xs"
                      />
                      <span className="font-mono ml-auto">
                        {cellPrice !== null ? formatEur(cellPrice) : "—"}
                      </span>
                      {delta !== null ? (
                        <span
                          className={`font-mono w-16 text-right ${
                            delta > 0
                              ? "text-rose-600"
                              : delta < 0
                                ? "text-emerald-600"
                                : "text-muted-foreground"
                          }`}
                        >
                          {delta > 0 ? "+" : ""}
                          {formatEur(delta)}
                        </span>
                      ) : (
                        <span className="w-16" />
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setComparisons((prev) => prev.filter((p) => p.id !== c.id))
                        }
                        className="text-muted-foreground hover:text-destructive px-1"
                        aria-label="Rimuovi confronto"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Aggiungi una riga per confrontare il prezzo con un'altra dimensione.
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Banner che comunica all'utente come è stata risolta la richiesta W×H sulla
 * griglia: esatto / round-up / fuori griglia / griglia vuota.
 */
function GridStatusBanner({
  info,
  requestedW,
  requestedH,
  onUseMax,
}: {
  info: GridLookupResult;
  requestedW: number;
  requestedH: number;
  onUseMax?: () => void;
}) {
  if (info.kind === "exact") {
    return (
      <div className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-md p-2 flex items-center gap-2">
        <span aria-hidden>✓</span>
        <span>
          Dimensione esatta in griglia ({info.cell.valore_x}×{info.cell.valore_y} mm).
        </span>
      </div>
    );
  }
  if (info.kind === "round_up") {
    const sizeUp =
      info.cell.valore_x !== requestedW || info.cell.valore_y !== requestedH;
    return (
      <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md p-2 space-y-1">
        <div className="flex items-center gap-2 font-medium">
          <span aria-hidden>⚠</span>
          <span>Dimensione non in griglia — applicato prezzo cella superiore.</span>
        </div>
        {sizeUp ? (
          <div className="text-[11px] opacity-90 pl-5">
            Richiesta: <strong>{requestedW}×{requestedH}</strong> mm — Cella usata: <strong>{info.cell.valore_x}×{info.cell.valore_y}</strong> mm. Il pezzo sarà tagliato dalla misura standard.
          </div>
        ) : null}
      </div>
    );
  }
  if (info.kind === "out_of_range") {
    return (
      <div className="text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-md p-2 space-y-2 border border-rose-200 dark:border-rose-900">
        <div className="flex items-center gap-2 font-medium">
          <span aria-hidden>✕</span>
          <span>Dimensione fuori griglia: prezzo non calcolabile.</span>
        </div>
        <div className="text-[11px] opacity-90 pl-5">
          Richiesta: <strong>{requestedW}×{requestedH}</strong> mm — Massimo disponibile in griglia: <strong>{info.maxX}×{info.maxY}</strong> mm. Riduci le misure o richiedi un'offerta speciale al fornitore.
        </div>
        {onUseMax ? (
          <div className="pl-5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onUseMax}>
              Usa una misura presente in griglia
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  // empty_grid
  return (
    <div className="text-xs text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 rounded-md p-2 flex items-center gap-2">
      <span aria-hidden>ℹ</span>
      <span>
        Griglia non configurata — prezzo non calcolabile. Configura la griglia prima di usare il prodotto.
      </span>
    </div>
  );
}
