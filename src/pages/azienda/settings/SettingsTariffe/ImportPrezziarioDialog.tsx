/**
 * #39 — Dialog "Importa prezziario da file".
 *
 * Carica un CSV/Excel (es. prezziario regionale, listino fornitore, computo),
 * riconosce le colonne, mostra un'anteprima con validazione riga-per-riga e
 * inserisce le voci selezionate in `tariffe_aziendali`. Le tariffe importate
 * sono poi usate automaticamente dal preventivatore e dal matching del computo
 * metrico (stesso listino).
 *
 * Logica di parsing/validazione = `src/lib/tariffe/prezziarioImport.ts` (pura,
 * testata). Qui solo lo stato UI + l'insert (mirror di StandardTariffeDialog).
 */
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle,
  Loader2, Info, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  parsePrezziarioFile,
  buildPrezziarioTemplateCsv,
  summarizePrezziario,
  toImportPayload,
  type PrezziarioParseResult,
  type ParsedPrezziarioRow,
} from "@/lib/tariffe/prezziarioImport";
import type { Tariffa } from "./types";

const INSERT_CHUNK = 100;
const MAX_PREVIEW_ROWS = 400;

function downloadTemplate() {
  const csv = buildPrezziarioTemplateCsv();
  // BOM per far aprire correttamente i caratteri accentati in Excel.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modello-prezziario.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ImportPrezziarioDialog({
  open, onClose, existing, companyId, isAdmin, onImported,
}: {
  open: boolean;
  onClose: () => void;
  existing: Tariffa[];
  companyId: string;
  isAdmin: boolean;
  onImported: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<PrezziarioParseResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const existingNames = useMemo(
    () => new Set(existing.map((t) => t.nome.trim().toLowerCase())),
    [existing],
  );
  const isDuplicate = (r: ParsedPrezziarioRow) =>
    existingNames.has(r.nome.trim().toLowerCase());

  const summary = result ? summarizePrezziario(result.rows) : null;
  const nDuplicate = useMemo(
    () => (result ? result.rows.filter((r) => r.errors.length === 0 && isDuplicate(r)).length : 0),
    [result, existingNames], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Una riga è importabile se non ha errori. I duplicati sono importabili ma
   *  deselezionati di default (creerebbero un doppione). */
  const isSelectable = (r: ParsedPrezziarioRow) => r.errors.length === 0;

  const resetState = () => {
    setFileName(null);
    setResult(null);
    setSelected(new Set());
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    resetState();
    setFileName(file.name);
    try {
      const res = await parsePrezziarioFile(file);
      setResult(res);
      // Pre-seleziona le righe valide e non duplicate.
      const pre = new Set<number>();
      for (const r of res.rows) {
        if (isSelectable(r) && !isDuplicate(r)) pre.add(r.rowIndex);
      }
      setSelected(pre);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore lettura file");
      setResult(null);
    } finally {
      setParsing(false);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    // reset input value così ricaricare lo stesso file ri-triggera onChange
    e.target.value = "";
  };

  const toggleRow = (rowIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const selectableRows = result?.rows.filter(isSelectable) ?? [];
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.rowIndex));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableRows.map((r) => r.rowIndex)));
  };

  const handleImport = async () => {
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    const toCreate = (result?.rows ?? []).filter(
      (r) => selected.has(r.rowIndex) && r.errors.length === 0,
    );
    if (toCreate.length === 0) {
      toast.info("Nessuna voce selezionata");
      return;
    }
    setImporting(true);
    try {
      const payloads = toCreate.map((r) =>
        toImportPayload(r, { companyId, includeCosto: isAdmin }),
      );
      // Insert a blocchi per non superare i limiti di payload.
      for (let i = 0; i < payloads.length; i += INSERT_CHUNK) {
        const chunk = payloads.slice(i, i + INSERT_CHUNK);
        const { error } = await supabase.from("tariffe_aziendali").insert(chunk as never);
        if (error) throw error;
      }
      toast.success(`${toCreate.length} voci importate nel listino`);
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore import tariffe");
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = useMemo(
    () => (result?.rows ?? []).filter((r) => selected.has(r.rowIndex) && r.errors.length === 0).length,
    [result, selected],
  );

  const hasHeaderError = !!result && result.missingRequired.length > 0;
  const previewRows = (result?.rows ?? []).slice(0, MAX_PREVIEW_ROWS);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-orange-600" />
            Importa prezziario da file
          </DialogTitle>
          <DialogDescription>
            Carica un prezziario o listino in CSV o Excel (.xlsx). Riconosco
            automaticamente le colonne <em>Nome</em>, <em>Prezzo</em>, e se presenti
            <em> Tipo</em>, <em>Unità</em>, <em>Costo</em> e <em>Descrizione</em>.
            Le voci importate entrano nel listino e vengono usate dal preventivatore
            e dal computo metrico.
          </DialogDescription>
        </DialogHeader>

        {/* ─── Upload + template ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={onInputChange}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={parsing || importing}
            className="border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            {parsing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1.5" />
            )}
            {fileName ? "Cambia file" : "Scegli file"}
          </Button>
          {fileName && (
            <span className="text-sm text-muted-foreground truncate max-w-[260px]">
              {fileName}
            </span>
          )}
          <div className="ml-auto">
            <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1.5" />Scarica modello CSV
            </Button>
          </div>
        </div>

        {/* ─── Errori intestazione ────────────────────────────────────────── */}
        {hasHeaderError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Intestazione non riconosciuta</AlertTitle>
            <AlertDescription className="space-y-1">
              {result!.globalErrors.map((e, i) => <div key={i}>{e}</div>)}
              <div className="text-xs">
                Suggerimento: scarica il modello CSV qui sopra per vedere le colonne attese.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* ─── Riepilogo ──────────────────────────────────────────────────── */}
        {result && !hasHeaderError && summary && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {summary.valid} valide
            </span>
            {summary.withErrors > 0 && (
              <span className="flex items-center gap-1.5 text-rose-600">
                <AlertTriangle className="h-4 w-4" />
                {summary.withErrors} con errori
              </span>
            )}
            {nDuplicate > 0 && (
              <span className="text-amber-600">{nDuplicate} già presenti</span>
            )}
            {summary.withWarnings > 0 && (
              <span className="text-muted-foreground">{summary.withWarnings} con avvisi</span>
            )}
            <span className="ml-auto font-medium">{selectedCount} selezionate</span>
          </div>
        )}

        {/* ─── Anteprima ──────────────────────────────────────────────────── */}
        {result && !hasHeaderError && result.rows.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <div className="max-h-[42vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Seleziona tutte"
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-28">Tipo</TableHead>
                    <TableHead className="w-16">UM</TableHead>
                    <TableHead className="w-24 text-right">Prezzo</TableHead>
                    {isAdmin && <TableHead className="w-24 text-right">Costo</TableHead>}
                    <TableHead className="w-24">Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((r) => {
                    const dup = r.errors.length === 0 && isDuplicate(r);
                    const selectable = isSelectable(r);
                    return (
                      <TableRow
                        key={r.rowIndex}
                        className={r.errors.length > 0 ? "bg-rose-50/40" : dup ? "bg-amber-50/40" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected.has(r.rowIndex)}
                            disabled={!selectable}
                            onCheckedChange={() => toggleRow(r.rowIndex)}
                            aria-label={`Seleziona ${r.nome}`}
                          />
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="truncate font-medium">{r.nome || <span className="text-muted-foreground italic">—</span>}</div>
                          {(r.errors.length > 0 || r.warnings.length > 0) && (
                            <div className="mt-0.5 space-y-0.5">
                              {r.errors.map((e, i) => (
                                <div key={`e${i}`} className="text-[11px] text-rose-600 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />{e}
                                </div>
                              ))}
                              {r.warnings.map((w, i) => (
                                <div key={`w${i}`} className="text-[11px] text-amber-600">{w}</div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[11px] font-normal">{r.tipo}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.unitaFatturazione}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.prezzoVendita)}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right text-muted-foreground">
                            {r.costoInterno !== null ? formatCurrency(r.costoInterno) : "—"}
                          </TableCell>
                        )}
                        <TableCell>
                          {r.errors.length > 0 ? (
                            <Badge variant="destructive" className="text-[11px]">Errore</Badge>
                          ) : dup ? (
                            <Badge className="text-[11px] bg-amber-100 text-amber-800 border border-amber-200">Già presente</Badge>
                          ) : (
                            <Badge className="text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-200">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {result.rows.length > MAX_PREVIEW_ROWS && (
              <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/10">
                Mostrate le prime {MAX_PREVIEW_ROWS} di {result.rows.length} righe.
                L'import elaborerà comunque tutte le righe selezionate.
              </div>
            )}
          </div>
        )}

        {/* ─── Hint computo ───────────────────────────────────────────────── */}
        {!result && !parsing && (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Come funziona:</strong> dopo l'import le voci finiscono nel
              listino "Manodopera e Servizi". Quando carichi un <strong>computo metrico</strong>,
              le lavorazioni vengono abbinate a queste tariffe per valorizzare
              automaticamente il preventivo. Non hai un file? Usa il
              {" "}<strong>Catalogo standard</strong> dalla schermata principale.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {result && !hasHeaderError && (
            <Button
              variant="ghost"
              onClick={() => inputRef.current?.click()}
              disabled={importing}
              className="mr-auto"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />Carica un altro file
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={importing}>Annulla</Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={handleImport}
                    disabled={importing || selectedCount === 0}
                    className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white"
                  >
                    {importing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                    Importa {selectedCount > 0 ? `${selectedCount} voci` : ""}
                  </Button>
                </span>
              </TooltipTrigger>
              {selectedCount === 0 && (
                <TooltipContent>Seleziona almeno una voce valida da importare.</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
