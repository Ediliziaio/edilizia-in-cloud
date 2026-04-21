/**
 * GridBulkImportDialog — bulk import matrice L × H da testo incollato O immagine.
 *
 * Due modalità di input:
 *   1. TESTO (TSV/CSV) — paste diretto da Excel/PDF/listino fornitore.
 *   2. IMMAGINE (AI)   — upload screenshot/foto listino, parsing via Edge Function
 *      `parse-matrix-image` (OpenAI / Anthropic / Gemini auto-selezionato).
 *
 * Entrambe le modalità producono un TSV normalizzato che viene poi passato dallo
 * stesso pipeline `parseCsvMatrix` → `matrixToCells` → preview → apply. Questo
 * significa che l'utente, dopo l'upload AI, vede il TSV nella textarea e può
 * correggerlo a mano prima di applicare (fallback robusto se il modello sbaglia
 * qualche cella).
 *
 * Caso d'uso tipico: l'utente ha il listino fornitore in PDF/Excel con una
 * matrice larghezza × altezza di prezzi (tipico per finestre, persiane,
 * cassonetti). Invece di inserire cella per cella (266 celle nel caso reale
 * WND listino 1d3), copia-incolla tutta la tabella — oppure carica l'immagine
 * della pagina del listino e lascia che l'AI la trascriva.
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
 * Il parsing testuale riutilizza `parseCsvMatrix` + `matrixToCells` dalla feature
 * serramenti-listini, così la logica è testata (26 test in matrixImport.test)
 * e condivide l'handling di edge cases (formati IT/EN, quote, CRLF, out-of-range).
 *
 * Il dialog NON salva direttamente: espone un callback onApply con il
 * payload parsato, che il parent (FamilyGridEditor) applica allo stato
 * locale. L'utente vede il risultato nella matrice e poi clicca "Salva
 * griglia" per persistere.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, AlertCircle, CheckCircle2, Sparkles, Loader2, Image as ImageIcon, FileText, ShieldAlert } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  parseCsvMatrix,
  matrixToCells,
  type MatrixParseResult,
} from "@/features/serramenti-listini/utils/matrixImport";

export type BulkTargetField = "prezzo_acquisto" | "prezzo_vendita";
export type AiProvider = "auto" | "openai" | "anthropic" | "gemini";

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

interface AiResponseData {
  xValues: number[];
  yValues: number[];
  cells: { x: number; y: number; value: number }[];
}

interface AiParseResponse {
  ok: boolean;
  provider?: string;
  model?: string;
  data?: AiResponseData;
  warnings?: string[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: string;
  code?: string;
  raw_preview?: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

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

/**
 * Converte la risposta dell'AI in TSV che l'utente può leggere/editare.
 * Riutilizziamo il pipeline testuale — preview, validation e apply restano unificati.
 */
