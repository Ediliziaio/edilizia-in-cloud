import { useState, useCallback, useMemo } from "react";
import {
  Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2,
  Sparkles, File as FileIcon, Info, ArrowRight, ArrowLeft,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/utils/logger";
import { sanitizeCustomerInput } from "@/lib/customerDataSanitizer";

/* ─── Field schema ──────────────────────────────────────────────── */
export interface CustomerImportField {
  key: string;
  label: string;
  required: boolean;
  type?: "text" | "email" | "phone" | "fiscal_code";
}

export interface CustomerImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: CustomerImportField[];
  onImport: (rows: Record<string, string>[], options: ImportOptions) => Promise<{
    success: number;
    errors: string[];
  }>;
  portalEnabled: boolean;
}

export interface ImportOptions {
  create_portal_account: boolean;
  send_welcome_email: boolean;
  skip_duplicates_by_email: boolean;
}

type Mode = "file" | "ai";
type Step = "source" | "upload" | "preview" | "mapping" | "options" | "importing" | "result";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

/* ─── Normalizers ───────────────────────────────────────────────── */
const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9àèéìòù]/g, "");
const cleanCell = (s: string | null | undefined) =>
  (s ?? "").toString().replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();

function autoMatch(fileHeaders: string[], fields: CustomerImportField[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  fileHeaders.forEach((header) => {
    const norm = normalizeHeader(header);
    // Hardcoded synonyms IT/EN for better auto-match
    const syn: Record<string, string[]> = {
      business_name: ["ragionesociale", "nomeazienda", "azienda", "societa", "società", "denominazione"],
      first_name: ["nome", "firstname", "nomecliente", "given", "nomepersona"],
      last_name: ["cognome", "lastname", "cognomecliente", "surname", "family"],
      email: ["email", "mail", "posta", "emailaddress", "pec"],
      phone: ["telefono", "cellulare", "cell", "mobile", "phone", "tel", "numero"],
      fiscal_code: ["codicefiscale", "cf", "piva", "partitaiva", "vat", "fiscalcode"],
      address: ["indirizzo", "residenza", "sede", "address", "via", "location"],
      postal_code: ["cap", "zipcode", "postalcode", "codicepostale"],
      city: ["citta", "città", "comune", "city"],
      province: ["provincia", "prov", "pr", "province"],
      site_address: ["cantiere", "indirizzocantiere", "worksite", "site"],
      site_postal_code: ["capcantiere", "capdelcantiere", "worksitezip", "sitepostalcode"],
      site_city: ["cittacantiere", "cittàcantiere", "comunecantiere", "worksitecity", "sitecity"],
      site_province: ["provinciacantiere", "provinciaalavori", "worksiteprovince", "siteprovince"],
      notes: ["note", "notes", "annotazioni", "descrizione"],
    };
    for (const field of fields) {
      const alts = syn[field.key] ?? [];
      const labelNorm = normalizeHeader(field.label);
      const keyNorm = normalizeHeader(field.key);
      if (
        norm === labelNorm ||
        norm === keyNorm ||
        alts.some((a) => norm === a || norm.includes(a))
      ) {
        mapping[header] = field.key;
        break;
      }
    }
  });
  return mapping;
}

/* ─── File parsers ──────────────────────────────────────────────── */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const firstLine = text.split("\n")[0] ?? "";
  const sep = firstLine.includes(";") ? ";" : ",";
  const lines = text.split(/\r?\n/).map((l) => l).filter((l) => l.trim() !== "");
  const parseRow = (line: string) => {
    const result: string[] = [];
    let inQuote = false;
    let current = "";
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === sep && !inQuote) { result.push(cleanCell(current)); current = ""; continue; }
      current += ch;
    }
    result.push(cleanCell(current));
    return result;
  };
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

