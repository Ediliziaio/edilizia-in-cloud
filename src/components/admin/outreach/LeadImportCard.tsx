import { useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classifyEmail, isLowQuality } from "../../../../supabase/functions/_shared/email-quality";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, RotateCcw, ArrowRight, Tag, Loader2 } from "lucide-react";

/**
 * Importatore liste lead (CSV) → marketing_contacts.
 * Parsing robusto (papaparse), mapping colonne con auto-detect, dedup in-file
 * e contro il DB (per email), insert batch. Scrive sulla tabella esistente:
 * funziona da subito, nessuna migrazione richiesta.
 */

type Field = "first_name" | "last_name" | "email" | "phone" | "company_name" | "notes" | "city" | "province" | "website" | "vat_number";
type Mapping = Partial<Record<Field, string>>;
type CsvRow = Record<string, string>;

const NONE = "__none__";
const BATCH = 200;

const FIELDS: { key: Field; label: string }[] = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Cognome" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefono" },
  { key: "company_name", label: "Azienda" },
  { key: "city", label: "Città" },
  { key: "province", label: "Provincia" },
  { key: "website", label: "Sito web" },
  { key: "vat_number", label: "Partita IVA" },
  { key: "notes", label: "Note" },
];

const HINTS: Record<Field, string[]> = {
  first_name: ["first", "nome", "name"],
  last_name: ["last", "cognome", "surname"],
  email: ["email", "e-mail", "mail", "posta"],
  phone: ["phone", "tel", "telefono", "cellulare", "mobile", "cell"],
  company_name: ["company", "azienda", "ragione", "ditta", "business", "società", "societa"],
  notes: ["note", "comment", "descrizione", "messaggio"],
  city: ["city", "città", "citta", "comune", "località", "localita"],
  province: ["province", "provincia", "prov", "sigla"],
  website: ["website", "sito", "web", "url", "www"],
  vat_number: ["vat", "p.iva", "piva", "partita", "iva", "cf/piva"],
};

function autoMap(headers: string[]): Mapping {
  const m: Mapping = {};
  for (const { key } of FIELDS) {
    const hit = headers.find((h) => HINTS[key].some((hint) => h.toLowerCase().trim().includes(hint)));
    if (hit) m[key] = hit;
  }
  return m;
}

type Result = {
  total: number; imported: number; errors: number;
  skippedNoContact: number; skippedDupFile: number; skippedDupDb: number; skippedLowQuality: number;
};

