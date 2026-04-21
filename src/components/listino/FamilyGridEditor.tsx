/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.5
 *
 * Editor matrice L × H per famiglie in modalità prezzo 'griglia'.
 * Ogni cella = { prezzo_vendita, prezzo_acquisto }.
 *
 * Strategia di salvataggio (hardened post-stabilization):
 *  1. Upsert delle celle "nuove o modificate" preservando `id` per quelle
 *     già esistenti (update-in-place) e inserendo le nuove.
 *  2. Delete ESCLUSIVAMENTE delle celle rimosse dall'utente (diff su ids),
 *     non più dell'intera famiglia.
 *
 * Garanzie:
 *  - Nessuna finestra vuota: se l'upsert fallisce, nulla è stato toccato;
 *    se il delete fallisce, il grid contiene valori validi (più eventuali
 *    celle stale — l'utente rilancia il salvataggio).
 *  - Preserva axis_config di celle aggiunte da editor avanzati (MatriceEditor
 *    STEP 4): il delete filtra per `axis_config IS NULL` e scope per id.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { captureVelocityError } from "@/lib/velocity/sentry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GridBulkImportDialog,
  type BulkParsedPayload,
} from "./GridBulkImportDialog";
import { applyMarkup, applyScontiFornitore } from "@/lib/priceMarkup";
import { formatCurrency } from "@/lib/formatters";
import type { MarkupTipo } from "@/types/articleFamily";

interface Cell {
  prezzo_vendita: number;
  prezzo_acquisto: number;
}

interface GridRow {
  id: string;
  family_id: string | null;
  valore_x: number;
  valore_y: number;
  prezzo_vendita: number;
  prezzo_acquisto: number;
}

interface Props {
  familyId: string;
  asseXLabel: string;
  asseYLabel: string;
  /**
   * Modalità prezzo della famiglia. Quando è "acquisto_markup" nascondiamo
   * l'input del prezzo di vendita (viene derivato dal markup configurato),
   * mostrando solo il prezzo di acquisto — riduce rumore visivo e DOM
   * (266 celle × 1 input invece di × 2).
   * Default: "vendita" per compat con chiamate storiche.
   */
  prezzoBaseMode?: "vendita" | "acquisto_markup";
  /**
   * Sconti fornitore in cascata (solo mode=acquisto_markup). Se almeno uno
   * è > 0, il prezzo_acquisto di ogni cella è trattato come LORDO di listino
   * e si calcola: netto = lordo × (1-s1/100) × (1-s2/100); vendita = netto × markup.
   * Se 0/0, retrocompat: input = netto, vendita = netto × markup.
   */
  scontoFornitore1?: number;
  scontoFornitore2?: number;
  /** Tipo markup applicato all'acquisto netto. Default "none" (vendita = netto). */
  markupTipo?: MarkupTipo;
  /** Valore markup (% se markupTipo="percentuale", €/pz se "fisso_pz"). */
  markupValore?: number;
}

