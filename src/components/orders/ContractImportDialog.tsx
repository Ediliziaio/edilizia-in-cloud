/**
 * ContractImportDialog — "Carica contratto / copia commissione".
 *
 * Upload foto/PDF → generic-doc-ai-extract (doc_type=contratto_commessa) →
 * anteprima dei dati estratti → "Applica alla commessa" (onApply).
 * L'utente rivede sempre prima di applicare (l'AI può sbagliare).
 */
// (montaggio condizionale lato CreateOrder: nasce solo all'apertura)
import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Image as ImageIcon, XCircle, Sparkles, Loader2, Brain, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { parseContractExtract, reconcileContractExtract, contractImponibile, contractCoherenceWarnings, contractSommaVoci, type ContractExtract } from "@/lib/orders/contractExtract";

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
  /** Arrivando dal flusso "Importa documento intelligente" di Silvio, il PDF
   *  è GIÀ su storage: con l'id dell'analisi lo si riusa senza secondo drag
   *  né secondo upload (audit 2026-09, punto 1). */
  initialAnalysisId?: string | null;
}

interface RemoteFileRef {
  bucket: string;
  path: string;
  name: string;
  mime: string;
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

export function ContractImportDialog({ open, onOpenChange, companyId, onApply, initialAnalysisId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  // Il file dell'analisi Silvio (se si arriva da lì): riusato da storage.
  const { data: remoteFile = null } = useQuery<RemoteFileRef | null>({
    queryKey: ["contract-import-analysis-file", initialAnalysisId],
    enabled: !!initialAnalysisId && !!companyId && open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_analysis_results")
        .select("storage_bucket, storage_path, file_name, mime_type, company_id")
        .eq("id", initialAnalysisId!)
        .maybeSingle();
      if (!data || data.company_id !== companyId) return null;
      return {
        bucket: data.storage_bucket,
        path: data.storage_path,
        name: data.file_name ?? "documento.pdf",
        mime: data.mime_type ?? "application/pdf",
      };
    },
  });
  // Indicazioni scritte dall'utente per l'AI ("l'IVA è al 10%", "è un'offerta
  // fornitore, il cliente finale è Rossi"): chi carica conosce il documento
  // meglio del modello — le note entrano nel prompt con priorità.
  const [noteAi, setNoteAi] = useState("");
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
    if ((!file && !remoteFile) || !companyId) return;
    setBusy(true); setError(null);
    try {
      let bucket: string, path: string, fileName: string, mime: string;
      if (file) {
        // Path = hash del contenuto (audit 2026-09, punto 2): lo stesso file
        // ricaricato finisce sullo STESSO path → stessa chiave di idempotenza
        // → l'aiRouter risponde dalla cache e il retry non costa nulla.
        // (Prima era Date.now(): ogni tentativo una chiamata a pagamento.)
        const buf = await file.arrayBuffer();
        const hashBuf = await crypto.subtle.digest("SHA-256", buf);
        const sha = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
        bucket = BUCKET;
        path = `${companyId}/ai-contratti/${sha.slice(0, 32)}-${safeName(file.name)}`;
        fileName = file.name;
        mime = file.type || "application/pdf";
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
        if (upErr) throw new Error(`Upload: ${upErr.message}`);
      } else {
        // File già su storage dal flusso Silvio: zero upload, zero drag.
        bucket = remoteFile!.bucket;
        path = remoteFile!.path;
        fileName = remoteFile!.name;
        mime = remoteFile!.mime;
      }

      const { data, error: fnErr } = await supabase.functions.invoke("generic-doc-ai-extract", {
        body: {
          storage_bucket: bucket,
          storage_path: path,
          file_name: fileName,
          mime_type: mime,
          company_id: companyId,
          doc_type: "contratto_commessa",
          user_hint: noteAi.trim() || undefined,
        },
      });
      if (fnErr) throw new Error(fnErr.message || "Analisi AI fallita");
      if (data?.error) throw new Error(String(data.error));
      const parsed = reconcileContractExtract(parseContractExtract(data?.extracted ?? data));
      setExtract(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const navigate = useNavigate();
  const [creandoOda, setCreandoOda] = useState(false);

  /**
   * Ponte offerta fornitore → Ordine d'Acquisto (audit 2026-09, punto 3):
   * quando l'AI riconosce l'offerta di un PRODUTTORE, le voci estratte
   * diventano un OdA in bozza col fornitore agganciato (o creato) — invece
   * di morire in un avviso. I prezzi entrano già scontati dello sconto
   * rivenditore; imballaggio/trasporto come righe proprie.
   */
  const creaOdaDaOfferta = async () => {
    if (!extract || !companyId || creandoOda) return;
    if (extract.valuta && extract.valuta !== "EUR") {
      toast.error(`L'offerta è in ${extract.valuta}: converti gli importi prima di creare l'OdA.`);
      return;
    }
    const nomeFornitore = extract.fornitore_emittente?.trim();
    if (!nomeFornitore) {
      toast.error("Fornitore emittente non rilevato: scrivilo nelle indicazioni per l'AI (es. \"il fornitore è Termoplast\") e rianalizza.");
      return;
    }
    setCreandoOda(true);
    try {
      // Find-or-create del fornitore per nome (esatto, case-insensitive).
      const { data: esistenti } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId)
        .ilike("name", nomeFornitore);
      let supplierId = esistenti?.find((s) => s.name?.trim().toLowerCase() === nomeFornitore.toLowerCase())?.id ?? esistenti?.[0]?.id ?? null;
      if (!supplierId) {
        const { data: nuovo, error: supErr } = await supabase
          .from("suppliers")
          .insert({ company_id: companyId, name: nomeFornitore } as never)
          .select("id")
          .single();
        if (supErr) throw new Error(`Fornitore: ${supErr.message}`);
        supplierId = (nuovo as { id: string }).id;
        toast.success(`Fornitore "${nomeFornitore}" creato in anagrafica`);
      }

      const user = (await supabase.auth.getUser()).data.user;
      const sconto = extract.sconto_globale_pct;
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId,
          supplier_id: supplierId,
          created_by: user?.id,
          notes:
            `Generato dall'offerta "${file?.name ?? remoteFile?.name ?? "documento"}" (lettura AI)` +
            (sconto != null ? ` — prezzi già scontati del ${sconto}%` : ""),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select()
        .single();
      if (poErr) throw poErr;
      const poId = (po as { id: string }).id;

      const fattoreSconto = sconto != null ? 1 - sconto / 100 : 1;
      const ivaRiga = extract.iva_pct ?? 22;
      const righe = [
        ...extract.voci.map((v, idx) => ({
          company_id: companyId,
          purchase_order_id: poId,
          description: v.descrizione,
          quantity: v.quantita || 1,
          unit_price: Math.round(v.prezzo_unitario_eur * fattoreSconto * 100) / 100,
          vat_rate: ivaRiga,
          discount_percent: 0,
          unit_of_measure: "pz",
          sort_order: idx,
        })),
        ...extract.altri_costi.map((a, idx) => ({
          company_id: companyId,
          purchase_order_id: poId,
          description: a.descrizione,
          quantity: 1,
          unit_price: a.importo_eur,
          vat_rate: ivaRiga,
          discount_percent: 0,
          unit_of_measure: "pz",
          sort_order: extract.voci.length + idx,
        })),
      ];
      if (righe.length > 0) {
        const { error: riErr } = await supabase.from("purchase_order_items").insert(righe as never);
        if (riErr) throw riErr;
      }

      toast.success("Ordine d'Acquisto creato in bozza dalle voci dell'offerta");
      onOpenChange(false);
      navigate(`/azienda/ordini-acquisto/${poId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore creazione OdA");
    } finally {
      setCreandoOda(false);
    }
  };

  const apply = async () => {
    if (!extract) return;
    // Anche il file riusato da Silvio deve finire nei Documenti: se non c'è
    // un File locale, lo si scarica da storage e lo si passa come tale.
    let sorgente: File | null = file;
    if (!sorgente && remoteFile) {
      try {
        const { data: blob } = await supabase.storage.from(remoteFile.bucket).download(remoteFile.path);
        if (blob) sorgente = new File([blob], remoteFile.name, { type: remoteFile.mime });
      } catch { /* senza file l'apply resta valido: solo niente allegato */ }
    }
    onApply(extract, sorgente);
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
                  {remoteFile ? (
                    <p className="text-sm font-medium">
                      <FileText className="mb-0.5 mr-1 inline h-4 w-4 text-emerald-600" />
                      Uso il file già caricato: <span className="font-semibold">{remoteFile.name}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">oppure trascina qui un altro documento</span>
                    </p>
                  ) : (
                  <p className="text-sm font-medium">Trascina qui il contratto</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">PDF o immagine — max {fmtBytes(MAX_SIZE)}</p>
                </>
              )}
            </div>

            {/* Note per l'AI: chi carica sa cose che il documento non dice
                chiaramente. Entrano nel prompt con priorità sulle deduzioni. */}
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="note-ai-contratto">
                Indicazioni per l'AI (facoltative)
              </label>
              <textarea
                id="note-ai-contratto"
                value={noteAi}
                onChange={(e) => setNoteAi(e.target.value.slice(0, 600))}
                rows={2}
                placeholder={"Es. L'IVA è al 10% · È un'offerta del fornitore, il cliente finale è Rossi · I prezzi sono per pezzo, non totali"}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={analyze} disabled={(!file && !remoteFile) || busy || !companyId}>
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

            {/* Le voci si GUARDANO prima di applicare (audit 2026-09, punto 5):
                "13 voci" senza elenco chiedeva fiducia al buio. */}
            {extract.voci.length > 0 && (
              <details className="rounded-lg border">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-accent/40">
                  Vedi le {extract.voci.length} voci estratte
                </summary>
                <div className="max-h-56 overflow-y-auto border-t">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-3 py-1.5 font-medium">Descrizione</th>
                        <th className="px-2 py-1.5 text-right font-medium">Q.tà</th>
                        <th className="px-2 py-1.5 text-right font-medium">Unitario</th>
                        <th className="px-3 py-1.5 text-right font-medium">Totale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extract.voci.map((v, i) => (
                        <tr key={i} className="border-t">
                          <td className="max-w-[260px] truncate px-3 py-1.5" title={v.descrizione}>{v.descrizione}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{v.quantita}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(v.prezzo_unitario_eur)}</td>
                          <td className="px-3 py-1.5 text-right font-medium tabular-nums">{formatCurrency((v.quantita || 1) * (v.prezzo_unitario_eur || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

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

            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <Button variant="outline" onClick={reset}>Ricarica un altro</Button>
              <div className="flex flex-wrap gap-2">
                {extract.natura_documento === "offerta_fornitore" && (
                  <Button variant="brand" onClick={creaOdaDaOfferta} disabled={creandoOda} className="gap-1">
                    {creandoOda ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Crea Ordine d'Acquisto
                  </Button>
                )}
                <Button onClick={apply} className="gap-1"><CheckCircle2 className="h-4 w-4" /> Applica alla commessa</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
