import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Sparkles, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { useManualTreasury, type ManualAccount, type ManualTxInput } from "@/hooks/useManualTreasury";

// "1.234,56" (IT) o "1234.56" → number
function parseAmount(v: unknown): number {
  if (v == null) return NaN;
  let s = String(v).trim().replace(/[€\s]/g, "");
  if (s === "") return NaN;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else if (s.includes(",")) s = s.replace(",", "."); // 1234,56
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}
// "31/12/2026" | "2026-12-31" | "31-12-2026" → yyyy-MM-dd
function parseDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}
function detect(headers: string[], keys: string[]): string {
  const h = headers.find((x) => keys.some((k) => x.toLowerCase().includes(k)));
  return h ?? "__none__";
}
// CSV robusto: autodetect delimitatore ; o , con gestione virgolette
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const splitLine = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === delim && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur); return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => { const cells = splitLine(l); const o: Record<string, string> = {}; headers.forEach((h, i) => (o[h] = (cells[i] ?? "").trim())); return o; });
}

export function BankStatementImportDialog({ account, open, onOpenChange, onImported }: {
  account: ManualAccount; open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void;
}) {
  const { bulkInsert } = useManualTreasury();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState({ date: "__none__", desc: "__none__", amount: "__none__", entrate: "__none__", uscite: "__none__" });
  const [amountMode, setAmountMode] = useState<"single" | "split">("single");
  const [aiRows, setAiRows] = useState<ManualTxInput[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleFile(f: File) {
    setBusy(true);
    try {
      let rows: Record<string, string>[] = [];
      if (f.name.toLowerCase().endsWith(".csv") || f.type.includes("csv")) {
        rows = parseCSV(await f.text());
      } else {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await f.arrayBuffer());
        const ws = wb.worksheets[0];
        const hdr: string[] = [];
        ws.getRow(1).eachCell((c, i) => (hdr[i - 1] = String(c.value ?? `col${i}`).trim()));
        ws.eachRow((row, rn) => {
          if (rn === 1) return;
          const o: Record<string, string> = {};
          hdr.forEach((h, i) => (o[h] = String(row.getCell(i + 1).value ?? "").trim()));
          rows.push(o);
        });
      }
      if (!rows.length) { toast.error("File vuoto o non leggibile"); return; }
      const hs = Object.keys(rows[0]);
      setHeaders(hs); setRawRows(rows);
      setMap({
        date: detect(hs, ["data", "date", "valuta"]),
        desc: detect(hs, ["descr", "causale", "operazione", "dettagli"]),
        amount: detect(hs, ["importo", "amount", "saldo"]),
        entrate: detect(hs, ["entrate", "accredit", "avere", "dare in"]),
        uscite: detect(hs, ["uscite", "addebit", "dare", "avere out"]),
      });
    } catch (e) { toast.error("Errore lettura file", { description: String((e as Error).message) }); }
    finally { setBusy(false); }
  }

  function buildFileRows(): ManualTxInput[] {
    return rawRows.map((r, idx) => {
      const date = parseDate(r[map.date]);
      let amount = NaN;
      if (amountMode === "single") amount = parseAmount(r[map.amount]);
      else {
        const inc = parseAmount(r[map.entrate]); const out = parseAmount(r[map.uscite]);
        amount = (isFinite(inc) ? Math.abs(inc) : 0) - (isFinite(out) ? Math.abs(out) : 0);
      }
      if (!date || !isFinite(amount) || amount === 0) return null;
      const desc = (r[map.desc] || "Movimento").slice(0, 300);
      return {
        account_id: account.id, booking_date: date, description: desc, amount,
        source: "import_csv" as const,
        external_transaction_id: `csv:${date}:${amount}:${desc}:${idx}`.slice(0, 200),
      };
    }).filter(Boolean) as ManualTxInput[];
  }

  async function handleAiFile(f: File) {
    setBusy(true);
    try {
      const b64 = await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(",")[1] || ""); rd.onerror = rej; rd.readAsDataURL(f); });
      const { data, error } = await supabase.functions.invoke("ai-bank-statement-parser", {
        body: { file_base64: b64, mime_type: f.type || "application/pdf", account_id: account.id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Errore AI");
      const rows: ManualTxInput[] = (data?.transactions ?? []).map((t: { date: string; description: string; amount: number }, i: number) => ({
        account_id: account.id, booking_date: t.date, description: t.description, amount: Number(t.amount),
        source: "import_ai" as const, external_transaction_id: `ai:${t.date}:${t.amount}:${(t.description || "").slice(0, 40)}:${i}`.slice(0, 200),
      })).filter((r: ManualTxInput) => r.booking_date && isFinite(r.amount) && r.amount !== 0);
      if (!rows.length) { toast.error("L'AI non ha trovato movimenti nel documento"); return; }
      setAiRows(rows);
      toast.success(`AI: ${rows.length} movimenti riconosciuti`);
    } catch (e) { toast.error("Errore lettura AI", { description: String((e as Error).message) }); }
    finally { setBusy(false); }
  }

  async function doImport(rows: ManualTxInput[]) {
    if (!rows.length) { toast.error("Nessun movimento valido da importare"); return; }
    await bulkInsert.mutateAsync({ account_id: account.id, rows, source: rows[0].source === "import_ai" ? "import_ai" : "import_csv" });
    onImported(); onOpenChange(false);
    setRawRows([]); setHeaders([]); setAiRows([]);
  }

  const fileRows = headers.length ? buildFileRows() : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa estratto conto</DialogTitle>
          <DialogDescription>Carica un file CSV/Excel oppure una foto/PDF dell'estratto conto letto dall'AI. Duplicati saltati automaticamente.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="file">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> CSV / Excel</TabsTrigger>
            <TabsTrigger value="ai" className="gap-2"><Sparkles className="h-4 w-4" /> Foto / PDF (AI)</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-3">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />} Scegli file CSV o Excel
            </Button>
            {headers.length > 0 && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">Associa le colonne ({rawRows.length} righe)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Data</Label><ColSelect headers={headers} value={map.date} onChange={(v) => setMap({ ...map, date: v })} /></div>
                  <div><Label className="text-xs">Descrizione</Label><ColSelect headers={headers} value={map.desc} onChange={(v) => setMap({ ...map, desc: v })} /></div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={amountMode === "single" ? "default" : "outline"} onClick={() => setAmountMode("single")}>Importo unico (±)</Button>
                  <Button type="button" size="sm" variant={amountMode === "split" ? "default" : "outline"} onClick={() => setAmountMode("split")}>Entrate/Uscite separate</Button>
                </div>
                {amountMode === "single" ? (
                  <div><Label className="text-xs">Colonna importo</Label><ColSelect headers={headers} value={map.amount} onChange={(v) => setMap({ ...map, amount: v })} /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Entrate</Label><ColSelect headers={headers} value={map.entrate} onChange={(v) => setMap({ ...map, entrate: v })} /></div>
                    <div><Label className="text-xs">Uscite</Label><ColSelect headers={headers} value={map.uscite} onChange={(v) => setMap({ ...map, uscite: v })} /></div>
                  </div>
                )}
                <PreviewList rows={fileRows} />
                <DialogFooter>
                  <Button onClick={() => doImport(fileRows)} disabled={bulkInsert.isPending || !fileRows.length}>
                    {bulkInsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Importa {fileRows.length} movimenti
                  </Button>
                </DialogFooter>
              </div>
            )}
          </TabsContent>

          <TabsContent value="ai" className="space-y-3">
            <input type="file" accept="image/*,application/pdf" className="hidden" id="ai-file" onChange={(e) => e.target.files?.[0] && handleAiFile(e.target.files[0])} />
            <Button variant="outline" className="w-full" onClick={() => document.getElementById("ai-file")?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />} Carica foto o PDF dell'estratto conto
            </Button>
            {aiRows.length > 0 && (
              <div className="space-y-3 rounded-lg border p-3">
                <PreviewList rows={aiRows} />
                <DialogFooter>
                  <Button onClick={() => doImport(aiRows)} disabled={bulkInsert.isPending}>
                    {bulkInsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Importa {aiRows.length} movimenti
                  </Button>
                </DialogFooter>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ColSelect({ headers, value, onChange }: { headers: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">—</SelectItem>
        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function PreviewList({ rows }: { rows: ManualTxInput[] }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground">Nessuna riga valida con la mappatura attuale.</p>;
  return (
    <div className="max-h-40 overflow-y-auto rounded border divide-y text-xs">
      {rows.slice(0, 8).map((r, i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1">
          <span className="truncate">{r.booking_date} · {r.description}</span>
          <span className={r.amount >= 0 ? "text-green-700" : "text-destructive"}>{r.amount >= 0 ? "+" : "−"}{formatCurrency(Math.abs(r.amount))}</span>
        </div>
      ))}
      {rows.length > 8 && <div className="px-2 py-1 text-muted-foreground">… e altri {rows.length - 8}</div>}
    </div>
  );
}
