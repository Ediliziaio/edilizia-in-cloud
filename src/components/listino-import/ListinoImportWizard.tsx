/**
 * Sprint C — Catalogo Esteso
 * Wizard di import listini da Excel/CSV in 4 step.
 *
 *  1. Scegli cosa importi (catalogo articoli / prodotti del Listino / manodopera e servizi) e scarica il modello
 *  2. Carica il file → lettura → anteprima, errori e avvisi
 *  3. Controllo delle righe
 *  4. Conferma → chiamata Edge Function catalog-import-batch
 *
 * Il tipo che parte preselezionato è «Catalogo articoli» (decisione D1 di Florin ancora aperta): in ogni passo si
 * dice dove vanno i dati davvero (vedi `destinazioniImport.ts`).
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
  FIXED_COLUMNS,
} from "@/lib/catalogo/listinoTemplate";
import {
  DESTINAZIONI_IMPORT,
  contaElementi,
  fraseConferma,
  nomiColonneNonLette,
} from "@/lib/catalogo/destinazioniImport";
import { testoErrore } from "@/lib/impostazioni/testoErrore";
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
  const destinazione = DESTINAZIONI_IMPORT[objectType];
  // Nell'anteprima i campi hanno il nome della colonna del modello, non la chiave interna («Prezzo Listino», non list_price).
  const nomiCampi = useMemo(() => new Map(FIXED_COLUMNS[objectType].map((c) => [c.key, c.label] as const)), [objectType]);

  /* ────────────────── Step 1 — scelta tipo + template ────────────────── */
  const handleDownloadXlsx = useCallback(async () => {
    try {
      await downloadListinoTemplateXlsx({ objectType, customFields });
      toast.success("Modello scaricato");
    } catch (e: unknown) {
      toast.error("Non sono riuscito a scaricare il modello", { description: testoErrore(e) });
    }
  }, [objectType, customFields]);

  const handleDownloadCsv = useCallback(() => {
    try {
      downloadListinoTemplateCsv({ objectType, customFields });
      toast.success("Modello CSV scaricato");
    } catch (e: unknown) {
      toast.error("Non sono riuscito a scaricare il modello", { description: testoErrore(e) });
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
      } catch (e: unknown) {
        toast.error("Non riesco a leggere il file", { description: testoErrore(e) });
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
          ? `Importati ${contaElementi(objectType, inserted)} nuovi · ${updated} aggiornati`
          : `Importati ${contaElementi(objectType, inserted)}`;
      if (skipped > 0 || serverErrors.length > 0) {
        toast.warning(`${okLabel} · ${skipped} scartati`, {
          description: serverErrors
            .slice(0, 3)
            .map((e) => `Riga ${e.row}: ${testoErrore(e.error)}`)
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
    } catch (e: unknown) {
      toast.error("Importazione non riuscita", { description: testoErrore(e) });
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
      ? "1 · Cosa importi e modello da compilare"
      : step === 2
      ? "2 · Caricamento del file"
      : step === 3
      ? "3 · Controllo delle righe"
      : "4 · Conferma";

  /* ────────────────── render ────────────────── */
  return (
    <Card className="max-w-5xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Importa da un foglio Excel o CSV</CardTitle>
          <p className="text-xs text-muted-foreground">{stepLabel}</p>
        </div>
        <Badge variant="outline" className="shrink-0 whitespace-nowrap">Passo {step} di 4</Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ════════ STEP 1 ════════ */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="listino-tipo">Cosa stai importando?</Label>
              <Select value={objectType} onValueChange={(v) => setObjectType(v as CatalogObjectType)}>
                <SelectTrigger id="listino-tipo" aria-describedby="listino-tipo-dove">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">{DESTINAZIONI_IMPORT.product.nome}</SelectItem>
                  <SelectItem value="family">{DESTINAZIONI_IMPORT.family.nome}</SelectItem>
                  <SelectItem value="tariffa">{DESTINAZIONI_IMPORT.tariffa.nome}</SelectItem>
                </SelectContent>
              </Select>
              {/* Dove finiscono i dati dipende da questa scelta: si dice sempre, sotto il menu. */}
              <div id="listino-tipo-dove" className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{destinazione.dove}</p>
                {destinazione.attenzione.map((frase) => (
                  <p key={frase}>{frase}</p>
                ))}
                <details>
                  <summary className="cursor-pointer py-0.5">Altri dettagli: se c'è già, colonne ignorate</summary>
                  <div className="mt-1 space-y-1">
                    <p>{destinazione.seEsiste}</p>
                    {nomiColonneNonLette(objectType).length > 0 && (
                      <p>
                        Le colonne del modello che l'importazione non legge: {nomiColonneNonLette(objectType).join(", ")}.
                      </p>
                    )}
                  </div>
                </details>
              </div>
              <p className="text-xs text-muted-foreground">
                Il modello ha le colonne fisse e i campi personalizzati configurati per questo tipo (
                {customFields.length} {customFields.length === 1 ? "campo personalizzato" : "campi personalizzati"}).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownloadXlsx}>
                <Download className="h-4 w-4 mr-2" />
                Scarica il modello Excel
              </Button>
              <Button variant="outline" onClick={handleDownloadCsv}>
                <Download className="h-4 w-4 mr-2" />
                Modello CSV
              </Button>
            </div>

            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertTitle>Come compilare</AlertTitle>
              <AlertDescription className="text-xs">
                Le colonne con <code>*</code> sono obbligatorie. Le date si scrivono AAAA-MM-GG (per esempio
                2026-10-31). Nei campi a scelta usa uno dei valori ammessi: li trovi nel foglio «Istruzioni».
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
                Leggo il file…
              </div>
            )}

            {file && !parsing && rows.length > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>
                  {file.name} — {rows.length} righe lette
                </AlertTitle>
                <AlertDescription className="text-xs">
                  Valide: {summary.valid} · Con errori: {summary.withErrors} · Con avvisi: {summary.withWarnings}
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
              <StatCard label="Con avvisi" value={summary.withWarnings} tone="warn" />
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
                          <Badge className="bg-amber-500 text-white">Avviso</Badge>
                        ) : (
                          <Badge className="bg-emerald-500 text-white">OK</Badge>
                        )}
                      </td>
                      <td className="p-2 align-top">
                        <code className="text-[10px]">
                          {truncate(
                            Object.entries(r.normalized)
                              .filter(([, v]) => v !== null && v !== "")
                              .map(([k, v]) => `${nomiCampi.get(k) ?? k}: ${String(v)}`)
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
                  Le righe con errori non verranno importate. Torna indietro per correggere il file.
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
              <AlertTitle>Conferma</AlertTitle>
              <AlertDescription>
                <strong>{fraseConferma(objectType, summary.valid)}</strong> {destinazione.annullare}
              </AlertDescription>
            </Alert>

            {submitting && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">Importazione in corso…</p>
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
                  Importa {contaElementi(objectType, summary.valid)}
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
