/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.6
 *
 * Preview live del prezzo di un'istanza famiglia. Versione interim (la logica
 * definitiva pura sarà in FASE 5: useFamilyPricing). Qui applichiamo una
 * formula semplice coerente con la spec:
 *
 *   prezzo_base = lookup griglia(L, H) ∨ prezzo_base_vendita ∨ 0
 *   per ogni asse selezionato:
 *     se maggiorazione.percentuale: prezzo_base *= (1 + v/100)
 *     se maggiorazione.fisso_*    : prezzo_base += v  (unità coerente con UM)
 *
 * La formula avverte l'utente che è provvisoria. Non deve essere usata al di
 * fuori dell'editor.
 */

import { useEffect, useMemo, useState } from "react";
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
import { applyScontiFornitore, applyMarkup } from "@/lib/priceMarkup";
import type { FamilyWithAxes, AxisSelection } from "@/types/articleFamily";

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
    maximumFractionDigits: 2,
  }).format(n);
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
 *   4. Griglia vuota → fallback su prezzo_base_*.
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
  const containing = cells.filter((c) => c.valore_x >= w && c.valore_y >= h);
  if (containing.length > 0) {
    const best = containing.reduce(
      (min, c) =>
        c.valore_x * c.valore_y < min.valore_x * min.valore_y ? c : min,
      containing[0],
    );
    return { kind: "round_up", cell: best };
  }

  // 3. Fuori griglia: nessuna cella contiene W×H → segnala max disponibile
  const maxX = Math.max(...cells.map((c) => c.valore_x));
  const maxY = Math.max(...cells.map((c) => c.valore_y));
  return { kind: "out_of_range", maxX, maxY };
}

