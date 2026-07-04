/**
 * Sprint C — Catalogo Esteso
 * Import listino da PDF via AI (OpenAI GPT-4o).
 *
 * Flow:
 *  1. Upload PDF in bucket "listini-tmp" (path: <user_id>/<timestamp>-<filename>)
 *  2. Chiama Edge Function "ai-listino-extract" → ritorna righe estratte
 *  3. Mostra tabella editabile per revisione manuale
 *  4. Conferma → catalog-import-batch (come il wizard)
 */
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { useAuth } from "@/contexts/AuthContext";
import { Upload, Sparkles, AlertTriangle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import type { CatalogObjectType } from "@/hooks/useCompanyCustomFields";

interface AiExtractedRow {
  code?: string | null;
  name: string;
  category?: string | null;
  unit?: string | null;
  base_price?: number | null;
  list_price?: number | null;
  cost?: number | null;
  vat_rate?: number | null;
  notes?: string | null;
  // Per tariffe:
  nome?: string;
  categoria?: string;
  costo_orario?: number | null;
  prezzo_orario?: number | null;
}

interface ExtractResult {
  rows: AiExtractedRow[];
  confidence: number;
  detected_supplier: string | null;
  tokens: { input: number; output: number };
  cost_cents: number;
}

export interface ListinoAIImportProps {
  onComplete?: (imported: number) => void;
}

export function ListinoAIImport({ onComplete }: ListinoAIImportProps) {
  const { user, effectiveCompany } = useAuth();
  const userId = user?.id;
  const companyId = effectiveCompany?.id;

  const [objectType, setObjectType] = useState<CatalogObjectType>("product");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [rows, setRows] = useState<AiExtractedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const totalCostEur = useMemo(() => (result ? (result.cost_cents / 100).toFixed(4) : "0.00"), [result]);

  /* ────────────────── Upload + Extract ────────────────── */
  const handleStart = useCallback(async () => {
    if (!file || !userId) {
      toast.error("File mancante o non autenticato");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Solo file PDF sono supportati");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File troppo grande (max 50MB)");
      return;
    }

    setUploading(true);
    setProgress(10);
    const storagePath = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    try {
      const { error: upErr } = await supabase.storage
        .from("listini-tmp")
        .upload(storagePath, file, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      setProgress(40);
      setUploading(false);
      setExtracting(true);

      const { data, error } = await supabase.functions.invoke("ai-listino-extract", {
        body: { storage_path: storagePath, object_type: objectType },
      });
      setProgress(90);
      // M-I (audit): error.message di FunctionsHttpError è il generico
      // "Edge Function returned a non-2xx status code" — il motivo vero
      // (PDF illeggibile, quota AI, ecc.) è nel body via error.context.
      if (error) throw new Error(await edgeErrorMessage(error, "Estrazione non riuscita"));
      const res = data as ExtractResult;
      setResult(res);
      setRows(res.rows ?? []);
      setProgress(100);
      toast.success(`${res.rows.length} righe estratte (conf. ${(res.confidence * 100).toFixed(0)}%)`);
    } catch (e: any) {
      toast.error(`Errore AI: ${e.message ?? e}`);
    } finally {
      setUploading(false);
      setExtracting(false);
      setTimeout(() => setProgress(0), 1500);
    }
  }, [file, userId, objectType]);

  /* ────────────────── Manual edit of extracted rows ────────────────── */
  const updateRow = useCallback((idx: number, patch: Partial<AiExtractedRow>) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  }, []);

  const removeRow = useCallback((idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  /* ────────────────── Import ────────────────── */
  const handleImport = useCallback(async () => {
    if (!companyId) {
      toast.error("Azienda non identificata");
      return;
    }
    const validRows = rows.filter((r) => (r.name ?? r.nome ?? "").trim() !== "");
    if (!validRows.length) {
      toast.error("Nessuna riga valida");
      return;
    }
    setImporting(true);
    setProgress(10);
    try {
      const payload = {
        object_type: objectType,
        rows: validRows.map((r) => ({
          ...(objectType === "tariffa"
            ? {
                nome: r.nome ?? r.name,
                categoria: r.categoria ?? r.category,
                costo_orario: r.costo_orario ?? r.cost,
                prezzo_orario: r.prezzo_orario ?? r.list_price,
              }
            : {
                code: r.code,
                name: r.name,
                category: r.category,
                unit: r.unit,
                base_price: r.base_price,
                list_price: r.list_price,
                cost: r.cost,
                vat_rate: r.vat_rate,
                notes: r.notes,
              }),
          custom_field_values: {},
        })),
      };
      setProgress(40);
      const { data, error } = await supabase.functions.invoke("catalog-import-batch", { body: payload });
      setProgress(90);
      if (error) throw new Error(await edgeErrorMessage(error, "Import non riuscito"));
      const importResult = data as { inserted?: number; updated?: number } | null;
      const inserted = importResult?.inserted ?? validRows.length;
      const updated = importResult?.updated ?? 0;
      setProgress(100);
      toast.success(
        updated > 0
          ? `Importati ${inserted} nuovi record dal listino AI · ${updated} aggiornati`
          : `Importati ${inserted} record dal listino AI`,
      );
      onComplete?.(inserted + updated);
      setResult(null);
      setRows([]);
      setFile(null);
    } catch (e: any) {
      toast.error(`Errore import: ${e.message ?? e}`);
    } finally {
      setImporting(false);
      setTimeout(() => setProgress(0), 1500);
    }
  }, [rows, objectType, companyId, onComplete]);

  /* ────────────────── Render ────────────────── */
  return (
    <Card className="max-w-6xl">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Import Listino con AI
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Carica un PDF di listino: l'AI estrae automaticamente le righe. Rivedi prima di confermare.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={objectType} onValueChange={(v) => setObjectType(v as CatalogObjectType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Prodotti / Articoli</SelectItem>
                <SelectItem value="tariffa">Tariffe / Manodopera</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ai-pdf-file">PDF Listino (max 50MB)</Label>
            <Input
              id="ai-pdf-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={uploading || extracting}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleStart}
            disabled={!file || uploading || extracting || importing}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Caricamento…
              </>
            ) : extracting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Estrazione AI…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Estrai con AI
              </>
            )}
          </Button>
        </div>

        {(uploading || extracting || importing) && <Progress value={progress} />}

        {/* Result summary */}
        {result && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>
              Estrazione completata — {result.rows.length} righe · confidence{" "}
              {(result.confidence * 100).toFixed(0)}%
            </AlertTitle>
            <AlertDescription className="text-xs space-y-1">
              {result.detected_supplier && <div>Fornitore rilevato: {result.detected_supplier}</div>}
              <div>
                Token: {result.tokens.input.toLocaleString()} in / {result.tokens.output.toLocaleString()} out · Costo stimato: €{totalCostEur}
              </div>
              {result.confidence < 0.6 && (
                <div className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Confidence bassa: rivedi attentamente prima di importare.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Editable rows table */}
        {rows.length > 0 && (
          <div className="border rounded-md max-h-[500px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2 text-left">#</th>
                  {objectType === "product" ? (
                    <>
                      <th className="p-2 text-left">Codice</th>
                      <th className="p-2 text-left">Descrizione *</th>
                      <th className="p-2 text-left">Cat.</th>
                      <th className="p-2 text-left">UM</th>
                      <th className="p-2 text-right">Base</th>
                      <th className="p-2 text-right">Listino</th>
                      <th className="p-2 text-right">Costo</th>
                      <th className="p-2 text-right">IVA %</th>
                    </>
                  ) : (
                    <>
                      <th className="p-2 text-left">Nome *</th>
                      <th className="p-2 text-left">Categoria</th>
                      <th className="p-2 text-right">Costo/h</th>
                      <th className="p-2 text-right">Prezzo/h</th>
                    </>
                  )}
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-1 text-muted-foreground">{idx + 1}</td>
                    {objectType === "product" ? (
                      <>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs"
                            value={r.code ?? ""}
                            onChange={(e) => updateRow(idx, { code: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs"
                            value={r.name ?? ""}
                            onChange={(e) => updateRow(idx, { name: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs"
                            value={r.category ?? ""}
                            onChange={(e) => updateRow(idx, { category: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs w-14"
                            value={r.unit ?? ""}
                            onChange={(e) => updateRow(idx, { unit: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs text-right w-20"
                            type="number"
                            step="0.01"
                            value={r.base_price ?? ""}
                            onChange={(e) =>
                              updateRow(idx, { base_price: e.target.value === "" ? null : Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs text-right w-20"
                            type="number"
                            step="0.01"
                            value={r.list_price ?? ""}
                            onChange={(e) =>
                              updateRow(idx, { list_price: e.target.value === "" ? null : Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs text-right w-20"
                            type="number"
                            step="0.01"
                            value={r.cost ?? ""}
                            onChange={(e) =>
                              updateRow(idx, { cost: e.target.value === "" ? null : Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs text-right w-16"
                            type="number"
                            step="0.01"
                            value={r.vat_rate ?? ""}
                            onChange={(e) =>
                              updateRow(idx, { vat_rate: e.target.value === "" ? null : Number(e.target.value) })
                            }
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs"
                            value={r.nome ?? r.name ?? ""}
                            onChange={(e) => updateRow(idx, { nome: e.target.value, name: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs"
                            value={r.categoria ?? r.category ?? ""}
                            onChange={(e) => updateRow(idx, { categoria: e.target.value, category: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs text-right w-20"
                            type="number"
                            step="0.01"
                            value={r.costo_orario ?? r.cost ?? ""}
                            onChange={(e) =>
                              updateRow(idx, {
                                costo_orario: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-7 text-xs text-right w-20"
                            type="number"
                            step="0.01"
                            value={r.prezzo_orario ?? r.list_price ?? ""}
                            onChange={(e) =>
                              updateRow(idx, {
                                prezzo_orario: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                      </>
                    )}
                    <td className="p-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => removeRow(idx)}
                        title="Rimuovi riga"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              <Badge variant="outline">{rows.length} righe</Badge>
            </div>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importazione…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importa {rows.length} record
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
