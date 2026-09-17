/**
 * Documenti personali nella scheda cliente: per tipo, più file ciascuno,
 * aggiunta e rimozione. Sono gli stessi che compaiono nelle sue commesse.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ACCEPT_INPUT, problemaFile } from "@/lib/commesse/documentiCommessa";
import {
  BUCKET_DOCUMENTI_CLIENTE,
  ETICHETTA_DOCUMENTO_CLIENTE,
  TIPI_DOCUMENTO_CLIENTE,
  caricaDocumentiCliente,
  type TipoDocumentoCliente,
} from "@/lib/clienti/documentiCliente";
import { fmtBytes, scaricaAllegato, useUrlMiniature } from "@/components/orders/filePreviewUtils";
import { FileThumb } from "@/components/orders/filePreview";

export interface DocumentoClienteRiga {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  thumb_path?: string | null;
}


export function FascicoloCliente({
  customerId,
  companyId,
  documenti,
}: {
  customerId: string;
  companyId: string;
  documenti: DocumentoClienteRiga[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [inCaricamento, setInCaricamento] = useState<TipoDocumentoCliente | null>(null);
  const [daTogliere, setDaTogliere] = useState<DocumentoClienteRiga | null>(null);
  const { data: miniature = {} } = useUrlMiniature(documenti.map((d) => d.thumb_path), documenti.length > 0, BUCKET_DOCUMENTI_CLIENTE);
  const scarica = (d: DocumentoClienteRiga) => { void scaricaAllegato(d.file_path, d.file_name, BUCKET_DOCUMENTI_CLIENTE); };

  const invalida = () => {
    qc.invalidateQueries({ queryKey: ["customer-documents", customerId] });
    qc.invalidateQueries({ queryKey: ["documenti-cliente-commessa"] });
    qc.invalidateQueries({ queryKey: ["spazio-archiviazione"] });
  };

  const carica = async (tipo: TipoDocumentoCliente, files: File[]) => {
    if (!user?.id || files.length === 0) return;
    const buoni = files.filter((f) => {
      const p = problemaFile(f);
      if (p) toast.error("File escluso", { description: p });
      return !p;
    });
    if (buoni.length === 0) return;
    setInCaricamento(tipo);
    const { caricati, falliti } = await caricaDocumentiCliente({ companyId, customerId, userId: user.id, file: { [tipo]: buoni } });
    setInCaricamento(null);
    invalida();
    if (falliti.length) toast.error(`${falliti.length} file non caricati`, { description: falliti.join(", ") });
    if (caricati) toast.success(caricati === 1 ? "Documento caricato" : `${caricati} documenti caricati`);
  };

  const togli = useMutation({
    mutationFn: async (d: DocumentoClienteRiga) => {
      const { error } = await supabase.from("customer_documents" as never).delete().eq("id" as never, d.id as never);
      if (error) throw error;
      await supabase.storage.from(BUCKET_DOCUMENTI_CLIENTE).remove(d.thumb_path ? [d.file_path, d.thumb_path] : [d.file_path]);
    },
    onSuccess: () => { invalida(); toast.success("Documento tolto"); },
    onError: () => toast.error("Documento non tolto"),
  });

  // I tipi standard sempre; «Contratto» solo se ce n'è uno storico.
  const tipi: { tipo: string; etichetta: string }[] = [
    ...TIPI_DOCUMENTO_CLIENTE.map((t) => ({ tipo: t.tipo, etichetta: t.etichetta })),
    ...(documenti.some((d) => d.document_type === "contract") ? [{ tipo: "contract", etichetta: "Contratto" }] : []),
  ];

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold">Documenti personali</p>
        <p className="text-xs text-muted-foreground">
          Facoltativi, anche più file per tipo. Compaiono anche nei documenti delle commesse del cliente.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {tipi.map(({ tipo, etichetta }) => {
          const lista = documenti.filter((d) => d.document_type === tipo);
          const storico = tipo === "contract";
          const id = `fascicolo-${customerId}-${tipo}`;
          return (
            <div key={tipo} className="rounded-md border p-2 space-y-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">
                  {etichetta} <span className="text-muted-foreground tabular-nums">({lista.length})</span>
                </p>
                {!storico && (
                  <>
                    <input
                      id={id}
                      type="file"
                      multiple
                      accept={ACCEPT_INPUT}
                      className="hidden"
                      onChange={(e) => { void carica(tipo as TipoDocumentoCliente, Array.from(e.target.files ?? [])); e.target.value = ""; }}
                    />
                    <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={inCaricamento !== null}>
                      <label htmlFor={id} className="cursor-pointer">
                        {inCaricamento === tipo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                        {inCaricamento === tipo ? "" : "Aggiungi"}
                      </label>
                    </Button>
                  </>
                )}
              </div>
              {storico && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Il contratto va nei documenti della commessa: caricalo lì.
                </p>
              )}
              {lista.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Nessun file</p>
              ) : (
                <ul className="space-y-1">
                  {lista.map((d) => (
                    <li key={d.id} className="flex items-center gap-1.5 text-[11px]">
                      <button type="button" onClick={() => scarica(d)} className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Scarica ${d.file_name}`}>
                        <FileThumb
                          file={{ id: d.id, file_name: d.file_name, file_url: d.file_path, file_type: d.file_type, file_size: d.file_size }}
                          thumbUrl={d.thumb_path ? miniature[d.thumb_path] : undefined}
                          size="sm"
                        />
                      </button>
                      <button type="button" onClick={() => scarica(d)} className="flex-1 min-w-0 truncate text-left hover:underline" title={d.file_name}>
                        {d.file_name}
                      </button>
                      <span className="text-muted-foreground tabular-nums shrink-0">{fmtBytes(d.file_size)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => scarica(d)} aria-label={`Scarica ${d.file_name}`}>
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive" onClick={() => setDaTogliere(d)} aria-label={`Togli ${d.file_name}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!daTogliere} onOpenChange={(o) => { if (!o) setDaTogliere(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Togliere «{daTogliere?.file_name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {ETICHETTA_DOCUMENTO_CLIENTE[daTogliere?.document_type ?? ""] ?? "Documento"} eliminato definitivamente:
              sparisce anche dai documenti delle commesse del cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (daTogliere) togli.mutate(daTogliere); }}
            >
              Togli
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
