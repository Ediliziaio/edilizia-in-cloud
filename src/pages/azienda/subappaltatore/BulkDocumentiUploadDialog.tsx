/**
 * BulkDocumentiUploadDialog — importazione massiva documenti subappaltatore (P1).
 *
 * Carica un .zip (o più file insieme), pre-classifica ogni documento nella
 * tassonomia reale `TipoDocumentoSub` e prova a dedurre la scadenza dal nome.
 * L'utente RIVEDE e corregge tipo/scadenza per ogni riga prima di confermare:
 * nessuna scrittura cieca. Al conferma, ogni file viene caricato nel bucket
 * `subappaltatori-documenti` e registrato in `documenti_subappaltatore`
 * (stesso percorso/shape del caricamento singolo in SubappaltatoreDetail).
 *
 * Tutto lato client: riusa storage + tabella + RLS esistenti, nessuna migration
 * né edge function.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  Loader2,
  Trash2,
} from "lucide-react";
import type { TipoDocumentoSub } from "@/types/subappaltatori";
import {
  classifyTipoDocumento,
  extractZipEntries,
  guessContentType,
  guessScadenzaFromName,
  sanitizeFileName,
  SUBAPPALTATORI_DOCUMENTI_BUCKET,
  TIPO_DOC_LABELS,
  type ZipEntry,
} from "@/lib/sicurezza/bulkDocumenti";

type RowStatus = "pending" | "uploading" | "done" | "error";

interface PreparedRow {
  key: string;
  name: string;
  blob: Blob;
  tipo: TipoDocumentoSub;
  data_scadenza: string;
  include: boolean;
  status: RowStatus;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  subappaltatoreId: string;
}

export default function BulkDocumentiUploadDialog({
  open,
  onOpenChange,
  companyId,
  subappaltatoreId,
}: Props) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<PreparedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);

  const reset = () => {
    setRows([]);
    setParsing(false);
    setUploading(false);
    setDone(0);
  };

  const handleOpenChange = (next: boolean) => {
    if (uploading) return; // non chiudere durante un caricamento in corso
    if (!next) reset();
    onOpenChange(next);
  };

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setParsing(true);
    setDone(0);
    try {
      const picked = Array.from(fileList);
      let entries: ZipEntry[];
      if (picked.length === 1 && /\.zip$/i.test(picked[0].name)) {
        entries = await extractZipEntries(picked[0]);
      } else {
        entries = picked.map((f) => ({ name: f.name, blob: f }));
      }
      if (entries.length === 0) {
        toast.error("Nessun file valido trovato nell'archivio.");
        setRows([]);
        return;
      }
      setRows(
        entries.map((e, i) => ({
          key: `${Date.now()}-${i}-${e.name}`,
          name: e.name,
          blob: e.blob,
          tipo: classifyTipoDocumento(e.name),
          data_scadenza: guessScadenzaFromName(e.name) ?? "",
          include: true,
          status: "pending" as RowStatus,
        })),
      );
    } catch (err) {
      toast.error(`Lettura archivio fallita: ${(err as Error).message}`);
      setRows([]);
    } finally {
      setParsing(false);
    }
  }

  function patchRow(key: string, patch: Partial<PreparedRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function uploadAll() {
    const selected = rows.filter((r) => r.include && r.status !== "done");
    if (selected.length === 0) {
      toast.error("Seleziona almeno un documento da caricare.");
      return;
    }
    setUploading(true);
    setDone(0);
    let ok = 0;
    let fail = 0;
    for (const row of selected) {
      patchRow(row.key, { status: "uploading", error: undefined });
      try {
        const safeName = sanitizeFileName(row.name);
        const suffix = Math.random().toString(36).slice(2, 7);
        const filePath = `${companyId}/${subappaltatoreId}/${Date.now()}-${suffix}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(SUBAPPALTATORI_DOCUMENTI_BUCKET)
          .upload(filePath, row.blob, {
            contentType: guessContentType(row.name, row.blob.type || undefined),
            upsert: false,
          });
        if (upErr) throw upErr;

        const { error: insErr } = await (supabase as unknown as {
          from: (t: string) => {
            insert: (v: Record<string, unknown>) => Promise<{ error: { message?: string; details?: string; hint?: string } | null }>;
          };
        })
          .from("documenti_subappaltatore")
          .insert({
            company_id: companyId,
            subappaltatore_id: subappaltatoreId,
            tipo: row.tipo,
            nome_file: row.name,
            url: filePath,
            data_rilascio: null,
            data_scadenza: row.data_scadenza || null,
            note: "Caricato via import multiplo",
          });
        if (insErr) {
          throw new Error(insErr.message || insErr.details || insErr.hint || "Errore inserimento");
        }
        patchRow(row.key, { status: "done" });
        ok++;
      } catch (err) {
        patchRow(row.key, { status: "error", error: (err as Error).message });
        fail++;
      } finally {
        setDone((d) => d + 1);
      }
    }
    setUploading(false);
    if (ok > 0) {
      void queryClient.invalidateQueries({ queryKey: ["documenti-sub", subappaltatoreId] });
    }
    if (fail === 0) {
      toast.success(`${ok} document${ok === 1 ? "o caricato" : "i caricati"}.`);
      onOpenChange(false);
      reset();
    } else {
      toast.error(`${ok} caricati, ${fail} non riusciti. Controlla le righe in errore.`);
    }
  }

  const includedCount = rows.filter((r) => r.include).length;
  const totalToUpload = rows.filter((r) => r.include && r.status !== "done").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="h-4 w-4" />
            Importa documenti da archivio
          </DialogTitle>
          <DialogDescription>
            Carica un file .zip (o più file insieme). Ogni documento viene
            pre-classificato: rivedi tipo e scadenza prima di confermare.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Archivio .zip o file multipli</Label>
            <Input
              type="file"
              accept=".zip,application/zip,application/pdf,image/*"
              multiple
              disabled={parsing || uploading}
              onChange={(e) => void handleFiles(e.target.files)}
            />
            {parsing && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lettura archivio…
              </p>
            )}
          </div>

          {rows.length > 0 && (
            <div className="max-h-[46vh] space-y-2 overflow-y-auto rounded-lg border bg-muted/20 p-2">
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[auto_minmax(0,1fr)_9rem_8.5rem_auto] items-center gap-2 rounded-md border bg-background px-2 py-1.5"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={row.include}
                    disabled={uploading || row.status === "done"}
                    onChange={(e) => patchRow(row.key, { include: e.target.checked })}
                  />
                  <span className="min-w-0 truncate text-sm" title={row.name}>
                    {row.name}
                    {row.status === "error" && row.error ? (
                      <span className="block truncate text-[11px] text-destructive">{row.error}</span>
                    ) : null}
                  </span>
                  <Select
                    value={row.tipo}
                    disabled={uploading || row.status === "done"}
                    onValueChange={(v) => patchRow(row.key, { tipo: v as TipoDocumentoSub })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_DOC_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    className="h-8"
                    value={row.data_scadenza}
                    disabled={uploading || row.status === "done"}
                    onChange={(e) => patchRow(row.key, { data_scadenza: e.target.value })}
                  />
                  <span className="flex w-6 justify-center">
                    {row.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {row.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {row.status === "error" && <AlertTriangle className="h-4 w-4 text-destructive" />}
                    {row.status === "pending" && !uploading && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                        aria-label="Rimuovi"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {includedCount} selezionat{includedCount === 1 ? "o" : "i"} su {rows.length}
              {uploading ? ` · caricati ${done}/${totalToUpload || includedCount}` : ""}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={uploading}>
            Annulla
          </Button>
          <Button onClick={() => void uploadAll()} disabled={uploading || parsing || includedCount === 0}>
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Carica {includedCount > 0 ? includedCount : ""} document{includedCount === 1 ? "o" : "i"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
