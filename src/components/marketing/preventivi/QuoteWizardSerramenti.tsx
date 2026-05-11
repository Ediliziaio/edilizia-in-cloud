/**
 * FASE 9 — Wizard Serramentista
 *
 * Dialog-based 4-step wizard per aggiungere un'istanza di famiglia al preventivo.
 * Input: familyCatalog (da useFamilies), companyId, overhead_pct.
 * Output: onAddItems(items: QuoteItemPro[]) — prodotto + eventuale posa.
 *
 * Steps:
 *  1. Selezione famiglia (grid di card) + linea prodotto fornitore (STEP 6)
 *  2. Misure + quantità (L×H mm, qty) — skippato se modalità=pz senza misure
 *  3. Configurazione assi (dropdown per ogni asse)
 *  4. Riepilogo + aggiungi (unit_price + totale + maggiorazioni applicate)
 *
 * Single source of truth resta `items[]` di QuoteBuilder; il wizard NON salva
 * nulla in DB, passa solo QuoteItemPro[] al parent via callback.
 *
 * STEP 6 Listini Serramenti Avanzati:
 *  - Se per la famiglia selezionata esistono celle di griglia con una o più
 *    linee prodotto fornitore, il wizard mostra un selettore "Linea prodotto".
 *  - Il prezzo vendita viene derivato da `prezzo_acquisto × (1 + ricarico_linea)`
 *    perché listino_griglia contiene il LISTINO come `prezzo_vendita`.
 *  - Il fornitore + linea scelti vengono persistiti su quote_items per
 *    rigenerazione coerente in modifica e per calcolo margine atteso.
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Check, Package, AlertCircle } from "lucide-react";
import { useFamilies } from "@/hooks/useFamilies";
import {
  useFamilyGrid,
  calcolaPrezzoFamiglia,
  adjustGridForRicarico,
} from "@/hooks/useFamilyPricing";
import { useSupplierProductLines } from "@/features/serramenti-listini";
import { formatCurrency } from "@/lib/formatters";
import type { FamilyWithAxes, AxisSelection } from "@/types/articleFamily";
import type { QuoteItemPro } from "@/types/quoteItem";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";

interface Props {
  open: boolean;
  onClose: () => void;
  onAddItems: (items: QuoteItemPro[], nextSortOrder: number) => void;
  currentSortOrder: number;
  tariffe: TariffaPro[];
}

type Step = 1 | 2 | 3 | 4;

export default function QuoteWizardSerramenti({
  open,
  onClose,
  onAddItems,
  currentSortOrder,
  tariffe,
}: Props) {
  const { families, isLoading } = useFamilies();
  const [step, setStep] = useState<Step>(1);
  const [selectedFamily, setSelectedFamily] = useState<FamilyWithAxes | null>(null);
  const [larghezza, setLarghezza] = useState("1200");
  const [altezza, setAltezza] = useState("1400");
  const [quantita, setQuantita] = useState("1");
  const [selection, setSelection] = useState<AxisSelection>({});
  const [search, setSearch] = useState("");
  // STEP 6: linea prodotto selezionata (null = legacy, usa prezzo_vendita as-is).
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const { data: grigliaPunti = [] } = useFamilyGrid(selectedFamily?.id);

  // STEP 6: tutte le linee prodotto dell'azienda (cached 5 min).
  // Servono per: (a) mostrare label fornitore/linea, (b) leggere ricarico_default
  // per applicare la formula sconto/ricarico sul prezzo finale.
  const { lines: allLines } = useSupplierProductLines();

  // Linee prodotto DISPONIBILI per la famiglia: intersezione tra le linee
  // configurate in azienda e le linee effettivamente presenti nelle celle di
  // griglia della famiglia selezionata. Se vuoto → fallback legacy.
  const availableLines = useMemo(() => {
    if (!selectedFamily) return [];
    const idsInGrid = new Set(
      grigliaPunti
        .map((p) => p.supplier_product_line_id)
        .filter((id): id is string => !!id),
    );
    return allLines.filter((l) => idsInGrid.has(l.id) && l.attivo);
  }, [selectedFamily, grigliaPunti, allLines]);

  // Dettaglio linea scelta (null se nessuna o legacy). Serve per ricarico + IDs.
  const selectedLine = useMemo(
    () => availableLines.find((l) => l.id === selectedLineId) ?? null,
    [availableLines, selectedLineId],
  );

  // Griglia filtrata + prezzo vendita aggiustato via ricarico (STEP 6).
  const grigliaAdjusted = useMemo(() => {
    if (!selectedLine) return grigliaPunti;
    const filtered = grigliaPunti.filter(
      (p) => p.supplier_product_line_id === selectedLine.id,
    );
    return adjustGridForRicarico(filtered, selectedLine.ricarico_default);
  }, [grigliaPunti, selectedLine]);

  // Reset quando si apre/chiude
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedFamily(null);
      setSelectedLineId(null);
      setSearch("");
    }
  }, [open]);

  // Auto-seleziona la prima linea disponibile quando:
  //  - cambia famiglia → availableLines si aggiorna
  //  - non c'è ancora una selezione o la selezione corrente non è più valida
  useEffect(() => {
    if (availableLines.length === 0) {
      if (selectedLineId !== null) setSelectedLineId(null);
      return;
    }
    const stillValid = availableLines.some((l) => l.id === selectedLineId);
    if (!stillValid) {
      setSelectedLineId(availableLines[0].id);
    }
  }, [availableLines, selectedLineId]);

  // Inizializza selezioni assi con default quando si sceglie una famiglia.
  // NB: dipende volutamente solo da `selectedFamily?.id` — il parent potrebbe
  // re-instanziare l'oggetto famiglia a ogni render di useFamilies(); se
  // dipendessimo dall'oggetto intero perderemmo le selezioni dell'utente a
  // ogni invalidazione della query. Il set di assi cambia solo quando cambia
  // la famiglia, quindi `.id` è la vera key semantica.
  useEffect(() => {
    if (!selectedFamily) return;
    const sel: AxisSelection = {};
    for (const ax of selectedFamily.axes) {
      const def = ax.values.find((v) => v.is_default) ?? ax.values[0];
      if (def) sel[ax.codice] = def.id;
    }
    setSelection(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  const filteredFamilies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return families;
    return families.filter(
      (f) =>
        f.nome.toLowerCase().includes(q) ||
        (f.descrizione ?? "").toLowerCase().includes(q),
    );
  }, [families, search]);

  const needsXY =
    !!selectedFamily &&
    (selectedFamily.modalita_prezzo_base === "mq" ||
      selectedFamily.modalita_prezzo_base === "griglia");
  // NB: modalità lineare (lunghezza_ml) non esposta dal wizard. Quando servirà
  // aggiungere un input "Lunghezza (ml)", ripassare qui per popolare lunghezza_ml.

  const result = useMemo(() => {
    if (!selectedFamily) return null;
    return calcolaPrezzoFamiglia(
      {
        family: selectedFamily,
        selections: selection,
        larghezza_mm: needsXY ? parseFloat(larghezza) || 0 : undefined,
        altezza_mm: needsXY ? parseFloat(altezza) || 0 : undefined,
        lunghezza_ml: undefined,
        quantita: parseFloat(quantita) || 1,
      },
      // STEP 6: usa la griglia filtrata per linea + aggiustata con ricarico
      // quando disponibile. Fallback alla griglia intera per compat legacy.
      needsXY ? grigliaAdjusted : undefined,
    );
  }, [selectedFamily, selection, larghezza, altezza, quantita, grigliaAdjusted, needsXY]);

  const canAdvance = (): boolean => {
    if (step === 1) return !!selectedFamily;
    if (step === 2) {
      const q = parseFloat(quantita) || 0;
      if (q <= 0) return false;
      if (needsXY) {
        const l = parseFloat(larghezza);
        const a = parseFloat(altezza);
        // Misure devono essere numeri finiti nel range consigliato.
        if (!Number.isFinite(l) || l < 200 || l > 4000) return false;
        if (!Number.isFinite(a) || a < 200 || a > 4000) return false;
      }
      return true;
    }
    if (step === 3) {
      // tutti gli assi obbligatori devono avere una scelta
      if (!selectedFamily) return false;
      return selectedFamily.axes
        .filter((a) => a.obbligatorio)
        .every((a) => !!selection[a.codice]);
    }
    return true;
  };

  const handleConfirm = () => {
    if (!selectedFamily || !result) return;
    const qty = parseFloat(quantita) || 1;
    const items: QuoteItemPro[] = [];

    // Main row: prodotto
    const axisSummary = selectedFamily.axes
      .map((ax) => {
        const valId = selection[ax.codice];
        const v = ax.values.find((x) => x.id === valId);
        return v ? `${ax.nome}: ${v.label}` : null;
      })
      .filter(Boolean)
      .join(" · ");
    const dimSummary = needsXY ? `${larghezza}×${altezza}mm` : "";
    const description = [dimSummary, axisSummary].filter(Boolean).join(" — ");

    items.push({
      item_type: "product",
      item_category: "prodotto",
      name: selectedFamily.nome,
      description,
      quantity: qty,
      unit_price: result.unit_price_vendita,
      discount_percent: 0,
      vat_rate: selectedFamily.vat_rate,
      unit_of_measure: selectedFamily.unit_of_measure,
      sort_order: currentSortOrder,
      article_template_id: null,
      tariffa_id: null,
      prezzo_acquisto: result.unit_price_acquisto,
      mostra_nel_pdf: true,
      is_optional: false,
      misura_x: needsXY ? parseFloat(larghezza) || null : null,
      misura_y: needsXY ? parseFloat(altezza) || null : null,
      // Addendum P2-04: persisti configurazione famiglia serramentista, così
      // riaprendo il preventivo si sa esattamente quale famiglia e quali varianti
      // sono state scelte (evita perdita dati al salvataggio).
      family_id: selectedFamily.id,
      axis_selections: { ...selection },
      // STEP 6 Serramenti Avanzati: fornitore + linea per calcolo margine
      // atteso e rigenerazione prezzo in modifica. Null se l'utente non usa
      // la feature listini_serramenti_avanzati.
      supplier_catalog_id: selectedLine?.supplier_catalog_id ?? null,
      supplier_product_line_id: selectedLine?.id ?? null,
    });

    // Posa di default se presente
    if (selectedFamily.posa_tariffa_default_id) {
      const posaTariffa = tariffe.find(
        (t) => t.id === selectedFamily.posa_tariffa_default_id,
      );
      if (posaTariffa) {
        const posaQty = selectedFamily.posa_quantita_default * qty;
        items.push({
          item_type: "service",
          item_category: "posa",
          name: posaTariffa.nome,
          description: `Posa di ${selectedFamily.nome}`,
          quantity: posaQty,
          unit_price: posaTariffa.prezzo_vendita,
          discount_percent: 0,
          vat_rate: 22,
          unit_of_measure: posaTariffa.unita ?? "pz",
          sort_order: currentSortOrder + 1,
          article_template_id: null,
          tariffa_id: posaTariffa.id,
          prezzo_acquisto: posaTariffa.prezzo_costo ?? 0,
          mostra_nel_pdf: true,
          is_optional: false,
          _parentIdx: undefined, // sarà indicizzato dal parent
        });
      }
    }

    onAddItems(items, currentSortOrder + items.length);
    onClose();
  };

  const stepLabels: Record<Step, string> = {
    1: "Famiglia",
    2: "Misure",
    3: "Varianti",
    4: "Riepilogo",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="p-0 flex flex-col gap-0 w-[96vw] sm:w-full max-w-3xl h-[94vh] sm:h-auto sm:max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b bg-background space-y-3">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Package className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Wizard Serramentista — Step {step}/4
              <span className="hidden sm:inline text-muted-foreground font-normal">
                {" · "}{stepLabels[step]}
              </span>
            </span>
          </DialogTitle>

          <div
            className="space-y-1"
            role="progressbar"
            aria-label={`Avanzamento wizard: step ${step} di 4 — ${stepLabels[step]}`}
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={4}
          >
            <div className="flex gap-1.5">
              {([1, 2, 3, 4] as Step[]).map((s) => (
                <div
                  key={s}
                  aria-hidden="true"
                  className={`flex-1 h-1.5 rounded-full transition-colors ${
                    s <= step ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground sm:hidden" aria-hidden="true">
              {stepLabels[step]}
            </p>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-4 sm:px-6 py-4">
          {/* Step 1: Scelta famiglia */}
          {step === 1 && (
            <div className="space-y-3">
              <Label htmlFor="wizard-search" className="sr-only">
                Cerca famiglia
              </Label>
              <Input
                id="wizard-search"
                placeholder="Cerca famiglia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Cerca famiglia per nome o descrizione"
                className="h-10"
                autoComplete="off"
              />
              {isLoading && (
                <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  Caricamento…
                </p>
              )}
              {!isLoading && filteredFamilies.length === 0 && (
                <div className="text-center py-8 text-muted-foreground" role="status">
                  <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-30" aria-hidden="true" />
                  {search.trim() ? (
                    <>
                      <p>Nessuna famiglia corrisponde a «{search}».</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 h-9"
                        onClick={() => setSearch("")}
                      >
                        Pulisci ricerca
                      </Button>
                    </>
                  ) : (
                    <p>Nessuna famiglia disponibile. Creale in Impostazioni → Catalogo → Famiglie.</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                {filteredFamilies.map((f) => {
                  const isSelected = selectedFamily?.id === f.id;
                  return (
                    <Card
                      key={f.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`Seleziona famiglia ${f.nome}`}
                      className={`cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        isSelected
                          ? "ring-2 ring-primary bg-primary/5"
                          : "hover:border-primary/50 hover:shadow-sm"
                      }`}
                      onClick={() => setSelectedFamily(f)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedFamily(f);
                        }
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium break-words">{f.nome}</p>
                            {f.descrizione && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                {f.descrizione}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {isSelected && (
                              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                            )}
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {f.modalita_prezzo_base}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {f.axes.length} {f.axes.length === 1 ? "variabile" : "variabili"} · UM: {f.unit_of_measure}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* STEP 6: selettore linea prodotto (appare solo se ci sono
                   griglie configurate per la famiglia selezionata). */}
              {selectedFamily && availableLines.length > 0 && (
                <div className="rounded-md border p-3 bg-muted/20 space-y-2">
                  <Label htmlFor="wizard-linea-prodotto" className="text-sm font-medium">
                    Linea prodotto fornitore
                    {availableLines.length > 1 && (
                      <span className="text-destructive" aria-label="obbligatorio"> *</span>
                    )}
                  </Label>
                  <Select
                    value={selectedLineId ?? ""}
                    onValueChange={(v) => setSelectedLineId(v || null)}
                  >
                    <SelectTrigger
                      id="wizard-linea-prodotto"
                      aria-label="Seleziona linea prodotto fornitore"
                      className="h-10"
                    >
                      <SelectValue placeholder="Seleziona linea..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLines.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.nome}
                          <span className="ml-2 text-xs text-muted-foreground">
                            (ricarico +{Math.round((l.ricarico_default ?? 0) * 100)}%)
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Il prezzo di vendita viene calcolato applicando il ricarico
                    della linea al costo di acquisto (listino scontato).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Misure + quantità */}
          {step === 2 && selectedFamily && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 bg-muted/30">
                <p className="font-medium break-words">{selectedFamily.nome}</p>
                <p className="text-xs text-muted-foreground">
                  Modalità: {selectedFamily.modalita_prezzo_base}
                  {selectedLine && (
                    <>
                      {" · "}
                      <span className="font-medium">Linea: {selectedLine.nome}</span>
                    </>
                  )}
                </p>
              </div>

              {needsXY && (() => {
                const lNum = parseFloat(larghezza);
                const aNum = parseFloat(altezza);
                const lInvalid = !Number.isFinite(lNum) || lNum < 200 || lNum > 4000;
                const aInvalid = !Number.isFinite(aNum) || aNum < 200 || aNum > 4000;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="wizard-larghezza">
                        {selectedFamily.griglia_asse_x_label || "Larghezza"} (mm)
                      </Label>
                      <Input
                        id="wizard-larghezza"
                        type="number"
                        inputMode="numeric"
                        min={200}
                        max={4000}
                        value={larghezza}
                        onChange={(e) => setLarghezza(e.target.value)}
                        aria-invalid={lInvalid}
                        aria-describedby="wizard-larghezza-hint"
                        className="h-10"
                      />
                      <p
                        id="wizard-larghezza-hint"
                        className={`text-xs ${lInvalid ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        Range consigliato 200–4000 mm
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wizard-altezza">
                        {selectedFamily.griglia_asse_y_label || "Altezza"} (mm)
                      </Label>
                      <Input
                        id="wizard-altezza"
                        type="number"
                        inputMode="numeric"
                        min={200}
                        max={4000}
                        value={altezza}
                        onChange={(e) => setAltezza(e.target.value)}
                        aria-invalid={aInvalid}
                        aria-describedby="wizard-altezza-hint"
                        className="h-10"
                      />
                      <p
                        id="wizard-altezza-hint"
                        className={`text-xs ${aInvalid ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        Range consigliato 200–4000 mm
                      </p>
                    </div>
                  </div>
                );
              })()}

              {!needsXY && (
                <p className="text-sm text-muted-foreground italic">
                  Questa famiglia è a prezzo fisso per pezzo: nessuna misura richiesta.
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="wizard-quantita">Quantità</Label>
                <Input
                  id="wizard-quantita"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  aria-invalid={(parseFloat(quantita) || 0) <= 0}
                  aria-describedby={
                    (parseFloat(quantita) || 0) <= 0 ? "wizard-quantita-error" : undefined
                  }
                  className="h-10 sm:max-w-xs"
                />
                {(parseFloat(quantita) || 0) <= 0 && (
                  <p id="wizard-quantita-error" className="text-xs text-destructive">
                    Inserisci una quantità maggiore di zero.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Configurazione assi */}
          {step === 3 && selectedFamily && (
            <div className="space-y-3">
              {selectedFamily.axes.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  Questa famiglia non ha variabili configurabili.
                </p>
              )}
              {selectedFamily.axes.map((ax) => (
                <div key={ax.id} className="space-y-1.5">
                  <Label htmlFor={`wizard-axis-${ax.codice}`}>
                    {ax.nome}
                    {ax.obbligatorio && (
                      <span className="text-destructive" aria-label="obbligatorio"> *</span>
                    )}
                  </Label>
                  <Select
                    value={selection[ax.codice] ?? ""}
                    onValueChange={(v) =>
                      setSelection((prev) => ({ ...prev, [ax.codice]: v }))
                    }
                  >
                    <SelectTrigger
                      id={`wizard-axis-${ax.codice}`}
                      aria-label={ax.nome}
                      aria-required={ax.obbligatorio}
                      aria-describedby={ax.descrizione ? `wizard-axis-${ax.codice}-hint` : undefined}
                      className="h-10"
                    >
                      <SelectValue placeholder="Seleziona..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ax.values
                        .filter((v) => v.attivo)
                        .map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                            {v.maggiorazione_tipo !== "none" && v.maggiorazione_valore !== 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {v.maggiorazione_tipo === "percentuale"
                                  ? `(+${v.maggiorazione_valore}%)`
                                  : `(+${formatCurrency(v.maggiorazione_valore)})`}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {ax.descrizione && (
                    <p
                      id={`wizard-axis-${ax.codice}-hint`}
                      className="text-xs text-muted-foreground"
                    >
                      {ax.descrizione}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Step 4: Empty state se il calcolo non è possibile */}
          {step === 4 && (!selectedFamily || !result) && (
            <div className="text-center py-8 space-y-3" role="status">
              <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground opacity-50" aria-hidden="true" />
              <div>
                <p className="font-medium">Calcolo prezzo non disponibile</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Controlla le misure o la griglia prezzi della famiglia selezionata.
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                Torna alle misure
              </Button>
            </div>
          )}

          {/* Step 4: Riepilogo */}
          {step === 4 && selectedFamily && result && (
            <div className="space-y-3">
              <Card>
                <CardContent className="p-3 sm:p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Prodotto:</span>
                    <span className="font-medium text-right break-words">{selectedFamily.nome}</span>
                  </div>
                  {selectedLine && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-sm">
                      <span className="text-muted-foreground">Linea fornitore:</span>
                      <span className="font-medium sm:text-right break-words">
                        {selectedLine.nome}
                        <span className="ml-2 text-xs text-muted-foreground whitespace-nowrap">
                          (ricarico +{Math.round((selectedLine.ricarico_default ?? 0) * 100)}%)
                        </span>
                      </span>
                    </div>
                  )}
                  {needsXY && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">Dimensioni:</span>
                      <span className="font-mono text-right">
                        {larghezza}×{altezza} mm
                        {result.mq != null && ` (${result.mq.toFixed(3)} mq)`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Quantità:</span>
                    <span className="font-mono">{quantita}</span>
                  </div>
                  {result.prezzo_griglia_base != null && (
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground shrink-0">Prezzo base griglia:</span>
                      <span className="font-mono">{formatCurrency(result.prezzo_griglia_base)}</span>
                    </div>
                  )}

                  {result.maggiorazioni_applicate.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Maggiorazioni applicate:</p>
                      <div className="space-y-1">
                        {result.maggiorazioni_applicate.map((m, i) => (
                          <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-2 text-xs">
                            <span className="break-words">
                              {m.axis_codice}: {m.value_valore}
                              {" "}
                              <Badge variant="outline" className="ml-1 text-[10px] whitespace-nowrap">
                                {m.tipo === "percentuale" ? `+${m.valore}%` : `+${formatCurrency(m.valore)}`}
                              </Badge>
                            </span>
                            <span className="text-muted-foreground font-mono sm:text-right shrink-0">
                              Δ {formatCurrency(m.delta_vendita)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
                    <span className="font-medium">Prezzo unitario:</span>
                    <span className="font-semibold font-mono sm:text-right">
                      {formatCurrency(result.unit_price_vendita)} / {selectedFamily.unit_of_measure}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-lg">
                    <span className="font-medium">Totale:</span>
                    <span className="font-bold text-primary font-mono sm:text-right">
                      {formatCurrency(result.totale_vendita)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {result.warnings.length > 0 && (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30"
                  role="alert"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-sm text-amber-900 dark:text-amber-200 space-y-1 break-words">
                      {result.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedFamily.posa_tariffa_default_id && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <span aria-hidden="true">ℹ️</span>
                    <span>Verrà aggiunta anche una riga posa collegata (tariffa di default della famiglia).</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-2 border-t px-4 sm:px-6 py-3 bg-background">
          <Button
            variant="outline"
            onClick={() => (step > 1 ? setStep((step - 1) as Step) : onClose())}
            className="h-10 w-full sm:w-auto"
          >
            <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            {step === 1 ? "Annulla" : "Indietro"}
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep((step + 1) as Step)}
              disabled={!canAdvance()}
              className="h-10 w-full sm:w-auto"
            >
              Avanti <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          ) : (
            <Button onClick={handleConfirm} disabled={!result} className="h-10 w-full sm:w-auto">
              <Check className="h-4 w-4 mr-1" aria-hidden="true" />
              <span className="sm:hidden">Aggiungi</span>
              <span className="hidden sm:inline">Aggiungi al preventivo</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
