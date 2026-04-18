/**
 * STEP 5 — Dialog di import massivo matrice prezzi (Excel/CSV).
 *
 * Flow:
 *   1) Upload → file picker (xlsx, xls, csv, tsv)
 *   2) Preview → mostra righe/colonne/celle parsed + warnings + conflitti
 *   3) Applica → loop upsert delle celle via useGridCellMutations; toast
 *      partial-success + captureVelocityError su fallimenti
 *
 * Convenzione schema file: vedi `utils/matrixImport.ts` (pivot L×H).
 *
 * Sicurezza:
 *   - max 10 MB (enforced in parseMatrixFile)
 *   - warning su >400 celle (loop client-side rallenta oltre)
 *
 * Non-destructive:
 *   - import fa UPSERT; celle esistenti fuori dal file restano in DB.
 *   - opzione "sovrascrivi duplicati" (di default TRUE) — se false scarta
 *     le celle già presenti.
 */

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { captureVelocityError } from "@/lib/velocity/sentry";
import { useGridCellMutations } from "../hooks/useGridCells";
import type { GridCell, SupplierCatalog, SupplierProductLine } from "../types";
import { calcolaPrezzoSerramento } from "../utils/pricing";
import {
  MATRIX_IMPORT_LIMITS,
  type MatrixParseResult,
  parseMatrixFile,
} from "../utils/matrixImport";

type Step = "upload" | "preview" | "importing" | "result";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyId: string;
  supplier: SupplierCatalog;
  productLine: SupplierProductLine;
  /** Celle già presenti lato server per calcolo conflitti */
  existingCells: GridCell[];
  /** Callback al successo per refetch/reset parent */
  onImported?: () => void;
}

interface ImportResult {
  ok: number;
  errors: string[];
}

