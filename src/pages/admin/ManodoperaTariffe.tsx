/**
 * Manodopera (costo orario) — UI super-admin.
 *
 * Macchina di gestione delle TARIFFE ORARIE manodopera edile ufficiali
 * (`manodopera_tariffa`). Tabella filtrabile (regione/provincia/anno) + form
 * aggiungi/modifica riga (regione, provincia, anno, qualifica, costo €/h, fonte)
 * + elimina + import CSV semplice (regione/provincia/anno/qualifica/costo).
 *
 * Scrittura diretta sulla tabella: il super_admin passa la RLS di write
 * (`public.is_super_admin()`). Gate UI come PrezzariRegionali
 * (`can_manage_companies`); la route è protetta da RequireSuperAdmin.
 *
 * Guardrail: caricare solo tariffe ufficiali (contratti collettivi / tabelle
 * provinciali / prezzari regionali) con attribuzione fonte e anno.
 *
 * Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md
 */
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  HardHat, Plus, Pencil, Trash2, Loader2, AlertCircle, FileSpreadsheet, X,
  Search, Download, Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { REGIONI_ITALIANE } from "@/lib/prezzario/tipi";
import type { ManodoperaTariffa, QualificaManodopera } from "@/lib/prezzario/tipi";
import {
  useManodoperaTariffe,
  useUpsertManodoperaTariffa,
  useDeleteManodoperaTariffa,
  QUALIFICHE_ORDINE,
  QUALIFICA_LABEL,
  type ManodoperaFiltri,
  type ManodoperaTariffaInput,
} from "@/lib/prezzario/manodopera";
import { parseItalianNumber } from "@/lib/tariffe/prezziarioImport";
import { formatCurrency } from "@/lib/formatters";
import { escapeCsvCell } from "@/lib/csvExport";
import { supabase } from "@/integrations/supabase/client";

const ANNO_CORRENTE = new Date().getFullYear();
// Range di sanità per l'anno tariffa: prima del 2000 non esistono tabelle utili,
// oltre l'anno prossimo è quasi certamente un refuso.
const ANNO_MIN = 2000;
const ANNO_MAX = ANNO_CORRENTE + 1;

/**
 * Chiave naturale di una tariffa: regione+provincia+anno+qualifica. La tabella
 * NON ha un vincolo UNIQUE a DB, quindi la protezione anti-duplicato vive qui:
 * form e import CSV risolvono la chiave su una riga esistente e la AGGIORNANO
 * invece di inserirne una seconda (reimportare lo stesso CSV = refresh, non doppioni).
 */
const naturalKey = (r: { regione: string | null; provincia: string | null; anno: number | null; qualifica: string | null }) =>
  [r.regione ?? "", (r.provincia ?? "").toUpperCase(), r.anno ?? "", r.qualifica ?? ""].join("|");

/**
 * Mappa chiave naturale → id per TUTTE le righe esistenti (colonne chiave, non *).
 * Il dataset è di riferimento (centinaia/poche migliaia di righe): un fetch
 * unico è più robusto di N query per-riga. Cap PostgREST: .range esplicito.
 */
async function fetchExistingKeyMap(): Promise<Map<string, string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("manodopera_tariffa")
    .select("id,regione,provincia,anno,qualifica")
    .range(0, 4999);
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; regione: string | null; provincia: string | null; anno: number | null; qualifica: string | null }>) {
    map.set(naturalKey(row), row.id);
  }
  return map;
}

// Sentinel per i Select "tutte" (Radix Select non accetta value="" ).
const ALL = "__all__";

// ─── Form riga ───────────────────────────────────────────────────────────────

interface RigaForm {
  regione: string;
  provincia: string;
  anno: string;
  qualifica: string;
  costo_orario: string;
  fonte: string;
}

const EMPTY_FORM: RigaForm = {
  regione: "",
  provincia: "",
  anno: String(ANNO_CORRENTE),
  qualifica: "",
  costo_orario: "",
  fonte: "",
};

function formFromRow(row: ManodoperaTariffa): RigaForm {
  return {
    regione: row.regione ?? "",
    provincia: row.provincia ?? "",
    anno: row.anno != null ? String(row.anno) : "",
    qualifica: row.qualifica ?? "",
    costo_orario: row.costo_orario != null ? String(row.costo_orario).replace(".", ",") : "",
    fonte: row.fonte ?? "",
  };
}

