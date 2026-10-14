/**
 * Documenti della commessa, divisi nelle cartelle dell'azienda
 * (Impostazioni → Cantieri & Costi → Cartelle documenti).
 *
 * Filtro categorie compatto; l'esplorazione delle cartelle resta facoltativa.
 * Si caricano tanti file insieme, da pulsante o trascinandoli sulla card
 * o direttamente su una cartella nella vista di esplorazione.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { logger } from "@/utils/logger";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Paperclip,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  FileText,
  Download,
  Loader2,
  Folder,
  FolderInput,
  AlertTriangle,
  Search,
  MoreHorizontal,
  LayoutGrid,
  List,
  X,
} from "lucide-react";
import { FileThumb } from "./filePreview";
import { useUrlMiniature, toStoragePath, fmtBytes, fileKind, KIND_LABEL, KIND_TINT,
         scaricaAllegato, attachmentStorage, type PreviewableFile } from "./filePreviewUtils";
import { CaricaDocumentiDialog } from "./CaricaDocumentiDialog";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { useCartelleDocumenti } from "@/hooks/useCartelleDocumenti";
import { DocumentFoldersNavigation } from "./DocumentFoldersNavigation";
import { usePermissions } from "@/hooks/usePermissions";
import { BUCKET_DOCUMENTI_CLIENTE, ETICHETTA_DOCUMENTO_CLIENTE } from "@/lib/clienti/documentiCliente";
import {
  ACCEPT_INPUT,
  cartellaDocumentiCliente,
  cartelleMancanti,
  contaPerCartella,
  corrispondeRicerca,
  problemaFile,
  type CartellaDocumenti,
} from "@/lib/commesse/documentiCommessa";

interface OrderAttachment {
  id: string;
  order_id: string;
  file_name: string;
  file_url: string; // percorso relativo nel bucket
  file_type: string;
  file_size: number;
  visible_to_customer: boolean;
  created_at: string;
  folder_id: string | null;
  /** Miniatura creata al caricamento e salvata accanto al file. */
  thumb_path?: string | null;
  /** Documento personale del cliente (carta d'identità, CF…): sta sul cliente, qui solo si consulta. */
  daCliente?: { tipo: string };
}

interface OrderAttachmentsProps {
  orderId: string;
  editable?: boolean;
  actions?: ReactNode;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string) {
  if (fileType.includes("pdf")) return "📄";
  if (fileType.includes("image")) return "🖼️";
  if (fileType.includes("word") || fileType.includes("document")) return "📝";
  if (fileType.includes("sheet") || fileType.includes("excel")) return "📊";
  return "📎";
}

/** Generate a signed URL (1h) from a relative file path */
async function getSignedUrl(filePath: string): Promise<string | null> {
  const target = attachmentStorage(filePath);
  const { data, error } = await supabase.storage
    .from(target.bucket)
    .createSignedUrl(target.path, 3600);
  if (error) {
    logger.error("Signed URL error:", error);
    return null;
  }
  return data.signedUrl;
}

/** Selezione nel pannello: tutte, una cartella, o i file senza cartella. */
const TUTTI = "__tutti";
const SENZA = "__senza";

export function OrderAttachments(props: OrderAttachmentsProps) {
  // Filtri e conferme appartengono alla commessa, non alla pagina riutilizzata.
  return <OrderAttachmentsPanel key={props.orderId} {...props} />;
}

