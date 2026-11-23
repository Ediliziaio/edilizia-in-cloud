import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Sparkles, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { formatCurrency } from "@/lib/formatters";
import { useManualTreasury, type ManualAccount, type ManualTxInput } from "@/hooks/useManualTreasury";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=$|[T\s])/);
  const italiana = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})(?=$|\s)/);
  if (!iso && !italiana) return null;
  const [, a, m, b] = iso ?? italiana!;
  const anno = iso ? a : b.length === 2 ? `20${b}` : b;
  const giorno = iso ? b : a;
  const data = `${anno}-${m.padStart(2, "0")}-${giorno.padStart(2, "0")}`;
  const utc = new Date(`${data}T00:00:00Z`);
  return Number.isFinite(utc.getTime()) && utc.toISOString().slice(0, 10) === data ? data : null;
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
  const tr = useT();
  const { bulkInsert } = useManualTreasury();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState({ date: "__none__", desc: "__none__", amount: "__none__", entrate: "__none__", uscite: "__none__" });
  const [amountMode, setAmountMode] = useState<"single" | "split">("single");
  const [aiRows, setAiRows] = useState<ManualTxInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [erroreImport, setErroreImport] = useState<string | null>(null);

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
          hdr.forEach((h, i) => {
            const valore = row.getCell(i + 1).value;
            // ExcelJS rappresenta le date civili in UTC.
            o[h] = valore instanceof Date && Number.isFinite(valore.getTime())
              ? valore.toISOString().slice(0, 10)
              : String(valore ?? "").trim();
          });
          rows.push(o);
        });
      }
      if (!rows.length) { toast.error(tr("File vuoto o non leggibile")); return; }
      const hs = Object.keys(rows[0]);
      setHeaders(hs); setRawRows(rows);
      setMap({
        date: detect(hs, ["data", "date", "valuta"]),
        desc: detect(hs, ["descr", "causale", "operazione", "dettagli"]),
        amount: detect(hs, ["importo", "amount", "saldo"]),
        entrate: detect(hs, ["entrate", "accredit", "avere", "dare in"]),
        uscite: detect(hs, ["uscite", "addebit", "dare", "avere out"]),
      });
    } catch (e) { toast.error(tr("Errore lettura file"), { description: String((e as Error).message) }); }
    finally { setBusy(false); }
  }

  function buildFileRows(): ManualTxInput[] {
    // Chiave di dedup dal CONTENUTO (data+importo+causale+occorrenza), non
    // dall'indice di riga nel file: re-importare lo stesso estratto con righe
    // in ordine o range diverso generava duplicati a ogni import.
    const occorrenze = new Map<string, number>();
    return rawRows.map((r) => {
      const date = parseDate(r[map.date]);
      let amount: number;
      if (amountMode === "single") amount = parseAmount(r[map.amount]);
      else {
        const inc = parseAmount(r[map.entrate]); const out = parseAmount(r[map.uscite]);
        amount = (isFinite(inc) ? Math.abs(inc) : 0) - (isFinite(out) ? Math.abs(out) : 0);
      }
      if (!date || !isFinite(amount) || amount === 0) return null;
      const desc = (r[map.desc] || "Movimento").slice(0, 300);
      const base = `csv:${date}:${amount}:${desc.slice(0, 120)}`;
      const n = occorrenze.get(base) ?? 0;
      occorrenze.set(base, n + 1);
      return {
        account_id: account.id, booking_date: date, description: desc, amount,
        source: "import_csv" as const,
        external_transaction_id: `${base}:${n}`.slice(0, 200),
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
      if (error) throw new Error(await edgeErrorMessage(error, "Errore AI"));
      if (data?.error) throw new Error(String(data.error));
      const occAi = new Map<string, number>();
      const rows: ManualTxInput[] = (data?.transactions ?? []).map((t: { date: string; description: string; amount: number }) => {
        const base = `ai:${t.date}:${t.amount}:${(t.description || "").slice(0, 40)}`;
        const n = occAi.get(base) ?? 0;
        occAi.set(base, n + 1);
        return {
          account_id: account.id, booking_date: t.date, description: t.description, amount: Number(t.amount),
          source: "import_ai" as const, external_transaction_id: `${base}:${n}`.slice(0, 200),
        };
      }).filter((r: ManualTxInput) => r.booking_date && isFinite(r.amount) && r.amount !== 0);
      if (!rows.length) { toast.error(tr("L'AI non ha trovato movimenti nel documento")); return; }
      setAiRows(rows);
      toast.success(tr("AI: {n} movimenti riconosciuti", { n: rows.length }));
    } catch (e) { toast.error(tr("Errore lettura AI"), { description: String((e as Error).message) }); }
    finally { setBusy(false); }
  }

  async function doImport(rows: ManualTxInput[]) {
    setErroreImport(null);
    if (!rows.length) { setErroreImport(tr("Nessun movimento valido da importare")); return; }
    try {
      await bulkInsert.mutateAsync({ account_id: account.id, rows, source: rows[0].source === "import_ai" ? "import_ai" : "import_csv" });
      onImported(); onOpenChange(false);
      setRawRows([]); setHeaders([]); setAiRows([]);
    } catch (error) {
      setErroreImport(tr("Importazione non completata: {errore}. I dati restano disponibili per riprovare.", { errore: error instanceof Error ? error.message : tr("controlla la connessione e riprova") }));
    }
  }

  const fileRows = headers.length ? buildFileRows() : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr("Importa estratto conto")}</DialogTitle>
          <DialogDescription>{tr("Carica un file CSV/Excel oppure una foto/PDF dell'estratto conto letto dall'AI. Duplicati saltati automaticamente.")}</DialogDescription>
        </DialogHeader>
        {erroreImport && <p role="alert" className="text-sm text-destructive">{erroreImport}</p>}

        <Tabs defaultValue="file">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> CSV / Excel</TabsTrigger>
            <TabsTrigger value="ai" className="gap-2"><Sparkles className="h-4 w-4" /> {tr("Foto / PDF (AI)")}</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-3">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />} {tr("Scegli file CSV o Excel")}
            </Button>
            {headers.length > 0 && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">{tr("Associa le colonne ({n} righe)", { n: rawRows.length })}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">{tr("Data")}</Label><ColSelect headers={headers} value={map.date} onChange={(v) => setMap({ ...map, date: v })} /></div>
                  <div><Label className="text-xs">{tr("Descrizione")}</Label><ColSelect headers={headers} value={map.desc} onChange={(v) => setMap({ ...map, desc: v })} /></div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={amountMode === "single" ? "default" : "outline"} onClick={() => setAmountMode("single")}>{tr("Importo unico (±)")}</Button>
                  <Button type="button" size="sm" variant={amountMode === "split" ? "default" : "outline"} onClick={() => setAmountMode("split")}>{tr("Entrate/Uscite separate")}</Button>
                </div>
                {amountMode === "single" ? (
                  <div><Label className="text-xs">{tr("Colonna importo")}</Label><ColSelect headers={headers} value={map.amount} onChange={(v) => setMap({ ...map, amount: v })} /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">{tr("Entrate")}</Label><ColSelect headers={headers} value={map.entrate} onChange={(v) => setMap({ ...map, entrate: v })} /></div>
                    <div><Label className="text-xs">{tr("Uscite")}</Label><ColSelect headers={headers} value={map.uscite} onChange={(v) => setMap({ ...map, uscite: v })} /></div>
                  </div>
                )}
                <PreviewList rows={fileRows} />
                {rawRows.length > fileRows.length && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {rawRows.length - fileRows.length === 1 ? tr("1 riga esclusa") : tr("{n} righe escluse", { n: rawRows.length - fileRows.length })}. {tr("Controlla le colonne della data e dell’importo.")}
                  </p>
                )}
                <DialogFooter>
                  <Button onClick={() => doImport(fileRows)} disabled={bulkInsert.isPending || !fileRows.length}>
                    {bulkInsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} {tr("Importa {n} movimenti", { n: fileRows.length })}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </TabsContent>

          <TabsContent value="ai" className="space-y-3">
            <input type="file" accept="image/*,application/pdf" className="hidden" id="ai-file" onChange={(e) => e.target.files?.[0] && handleAiFile(e.target.files[0])} />
            <Button variant="outline" className="w-full" onClick={() => document.getElementById("ai-file")?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />} {tr("Carica foto o PDF dell'estratto conto")}
            </Button>
            {aiRows.length > 0 && (
              <div className="space-y-3 rounded-lg border p-3">
                <PreviewList rows={aiRows} />
                <DialogFooter>
                  <Button onClick={() => doImport(aiRows)} disabled={bulkInsert.isPending}>
                    {bulkInsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} {tr("Importa {n} movimenti", { n: aiRows.length })}
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
  const t = useT();
  if (!rows.length) return <p className="text-xs text-muted-foreground">{t("Nessuna riga valida con la mappatura attuale.")}</p>;
  return (
    <div className="max-h-40 overflow-y-auto rounded border divide-y text-xs">
      {rows.slice(0, 8).map((r, i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1">
          <span className="truncate">{r.booking_date} · {r.description}</span>
          <span className={r.amount >= 0 ? "text-green-700" : "text-destructive"}>{r.amount >= 0 ? "+" : "−"}{formatCurrency(Math.abs(r.amount))}</span>
        </div>
      ))}
      {rows.length > 8 && <div className="px-2 py-1 text-muted-foreground">{t("… e altri {n}", { n: rows.length - 8 })}</div>}
    </div>
  );
}