async function parseExcel(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
    headers.push(cleanCell(String(cell.value ?? "")));
  });
  const rows: string[][] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const r: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (r.length < colNumber - 1) r.push("");
      const v = cell.value;
      // Excel date handling
      if (v instanceof Date) {
        r.push(v.toISOString().slice(0, 10));
      } else if (v != null && typeof v === "object" && "text" in (v as object)) {
        r.push(cleanCell(String((v as { text: string }).text ?? "")));
      } else {
        r.push(cleanCell(v != null ? String(v) : ""));
      }
    });
    rows.push(r);
  });
  return { headers, rows };
}

/* ─── Component ─────────────────────────────────────────────────── */
export function CustomerImportDialog({
  open,
  onOpenChange,
  fields,
  onImport,
  portalEnabled,
}: CustomerImportDialogProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("file");
  const [step, setStep] = useState<Step>("source");
  const [fileName, setFileName] = useState("");
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState<string>("");
  const [aiContext, setAiContext] = useState<string | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiCost, setAiCost] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Options
  const [createPortal, setCreatePortal] = useState<boolean>(portalEnabled);
  const [sendWelcome, setSendWelcome] = useState<boolean>(false);
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);
  const shouldCreatePortal = createPortal && portalEnabled;
  const effectiveFields = useMemo(
    () => fields.map((field) => (
      field.key === "email"
        ? { ...field, required: shouldCreatePortal }
        : field
    )),
    [fields, shouldCreatePortal],
  );

  const reset = useCallback(() => {
    setMode("file");
    setStep("source");
    setFileName("");
    setFileHeaders([]);
    setFileRows([]);
    setMapping({});
    setDragOver(false);
    setAiBusy(false);
    setAiProgress("");
    setAiContext(null);
    setAiWarnings([]);
    setAiCost(null);
    setImportResult(null);
    setFileError(null);
    setCreatePortal(portalEnabled);
    setSendWelcome(false);
    setSkipDuplicates(true);
  }, [portalEnabled]);

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  /* ─── AI Extraction pipeline ─────────────────────────── */
  const runAiExtraction = useCallback(async (file: File) => {
    if (!user?.id) {
      setFileError("Utente non autenticato");
      return;
    }
    setAiBusy(true);
    setAiProgress("Caricamento documento sul server sicuro…");
    setStep("importing");
    setMode("ai");

    try {
      // 1. Upload su bucket contacts-tmp
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("contacts-tmp")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
      if (upErr) throw new Error(`Upload fallito: ${upErr.message}`);

      // 2. Invoke edge function AI
      setAiProgress("L'AI sta leggendo il documento (può richiedere 20-60 secondi)…");
      const { data, error: fnErr } = await supabase.functions.invoke("ai-customers-extract", {
        body: { storage_path: storagePath, mime_type: file.type },
      });
      if (fnErr) {
        let body: { error?: string } | null = null;
        try {
          const ctx = (fnErr as { context?: unknown }).context;
          if (ctx instanceof Response) body = await ctx.json();
        } catch { /* ignore */ }
        throw new Error(body?.error || fnErr.message || "Estrazione AI fallita");
      }
      if (data?.error) throw new Error(data.error);

      const aiRows: Array<Record<string, string | null>> = Array.isArray(data?.rows) ? data.rows : [];
      if (!aiRows.length) {
        throw new Error("L'AI non ha trovato nessuna anagrafica nel documento.");
      }

      // 3. Trasforma in format { headers, rows }
      const columns = ["first_name", "last_name", "email", "phone", "fiscal_code", "address", "site_address", "notes"];
      setFileHeaders(columns);
      setFileRows(
        aiRows.map((r) => columns.map((c) => cleanCell((r as Record<string, unknown>)[c] as string))),
      );
      // Mapping è identity (già in formato canonico)
      const m: Record<string, string> = {};
      columns.forEach((c) => (m[c] = c));
      setMapping(m);
      setAiContext(data.detected_context ?? null);
      setAiWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setAiCost(typeof data.cost_cents === "number" ? data.cost_cents : null);
      setStep("preview");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore AI";
      setFileError(msg);
      setStep("upload");
    } finally {
      setAiBusy(false);
      setAiProgress("");
    }
  }, [user?.id]);

  /* ─── File handling ───────────────────────────────────── */
  const handleFile = useCallback(async (file: File) => {
    setFileError(null);
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File troppo grande. Massimo ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setFileName(file.name);
    const lower = file.name.toLowerCase();

    try {
      if (lower.endsWith(".csv")) {
        const text = await file.text();
        const { headers, rows } = parseCsv(text);
        if (!headers.length) throw new Error("Il CSV non contiene intestazioni valide.");
        setFileHeaders(headers);
        setFileRows(rows);
        setMapping(autoMatch(headers, fields));
        setStep("preview");
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const { headers, rows } = await parseExcel(file);
        if (!headers.length) throw new Error("Il file Excel non contiene intestazioni.");
        setFileHeaders(headers);
        setFileRows(rows);
        setMapping(autoMatch(headers, fields));
        setStep("preview");
      } else if (lower.endsWith(".pdf") || file.type.startsWith("image/")) {
        await runAiExtraction(file);
      } else {
        setFileError(`Formato non supportato: ${file.name}. Accettati: CSV, XLSX, PDF, PNG, JPG.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore lettura file";
      setFileError(msg);
      logger.error("Import file error:", e);
    }
  }, [fields, runAiExtraction]);

  /* ─── Drop handlers ──────────────────────────────────── */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset input so selecting the same file again re-triggers
    e.target.value = "";
  }, [handleFile]);

  /* ─── Validations ────────────────────────────────────── */
  const missingRequired = useMemo(() => {
    const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
    return effectiveFields.filter((f) => f.required && !mappedKeys.has(f.key));
  }, [mapping, effectiveFields]);

  const mappedRows = useMemo(() => {
    return fileRows.map((row) => {
      const obj: Record<string, string> = {};
      fileHeaders.forEach((h, idx) => {
        const k = mapping[h];
        if (k) obj[k] = cleanCell(row[idx]);
      });
      return obj;
    }).filter((r) => {
      // almeno un campo valorizzato
      return Object.values(r).some((v) => v.trim());
    });
  }, [fileRows, fileHeaders, mapping]);

  const rowValidations = useMemo(() => {
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return mappedRows.map((raw) => {
      // Applica sanitize → permette preview dei fix automatici
      const sanitized = sanitizeCustomerInput(raw);
      const businessName = cleanCell(raw.business_name);
      const errors: string[] = [];
      if (!businessName && !sanitized.first_name?.trim() && !sanitized.last_name?.trim()) {
        errors.push("Nome/cognome o ragione sociale mancanti");
      }
      const hasEmail = !!sanitized.email?.trim();
      if (shouldCreatePortal && !hasEmail) {
        errors.push("Email mancante");
      } else if (hasEmail && !EMAIL_RE.test(sanitized.email.trim())) {
        errors.push("Email non valida");
      }
      // Converte sanitized di nuovo in Record<string,string> per l'import
      const rowFixed: Record<string, string> = {
        business_name: businessName,
        first_name: sanitized.first_name,
        last_name: sanitized.last_name,
        email: sanitized.email,
        phone: sanitized.phone ?? "",
        fiscal_code: sanitized.fiscal_code ?? "",
        address: sanitized.address ?? "",
        postal_code: cleanCell(raw.postal_code),
        city: cleanCell(raw.city),
        province: cleanCell(raw.province).toUpperCase(),
        site_address: sanitized.site_address ?? "",
        site_postal_code: cleanCell(raw.site_postal_code),
        site_city: cleanCell(raw.site_city),
        site_province: cleanCell(raw.site_province).toUpperCase(),
        notes: sanitized.notes ?? "",
      };
      return { row: rowFixed, originalRow: raw, errors, fixes: sanitized.fixes_applied };
    });
  }, [mappedRows, shouldCreatePortal]);

  const totalFixes = useMemo(
    () => rowValidations.reduce((sum, v) => sum + v.fixes.length, 0),
    [rowValidations],
  );

  const validRowsCount = rowValidations.filter((v) => v.errors.length === 0).length;
  const invalidRowsCount = rowValidations.length - validRowsCount;

  /* ─── Do the import ───────────────────────────────────── */
  const handleDoImport = useCallback(async () => {
    setStep("importing");
    try {
      const validOnly = rowValidations.filter((v) => v.errors.length === 0).map((v) => v.row);
      const res = await onImport(validOnly, {
        create_portal_account: createPortal && portalEnabled,
        send_welcome_email: createPortal && portalEnabled && sendWelcome,
        skip_duplicates_by_email: skipDuplicates,
      });
      setImportResult(res);
    } catch (err) {
      setImportResult({
        success: 0,
        errors: [err instanceof Error ? err.message : "Errore durante l'importazione"],
      });
    } finally {
      setStep("result");
    }
  }, [rowValidations, onImport, createPortal, sendWelcome, skipDuplicates, portalEnabled]);

  /* ─── Renderers per step ──────────────────────────────── */
  const renderSource = () => (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Importa clienti
        </DialogTitle>
        <DialogDescription>
          Scegli come importare i tuoi clienti: da file strutturato (CSV/Excel)
          oppure da documento PDF/foto con l'aiuto dell'AI.
        </DialogDescription>
      </DialogHeader>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="file">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            File strutturato
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles className="h-4 w-4 mr-2" />
            Documento + AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="file" className="space-y-3 mt-4">
          <div className="rounded-lg border p-4 bg-muted/30 text-sm space-y-2">
            <p className="font-semibold">CSV o Excel (.xlsx)</p>
            <p className="text-muted-foreground text-xs">
              Carica un file con intestazioni nella prima riga. Le colonne verranno
              mappate automaticamente ai campi (nome, email, telefono, CF, indirizzo…).
            </p>
            <div className="flex flex-wrap gap-1">
              {effectiveFields.map((f) => (
                <Badge key={f.key} variant="outline" className="text-[10px]">
                  {f.label}{f.required ? " *" : ""}
                </Badge>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="space-y-3 mt-4">
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription className="text-xs space-y-1">
              <p className="font-semibold">Estrazione AI (OpenAI GPT-4o)</p>
              <p>
                Carica un <strong>PDF</strong>, <strong>foto</strong> o <strong>scansione</strong> con
                elenchi di clienti, fatture, biglietti da visita, rubriche.
                L'AI legge il documento e ricostruisce la tabella anagrafica.
              </p>
              <p className="text-muted-foreground">
                Per file Excel/CSV usa la modalità "File strutturato": più veloce e gratis.
              </p>
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>

      <Button className="w-full" onClick={() => setStep("upload")}>
        Continua
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );

  const acceptAttr =
    mode === "ai"
      ? ".pdf,application/pdf,image/png,image/jpeg,image/webp,image/*"
      : ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const renderUpload = () => (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {mode === "ai" ? <Sparkles className="h-5 w-5 text-primary" /> : <FileSpreadsheet className="h-5 w-5 text-primary" />}
          {mode === "ai" ? "Carica documento per AI" : "Carica file"}
        </DialogTitle>
        <DialogDescription>
          {mode === "ai"
            ? "PDF o immagine fino a 20 MB — l'AI estrarrà i clienti."
            : "Trascina un CSV o Excel (xlsx). Massimo 20 MB."}
        </DialogDescription>
      </DialogHeader>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"
        }`}
      >
        <FileIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium mb-2">Trascina il file qui</p>
        <p className="text-xs text-muted-foreground mb-4">oppure</p>
        <label className="inline-flex">
          <input
            type="file"
            accept={acceptAttr}
            onChange={handleFileInput}
            className="hidden"
          />
          <span className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm cursor-pointer inline-flex items-center">
            <Upload className="h-4 w-4 mr-2" />
            Seleziona file
          </span>
        </label>
      </div>

      {fileError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{fileError}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep("source")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Indietro
        </Button>
      </DialogFooter>
    </div>
  );

  const renderPreview = () => {
    const previewRows = mappedRows.slice(0, 8);
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Anteprima estrazione
          </DialogTitle>
          <DialogDescription>
            Controlla le prime righe prima di procedere al mapping e all'import.
          </DialogDescription>
        </DialogHeader>

        {mode === "ai" && (
          <div className="space-y-2">
            {aiContext && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Contesto rilevato:</strong> {aiContext}
                </AlertDescription>
              </Alert>
            )}
            {aiCost !== null && (
              <p className="text-xs text-muted-foreground">
                Costo stimato di questa estrazione: {aiCost.toFixed(4)} centesimi di euro.
              </p>
            )}
            {aiWarnings.length > 0 && (
              <Alert variant="default" className="border-amber-400 bg-amber-50 dark:bg-amber-900/10">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Avvisi AI:</strong>
                  <ul className="list-disc pl-4 mt-1">
                    {aiWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 text-sm flex-wrap">
          <Badge variant="secondary">{fileName}</Badge>
          <Badge variant="outline">{mappedRows.length} righe rilevate</Badge>
          {validRowsCount > 0 && (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300">
              {validRowsCount} valide
            </Badge>
          )}
          {invalidRowsCount > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300">
              {invalidRowsCount} con errori
            </Badge>
          )}
          {totalFixes > 0 && (
            <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300">
              <Sparkles className="h-3 w-3 mr-1 inline" />
              {totalFixes} correzioni auto
            </Badge>
          )}
        </div>

        {totalFixes > 0 && (
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Auto-correzioni rilevate:</strong> il sistema ha riconosciuto e sistemato
              automaticamente valori scambiati (es. numero di telefono finito nel campo Nome).
              I fix saranno applicati all'import.
            </AlertDescription>
          </Alert>
        )}

        <ScrollArea className="h-[280px] rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {fileHeaders.map((h) => (
                  <TableHead key={h} className="text-xs whitespace-nowrap">
                    {h}
                    {mapping[h] && (
                      <div className="text-[10px] text-muted-foreground font-normal normal-case">
                        → {effectiveFields.find((f) => f.key === mapping[h])?.label ?? mapping[h]}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((r, i) => (
                <TableRow key={i}>
                  {fileHeaders.map((h) => (
                    <TableCell key={h} className="text-xs whitespace-nowrap">
                      {r[mapping[h] ?? ""] ?? ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("upload")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cambia file
          </Button>
          <Button variant="outline" onClick={() => setStep("mapping")}>
            Modifica mapping
          </Button>
          <Button onClick={() => setStep("options")} disabled={validRowsCount === 0}>
            Continua ({validRowsCount} valide)
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </DialogFooter>
      </div>
    );
  };

  const renderMapping = () => (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Mapping colonne</DialogTitle>
        <DialogDescription>
          Associa ogni intestazione del file al campo corrispondente. I campi
          contrassegnati con * sono obbligatori.
        </DialogDescription>
      </DialogHeader>

      {missingRequired.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Campi obbligatori mancanti: {missingRequired.map((f) => f.label).join(", ")}
          </AlertDescription>
        </Alert>
      )}

      <ScrollArea className="max-h-[340px]">
        <div className="space-y-2 pr-3">
          {fileHeaders.map((h) => (
            <div key={h} className="grid grid-cols-2 gap-3 items-center">
              <div className="text-sm font-medium truncate" title={h}>{h}</div>
              <Select
                value={mapping[h] ?? "none"}
                onValueChange={(v) =>
                  setMapping((m) => ({ ...m, [h]: v === "none" ? "" : v }))
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="— non importare —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— non importare —</SelectItem>
                  {effectiveFields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}{f.required ? " *" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </ScrollArea>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep("preview")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Anteprima
        </Button>
        <Button onClick={() => setStep("preview")} disabled={missingRequired.length > 0}>
          Conferma
        </Button>
      </DialogFooter>
    </div>
  );

  const renderOptions = () => (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Opzioni di import</DialogTitle>
        <DialogDescription>
          Scegli come trattare i nuovi clienti prima di finalizzare l'import.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {!portalEnabled && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              L'area privata clienti è <strong>disattivata</strong> nelle impostazioni.
              Tutti i clienti saranno importati come "solo anagrafica".
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="imp-portal"
              checked={createPortal && portalEnabled}
              onCheckedChange={(v) => setCreatePortal(!!v)}
              disabled={!portalEnabled}
            />
            <div className="min-w-0">
              <Label htmlFor="imp-portal" className="text-sm">Crea account portale per ogni cliente</Label>
              <p className="text-xs text-muted-foreground">
                Ogni cliente avrà email + password per accedere al portale privato.
              </p>
            </div>
          </div>

          {createPortal && portalEnabled && (
            <div className="flex items-start gap-3 pl-6 border-l-2 border-primary/30 ml-1.5 py-1">
              <Checkbox
                id="imp-welcome"
                checked={sendWelcome}
                onCheckedChange={(v) => setSendWelcome(!!v)}
              />
              <div className="min-w-0">
                <Label htmlFor="imp-welcome" className="text-sm">Invia email di benvenuto</Label>
                <p className="text-xs text-muted-foreground">
                  Consuma un credito email per ogni cliente importato. Sconsigliato per import massivi.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <Checkbox
              id="imp-dedup"
              checked={skipDuplicates}
              onCheckedChange={(v) => setSkipDuplicates(!!v)}
            />
            <div className="min-w-0">
              <Label htmlFor="imp-dedup" className="text-sm">Salta duplicati per email</Label>
              <p className="text-xs text-muted-foreground">
                Se l'email esiste già, salta la riga invece di generare un errore.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/30 p-3 text-sm">
          <p><strong>Riepilogo:</strong> {validRowsCount} clienti verranno importati.
          {invalidRowsCount > 0 && ` ${invalidRowsCount} righe con errori saranno saltate.`}</p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep("preview")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Anteprima
        </Button>
        <Button onClick={handleDoImport} disabled={validRowsCount === 0}>
          Importa {validRowsCount} clienti
        </Button>
      </DialogFooter>
    </div>
  );

  const renderImporting = () => (
    <div className="py-10 text-center space-y-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
      <p className="font-medium">
        {aiBusy
          ? "Estrazione AI in corso…"
          : `Import di ${validRowsCount} clienti in corso…`}
      </p>
      {aiProgress && <p className="text-sm text-muted-foreground">{aiProgress}</p>}
      <Progress value={aiBusy ? 60 : 80} className="max-w-xs mx-auto" />
    </div>
  );

  const renderResult = () => (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          Import completato
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-2">
        <div className="rounded-lg border-l-4 border-l-emerald-500 p-3 bg-emerald-50/50 dark:bg-emerald-900/10">
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">
            {importResult?.success ?? 0} clienti importati con successo
          </p>
        </div>

        {(importResult?.errors?.length ?? 0) > 0 && (
          <div className="rounded-lg border-l-4 border-l-amber-500 p-3 bg-amber-50/50 dark:bg-amber-900/10 space-y-2">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              {importResult?.errors.length ?? 0} errori
            </p>
            <ScrollArea className="max-h-[200px]">
              <ul className="list-disc pl-4 text-xs space-y-0.5">
                {importResult?.errors.slice(0, 50).map((err, i) => (
                  <li key={i} className="text-muted-foreground">{err}</li>
                ))}
                {(importResult?.errors?.length ?? 0) > 50 && (
                  <li className="italic">...e altri {(importResult!.errors.length - 50)} errori</li>
                )}
              </ul>
            </ScrollArea>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button onClick={() => handleClose(false)}>Chiudi</Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {step === "source" && renderSource()}
        {step === "upload" && renderUpload()}
        {step === "preview" && renderPreview()}
        {step === "mapping" && renderMapping()}
        {step === "options" && renderOptions()}
        {step === "importing" && renderImporting()}
        {step === "result" && renderResult()}
      </DialogContent>
    </Dialog>
  );
}
