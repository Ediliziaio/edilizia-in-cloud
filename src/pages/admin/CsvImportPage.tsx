import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import {
  parseCsv,
  validatePIVA,
  validateEmail,
  useRunCsvImport,
} from "@/hooks/superadmin/useCsvImport";
import type {
  ParsedCsvData,
  ColumnMapping,
  ImportError,
} from "@/hooks/superadmin/useCsvImport";

// ─── Costanti campi target ────────────────────────────────

type CampoTarget = keyof ColumnMapping;

const CAMPI_TARGET: Array<{ campo: CampoTarget; label: string }> = [
  { campo: "ragione_sociale", label: "Ragione sociale" },
  { campo: "piva", label: "P.IVA" },
  { campo: "email", label: "Email" },
  { campo: "telefono", label: "Telefono" },
  { campo: "regione", label: "Regione" },
  { campo: "comune", label: "Comune" },
  { campo: "settore", label: "Settore" },
  { campo: "dimensione", label: "Dimensione azienda" },
];

// ─── Progress step wizard ─────────────────────────────────

interface ProgressStepProps {
  stepCorrente: number;
  totaleStep: number;
}

function ProgressStep({ stepCorrente, totaleStep }: ProgressStepProps) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: totaleStep }, (_, i) => i + 1).map((step) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium border-2 transition-colors ${
              step < stepCorrente
                ? "bg-primary border-primary text-primary-foreground"
                : step === stepCorrente
                ? "border-primary text-primary"
                : "border-gray-300 text-gray-400"
            }`}
          >
            {step < stepCorrente ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              step
            )}
          </div>
          {step < totaleStep && (
            <div
              className={`h-0.5 w-8 ${step < stepCorrente ? "bg-primary" : "bg-gray-200"}`}
            />
          )}
        </div>
      ))}
      <span className="ml-2 text-sm text-muted-foreground">
        Step {stepCorrente} di {totaleStep}
      </span>
    </div>
  );
}

// ─── Step 1: Upload ───────────────────────────────────────

interface Step1Props {
  onAvanti: (
    file: File,
    dati: ParsedCsvData,
    fonte: string,
    note: string
  ) => void;
}

function Step1Upload({ onAvanti }: Step1Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dati, setDati] = useState<ParsedCsvData | null>(null);
  const [fonte, setFonte] = useState("");
  const [note, setNote] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  async function elaboraFile(f: File) {
    setErrore(null);
    if (!f.name.endsWith(".csv")) {
      setErrore("Accetta solo file .csv");
      return;
    }
    if (f.size > MAX_BYTES) {
      setErrore("File troppo grande (max 10 MB)");
      return;
    }

    try {
      const testo = await f.text();
      const parsed = parseCsv(testo);

      if (parsed.headers.length === 0 || parsed.totalRows === 0) {
        setErrore("Il file CSV è vuoto o non ha righe dati");
        return;
      }

      setFile(f);
      setDati(parsed);
    } catch {
      setErrore("Errore nella lettura del file");
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) void elaboraFile(f);
    },
    []
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void elaboraFile(f);
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-6">
      {/* Drag & drop */}
      <div
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-gray-300 hover:border-primary/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium">
          Trascina qui il tuo CSV o clicca per selezionare
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Solo file .csv, max 10 MB
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* File selezionato */}
      {file && dati && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">{file.name}</p>
            <p className="text-xs text-green-600">
              {formatBytes(file.size)} · {dati.totalRows} righe · {dati.headers.length} colonne
            </p>
          </div>
        </div>
      )}

      {/* Errore */}
      {errore && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errore}
        </div>
      )}

      {/* Fonte e note */}
      <div>
        <Label>Fonte *</Label>
        <Input
          className="mt-1"
          placeholder="es. Fiera Milano 2026"
          value={fonte}
          onChange={(e) => setFonte(e.target.value)}
        />
      </div>

      <div>
        <Label>Note (opzionale)</Label>
        <Textarea
          className="mt-1 resize-none"
          rows={3}
          placeholder="Informazioni aggiuntive sull'import..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Button
        className="w-full"
        disabled={!file || !dati || !fonte.trim()}
        onClick={() => {
          if (file && dati) onAvanti(file, dati, fonte, note);
        }}
      >
        Avanti →
      </Button>
    </div>
  );
}

// ─── Step 2: Mapping colonne ──────────────────────────────

interface Step2Props {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  onIndietro: () => void;
  onAvanti: () => void;
}

function Step2Mapping({ headers, mapping, onChange, onIndietro, onAvanti }: Step2Props) {
  const NESSUNA_SELEZIONE = "__nessuna__";

  function aggiornaMapping(campo: CampoTarget, colonna: string) {
    onChange({
      ...mapping,
      [campo]: colonna === NESSUNA_SELEZIONE ? undefined : colonna,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-1">Mappatura colonne CSV</h3>
        <p className="text-sm text-muted-foreground">
          Associa le colonne del tuo file ai campi di destinazione
        </p>
      </div>

      <div className="space-y-3">
        {CAMPI_TARGET.map(({ campo, label }) => (
          <div key={campo} className="grid grid-cols-2 gap-4 items-center">
            <Label className="text-sm">{label}</Label>
            <Select
              value={mapping[campo] ?? NESSUNA_SELEZIONE}
              onValueChange={(v) => aggiornaMapping(campo, v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="— Non mappare —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNA_SELEZIONE}>— Non mappare —</SelectItem>
                {headers.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onIndietro} className="flex-1">
          ← Indietro
        </Button>
        <Button onClick={onAvanti} className="flex-1">
          Avanti →
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Preview ──────────────────────────────────────

interface Step3Props {
  dati: ParsedCsvData;
  mapping: ColumnMapping;
  onIndietro: () => void;
  onImporta: () => void;
}

interface CellaConErrore {
  campo: CampoTarget;
  errore: string;
}

function validaRiga(
  riga: Record<string, string>,
  mapping: ColumnMapping
): Map<string, string> {
  // Map<colonnaCSV, messaggioErrore>
  const errori = new Map<string, string>();

  if (mapping.piva) {
    const piva = riga[mapping.piva] ?? "";
    if (piva && !validatePIVA(piva)) {
      errori.set(mapping.piva, "P.IVA non valida");
    }
  }

  if (mapping.email) {
    const email = riga[mapping.email] ?? "";
    if (email && !validateEmail(email)) {
      errori.set(mapping.email, "Email non valida");
    }
  }

  return errori;
}

function Step3Preview({ dati, mapping, onIndietro, onImporta }: Step3Props) {
  const anteprima = dati.rows.slice(0, 10);
  const colonneVisibili = Object.values(mapping).filter(Boolean) as string[];

  // Conta righe con errori sull'intero dataset
  let righeConErrori = 0;
  for (const riga of dati.rows) {
    if (validaRiga(riga, mapping).size > 0) righeConErrori++;
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-1">Anteprima dati</h3>
          <p className="text-sm text-muted-foreground">
            Prime 10 righe del file con le colonne mappate
          </p>
        </div>

        {righeConErrori > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {righeConErrori} {righeConErrori === 1 ? "riga" : "righe"} con errori di
            validazione (saranno saltate)
          </div>
        )}

        {colonneVisibili.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna colonna mappata. Torna indietro per configurare il mapping.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  {CAMPI_TARGET.filter(({ campo }) => mapping[campo]).map(
                    ({ campo, label }) => (
                      <TableHead key={campo}>{label}</TableHead>
                    )
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {anteprima.map((riga, idx) => {
                  const errori = validaRiga(riga, mapping);

                  return (
                    <TableRow key={idx}>
                      <TableCell className="text-xs text-muted-foreground">
                        {idx + 2}
                      </TableCell>
                      {CAMPI_TARGET.filter(({ campo }) => mapping[campo]).map(
                        ({ campo }) => {
                          const colonnaCSV = mapping[campo] as string;
                          const valore = riga[colonnaCSV] ?? "";
                          const msgErrore = errori.get(colonnaCSV);

                          if (msgErrore) {
                            return (
                              <Tooltip key={campo}>
                                <TooltipTrigger asChild>
                                  <TableCell className="border border-red-300 bg-red-50 text-red-700 text-sm cursor-help">
                                    {valore || "—"}
                                  </TableCell>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{msgErrore}</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          }

                          return (
                            <TableCell key={campo} className="text-sm">
                              {valore || (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          );
                        }
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onIndietro} className="flex-1">
            ← Indietro
          </Button>
          <Button onClick={onImporta} className="flex-1">
            Importa →
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─── Step 4: Risultato ────────────────────────────────────

interface Step4Props {
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errori: ImportError[];
  inProgress: boolean;
  onNuovoImport: () => void;
}

function Step4Risultato({
  totalRows,
  importedRows,
  failedRows,
  errori,
  inProgress,
  onNuovoImport,
}: Step4Props) {
  const percentuale = totalRows > 0 ? Math.round((importedRows / totalRows) * 100) : 0;

  function esportaErroriCsv() {
    const header = "Riga,Campo,Valore,Motivo\n";
    const righe = errori
      .map(
        (e) =>
          `${e.row},"${e.field}","${e.value.replace(/"/g, '""')}","${e.message.replace(/"/g, '""')}"`
      )
      .join("\n");

    const blob = new Blob([header + righe], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `errori-import-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (inProgress) {
    return (
      <div className="space-y-4 py-8 text-center">
        <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
        <p className="font-medium">Import in corso...</p>
        <p className="text-sm text-muted-foreground">
          Stiamo importando i tuoi dati, attendi qualche secondo
        </p>
        <Progress value={percentuale} className="max-w-xs mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Riepilogo */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
        <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
        <div>
          <p className="font-semibold text-green-800">Import completato</p>
          <p className="text-sm text-green-700 mt-0.5">
            {importedRows} {importedRows === 1 ? "riga importata" : "righe importate"},
            {" "}{failedRows} {failedRows === 1 ? "saltata" : "saltate"}
          </p>
        </div>
      </div>

      {/* Tabella errori */}
      {errori.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm">
              Dettaglio errori ({errori.length})
            </h4>
            <Button variant="outline" size="sm" onClick={esportaErroriCsv}>
              Esporta errori CSV
            </Button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Riga</TableHead>
                  <TableHead>Campo</TableHead>
                  <TableHead>Valore</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errori.map((e, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-sm">{e.row}</TableCell>
                    <TableCell className="text-sm font-mono">{e.field}</TableCell>
                    <TableCell className="text-sm max-w-[120px] truncate">{e.value || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Button className="w-full" onClick={onNuovoImport}>
        Nuovo import
      </Button>
    </div>
  );
}

// ─── Pagina principale ────────────────────────────────────

export default function CsvImportPage() {
  const [step, setStep] = useState(1);

  // Dati Step 1
  const [file, setFile] = useState<File | null>(null);
  const [datiCsv, setDatiCsv] = useState<ParsedCsvData | null>(null);
  const [fonte, setFonte] = useState("");
  const [note, setNote] = useState("");

  // Dati Step 2
  const [mapping, setMapping] = useState<ColumnMapping>({});

  // Dati Step 4
  const [risultato, setRisultato] = useState<{
    importedRows: number;
    failedRows: number;
    errors: ImportError[];
  } | null>(null);

  const { mutate: avviaImport, isPending: inProgress } = useRunCsvImport();

  function handleStep1Avanti(
    f: File,
    dati: ParsedCsvData,
    _fonte: string,
    _note: string
  ) {
    setFile(f);
    setDatiCsv(dati);
    setFonte(_fonte);
    setNote(_note);
    setMapping({});
    setStep(2);
  }

  function handleImporta() {
    if (!datiCsv || !file) return;
    setStep(4);

    avviaImport(
      {
        filename: file.name,
        source: fonte,
        notes: note,
        parsedData: datiCsv,
        mapping,
      },
      {
        onSuccess: (res) => {
          setRisultato(res);
        },
        onError: () => {
          setRisultato({ importedRows: 0, failedRows: datiCsv.totalRows, errors: [] });
        },
      }
    );
  }

  function resetWizard() {
    setStep(1);
    setFile(null);
    setDatiCsv(null);
    setFonte("");
    setNote("");
    setMapping({});
    setRisultato(null);
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Import CSV Lead</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Importa contatti e lead da file CSV in pochi passi
        </p>
      </div>

      {/* Wizard */}
      <Card>
        <CardContent className="pt-6 pb-6">
          <ProgressStep stepCorrente={step} totaleStep={4} />

          {step === 1 && <Step1Upload onAvanti={handleStep1Avanti} />}

          {step === 2 && datiCsv && (
            <Step2Mapping
              headers={datiCsv.headers}
              mapping={mapping}
              onChange={setMapping}
              onIndietro={() => setStep(1)}
              onAvanti={() => setStep(3)}
            />
          )}

          {step === 3 && datiCsv && (
            <Step3Preview
              dati={datiCsv}
              mapping={mapping}
              onIndietro={() => setStep(2)}
              onImporta={handleImporta}
            />
          )}

          {step === 4 && (
            <Step4Risultato
              totalRows={datiCsv?.totalRows ?? 0}
              importedRows={risultato?.importedRows ?? 0}
              failedRows={risultato?.failedRows ?? 0}
              errori={risultato?.errors ?? []}
              inProgress={inProgress}
              onNuovoImport={resetWizard}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
