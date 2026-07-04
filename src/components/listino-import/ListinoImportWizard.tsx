/**
 * Sprint C — Catalogo Esteso
 * Wizard di import listini da Excel/CSV in 4 step.
 *
 *  1. Scegli tipo (prodotti / famiglie / tariffe) e scarica template
 *  2. Carica file → parser → preview + errori/warn
 *  3. Risoluzione categorie/fornitori/famiglie (fuzzy match)
 *  4. Conferma → chiamata Edge Function catalog-import-batch
 */
import { useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCompanyCustomFields,
  type CatalogObjectType,
} from "@/hooks/useCompanyCustomFields";
import {
  downloadListinoTemplateXlsx,
  downloadListinoTemplateCsv,
} from "@/lib/catalogo/listinoTemplate";
import {
  parseListinoFile,
  summarizeParsedRows,
  type ParsedRow,
} from "@/lib/catalogo/listinoParser";

type Step = 1 | 2 | 3 | 4;

export interface ListinoImportWizardProps {
  onComplete?: (imported: number) => void;
}

export function ListinoImportWizard({ onComplete }: ListinoImportWizardProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [step, setStep] = useState<Step>(1);
  const [objectType, setObjectType] = useState<CatalogObjectType>("product");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const { data: customFields = [] } = useCompanyCustomFields(objectType);

  const summary = useMemo(() => summarizeParsedRows(rows), [rows]);

  /* ────────────────── Step 1 — scelta tipo + template ────────────────── */
  const handleDownloadXlsx = useCallback(async () => {
    try {
      await downloadListinoTemplateXlsx({ objectType, customFields });
      toast.success("Template scaricato");
    } catch (e: any) {
      toast.error(`Errore download: ${e.message ?? e}`);
    }
  }, [objectType, customFields]);

  const handleDownloadCsv = useCallback(() => {
    try {
      downloadListinoTemplateCsv({ objectType, customFields });
      toast.success("Template CSV scaricato");
    } catch (e: any) {
      toast.error(`Errore download: ${e.message ?? e}`);
    }
  }, [objectType, customFields]);

  /* ────────────────── Step 2 — upload + parse ────────────────── */
  const handleFileChange = useCallback(
    async (f: File | null) => {
      setFile(f);
      setRows([]);
      if (!f) return;
      setParsing(true);
      try {
        const parsed = await parseListinoFile(f, { objectType, customFields });
        setRows(parsed);
        if (parsed.length === 0) {
          toast.warning("Nessuna riga rilevata nel file");
        } else {
          toast.success(`${parsed.length} righe lette`);
        }
      } catch (e: any) {
        toast.error(`Errore parsing: ${e.message ?? e}`);
      } finally {
        setParsing(false);
      }
    },
    [objectType, customFields],
  );

  /* ────────────────── Step 4 — submit ────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!companyId) {
      toast.error("Azienda non identificata");
      return;
    }
    const validRows = rows.filter((r) => r.errors.length === 0);
    if (!validRows.length) {
      toast.error("Nessuna riga valida da importare");
      return;
    }
    setSubmitting(true);
    setProgress(5);
    try {
      const payload = {
        object_type: objectType,
        rows: validRows.map((r) => ({
          ...r.normalized,
          custom_field_values: r.customFieldValues,
        })),
      };
      setProgress(30);
      const { data, error } = await supabase.functions.invoke("catalog-import-batch", {
        body: payload,
      });
      setProgress(90);
      // M-I (audit): error.message di FunctionsHttpError è il generico
      // "Edge Function returned a non-2xx status code" — il motivo vero
      // è nel body via error.context.
      if (error) throw new Error(await edgeErrorMessage(error, "Import non riuscito"));
      setProgress(100);
      // M-G (audit): l'edge risponde anche con skipped/errors — prima venivano
      // ignorati e l'utente vedeva "Importati N record" anche con metà righe
      // scartate lato server (duplicati, chunk falliti).
      const result = data as {
        inserted?: number;
        updated?: number;
        skipped?: number;
        errors?: Array<{ row: number; error: string }>;
      } | null;
      const inserted = result?.inserted ?? validRows.length;
      const updated = result?.updated ?? 0;
      const skipped = result?.skipped ?? 0;
      const serverErrors = result?.errors ?? [];
      const okLabel =
        updated > 0
          ? `Importati ${inserted} nuovi record · ${updated} aggiornati`
          : `Importati ${inserted} record`;
      if (skipped > 0 || serverErrors.length > 0) {
        toast.warning(`${okLabel} · ${skipped} scartati`, {
          description: serverErrors
            .slice(0, 3)
            .map((e) => `Riga ${e.row}: ${e.error}`)
            .join(" — ")
            .concat(serverErrors.length > 3 ? ` (+${serverErrors.length - 3} altri)` : ""),
          duration: 10000,
        });
      } else {
        toast.success(okLabel);
      }
      onComplete?.(inserted + updated);
      // Reset
      setStep(1);
      setFile(null);
      setRows([]);
    } catch (e: any) {
      toast.error(`Errore import: ${e.message ?? e}`);
    } finally {
      setSubmitting(false);
      setTimeout(() => setProgress(0), 1500);
    }
  }, [rows, objectType, companyId, onComplete]);

  /* ────────────────── Navigation guards ────────────────── */
  const canNext =
    (step === 1 && !!objectType) ||
    (step === 2 && rows.length > 0 && !parsing) ||
    (step === 3 && summary.valid > 0);

  const stepLabel =
    step === 1
      ? "1 · Scelta tipo e template"
      : step === 2
      ? "2 · Caricamento file"
      : step === 3
      ? "3 · Anteprima e validazione"
      : "4 · Conferma import";

  /* ────────────────── render ────────────────── */
  return (
    <Card className="max-w-5xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Import Listini</CardTitle>
          <p className="text-xs text-muted-foreground">{stepLabel}</p>
        </div>
        <Badge variant="outline">Step {step}/4</Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ════════ STEP 1 ════════ */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo di dati da importare</Label>
              <Select value={objectType} onValueChange={(v) => setObjectType(v as CatalogObjectType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Prodotti / Articoli</SelectItem>
                  <SelectItem value="family">Famiglie Prodotto</SelectItem>
                  <SelectItem value="tariffa">Tariffe / Manodopera</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Il template include le colonne fisse + i campi personalizzati configurati per questo tipo
                ({customFields.length} custom field{customFields.length === 1 ? "" : "s"}).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownloadXlsx}>
                <Download className="h-4 w-4 mr-2" />
                Scarica template Excel
              </Button>
              <Button variant="outline" onClick={handleDownloadCsv}>
                <Download className="h-4 w-4 mr-2" />
                Template CSV
              </Button>
            </div>

            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertTitle>Come compilare</AlertTitle>
              <AlertDescription className="text-xs">
                Le colonne con <code>*</code> sono obbligatorie. Le date devono essere in formato
                AAAA-MM-GG. Per i campi select usa uno dei valori ammessi (vedi foglio "Istruzioni").
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ════════ STEP 2 ════════ */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="listino-file">File Excel (.xlsx) o CSV</Label>
              <Input
                id="listino-file"
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                disabled={parsing}
              />
            </div>

            {parsing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Parsing in corso…
              </div>
            )}

            {file && !parsing && rows.length > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>
                  {file.name} — {rows.length} righe lette
                </AlertTitle>
                <AlertDescription className="text-xs">
                  Valide: {summary.valid} · Con errori: {summary.withErrors} · Con warning: {summary.withWarnings}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ════════ STEP 3 ════════ */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Righe totali" value={summary.total} />
              <StatCard label="Valide" value={summary.valid} tone="success" />
              <StatCard label="Con errori" value={summary.withErrors} tone="danger" />
              <StatCard label="Con warning" value={summary.withWarnings} tone="warn" />
            </div>

            <div className="max-h-96 overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Stato</th>
                    <th className="p-2 text-left">Dati</th>
                    <th className="p-2 text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r) => (
                    <tr key={r.rowIndex} className="border-t">
                      <td className="p-2 align-top text-muted-foreground">{r.rowIndex}</td>
                      <td className="p-2 align-top">
                        {r.errors.length > 0 ? (
                          <Badge variant="destructive">Errore</Badge>
                        ) : r.warnings.length > 0 ? (
                          <Badge className="bg-amber-500 text-white">Warning</Badge>
                        ) : (
                          <Badge className="bg-emerald-500 text-white">OK</Badge>
                        )}
                      </td>
                      <td className="p-2 align-top">
                        <code className="text-[10px]">
                          {truncate(
                            Object.entries(r.normalized)
                              .filter(([, v]) => v !== null && v !== "")
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(" · "),
                            140,
                          )}
                        </code>
                      </td>
                      <td className="p-2 align-top">
                        {r.errors.map((e, i) => (
                          <div key={i} className="text-destructive">{e}</div>
                        ))}
                        {r.warnings.map((w, i) => (
                          <div key={`w${i}`} className="text-amber-700 dark:text-amber-400">
                            {w}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {rows.length > 200 && (
                    <tr>
                      <td colSpan={4} className="p-2 text-center text-muted-foreground">
                        … e altre {rows.length - 200} righe (non mostrate)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {summary.withErrors > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Attenzione</AlertTitle>
                <AlertDescription>
                  Le righe con errori verranno escluse dall'import. Torna indietro per correggere il file.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ════════ STEP 4 ════════ */}
        {step === 4 && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Conferma import</AlertTitle>
              <AlertDescription>
                Stai per importare <strong>{summary.valid}</strong> record di tipo{" "}
                <strong>{objectType}</strong>. L'operazione è reversibile solo eliminando i record
                manualmente.
              </AlertDescription>
            </Alert>

            {submitting && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">Import in corso…</p>
              </div>
            )}
          </div>
        )}

        {/* ════════ Navigation ════════ */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="ghost"
            disabled={step === 1 || submitting}
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
          >
            Indietro
          </Button>
          {step < 4 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => ((s + 1) as Step))}>
              Avanti
            </Button>
          ) : (
            <Button disabled={submitting || summary.valid === 0} onClick={handleSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importazione…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importa {summary.valid} record
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger" | "warn";
}) {
  const cls =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "danger"
      ? "text-destructive"
      : tone === "warn"
      ? "text-amber-700 dark:text-amber-300"
      : "text-foreground";
  return (
    <div className="border rounded-md p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