function OrderAttachmentsPanel({ orderId, editable = true, actions }: OrderAttachmentsProps) {
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const puoGestireCartelle = permissions.isAdmin || permissions.canEditSettingsOrders;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { cartelle, isLoading: caricoCartelle, isError: erroreCartelle, refetch: rileggiCartelle } = useCartelleDocumenti({ tutte: true });
  const cartelleAttive = cartelle.filter(c => !c.archiviata_at);
  const [selezione, setSelezione] = useState<string>(TUTTI);
  const [ricerca, setRicerca] = useState("");
  const [visibilita, setVisibilita] = useState<"tutti" | "interni" | "condivisi">("tutti");
  const [isDragging, setIsDragging] = useState(false);
  const [sopraCartella, setSopraCartella] = useState<string | null>(null);

  const [dialogAperto, setDialogAperto] = useState(false);
  const [fileDaCaricare, setFileDaCaricare] = useState<File[]>([]);
  const [cartellaDialog, setCartellaDialog] = useState<string | null>(null);
  const [aperture, setAperture] = useState(0);

  const { data: attachments = [], isLoading, isError: erroreAllegati, refetch: rileggiAllegati } = useQuery({
    queryKey: ["order-attachments", orderId],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      return loadCatalogPages<OrderAttachment>((from, to) => supabase
        .from("order_attachments")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: OrderAttachment[] | null; error: { message: string } | null }>);
    },
    enabled: !!orderId,
  });

  // Documenti personali del cliente della commessa: si mostrano nella
  // cartella documenti cliente, senza copiarli.
  const { data: righeCliente = [], isError: erroreCliente, isFetching: caricoCliente, refetch: rileggiCliente } = useQuery({
    queryKey: ["documenti-cliente-commessa", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("documenti_cliente_della_commessa" as never, { p_order_id: orderId } as never);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string; document_type: string; file_name: string; file_path: string;
        file_type: string | null; file_size: number | null; created_at: string; thumb_path: string | null;
      }[];
    },
  });
  const cartellaCliente = useMemo(() => cartellaDocumentiCliente(cartelle), [cartelle]);
  const documentiCliente = useMemo<OrderAttachment[]>(
    () => righeCliente.map((d) => ({
      id: `cliente-${d.id}`,
      order_id: orderId,
      file_name: d.file_name,
      file_url: d.file_path,
      file_type: d.file_type ?? "",
      file_size: d.file_size ?? 0,
      visible_to_customer: false,
      created_at: d.created_at,
      folder_id: cartellaCliente,
      thumb_path: d.thumb_path,
      daCliente: { tipo: d.document_type },
    })),
    [righeCliente, cartellaCliente, orderId],
  );
  const tutti = useMemo(() => [...attachments, ...documentiCliente], [attachments, documentiCliente]);

  const invalida = () => {
    queryClient.invalidateQueries({ queryKey: ["order-attachments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-documents-summary", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order_attachments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["customer-order-attachments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["spazio-archiviazione"] });
    queryClient.invalidateQueries({ queryKey: ["cartelle-documenti-uso"] });
  };

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      if (!editable) throw new Error("Commessa in sola lettura");
      const { data, error } = await supabase
        .from("order_attachments")
        .update({ visible_to_customer: visible })
        .eq("id", id)
        .eq("order_id", orderId)
        .select("id, visible_to_customer")
        .maybeSingle();
      if (error) throw error;
      if (!data || data.visible_to_customer !== visible) throw new Error("Documento non aggiornato");
    },
    onSuccess: (_d, { visible }) => {
      invalida();
      toast.success(visible ? "Ora il cliente vede il documento" : "Documento tornato privato");
    },
    onError: () => toast.error("Visibilità non aggiornata"),
  });

  const spostaMutation = useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) => {
      if (!editable) throw new Error("Commessa in sola lettura");
      if (folderId && !cartelleAttive.some(c => c.id === folderId)) throw new Error("Cartella non disponibile per nuovi file");
      const { error } = await supabase
        .from("order_attachments")
        .update({ folder_id: folderId } as never)
        .eq("id", id)
        .eq("order_id", orderId)
        .select("id").single();
      if (error) throw error;
    },
    onMutate: async ({ id, folderId }) => {
      const key = ["order-attachments", orderId];
      const prima = queryClient.getQueryData<OrderAttachment[]>(key);
      if (prima) queryClient.setQueryData(key, prima.map((a) => (a.id === id ? { ...a, folder_id: folderId } : a)));
      return { prima };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prima) queryClient.setQueryData(["order-attachments", orderId], ctx.prima);
      toast.error("Documento non spostato");
    },
    onSuccess: (_d, { folderId }) => {
      const nome = cartelle.find((c) => c.id === folderId)?.nome ?? "Senza cartella";
      toast.success(`Spostato in «${nome}»`);
    },
    onSettled: invalida,
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachment: OrderAttachment) => {
      if(attachment.file_url.startsWith("order-variation-documents/")) throw new Error("Originale conservato: annulla la proposta senza eliminare i documenti.");
      const { error } = await supabase
        .from("order_attachments")
        .delete()
        .eq("id", attachment.id);
      if (error) throw error;
      // Il file si toglie dopo la riga: se la riga resta, il file deve restare.
      if (attachment.file_url) {
        const daTogliere = [toStoragePath(attachment.file_url), ...(attachment.thumb_path ? [attachment.thumb_path] : [])];
        await supabase.storage.from("order-attachments").remove(daTogliere);
      }
    },
    onSuccess: () => {
      invalida();
      toast.success("Documento eliminato");
    },
    onError: () => toast.error("Documento non eliminato"),
  });

  const apriCaricamento = (files: File[], cartellaId: string | null) => {
    const buoni = files.filter((f) => {
      const problema = problemaFile(f);
      if (problema) toast.error("File escluso", { description: problema });
      return !problema;
    });
    if (buoni.length === 0) return;
    setFileDaCaricare(buoni);
    setCartellaDialog(cartellaId);
    setAperture((n) => n + 1);
    setDialogAperto(true);
  };

  /** Cartella «aperta»: è quella proposta ai file senza indizi nel nome. */
  const cartellaAperta = selezione !== TUTTI && selezione !== SENZA ? selezione : null;

  // Trascinamento sulla card (cartella aperta) o su una cartella precisa.
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.types?.includes("Files")) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    // relatedTarget fuori dalla card = si è usciti davvero.
    const dentro = e.relatedTarget instanceof Node && (e.currentTarget as Node).contains(e.relatedTarget);
    if (!dentro) { setIsDragging(false); setSopraCartella(null); }
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent, cartellaId: string | null = cartellaAperta) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false); setSopraCartella(null);
    apriCaricamento(Array.from(e.dataTransfer.files), cartellaId);
  };

  // Miniature salvate al caricamento: un solo gruppo di URL firmati per bucket.
  const { data: miniCommessa = {} } = useUrlMiniature(attachments.map((a) => a.thumb_path), attachments.length > 0);
  const { data: miniCliente = {} } = useUrlMiniature(documentiCliente.map((a) => a.thumb_path), documentiCliente.length > 0, BUCKET_DOCUMENTI_CLIENTE);
  const miniaturaDi = (a: OrderAttachment) =>
    a.thumb_path ? (a.daCliente ? miniCliente : miniCommessa)[a.thumb_path] : undefined;
  const scarica = (a: OrderAttachment) => {
    void scaricaAllegato(a.file_url, a.file_name, a.daCliente ? BUCKET_DOCUMENTI_CLIENTE : undefined);
  };

  // Elenco o griglia con anteprime: la scelta resta per questo browser.
  const [vista, setVista] = useState<"elenco" | "griglia">(() => {
    try { return localStorage.getItem("documenti-commessa-vista") === "griglia" ? "griglia" : "elenco"; } catch { return "elenco"; }
  });
  const cambiaVista = (v: "elenco" | "griglia") => {
    setVista(v);
    try { localStorage.setItem("documenti-commessa-vista", v); } catch { /* solo comodità */ }
  };

  // Una cartella archiviata che contiene ancora file resta nell'elenco.
  const conteggi = useMemo(() => contaPerCartella(tutti), [tutti]);
  const nomeCartella = useMemo(() => {
    const m = new Map(cartelle.map((c) => [c.id, c.nome]));
    return (id: string | null) => (id ? m.get(id) ?? "Cartella archiviata" : "Senza cartella");
  }, [cartelle]);
  const mancanti = useMemo(() => cartelleMancanti(cartelle, tutti), [cartelle, tutti]);
  const orfani = tutti.filter((a) => a.folder_id && !cartelle.some((c) => c.id === a.folder_id)).length;
  const senzaCartella = (conteggi[""] ?? 0) + orfani;

  const visibili = tutti.filter((a) => {
    const inCartella =
      selezione === TUTTI ||
      (selezione === SENZA
        ? !a.folder_id || !cartelle.some((c) => c.id === a.folder_id)
        : a.folder_id === selezione);
    const condiviso = !a.daCliente && a.visible_to_customer;
    return inCartella && (visibilita === "tutti" || (visibilita === "condivisi" ? condiviso : !condiviso))
      && corrispondeRicerca(a.file_name, nomeCartella(a.folder_id), ricerca);
  });
  const condivisi = attachments.filter(a => a.visible_to_customer).length;
  const filtriAttivi = selezione !== TUTTI || !!ricerca || visibilita !== "tutti";
  const azzeraFiltri = () => { setSelezione(TUTTI); setRicerca(""); setVisibilita("tutti"); };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Paperclip className="h-5 w-5" />
            Documenti commessa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }
  if (erroreAllegati || erroreCartelle) return <Card><CardHeader><CardTitle>Documenti commessa</CardTitle></CardHeader><CardContent>
    <div role="alert" className="space-y-2 text-sm text-destructive"><p>Documenti o categorie non disponibili. Non possiamo confermare che siano vuoti.</p>
      <Button type="button" variant="outline" onClick={() => { void rileggiAllegati(); void rileggiCartelle(); }}>Riprova</Button>
    </div>
  </CardContent></Card>;

  return (
    <Card
      {...(editable ? {
        onDragEnter: handleDragEnter,
        onDragLeave: handleDragLeave,
        onDragOver: handleDragOver,
        onDrop: (e: React.DragEvent) => handleDrop(e),
      } : {})}
      className={`relative transition-colors ${editable && isDragging ? "border-dashed border-2 border-primary/50" : ""}`}
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3 space-y-0">
        <CardTitle className="flex items-center gap-2 min-w-0 text-base sm:text-lg">
          <Paperclip className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
          <span className="truncate">Documenti commessa</span>
          {tutti.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{tutti.length}</span>
          )}
        </CardTitle>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <input
              ref={fileInputRef}
              id={`documenti-commessa-${orderId}`}
              type="file"
              multiple
              accept={ACCEPT_INPUT}
              className="hidden"
              onChange={(e) => {
                apriCaricamento(Array.from(e.target.files ?? []), cartellaAperta);
                e.target.value = "";
              }}
            />
            <Button size="sm" aria-label="Carica file" className="min-h-11 shrink-0 font-semibold" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1.5 hidden sm:inline">Carica file</span><span className="ml-1.5 sm:hidden">Carica</span>
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {erroreCliente && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"><span>Documenti del cliente non disponibili. L'elenco mostra solo gli allegati della commessa.</span><Button type="button" variant="outline" size="sm" onClick={() => { void rileggiCliente(); }}>Riprova documenti cliente</Button></div>}
        {caricoCliente && <p role="status" className="text-xs text-muted-foreground">Verifica documenti del cliente…</p>}
        {mancanti.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>Mancano:</strong>{" "}
              {mancanti.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <button type="button" className="underline underline-offset-2" onClick={() => setSelezione(c.id)}>
                    {c.nome}
                  </button>
                </span>
              ))}
            </span>
          </div>
        )}

        <div className="space-y-3">
          {tutti.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Visibilità documenti" className="flex flex-wrap gap-1">
              {([
                ["tutti", "Tutti", tutti.length],
                ["interni", "Interni", tutti.length - condivisi],
                ["condivisi", "Condivisi con cliente", condivisi],
              ] as const).map(([value, label, count]) => <Button key={value} type="button" size="sm"
                variant={visibilita === value ? "secondary" : "ghost"} className="min-h-10 gap-2"
                aria-label={`${label}: ${count} documenti`}
                aria-pressed={visibilita === value} onClick={() => setVisibilita(value)}>
                {value === "condivisi" ? <><span className="sm:hidden">Condivisi</span><span className="hidden sm:inline">{label}</span></> : label}
                <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
              </Button>)}
            </div>
            {filtriAttivi && <Button type="button" variant="ghost" size="sm" onClick={azzeraFiltri}>
              <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Azzera filtri
            </Button>}
          </div>}
          <div className="flex flex-col gap-2 xl:flex-row xl:items-start">
          <DocumentFoldersNavigation
            compact
            cartelle={cartelle} conteggi={conteggi} totale={tutti.length} senzaCartella={senzaCartella}
            mancanti={mancanti.map((c) => c.id)} loading={caricoCartelle}
            selezione={selezione} onSelect={setSelezione} puoGestireCartelle={puoGestireCartelle}
            sopraCartella={sopraCartella}
            onDragOverCartella={editable ? (_e, id) => setSopraCartella(id) : undefined}
            onDropCartella={editable ? handleDrop : undefined}
          />

            {tutti.length > 0 && (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id={`cerca-documenti-${orderId}`}
                      value={ricerca}
                      aria-label="Cerca documenti"
                      onChange={(e) => setRicerca(e.target.value)}
                      placeholder={selezione === TUTTI ? "Cerca nei documenti…" : `Cerca in «${selezione === SENZA ? "Senza cartella" : nomeCartella(selezione)}»…`}
                      className="h-11 pl-8"
                    />
                  </div>
                <div className="flex shrink-0 rounded-md border p-0.5" role="group" aria-label="Vista documenti">
                  <Button
                    type="button" size="icon" variant={vista === "griglia" ? "secondary" : "ghost"} className="h-10 w-10"
                    onClick={() => cambiaVista("griglia")} aria-pressed={vista === "griglia"} aria-label="Vista con anteprime"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button" size="icon" variant={vista === "elenco" ? "secondary" : "ghost"} className="h-10 w-10"
                    onClick={() => cambiaVista("elenco")} aria-pressed={vista === "elenco"} aria-label="Vista elenco"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-2">
            {editable && isDragging && (
              <div className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/50 bg-primary/5 py-4 text-sm text-primary">
                <Upload className="h-4 w-4" />
                {sopraCartella && sopraCartella !== TUTTI
                  ? `Rilascia per caricare in «${sopraCartella === SENZA ? "Senza cartella" : nomeCartella(sopraCartella)}»`
                  : "Rilascia qui i file, o su una cartella"}
              </div>
            )}

            {visibili.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground max-sm:py-4 max-sm:text-xs">
                {filtriAttivi
                  ? <><p>Nessun documento con questi filtri.</p><Button type="button" variant="link" onClick={azzeraFiltri}>Mostra tutti i documenti</Button></>
                  : selezione === TUTTI
                    ? (editable ? (
                        <>
                          {/* Dal telefono non si trascina: basta «Carica file». */}
                          <span className="max-sm:hidden">Nessun documento. Premi «Carica file» o trascina qui i file.</span>
                          <span className="sm:hidden">Nessun documento.</span>
                        </>
                      ) : "Nessun documento caricato.")
                    : editable
                      ? (
                        <>
                          Nessun documento in questa cartella.{" "}
                          <button type="button" className="underline underline-offset-2 text-foreground" onClick={() => fileInputRef.current?.click()}>
                            Carica file
                          </button>{" "}
                          o trascinali qui.
                        </>
                      )
                      : "Nessun documento in questa cartella."}
              </div>
            ) : (
              <div className={vista === "griglia" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" : "overflow-hidden rounded-xl border divide-y bg-background"}>
                {visibili.map((attachment) => (
                  <AttachmentItem
                    key={attachment.id}
                    attachment={attachment}
                    editable={editable}
                    cartelle={cartelleAttive}
                    nomeCartella={selezione === TUTTI || ricerca ? nomeCartella(attachment.folder_id) : null}
                    thumbUrl={miniaturaDi(attachment)}
                    vista={vista}
                    visibilityPending={toggleVisibilityMutation.isPending}
                    onPreview={() => scarica(attachment)}
                    onToggleVisibility={(visible) => toggleVisibilityMutation.mutate({ id: attachment.id, visible })}
                    onMove={(folderId) => spostaMutation.mutate({ id: attachment.id, folderId })}
                    onDelete={() => deleteAttachmentMutation.mutate(attachment)}
                  />
                ))}
              </div>
            )}

            {tutti.length > 0 && <p role="status" className="text-xs text-muted-foreground flex flex-wrap justify-between gap-2 pt-1">
              <span>{visibili.length} di {tutti.length} documenti</span>
              <span>{condivisi === 0 ? "Nessun documento condiviso con il cliente" : `${condivisi} documenti condivisi con il cliente`}</span>
            </p>}
          </div>
        </div>
      </CardContent>


      {editable && dialogAperto && (
        <CaricaDocumentiDialog
          key={aperture}
          open={dialogAperto}
          onOpenChange={setDialogAperto}
          orderId={orderId}
          filesIniziali={fileDaCaricare}
          cartelle={cartelleAttive}
          cartellaPredefinita={cartellaDialog}
        />
      )}
    </Card>
  );
}