export function FamilyPricePreview({ family }: Props) {
  const companyId = useEffectiveCompanyId();

  // Selezione default dagli assi
  const initialSelection: AxisSelection = useMemo(() => {
    const sel: AxisSelection = {};
    for (const ax of family.axes) {
      const def = ax.values.find((v) => v.is_default) ?? ax.values[0];
      if (def) sel[ax.codice] = def.id;
    }
    return sel;
  }, [family.axes]);

  const [selection, setSelection] = useState<AxisSelection>(initialSelection);
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
  const wInvalid = wMm > 0 && (wMm < MIN_DIM_MM || wMm > MAX_DIM_MM);
  const hInvalid = hMm > 0 && (hMm < MIN_DIM_MM || hMm > MAX_DIM_MM);

  // #1 — Dimensioni standard ricavate dalla griglia (per dropdown smart-fill)
  // (Calcolato dopo gridCells, vedi sotto.)

  // Carica griglia se serve
  const { data: gridCells = [] } = useQuery({
    queryKey: queryKeys.articleFamilies.grid(family.id),
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

  // Calcolo (sempre in mm: wMm/hMm sono già normalizzati)
  const result = useMemo(() => {
    const w = wMm;
    const h = hMm;
    const q = parseFloat(quantita) || 1;
    const warnings: string[] = [];

    // Flag: strategia prezzo a livello famiglia.
    const isAcquistoMarkup = family.prezzo_base_mode === "acquisto_markup";
    const s1 = Number(family.sconto_fornitore_1 ?? 0);
    const s2 = Number(family.sconto_fornitore_2 ?? 0);
    const scontiAttivi = s1 > 0 || s2 > 0;

    // Step 1 — prezzo base LORDO (o prezzoVendita diretto) secondo modalità_prezzo_base
    let baseLordoAcquisto = 0; // listino fornitore se mode=acquisto_markup
    let baseVendita = 0; // solo se mode=vendita diretta
    // M4 (audit): flag che indica se siamo caduti in fallback su prezzo_base_*
    //   (vs lookup griglia diretto). In quel caso la vendita "diretta" deve
    //   essere trattata come baseline, ma se siamo in acquisto_markup dobbiamo
    //   comunque applicare il markup — coerenza con la policy famiglia.
    let inFallback = false;
    // Info per la UI (riquadro dimensione griglia usata)
    let gridLookupInfo: GridLookupResult | null = null;
    let outOfRange = false;
    if (family.modalita_prezzo_base === "griglia") {
      gridLookupInfo = findGridCell(w, h, gridCells);
      switch (gridLookupInfo.kind) {
        case "exact":
          baseVendita = Number(gridLookupInfo.cell.prezzo_vendita);
          baseLordoAcquisto = Number(gridLookupInfo.cell.prezzo_acquisto);
          break;
        case "round_up": {
          const c = gridLookupInfo.cell;
          baseVendita = Number(c.prezzo_vendita);
          baseLordoAcquisto = Number(c.prezzo_acquisto);
          warnings.push(
            `Dimensione richiesta ${w}×${h} mm non in griglia — applicato prezzo della cella superiore ${c.valore_x}×${c.valore_y} mm (taglio dalla misura standard).`,
          );
          break;
        }
        case "out_of_range":
          outOfRange = true;
          baseVendita = 0;
          baseLordoAcquisto = 0;
          warnings.push(
            `Dimensione ${w}×${h} mm fuori griglia: massimo disponibile ${gridLookupInfo.maxX}×${gridLookupInfo.maxY} mm. Riduci le misure o contatta il fornitore per dimensioni speciali.`,
          );
          break;
        case "empty_grid":
          inFallback = true;
          baseVendita = Number(family.prezzo_base_vendita);
          baseLordoAcquisto = Number(family.prezzo_base_acquisto);
          warnings.push(
            "Griglia non configurata — uso prezzo base famiglia. Configura la griglia per prezzi precisi.",
          );
          break;
      }
    } else if (family.modalita_prezzo_base === "mq") {
      const mq = (w * h) / 1_000_000; // mm² → m²
      baseVendita = Number(family.prezzo_base_vendita) * mq;
      baseLordoAcquisto = Number(family.prezzo_base_acquisto) * mq;
    } else {
      baseVendita = Number(family.prezzo_base_vendita);
      baseLordoAcquisto = Number(family.prezzo_base_acquisto);
    }

    // M4 (audit): degrade graceful quando siamo in fallback, in acquisto_markup
    //   e l'admin NON ha impostato `prezzo_base_acquisto`. In quel caso
    //   `baseLordoAcquisto` è 0 e dopo applyMarkup la vendita diventerebbe 0 —
    //   esperienza pessima. Preferiamo usare direttamente `prezzo_base_vendita`
    //   e avvisare che il markup non è stato applicato.
    if (inFallback && isAcquistoMarkup && baseLordoAcquisto === 0 && baseVendita > 0) {
      warnings.push(
        "prezzo_base_acquisto a 0: uso direttamente prezzo_base_vendita del fallback (markup non applicato).",
      );
    }

    // Step 2 — applica cascata sconti fornitore (solo se mode=acquisto_markup)
    //   lordo × (1 - s1/100) × (1 - s2/100) = netto
    const baseNettoAcquisto = isAcquistoMarkup && scontiAttivi
      ? applyScontiFornitore(baseLordoAcquisto, s1, s2)
      : baseLordoAcquisto; // se no sconti, "lordo" coincide con netto

    // Step 3 — ricalcola vendita da markup sul netto (quando mode=acquisto_markup)
    //   Questo rende il simulatore coerente con la policy famiglia, evitando
    //   di mostrare valori stale se la grid è stata salvata prima di cambiare
    //   markup/sconti.
    //   M4 (audit): se siamo in fallback e non c'è acquisto, non possiamo
    //   applicare il markup — cadiamo su `baseVendita` direttamente.
    const canApplyMarkup = isAcquistoMarkup && baseNettoAcquisto > 0;
    const baseVenditaCalcolata = canApplyMarkup
      ? applyMarkup({
          prezzoAcquisto: baseNettoAcquisto,
          markupTipo: family.markup_tipo,
          markupValore: Number(family.markup_valore ?? 0),
        }).prezzoVendita
      : baseVendita;

    // Step 4 — applica maggiorazioni assi su vendita e acquisto NETTO
    let prezzoVendita = baseVenditaCalcolata;
    let prezzoAcquisto = baseNettoAcquisto;

    const mq = (w * h) / 1_000_000;
    const ml = w / 1000;
    const mc = (w * h * 1000) / 1_000_000_000;

    // Pass 1: percentuali
    for (const ax of family.axes) {
      const selId = selection[ax.codice];
      if (!selId) continue;
      const v = ax.values.find((x) => x.id === selId);
      if (!v || v.maggiorazione_tipo !== "percentuale") continue;
      prezzoVendita *= 1 + Number(v.maggiorazione_valore) / 100;
      prezzoAcquisto *= 1 + Number(v.maggiorazione_acquisto) / 100;
    }

    // Pass 2: fisse
    for (const ax of family.axes) {
      const selId = selection[ax.codice];
      if (!selId) continue;
      const v = ax.values.find((x) => x.id === selId);
      if (!v || v.maggiorazione_tipo === "none" || v.maggiorazione_tipo === "percentuale") continue;
      const vendAdd = Number(v.maggiorazione_valore);
      const acqAdd = Number(v.maggiorazione_acquisto);
      switch (v.maggiorazione_tipo) {
        case "fisso_pz":
          prezzoVendita += vendAdd;
          prezzoAcquisto += acqAdd;
          break;
        case "fisso_mq":
          prezzoVendita += vendAdd * mq;
          prezzoAcquisto += acqAdd * mq;
          break;
        case "fisso_ml":
          prezzoVendita += vendAdd * ml;
          prezzoAcquisto += acqAdd * ml;
          break;
        case "fisso_mc":
          prezzoVendita += vendAdd * mc;
          prezzoAcquisto += acqAdd * mc;
          break;
      }
    }

    const totVendita = prezzoVendita * q;
    const totAcquisto = prezzoAcquisto * q;
    const margine = totVendita - totAcquisto;
    const marginePerc = totVendita > 0 ? (margine / totVendita) * 100 : 0;

    // Dati per il breakdown tabellare (solo mode=acquisto_markup)
    const breakdown = isAcquistoMarkup
      ? {
          lordo: baseLordoAcquisto,
          dopoS1: s1 > 0 ? baseLordoAcquisto * (1 - s1 / 100) : baseLordoAcquisto,
          netto: baseNettoAcquisto,
          s1,
          s2,
          markupTipo: family.markup_tipo,
          markupValore: Number(family.markup_valore ?? 0),
          venditaBase: baseVenditaCalcolata,
          maggiorazioneEuro: prezzoVendita - baseVenditaCalcolata,
        }
      : null;

    return {
      base: baseVenditaCalcolata,
      prezzoVendita,
      prezzoAcquisto,
      totVendita,
      totAcquisto,
      margine,
      marginePerc,
      warnings,
      mq,
      breakdown,
      gridLookupInfo,
      outOfRange,
    };
  }, [family, gridCells, selection, wMm, hMm, quantita]);

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

  const showDims =
    family.modalita_prezzo_base === "griglia" || family.modalita_prezzo_base === "mq";

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4" aria-hidden="true" />
          Simulatore prezzo
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Preview indicativa — il motore di calcolo definitivo è in FASE 5.
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
                <label className="text-xs text-muted-foreground">Larghezza ({unit})</label>
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
                <label className="text-xs text-muted-foreground">Altezza ({unit})</label>
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
                <label className="text-xs text-muted-foreground">Quantità</label>
                <Input
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
            <label className="text-xs text-muted-foreground">Quantità</label>
            <Input
              type="number"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              className="h-8 w-24"
            />
          </div>
        )}

        {family.axes.length > 0 ? (
          <div className="space-y-2">
            {family.axes.map((ax) => (
              <div key={ax.id}>
                <label className="text-xs text-muted-foreground">{ax.nome}</label>
                <Select
                  value={selection[ax.codice] ?? ""}
                  onValueChange={(v) =>
                    setSelection({ ...selection, [ax.codice]: v })
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
                            ? v.maggiorazione_tipo === "percentuale"
                              ? ` (+${v.maggiorazione_valore}%)`
                              : ` (+${v.maggiorazione_valore} €)`
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
        {result.gridLookupInfo ? (
          <GridStatusBanner
            info={result.gridLookupInfo}
            requestedW={wMm}
            requestedH={hMm}
            availableWidths={availableWidths}
            availableHeights={availableHeights}
            onUseMax={
              result.outOfRange && availableWidths.length > 0 && availableHeights.length > 0
                ? () => {
                    const maxW = Math.max(...availableWidths);
                    const maxH = Math.max(...availableHeights);
                    setLarghezzaMm(maxW);
                    setAltezzaMm(maxH);
                  }
                : undefined
            }
          />
        ) : null}

        {result.warnings.length > 0 && !result.gridLookupInfo ? (
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
                                  ? `${w}×${h} mm: ${formatEur(cell.prezzo_vendita ?? 0)}`
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

        {result.outOfRange ? (
          <div className="border-t pt-3 text-sm text-muted-foreground">
            Calcolo non disponibile per questa dimensione — vedi avviso sopra.
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
                    {formatEur(result.prezzoAcquisto)}
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
                Margine: {formatEur(result.margine)} ({result.marginePerc.toFixed(1)}%
                {result.breakdown ? " su vendita, vs netto" : ""})
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
                      ? lookupGridPrice(gridCells, cWMm, cHMm)
                      : null;
                  const cellPrice = cLookup && (cLookup.kind === "exact" || cLookup.kind === "round_up")
                    ? cLookup.cell.prezzo_vendita ?? null
                    : null;
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
  availableWidths,
  availableHeights,
  onUseMax,
}: {
  info: GridLookupResult;
  requestedW: number;
  requestedH: number;
  availableWidths?: number[];
  availableHeights?: number[];
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
              Usa dimensione max disponibile ({info.maxX}×{info.maxY} mm)
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
        Griglia non configurata — calcolo da prezzo base famiglia. Configura la griglia per prezzi precisi.
      </span>
    </div>
  );
}
