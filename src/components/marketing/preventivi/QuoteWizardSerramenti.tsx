/**
 * FASE 9 — Wizard Serramentista
 *
 * Dialog-based 4-step wizard per aggiungere un'istanza di famiglia al preventivo.
 * Input: familyCatalog (da useFamilies), companyId, overhead_pct.
 * Output: onAddItems(items: QuoteItemPro[]) — prodotto + eventuale posa.
 *
 * Steps:
 *  1. Selezione famiglia (grid di card)
 *  2. Misure + quantità (L×H mm, qty) — skippato se modalità=pz senza misure
 *  3. Configurazione assi (dropdown per ogni asse)
 *  4. Riepilogo + aggiungi (unit_price + totale + maggiorazioni applicate)
 *
 * Single source of truth resta `items[]` di QuoteBuilder; il wizard NON salva
 * nulla in DB, passa solo QuoteItemPro[] al parent via callback.
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
import { useFamilyGrid, calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";
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
  const [lunghezza, setLunghezza] = useState("0");
  const [quantita, setQuantita] = useState("1");
  const [selection, setSelection] = useState<AxisSelection>({});
  const [search, setSearch] = useState("");

  const { data: grigliaPunti = [] } = useFamilyGrid(selectedFamily?.id);

  // Reset quando si apre/chiude
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedFamily(null);
      setSearch("");
    }
  }, [open]);

  // Inizializza selezioni assi con default quando si sceglie una famiglia
  useEffect(() => {
    if (!selectedFamily) return;
    const sel: AxisSelection = {};
    for (const ax of selectedFamily.axes) {
      const def = ax.values.find((v) => v.is_default) ?? ax.values[0];
      if (def) sel[ax.codice] = def.id;
    }
    setSelection(sel);
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
  const needsML = false; // future: se aggiungiamo modalità lineare

  const result = useMemo(() => {
    if (!selectedFamily) return null;
    return calcolaPrezzoFamiglia(
      {
        family: selectedFamily,
        selections: selection,
        larghezza_mm: needsXY ? parseFloat(larghezza) || 0 : undefined,
        altezza_mm: needsXY ? parseFloat(altezza) || 0 : undefined,
        lunghezza_ml: needsML ? parseFloat(lunghezza) || 0 : undefined,
        quantita: parseFloat(quantita) || 1,
      },
      needsXY ? grigliaPunti : undefined,
    );
  }, [selectedFamily, selection, larghezza, altezza, lunghezza, quantita, grigliaPunti, needsXY]);

  const canAdvance = (): boolean => {
    if (step === 1) return !!selectedFamily;
    if (step === 2) return (parseFloat(quantita) || 0) > 0;
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Wizard Serramentista — Step {step}/4
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mt-2">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <ScrollArea className="flex-1 mt-4">
          {/* Step 1: Scelta famiglia */}
          {step === 1 && (
            <div className="space-y-3">
              <Input
                placeholder="Cerca famiglia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {isLoading && <p className="text-sm text-muted-foreground">Caricamento...</p>}
              {!isLoading && filteredFamilies.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Nessuna famiglia disponibile. Creale in Impostazioni → Catalogo → Famiglie.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {filteredFamilies.map((f) => (
                  <Card
                    key={f.id}
                    className={`cursor-pointer transition ${
                      selectedFamily?.id === f.id
                        ? "ring-2 ring-primary"
                        : "hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedFamily(f)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{f.nome}</p>
                          {f.descrizione && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {f.descrizione}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs">
                          {f.modalita_prezzo_base}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {f.axes.length} {f.axes.length === 1 ? "asse" : "assi"} · UM: {f.unit_of_measure}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Misure + quantità */}
          {step === 2 && selectedFamily && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 bg-muted/30">
                <p className="font-medium">{selectedFamily.nome}</p>
                <p className="text-xs text-muted-foreground">
                  Modalità: {selectedFamily.modalita_prezzo_base}
                </p>
              </div>

              {needsXY && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{selectedFamily.griglia_asse_x_label || "Larghezza"} (mm)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={larghezza}
                      onChange={(e) => setLarghezza(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{selectedFamily.griglia_asse_y_label || "Altezza"} (mm)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={altezza}
                      onChange={(e) => setAltezza(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {!needsXY && (
                <p className="text-sm text-muted-foreground italic">
                  Questa famiglia è a prezzo fisso per pezzo: nessuna misura richiesta.
                </p>
              )}

              <div>
                <Label>Quantità</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 3: Configurazione assi */}
          {step === 3 && selectedFamily && (
            <div className="space-y-3">
              {selectedFamily.axes.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  Questa famiglia non ha assi configurabili.
                </p>
              )}
              {selectedFamily.axes.map((ax) => (
                <div key={ax.id}>
                  <Label>
                    {ax.nome}
                    {ax.obbligatorio && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={selection[ax.codice] ?? ""}
                    onValueChange={(v) =>
                      setSelection((prev) => ({ ...prev, [ax.codice]: v }))
                    }
                  >
                    <SelectTrigger>
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
                    <p className="text-xs text-muted-foreground mt-1">{ax.descrizione}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Step 4: Riepilogo */}
          {step === 4 && selectedFamily && result && (
            <div className="space-y-3">
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prodotto:</span>
                    <span className="font-medium">{selectedFamily.nome}</span>
                  </div>
                  {needsXY && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dimensioni:</span>
                      <span>
                        {larghezza}×{altezza} mm
                        {result.mq != null && ` (${result.mq.toFixed(3)} mq)`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quantità:</span>
                    <span>{quantita}</span>
                  </div>
                  {result.prezzo_griglia_base != null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Prezzo base griglia:</span>
                      <span>{formatCurrency(result.prezzo_griglia_base)}</span>
                    </div>
                  )}

                  {result.maggiorazioni_applicate.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Maggiorazioni applicate:</p>
                      {result.maggiorazioni_applicate.map((m, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span>
                            {m.axis_codice}: {m.value_valore}
                            {" "}
                            <Badge variant="outline" className="ml-1 text-[10px]">
                              {m.tipo === "percentuale" ? `+${m.valore}%` : `+${formatCurrency(m.valore)}`}
                            </Badge>
                          </span>
                          <span className="text-muted-foreground">
                            Δ {formatCurrency(m.delta_vendita)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t flex justify-between">
                    <span className="font-medium">Prezzo unitario:</span>
                    <span className="font-semibold">
                      {formatCurrency(result.unit_price_vendita)} / {selectedFamily.unit_of_measure}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg">
                    <span className="font-medium">Totale:</span>
                    <span className="font-bold text-primary">
                      {formatCurrency(result.totale_vendita)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {result.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900 dark:text-amber-200 space-y-1">
                      {result.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedFamily.posa_tariffa_default_id && (
                <p className="text-sm text-muted-foreground">
                  ℹ️ Verrà aggiunta anche una riga posa collegata (tariffa di default della famiglia).
                </p>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex justify-between sm:justify-between mt-4">
          <Button
            variant="outline"
            onClick={() => (step > 1 ? setStep((step - 1) as Step) : onClose())}
            disabled={step === 1 && !selectedFamily}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 1 ? "Annulla" : "Indietro"}
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep((step + 1) as Step)}
              disabled={!canAdvance()}
            >
              Avanti <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleConfirm} disabled={!result}>
              <Check className="h-4 w-4 mr-1" /> Aggiungi al preventivo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