interface AttachmentItemProps {
  attachment: OrderAttachment;
  editable: boolean;
  cartelle: CartellaDocumenti[];
  /** Nome cartella da mostrare sotto il file (vista «Tutti» o ricerca). */
  nomeCartella: string | null;
  /** URL firmato della miniatura salvata al caricamento. */
  thumbUrl?: string;
  vista: "elenco" | "griglia";
  visibilityPending: boolean;
  /** Clic sul file: lo scarica. */
  onPreview: () => void;
  onToggleVisibility: (visible: boolean) => void;
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
}

/** Scarica + menu (cliente, sposta, elimina): uguale in elenco e in griglia. */
function AzioniDocumento({
  attachment, editable, cartelle, onToggleVisibility, onMove, onDelete, visibilityPending, compatta,
}: Pick<AttachmentItemProps, "attachment" | "editable" | "cartelle" | "onToggleVisibility" | "onMove" | "onDelete" | "visibilityPending"> & {
  compatta: boolean;
}) {
  const daCliente = attachment.daCliente;
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [confermaVisibilita, setConfermaVisibilita] = useState(false);
  return (
    <div className={`flex items-center gap-1 shrink-0 ${compatta ? "" : "col-span-2 justify-end sm:col-span-1"}`}>
      {!daCliente && !compatta && (editable ? <Button type="button" variant="ghost" size="sm"
        className={`min-h-10 gap-1.5 text-xs ${attachment.visible_to_customer ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
        disabled={visibilityPending} aria-label={`Visibilità di ${attachment.file_name}: ${attachment.visible_to_customer ? "condiviso con cliente" : "interno"}`}
        onClick={() => setConfermaVisibilita(true)}>
        {attachment.visible_to_customer ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {attachment.visible_to_customer ? "Condiviso" : "Interno"}
      </Button> : <span className={`mr-2 text-xs ${attachment.visible_to_customer ? "text-emerald-700" : "text-muted-foreground"}`}>
        {attachment.visible_to_customer ? "Condiviso con cliente" : "Interno"}
      </span>)}

      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        aria-label={`Scarica ${attachment.file_name}`}
        onClick={(e) => {
          e.stopPropagation();
          void scaricaAllegato(attachment.file_url, attachment.file_name, daCliente ? BUCKET_DOCUMENTI_CLIENTE : undefined);
        }}
      >
        <Download className="h-4 w-4" />
      </Button>

      {editable && !daCliente && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Altre azioni per ${attachment.file_name}`} onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto w-64">
              <DropdownMenuItem disabled={visibilityPending} onSelect={() => setConfermaVisibilita(true)}>
                {attachment.visible_to_customer ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                {attachment.visible_to_customer ? "Nascondi al cliente" : "Mostra al cliente"}
              </DropdownMenuItem>
              <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground font-normal">
                <FolderInput className="h-3.5 w-3.5" /> Sposta in…
              </DropdownMenuLabel>
              {cartelle.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  disabled={c.id === attachment.folder_id}
                  onSelect={() => onMove(c.id)}
                  className="pl-7"
                >
                  {c.nome}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={attachment.file_url.startsWith("order-variation-documents/")} className="text-destructive focus:text-destructive" onSelect={() => setConfermaElimina(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialog open={confermaVisibilita} onOpenChange={setConfermaVisibilita}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{attachment.visible_to_customer ? "Rendere interno il documento?" : "Condividere con il cliente?"}</AlertDialogTitle>
                <AlertDialogDescription>
                  «{attachment.file_name}». {attachment.visible_to_customer
                    ? "Non sarà più visibile nell'area cliente. Eventuali copie già scaricate restano al cliente."
                    : "Sarà visibile nell'area cliente. La condivisione può inviare una notifica: controlla che il file sia quello corretto."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction disabled={visibilityPending} onClick={() => onToggleVisibility(!attachment.visible_to_customer)}>
                  {attachment.visible_to_customer ? "Rendi interno" : "Condividi documento"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={confermaElimina} onOpenChange={setConfermaElimina}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare il documento?</AlertDialogTitle>
                <AlertDialogDescription>
                  «{attachment.file_name}» verrà eliminato definitivamente dalla commessa.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

function AttachmentItem(props: AttachmentItemProps) {
  const { attachment, nomeCartella, thumbUrl, vista, onPreview } = props;
  const daCliente = attachment.daCliente;
  const file = attachment as unknown as PreviewableFile;
  const kind = fileKind(file);
  const data = new Date(attachment.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const peso = fmtBytes(attachment.file_size);

  if (vista === "griglia") {
    return (
      <div className="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40">
        <button
          type="button"
          onClick={onPreview}
          aria-label={`Scarica ${attachment.file_name}`}
          className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <FileThumb file={file} thumbUrl={thumbUrl} size="tile" />
          <span className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TINT[kind]}`}>
            {KIND_LABEL[kind]}
          </span>
          {daCliente && (
            <span className="absolute right-1.5 top-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              Dal cliente
            </span>
          )}
        </button>
        <div className="flex items-start gap-1 px-2.5 py-2 min-w-0">
          <button type="button" onClick={onPreview} className="min-w-0 flex-1 text-left" title={attachment.file_name}>
            <span className="block break-words text-xs font-medium [overflow-wrap:anywhere]">{attachment.file_name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {nomeCartella ? `${nomeCartella} · ` : ""}{peso ? `${peso} · ` : ""}{data}
            </span>
            {!daCliente && <span className="block text-[11px] text-muted-foreground">{attachment.visible_to_customer ? "Condiviso con cliente" : "Interno"}</span>}
          </button>
          <AzioniDocumento {...props} compatta />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-3 transition-colors hover:bg-muted/30 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <button
        type="button"
        onClick={onPreview}
        aria-label={`Scarica ${attachment.file_name}`}
        className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
      >
        <FileThumb file={file} thumbUrl={thumbUrl} size="sm" />
      </button>

      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onPreview}
          className="block max-w-full break-words text-left text-sm font-medium hover:underline [overflow-wrap:anywhere]"
          title={attachment.file_name}
        >
          {attachment.file_name}
        </button>
        <span className="text-xs text-muted-foreground flex flex-wrap gap-x-1.5">
          {nomeCartella && (
            <span className="inline-flex items-center gap-1 text-foreground/70">
              <Folder className="h-3 w-3" /> {nomeCartella} ·
            </span>
          )}
          {daCliente && (
            <span className="text-sky-700 dark:text-sky-400">
              Dal cliente: {ETICHETTA_DOCUMENTO_CLIENTE[daCliente.tipo] ?? "documento"} ·
            </span>
          )}
          <span>{KIND_LABEL[kind]}{peso ? ` · ${peso}` : ""} · {data}</span>
        </span>
      </div>

      <AzioniDocumento {...props} compatta={false} />
    </div>
  );
}

// Customer-facing component (read-only, only shows visible documents)
export function CustomerOrderAttachments({ orderId }: { orderId: string }) {
  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["customer-order-attachments", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_attachments")
        .select("*")
        .eq("order_id", orderId)
        .eq("visible_to_customer", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as OrderAttachment[];
    },
    enabled: !!orderId,
  });

  if (isLoading || attachments.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documenti
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <CustomerAttachmentItem key={attachment.id} attachment={attachment} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerAttachmentItem({ attachment }: { attachment: OrderAttachment }) {
  const [loadingUrl, setLoadingUrl] = useState(false);

  const handleDownload = async () => {
    setLoadingUrl(true);
    const url = await getSignedUrl(attachment.file_url);
    setLoadingUrl(false);
    if (url) {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
      <span className="text-lg">{getFileIcon(attachment.file_type)}</span>
      
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">
          {attachment.file_name}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatFileSize(attachment.file_size)}
        </span>
      </div>

      <Button variant="outline" size="sm" onClick={handleDownload} disabled={loadingUrl}>
        {loadingUrl ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Scarica
      </Button>
    </div>
  );
}
