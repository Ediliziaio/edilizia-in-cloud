import { useState, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { ChevronLeft, X } from "lucide-react";
import { StepIndicator } from "./import-wizard/StepIndicator";
import { StepStart, type ObjectType } from "./import-wizard/StepStart";
import { StepUpload, type ImportMode } from "./import-wizard/StepUpload";
import { StepMap } from "./import-wizard/StepMap";
import { StepReview } from "./import-wizard/StepReview";
import type { ImportField } from "./CSVImportDialog";

export interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
  defaultObjectType: ObjectType;
  contactFields: ImportField[];
  opportunityFields: ImportField[];
  onImportContacts: (rows: Record<string, string>[], options: { mode: ImportMode }) => Promise<{ success: number; errors: string[] }>;
  onImportOpportunities: (rows: Record<string, string>[], options: { mode: ImportMode }) => Promise<{ success: number; errors: string[] }>;
}

function autoMatch(fileHeaders: string[], fields: ImportField[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9àèéìòù]/g, "");
  fileHeaders.forEach((header) => {
    const norm = normalize(header);
    const match = fields.find((f) => {
      const ln = normalize(f.label);
      const kn = normalize(f.key);
      return norm === ln || norm === kn || ln.includes(norm) || norm.includes(ln);
    });
    if (match) mapping[header] = match.key;
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
        const firstLine = text.split("\n")[0];
        const sep = firstLine.includes(";") ? ";" : ",";
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        const parseRow = (line: string) => {
          const result: string[] = [];
          let inQuote = false, current = "";
          for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; continue; }
            if (ch === sep && !inQuote) { result.push(current.trim()); current = ""; continue; }
            current += ch;
          }
          result.push(current.trim());
          return result;
        };
        resolve({ headers: parseRow(lines[0]), rows: lines.slice(1).map(parseRow) });
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

export function ImportWizard({
  open, onClose, defaultObjectType, contactFields, opportunityFields,
  onImportContacts, onImportOpportunities,
}: ImportWizardProps) {
  const [step, setStep] = useState(0);
  const [objectType, setObjectType] = useState<ObjectType>(defaultObjectType);
  const [file, setFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("create");
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipUnmapped, setSkipUnmapped] = useState(true);
  const [consent, setConsent] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);

  const fields = objectType === "contacts" ? contactFields : opportunityFields;

  const handleFileChange = useCallback(async (f: File | null) => {
    setFile(f);
    if (!f) { setFileHeaders([]); setFileRows([]); setMapping({}); return; }
    try {
      const { headers, rows } = await parseFileData(f);
      setFileHeaders(headers);
      setFileRows(rows);
      setMapping(autoMatch(headers, fields));
    } catch {
      setFile(null);
    }
  }, [fields]);

  const missingRequired = useMemo(() => {
    const mappedKeys = new Set(Object.values(mapping));
    return fields.filter((f) => f.required && !mappedKeys.has(f.key));
  }, [mapping, fields]);

  const canNext = (s: number) => {
    if (s === 1) return !!file && fileHeaders.length > 0;
    if (s === 2) return missingRequired.length === 0 && fileRows.length > 0;
    if (s === 3) return consent && !isImporting;
    return true;
  };

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    const mappedRows = fileRows.map((row) => {
      const obj: Record<string, string> = {};
      fileHeaders.forEach((header, idx) => {
        const fieldKey = mapping[header];
        if (fieldKey) obj[fieldKey] = row[idx] || "";
      });
      return obj;
    }).filter((r) => Object.values(r).some((v) => v.trim()));

    try {
      const fn = objectType === "contacts" ? onImportContacts : onImportOpportunities;
      const res = await fn(mappedRows, { mode: importMode });
      setResult(res);
    } catch (err: any) {
      setResult({ success: 0, errors: [err?.message || "Errore durante l'importazione"] });
    } finally {
      setIsImporting(false);
    }
  }, [fileRows, fileHeaders, mapping, objectType, importMode, onImportContacts, onImportOpportunities]);

  const handleNext = () => {
    if (step === 3) { handleImport(); return; }
    setStep((s) => s + 1);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background shrink-0">
        <h1 className="text-lg font-semibold">Importazione in blocco</h1>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stepper */}
      <div className="shrink-0 border-b bg-background">
        <StepIndicator currentStep={result ? 4 : step} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-8">
        {step === 0 && <StepStart objectType={objectType} onObjectTypeChange={setObjectType} />}
        {step === 1 && (
          <StepUpload
            objectType={objectType}
            file={file}
            onFileChange={handleFileChange}
            importMode={importMode}
            onImportModeChange={setImportMode}
          />
        )}
        {step === 2 && (
          <StepMap
            objectType={objectType}
            fields={fields}
            fileHeaders={fileHeaders}
            fileRows={fileRows}
            mapping={mapping}
            onMappingChange={setMapping}
            skipUnmapped={skipUnmapped}
            onSkipUnmappedChange={setSkipUnmapped}
          />
        )}
        {step === 3 && (
          <StepReview
            objectType={objectType}
            fields={fields}
            fileHeaders={fileHeaders}
            fileRows={fileRows}
            mapping={mapping}
            fileName={file?.name || ""}
            fileSize={file?.size || 0}
            importMode={importMode}
            consent={consent}
            onConsentChange={setConsent}
            isImporting={isImporting}
            result={result}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-3 border-t bg-background shrink-0">
        <div>
          {step > 0 && !result && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={isImporting}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!result && (
            <Button variant="ghost" onClick={onClose} disabled={isImporting}>
              Annulla
            </Button>
          )}
          {result ? (
            <Button onClick={onClose}>Chiudi</Button>
          ) : (
            <Button onClick={handleNext} disabled={!canNext(step) || isImporting}>
              {step === 3 ? "Avvia importazione in blocco" : "Successivo"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
