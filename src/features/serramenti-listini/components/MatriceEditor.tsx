/**
 * STEP 4 — Editor matrice visuale Excel-like per listino_griglia.
 *
 * Obiettivo: compilare il listino prezzi di una famiglia × linea prodotto.
 * Input utente: prezzi di LISTINO (pre-sconto). Il componente calcola
 * live acquisto + vendita + margine% usando la formula canonica
 * `calcolaPrezzoSerramento`.
 *
 * Dati persistiti in `listino_griglia` (via useGridCellMutations.upsert):
 *   { family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto,
 *     supplier_catalog_id, supplier_product_line_id, axis_config: null }
 *
 * Note design:
 *   - axis_config FISSO a null (= cella "base" senza fascia). Multi-fascia
 *     arriva in STEP 8.
 *   - Dirty tracking per salvare solo le celle modificate (no DELETE-ALL
 *     destructive come FamilyGridEditor FASE 4, che è per Preventivatore
 *     senza supplier concept).
 *   - Upsert loop client-side: OK per N × M ≤ 400 celle. Oltre, valutare
 *     un RPC batch (STEP 5).
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { captureVelocityError } from "@/lib/velocity/sentry";
import { useGridCellMutations, useGridCells } from "../hooks/useGridCells";
import type { GridCell, SupplierCatalog, SupplierProductLine } from "../types";
import { calcolaPrezzoSerramento } from "../utils/pricing";
import { ImportMatriceDialog } from "./ImportMatriceDialog";

interface Props {
  /** Famiglia serramento (article_families.id). Obbligatoria. */
  familyId: string;
  /** Nome famiglia per header. */
  familyNome: string;
  /** Fornitore di riferimento (per sconto_default). */
  supplier: SupplierCatalog;
  /** Linea prodotto specifica del fornitore (per ricarico + override sconto). */
  productLine: SupplierProductLine;
  /** Etichette assi griglia (default: "Larghezza (mm)" × "Altezza (mm)"). */
  asseXLabel?: string;
  asseYLabel?: string;
  /** Chi vede il listino senza poterlo modificare consulta la matrice: dal
   *  26/09/2026 il database non gli salva le celle, quindi campi e pulsanti
   *  restano spenti. */
  solaLettura?: boolean;
}

/** Stato locale di una cella prima del salvataggio. */
interface CellDraft {
  prezzo_listino: number;
}

const keyOf = (x: number, y: number) => `${x}_${y}`;
const fmtEur = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2, useGrouping: "always" }).format(n);

