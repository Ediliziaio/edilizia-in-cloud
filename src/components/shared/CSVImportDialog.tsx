import { useState, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
  type?: "text" | "number" | "date" | "email";
}

export interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: ImportField[];
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; errors: string[] }>;
}

type Step = "upload" | "mapping" | "importing" | "result";

function autoMatch(fileHeaders: string[], fields: ImportField[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9àèéìòù]/g, "");

  fileHeaders.forEach((header) => {
    const norm = normalize(header);
    const match = fields.find((f) => {
      const labelNorm = normalize(f.label);
      const keyNorm = normalize(f.key);
      return norm === labelNorm || norm === keyNorm || labelNorm.includes(norm) || norm.includes(labelNorm);
    });
    if (match) {
      mapping[header] = match.key;
    }
  });
  return mapping;
}

function parseFileData(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isCSV = file.name.toLowerCase().endsWith(".csv");

    if (isCSV) {
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) return reject(new Error("File vuoto"));
        // Detect separator
        const firstLine = text.split("\n")[0];
        const sep = firstLine.includes(";") ? ";" : ",";
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        const parseRow = (line: string) => {
          const result: string[] = [];
          let inQuote = false;
          let current = "";
          for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; continue; }
            if (ch === sep && !inQuote) { result.push(current.trim()); current = ""; continue; }
            current += ch;
          }
          result.push(current.trim());
          return result;
        };
        const headers = parseRow(lines[0]);
        const rows = lines.slice(1).map(parseRow);
        resolve({ headers, rows });
      };
      reader.onerror = () => reject(new Error("Errore lettura file"));
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
        if (json.length === 0) return reject(new Error("File vuoto"));
        const headers = (json[0] as string[]).map(String);
        const rows = json.slice(1).map((r) => (r as any[]).map((c) => (c != null ? String(c) : "")));
        resolve({ headers, rows });
      };
      reader.onerror = () => reject(new Error("Errore lettura file"));
      reader.readAsArrayBuffer(file);
    }
  });
}

export function CSVImportDialog({ open, onOpenChange, title, fields, onImport }: CSVImportDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setStep("upload");
    setFileHeaders([]);
    setFileRows([]);
    setMapping({});
    setFileName("");
    setResult(null);
  }, []);

  const handleClose = useCallback((val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  }, [onOpenChange, reset]);

  const handleFile = useCallback(async (file: File) => {
    try {
      setFileName(file.name);
      const { headers, rows } = await parseFileData(file);
      setFileHeaders(headers);
      setFileRows(rows);
      setMapping(autoMatch(headers, fields));
      setStep("mapping");
    } catch {
      setResult({ success: 0, errors: ["Errore durante la lettura del file"] });
      setStep("result");
    }
  }, [fields]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Validation: check required fields are mapped
  const missingRequired = useMemo(() => {
    const mappedKeys = new Set(Object.values(mapping));
    return fields.filter((f) => f.required && !mappedKeys.has(f.key));
  }, [mapping, fields]);

  const canImport = missingRequired.length === 0 && fileRows.length > 0;

  const handleImport = useCallback(async () => {
    setStep("importing");

    // Build mapped rows
    const mappedRows = fileRows.map((row) => {
      const obj: Record<string, string> = {};
      fileHeaders.forEach((header, idx) => {
        const fieldKey = mapping[header];
        if (fieldKey) obj[fieldKey] = row[idx] || "";
      });
      return obj;
    });

    // Filter out completely empty rows
    const validRows = mappedRows.filter((r) => Object.values(r).some((v) => v.trim()));

    try {
      const res = await onImport(validRows);
      setResult(res);
    } catch (err: any) {
      setResult({ success: 0, errors: [err?.message || "Errore durante l'importazione"] });
    } finally {
      setStep("result");
    }
  }, [fileRows, fileHeaders, mapping, onImport]);

  // Preview: first 5 rows
  const previewRows = fileRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Carica un file CSV o Excel (.xls, .xlsx)"}
            {step === "mapping" && `${fileName} — ${fileRows.length} righe trovate. Mappa le colonne ai campi.`}
            {step === "importing" && "Importazione in corso..."}
            {step === "result" && "Importazione completata"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {/* UPLOAD STEP */}
          {step === "upload" && (
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("csv-file-input")?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium mb-1">Trascina qui il file o clicca per selezionare</p>
              <p className="text-sm text-muted-foreground">Formati supportati: .csv, .xls, .xlsx</p>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          )}

          {/* MAPPING STEP */}
          {step === "mapping" && (
            <div className="space-y-4">
              {/* Column mapping */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Mappatura colonne</p>
                <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
                  {fileHeaders.map((header) => (
                    <div key={header} className="flex items-center gap-3">
                      <div className="w-[40%] text-sm truncate border rounded px-2 py-1.5 bg-muted/50">
                        {header}
                      </div>
                      <span className="text-muted-foreground text-xs">→</span>
                      <Select
                        value={mapping[header] || "__ignore__"}
                        onValueChange={(val) =>
                          setMapping((prev) => {
                            const next = { ...prev };
                            if (val === "__ignore__") delete next[header];
                            else next[header] = val;
                            return next;
                          })
                        }
                      >
                        <SelectTrigger className="w-[45%]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore__">— Ignora —</SelectItem>
                          {fields.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}{f.required ? " *" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Validation errors */}
              {missingRequired.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded p-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Campi obbligatori non mappati:{" "}
                    {missingRequired.map((f) => f.label).join(", ")}
                  </span>
                </div>
              )}

              {/* Preview */}
              {previewRows.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Anteprima ({previewRows.length} di {fileRows.length} righe)
                  </p>
                  <ScrollArea className="max-h-[160px]">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {fileHeaders.map((h) => (
                              <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewRows.map((row, i) => (
                            <TableRow key={i}>
                              {row.map((cell, j) => (
                                <TableCell key={j} className="text-xs py-1 whitespace-nowrap max-w-[150px] truncate">
                                  {cell}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {/* IMPORTING STEP */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Importazione in corso...</p>
            </div>
          )}

          {/* RESULT STEP */}
          {step === "result" && result && (
            <div className="space-y-4 py-4">
              {result.success > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-lg p-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>{result.success} righe importate con successo</span>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{result.errors.length} errori</span>
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    <div className="space-y-1">
                      {result.errors.map((err, i) => (
                        <p key={i} className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1">{err}</p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "mapping" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>Indietro</Button>
              <Button onClick={handleImport} disabled={!canImport}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Importa {fileRows.length} righe
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={() => handleClose(false)}>Chiudi</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
