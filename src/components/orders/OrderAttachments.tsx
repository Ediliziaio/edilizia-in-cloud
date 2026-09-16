/**
 * Documenti della commessa, divisi nelle cartelle dell'azienda
 * (Impostazioni → Cantieri & Costi → Cartelle documenti).
 *
 * A sinistra le cartelle con il numero di file (su telefono una riga di
 * schede), a destra il contenuto con ricerca. Si caricano tanti file insieme,
 * da pulsante o trascinandoli sulla card o direttamente su una cartella.
 */
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
  FolderOpen,
  AlertTriangle,
  Search,
  Settings2,
  MoreHorizontal,
} from "lucide-react";
import { FileThumb, FilePreviewDialog } from "./filePreview";
import { useSignedUrls, toStoragePath, fmtBytes, fileKind, KIND_LABEL,
         openAttachmentInTab, type PreviewableFile } from "./filePreviewUtils";
import { CaricaDocumentiDialog } from "./CaricaDocumentiDialog";
import { useCartelleDocumenti } from "@/hooks/useCartelleDocumenti";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ACCEPT_INPUT,
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
}

interface OrderAttachmentsProps {
  orderId: string;
  editable?: boolean;
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
  const { data, error } = await supabase.storage
    .from("order-attachments")
    .createSignedUrl(filePath, 3600);
  if (error) {
    logger.error("Signed URL error:", error);
    return null;
  }
  return data.signedUrl;
}

/** Selezione nel pannello: tutte, una cartella, o i file senza cartella. */
const TUTTI = "__tutti";
const SENZA = "__senza";

