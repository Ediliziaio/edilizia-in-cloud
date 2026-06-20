/**
 * Libreria Prezzari Regionali — UI super-admin.
 *
 * Flusso: form fonte (regione/anno/versione/nome/url/licenza) → upload Excel/CSV
 * → estrazione matrice (string[][]) → `parsePrezzarioRegionale` (con preset
 * colonne dell'adapter regionale) → anteprima (colonne rilevate, capitoli,
 * campione voci, errori) → "Importa" (edge `prezzario-import`, crea la fonte in
 * stato 'bozza') → lista di TUTTE le fonti (incl. bozze, via RLS super_admin)
 * con azioni Pubblica/Archivia.
 *
 * La lettura file (CSV via papaparse / Excel via exceljs) replica i wrapper di
 * `src/lib/tariffe/prezziarioImport.ts`: estraggono una matrice grezza che qui
 * passiamo al parser puro `parsePrezzarioRegionale` (al posto di
 * `parsePrezziarioRows`), così riusiamo l'estrazione senza modificare quel file.
 *
 * Guardrail: SOLO prezzari regionali ufficiali con attribuzione fonte+anno;
 * mai aggregati commerciali (DEI, ecc.). Nota visibile in UI + campo `licenza`.
 *
 * Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md
 */
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Library, Upload, AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Send, Archive, Globe, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { REGIONI_ITALIANE } from "@/lib/prezzario/tipi";
import type { PrezzarioFonte, StatoFonte } from "@/lib/prezzario/tipi";
import { pickAdapter } from "@/lib/prezzario/adapters";
import {
  parsePrezzarioRegionale,
  summarizePrezzario,
  type ParsePrezzarioResult,
  type ParsedVoceImport,
  type ParsedCapitoloImport,
  type PrezzarioField,
} from "@/lib/prezzario/import";
import { usePrezzarioFontiAdmin } from "@/lib/prezzario/queries";

// prezzario_* non rigenerato nei tipi Supabase → client non tipizzato (stesso
// pattern di queries.ts / useListinoLavorazioni).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

const ANNO_CORRENTE = new Date().getFullYear();
const PREVIEW_LIMIT = 20;

// Etichette umane per le colonne rilevate nell'anteprima.
const FIELD_LABEL: Record<PrezzarioField, string> = {
  codice: "Codice",
  descrizione: "Descrizione",
  unita_misura: "Unità di misura",
  prezzo: "Prezzo",
  incidenza_manodopera: "Incidenza manodopera",
  incidenza_sicurezza: "Incidenza sicurezza",
  capitolo: "Capitolo",
};

const STATO_BADGE: Record<StatoFonte, { label: string; variant: "default" | "secondary" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  pubblicato: { label: "Pubblicato", variant: "default" },
  archiviato: { label: "Archiviato", variant: "outline" },
};

// ─── Estrazione matrice da file (replica wrapper di prezziarioImport.ts) ──────

/** CSV → matrice grezza (righe non vuote). */
function csvToMatrix(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return (parsed.data as string[][]).filter(
    (r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""),
  );
}

/** Excel → matrice grezza. Gestisce richText / formule (result) / date come i wrapper esistenti. */
async function excelToMatrix(buffer: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet("Dati") ?? wb.worksheets[0];
  if (!sheet) return [];

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const raw = cell.value;
      let str: string;
      if (raw === null || raw === undefined) {
        str = "";
      } else if (typeof raw === "object" && "richText" in (raw as object)) {
        str = (raw as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
      } else if (typeof raw === "object" && "result" in (raw as object)) {
        str = ((raw as { result: unknown }).result ?? "").toString();
      } else if (raw instanceof Date) {
        str = raw.toISOString().slice(0, 10);
      } else {
        str = raw.toString();
      }
      vals[colNumber - 1] = str;
    });
    matrix.push(vals);
  });
  return matrix;
}

/** Auto-rileva CSV vs Excel dal nome/MIME ed estrae la matrice grezza. */
async function fileToMatrix(file: File): Promise<string[][]> {
  const lower = file.name.toLowerCase();
  const isCsv = lower.endsWith(".csv") || file.type === "text/csv";
  if (isCsv) return csvToMatrix(await file.text());
  return excelToMatrix(await file.arrayBuffer());
}

// ─── Form fonte ──────────────────────────────────────────────────────────────

interface FonteForm {
  regione: string;
  anno: string;
  versione: string;
  nome: string;
  url_fonte: string;
  licenza: string;
}

