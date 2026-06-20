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

const ANNO_CORRENTE = new Date().getFullYear();

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

    rows.push({
      regione: regione || null,
      provincia: provincia || null,
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

  function handleSubmit() {
    if (!form.regione) {
      toast.error("La regione è obbligatoria.");
      return;
    }
    if (!form.qualifica) {
      toast.error("La qualifica è obbligatoria.");
      return;
    }
    const anno = form.anno.trim() ? Number(form.anno) : null;
    if (form.anno.trim() && (!Number.isFinite(anno) || (anno ?? 0) <= 0)) {
      toast.error("Anno non valido.");
      return;
    }
    const costo = form.costo_orario.trim() ? parseItalianNumber(form.costo_orario) : null;
    if (form.costo_orario.trim() && (costo === null || costo < 0)) {
      toast.error("Costo orario non valido.");
      return;
    }

    const input: ManodoperaTariffaInput = {
      id: editingId ?? undefined,
      regione: form.regione,
      provincia: form.provincia.trim() || null,
      anno,
      qualifica: form.qualifica as QualificaManodopera,
      costo_orario: costo,
      fonte: form.fonte.trim() || null,
    };
    upsert.mutate(input, {
      onSuccess: () => {
        toast.success(editingId ? "Tariffa aggiornata" : "Tariffa aggiunta");
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

  // Import CSV: legge, valida, inserisce le righe valide in sequenza.
  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // consenti re-upload dello stesso file
    if (!file) return;
    setImportErrors([]);
    try {
      const text = await file.text();
      const { rows, errors } = parseCsv(text);
      if (rows.length === 0) {
        setImportErrors(errors.length ? errors : ["Nessuna riga valida nel CSV."]);
        toast.error("Import CSV: nessuna riga valida.");
        return;
      }
      let ok = 0;
      for (const row of rows) {
        try {
          await upsert.mutateAsync(row);
          ok++;
        } catch (err) {
          errors.push(
            `Inserimento fallito (${row.regione ?? "—"}/${row.qualifica ?? "—"}): ` +
              (err instanceof Error ? err.message : "errore"),
          );
        }
      }
      setImportErrors(errors);
      toast.success(`Import CSV completato: ${ok} righe inserite`, {
        description: errors.length ? `${errors.length} righe scartate/fallite.` : undefined,
      });
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : "Errore nella lettura del file."]);
      toast.error("Import CSV fallito.");
    }
  }

  const hasActiveFilter =
    filtroRegione !== ALL || filtroProvincia.trim() !== "" || filtroAnno.trim() !== "";

  function resetFilters() {
    setFiltroRegione(ALL);
    setFiltroProvincia("");
    setFiltroAnno("");
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
            <span>Tariffe</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <label className="cursor-pointer">
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Importa CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsv}
                  />
                </label>
              </Button>
              <Button size="sm" onClick={openCreate}>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          ) : !tariffe || tariffe.length === 0 ? (
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
                  {tariffe.map((row) => (
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
                        {row.costo_orario != null ? `€ ${Number(row.costo_orario).toFixed(2)}` : "—"}
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