// ─── Import CSV (regione/provincia/anno/qualifica/costo) ──────────────────────

interface CsvParsed {
  rows: ManodoperaTariffaInput[];
  errors: string[];
}

/** Normalizza una qualifica testuale al valore canonico (alias minimi). */
function normalizeQualifica(raw: string): QualificaManodopera | null {
  const k = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if ((QUALIFICHE_ORDINE as string[]).includes(k)) return k as QualificaManodopera;
  if (k === "4_livello" || k === "quarto" || k === "iv_livello") return "quarto_livello";
  if (k === "comune" || k === "manovale") return "comune";
  return null;
}

/** Parser CSV semplice: header regione/provincia/anno/qualifica/costo (`;` o `,`). */
function parseCsv(text: string): CsvParsed {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const errors: string[] = [];
  const rows: ManodoperaTariffaInput[] = [];

  (parsed.data ?? []).forEach((rec, i) => {
    const line = i + 2; // header = riga 1
    const regione = (rec.regione ?? "").trim();
    const provincia = (rec.provincia ?? "").trim();
    const annoRaw = (rec.anno ?? "").trim();
    const qualRaw = (rec.qualifica ?? "").trim();
    const costoRaw = (rec.costo ?? rec.costo_orario ?? "").trim();

    if (!regione && !provincia && !annoRaw && !qualRaw && !costoRaw) return; // riga vuota

    const anno = annoRaw ? Number(annoRaw) : null;
    if (annoRaw && (!Number.isFinite(anno) || (anno ?? 0) <= 0)) {
      errors.push(`Riga ${line}: anno non valido ("${annoRaw}").`);
      return;
    }
    const qualifica = qualRaw ? normalizeQualifica(qualRaw) : null;
    if (qualRaw && !qualifica) {
      errors.push(`Riga ${line}: qualifica non riconosciuta ("${qualRaw}").`);
      return;
    }
    const costo = costoRaw ? parseItalianNumber(costoRaw) : null;
    if (costoRaw && (costo === null || costo < 0)) {
      errors.push(`Riga ${line}: costo non valido ("${costoRaw}").`);
      return;
    }

    // Campi minimi per una riga UTILE al lookup: regione+qualifica+anno+costo.
    // Prima righe monche entravano in silenzio (costo null = riga inutile).
    if (!regione || !qualifica || anno == null || costo == null || costo <= 0) {
      errors.push(`Riga ${line}: servono regione, qualifica, anno e costo > 0.`);
      return;
    }
    if (anno < 2000 || anno > new Date().getFullYear() + 1) {
      errors.push(`Riga ${line}: anno fuori range (${anno}).`);
      return;
    }

    rows.push({
      regione,
      provincia: provincia ? provincia.toUpperCase() : null,
      anno,
      qualifica,
      costo_orario: costo,
      fonte: (rec.fonte ?? "").trim() || null,
    });
  });

  return { rows, errors };
}