export function MatriceEditor({
  familyId,
  familyNome,
  supplier,
  productLine,
  asseXLabel = "Larghezza (mm)",
  asseYLabel = "Altezza (mm)",
  solaLettura = false,
}: Props) {
  const { cells: serverCells, isLoading, isError, refetch } = useGridCells({
    familyId,
    axisConfig: null,
  });
  const { upsert, remove } = useGridCellMutations();
  const confirm = useConfirm();

  // Sconto effettivo: override linea ∨ default fornitore
  const scontoEffettivo =
    productLine.sconto_override ?? supplier.sconto_default ?? 0;
  const ricaricoEffettivo = productLine.ricarico_default ?? 0;

  // ─── Stato locale ─────────────────────────────────────────────────────────

  const [xAxis, setXAxis] = useState<number[]>([]);
  const [yAxis, setYAxis] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Map<string, CellDraft>>(new Map());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [newX, setNewX] = useState("");
  const [newY, setNewY] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  // ─── Bootstrap dallo stato server ─────────────────────────────────────────
  // Solo per questo supplier_product_line_id: filtriamo client-side perché
  // useGridCells non accetta ancora filter supplier. (refactor eventuale STEP 5.)
  const filteredServerCells = useMemo<GridCell[]>(
    () =>
      serverCells.filter(
        (c) => c.supplier_product_line_id === productLine.id,
      ),
    [serverCells, productLine.id],
  );

  useEffect(() => {
    const xs = Array.from(
      new Set(filteredServerCells.map((c) => c.valore_x)),
    ).sort((a, b) => a - b);
    const ys = Array.from(
      new Set(filteredServerCells.map((c) => c.valore_y)),
    ).sort((a, b) => a - b);
    const nextDrafts = new Map<string, CellDraft>();
    for (const c of filteredServerCells) {
      // Dal server leggiamo prezzo_vendita (che in listini avanzati rappresenta
      // il prezzo di listino PRIMA di sconto/ricarico — è l'input utente).
      // Decisione: usiamo `prezzo_vendita` come contenitore del listino per
      // evitare cambio schema DB. Il vero prezzo_vendita finale cliente
      // viene ricalcolato dal wizard preventivo tramite `calcolaPrezzoSerramento`.
      nextDrafts.set(keyOf(c.valore_x, c.valore_y), {
        prezzo_listino: c.prezzo_vendita,
      });
    }
    setXAxis(xs);
    setYAxis(ys);
    setDrafts(nextDrafts);
    setDirty(new Set());
  }, [filteredServerCells]);

  // ─── Mutators assi ────────────────────────────────────────────────────────

  const addX = () => {
    const v = parseInt(newX, 10);
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Valore larghezza non valido");
      return;
    }
    if (v < 100 || v > 5000) {
      toast.error("Range consigliato 100–5000 mm");
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
      toast.error("Valore altezza non valido");
      return;
    }
    if (v < 100 || v > 5000) {
      toast.error("Range consigliato 100–5000 mm");
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
    setDrafts((prev) => {
      const next = new Map(prev);
      const removed: string[] = [];
      for (const k of next.keys()) {
        if (k.startsWith(`${v}_`)) {
          next.delete(k);
          removed.push(k);
        }
      }
      if (removed.length > 0) {
        setDirty((d) => {
          const nd = new Set(d);
          for (const k of removed) nd.add(k);
          return nd;
        });
      }
      return next;
    });
  };

  const removeY = (v: number) => {
    setYAxis(yAxis.filter((y) => y !== v));
    setDrafts((prev) => {
      const next = new Map(prev);
      const removed: string[] = [];
      for (const k of next.keys()) {
        if (k.endsWith(`_${v}`)) {
          next.delete(k);
          removed.push(k);
        }
      }
      if (removed.length > 0) {
        setDirty((d) => {
          const nd = new Set(d);
          for (const k of removed) nd.add(k);
          return nd;
        });
      }
      return next;
    });
  };

  const setCellListino = (x: number, y: number, value: string) => {
    const parsed = parseFloat(value);
    const num = Number.isFinite(parsed) ? parsed : 0;
    const k = keyOf(x, y);
    setDrafts((prev) => {
      const next = new Map(prev);
      if (num <= 0) {
        next.delete(k);
      } else {
        next.set(k, { prezzo_listino: num });
      }
      return next;
    });
    setDirty((prev) => {
      const next = new Set(prev);
      next.add(k);
      return next;
    });
  };

  // ─── Save (loop upsert per le celle dirty) ────────────────────────────────

  const persistCell = async (x: number, y: number) => {
    const k = keyOf(x, y);
    const draft = drafts.get(k);
    setSavingKey(k);
    try {
      if (!draft) {
        // Utente ha cancellato il valore: se la cella esisteva lato server,
        // la rimuoviamo fisicamente tramite la mutation `remove`. Questo
        // evita di lasciare celle "fantasma" con prezzo 0 in listino, che
        // causerebbero prezzi errati nei preventivi successivi.
        const serverCell = filteredServerCells.find(
          (c) => c.valore_x === x && c.valore_y === y,
        );
        if (serverCell?.id) {
          await remove.mutateAsync({
            id: serverCell.id,
            familyId,
          });
        }
        return;
      }
      const res = calcolaPrezzoSerramento({
        prezzo_listino: draft.prezzo_listino,
        sconto_fornitore: scontoEffettivo,
        ricarico_azienda: ricaricoEffettivo,
        maggiorazioni_percentuali: 0,
        maggiorazioni_fisse: 0,
        manodopera: 0,
      });
      await upsert.mutateAsync({
        family_id: familyId,
        axis_config: null,
        valore_x: x,
        valore_y: y,
        // Salviamo il listino nel campo prezzo_vendita. Il "vero" prezzo
        // vendita finale cliente lo ricalcola il wizard combinando
        // listino × (1-sconto) × (1+ricarico).
        prezzo_vendita: draft.prezzo_listino,
        prezzo_acquisto: res.prezzo_acquisto,
        supplier_catalog_id: supplier.id,
        supplier_product_line_id: productLine.id,
        note: null,
      });
    } finally {
      setSavingKey(null);
    }
  };

  const saveAll = async () => {
    if (dirty.size === 0) {
      toast.info("Nessuna modifica da salvare");
      return;
    }
    setIsSavingAll(true);
    let okCount = 0;
    const errs: string[] = [];
    const okKeys = new Set<string>();
    try {
      for (const k of dirty) {
        const [xStr, yStr] = k.split("_");
        const x = Number(xStr);
        const y = Number(yStr);
        try {
          await persistCell(x, y);
          okCount++;
          okKeys.add(k);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errs.push(`${x}×${y}: ${msg}`);
        }
      }
      if (errs.length === 0) {
        toast.success(`${okCount} celle salvate`);
      } else {
        toast.error(`Salvate ${okCount}, errori su ${errs.length}`, {
          description: errs.slice(0, 3).join(" · "),
        });
        captureVelocityError(
          "listini-avanzati.matrice.save_partial",
          new Error(errs.join("; ")),
          { familyId, productLineId: productLine.id, okCount, errCount: errs.length },
        );
      }
      // Tieni dirty solo le celle che hanno fallito, così l'utente sa che
      // deve riprovare. Se tutte ok, svuotiamo l'intero set.
      setDirty((prev) => {
        const next = new Set<string>();
        for (const k of prev) {
          if (!okKeys.has(k)) next.add(k);
        }
        return next;
      });
    } finally {
      setIsSavingAll(false);
    }
  };

  // ─── Warn prima di lasciare la pagina con modifiche non salvate ──────────
  useEffect(() => {
    if (dirty.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Browser moderni ignorano il testo ma il preventDefault+returnValue
      // è ancora lo switch per mostrare il prompt nativo.
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty.size]);

  // ─── Derived counters ─────────────────────────────────────────────────────

  const totalCells = xAxis.length * yAxis.length;
  const filledCells = drafts.size;

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Caricamento matrice…
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Errore caricamento matrice prezzi.
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap break-words">
            <span className="break-words">Matrice {familyNome}</span>
            <Badge variant="outline" className="text-xs font-normal">
              {productLine.nome}
            </Badge>
            <Badge variant="secondary" className="text-xs font-normal">
              {supplier.nome}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Inserisci i <strong>prezzi di listino</strong> (pre-sconto).
            Acquisto e vendita vengono calcolati automaticamente:{" "}
            <span className="font-mono text-xs block sm:inline mt-1 sm:mt-0">
              sconto {(scontoEffettivo * 100).toFixed(0)}% · ricarico{" "}
              {(ricaricoEffettivo * 100).toFixed(0)}%
            </span>
          </CardDescription>
        </div>
        {solaLettura ? (
          <Badge variant="outline" className="shrink-0 text-xs font-normal">Sola lettura</Badge>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            disabled={isSavingAll}
            className="h-10 w-full sm:w-auto shrink-0"
          >
            <Upload className="h-4 w-4 mr-1.5" aria-hidden />
            Importa Excel/CSV
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* disabled su un fieldset spegne ogni campo e pulsante che contiene. */}
        <fieldset disabled={solaLettura} className="m-0 min-w-0 space-y-4 border-0 p-0">
        {/* Asse X */}
        <div className="space-y-2">
          <label htmlFor="matrice-new-x" className="text-sm font-medium">{asseXLabel}</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {xAxis.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="gap-0.5 pl-2.5 pr-1 h-8 text-sm font-mono"
              >
                {v}
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Rimuovere la larghezza ${v}?`,
                        description:
                          "Verranno cancellati tutti i prezzi inseriti per questa larghezza nella matrice. L'azione sarà definitiva al salvataggio.",
                        confirmLabel: "Rimuovi",
                        variant: "destructive",
                      })
                    ) {
                      removeX(v);
                    }
                  }}
                  className="inline-flex items-center justify-center h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive transition-colors"
                  aria-label={`Rimuovi larghezza ${v}`}
                >
                  <span className="text-base leading-none">×</span>
                </button>
              </Badge>
            ))}
            <div className="flex items-center gap-1 w-full sm:w-auto">
              <Input
                id="matrice-new-x"
                type="number"
                inputMode="numeric"
                value={newX}
                onChange={(e) => setNewX(e.target.value)}
                placeholder="es. 1200"
                className="flex-1 sm:w-32 h-10"
                min={100}
                max={5000}
                step={10}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addX();
                  }
                }}
                aria-label="Aggiungi valore larghezza"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addX}
                className="h-10 w-10 shrink-0"
                aria-label="Aggiungi larghezza"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        {/* Asse Y */}
        <div className="space-y-2">
          <label htmlFor="matrice-new-y" className="text-sm font-medium">{asseYLabel}</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {yAxis.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="gap-0.5 pl-2.5 pr-1 h-8 text-sm font-mono"
              >
                {v}
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Rimuovere l'altezza ${v}?`,
                        description:
                          "Verranno cancellati tutti i prezzi inseriti per questa altezza nella matrice. L'azione sarà definitiva al salvataggio.",
                        confirmLabel: "Rimuovi",
                        variant: "destructive",
                      })
                    ) {
                      removeY(v);
                    }
                  }}
                  className="inline-flex items-center justify-center h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive transition-colors"
                  aria-label={`Rimuovi altezza ${v}`}
                >
                  <span className="text-base leading-none">×</span>
                </button>
              </Badge>
            ))}
            <div className="flex items-center gap-1 w-full sm:w-auto">
              <Input
                id="matrice-new-y"
                type="number"
                inputMode="numeric"
                value={newY}
                onChange={(e) => setNewY(e.target.value)}
                placeholder="es. 1400"
                className="flex-1 sm:w-32 h-10"
                min={100}
                max={5000}
                step={10}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addY();
                  }
                }}
                aria-label="Aggiungi valore altezza"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addY}
                className="h-10 w-10 shrink-0"
                aria-label="Aggiungi altezza"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        {/* Matrice */}
        {xAxis.length > 0 && yAxis.length > 0 ? (
          <div className="space-y-2">
            {/* Hint scroll orizzontale mobile (visibile solo se tabella più larga dello schermo) */}
            <p className="text-xs text-muted-foreground italic sm:hidden" aria-live="polite">
              Scorri orizzontalmente per vedere tutte le colonne →
            </p>
            <div className="border rounded-md overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th
                      scope="col"
                      className="p-2 text-left border-r sticky left-0 bg-muted/50 z-10 min-w-[72px] sm:min-w-[100px] text-xs sm:text-sm"
                    >
                      <span className="hidden sm:inline">{asseYLabel} \ {asseXLabel}</span>
                      <span className="sm:hidden">H \ L</span>
                    </th>
                    {xAxis.map((x) => (
                      <th
                        key={x}
                        scope="col"
                        className="p-2 text-center border-r min-w-[140px] sm:min-w-[160px] font-mono text-xs sm:text-sm"
                      >
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yAxis.map((y) => (
                    <tr key={y} className="border-t">
                      <th
                        scope="row"
                        className="p-2 font-medium font-mono text-xs sm:text-sm border-r sticky left-0 bg-background z-10 text-left"
                      >
                        {y}
                      </th>
                      {xAxis.map((x) => {
                        const k = keyOf(x, y);
                        const draft = drafts.get(k);
                        const isDirty = dirty.has(k);
                        const isSavingCell = savingKey === k;
                        const calc = draft
                          ? calcolaPrezzoSerramento({
                              prezzo_listino: draft.prezzo_listino,
                              sconto_fornitore: scontoEffettivo,
                              ricarico_azienda: ricaricoEffettivo,
                              maggiorazioni_percentuali: 0,
                              maggiorazioni_fisse: 0,
                              manodopera: 0,
                            })
                          : null;
                        return (
                          <td
                            key={x}
                            className={`p-1 border-r transition-colors ${
                              isDirty
                                ? "bg-amber-50 dark:bg-amber-950/20"
                                : ""
                            }`}
                          >
                            <div className="flex flex-col gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="Listino €"
                                value={draft?.prezzo_listino ?? ""}
                                onChange={(e) =>
                                  setCellListino(x, y, e.target.value)
                                }
                                className="h-9 text-sm font-mono"
                                aria-label={`Prezzo listino ${x}×${y} mm`}
                                disabled={isSavingCell}
                                inputMode="decimal"
                              />
                              {calc ? (
                                <div className="text-[10px] sm:text-[11px] leading-tight space-y-0.5 px-1">
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>Acq:</span>
                                    <span className="font-mono">
                                      {fmtEur(calc.prezzo_acquisto)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between font-medium">
                                    <span>Vend:</span>
                                    <span className="font-mono">
                                      {fmtEur(calc.prezzo_vendita_no_posa)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[10px] sm:text-[11px] text-muted-foreground italic px-1">
                                  vuota
                                </div>
                              )}
                              {draft && (
                                <button
                                  type="button"
                                  onClick={() => setCellListino(x, y, "0")}
                                  className="min-h-[28px] text-[11px] text-muted-foreground hover:text-destructive flex items-center justify-center gap-1 px-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive transition-colors"
                                  disabled={isSavingCell}
                                  aria-label={`Svuota cella ${x}×${y}`}
                                >
                                  <Trash2 className="h-3 w-3" aria-hidden />
                                  svuota
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="border rounded-md p-6 sm:p-8 text-center text-sm text-muted-foreground">
            Aggiungi valori ai due assi per iniziare a compilare la matrice.
          </div>
        )}

        <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            <strong className="text-foreground">{filledCells}</strong> / {totalCells} celle compilate
            {dirty.size > 0 && (
              <>
                {" "}·{" "}
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  {dirty.size} non salvate
                </span>
              </>
            )}
          </span>
          <Button
            type="button"
            onClick={() => void saveAll()}
            disabled={isSavingAll || dirty.size === 0}
            className="h-10 w-full sm:w-auto"
          >
            {isSavingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                Salvataggio…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" aria-hidden />
                Salva matrice
                {dirty.size > 0 && (
                  <span className="ml-1 font-normal">({dirty.size})</span>
                )}
              </>
            )}
          </Button>
        </div>
        </fieldset>
      </CardContent>

      <ImportMatriceDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        familyId={familyId}
        supplier={supplier}
        productLine={productLine}
        existingCells={filteredServerCells}
        onImported={() => void refetch()}
      />
    </Card>
  );
}
