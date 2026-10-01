import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Upload, Download, Trash2, File, Image, FileSpreadsheet, FileText, Loader2, Landmark, Eye, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CATEGORIE_DOCUMENTO, categoriaSuggerita, erroreFile, etichettaCategoria, formatDimensione, nomeRinominato, tipoAnteprima,
} from "@/lib/documenti/categorieDocumento";
import { OpenapiDocRequestDialog } from "./OpenapiDocRequestDialog";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  contactId: string;
  opportunityId?: string;
  companyId: string;
  /** If true, uploads will be linked to the opportunityId */
  linkToOpportunity?: boolean;
  compact?: boolean;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (type.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function MarketingDocumentsPanel({ contactId, opportunityId, companyId, linkToOpportunity, compact }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openapiOpen, setOpenapiOpen] = useState(false);
  const [trascinando, setTrascinando] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<string>("tutte");
  const [inRinomina, setInRinomina] = useState<{ id: string; nome: string } | null>(null);
  const [anteprima, setAnteprima] = useState<{ nome: string; url: string; tipo: "immagine" | "pdf" } | null>(null);

  // P.IVA del contatto per precompilare la richiesta documento ufficiale
  const { data: contactVat } = useQuery({
    queryKey: ["marketing_contact_vat", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data } = await supabase.from("marketing_contacts").select("vat_number").eq("id", contactId).maybeSingle();
      return (data?.vat_number as string | null) ?? null;
    },
  });

  const queryKey = opportunityId
    ? ["marketing_documents", contactId, opportunityId]
    : ["marketing_documents", contactId];

  const { data: documents = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const query = supabase
        .from("marketing_documents")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });

      // Don't filter by opportunity - show all contact docs
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!contactId,
  });

  // Chi ha caricato ogni file.
  const idCaricatori = useMemo(
    () => [...new Set(documents.map((d: any) => d.uploaded_by).filter(Boolean))].sort() as string[],
    [documents],
  );
  const { data: nomiCaricatori = {} } = useQuery({
    queryKey: ["marketing_documents_autori", companyId, idCaricatori.join(",")],
    enabled: idCaricatori.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", idCaricatori);
      const out: Record<string, string> = {};
      (data ?? []).forEach((p) => {
        const n = [p.first_name, p.last_name].map((x) => x?.trim()).filter(Boolean).join(" ");
        if (n) out[p.id] = n;
      });
      return out;
    },
  });

  const aggiornaDocumento = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { file_name?: string; categoria?: string } }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("marketing_documents").update(patch).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marketing_documents"] }),
    onError: (e: any) => toast.error(e.message || "Modifica non riuscita"),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: globalThis.File) => {
      const fileExt = file.name.split(".").pop();
      const filePath = `${companyId}/${contactId}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("marketing-attachments")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("marketing_documents").insert({
        contact_id: contactId,
        opportunity_id: linkToOpportunity ? opportunityId : null,
        company_id: companyId,
        file_name: file.name,
        file_url: filePath,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user?.id,
        categoria: categoriaSuggerita(file.name, file.type),
      } as never);
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_documents"] });
    },
    // Nessun toast per-file: il riepilogo (successi/fallimenti) lo mostra
    // handleFileChange dopo l'upload sequenziale.
  });

  const getStoragePath = (fileUrl: string) => {
    if (fileUrl.startsWith("http")) {
      const parts = fileUrl.split("/marketing-attachments/");
      if (parts.length > 1) return decodeURIComponent(parts[1]);
    }
    return fileUrl;
  };

  const getSignedUrl = async (fileUrl: string) => {
    const path = getStoragePath(fileUrl);
    const { data } = await supabase.storage.from("marketing-attachments").createSignedUrl(path, 3600);
    return data?.signedUrl || fileUrl;
  };

  const deleteMutation = useMutation({
    mutationFn: async (doc: any) => {
      const filePath = getStoragePath(doc.file_url);
      await supabase.storage.from("marketing-attachments").remove([filePath]);
      const { error } = await supabase.from("marketing_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_documents"] });
      toast.success("Documento eliminato");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const caricaFile = async (list: globalThis.File[]) => {
    if (list.length === 0) return;
    // Prima si scartano i file non ammessi, dicendo perché; gli altri partono.
    const scartati: string[] = [];
    const validi = list.filter((f) => {
      const err = erroreFile(f);
      if (err) scartati.push(err);
      return !err;
    });
    scartati.forEach((m) => toast.error(m));
    // Upload SEQUENZIALE con conteggio: ogni esito è contato.
    let ok = 0;
    let fail = 0;
    for (const file of validi) {
      try {
        await uploadMutation.mutateAsync(file);
        ok++;
      } catch {
        fail++;
      }
    }
    if (validi.length === 0) return;
    if (fail === 0) toast.success(ok === 1 ? "Documento caricato" : `${ok} documenti caricati`);
    else if (ok === 0) toast.error(`Caricamento non riuscito (${fail} file)`);
    else toast.warning(`${ok} caricati, ${fail} non riusciti`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const list = Array.from(files);
    e.target.value = "";
    await caricaFile(list);
  };

  const apriAnteprima = async (doc: any) => {
    const tipo = tipoAnteprima(doc.file_type, doc.file_name);
    if (!tipo) return;
    const url = await getSignedUrl(doc.file_url);
    setAnteprima({ nome: doc.file_name, url, tipo });
  };

  const salvaNome = () => {
    if (!inRinomina) return;
    const doc = documents.find((d: any) => d.id === inRinomina.id);
    if (!doc) { setInRinomina(null); return; }
    const nuovo = nomeRinominato(doc.file_name, inRinomina.nome);
    setInRinomina(null);
    if (nuovo !== doc.file_name) aggiornaDocumento.mutate({ id: doc.id, patch: { file_name: nuovo } });
  };

  const conteggiCategorie = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of documents as any[]) {
      const k = d.categoria || "altro";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [documents]);
  const documentiVisibili = filtroCategoria === "tutte"
    ? documents
    : (documents as any[]).filter((d) => (d.categoria || "altro") === filtroCategoria);

  const textSize = compact ? "text-[11px]" : "text-sm";

  return (
    <div
      className={cn("relative space-y-3 rounded-lg transition-colors", trascinando && "bg-primary/5 ring-2 ring-primary/40 ring-offset-4")}
      onDragOver={(e) => { e.preventDefault(); if (!trascinando) setTrascinando(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setTrascinando(false); }}
      onDrop={(e) => { e.preventDefault(); setTrascinando(false); void caricaFile(Array.from(e.dataTransfer.files)); }}
    >
      {trascinando && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 text-sm font-medium text-primary">
          Rilascia qui i file per caricarli
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt"
        multiple
        onChange={handleFileChange}
      />

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className={`w-full gap-1.5 ${compact ? "h-7 text-[11px]" : "h-8 text-xs"}`}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Carica
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={`w-full gap-1.5 ${compact ? "h-7 text-[11px]" : "h-8 text-xs"}`}
          onClick={() => setOpenapiOpen(true)}
          title="Ordina una visura camerale o un documento ufficiale dai registri: arriva qui, collegato al contatto"
        >
          <Landmark className="h-3.5 w-3.5" />
          Documento ufficiale
        </Button>
      </div>

      <OpenapiDocRequestDialog
        open={openapiOpen}
        onOpenChange={setOpenapiOpen}
        contactId={contactId}
        opportunityId={opportunityId}
        companyId={companyId}
        defaultVat={contactVat ?? undefined}
      />

      {/* Categorie: filtro con conteggi, solo quelle in uso */}
      {documents.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFiltroCategoria("tutte")}
            className={cn("rounded-full border px-2.5 py-1 text-[11px]", filtroCategoria === "tutte" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
          >
            Tutti {documents.length}
          </button>
          {CATEGORIE_DOCUMENTO.filter((c) => conteggiCategorie[c.chiave] > 0).map((c) => (
            <button
              key={c.chiave}
              type="button"
              onClick={() => setFiltroCategoria(c.chiave)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px]", filtroCategoria === c.chiave ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
            >
              {c.etichetta} {conteggiCategorie[c.chiave]}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className={`${textSize} text-muted-foreground text-center py-4`}>Caricamento...</p>
      ) : documents.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed py-8 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          <Upload className="h-6 w-6 opacity-60" />
          <span className={`${textSize} font-medium`}>Trascina qui i file o clicca per caricarli</span>
          <span className="text-[11px]">PDF, immagini, Word, Excel · max 20 MB</span>
        </button>
      ) : documentiVisibili.length === 0 ? (
        <p className={`${textSize} text-muted-foreground text-center py-6`}>Nessun documento in questa categoria</p>
      ) : (
        <div className="space-y-2">
          {documentiVisibili.map((doc: any) => {
            const anteprimaPossibile = tipoAnteprima(doc.file_type, doc.file_name) != null;
            const autore = doc.uploaded_by ? nomiCaricatori[doc.uploaded_by] : null;
            const rinominando = inRinomina?.id === doc.id;
            return (
              <div key={doc.id} className="flex items-start gap-2 p-2 rounded-lg border bg-muted/20">
                <div className="mt-0.5">{getFileIcon(doc.file_type)}</div>
                <div className="flex-1 min-w-0 space-y-1">
                  {rinominando ? (
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={inRinomina.nome}
                        onChange={(e) => setInRinomina({ id: doc.id, nome: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") salvaNome(); if (e.key === "Escape") setInRinomina(null); }}
                        className="h-7 text-xs"
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={salvaNome} aria-label="Salva nome"><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setInRinomina(null)} aria-label="Annulla"><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <p className={`${textSize} font-medium truncate`} title={doc.file_name}>{doc.file_name}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>{formatDimensione(doc.file_size)}</span>
                    <span>{format(new Date(doc.created_at), "dd MMM yyyy HH:mm", { locale: it })}</span>
                    <span>{autore ? `da ${autore}` : doc.uploaded_by ? "da un utente" : "caricato dal sistema"}</span>
                    {doc.opportunity_id && <Badge variant="outline" className="text-[9px] h-4 px-1">Opportunità</Badge>}
                  </div>
                  <Select
                    value={doc.categoria || "altro"}
                    onValueChange={(v) => aggiornaDocumento.mutate({ id: doc.id, patch: { categoria: v } })}
                  >
                    <SelectTrigger className="h-6 w-auto min-w-[150px] gap-1 px-2 text-[10px]" aria-label="Categoria del documento">
                      <SelectValue>{etichettaCategoria(doc.categoria)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIE_DOCUMENTO.map((c) => <SelectItem key={c.chiave} value={c.chiave}>{c.etichetta}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Sempre visibili: su telefono l'hover non esiste */}
                <div className="flex items-center gap-0.5">
                  {anteprimaPossibile && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Anteprima di ${doc.file_name}`} title="Anteprima" onClick={() => void apriAnteprima(doc)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Rinomina ${doc.file_name}`} title="Rinomina" onClick={() => setInRinomina({ id: doc.id, nome: doc.file_name })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Scarica ${doc.file_name}`}
                    title="Scarica"
                    onClick={async () => {
                      const url = await getSignedUrl(doc.file_url);
                      window.open(url, "_blank");
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    aria-label={`Elimina documento ${doc.file_name}`}
                    title="Elimina"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Eliminare il documento?",
                          description: `"${doc.file_name}" verrà rimosso definitivamente. L'operazione non può essere annullata.`,
                          confirmLabel: "Elimina",
                          variant: "destructive",
                        })
                      ) {
                        deleteMutation.mutate(doc);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!anteprima} onOpenChange={(v) => { if (!v) setAnteprima(null); }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col gap-2">
          <DialogHeader>
            <DialogTitle className="truncate text-sm">{anteprima?.nome}</DialogTitle>
          </DialogHeader>
          {anteprima?.tipo === "immagine" ? (
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-muted/30 rounded">
              <img src={anteprima.url} alt={anteprima.nome} className="max-h-full max-w-full object-contain" />
            </div>
          ) : anteprima ? (
            <iframe src={anteprima.url} title={anteprima.nome} className="flex-1 min-h-0 w-full rounded border" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
