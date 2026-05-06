/**
 * ArticoliCSVImportDialog — Import bulk articoli da file CSV/XLSX.
 *
 * Workflow:
 *   1. Upload file (drag-drop o click)
 *   2. Parse + preview prime 5 righe + mappa colonne (auto-detect headers IT)
 *   3. Validazione per riga (nome obbligatorio, quantity numerico, ecc.)
 *   4. Conferma → batch insert in warehouse_stock
 *   5. Report finale: N inseriti, N errori
 */

import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, XCircle, Loader2,
} from "lucide-react";

interface Props {
  trigger?: React.ReactNode;
  warehouseId?: string | null;
  onComplete?: () => void;
}

// Schema target: columns di warehouse_stock che importiamo
type FieldKey = "name" | "internal_code" | "barcode" | "quantity"
              | "unit_cost" | "min_stock_level" | "reorder_quantity" | "description";

const FIELDS: { key: FieldKey; label: string; required: boolean; type: "text" | "number" }[] = [
  { key: "name",             label: "Nome articolo *",  required: true,  type: "text" },
  { key: "internal_code",    label: "Codice interno",   required: false, type: "text" },
  { key: "barcode",          label: "Barcode/EAN",      required: false, type: "text" },
  { key: "quantity",         label: "Quantità iniziale",required: false, type: "number" },
  { key: "unit_cost",        label: "Costo unitario €", required: false, type: "number" },
  { key: "min_stock_level",  label: "Soglia minima",    required: false, type: "number" },
  { key: "reorder_quantity", label: "Qty di riordino",  required: false, type: "number" },
  { key: "description",      label: "Descrizione",      required: false, type: "text" },
];

// Auto-detect column → field mapping (case-insensitive, lingua IT)
const HEADER_HINTS: Record<FieldKey, RegExp> = {
  name:             /^(nome|articolo|descrizione|denominazione|prodotto)/i,
  internal_code:    /(codice|cod\.?|sku|item.?code)/i,
  barcode:          /(barcode|ean|gtin)/i,
  quantity:         /^(quantit|qty|giacenza|stock)/i,
  unit_cost:        /(costo|prezzo.?(unit|acquisto)|cost)/i,
  min_stock_level:  /(scorta.?min|min.?stock|soglia)/i,
  reorder_quantity: /(riordino|reorder|qty.?ord)/i,
  description:      /^(desc|note)/i,
};

interface ParsedRow {
  raw: Record<string, string>;
  valid: boolean;
  errors: string[];
  data: Partial<Record<FieldKey, string | number | null>>;
}

