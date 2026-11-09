/** I file di un contratto col committente: la copia firmata e quello che le va insieme. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ACCEPT_INPUT, problemaFile } from "@/lib/commesse/documentiCommessa";
import { BUCKET_DOCUMENTI_CLIENTE, caricaDocumentiCliente } from "@/lib/clienti/documentiCliente";
import { fmtBytes, scaricaAllegato } from "@/components/orders/filePreviewUtils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FileContratto { id: string; file_name: string; file_path: string; file_size: number | null; thumb_path: string | null }

export function DocumentiContratto({ contrattoId, committenteId, companyId, puoModificare }: {
  contrattoId: string;
  committenteId: string;
  companyId: string;
  puoModificare: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [carico, setCarico] = useState(false);
  const [daTogliere, setDaTogliere] = useState<FileContratto | null>(null);
  const chiave = ["documenti-contratto-appalto", contrattoId];
  const { data: files = [], isLoading } = useQuery({
    queryKey: chiave,
    queryFn: async (): Promise<FileContratto[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("customer_documents")
        .select("id, file_name, file_path, file_size, thumb_path")
        .eq("company_id", companyId).eq("appalto_contratto_id", contrattoId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileContratto[];
    },
  });

  const carica = async (scelti: File[]) => {
    if (!user?.id || scelti.length === 0) return;
    const buoni = scelti.filter((f) => {
      const p = problemaFile(f);
      if (p) toast.error("File escluso", { description: p });
      return !p;
    });
    if (buoni.length === 0) return;
    setCarico(true);
    const { caricati, falliti } = await caricaDocumentiCliente({ companyId, customerId: committenteId, userId: user.id, file: { contract: buoni }, appaltoContrattoId: contrattoId });
    setCarico(false);
    void qc.invalidateQueries({ queryKey: chiave });
    if (falliti.length) toast.error(`${falliti.length} file non caricati`, { description: falliti.join(", ") });
    if (caricati) toast.success(caricati === 1 ? "Documento allegato" : `${caricati} documenti allegati`);
  };

  const togli = useMutation({
    mutationFn: async (f: FileContratto) => {
      const { error } = await supabase.from("customer_documents" as never).delete().eq("id" as never, f.id as never);
      if (error) throw error;
      await supabase.storage.from(BUCKET_DOCUMENTI_CLIENTE).remove(f.thumb_path ? [f.file_path, f.thumb_path] : [f.file_path]);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: chiave }); toast.success("Documento tolto"); },
    onError: () => toast.error("Documento non tolto"),
  });

  return (
    <div className="rounded-lg border p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <FileCheck2 className="h-3.5 w-3.5 shrink-0" /> Contratto firmato
        </p>
        {puoModificare && (
          <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" disabled={carico}>
            <label className="cursor-pointer">
              {carico ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              {carico ? "" : "Allega"}
              <input type="file" multiple accept={ACCEPT_INPUT} aria-label="Allega il contratto firmato" className="hidden"
                onChange={(e) => { void carica(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            </label>
          </Button>
        )}
      </div>
      {!isLoading && files.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Nessun file: allega la copia firmata e gli allegati.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 text-xs">
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" title={f.file_name}
                onClick={() => void scaricaAllegato(f.file_path, f.file_name, BUCKET_DOCUMENTI_CLIENTE)}>{f.file_name}</button>
              <span className="shrink-0 tabular-nums text-muted-foreground">{fmtBytes(f.file_size)}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Scarica ${f.file_name}`}
                onClick={() => void scaricaAllegato(f.file_path, f.file_name, BUCKET_DOCUMENTI_CLIENTE)}><Download className="h-3 w-3" /></Button>
              {puoModificare && (
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive" aria-label={`Togli ${f.file_name}`} onClick={() => setDaTogliere(f)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!daTogliere} onOpenChange={(o) => { if (!o) setDaTogliere(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Togliere «{daTogliere?.file_name}»?</AlertDialogTitle>
            <AlertDialogDescription>Il file viene eliminato definitivamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (daTogliere) togli.mutate(daTogliere); }}>Togli</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