function aiResponseToTsv(ai: AiResponseData): string {
  const { xValues, yValues, cells } = ai;
  const lookup = new Map<string, number>();
  for (const c of cells) lookup.set(`${c.x}_${c.y}`, c.value);

  const lines: string[] = [];
  lines.push(["L/H", ...xValues.map((x) => String(x))].join("\t"));
  for (const y of yValues) {
    const row = [String(y)];
    for (const x of xValues) {
      const v = lookup.get(`${x}_${y}`);
      row.push(v !== undefined ? String(v) : "");
    }
    lines.push(row.join("\t"));
  }
  return lines.join("\n");
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result è tipo "data:image/png;base64,XXXXX" — estrarre parti
      const match = /^data:([^;]+);base64,(.+)$/.exec(result);
      if (!match) {
        reject(new Error("Impossibile leggere il file"));
        return;
      }
      resolve({ mimeType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(new Error("Errore lettura file"));
    reader.readAsDataURL(file);
  });
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
  const [mode, setMode] = useState<"text" | "image">("text");

  // Image tab state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<AiProvider>("auto");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInfo, setAiInfo] = useState<{
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    cellCount: number;
  } | null>(null);
  // m3 (audit): quando i valori arrivano dall'AI, l'utente DEVE confermare
  //   esplicitamente di aver verificato ogni cella — il parser può fraintendere
  //   cifre, decimali o intestazioni, e valori sbagliati si propagano a cascata
  //   su vendita/margini. Finché il checkbox non è spuntato, "Applica" resta
  //   disabilitato.
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const result = useMemo(() => parse(text), [text]);
  const hasContent = text.trim().length > 0;
  const needsAiConfirm = aiInfo !== null;
  const canApply =
    hasContent &&
    !result.fatalError &&
    result.cells.length > 0 &&
    (!needsAiConfirm || aiConfirmed);

  // Se l'utente svuota la textarea (es. cancella tutto per incollare una
  // matrice diversa) o chiude il tab immagine, smontiamo il flag AI: non
  // avrebbe senso chiedere la conferma su dati che l'AI non ha (più) prodotto.
  useEffect(() => {
    if (!hasContent && aiInfo) {
      setAiInfo(null);
      setAiConfirmed(false);
    }
  }, [hasContent, aiInfo]);

  const resetAll = () => {
    setText("");
    setImageFile(null);
    setImagePreview(null);
    setAiError(null);
    setAiInfo(null);
    setAiLoading(false);
    setAiConfirmed(false);
  };

  const handleFileSelect = (file: File | null) => {
    setAiError(null);
    // Nuova immagine ⇒ l'AI dovrà ri-analizzare: invalidiamo la precedente
    // conferma così il bottone "Applica" torna a richiederla.
    setAiConfirmed(false);
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error(`Formato non supportato. Usa PNG, JPEG, WebP o GIF.`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(
        `Immagine troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`,
      );
      return;
    }
    setImageFile(file);
    // Crea preview URL
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const handleAnalyzeImage = async () => {
    if (!imageFile) {
      toast.error("Seleziona prima un'immagine");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiInfo(null);
    // Ogni nuova analisi produce un payload diverso: la conferma precedente
    // non può più essere considerata valida.
    setAiConfirmed(false);
    try {
      const { base64, mimeType } = await fileToBase64(imageFile);
      const { data, error } = await supabase.functions.invoke<AiParseResponse>("parse-matrix-image", {
        body: {
          image_base64: base64,
          mime_type: mimeType,
          provider: aiProvider,
        },
      });
      if (error) {
        throw new Error(error.message || "Errore chiamata Edge Function");
      }
      if (!data || data.ok !== true || !data.data) {
        throw new Error(data?.error ?? "Risposta AI non valida");
      }
      // Popola il TSV — riutilizza lo stesso pipeline del tab Testo
      const tsv = aiResponseToTsv(data.data);
      setText(tsv);
      setAiInfo({
        provider: data.provider ?? "—",
        model: data.model ?? "—",
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        cellCount: data.data.cells.length,
      });
      if (data.warnings && data.warnings.length > 0) {
        toast.info(`AI ha completato l'analisi con ${data.warnings.length} avvisi`, {
          description: data.warnings.slice(0, 2).join("; "),
        });
      } else {
        toast.success(`AI ha riconosciuto ${data.data.cells.length} celle`);
      }
      // Sposta focus sulla preview — tabMode rimane "image" così l'utente vede provider/tokens
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(msg);
      toast.error("Errore analisi AI", { description: msg });
    } finally {
      setAiLoading(false);
    }
  };

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
    resetAll();
    onOpenChange(false);
  };

  const handleClose = () => {
    resetAll();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" aria-hidden="true" />
            Importa matrice
          </DialogTitle>
          <DialogDescription>
            Incolla una tabella {asseXLabel} × {asseYLabel} da Excel/PDF, oppure
            carica lo screenshot del listino e lascia che l'AI la trascriva.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scelta campo target — comune a entrambi i tab */}
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

          {/* Tabs — Testo vs Immagine AI */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as "text" | "image")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text" className="gap-2">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Testo (copia-incolla)
              </TabsTrigger>
              <TabsTrigger value="image" className="gap-2">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Immagine (AI)
              </TabsTrigger>
            </TabsList>

            {/* Tab: Testo */}
            <TabsContent value="text" className="space-y-3 mt-4">
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
            </TabsContent>

            {/* Tab: Immagine AI */}
            <TabsContent value="image" className="space-y-3 mt-4">
              <Alert>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <AlertDescription className="text-xs">
                  Carica uno screenshot o una foto del listino del fornitore. L'AI
                  leggerà larghezze, altezze e prezzi producendo una matrice editabile.
                  Puoi correggere eventuali errori nel tab "Testo" prima di applicare.
                </AlertDescription>
              </Alert>

              {/* Provider selector */}
              <div className="space-y-2">
                <Label htmlFor="ai-provider" className="text-sm font-medium">
                  Modello AI
                </Label>
                <Select value={aiProvider} onValueChange={(v) => setAiProvider(v as AiProvider)}>
                  <SelectTrigger id="ai-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (primo disponibile)</SelectItem>
                    <SelectItem value="openai">OpenAI GPT-4o</SelectItem>
                    <SelectItem value="anthropic">Anthropic Claude Sonnet 4</SelectItem>
                    <SelectItem value="gemini">Google Gemini 2.5 Pro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se il modello scelto non è configurato, l'admin deve aggiungere la
                  rispettiva API key nei secrets della Edge Function.
                </p>
              </div>

              {/* File input */}
              <div className="space-y-2">
                <Label htmlFor="bulk-image" className="text-sm font-medium">
                  Immagine del listino
                </Label>
                <input
                  id="bulk-image"
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_MIME.join(",")}
                  onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  PNG, JPEG, WebP o GIF. Max 10 MB.
                </p>
              </div>

              {/* Image preview + Analyze button */}
              {imagePreview && (
                <div className="space-y-2">
                  <div className="border rounded-md p-2 bg-muted/20">
                    <img
                      src={imagePreview}
                      alt="Anteprima listino"
                      className="max-h-[280px] w-auto mx-auto rounded"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleAnalyzeImage}
                    disabled={aiLoading}
                    className="w-full"
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                        Analisi AI in corso…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
                        Analizza immagine con AI
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* AI error */}
              {aiError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription>
                    <div className="font-medium">Analisi AI non riuscita</div>
                    <div className="text-xs mt-1">{aiError}</div>
                  </AlertDescription>
                </Alert>
              )}

              {/* AI success info */}
              {aiInfo && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription className="space-y-1 text-xs">
                    <div>
                      <span className="font-medium">{aiInfo.cellCount} celle riconosciute</span>{" "}
                      via <span className="font-medium">{aiInfo.provider}</span> ({aiInfo.model})
                    </div>
                    {aiInfo.inputTokens !== undefined && (
                      <div className="text-muted-foreground">
                        Token: {aiInfo.inputTokens} input + {aiInfo.outputTokens} output
                      </div>
                    )}
                    <div className="text-muted-foreground">
                      Controlla l'anteprima sotto. Per correggere, modifica il TSV nel tab "Testo".
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {!imagePreview && (
                <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-8 text-center text-muted-foreground">
                  <ImageIcon className="h-10 w-10 mb-2" aria-hidden="true" />
                  <p className="text-sm">Nessuna immagine caricata</p>
                  <p className="text-xs mt-1">Seleziona un file per iniziare</p>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Feedback parsing — comune a entrambi i tab */}
          {hasContent && result.fatalError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{result.fatalError}</AlertDescription>
            </Alert>
          )}

          {hasContent && !result.fatalError && result.cells.length > 0 && (
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
                {needsAiConfirm && !aiConfirmed && (
                  <div className="text-xs text-amber-700 dark:text-amber-400 pt-1">
                    ⚠ Conferma la verifica dei valori AI per abilitare "Applica".
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Preview tabella parsata — comune */}
          {hasContent && !result.fatalError && result.cells.length > 0 && (
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

          {/* m3 (audit): conferma obbligatoria quando i valori vengono dall'AI.
              Il parser può sbagliare singole cifre, confondere decimali IT/EN,
              saltare righe nascoste da border nell'immagine — errori subdoli che
              si propagano su vendita/margine/preventivi. Forziamo l'operatore a
              dichiarare esplicitamente di aver controllato la preview prima di
              applicare. Il checkbox è bloccante: "Applica" resta disabilitato. */}
          {needsAiConfirm && hasContent && !result.fatalError && result.cells.length > 0 && (
            <Alert variant="destructive" className="border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <AlertDescription className="space-y-2">
                <div className="font-medium">
                  Verifica i valori letti dall'AI prima di applicare.
                </div>
                <div className="text-xs">
                  L'estrazione automatica può fraintendere cifre (es. <strong>7</strong> vs{" "}
                  <strong>1</strong>), decimali IT/EN, o saltare righe. Valori errati entreranno
                  nel motore prezzi e impatteranno vendita, margine e preventivi. Controlla
                  l'anteprima sopra, correggi eventuali celle nel tab "Testo", poi conferma.
                </div>
                <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                  <Checkbox
                    id="ai-confirmed"
                    checked={aiConfirmed}
                    onCheckedChange={(v) => setAiConfirmed(v === true)}
                    className="mt-0.5 border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                  />
                  <span className="text-xs font-medium">
                    Ho verificato tutti i valori estratti dall'AI e confermo che sono corretti.
                  </span>
                </label>
              </AlertDescription>
            </Alert>
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