export function LeadImportCard({ companyId, onImported }: { companyId: string; onImported?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "mapping" | "importing" | "done">("idle");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [listTag, setListTag] = useState(() => `import-${new Date().toISOString().slice(0, 10)}`);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [excludeLowQuality, setExcludeLowQuality] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);

  function reset() {
    setPhase("idle"); setFileName(""); setHeaders([]); setRows([]); setMapping({});
    setProgress(0); setResult(null); setParsing(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function parseFile(file: File) {
    if (!/\.csv$/i.test(file.name) && file.type && !file.type.includes("csv")) {
      toast.error("Carica un file CSV.");
      return;
    }
    setFileName(file.name);
    setParsing(true);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const flds = (res.meta.fields ?? []).filter(Boolean);
        const data = (res.data ?? []).filter((r) => Object.values(r).some((v) => String(v ?? "").trim()));
        if (!flds.length || !data.length) {
          toast.error("Il file non contiene righe valide o un'intestazione leggibile.");
          reset();
          return;
        }
        setHeaders(flds);
        setRows(data);
        setMapping(autoMap(flds));
        setParsing(false);
        setPhase("mapping");
      },
      error: (err) => { toast.error(`Errore di parsing: ${err.message}`); reset(); },
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (phase !== "idle") return;
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }

  function setField(field: Field, value: string) {
    setMapping((prev) => ({ ...prev, [field]: value === NONE ? undefined : value }));
  }

  function buildContacts() {
    const seen = new Set<string>();
    const contacts: Record<string, unknown>[] = [];
    let skippedNoContact = 0, skippedDupFile = 0, skippedLowQuality = 0;
    const nowIso = new Date().toISOString();
    const tag = listTag.trim() || "import";

    for (const row of rows) {
      const get = (f: Field) => (mapping[f] ? String(row[mapping[f] as string] ?? "").trim() : "");
      const email = get("email").toLowerCase();
      const phone = get("phone");
      if (!email && !phone) { skippedNoContact++; continue; }
      if (excludeLowQuality && email && isLowQuality(classifyEmail(email))) { skippedLowQuality++; continue; }
      const key = email || phone;
      if (seen.has(key)) { skippedDupFile++; continue; }
      seen.add(key);
      const firstName = get("first_name") || (email ? email.split("@")[0] : "") || get("company_name") || "Lead";
      contacts.push({
        company_id: companyId,
        first_name: firstName,
        last_name: get("last_name") || null,
        email: email || null,
        phone: phone || null,
        company_name: get("company_name") || null,
        city: get("city") || null,
        province: get("province").toUpperCase().slice(0, 4) || null,
        website: get("website") || null,
        vat_number: get("vat_number").replace(/\s+/g, "") || null,
        notes: get("notes") || null,
        tags: [tag],
        source: "csv_import",
        last_activity_at: nowIso,
      });
    }
    return { contacts, skippedNoContact, skippedDupFile, skippedLowQuality };
  }

  /** Quali email esistono già nel DB per questa company (chunk di .in() per non scaricare l'intera tabella). */
  async function existingEmails(emails: string[]): Promise<Set<string>> {
    const set = new Set<string>();
    const uniq = [...new Set(emails)];
    for (let i = 0; i < uniq.length; i += BATCH) {
      const chunk = uniq.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from("marketing_contacts").select("email").eq("company_id", companyId).in("email", chunk);
      // Se la query dedup fallisce (rete/RLS) NON proseguire: prima l'errore veniva
      // ingoiato e il set restava vuoto → tutte le righe risultavano "nuove" e
      // venivano reimportate come duplicati. Meglio abortire con errore chiaro.
      if (error) throw new Error(`Verifica duplicati fallita: ${error.message}`);
      data?.forEach((r) => r.email && set.add(r.email.toLowerCase()));
    }
    return set;
  }

  async function runImport() {
    setPhase("importing"); setProgress(0);
    try {
      const { contacts, skippedNoContact, skippedDupFile, skippedLowQuality } = buildContacts();
      if (!contacts.length) {
        toast.error("Nessun contatto valido: serve almeno email o telefono mappati.");
        setPhase("mapping"); return;
      }
      const withEmail = contacts.map((c) => c.email as string | null).filter((e): e is string => !!e);
      const dbExisting = await existingEmails(withEmail);
      const toInsert = contacts.filter((c) => !c.email || !dbExisting.has(c.email as string));
      const skippedDupDb = contacts.length - toInsert.length;

      let imported = 0, errors = 0;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        const { error } = await supabase.from("marketing_contacts").insert(batch as never);
        if (error) errors += batch.length; else imported += batch.length;
        setProgress(Math.round(((i + batch.length) / toInsert.length) * 100));
      }

      setResult({ total: rows.length, imported, errors, skippedNoContact, skippedDupFile, skippedDupDb, skippedLowQuality });
      setPhase("done");
      if (imported > 0) { toast.success(`${imported} contatti importati nella lista "${listTag.trim() || "import"}"`); onImported?.(); }
      else toast.info("Nessun nuovo contatto importato (tutti duplicati o senza recapito).");
    } catch (e) {
      toast.error(`Import fallito: ${e instanceof Error ? e.message : "errore sconosciuto"}`);
      setPhase("mapping");
    }
  }

  const hasContactCol = !!mapping.email || !!mapping.phone;
  const STEPS = ["File", "Mappatura", "Esito"] as const;
  const stepIdx = phase === "idle" ? 0 : phase === "done" ? 2 : 1;

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      {/* header */}
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileSpreadsheet className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">Importa lista (CSV)</h3>
          <p className="text-xs text-muted-foreground">Parsing, mappatura colonne e dedup automatica</p>
        </div>
        {/* stepper */}
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  i < stepIdx ? "bg-primary/15 text-primary" : i === stepIdx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {i < stepIdx ? "✓" : i + 1}
              </span>
              <span className={`text-[11px] ${i === stepIdx ? "font-medium text-foreground" : "text-muted-foreground"}`}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-border" />}
            </div>
          ))}
        </div>
      </header>

      <div className="space-y-4 p-4">
        {/* IDLE — dropzone */}
        {phase === "idle" && (
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" id="lead-csv" />
            <button
              type="button"
              onClick={() => !parsing && fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); if (!parsing) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex w-full flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
              }`}
            >
              <span className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full transition-colors ${dragOver ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              </span>
              <p className="text-sm font-medium">
                {parsing ? "Lettura del file…" : dragOver ? "Rilascia per caricare" : "Trascina un CSV o clicca per scegliere"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Intestazione nella prima riga. Mapperai tu le colonne. Dedup automatica su email.
              </p>
            </button>
          </>
        )}

        {/* MAPPING */}
        {phase === "mapping" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 font-normal"><FileSpreadsheet className="h-3 w-3" />{fileName}</Badge>
              <span className="text-xs text-muted-foreground tabular-nums">{rows.length.toLocaleString("it-IT")} righe · {headers.length} colonne</span>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mappa le colonne</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map(({ key, label }) => {
                  const mapped = !!mapping[key];
                  return (
                    <div key={key} className="space-y-1">
                      <Label className="flex items-center gap-1.5 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${mapped ? "bg-primary" : "bg-muted-foreground/30"}`} />
                        {label}{key === "first_name" && <span className="text-muted-foreground"> (fallback automatico)</span>}
                      </Label>
                      <Select value={mapping[key] ?? NONE} onValueChange={(v) => setField(key, v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="— ignora —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— ignora —</SelectItem>
                          {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-xs" htmlFor="list-tag">
                <Tag className="h-3 w-3 text-muted-foreground" /> Tag di lista (applicato a tutti i contatti)
              </Label>
              <Input id="list-tag" value={listTag} onChange={(e) => setListTag(e.target.value)} className="h-9" placeholder="es. import-fiere-2026" />
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={excludeLowQuality} onChange={(e) => setExcludeLowQuality(e.target.checked)} className="mt-0.5 accent-primary" />
              <span>
                Escludi email <strong className="font-medium text-foreground">role</strong> (info@, noreply@) e <strong className="font-medium text-foreground">usa-e-getta</strong> — meno bounce
              </span>
            </label>

            {!hasContactCol && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Mappa almeno <strong>Email</strong> o <strong>Telefono</strong>: i contatti senza recapito vengono scartati.</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button onClick={runImport} disabled={!hasContactCol} className="gap-2">
                Importa {rows.length.toLocaleString("it-IT")} righe <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={reset} className="gap-2"><RotateCcw className="h-4 w-4" /> Annulla</Button>
            </div>
          </div>
        )}

        {/* IMPORTING */}
        {phase === "importing" && (
          <div className="space-y-3 py-6">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Importazione in corso…
            </p>
            <Progress value={progress} />
            <p className="text-right text-xs text-muted-foreground tabular-nums">{progress}%</p>
          </div>
        )}

        {/* DONE */}
        {phase === "done" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold text-emerald-700">{result.imported.toLocaleString("it-IT")} contatti importati</div>
                <div className="text-xs text-emerald-600/80">nella lista "{listTag.trim() || "import"}"</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Righe nel file" value={result.total} />
              <Stat label="Importati" value={result.imported} tone="good" />
              <Stat label="Errori" value={result.errors} tone={result.errors ? "bad" : "default"} />
              <Stat label="Senza recapito" value={result.skippedNoContact} />
              <Stat label="Bassa qualità" value={result.skippedLowQuality} />
              <Stat label="Duplicati nel file" value={result.skippedDupFile} />
              <Stat label="Già in rubrica" value={result.skippedDupDb} />
            </div>
            <Button onClick={reset} variant="outline" className="gap-2"><RotateCcw className="h-4 w-4" /> Importa un'altra lista</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "good" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" && value > 0 ? "text-red-600" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value.toLocaleString("it-IT")}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