export default function ManodoperaTariffe() {
  const { permissions } = useSuperAdminPermissions();

  // Filtri (sentinel ALL = nessun filtro).
  const [filtroRegione, setFiltroRegione] = useState<string>(ALL);
  const [filtroProvincia, setFiltroProvincia] = useState<string>("");
  const [filtroAnno, setFiltroAnno] = useState<string>("");

  const filtri = useMemo<ManodoperaFiltri>(() => {
    const f: ManodoperaFiltri = {};
    if (filtroRegione !== ALL) f.regione = filtroRegione;
    if (filtroProvincia.trim()) f.provincia = filtroProvincia.trim();
    const a = Number(filtroAnno);
    if (filtroAnno.trim() && Number.isFinite(a)) f.anno = a;
    return f;
  }, [filtroRegione, filtroProvincia, filtroAnno]);

  const { data: tariffe, isLoading, error } = useManodoperaTariffe(filtri);
  const upsert = useUpsertManodoperaTariffa();
  const del = useDeleteManodoperaTariffa();

  // Stato form (dialog aggiungi/modifica).
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RigaForm>(EMPTY_FORM);
  const setField = <K extends keyof RigaForm>(key: K, value: RigaForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Stato eliminazione.
  const [toDelete, setToDelete] = useState<ManodoperaTariffa | null>(null);

  // Stato import CSV.
  const [importErrors, setImportErrors] = useState<string[]>([]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: ManodoperaTariffa) {
    setEditingId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function handleSubmit() {
    if (!form.regione) {
      toast.error("La regione è obbligatoria.");
      return;
    }
    if (!form.qualifica) {
      toast.error("La qualifica è obbligatoria.");
      return;
    }
    // Anno, costo e fonte OBBLIGATORI: il guardrail in testa alla pagina li
    // impone ("attribuzione di fonte e anno") e una tariffa senza costo è una
    // riga inutile per il lookup azienda. Prima si salvavano null in silenzio.
    const anno = Number(form.anno);
    if (!form.anno.trim() || !Number.isFinite(anno) || anno < ANNO_MIN || anno > ANNO_MAX) {
      toast.error(`Anno obbligatorio (tra ${ANNO_MIN} e ${ANNO_MAX}).`);
      return;
    }
    const costo = parseItalianNumber(form.costo_orario);
    if (!form.costo_orario.trim() || costo === null || costo <= 0) {
      toast.error("Costo orario obbligatorio (maggiore di zero, es. 32,50).");
      return;
    }
    if (costo > 500) {
      toast.error("Costo orario fuori scala (max 500 €/h): controlla il separatore decimale.");
      return;
    }
    if (!form.fonte.trim()) {
      toast.error("La fonte è obbligatoria (es. Cassa Edile MI — tabelle 2026).");
      return;
    }

    const input: ManodoperaTariffaInput = {
      id: editingId ?? undefined,
      regione: form.regione,
      provincia: form.provincia.trim().toUpperCase() || null,
      anno,
      qualifica: form.qualifica as QualificaManodopera,
      costo_orario: costo,
      fonte: form.fonte.trim(),
    };

    // Anti-duplicato (nessun UNIQUE a DB): su INSERT risolviamo la chiave
    // naturale su una riga esistente e la aggiorniamo invece di duplicarla.
    let resolvedId = input.id;
    let dedupNote = false;
    if (!resolvedId) {
      try {
        const keyMap = await fetchExistingKeyMap();
        const existing = keyMap.get(naturalKey(input));
        if (existing) {
          resolvedId = existing;
          dedupNote = true;
        }
      } catch {
        // Il check è una protezione best-effort: se fallisce si procede con
        // l'insert come prima (nessun blocco del flusso di lavoro).
      }
    }

    upsert.mutate({ ...input, id: resolvedId }, {
      onSuccess: () => {
        toast.success(
          editingId
            ? "Tariffa aggiornata"
            : dedupNote
              ? "Esisteva già una tariffa per questa combinazione: aggiornata (nessun duplicato)."
              : "Tariffa aggiunta",
        );
        setFormOpen(false);
      },
      onError: (err) =>
        toast.error("Salvataggio fallito", {
          description: err instanceof Error ? err.message : "Errore sconosciuto.",
        }),
    });
  }

  function confirmDelete() {
    if (!toDelete) return;
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success("Tariffa eliminata");
        setToDelete(null);
      },
      onError: (err) =>
        toast.error("Eliminazione fallita", {
          description: err instanceof Error ? err.message : "Errore sconosciuto.",
        }),
    });
  }

  // Import CSV: legge, valida, deduplica (nel file e contro il DB) e scrive.
  // Reimportare lo stesso CSV aggiorna le righe esistenti invece di duplicarle.
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // consenti re-upload dello stesso file
    if (!file || importing) return;
    setImportErrors([]);
    setImporting(true);
    try {
      const text = await file.text();
      const { rows, errors } = parseCsv(text);
      if (rows.length === 0) {
        setImportErrors(errors.length ? errors : ["Nessuna riga valida nel CSV."]);
        toast.error("Import CSV: nessuna riga valida.");
        return;
      }
      // Dedup DENTRO il file (ultima occorrenza vince) + chiavi già a DB.
      const byKey = new Map<string, ManodoperaTariffaInput>();
      for (const row of rows) byKey.set(naturalKey(row), row);
      const unique = [...byKey.values()];
      if (unique.length < rows.length) {
        errors.push(`${rows.length - unique.length} righe duplicate nel file: tenuta l'ultima occorrenza.`);
      }
      let keyMap = new Map<string, string>();
      try {
        keyMap = await fetchExistingKeyMap();
      } catch {
        errors.push("Controllo duplicati non disponibile: le righe verranno inserite senza dedup contro il DB.");
      }

      let inserted = 0;
      let updated = 0;
      setImportProgress({ done: 0, total: unique.length });
      for (const row of unique) {
        try {
          const existingId = keyMap.get(naturalKey(row));
          await upsert.mutateAsync(existingId ? { ...row, id: existingId } : row);
          if (existingId) updated++;
          else inserted++;
        } catch (err) {
          errors.push(
            `Scrittura fallita (${row.regione ?? "—"}/${row.qualifica ?? "—"}): ` +
              (err instanceof Error ? err.message : "errore"),
          );
        }
        setImportProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
      setImportErrors(errors);
      toast.success(`Import CSV: ${inserted} nuove, ${updated} aggiornate`, {
        description: errors.length ? `${errors.length} avvisi/righe scartate.` : undefined,
      });
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : "Errore nella lettura del file."]);
      toast.error("Import CSV fallito.");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  // Export CSV delle righe correnti (filtri applicati): round-trip con lo
  // stesso formato dell'import. Celle in sicurezza (formula-injection + quoting).
  function handleExportCsv(rows: ManodoperaTariffa[]) {
    const header = ["regione", "provincia", "anno", "qualifica", "costo", "fonte"].join(";");
    const lines = rows.map((r) =>
      [
        escapeCsvCell(r.regione),
        escapeCsvCell(r.provincia),
        escapeCsvCell(r.anno),
        escapeCsvCell(r.qualifica),
        // costo col separatore decimale italiano, come l'import si aspetta
        escapeCsvCell(r.costo_orario != null ? String(r.costo_orario).replace(".", ",") : ""),
        escapeCsvCell(r.fonte),
      ].join(";"),
    );
    const blob = new Blob(["﻿" + [header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manodopera-tariffe-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Esportate ${rows.length} tariffe.`);
  }

  // Adeguamento % in blocco sulle righe correnti (filtri + ricerca applicati):
  // il caso d'uso annuale "tutte le tariffe 2025 +3,2% → 2026" oggi impossibile
  // se non riga per riga. Arrotonda al centesimo.
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustPct, setAdjustPct] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  async function handleBulkAdjust(rows: ManodoperaTariffa[]) {
    const pct = parseItalianNumber(adjustPct);
    if (pct === null || pct === 0 || Math.abs(pct) > 100) {
      toast.error("Percentuale non valida (da -100 a +100, es. 3,2).");
      return;
    }
    const target = rows.filter((r) => r.costo_orario != null);
    if (target.length === 0) {
      toast.error("Nessuna tariffa con costo tra le righe visibili.");
      return;
    }
    setAdjusting(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const r of target) {
        const nuovo = Math.round((Number(r.costo_orario) * (1 + pct / 100)) * 100) / 100;
        try {
          await upsert.mutateAsync({
            id: r.id,
            regione: r.regione,
            provincia: r.provincia,
            anno: r.anno,
            qualifica: r.qualifica,
            costo_orario: nuovo,
            fonte: r.fonte,
          });
          ok++;
        } catch {
          failed++;
        }
      }
      if (failed === 0) toast.success(`Adeguamento ${pct > 0 ? "+" : ""}${adjustPct}% applicato a ${ok} tariffe.`);
      else toast.warning(`Adeguamento applicato a ${ok} tariffe, ${failed} fallite.`);
      setAdjustOpen(false);
      setAdjustPct("");
    } finally {
      setAdjusting(false);
    }
  }

  // Ricerca testuale client-side sulle righe caricate (fonte/regione/provincia/qualifica).
  const [search, setSearch] = useState("");
  const visibleRows = useMemo(() => {
    const rows = tariffe ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.regione, r.provincia, r.fonte, r.qualifica ? QUALIFICA_LABEL[r.qualifica] : null, r.anno != null ? String(r.anno) : null]
        .some((v) => v && v.toLowerCase().includes(q)),
    );
  }, [tariffe, search]);

  const hasActiveFilter =
    filtroRegione !== ALL || filtroProvincia.trim() !== "" || filtroAnno.trim() !== "" || search.trim() !== "";

  function resetFilters() {
    setFiltroRegione(ALL);
    setFiltroProvincia("");
    setFiltroAnno("");
    setSearch("");
  }

  // Gate UI: stessa permission super-admin di PrezzariRegionali. La route è già
  // protetta da RequireSuperAdmin.
  if (!permissions.can_manage_companies) return <AccessDenied />;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-sidebar-primary/10 p-2">
          <HardHat className="h-6 w-6 text-sidebar-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manodopera (costo orario)</h1>
          <p className="text-sm text-muted-foreground">
            Tariffe orarie ufficiali della manodopera edile, per regione/provincia, anno e qualifica.
          </p>
        </div>
      </div>

      {/* Guardrail */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Solo tariffe ufficiali</AlertTitle>
        <AlertDescription>
          Inserisci esclusivamente costi orari ufficiali (contratti collettivi, tabelle provinciali,
          prezzari regionali) con attribuzione di fonte e anno.
        </AlertDescription>
      </Alert>

      {/* Toolbar: filtri + azioni */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              Tariffe
              {!isLoading && !error && (
                <Badge variant="secondary" className="tabular-nums">{visibleRows.length}</Badge>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdjustOpen(true)}
                disabled={visibleRows.length === 0 || importing}
                title="Adegua di una percentuale il costo orario delle righe visibili"
              >
                <Percent className="mr-2 h-4 w-4" /> Adegua %
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => handleExportCsv(visibleRows)}
                disabled={visibleRows.length === 0}
                title="Esporta le righe visibili in CSV (stesso formato dell'import)"
              >
                <Download className="mr-2 h-4 w-4" /> Esporta CSV
              </Button>
              <Button asChild variant="outline" size="sm" disabled={importing}>
                <label className={importing ? "cursor-not-allowed opacity-60" : "cursor-pointer"}>
                  {importing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  {importing && importProgress
                    ? `Importo… ${importProgress.done}/${importProgress.total}`
                    : "Importa CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsv}
                    disabled={importing}
                  />
                </label>
              </Button>
              <Button size="sm" onClick={openCreate} disabled={importing}>
                <Plus className="mr-2 h-4 w-4" /> Aggiungi tariffa
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Filtra per regione, provincia o anno. CSV atteso: colonne
            {" "}<code>regione;provincia;anno;qualifica;costo</code> (qualifica:
            comune / qualificato / specializzato / quarto_livello).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtri */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="f-search">Cerca</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="f-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Fonte, regione, qualifica…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-regione">Regione</Label>
              <Select value={filtroRegione} onValueChange={setFiltroRegione}>
                <SelectTrigger id="f-regione">
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tutte le regioni</SelectItem>
                  {REGIONI_ITALIANE.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-provincia">Provincia</Label>
              <Input
                id="f-provincia"
                value={filtroProvincia}
                onChange={(e) => setFiltroProvincia(e.target.value)}
                placeholder="es. MI"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-anno">Anno</Label>
              <Input
                id="f-anno"
                type="number"
                inputMode="numeric"
                value={filtroAnno}
                onChange={(e) => setFiltroAnno(e.target.value)}
                placeholder="Tutti"
              />
            </div>
            <div className="flex items-end">
              {hasActiveFilter && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <X className="mr-2 h-4 w-4" /> Azzera filtri
                </Button>
              )}
            </div>
          </div>

          {/* Errori import */}
          {importErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Import CSV — righe scartate</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {importErrors.slice(0, 10).map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
                {importErrors.length > 10 && (
                  <p className="mt-1 text-xs">…e altre {importErrors.length - 10}.</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Tabella */}
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento tariffe…
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error instanceof Error ? error.message : "Errore nel caricamento delle tariffe."}
              </AlertDescription>
            </Alert>
          ) : visibleRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hasActiveFilter
                ? "Nessuna tariffa per i filtri selezionati."
                : "Nessuna tariffa inserita. Usa “Aggiungi tariffa” o importa un CSV."}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Regione</TableHead>
                    <TableHead className="w-[110px]">Provincia</TableHead>
                    <TableHead className="w-[80px]">Anno</TableHead>
                    <TableHead>Qualifica</TableHead>
                    <TableHead className="w-[120px] text-right">Costo €/h</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead className="w-[110px] text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.regione ?? "—"}</TableCell>
                      <TableCell>{row.provincia ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{row.anno ?? "—"}</TableCell>
                      <TableCell>
                        {row.qualifica ? (
                          <Badge variant="secondary">{QUALIFICA_LABEL[row.qualifica]}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.costo_orario != null ? formatCurrency(Number(row.costo_orario)) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate" title={row.fonte ?? undefined}>
                        {row.fonte ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(row)}
                            title="Modifica"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setToDelete(row)}
                            title="Elimina"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog aggiungi/modifica */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifica tariffa" : "Aggiungi tariffa"}</DialogTitle>
            <DialogDescription>
              Costo orario ufficiale per ambito geografico, anno e qualifica.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="regione">Regione *</Label>
              <Select value={form.regione} onValueChange={(v) => setField("regione", v)}>
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
              <Label htmlFor="provincia">Provincia</Label>
              <Input
                id="provincia"
                value={form.provincia}
                onChange={(e) => setField("provincia", e.target.value)}
                placeholder="es. MI"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="anno">Anno</Label>
              <Input
                id="anno"
                type="number"
                inputMode="numeric"
                value={form.anno}
                onChange={(e) => setField("anno", e.target.value)}
                placeholder={String(ANNO_CORRENTE)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qualifica">Qualifica *</Label>
              <Select value={form.qualifica} onValueChange={(v) => setField("qualifica", v)}>
                <SelectTrigger id="qualifica">
                  <SelectValue placeholder="Seleziona qualifica" />
                </SelectTrigger>
                <SelectContent>
                  {QUALIFICHE_ORDINE.map((q) => (
                    <SelectItem key={q} value={q}>{QUALIFICA_LABEL[q]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="costo">Costo orario (€/h)</Label>
              <Input
                id="costo"
                inputMode="decimal"
                value={form.costo_orario}
                onChange={(e) => setField("costo_orario", e.target.value)}
                placeholder="es. 32,50"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fonte">Fonte</Label>
              <Input
                id="fonte"
                value={form.fonte}
                onChange={(e) => setField("fonte", e.target.value)}
                placeholder="es. Cassa Edile MI — tabelle 2026"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={upsert.isPending}>
              Annulla
            </Button>
            <Button onClick={handleSubmit} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Salva modifiche" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adeguamento % in blocco (righe visibili) */}
      <Dialog open={adjustOpen} onOpenChange={(o) => { if (!adjusting) setAdjustOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adegua i costi orari (%)</DialogTitle>
            <DialogDescription>
              Applica una variazione percentuale al costo orario delle{" "}
              <strong>{visibleRows.filter((r) => r.costo_orario != null).length}</strong> tariffe
              visibili (filtri e ricerca attuali). Arrotondamento al centesimo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="adjust-pct">Variazione % (es. 3,2 oppure -1,5)</Label>
            <Input
              id="adjust-pct"
              inputMode="decimal"
              value={adjustPct}
              onChange={(e) => setAdjustPct(e.target.value)}
              placeholder="es. 3,2"
              autoFocus
            />
            {(() => {
              const pct = parseItalianNumber(adjustPct);
              const sample = visibleRows.find((r) => r.costo_orario != null);
              if (pct === null || pct === 0 || !sample) return null;
              const nuovo = Math.round((Number(sample.costo_orario) * (1 + pct / 100)) * 100) / 100;
              return (
                <p className="text-xs text-muted-foreground">
                  Esempio: {formatCurrency(Number(sample.costo_orario))} → <strong>{formatCurrency(nuovo)}</strong>
                </p>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={adjusting}>
              Annulla
            </Button>
            <Button onClick={() => handleBulkAdjust(visibleRows)} disabled={adjusting || !adjustPct.trim()}>
              {adjusting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Applica adeguamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conferma eliminazione */}
      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la tariffa?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && (
                <>
                  {toDelete.regione ?? "—"}
                  {toDelete.provincia ? ` (${toDelete.provincia})` : ""} ·{" "}
                  {toDelete.anno ?? "—"} ·{" "}
                  {toDelete.qualifica ? QUALIFICA_LABEL[toDelete.qualifica] : "—"}. L'operazione non è
                  reversibile.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
