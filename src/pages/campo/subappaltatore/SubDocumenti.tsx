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
  Clock, Loader2, Trash2, Download, X,
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

  const { data: documenti = [], isLoading } = useQuery({
    queryKey: ["sub-documenti", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("documenti_dipendenti")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
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
      if (!selectedFile) throw new Error("Seleziona un file");

      setUploading(true);
      const ext = selectedFile.name.split(".").pop() ?? "pdf";
      const path = `${user!.id}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("documenti-sub")
        .upload(path, selectedFile, { contentType: selectedFile.type });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from("documenti-sub")
        .getPublicUrl(path);

      const { error: dbErr } = await supabase.from("documenti_dipendenti").insert({
        user_id: user!.id,
        company_id: companyId,
        tipo: tipoDoc,
        nome_file: nomeFile.trim() || selectedFile.name,
        url: publicUrl,
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
      qc.invalidateQueries({ queryKey: ["sub-documenti"] });
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

  return (
    <div className="flex flex-col h-full pb-28">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <p className="font-bold text-white">I miei documenti</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-amber-500 text-black font-semibold px-3 py-1.5 rounded-xl text-sm"
        >
          <Upload className="w-4 h-4" />
          Carica
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Alert scadenze */}
        {scadutiCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">
              {scadutiCount} document{scadutiCount > 1 ? "i" : "o"} scadut{scadutiCount > 1 ? "i" : "o"}
            </p>
          </div>
        )}
        {inScadenzaCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-400">
              {inScadenzaCount} document{inScadenzaCount > 1 ? "i" : "o"} in scadenza entro 30 giorni
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : documenti.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <FileText className="w-10 h-10 text-slate-700" />
            <p className="text-slate-400 text-sm">Nessun documento caricato</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-amber-400 text-sm font-medium"
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
                    "bg-slate-900 border rounded-2xl p-4",
                    status === "scaduto" ? "border-red-500/30" :
                    status === "in_scadenza" ? "border-amber-500/30" :
                    "border-slate-800"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{doc.nome_file}</p>
                        <p className="text-xs text-slate-500">{tipoLabel}</p>
                        {doc.data_scadenza && (
                          <p className={cn(
                            "text-xs mt-0.5",
                            status === "scaduto" ? "text-red-400" :
                            status === "in_scadenza" ? "text-amber-400" :
                            "text-slate-500"
                          )}>
                            Scade: {format(parseISO(doc.data_scadenza), "d MMM yyyy", { locale: it })}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                      {/* Status badge */}
                      {status === "scaduto" && (
                        <span className="flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5">
                          <AlertTriangle className="w-3 h-3" />
                          Scaduto
                        </span>
                      )}
                      {status === "in_scadenza" && (
                        <span className="flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5">
                          <Clock className="w-3 h-3" />
                          In scadenza
                        </span>
                      )}
                      {status === "valido" && (
                        <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-400 border border-green-500/20 rounded-full px-2 py-0.5">
                          <CheckCircle className="w-3 h-3" />
                          Valido
                        </span>
                      )}

                      {/* Actions */}
                      <div className="flex gap-1">
                        {doc.url && (
                          <button
                            onClick={() => window.open(doc.url, "_blank")}
                            className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteMutation.mutate(doc.id)}
                          disabled={deleteMutation.isPending}
                          className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
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
            className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 px-4 pt-4"
            style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-white">Carica documento</p>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Tipo */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipo documento</label>
                <select
                  value={tipoDoc}
                  onChange={e => setTipoDoc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none"
                >
                  {TIPI_DOCUMENTO.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Scadenza */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Data scadenza (opzionale)</label>
                <input
                  type="date"
                  value={dataScadenza}
                  onChange={e => setDataScadenza(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none"
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
                <div className="flex items-center gap-2 p-3 bg-slate-900 border border-slate-700 rounded-xl">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <p className="text-sm text-white flex-1 truncate">{selectedFile.name}</p>
                  <button onClick={() => setSelectedFile(null)}>
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full p-4 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center gap-2 active:border-amber-500"
                >
                  <Upload className="w-5 h-5 text-slate-500" />
                  <p className="text-sm text-slate-500">Tocca per selezionare file</p>
                  <p className="text-xs text-slate-600">PDF, JPG, PNG, DOC</p>
                </button>
              )}

              <button
                onClick={() => uploadMutation.mutate()}
                disabled={!selectedFile || uploading}
                className="w-full bg-amber-500 text-black font-bold py-3.5 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
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