export function FamilyGridEditor({
  familyId,
  asseXLabel,
  asseYLabel,
  prezzoBaseMode = "vendita",
  scontoFornitore1 = 0,
  scontoFornitore2 = 0,
  markupTipo = "none",
  markupValore = 0,
}: Props) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: queryKeys.articleFamilies.grid(familyId),
    enabled: !!companyId && !!familyId,
    queryFn: async (): Promise<GridRow[]> => {
      // Filtra per axis_config IS NULL: questo editor gestisce solo celle "flat"
      // (L × H senza fascia). Le celle multi-fascia sono di competenza esclusiva
      // di MatriceEditor (STEP 4) e NON devono essere mostrate né toccate qui.
      const { data, error } = await supabase
        .from("listino_griglia")
        .select("id, family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto")
        .eq("family_id", familyId)
        .eq("company_id", companyId!)
        .is("axis_config", null)
        .order("valore_x", { ascending: true })
        .order("valore_y", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as GridRow[]);
    },
    staleTime: 60 * 1000,
  });

  // Stato locale: assi + matrice
  const [xAxis, setXAxis] = useState<number[]>([]);
  const [yAxis, setYAxis] = useState<number[]>([]);
  // cells indicizzata da `${x}_${y}`
  const [cells, setCells] = useState<Map<string, Cell>>(new Map());
  const [newX, setNewX] = useState("");
  const [newY, setNewY] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  // Bootstrap dallo stato server
  useEffect(() => {
    const xs = Array.from(new Set(rows.map((r) => r.valore_x))).sort((a, b) => a - b);
    const ys = Array.from(new Set(rows.map((r) => r.valore_y))).sort((a, b) => a - b);
    const cellMap = new Map<string, Cell>();
    for (const r of rows) {
      cellMap.set(`${r.valore_x}_${r.valore_y}`, {
        prezzo_vendita: Number(r.prezzo_vendita),
        prezzo_acquisto: Number(r.prezzo_acquisto),
      });
    }
    setXAxis(xs);
    setYAxis(ys);
    setCells(cellMap);
  }, [rows]);

  const addX = () => {
    const v = parseInt(newX, 10);
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Valore X non valido");
      return;
    }
    if (xAxis.includes(v)) {
      toast.error("Valore già presente");
      return;
    }
    setXAxis([...xAxis, v].sort((a, b) => a - b));
    setNewX("");
  };

  const addY = () => {
    const v = parseInt(newY, 10);
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Valore Y non valido");
      return;
    }
    if (yAxis.includes(v)) {
      toast.error("Valore già presente");
      return;
    }
    setYAxis([...yAxis, v].sort((a, b) => a - b));
    setNewY("");
  };

  const removeX = (v: number) => {
    setXAxis(xAxis.filter((x) => x !== v));
    setCells((prev) => {
      const next = new Map(prev);
      for (const k of Array.from(next.keys())) {
        if (k.startsWith(`${v}_`)) next.delete(k);
      }
      return next;
    });
  };

  const removeY = (v: number) => {
    setYAxis(yAxis.filter((y) => y !== v));
    setCells((prev) => {
      const next = new Map(prev);
      for (const k of Array.from(next.keys())) {
        if (k.endsWith(`_${v}`)) next.delete(k);
      }
      return next;
    });
  };

  const setCell = (x: number, y: number, field: keyof Cell, value: number) => {
    setCells((prev) => {
      const next = new Map(prev);
      const curr = next.get(`${x}_${y}`) ?? { prezzo_vendita: 0, prezzo_acquisto: 0 };
      next.set(`${x}_${y}`, { ...curr, [field]: value });
      return next;
    });
  };

  // Flags per l'UI: sconti attivi e markup attivo. Stabili per riga → evitano
  // ri-render inutili in ogni cell.
  const scontiAttivi = scontoFornitore1 > 0 || scontoFornitore2 > 0;
  const markupAttivo = markupTipo !== "none" && markupValore > 0;

  /**
   * Dato il prezzo di acquisto (LORDO se scontiAttivi, NETTO altrimenti)
   * restituisce { netto, vendita }. Usato sia nel rendering delle celle che
   * al salvataggio (prezzo_vendita = cache derivata).
   */
  const computeCellPrices = (prezzoAcquistoInput: number) => {
    const netto = scontiAttivi
      ? applyScontiFornitore(prezzoAcquistoInput, scontoFornitore1, scontoFornitore2)
      : Math.max(0, prezzoAcquistoInput);
    const vendita = applyMarkup({
      prezzoAcquisto: netto,
      markupTipo,
      markupValore,
    }).prezzoVendita;
    return { netto, vendita };
  };

  /**
   * Applica il payload del bulk import allo stato locale.
   *  - Unione ORDINATA degli assi: nuovi valori X/Y vengono aggiunti a quelli
   *    già presenti (non sovrascritti), così l'utente può mergere più
   *    importazioni sullo stesso articolo.
   *  - Per ogni cella parsata: scrive SOLO nel campo target scelto dall'utente
   *    (vendita o acquisto), preservando l'altro valore se esistente.
   *  - NON salva sul DB: l'utente rivede la matrice e clicca "Salva griglia".
   */
  const applyBulk = (payload: BulkParsedPayload) => {
    const mergedX = Array.from(new Set([...xAxis, ...payload.xAxis])).sort((a, b) => a - b);
    const mergedY = Array.from(new Set([...yAxis, ...payload.yAxis])).sort((a, b) => a - b);

    setXAxis(mergedX);
    setYAxis(mergedY);

    setCells((prev) => {
      const next = new Map(prev);
      for (const [key, value] of payload.values.entries()) {
        const curr = next.get(key) ?? { prezzo_vendita: 0, prezzo_acquisto: 0 };
        next.set(key, { ...curr, [payload.targetField]: value });
      }
      return next;
    });
  };

  // Salvataggio: upsert-by-id + delete-by-diff (no empty window, no MatriceEditor loss)
  const saveGrid = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non identificata");

      // Map (x_y) → id delle celle attualmente persistite (axis_config IS NULL).
      const existingByKey = new Map<string, GridRow>();
      for (const r of rows) {
        existingByKey.set(`${r.valore_x}_${r.valore_y}`, r);
      }

      // Costruisci payloads distinti per INSERT (nuove celle, no id) e UPDATE
      // (celle esistenti, con id). Splittare è necessario perché PostgREST
      // in un singolo .upsert() con shape miste propaga le chiavi: le righe
      // senza `id` ricevono `id: NULL` dal client → violazione NOT NULL del PK
      // (la DEFAULT gen_random_uuid() non si applica quando il valore è
      // esplicitamente NULL).
      type InsertRow = {
        company_id: string;
        family_id: string;
        valore_x: number;
        valore_y: number;
        prezzo_vendita: number;
        prezzo_acquisto: number;
      };
      type UpdateRow = InsertRow & { id: string };

      const toInsert: InsertRow[] = [];
      const toUpdate: UpdateRow[] = [];
      const keptKeys = new Set<string>();
      for (const x of xAxis) {
        for (const y of yAxis) {
          const key = `${x}_${y}`;
          const c = cells.get(key);
          if (!c) continue; // celle vuote = non persistite
          keptKeys.add(key);
          const existing = existingByKey.get(key);
          // In mode=acquisto_markup il prezzo_vendita è CACHE DERIVATA da
          // (lordo × sconti fornitore → netto × markup). Lo ricalcoliamo al
          // save per garantire sempre coerenza col markup configurato sulla
          // famiglia. In mode=vendita persistiamo l'input diretto.
          const prezzoVenditaFinale =
            prezzoBaseMode === "acquisto_markup"
              ? computeCellPrices(c.prezzo_acquisto).vendita
              : c.prezzo_vendita;
          const base: InsertRow = {
            company_id: companyId,
            family_id: familyId,
            valore_x: x,
            valore_y: y,
            prezzo_vendita: prezzoVenditaFinale,
            prezzo_acquisto: c.prezzo_acquisto,
          };
          if (existing) {
            toUpdate.push({ ...base, id: existing.id });
          } else {
            toInsert.push(base);
          }
        }
      }

      // Celle da eliminare = esistenti (axis_config NULL) il cui (x,y) non è
      // più presente nelle keptKeys. Delete scoped by id: non tocca MAI
      // celle multi-fascia (axis_config NOT NULL) né altre famiglie.
      const idsToDelete: string[] = [];
      for (const [key, r] of existingByKey.entries()) {
        if (!keptKeys.has(key)) idsToDelete.push(r.id);
      }

      // Step 1a: INSERT delle celle nuove (DB genera id via DEFAULT).
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase
          .from("listino_griglia")
          .insert(toInsert);
        if (insErr) throw new Error(`Errore inserimento celle: ${insErr.message}`);
      }

      // Step 1b: UPDATE delle celle esistenti via upsert-by-id (tutte le righe
      // hanno `id`, quindi la shape è consistente e PostgREST non pad con NULL).
      if (toUpdate.length > 0) {
        const { error: updErr } = await supabase
          .from("listino_griglia")
          .upsert(toUpdate);
        if (updErr) throw new Error(`Errore aggiornamento celle: ${updErr.message}`);
      }

      // Step 2: delete DOPO, solo celle effettivamente rimosse dall'utente.
      if (idsToDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("listino_griglia")
          .delete()
          .in("id", idsToDelete);
        if (delErr) {
          // Le scritture sono andate a buon fine ma il delete ha fallito: la
          // griglia contiene tutti i valori validi + eventuali celle stale.
          // L'utente può rilanciare il salvataggio in sicurezza.
          throw new Error(`Errore rimozione celle obsolete: ${delErr.message}`);
        }
      }

      return toInsert.length + toUpdate.length;
    },
    onSuccess: (count) => {
      toast.success(`Griglia salvata: ${count} celle`);
      qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.grid(familyId) });
    },
    onError: (err: Error) => {
      captureVelocityError("family.grid.save", err, { companyId, familyId });
      toast.error("Errore salvataggio griglia", { description: err.message });
    },
  });

  const totalCells = useMemo(() => xAxis.length * yAxis.length, [xAxis, yAxis]);
  const filledCells = cells.size;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Caricamento griglia…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              Matrice prezzi {asseXLabel} × {asseYLabel}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Definisci le taglie standard. Ogni cella contiene prezzo vendita (€) e acquisto (€). Celle vuote = taglia non disponibile.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setBulkOpen(true)}
            className="shrink-0"
          >
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
            Importa (testo o immagine AI)
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Asse X */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{asseXLabel}</label>
          <div className="flex flex-wrap items-center gap-2">
            {xAxis.map((v) => (
              <Badge key={v} variant="secondary" className="gap-1">
                {v}
                <button
                  type="button"
                  onClick={() => removeX(v)}
                  className="ml-1 hover:text-destructive"
                  aria-label={`Rimuovi ${v}`}
                >
                  ×
                </button>
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={newX}
                onChange={(e) => setNewX(e.target.value)}
                placeholder="Aggiungi valore"
                className="w-32 h-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addX();
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={addX}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/* Asse Y */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{asseYLabel}</label>
          <div className="flex flex-wrap items-center gap-2">
            {yAxis.map((v) => (
              <Badge key={v} variant="secondary" className="gap-1">
                {v}
                <button
                  type="button"
                  onClick={() => removeY(v)}
                  className="ml-1 hover:text-destructive"
                  aria-label={`Rimuovi ${v}`}
                >
                  ×
                </button>
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={newY}
                onChange={(e) => setNewY(e.target.value)}
                placeholder="Aggiungi valore"
                className="w-32 h-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addY();
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={addY}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/* Matrice */}
        {xAxis.length > 0 && yAxis.length > 0 ? (
          <>
            {xAxis.length > 8 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span aria-hidden="true">←</span>
                Scorri orizzontalmente per vedere tutte le {xAxis.length} colonne
                <span aria-hidden="true">→</span>
              </p>
            )}
            <div className="border rounded-md overflow-x-auto overflow-y-auto max-h-[70vh] relative">
              {/* Table `w-max` — così cresce oltre il container e il wrapper overflow-x-auto abilita lo scroll orizzontale quando le colonne sono molte (19 × 120 = 2280 px). Senza `w-max` (o con `w-full`) il browser comprime le colonne sotto il min-width e lo scroll non appare. */}
              <table className="w-max text-sm border-collapse">
                <thead className="bg-muted/50 sticky top-0 z-20">
                  <tr>
                    <th className="p-2 text-left border-r border-b sticky left-0 bg-muted/50 z-30 min-w-[70px]">
                      {asseYLabel} \ {asseXLabel}
                    </th>
                    {xAxis.map((x) => (
                      <th
                        key={x}
                        className={`p-2 text-center border-r border-b ${
                          prezzoBaseMode === "acquisto_markup"
                            ? "min-w-[110px]"
                            : "min-w-[140px]"
                        }`}
                      >
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yAxis.map((y) => (
                    <tr key={y} className="border-t">
                      <td className="p-2 font-medium border-r sticky left-0 bg-background z-10">
                        {y}
                      </td>
                      {xAxis.map((x) => {
                        const c = cells.get(`${x}_${y}`);
                        return (
                          <td key={x} className="p-1 border-r align-top">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 flex flex-col gap-1">
                                {prezzoBaseMode === "acquisto_markup" ? (
                                  // Solo acquisto — netto + vendita derivati
                                  <>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder={
                                        scontiAttivi ? "Lordo €" : "Acq. €"
                                      }
                                      value={c?.prezzo_acquisto ?? ""}
                                      onChange={(e) =>
                                        setCell(
                                          x,
                                          y,
                                          "prezzo_acquisto",
                                          parseFloat(e.target.value) || 0,
                                        )
                                      }
                                      className="h-7 text-xs"
                                    />
                                    {c && c.prezzo_acquisto > 0 ? (
                                      <div className="text-[10px] leading-tight text-muted-foreground px-1">
                                        {(() => {
                                          const { netto, vendita } = computeCellPrices(
                                            c.prezzo_acquisto,
                                          );
                                          return (
                                            <>
                                              {scontiAttivi ? (
                                                <div>
                                                  netto:{" "}
                                                  <span className="font-medium text-foreground/80">
                                                    {formatCurrency(netto)}
                                                  </span>
                                                </div>
                                              ) : null}
                                              {markupAttivo || scontiAttivi ? (
                                                <div>
                                                  vendita:{" "}
                                                  <span className="font-semibold text-primary">
                                                    {formatCurrency(vendita)}
                                                  </span>
                                                </div>
                                              ) : null}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  // Entrambi — vendita sopra (principale), acquisto sotto (opzionale)
                                  <>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="Vend. €"
                                      value={c?.prezzo_vendita ?? ""}
                                      onChange={(e) =>
                                        setCell(
                                          x,
                                          y,
                                          "prezzo_vendita",
                                          parseFloat(e.target.value) || 0,
                                        )
                                      }
                                      className="h-7 text-xs"
                                    />
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="Acq. €"
                                      value={c?.prezzo_acquisto ?? ""}
                                      onChange={(e) =>
                                        setCell(
                                          x,
                                          y,
                                          "prezzo_acquisto",
                                          parseFloat(e.target.value) || 0,
                                        )
                                      }
                                      className="h-7 text-xs text-muted-foreground"
                                    />
                                  </>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setCells((prev) => {
                                    const next = new Map(prev);
                                    next.delete(`${x}_${y}`);
                                    return next;
                                  })
                                }
                                className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                disabled={!c}
                                aria-label={`Svuota cella ${x}×${y}`}
                                title="Svuota cella"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
            Aggiungi valori ai due assi per iniziare a compilare la matrice.
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {filledCells} / {totalCells} celle compilate
          </span>
          <Button
            type="button"
            onClick={() => saveGrid.mutate()}
            disabled={saveGrid.isPending}
          >
            {saveGrid.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Salvataggio…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                Salva griglia
              </>
            )}
          </Button>
        </div>
      </CardContent>

      <GridBulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onApply={applyBulk}
        asseXLabel={asseXLabel}
        asseYLabel={asseYLabel}
      />
    </Card>
  );
}