export function ArticoliCSVImportDialog({ trigger, warehouseId = null, onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: { row: number; message: string }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
  }

  function autoDetectMapping(hdrs: string[]): Partial<Record<FieldKey, string>> {
    const m: Partial<Record<FieldKey, string>> = {};
    for (const field of Object.keys(HEADER_HINTS) as FieldKey[]) {
      const found = hdrs.find((h) => HEADER_HINTS[field].test(h));
      if (found) m[field] = found;
    }
    return m;
  }

  function buildPreviewRows(hdrs: string[], dataRows: string[][], m: Partial<Record<FieldKey, string>>): ParsedRow[] {
    return dataRows.map((row) => {
      const raw: Record<string, string> = {};
      hdrs.forEach((h, i) => { raw[h] = (row[i] ?? "").toString().trim(); });
      const data: Partial<Record<FieldKey, string | number | null>> = {};
      const errors: string[] = [];

      for (const field of FIELDS) {
        const sourceCol = m[field.key];
        const value = sourceCol ? raw[sourceCol] : "";

        if (field.required && !value) {
          errors.push(`${field.label} mancante`);
          continue;
        }

        if (!value) {
          data[field.key] = field.type === "number" ? 0 : null;
          continue;
        }

        if (field.type === "number") {
          // Supporta "1.234,56" (formato italiano) e "1234.56"
          const norm = value.replace(/\./g, "").replace(",", ".");
          const n = Number(norm);
          if (Number.isNaN(n)) {
            errors.push(`${field.label}: "${value}" non e' un numero`);
            continue;
          }
          data[field.key] = n;
        } else {
          data[field.key] = value;
        }
      }

      return { raw, valid: errors.length === 0, errors, data };
    });
  }

  async function handleFile(file: File) {
    setLoading(true);
    try {
      let hdrs: string[] = [];
      let dataRows: string[][] = [];

      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv")) {
        // Parse CSV semplice (split \n e ; oppure ,)
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length === 0) throw new Error("File CSV vuoto");
        const sep = lines[0].includes(";") ? ";" : ",";
        hdrs = parseCsvLine(lines[0], sep);
        dataRows = lines.slice(1).map((l) => parseCsvLine(l, sep));
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        // ExcelJS lazy import
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        const buf = await file.arrayBuffer();
        await wb.xlsx.load(buf);
        const ws = wb.worksheets[0];
        if (!ws) throw new Error("XLSX senza fogli");
        const rowsArr: string[][] = [];
        ws.eachRow((row) => {
          const arr: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            arr.push(String(cell.value ?? "").trim());
          });
          rowsArr.push(arr);
        });
        if (rowsArr.length === 0) throw new Error("XLSX vuoto");
        hdrs = rowsArr[0];
        dataRows = rowsArr.slice(1).filter((r) => r.some((c) => c));
      } else {
        throw new Error("Formato non supportato. Accettati: .csv, .xlsx");
      }

      if (dataRows.length === 0) throw new Error("Nessuna riga di dati nel file");

      setHeaders(hdrs);
      const m = autoDetectMapping(hdrs);
      setMapping(m);
      setRows(buildPreviewRows(hdrs, dataRows, m));
      setStep("preview");
    } catch (e) {
      toast({
        title: "Errore lettura file",
        description: String((e as Error).message ?? e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function updateMapping(field: FieldKey, sourceCol: string) {
    const newMapping = { ...mapping, [field]: sourceCol === "__none__" ? undefined : sourceCol };
    setMapping(newMapping);
    // Rebuild preview con nuovo mapping
    setRows((prev) => {
      // Re-build da raw data
      const dataRows = prev.map((p) => headers.map((h) => p.raw[h] ?? ""));
      return buildPreviewRows(headers, dataRows, newMapping);
    });
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      const validRows = rows.filter((r) => r.valid);
      // Resolve company_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: companyId, error: cidErr } = await (supabase.rpc as any)("get_my_company_id");
      if (cidErr || !companyId) throw new Error("Company ID non risolvibile");

      const payload = validRows.map((r) => ({
        company_id: companyId,
        warehouse_id: warehouseId,
        name: r.data.name as string,
        internal_code: (r.data.internal_code as string) || null,
        barcode: (r.data.barcode as string) || null,
        quantity: Number(r.data.quantity ?? 0),
        unit_cost: Number(r.data.unit_cost ?? 0),
        min_stock_level: Number(r.data.min_stock_level ?? 0),
        reorder_quantity: Number(r.data.reorder_quantity ?? 0),
        description: (r.data.description as string) || null,
      }));

      // Batch insert (Supabase: insert array)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("warehouse_stock")
        .insert(payload)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (inserted) => {
      setResult({ inserted, errors: [] });
      setStep("result");
      qc.invalidateQueries({ queryKey: ["warehouse"] });
      qc.invalidateQueries({ queryKey: ["wh"] });
    },
    onError: (e: Error) => {
      toast({
        title: "Errore import",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
        if (!v && result?.inserted) onComplete?.();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Upload className="mr-2 h-4 w-4" />
            Importa CSV/XLSX
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importa articoli da file</DialogTitle>
          <DialogDescription>
            Carica un file CSV o Excel con la lista articoli. Colonne riconosciute
            in automatico (nome, codice, barcode, quantità, costo, scorta minima, qty di riordino, descrizione).
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div
            className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            {loading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Lettura file in corso…</p>
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">Trascina qui un file CSV o XLSX</p>
                <p className="text-xs text-muted-foreground">oppure</p>
                <Button onClick={() => inputRef.current?.click()}>
                  Sfoglia file
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Esempio header CSV: <code>Codice;Articolo;Quantità;Costo;Scorta Min</code>
                </p>
              </>
            )}
          </div>
        )}

        {step === "preview" && (
          <>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Righe totali" value={rows.length} />
              <Stat label="Pronte" value={validCount} tone="green" />
              <Stat label="Con errori" value={invalidCount} tone={invalidCount > 0 ? "red" : "neutral"} />
              <Stat
                label="Colonne riconosciute"
                value={Object.keys(mapping).filter((k) => mapping[k as FieldKey]).length}
                tone="blue"
              />
            </div>

            {/* Mapping editor */}
            <div className="rounded-xl border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mappa le colonne del file ai campi articolo
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <Label className={cn("w-32 shrink-0 text-xs", f.required && "font-semibold")}>
                      {f.label}
                    </Label>
                    <Select
                      value={mapping[f.key] ?? "__none__"}
                      onValueChange={(v) => updateMapping(f.key, v)}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— nessuna —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview rows */}
            <div className="max-h-[280px] overflow-auto rounded-xl border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/40">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">Nome</th>
                    <th className="px-2 py-1.5 text-left">Codice</th>
                    <th className="px-2 py-1.5 text-right">Qty</th>
                    <th className="px-2 py-1.5 text-right">Costo</th>
                    <th className="px-2 py-1.5 text-center">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 30).map((r, i) => (
                    <tr key={i} className={cn("border-t", !r.valid && "bg-rose-50")}>
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1">{(r.data.name as string) ?? "—"}</td>
                      <td className="px-2 py-1 font-mono text-[10px]">{(r.data.internal_code as string) ?? "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.data.quantity ?? "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.data.unit_cost ?? "—"}</td>
                      <td className="px-2 py-1 text-center">
                        {r.valid ? (
                          <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <span title={r.errors.join(", ")}>
                            <XCircle className="mx-auto h-3.5 w-3.5 text-rose-600" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length > 30 && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={6} className="px-2 py-2 text-center text-muted-foreground">
                        … e altre {rows.length - 30} righe
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {invalidCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {invalidCount} righe verranno saltate per errori (es. nome mancante o
                  numero non valido). Solo le {validCount} righe valide saranno importate.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Cambia file
              </Button>
              <Button
                disabled={validCount === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Importa {validCount} articoli
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "result" && result && (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <div className="text-center">
              <p className="text-lg font-semibold">Import completato</p>
              <p className="text-sm text-muted-foreground">
                {result.inserted} articoli aggiunti al magazzino.
              </p>
            </div>
            <Button onClick={() => { setOpen(false); onComplete?.(); }}>Chiudi</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label, value, tone = "neutral",
}: { label: string; value: number; tone?: "green" | "red" | "blue" | "neutral" }) {
  const palette = {
    green:   "bg-emerald-50 text-emerald-700",
    red:     "bg-rose-50 text-rose-700",
    blue:    "bg-blue-50 text-blue-700",
    neutral: "bg-muted/30 text-foreground",
  } as const;
  return (
    <div className={cn("rounded-lg p-2 text-center", palette[tone])}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** CSV line parser that handles quoted strings with commas/semicolons inside */
function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}