export function OrderAttachments({ orderId, editable = true }: OrderAttachmentsProps) {
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const puoGestireCartelle = permissions.isAdmin || permissions.canEditSettingsOrders;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { cartelle, isLoading: caricoCartelle } = useCartelleDocumenti();
  const [selezione, setSelezione] = useState<string>(TUTTI);
  const [ricerca, setRicerca] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [sopraCartella, setSopraCartella] = useState<string | null>(null);

  const [dialogAperto, setDialogAperto] = useState(false);
  const [fileDaCaricare, setFileDaCaricare] = useState<File[]>([]);
  const [cartellaDialog, setCartellaDialog] = useState<string | null>(null);
  const [aperture, setAperture] = useState(0);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["order-attachments", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_attachments")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as OrderAttachment[];
    },
    enabled: !!orderId,
  });

  const invalida = () => {
    queryClient.invalidateQueries({ queryKey: ["order-attachments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-documents-summary", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order_attachments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["spazio-archiviazione"] });
  };

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      const { error } = await supabase
        .from("order_attachments")
        .update({ visible_to_customer: visible })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { visible }) => {
      invalida();
      toast.success(visible ? "Ora il cliente vede il documento" : "Documento tornato privato");
    },
    onError: () => toast.error("Visibilità non aggiornata"),
  });

  const spostaMutation = useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) => {
      const { error } = await supabase
        .from("order_attachments")
        .update({ folder_id: folderId } as never)
        .eq("id", id);
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
      const { error } = await supabase
        .from("order_attachments")
        .delete()
        .eq("id", attachment.id);
      if (error) throw error;
      // Il file si toglie dopo la riga: se la riga resta, il file deve restare.
      if (attachment.file_url) {
        await supabase.storage.from("order-attachments").remove([toStoragePath(attachment.file_url)]);
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

  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const { data: signedByPath = {}, isLoading: signingUrls } = useSignedUrls(
    attachments as unknown as PreviewableFile[],
    attachments.length > 0,
  );

  // Una cartella archiviata che contiene ancora file resta nell'elenco.
  const conteggi = useMemo(() => contaPerCartella(attachments), [attachments]);
  const nomeCartella = useMemo(() => {
    const m = new Map(cartelle.map((c) => [c.id, c.nome]));
    return (id: string | null) => (id ? m.get(id) ?? "Cartella archiviata" : "Senza cartella");
  }, [cartelle]);
  const mancanti = useMemo(() => cartelleMancanti(cartelle, attachments), [cartelle, attachments]);
  const orfani = attachments.filter((a) => a.folder_id && !cartelle.some((c) => c.id === a.folder_id)).length;
  const senzaCartella = (conteggi[""] ?? 0) + orfani;

  const visibili = attachments.filter((a) => {
    const inCartella =
      selezione === TUTTI ||
      (selezione === SENZA
        ? !a.folder_id || !cartelle.some((c) => c.id === a.folder_id)
        : a.folder_id === selezione);
    return inCartella && corrispondeRicerca(a.file_name, nomeCartella(a.folder_id), ricerca);
  });
  const nessunoVisibileAlCliente = attachments.length > 0 && !attachments.some((a) => a.visible_to_customer);

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

  const voceCartella = (id: string, etichetta: string, n: number, extra?: { mancante?: boolean; dropId?: string | null }) => {
    const attiva = selezione === id;
    const dropAttivo = editable && extra?.dropId !== undefined;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setSelezione(id)}
        {...(dropAttivo ? {
          onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setSopraCartella(id); },
          onDrop: (e: React.DragEvent) => handleDrop(e, extra!.dropId ?? null),
        } : {})}
        className={[
          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-left transition-colors shrink-0 md:shrink md:w-full",
          "border md:border-0 whitespace-nowrap md:whitespace-normal",
          attiva ? "bg-primary/10 text-primary font-medium border-primary/30" : "hover:bg-muted text-foreground",
          sopraCartella === id ? "ring-2 ring-primary/50 bg-primary/5" : "",
        ].join(" ")}
        aria-current={attiva ? "true" : undefined}
      >
        {id === TUTTI ? (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : attiva ? (
          <FolderOpen className="h-4 w-4 shrink-0" />
        ) : (
          <Folder className={`h-4 w-4 shrink-0 ${n === 0 ? "text-muted-foreground/60" : "text-muted-foreground"}`} />
        )}
        <span className={`flex-1 min-w-0 md:break-words ${n === 0 && !attiva ? "text-muted-foreground" : ""}`}>{etichetta}</span>
        {extra?.mancante && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Cartella obbligatoria vuota" />
        )}
        <span className="text-xs tabular-nums text-muted-foreground">{n}</span>
      </button>
    );
  };

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
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 space-y-0">
        <CardTitle className="flex items-center gap-2 min-w-0 text-base sm:text-lg">
          <Paperclip className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
          <span className="truncate">Documenti commessa</span>
          {attachments.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground tabular-nums">{attachments.length}</span>
          )}
        </CardTitle>
        {editable && (
          <>
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
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline ml-1.5">Carica file</span>
            </Button>
          </>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
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

        <div className="grid gap-3 md:grid-cols-[minmax(180px,240px)_1fr]">
          {/* Cartelle: colonna su desktop, riga scorrevole su telefono */}
          <nav aria-label="Cartelle documenti" className="min-w-0">
            <div className="flex md:flex-col gap-1.5 md:gap-0.5 overflow-x-auto pb-1 md:pb-0 -mx-1 px-1">
              {voceCartella(TUTTI, "Tutti", attachments.length)}
              {caricoCartelle && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground m-2" />}
              {cartelle.map((c) =>
                voceCartella(c.id, c.nome, conteggi[c.id] ?? 0, {
                  mancante: mancanti.some((m) => m.id === c.id),
                  dropId: c.id,
                }),
              )}
              {senzaCartella > 0 && voceCartella(SENZA, "Senza cartella", senzaCartella, { dropId: null })}
            </div>
            {puoGestireCartelle && (
              <Link
                to="/azienda/impostazioni/cartelle-documenti"
                className="hidden md:inline-flex items-center gap-1.5 mt-2 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" /> Gestisci cartelle
              </Link>
            )}
          </nav>

          <div className="min-w-0 space-y-2">
            {attachments.length > 4 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id={`cerca-documenti-${orderId}`}
                  value={ricerca}
                  onChange={(e) => setRicerca(e.target.value)}
                  placeholder={selezione === TUTTI ? "Cerca nei documenti…" : `Cerca in «${selezione === SENZA ? "Senza cartella" : nomeCartella(selezione)}»…`}
                  className="h-9 pl-8"
                />
              </div>
            )}

            {editable && isDragging && (
              <div className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/50 bg-primary/5 py-4 text-sm text-primary">
                <Upload className="h-4 w-4" />
                {sopraCartella && sopraCartella !== TUTTI
                  ? `Rilascia per caricare in «${sopraCartella === SENZA ? "Senza cartella" : nomeCartella(sopraCartella)}»`
                  : "Rilascia qui i file, o su una cartella"}
              </div>
            )}

            {visibili.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {ricerca
                  ? "Nessun documento corrisponde alla ricerca."
                  : selezione === TUTTI
                    ? (editable ? "Nessun documento. Premi «Carica file» o trascina qui i file." : "Nessun documento caricato.")
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
              <div className="space-y-1.5">
                {visibili.map((attachment) => (
                  <AttachmentItem
                    key={attachment.id}
                    attachment={attachment}
                    editable={editable}
                    cartelle={cartelle}
                    nomeCartella={selezione === TUTTI || ricerca ? nomeCartella(attachment.folder_id) : null}
                    signedUrl={signedByPath[toStoragePath(attachment.file_url)]}
                    signing={signingUrls}
                    onPreview={() => setPreviewFile(attachment as unknown as PreviewableFile)}
                    onToggleVisibility={(visible) => toggleVisibilityMutation.mutate({ id: attachment.id, visible })}
                    onMove={(folderId) => spostaMutation.mutate({ id: attachment.id, folderId })}
                    onDelete={() => deleteAttachmentMutation.mutate(attachment)}
                  />
                ))}
              </div>
            )}

            {editable && nessunoVisibileAlCliente && (
              <p className="text-xs text-muted-foreground">
                Il cliente non vede ancora nessun file: usa l'interruttore «Cliente» sui documenti da mostrare nella sua area. Riceverà un'email.
              </p>
            )}
          </div>
        </div>
      </CardContent>

      <FilePreviewDialog
        file={previewFile}
        url={previewFile ? signedByPath[toStoragePath(previewFile.file_url)] : undefined}
        open={!!previewFile}
        onOpenChange={(v) => { if (!v) setPreviewFile(null); }}
      />

      {editable && dialogAperto && (
        <CaricaDocumentiDialog
          key={aperture}
          open={dialogAperto}
          onOpenChange={setDialogAperto}
          orderId={orderId}
          filesIniziali={fileDaCaricare}
          cartelle={cartelle}
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
  signedUrl?: string;
  signing?: boolean;
  onPreview: () => void;
  onToggleVisibility: (visible: boolean) => void;
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
}

function AttachmentItem({
  attachment,
  editable,
  cartelle,
  nomeCartella,
  signedUrl,
  signing,
  onPreview,
  onToggleVisibility,
  onMove,
  onDelete,
}: AttachmentItemProps) {
  const file = attachment as unknown as PreviewableFile;
  const kind = fileKind(file);
  const data = new Date(attachment.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const [confermaElimina, setConfermaElimina] = useState(false);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
      <button
        type="button"
        onClick={onPreview}
        aria-label={`Anteprima di ${attachment.file_name}`}
        className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
      >
        <FileThumb file={file} url={signedUrl} loading={signing} size="sm" />
      </button>

      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onPreview}
          className="text-sm font-medium hover:underline truncate block text-left max-w-full"
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
          <span>{KIND_LABEL[kind]}{fmtBytes(attachment.file_size) ? ` · ${fmtBytes(attachment.file_size)}` : ""} · {data}</span>
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {editable ? (
          <label className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground mr-1 cursor-pointer" title="Visibile al cliente nella sua area">
            {attachment.visible_to_customer ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5" />}
            Cliente
            <Switch
              checked={attachment.visible_to_customer}
              onCheckedChange={onToggleVisibility}
              aria-label="Visibile al cliente"
            />
          </label>
        ) : attachment.visible_to_customer ? (
          <Eye className="h-3.5 w-3.5 text-emerald-600 mr-1" aria-label="Visibile al cliente" />
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Scarica ${attachment.file_name}`}
          onClick={() => openAttachmentInTab(attachment.file_url)}
        >
          <Download className="h-4 w-4" />
        </Button>

        {editable && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Altre azioni per ${attachment.file_name}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto w-64">
                <DropdownMenuItem className="sm:hidden" onSelect={() => onToggleVisibility(!attachment.visible_to_customer)}>
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
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfermaElimina(true)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Elimina
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
