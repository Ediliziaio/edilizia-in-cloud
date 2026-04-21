/**
 * GridBulkImportDialog — bulk import matrice L × H da testo incollato.
 *
 * Caso d'uso tipico: l'utente ha il listino fornitore in PDF/Excel con una
 * matrice larghezza × altezza di prezzi (tipico per finestre, persiane,
 * cassonetti). Invece di inserire cella per cella (266 celle nel caso reale
 * WND listino 1d3), copia-incolla tutta la tabella in una sola operazione.
 *
 * Formato atteso — TSV (tab-separated, default da copia-incolla Excel/PDF)
 * o CSV (virgola/punto-virgola):
 *
 *    L/H    500     600     700     ...
 *    500    207     207     228     ...
 *    600    207     207     234     ...
 *    700    222     234     250     ...
 *
 * - Prima riga = header larghezze (X). Il primo token può essere vuoto o
 *   un placeholder qualsiasi (es. "L/H"), verrà ignorato.
 * - Prima colonna di ogni riga dati = valore altezza (Y).
 * - Celle vuote = taglia non disponibile (saltate).
 *
 * L'utente sceglie se i valori vanno in `prezzo_vendita` o `prezzo_acquisto`.
 * Tipicamente i listini fornitore sono prezzi di ACQUISTO — il markup
 * (percentuale o fisso) viene poi applicato dal sistema per derivare la
 * vendita, se la famiglia è in modalità `acquisto_markup`.
 *
 * Il parsing riutilizza `parseCsvMatrix` + `matrixToCells` dalla feature
 * serramenti-listini, così la logica è testata (26 test in matrixImport.test)
 * e condivide l'handling di edge cases (formati IT/EN, quote, CRLF, out-of-range).
 *
 * Il dialog NON salva direttamente: espone un callback onApply con il
 * payload parsato, che il parent (FamilyGridEditor) applica allo stato
 * locale. L'utente vede il risultato nella matrice e poi clicca "Salva
 * griglia" per persistere.
 */

import { useMemo, useState } from "react";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  parseCsvMatrix,
  matrixToCells,
  type MatrixParseResult,
} from "@/features/serramenti-listini/utils/matrixImport";

export type BulkTargetField = "prezzo_acquisto" | "prezzo_vendita";

export interface BulkParsedPayload {
  xAxis: number[];
  yAxis: number[];
  /** Map `${x}_${y}` → valore. */
  values: Map<string, number>;
  targetField: BulkTargetField;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (payload: BulkParsedPayload) => void;
  /** Label asse X (es. "Larghezza (mm)"). Solo UI. */
  asseXLabel?: string;
  /** Label asse Y (es. "Altezza (mm)"). Solo UI. */
  asseYLabel?: string;
}

interface DisplayParseResult extends MatrixParseResult {
  /** Errore bloccante (es. input vuoto). Se presente → UI mostra errore e blocca Applica. */
  fatalError: string | null;
  /** Lookup rapido per preview tabellare. */
  valueLookup: Map<string, number>;
}

function parse(text: string): DisplayParseResult {
  if (!text.trim()) {
    return {
      xValues: [],
      yValues: [],
      cells: [],
      warnings: [],
      fatalError: null,
      valueLookup: new Map(),
    };
  }
  const raw = parseCsvMatrix(text);
  const result = matrixToCells(raw);
  const lookup = new Map<string, number>();
  for (const c of result.cells) {
    lookup.set(`${c.valore_x}_${c.valore_y}`, c.prezzo_listino);
  }

  let fatalError: string | null = null;
  if (result.cells.length === 0) {
    if (result.xValues.length === 0 && result.yValues.length === 0) {
      fatalError =
        "Impossibile leggere la matrice. Controlla che la prima riga contenga le larghezze e la prima colonna le altezze.";
    } else {
      fatalError = "Nessuna cella con prezzo valido trovata.";
    }
  }

  return {
    ...result,
    fatalError,
    valueLookup: lookup,
  };
}

