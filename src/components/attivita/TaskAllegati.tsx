/**
 * Allegati di un'attività: foto di cantiere, bolle, DDT, verbali.
 * File nel bucket privato `task-attachments` (cartella azienda/task), riga in
 * `task_attachments`; l'apertura passa da un URL firmato a scadenza.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { SezioneCard } from "@/components/attivita/SezioneCard";

const MAX_BYTES = 20 * 1024 * 1024;
const TIPI_AMMESSI = /^(image\/(png|jpe?g|webp|heic|gif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))|application\/vnd\.ms-excel|text\/plain)$/i;

interface Allegato {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface Props {
  taskId: string;
  companyId: string;
}

function formatoDimensione(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Nome file senza caratteri che lo storage rifiuta; l'originale resta in tabella. */
function nomeSicuro(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "allegato";
}

export function TaskAllegati({ taskId, companyId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [caricamento, setCaricamento] = useState(false);
  const chiave = ["task-attachments", taskId];

  const { data: allegati = [], isLoading } = useQuery<Allegato[]>({
    queryKey: chiave,
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select("id, file_name, storage_path, mime_type, size_bytes, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Allegato[];
    },
  });

  const carica = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setCaricamento(true);
    let caricati = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) { toast.error(`${file.name}: oltre 20 MB`); continue; }
        if (file.type && !TIPI_AMMESSI.test(file.type)) { toast.error(`${file.name}: tipo non ammesso (immagini, PDF, Word, Excel, testo)`); continue; }
        const path = `${companyId}/${taskId}/${Date.now()}-${nomeSicuro(file.name)}`;
        const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) { toast.error(`${file.name}: caricamento non riuscito`, { description: upErr.message }); continue; }
        const { error: insErr } = await supabase.from("task_attachments").insert({
          task_id: taskId,
          company_id: companyId,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: user?.id ?? null,
        });
        if (insErr) {
          await supabase.storage.from("task-attachments").remove([path]);
          toast.error(`${file.name}: non registrato`, { description: insErr.message });
          continue;
        }
        caricati += 1;
      }
      if (caricati > 0) {
        toast.success(caricati === 1 ? "Allegato caricato" : `${caricati} allegati caricati`);
        queryClient.invalidateQueries({ queryKey: chiave });
      }
    } finally {
      setCaricamento(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const apri = async (a: Allegato) => {
    const { data, error } = await supabase.storage.from("task-attachments").createSignedUrl(a.storage_path, 600);
    if (error || !data?.signedUrl) { toast.error("File non disponibile", { description: error?.message }); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const elimina = useMutation({
    mutationFn: async (a: Allegato) => {
      const { error } = await supabase.from("task_attachments").delete().eq("id", a.id);
      if (error) throw error;
      await supabase.storage.from("task-attachments").remove([a.storage_path]);
    },
    onSuccess: () => { toast.success("Allegato eliminato"); queryClient.invalidateQueries({ queryKey: chiave }); },
    onError: (e: Error) => toast.error("Eliminazione non riuscita", { description: e.message }),
  });

  return (
    <SezioneCard
      titolo={`Allegati${allegati.length ? ` (${allegati.length})` : ""}`}
      icon={Paperclip}
      tono="arancio"
      azione={
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={caricamento} onClick={() => inputRef.current?.click()}>
          {caricamento ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Carica
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        onChange={(e) => { void carica(e.target.files); }}
        aria-label="Carica allegati"
      />
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Caricamento…</p>
      ) : allegati.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nessun file. Foto di cantiere, bolle e verbali si allegano qui (fino a 20 MB l'uno).
        </p>
      ) : (
        <ul className="divide-y">
          {allegati.map((a) => {
            const Icona = a.mime_type?.startsWith("image/") ? ImageIcon : FileText;
            return (
              <li key={a.id} className="flex items-center gap-2 py-1.5">
                <Icona className="h-4 w-4 shrink-0 text-orange-600" />
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => { void apri(a); }} title={a.file_name}>
                  {a.file_name}
                </button>
                <span className="shrink-0 text-[11px] text-muted-foreground">{formatoDimensione(a.size_bytes)}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Elimina ${a.file_name}`} onClick={() => elimina.mutate(a)} disabled={elimina.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </SezioneCard>
  );
}