export function ImportMatriceDialog({
  open,
  onOpenChange,
  familyId,
  supplier,
  productLine,
  existingCells,
  onImported,
}: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<MatrixParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [overwrite, setOverwrite] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const { upsert } = useGridCellMutations();

  const scontoEffettivo =
    productLine.sconto_override ?? supplier.sconto_default ?? 0;
  const ricaricoEffettivo = productLine.ricarico_default ?? 0;

  // ─── Derived: conflitti con celle già esistenti ────────────────────────────
  const conflictKeys = useMemo(() => {
    if (!parsed) return new Set<string>();
    const existing = new Set<string>();
    for (const c of existingCells) {
      existing.add(`${c.valore_x}_${c.valore_y}`);
    }
    const set = new Set<string>();
    for (const cell of parsed.cells) {
      const k = `${cell.valore_x}_${cell.valore_y}`;
      if (existing.has(k)) set.add(k);
    }
    return set;
  }, [parsed, existingCells]);

  const cellsToWrite = useMemo(() => {
    if (!parsed) return [];
    if (overwrite) return parsed.cells;
    return parsed.cells.filter(
      (c) => !conflictKeys.has(`${c.valore_x}_${c.valore_y}`),
    );
  }, [parsed, overwrite, conflictKeys]);

  // ─── Reset ────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setParsed(null);
    setParseError(null);
    setIsParsing(false);
    setOverwrite(true);
    setProgress(0);
    setResult(null);
    setDragOver(false);
  }, []);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      // Proteggi la chiusura durante l'import: ESC / overlay click /
      // bottone di sistema verrebbero altrimenti persi a metà mutation.
      if (!v && step === "importing") {
        toast.info("Import in corso, attendi il completamento");
        return;
      }
      if (!v) reset();
      onOpenChange(v);
    },
    [onOpenChange, reset, step],
  );

  // ─── File parsing ────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setFileName(file.name);
    try {
      const r = await parseMatrixFile(file);
      if (r.cells.length === 0) {
        setParseError(
          r.warnings[0] ?? "Il file non contiene celle valide con lo schema pivot L×H",
        );
        setParsed(null);
      } else {
        setParsed(r);
        setStep("preview");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setParseError(msg);
      setParsed(null);
      captureVelocityError("listini-avanzati.matrice.import.parse", e as Error, {
        fileName: file.name,
      });
    } finally {
      setIsParsing(false);
    }
  }, []);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    // reset input value per permettere ri-upload stesso file dopo errore
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  // ─── Apply (loop upsert) ─────────────────────────────────────────────────
  const applyImport = async () => {
    if (cellsToWrite.length === 0) {
      toast.info("Nessuna cella da importare");
      return;
    }
    setStep("importing");
    setProgress(0);
    let ok = 0;
    const errors: string[] = [];
    for (let i = 0; i < cellsToWrite.length; i++) {
      const cell = cellsToWrite[i];
      try {
        const calc = calcolaPrezzoSerramento({
          prezzo_listino: cell.prezzo_listino,
          sconto_fornitore: scontoEffettivo,
          ricarico_azienda: ricaricoEffettivo,
          maggiorazioni_percentuali: 0,
          maggiorazioni_fisse: 0,
          manodopera: 0,
        });
        await upsert.mutateAsync({
          family_id: familyId,
          axis_config: null,
          valore_x: cell.valore_x,
          valore_y: cell.valore_y,
          prezzo_vendita: cell.prezzo_listino,
          prezzo_acquisto: calc.prezzo_acquisto,
          supplier_catalog_id: supplier.id,
          supplier_product_line_id: productLine.id,
          note: null,
        });
        ok++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${cell.valore_x}×${cell.valore_y}: ${msg}`);
      }
      setProgress(Math.round(((i + 1) / cellsToWrite.length) * 100));
    }
    setResult({ ok, errors });
    setStep("result");
    if (errors.length === 0) {
      toast.success(`${ok} celle importate`);
    } else {
      toast.error(`Importate ${ok}, errori su ${errors.length}`, {
        description: errors.slice(0, 2).join(" · "),
      });
      captureVelocityError(
        "listini-avanzati.matrice.import.partial",
        new Error(errors.join("; ")),
        { ok, errCount: errors.length, familyId, productLineId: productLine.id },
      );
    }
    onImported?.();
  };

  // ─── Render per-step ─────────────────────────────────────────────────────

  const renderUpload = () => (
    <div className="space-y-4 py-2">
      <label
        htmlFor="matrix-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md p-8 cursor-pointer transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        }`}
      >
        <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">
          Trascina qui un file Excel o CSV
        </span>
        <span className="text-xs text-muted-foreground">
          Oppure clicca per selezionare. Max{" "}
          {MATRIX_IMPORT_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024} MB
        </span>
        <input
          id="matrix-file"
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={onFileInputChange}
          disabled={isParsing}
        />
      </label>
      {isParsing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Lettura {fileName}…
        </div>
      )}
      {parseError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>Errore parsing file</AlertTitle>
          <AlertDescription className="text-xs">{parseError}</AlertDescription>
        </Alert>
      )}
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">Schema atteso:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <strong>Riga 1</strong> (da B1): valori <em>larghezza</em> in mm
          </li>
          <li>
            <strong>Colonna A</strong> (da A2): valori <em>altezza</em> in mm
          </li>
          <li>
            <strong>Celle interne</strong>: prezzi di <em>listino</em> (pre-sconto)
          </li>
          <li>Celle vuote o ≤ 0 vengono ignorate</li>
        </ul>
      </div>
    </div>
  );

  const renderPreview = () => {
    if (!parsed) return null;
    const totalCells = parsed.cells.length;
    const conflictsCount = conflictKeys.size;
    const tooMany = totalCells > 400;
    return (
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="font-medium truncate">{fileName}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <SummaryTile label="Larghezze" value={parsed.xValues.length} />
          <SummaryTile label="Altezze" value={parsed.yValues.length} />
          <SummaryTile label="Celle" value={totalCells} />
          <SummaryTile
            label="Conflitti"
            value={conflictsCount}
            tone={conflictsCount > 0 ? "warn" : "ok"}
          />
        </div>

        {tooMany && (
          <Alert>
            <Info className="h-4 w-4" aria-hidden />
            <AlertTitle>Import corposo</AlertTitle>
            <AlertDescription className="text-xs">
              {totalCells} celle — l'import richiederà qualche secondo. Non
              chiudere il dialog fino al completamento.
            </AlertDescription>
          </Alert>
        )}

        {parsed.warnings.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>Avvisi ({parsed.warnings.length})</AlertTitle>
            <AlertDescription>
              <ScrollArea className="max-h-24 mt-1">
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  {parsed.warnings.slice(0, 10).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {parsed.warnings.length > 10 && (
                    <li className="text-muted-foreground italic">
                      …e altri {parsed.warnings.length - 10}
                    </li>
                  )}
                </ul>
              </ScrollArea>
            </AlertDescription>
          </Alert>
        )}

        {conflictsCount > 0 && (
          <div className="flex items-start gap-2 rounded-md border bg-amber-50 dark:bg-amber-950/20 p-3">
            <Checkbox
              id="overwrite"
              checked={overwrite}
              onCheckedChange={(v) => setOverwrite(v === true)}
              className="mt-0.5"
            />
            <label
              htmlFor="overwrite"
              className="text-xs cursor-pointer leading-relaxed"
            >
              <span className="font-medium">
                Sovrascrivi {conflictsCount} cell
                {conflictsCount === 1 ? "a" : "e"} già presente
                {conflictsCount === 1 ? "" : "i"} in listino
              </span>
              <br />
              <span className="text-muted-foreground">
                Se deselezionato, le celle già presenti verranno mantenute
                invariate e importate solo le nuove.
              </span>
            </label>
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Anteprima prime 10 celle
          </summary>
          <ScrollArea className="max-h-48 mt-2 border rounded-md">
            <table className="w-full">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-left">L (mm)</th>
                  <th className="p-2 text-left">H (mm)</th>
                  <th className="p-2 text-right">Listino (€)</th>
                </tr>
              </thead>
              <tbody>
                {parsed.cells.slice(0, 10).map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-mono">{c.valore_x}</td>
                    <td className="p-2 font-mono">{c.valore_y}</td>
                    <td className="p-2 font-mono text-right">
                      {c.prezzo_listino.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </details>

        <p className="text-xs text-muted-foreground">
          Verranno scritte <strong>{cellsToWrite.length}</strong> celle con
          sconto <strong>{(scontoEffettivo * 100).toFixed(0)}%</strong> e
          ricarico <strong>{(ricaricoEffettivo * 100).toFixed(0)}%</strong>{" "}
          applicati automaticamente al salvataggio.
        </p>
      </div>
    );
  };

  const renderImporting = () => (
    <div className="space-y-4 py-6">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Import in corso… ({progress}%)
      </div>
      <Progress value={progress} aria-label="Progresso import" />
      <p className="text-xs text-muted-foreground">
        Sto scrivendo {cellsToWrite.length} celle. Non chiudere la finestra.
      </p>
    </div>
  );

  const renderResult = () => {
    if (!result) return null;
    const isSuccess = result.errors.length === 0;
    return (
      <div className="space-y-4 py-4">
        {isSuccess ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
            <AlertTitle>Import completato</AlertTitle>
            <AlertDescription>
              Importate {result.ok} celle nella matrice prezzi.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>
              Import parziale: {result.ok} ok, {result.errors.length} errori
            </AlertTitle>
            <AlertDescription>
              <ScrollArea className="max-h-32 mt-1">
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  {result.errors.slice(0, 8).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {result.errors.length > 8 && (
                    <li className="italic">
                      …e altri {result.errors.length - 8}
                    </li>
                  )}
                </ul>
              </ScrollArea>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Importa matrice da file
            <Badge variant="outline" className="text-xs font-normal">
              {productLine.nome}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Carica un file Excel/CSV con lo schema pivot L×H. I prezzi vengono
            scritti come <em>listino</em>; acquisto e vendita sono calcolati
            al salvataggio applicando lo sconto fornitore e il ricarico della
            linea.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && renderUpload()}
        {step === "preview" && renderPreview()}
        {step === "importing" && renderImporting()}
        {step === "result" && renderResult()}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Annulla
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setParsed(null);
                }}
              >
                Indietro
              </Button>
              <Button
                onClick={() => void applyImport()}
                disabled={cellsToWrite.length === 0}
              >
                Importa {cellsToWrite.length} cell
                {cellsToWrite.length === 1 ? "a" : "e"}
              </Button>
            </>
          )}
          {step === "importing" && (
            <Button disabled variant="outline">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
              Import in corso
            </Button>
          )}
          {step === "result" && (
            <Button onClick={() => handleOpenChange(false)}>Chiudi</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "ok" | "warn";
}) {
  const toneClasses: Record<typeof tone, string> = {
    default: "bg-muted/30",
    ok: "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-100",
    warn: "bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-100",
  };
  return (
    <div className={`rounded-md border p-2 ${toneClasses[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold font-mono">{value}</div>
    </div>
  );
}