const EMPTY_FORM: FonteForm = {
  regione: "",
  anno: String(ANNO_CORRENTE),
  versione: "",
  nome: "",
  url_fonte: "",
  licenza: "",
};

interface ImportResponse {
  fonte_id: string;
  capitoli_inseriti: number;
  voci_inserite: number;
  voci_scartate: number;
}

/** Risposta dell'edge `prezzario-extract-ai` (estrazione AI da testo). */
interface AiExtractResponse {
  voci: ParsedVoceImport[];
  capitoli: ParsedCapitoloImport[];
  troncato: boolean;
  voci_totali: number;
}

export default function PrezzariRegionali() {
  const { permissions } = useSuperAdminPermissions();
  const qc = useQueryClient();

  const [form, setForm] = useState<FonteForm>(EMPTY_FORM);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsePrezzarioResult | null>(null);
  // Estrazione AI (PDF/testo): testo incollato + flag "risultato troncato".
  const [aiText, setAiText] = useState("");
  const [aiTroncato, setAiTroncato] = useState(false);

  const { data: fonti, isLoading: fontiLoading, error: fontiError } = usePrezzarioFontiAdmin();

  const summary = useMemo(
    () => (result ? summarizePrezzario(result.voci) : null),
    [result],
  );

  const detectedFields = useMemo(() => {
    if (!result) return [];
    return (Object.keys(result.detectedColumns) as PrezzarioField[]).filter(
      (f) => result.detectedColumns[f] !== undefined,
    );
  }, [result]);

  const set = <K extends keyof FonteForm>(key: K, value: FonteForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── Upload + parse ─────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // consenti il re-upload dello stesso file
    if (!file) return;
    if (!form.regione) {
      toast.error("Seleziona prima la regione: serve per gli alias colonne.");
      return;
    }
    setParsing(true);
    setParseError(null);
    setResult(null);
    setAiTroncato(false); // l'anteprima ora proviene da un file, non dall'AI
    setFileName(file.name);
    try {
      const matrix = await fileToMatrix(file);
      // Adapter regionale: alias header AGGIUNTIVI oltre all'autodetect generico.
      const preset = pickAdapter(form.regione);
      const parsed = parsePrezzarioRegionale(matrix, {
        regione: form.regione,
        columnAliases: preset.columnAliases,
      });
      setResult(parsed);
      // Auto-compila il nome se vuoto, con un default sensato.
      if (!form.nome.trim()) {
        set("nome", `Prezzario ${form.regione} ${form.anno}`);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Errore nella lettura del file.");
      setFileName(null);
    } finally {
      setParsing(false);
    }
  }

  // ── Estrai con AI (PDF/testo) via edge `prezzario-extract-ai` ───────────────
  // L'output (voci/capitoli, già nel CONTRATTO di import.ts) confluisce nella
  // STESSA anteprima dell'Excel: costruiamo un ParsePrezzarioResult e lo
  // mettiamo nello stesso `result`. Da lì si rivede e si importa (riuso totale).
  const aiExtractMutation = useMutation({
    mutationFn: async (): Promise<AiExtractResponse> => {
      if (!form.regione) throw new Error("Seleziona prima la regione.");
      if (!aiText.trim()) throw new Error("Incolla il testo del prezzario.");
      const { data, error } = await supabase.functions.invoke<AiExtractResponse>(
        "prezzario-extract-ai",
        { body: { testo: aiText, regione: form.regione } },
      );
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Risposta vuota dalla funzione di estrazione AI.");
      return data;
    },
    onSuccess: (data) => {
      // Inietta l'output AI nello stato di anteprima condiviso con l'Excel.
      const voci = Array.isArray(data.voci) ? data.voci : [];
      const capitoli = Array.isArray(data.capitoli) ? data.capitoli : [];
      // detectedColumns: segnala i campi presenti così l'anteprima li mostra
      // come "rilevati" (indice 0 — convenzionale, non c'è una matrice colonne).
      const detectedColumns: ParsePrezzarioResult["detectedColumns"] = {};
      if (voci.length > 0) {
        detectedColumns.descrizione = 0;
        detectedColumns.prezzo = 0;
        if (voci.some((v) => v.codice)) detectedColumns.codice = 0;
        if (voci.some((v) => v.unita_misura)) detectedColumns.unita_misura = 0;
        if (voci.some((v) => v.incidenza_manodopera_pct != null)) detectedColumns.incidenza_manodopera = 0;
        if (voci.some((v) => v.incidenza_sicurezza_pct != null)) detectedColumns.incidenza_sicurezza = 0;
        if (capitoli.length > 0) detectedColumns.capitolo = 0;
      }
      setResult({ capitoli, voci, detectedColumns, globalErrors: [] });
      setAiTroncato(Boolean(data.troncato));
      setFileName(null); // l'anteprima ora proviene dall'AI, non da un file
      if (!form.nome.trim()) {
        set("nome", `Prezzario ${form.regione} ${form.anno}`);
      }
      const valide = voci.filter((v) => v.errors.length === 0).length;
      toast.success("Estrazione AI completata", {
        description: `${voci.length} voci estratte · ${valide} valide${data.troncato ? " · testo troncato a 30k caratteri" : ""}`,
      });
    },
    onError: (err) => {
      toast.error("Estrazione AI fallita", {
        description: err instanceof Error ? err.message : "Errore sconosciuto.",
      });
    },
  });

  // ── Importa (bozza) via edge function ──────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: async (): Promise<ImportResponse> => {
      if (!result) throw new Error("Nessun file analizzato.");
      const anno = Number(form.anno);
      if (!form.regione) throw new Error("Regione obbligatoria.");
      if (!Number.isFinite(anno) || anno <= 0) throw new Error("Anno non valido.");
      if (!form.nome.trim()) throw new Error("Nome fonte obbligatorio.");

      const { data, error } = await supabase.functions.invoke<ImportResponse>("prezzario-import", {
        body: {
          fonte: {
            regione: form.regione,
            anno,
            versione: form.versione.trim() || null,
            nome: form.nome.trim(),
            url_fonte: form.url_fonte.trim() || null,
            licenza: form.licenza.trim() || null,
          },
          capitoli: result.capitoli,
          // Scarta in import le righe-voce non valide (es. header di capitolo
          // senza prezzo): l'edge accetta solo voci con descrizione+prezzo>0.
          voci: result.voci.filter((v) => v.errors.length === 0),
        },
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Risposta vuota dalla funzione di import.");
      return data;
    },
    onSuccess: (data) => {
      toast.success("Prezzario importato come bozza", {
        description:
          `Fonte ${data.fonte_id.slice(0, 8)}… · ${data.capitoli_inseriti} capitoli · ` +
          `${data.voci_inserite} voci inserite · ${data.voci_scartate} scartate`,
      });
      setResult(null);
      setFileName(null);
      setAiText("");
      setAiTroncato(false);
      void qc.invalidateQueries({ queryKey: ["prezzario", "fonti", "admin"] });
    },
    onError: (err) => {
      toast.error("Import fallito", {
        description: err instanceof Error ? err.message : "Errore sconosciuto.",
      });
    },
  });

  // ── Cambio stato (Pubblica / Archivia) — il super_admin passa la RLS ────────
  const statoMutation = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: StatoFonte }) => {
      const { error } = await sb()
        .from("prezzario_fonte")
        .update({ stato, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.stato === "pubblicato" ? "Fonte pubblicata" : "Fonte archiviata",
      );
      void qc.invalidateQueries({ queryKey: ["prezzario", "fonti", "admin"] });
      void qc.invalidateQueries({ queryKey: ["prezzario", "fonti"] });
    },
    onError: (err) => {
      toast.error("Aggiornamento stato fallito", {
        description: err instanceof Error ? err.message : "Errore sconosciuto.",
      });
    },
  });

  // Gate UI: stessa permission super-admin delle altre dashboard (Produttori/
  // Commercialisti). La route è già protetta da RequireSuperAdmin.
  if (!permissions.can_manage_companies) return <AccessDenied />;

  const canImport = Boolean(result) && (summary?.valid ?? 0) > 0 && !importMutation.isPending;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-sidebar-primary/10 p-2">
          <Library className="h-6 w-6 text-sidebar-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prezzari regionali</h1>
          <p className="text-sm text-muted-foreground">
            Libreria centrale condivisa dei prezzari dei lavori pubblici. Carica, anteprima, pubblica.
          </p>
        </div>
      </div>

      {/* Guardrail legale */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Solo prezzari regionali ufficiali</AlertTitle>
        <AlertDescription>
          Carica esclusivamente prezzari regionali ufficiali (pubblici) con attribuzione fonte e anno.
          Non caricare aggregati commerciali (DEI, ecc.). Indica sempre la licenza/fonte.
        </AlertDescription>
      </Alert>

      {/* Form fonte + upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Nuova fonte
          </CardTitle>
          <CardDescription>
            Compila i dati della fonte, poi carica il file Excel/CSV ufficiale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="regione">Regione *</Label>
              <Select value={form.regione} onValueChange={(v) => set("regione", v)}>
                <SelectTrigger id="regione">
                  <SelectValue placeholder="Seleziona regione" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONI_ITALIANE.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="anno">Anno *</Label>
              <Input
                id="anno"
                type="number"
                inputMode="numeric"
                value={form.anno}
                onChange={(e) => set("anno", e.target.value)}
                placeholder={String(ANNO_CORRENTE)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="versione">Versione</Label>
              <Input
                id="versione"
                value={form.versione}
                onChange={(e) => set("versione", e.target.value)}
                placeholder="es. agg. 2 / rev. B"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="nome">Nome fonte *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder="es. Prezzario Regione Lombardia 2026"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="url_fonte">URL fonte</Label>
              <Input
                id="url_fonte"
                type="url"
                value={form.url_fonte}
                onChange={(e) => set("url_fonte", e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="licenza">Licenza</Label>
              <Input
                id="licenza"
                value={form.licenza}
                onChange={(e) => set("licenza", e.target.value)}
                placeholder="es. CC-BY / uso pubblico"
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" disabled={parsing}>
              <label className="cursor-pointer">
                {parsing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                {parsing ? "Analisi in corso…" : "Carica Excel/CSV"}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={handleFile}
                  disabled={parsing}
                />
              </label>
            </Button>
            {fileName && (
              <span className="text-sm text-muted-foreground">
                File: <span className="font-medium text-foreground">{fileName}</span>
              </span>
            )}
          </div>

          {parseError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Estrazione AI (PDF/testo) — per le regioni senza Excel importabile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Estrai con AI (PDF/testo)
          </CardTitle>
          <CardDescription>
            Per le regioni che non pubblicano un Excel/CSV importabile: incolla il testo del prezzario
            (es. copiato dal PDF) e l&apos;AI lo converte in voci. Il risultato confluisce nell&apos;anteprima qui sotto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Estrazione AI: rivedere SEMPRE prezzi/UM prima di pubblicare</AlertTitle>
            <AlertDescription>
              L&apos;estrazione automatica può sbagliare prezzi, unità di misura o codici. Controlla sempre
              le voci nell&apos;anteprima prima di importare e pubblicare.
            </AlertDescription>
          </Alert>

          <div className="space-y-1.5">
            <Label htmlFor="ai-text">Testo del prezzario</Label>
            <Textarea
              id="ai-text"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="Incolla qui il testo del PDF/prezzario (codice, descrizione, U.M., prezzo, eventuale % manodopera)…"
              rows={10}
              className="font-mono text-xs"
              disabled={aiExtractMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Verranno usati al massimo 30.000 caratteri per chiamata; per prezzari lunghi estrai una sezione alla volta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => aiExtractMutation.mutate()}
              disabled={!form.regione || !aiText.trim() || aiExtractMutation.isPending}
            >
              {aiExtractMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {aiExtractMutation.isPending ? "Estrazione in corso…" : "Estrai"}
            </Button>
            {!form.regione && (
              <span className="text-sm text-muted-foreground">Seleziona prima la regione.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Anteprima */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Anteprima</CardTitle>
            <CardDescription>
              Controlla colonne rilevate e voci prima di importare. Le righe con errori sono escluse dall&apos;import.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Errori globali (colonne mancanti, file vuoto) */}
            {result.globalErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Problemi nel file</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5">
                    {result.globalErrors.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Avviso troncamento estrazione AI (testo oltre 30k caratteri) */}
            {aiTroncato && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Testo troncato</AlertTitle>
                <AlertDescription>
                  Il testo superava i 30.000 caratteri ed è stato troncato: alcune voci potrebbero mancare.
                  Estrai le sezioni rimanenti separatamente.
                </AlertDescription>
              </Alert>
            )}

            {/* Colonne rilevate */}
            <div>
              <p className="mb-2 text-sm font-medium">Colonne rilevate</p>
              <div className="flex flex-wrap gap-2">
                {detectedFields.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Nessuna colonna riconosciuta.</span>
                ) : (
                  detectedFields.map((f) => (
                    <Badge key={f} variant="secondary">
                      {FIELD_LABEL[f]} · col {(result.detectedColumns[f] ?? 0) + 1}
                    </Badge>
                  ))
                )}
              </div>
            </div>

            {/* Conteggi */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBox label="Capitoli" value={result.capitoli.length} />
              <StatBox label="Voci totali" value={summary?.total ?? 0} />
              <StatBox label="Voci valide" value={summary?.valid ?? 0} tone="ok" />
              <StatBox
                label="Voci con errori"
                value={summary?.withErrors ?? 0}
                tone={(summary?.withErrors ?? 0) > 0 ? "warn" : "default"}
              />
            </div>

            {/* Tabella campione voci */}
            {result.voci.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Codice</TableHead>
                      <TableHead>Descrizione</TableHead>
                      <TableHead className="w-[70px]">UM</TableHead>
                      <TableHead className="w-[110px] text-right">Prezzo</TableHead>
                      <TableHead className="w-[90px] text-right">Man. %</TableHead>
                      <TableHead className="w-[160px]">Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.voci.slice(0, PREVIEW_LIMIT).map((v, i) => {
                      const hasErr = v.errors.length > 0;
                      const hasWarn = v.warnings.length > 0;
                      return (
                        <TableRow key={i} className={hasErr ? "bg-destructive/5" : undefined}>
                          <TableCell className="font-mono text-xs">{v.codice ?? "—"}</TableCell>
                          <TableCell className="max-w-[420px] truncate" title={v.descrizione}>
                            {v.descrizione || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs">{v.unita_misura ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {v.prezzo > 0 ? `€ ${v.prezzo.toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {v.incidenza_manodopera_pct != null
                              ? `${Math.round(v.incidenza_manodopera_pct * 100)}%`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {hasErr ? (
                              <Badge variant="destructive" title={v.errors.join(" ")}>Errore</Badge>
                            ) : hasWarn ? (
                              <Badge variant="outline" title={v.warnings.join(" ")}>Warning</Badge>
                            ) : (
                              <Badge variant="secondary">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {result.voci.length > PREVIEW_LIMIT && (
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Mostrate {PREVIEW_LIMIT} di {result.voci.length} voci.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => importMutation.mutate()} disabled={!canImport}>
                {importMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Importa come bozza
              </Button>
              {(summary?.valid ?? 0) === 0 && (
                <span className="text-sm text-muted-foreground">
                  Nessuna voce valida da importare.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista fonti esistenti (tutte, incl. bozze) */}
      <Card>
        <CardHeader>
          <CardTitle>Fonti caricate</CardTitle>
          <CardDescription>
            Tutte le fonti (bozze incluse). Pubblica per renderle disponibili alle aziende; archivia per ritirarle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fontiLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento fonti…
            </div>
          ) : fontiError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {fontiError instanceof Error ? fontiError.message : "Errore nel caricamento delle fonti."}
              </AlertDescription>
            </Alert>
          ) : !fonti || fonti.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessuna fonte caricata. Usa il modulo qui sopra per importarne una.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-[130px]">Regione</TableHead>
                    <TableHead className="w-[80px]">Anno</TableHead>
                    <TableHead className="w-[110px]">Versione</TableHead>
                    <TableHead className="w-[120px]">Stato</TableHead>
                    <TableHead className="w-[220px] text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fonti.map((f: PrezzarioFonte) => {
                    const badge = STATO_BADGE[f.stato] ?? STATO_BADGE.bozza;
                    const pending = statoMutation.isPending && statoMutation.variables?.id === f.id;
                    return (
                      <TableRow key={f.id}>
                        <TableCell>
                          <div className="font-medium">{f.nome}</div>
                          {f.url_fonte && (
                            <a
                              href={f.url_fonte}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Globe className="h-3 w-3" /> fonte
                            </a>
                          )}
                          {f.licenza && (
                            <div className="text-xs text-muted-foreground">Licenza: {f.licenza}</div>
                          )}
                        </TableCell>
                        <TableCell>{f.regione}</TableCell>
                        <TableCell className="tabular-nums">{f.anno}</TableCell>
                        <TableCell className="text-muted-foreground">{f.versione ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {f.stato !== "pubblicato" && (
                              <Button
                                size="sm"
                                variant="default"
                                disabled={pending}
                                onClick={() => statoMutation.mutate({ id: f.id, stato: "pubblicato" })}
                              >
                                {pending ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Pubblica
                              </Button>
                            )}
                            {f.stato !== "archiviato" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => statoMutation.mutate({ id: f.id, stato: "archiviato" })}
                              >
                                <Archive className="mr-1.5 h-3.5 w-3.5" />
                                Archivia
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Piccolo box statistica per l'anteprima ──────────────────────────────────
function StatBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "ok" | "warn";
}) {
  const valueClass =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
