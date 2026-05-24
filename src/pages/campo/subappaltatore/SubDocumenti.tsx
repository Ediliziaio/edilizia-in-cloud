/**
 * Documenti subappaltatore — caricamento e gestione documenti propri.
 * Upload verso bucket 'documenti-sub' + lista con stato scadenza.
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import {
  FileText, Upload, AlertTriangle, CheckCircle,
  Clock, Loader2, Trash2, Download, X, RefreshCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TIPI_DOCUMENTO = [
  { value: "visura_camerale", label: "Visura camerale" },
  { value: "durc", label: "DURC" },
  { value: "polizza_rc", label: "Polizza RC" },
  { value: "attestazione_soa", label: "Attestazione SOA" },
  { value: "documento_identita", label: "Documento d'identità" },
  { value: "contratto", label: "Contratto" },
  { value: "altro", label: "Altro" },
];

const PRIVATE_DOC_BUCKET = "documenti-dipendenti";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const SUB_DOCUMENTI_TIMEOUT_MS = 8000;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function isStoragePath(value: string | null | undefined) {
  return !!value && !/^https?:\/\//i.test(value);
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default function SubDocumenti() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const companyId = (profile as any)?.company_id ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [tipoDoc, setTipoDoc] = useState("durc");
  const [nomeFile, setNomeFile] = useState("");
  const [dataScadenza, setDataScadenza] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const today = new Date();

  const { data: documenti = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["sub-documenti", companyId, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await withTimeout(
        supabase
          .from("documenti_dipendenti")
          .select("*")
          .eq("user_id", user!.id)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        SUB_DOCUMENTI_TIMEOUT_MS,
        "Caricamento documenti troppo lento",
      );
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    retry: false,
  });

  const getScadenzaStatus = (dataScad: string | null) => {
    if (!dataScad) return "nessuna";
    const d = parseISO(dataScad);
    const diff = differenceInDays(d, today);
    if (diff < 0) return "scaduto";
    if (diff <= 30) return "in_scadenza";
    return "valido";
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile, ricarica la pagina");
      if (!selectedFile) throw new Error("Seleziona un file");
      if (selectedFile.size > MAX_FILE_SIZE) throw new Error("File troppo grande: massimo 15 MB");
      if (selectedFile.type && !ALLOWED_MIME_TYPES.has(selectedFile.type)) {
        throw new Error("Formato non consentito. Usa PDF, JPG, PNG, DOC o DOCX");
      }

      setUploading(true);
      const ext = selectedFile.name.split(".").pop() ?? "pdf";
      const path = `${user!.id}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(PRIVATE_DOC_BUCKET)
        .upload(path, selectedFile, { contentType: selectedFile.type });
      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await supabase.from("documenti_dipendenti").insert({
        user_id: user!.id,
        company_id: companyId,
        tipo: tipoDoc,
        nome_file: nomeFile.trim() || selectedFile.name,
        url: path,
        data_scadenza: dataScadenza || null,
      });
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      toast.success("Documento caricato");
      setShowForm(false);
      setSelectedFile(null);
      setNomeFile("");
      setDataScadenza("");
      setTipoDoc("durc");
      qc.invalidateQueries({ queryKey: ["sub-documenti", companyId, user?.id] });
    },
    onError: (err: any) => toast.error(err.message ?? "Errore nel caricamento"),
    onSettled: () => setUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("documenti_dipendenti")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento rimosso");
      qc.invalidateQueries({ queryKey: ["sub-documenti"] });
    },
    onError: () => toast.error("Errore nella rimozione"),
  });

  const scadutiCount = documenti.filter((d: any) => getScadenzaStatus(d.data_scadenza) === "scaduto").length;
  const inScadenzaCount = documenti.filter((d: any) => getScadenzaStatus(d.data_scadenza) === "in_scadenza").length;

  const openDocumento = async (url: string) => {
    if (!isStoragePath(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const { data, error } = await supabase.storage
      .from(PRIVATE_DOC_BUCKET)
      .createSignedUrl(url, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error("Impossibile aprire il documento");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col h-full pb-28">
      {/* Header */}
      <div className="bg-muted border-b border-border px-4 py-3 flex items-center justify-between">
        <p className="font-bold text-foreground">I miei documenti</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold px-3 py-1.5 rounded-xl text-sm"
        >
          <Upload className="w-4 h-4" />
          Carica
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Alert scadenze */}
        {scadutiCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-500/30 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs text-red-600">
              {scadutiCount} document{scadutiCount > 1 ? "i" : "o"} scadut{scadutiCount > 1 ? "i" : "o"}
            </p>
          </div>
        )}
        {inScadenzaCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <p className="text-xs text-primary">
              {inScadenzaCount} document{inScadenzaCount > 1 ? "i" : "o"} in scadenza entro 30 giorni
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Documenti non caricati</p>
                <p className="mt-1 text-xs leading-relaxed">
                  {(error as Error)?.message || "La richiesta non ha risposto in tempo."} Riprova quando la rete e' stabile.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-background px-3 text-xs font-bold text-amber-900 shadow-sm disabled:opacity-60"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Riprova
            </button>
          </div>
        ) : documenti.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <FileText className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Nessun documento caricato</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-primary text-sm font-medium"
            >
              Carica il primo documento →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {documenti.map((doc: any) => {
              const status = getScadenzaStatus(doc.data_scadenza);
              const tipoLabel = TIPI_DOCUMENTO.find(t => t.value === doc.tipo)?.label ?? doc.tipo;
              return (
                <div
                  key={doc.id}
                  className={cn(
                    "bg-muted border rounded-2xl p-4",
                    status === "scaduto" ? "border-red-500/30" :
                    status === "in_scadenza" ? "border-primary/30" :
                    "border-border"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{doc.nome_file}</p>
                        <p className="text-xs text-muted-foreground">{tipoLabel}</p>
                        {doc.data_scadenza && (
                          <p className={cn(
                            "text-xs mt-0.5",
                            status === "scaduto" ? "text-red-600" :
                            status === "in_scadenza" ? "text-primary" :
                            "text-muted-foreground"
                          )}>
                            Scade: {format(parseISO(doc.data_scadenza), "d MMM yyyy", { locale: it })}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                      {/* Status badge */}
                      {status === "scaduto" && (
                        <span className="flex items-center gap-1 text-[10px] bg-red-500/20 text-red-600 border border-red-500/20 rounded-full px-2 py-0.5">
                          <AlertTriangle className="w-3 h-3" />
                          Scaduto
                        </span>
                      )}
                      {status === "in_scadenza" && (
                        <span className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                          <Clock className="w-3 h-3" />
                          In scadenza
                        </span>
                      )}
                      {status === "valido" && (
                        <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-600 border border-green-500/20 rounded-full px-2 py-0.5">
                          <CheckCircle className="w-3 h-3" />
                          Valido
                        </span>
                      )}

                      {/* Actions */}
                      <div className="flex gap-1">
                        {doc.url && (
                          <button
                            onClick={() => openDocumento(doc.url)}
                            className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center"
                          >
                            <Download className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteMutation.mutate(doc.id)}
                          disabled={deleteMutation.isPending}
                          className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload form overlay */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
          <div
            className="w-full bg-background rounded-t-3xl border-t border-border px-4 pt-4"
            style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-foreground">Carica documento</p>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-muted">
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Tipo */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Tipo documento</label>
                <select
                  value={tipoDoc}
                  onChange={e => setTipoDoc(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground text-sm focus:outline-none"
                >
                  {TIPI_DOCUMENTO.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Scadenza */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Data scadenza (opzionale)</label>
                <input
                  type="date"
                  value={dataScadenza}
                  onChange={e => setDataScadenza(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground text-sm focus:outline-none"
                />
              </div>

              {/* File selector */}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setSelectedFile(f);
                    if (!nomeFile) setNomeFile(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />

              {selectedFile ? (
                <div className="flex items-center gap-2 p-3 bg-muted border border-border rounded-xl">
                  <FileText className="w-4 h-4 text-primary" />
                  <p className="text-sm text-foreground flex-1 truncate">{selectedFile.name}</p>
                  <button onClick={() => setSelectedFile(null)}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full p-4 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-2 active:border-primary"
                >
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Tocca per selezionare file</p>
                  <p className="text-xs text-muted-foreground">PDF, JPG, PNG, DOC</p>
                </button>
              )}

              <button
                onClick={() => uploadMutation.mutate()}
                disabled={!selectedFile || uploading}
                className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                CARICA DOCUMENTO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
