/**
 * ContractImportDialog — "Carica contratto / copia commissione".
 *
 * Upload foto/PDF → generic-doc-ai-extract (doc_type=contratto_commessa) →
 * anteprima dei dati estratti → "Applica alla commessa" (onApply).
 * L'utente rivede sempre prima di applicare (l'AI può sbagliare).
 */
// (montaggio condizionale lato CreateOrder: nasce solo all'apertura)
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Image as ImageIcon, XCircle, Sparkles, Loader2, Brain, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { parseContractExtract, contractImponibile, contractCoherenceWarnings, contractSommaVoci, type ContractExtract } from "@/lib/orders/contractExtract";

const ACCEPTED = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic"];
const MAX_SIZE = 18 * 1024 * 1024;
const BUCKET = "order-attachments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** Il file originale viaggia insieme all'estratto: il contratto firmato
   *  deve finire nei Documenti della commessa, non sparire dopo la lettura. */
  onApply: (extract: ContractExtract, sourceFile?: File | null) => void;
}

function safeName(name: string): string {
  const ext = name.includes(".") ? `.${name.split(".").pop()}` : "";
  const base = name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "contratto"}${ext.toLowerCase()}`;
}
function fmtBytes(b: number): string {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContractImportDialog({ open, onOpenChange, companyId, onApply }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extract, setExtract] = useState<ContractExtract | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null); setBusy(false); setError(null); setExtract(null);
  }, []);

  const pick = (f: File) => {
    const ext = "." + (f.name.split(".").pop()?.toLowerCase() ?? "");
    if (!ACCEPTED.includes(ext)) { toast.error("Formato non supportato. Usa PDF o immagine."); return; }
    if (f.size > MAX_SIZE) { toast.error(`File troppo grande (max ${fmtBytes(MAX_SIZE)}).`); return; }
    setFile(f); setError(null); setExtract(null);
  };

  const analyze = async () => {
    if (!file || !companyId) return;
    setBusy(true); setError(null);
    try {
      const path = `${companyId}/ai-contratti/${Date.now()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw new Error(`Upload: ${upErr.message}`);

      const { data, error: fnErr } = await supabase.functions.invoke("generic-doc-ai-extract", {
        body: {
          storage_bucket: BUCKET,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || "application/pdf",
          company_id: companyId,
          doc_type: "contratto_commessa",
        },
      });
      if (fnErr) throw new Error(fnErr.message || "Analisi AI fallita");
      if (data?.error) throw new Error(String(data.error));
      const parsed = parseContractExtract(data?.extracted ?? data);
      setExtract(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!extract) return;
    onApply(extract, file);
    onOpenChange(false);
    toast.success("Dati del contratto applicati alla commessa. Rivedi e salva.");
  };

  const imponibile = extract ? contractImponibile(extract) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-orange-500" />
            Carica contratto / copia commissione
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Carica una foto o un PDF: l'AI legge i dati e precompila la commessa. Rivedi sempre prima di salvare.
          </p>
        </DialogHeader>

        {!extract ? (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) pick(f); }}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" className="hidden" accept={ACCEPTED.join(",")}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
              {file ? (
                <div className="flex items-center gap-3 justify-center">
                  {file.type.startsWith("image/") ? <ImageIcon className="h-8 w-8 text-purple-500" /> : <FileText className="h-8 w-8 text-red-500" />}
                  <div className="text-left">
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtBytes(file.size)}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                  <p className="text-sm font-medium">Trascina qui il contratto</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF o immagine — max {fmtBytes(MAX_SIZE)}</p>
                </>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={analyze} disabled={!file || busy || !companyId}>
                {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> L'AI sta leggendo…</> : <><Sparkles className="h-4 w-4 mr-1" /> Analizza con l'AI</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {extract.summary && (
              <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-sm text-slate-700">{extract.summary}</div>
            )}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={extract.confidence >= 0.85 ? "border-green-400 text-green-700" : extract.confidence >= 0.6 ? "border-amber-400 text-amber-700" : "border-red-400 text-red-700"}>
                Affidabilità {(extract.confidence * 100).toFixed(0)}%
              </Badge>
              <span className="text-xs text-muted-foreground">Controlla i dati prima di applicarli.</span>
            </div>

            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-sm rounded-lg border p-3">
              <dt className="text-slate-500">Cliente</dt>
              <dd className="font-medium">{extract.cliente.nome_completo || "—"}{extract.cliente.partita_iva ? ` · P.IVA ${extract.cliente.partita_iva}` : ""}</dd>
              <dt className="text-slate-500">Lavori</dt>
              <dd>{extract.descrizione_lavori || "—"}</dd>
              <dt className="text-slate-500">Importo</dt>
              <dd className="font-medium tabular-nums">{imponibile != null ? formatCurrency(imponibile) : "—"}{extract.iva_pct != null ? ` + IVA ${extract.iva_pct}%` : ""}</dd>
              <dt className="text-slate-500">Pagamento</dt>
              <dd>{extract.modalita_pagamento || "—"}{extract.fasi_pagamento.length ? ` · ${extract.fasi_pagamento.length} fasi` : ""}</dd>
              <dt className="text-slate-500">Voci</dt>
              <dd>{extract.voci.length ? `${extract.voci.length} articoli` : "—"}</dd>
            </dl>

            {/* Coerenza dei conti PRIMA di applicare: su un contratto lungo
                l'AI puo' perdere voci o sbagliare somme — qui non passa muto. */}
            {(() => {
              const coerenza = contractCoherenceWarnings(extract);
              const somma = contractSommaVoci(extract);
              return (
                <>
                  {somma > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Verifica conti: {extract.voci.length} voci · somma{" "}
                      {somma.toLocaleString("it-IT", { minimumFractionDigits: 2 })} €
                      {contractImponibile(extract) != null &&
                        ` · imponibile ${contractImponibile(extract)!.toLocaleString("it-IT", { minimumFractionDigits: 2 })} €`}
                    </p>
                  )}
                  {coerenza.length > 0 && (
                    <div className="rounded-lg border border-orange-300 bg-orange-50 p-2.5 text-xs text-orange-900">
                      <p className="font-semibold mb-1">🔎 I conti non tornano</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {coerenza.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
            {extract.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <p className="font-semibold mb-1">⚠️ Da verificare</p>
                <ul className="list-disc list-inside space-y-0.5">{extract.warnings.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-1">
              <Button variant="outline" onClick={reset}>Ricarica un altro</Button>
              <Button onClick={apply} className="gap-1"><CheckCircle2 className="h-4 w-4" /> Applica alla commessa</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
