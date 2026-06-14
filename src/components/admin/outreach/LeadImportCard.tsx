import { useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classifyEmail, isLowQuality } from "../../../../supabase/functions/_shared/email-quality";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, RotateCcw, ArrowRight } from "lucide-react";

/**
 * Importatore liste lead (CSV) → marketing_contacts.
 * Parsing robusto (papaparse), mapping colonne con auto-detect, dedup in-file
 * e contro il DB (per email), insert batch. Scrive sulla tabella esistente:
 * funziona da subito, nessuna migrazione richiesta.
 */

type Field = "first_name" | "last_name" | "email" | "phone" | "company_name" | "notes";
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
  { key: "notes", label: "Note" },
];

const HINTS: Record<Field, string[]> = {
  first_name: ["first", "nome", "name"],
  last_name: ["last", "cognome", "surname"],
  email: ["email", "e-mail", "mail", "posta"],
  phone: ["phone", "tel", "telefono", "cellulare", "mobile", "cell"],
  company_name: ["company", "azienda", "ragione", "ditta", "business", "società", "societa"],
  notes: ["note", "comment", "descrizione", "messaggio"],
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

  function reset() {
    setPhase("idle"); setFileName(""); setHeaders([]); setRows([]); setMapping({});
    setProgress(0); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
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
        setPhase("mapping");
      },
      error: (err) => { toast.error(`Errore di parsing: ${err.message}`); reset(); },
    });
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
      if (!error) data?.forEach((r) => r.email && set.add(r.email.toLowerCase()));
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5 text-orange-500" /> Importa lista (CSV)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* IDLE */}
        {phase === "idle" && (
          <div className="rounded-xl border-2 border-dashed p-8 text-center">
            <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="mb-1 text-sm font-medium">Carica un file CSV di lead</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Intestazione nella prima riga. Mapperai tu le colonne. Dedup automatica su email.
            </p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" id="lead-csv" />
            <Button onClick={() => fileRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Scegli file CSV
            </Button>
          </div>
        )}

        {/* MAPPING */}
        {phase === "mapping" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary" className="gap-1"><FileSpreadsheet className="h-3 w-3" />{fileName}</Badge>
              <span className="text-muted-foreground">{rows.length.toLocaleString("it-IT")} righe · {headers.length} colonne</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}{key === "first_name" && <span className="text-muted-foreground"> (fallback automatico)</span>}</Label>
                  <Select value={mapping[key] ?? NONE} onValueChange={(v) => setField(key, v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="— ignora —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— ignora —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor="list-tag">Tag di lista (applicato a tutti i contatti)</Label>
              <Input id="list-tag" value={listTag} onChange={(e) => setListTag(e.target.value)} className="h-9" placeholder="es. import-fiere-2026" />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={excludeLowQuality} onChange={(e) => setExcludeLowQuality(e.target.checked)} className="accent-orange-500" />
              Escludi email <strong className="font-medium text-foreground">role</strong> (info@, noreply@) e <strong className="font-medium text-foreground">usa-e-getta</strong> — meno bounce
            </label>

            {!hasContactCol && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Mappa almeno <strong>Email</strong> o <strong>Telefono</strong>: i contatti senza recapito vengono scartati.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={runImport} disabled={!hasContactCol} className="gap-2">
                Importa {rows.length.toLocaleString("it-IT")} righe <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={reset} className="gap-2"><RotateCcw className="h-4 w-4" /> Annulla</Button>
            </div>
          </div>
        )}

        {/* IMPORTING */}
        {phase === "importing" && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">Importazione in corso…</p>
            <Progress value={progress} />
            <p className="text-right text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}

        {/* DONE */}
        {phase === "done" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">{result.imported.toLocaleString("it-IT")} contatti importati</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
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
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "good" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-foreground";
  return (
    <div className="rounded-lg border p-2">
      <div className={`text-lg font-bold ${cls}`}>{value.toLocaleString("it-IT")}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