export function GridBulkImportDialog({
  open,
  onOpenChange,
  onApply,
  asseXLabel = "Larghezza",
  asseYLabel = "Altezza",
}: Props) {
  const [text, setText] = useState("");
  const [targetField, setTargetField] = useState<BulkTargetField>("prezzo_acquisto");

  const result = useMemo(() => parse(text), [text]);
  const hasContent = text.trim().length > 0;
  const canApply = hasContent && !result.fatalError && result.cells.length > 0;

  const handleApply = () => {
    if (!canApply) {
      toast.error("Correggi gli errori prima di applicare");
      return;
    }
    onApply({
      xAxis: result.xValues,
      yAxis: result.yValues,
      values: result.valueLookup,
      targetField,
    });
    toast.success(
      `Matrice importata: ${result.cells.length} celle (${result.xValues.length}×${result.yValues.length})`,
    );
    setText("");
    onOpenChange(false);
  };

  const handleClose = () => {
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" aria-hidden="true" />
            Importa matrice da testo
          </DialogTitle>
          <DialogDescription>
            Incolla una tabella {asseXLabel} × {asseYLabel} copiata da Excel, PDF
            o un listino fornitore. Il sistema riconosce automaticamente tab,
            virgole e punti-virgola come separatori.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scelta campo target */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              I valori della tabella sono:
            </Label>
            <RadioGroup
              value={targetField}
              onValueChange={(v) => setTargetField(v as BulkTargetField)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-start gap-2 p-3 rounded-md border hover:bg-muted/30">
                <RadioGroupItem value="prezzo_acquisto" id="target-acq" className="mt-0.5" />
                <Label htmlFor="target-acq" className="cursor-pointer flex-1">
                  <div className="font-medium">Prezzo di acquisto (fornitore)</div>
                  <div className="text-xs text-muted-foreground">
                    Listino del fornitore. Il prezzo di vendita verrà calcolato dal
                    markup configurato nella famiglia.
                  </div>
                </Label>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-md border hover:bg-muted/30">
                <RadioGroupItem value="prezzo_vendita" id="target-vend" className="mt-0.5" />
                <Label htmlFor="target-vend" className="cursor-pointer flex-1">
                  <div className="font-medium">Prezzo di vendita (cliente)</div>
                  <div className="text-xs text-muted-foreground">
                    Prezzo di cartellino già maggiorato, da mostrare al cliente finale.
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Esempio formato */}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              Formato atteso (esempio)
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto">
{`L/H    500    600    700    800
500    207    207    228    250
600    207    207    234    250
700    222    234    250    255
800    234    234    255    282`}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              Prima riga: header con le {asseXLabel.toLowerCase()}. Prima colonna
              di ogni riga: valore {asseYLabel.toLowerCase()}. Celle vuote =
              taglia non disponibile.
            </p>
          </details>

          {/* Textarea */}
          <div className="space-y-2">
            <Label htmlFor="bulk-text" className="text-sm font-medium">
              Incolla la matrice qui:
            </Label>
            <Textarea
              id="bulk-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"L/H\t500\t600\t700\n500\t207\t207\t228\n600\t207\t207\t234"}
              className="font-mono text-xs min-h-[200px]"
              spellCheck={false}
            />
          </div>

          {/* Feedback parsing */}
          {hasContent && result.fatalError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{result.fatalError}</AlertDescription>
            </Alert>
          )}

          {canApply && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <AlertDescription className="space-y-1">
                <div>
                  <span className="font-medium">
                    {result.cells.length} celle pronte
                  </span>{" "}
                  ({result.xValues.length} {asseXLabel.toLowerCase()} ×{" "}
                  {result.yValues.length} {asseYLabel.toLowerCase()})
                </div>
                {result.warnings.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer">
                      {result.warnings.length} avviso
                      {result.warnings.length === 1 ? "" : "i"}
                    </summary>
                    <ul className="list-disc pl-4 mt-1">
                      {result.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Preview tabella parsata */}
          {canApply && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Anteprima matrice:</Label>
              <div className="border rounded-md overflow-x-auto max-h-[300px]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left border-r sticky left-0 bg-muted/50 z-10">
                        {asseYLabel} \ {asseXLabel}
                      </th>
                      {result.xValues.map((x) => (
                        <th key={x} className="p-2 text-center border-r min-w-[60px]">
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.yValues.map((y) => (
                      <tr key={y} className="border-t">
                        <td className="p-2 font-medium border-r sticky left-0 bg-background z-10">
                          {y}
                        </td>
                        {result.xValues.map((x) => {
                          const v = result.valueLookup.get(`${x}_${y}`);
                          return (
                            <td
                              key={x}
                              className={`p-2 text-center border-r ${
                                v === undefined ? "bg-muted/20 text-muted-foreground" : ""
                              }`}
                            >
                              {v !== undefined ? v.toLocaleString("it-IT") : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Annulla
          </Button>
          <Button type="button" onClick={handleApply} disabled={!canApply}>
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
            Applica alla matrice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
