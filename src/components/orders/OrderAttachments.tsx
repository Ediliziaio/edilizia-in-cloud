import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Paperclip, 
  Upload, 
  Eye, 
  EyeOff, 
  Trash2, 
  FileText, 
  Download,
  Loader2 
} from "lucide-react";

// Shared MIME whitelist
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const MAX_FILES_PER_ORDER = 20;

export function isValidMimeType(type: string): boolean {
  return ALLOWED_MIME_TYPES.includes(type);
}

interface OrderAttachment {
  id: string;
  order_id: string;
  file_name: string;
  file_url: string; // Now stores relative path
  file_type: string;
  file_size: number;
  visible_to_customer: boolean;
  created_at: string;
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
    console.error("Signed URL error:", error);
    return null;
  }
  return data.signedUrl;
}

export function OrderAttachments({ orderId, editable = true }: OrderAttachmentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Fetch attachments
  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["order-attachments", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_attachments")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as OrderAttachment[];
    },
    enabled: !!orderId,
  });

  // Toggle visibility mutation
  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      const { error } = await supabase
        .from("order_attachments")
        .update({ visible_to_customer: visible })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-attachments", orderId] });
      toast({
        title: "Visibilità aggiornata",
        description: "La visibilità del documento è stata aggiornata.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'aggiornamento.",
        variant: "destructive",
      });
    },
  });

  // Delete attachment mutation
  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachment: OrderAttachment) => {
      // file_url now stores the relative path
      const filePath = attachment.file_url;
      if (filePath) {
        await supabase.storage.from("order-attachments").remove([filePath]);
      }

      const { error } = await supabase
        .from("order_attachments")
        .delete()
        .eq("id", attachment.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-attachments", orderId] });
      toast({
        title: "Documento eliminato",
        description: "Il documento è stato eliminato con successo.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione.",
        variant: "destructive",
      });
    },
  });

  // Upload file handler
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate MIME type
    if (!isValidMimeType(file.type)) {
      toast({
        title: "Tipo file non consentito",
        description: "Formati supportati: PDF, Word, Excel, immagini (JPEG, PNG, GIF).",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File troppo grande",
        description: "La dimensione massima consentita è 10MB.",
        variant: "destructive",
      });
      return;
    }

    // Validate max files per order
    if (attachments.length >= MAX_FILES_PER_ORDER) {
      toast({
        title: "Limite file raggiunto",
        description: `Massimo ${MAX_FILES_PER_ORDER} file per ordine.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Generate unique file path
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `orders/${orderId}/${timestamp}-${sanitizedName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("order-attachments")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save relative path to database (not public URL)
      const { error: dbError } = await supabase
        .from("order_attachments")
        .insert({
          order_id: orderId,
          file_name: file.name,
          file_url: filePath, // relative path, not public URL
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
          visible_to_customer: false,
        });

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ["order-attachments", orderId] });
      toast({
        title: "Documento caricato",
        description: "Il documento è stato caricato con successo.",
      });
      setUploadDialogOpen(false);
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Errore durante il caricamento",
        description: "Si è verificato un errore. Riprova.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Upload multiple files (for drag-and-drop)
  const uploadMultipleFiles = useCallback(async (fileList: File[]) => {
    if (!user || uploading) return;

    const remaining = MAX_FILES_PER_ORDER - attachments.length;
    if (remaining <= 0) {
      toast({ title: "Limite file raggiunto", description: `Massimo ${MAX_FILES_PER_ORDER} file per ordine.`, variant: "destructive" });
      return;
    }

    const validFiles = fileList.slice(0, remaining).filter(file => {
      if (!isValidMimeType(file.type)) {
        toast({ title: "Tipo file non consentito", description: `"${file.name}" non è un formato valido.`, variant: "destructive" });
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "File troppo grande", description: `"${file.name}" supera il limite di 10MB.`, variant: "destructive" });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setUploading(true);
    try {
      for (const file of validFiles) {
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const filePath = `orders/${orderId}/${timestamp}-${sanitizedName}`;

        const { error: uploadError } = await supabase.storage.from("order-attachments").upload(filePath, file);
        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from("order_attachments").insert({
          order_id: orderId, file_name: file.name, file_url: filePath,
          file_type: file.type, file_size: file.size, uploaded_by: user.id, visible_to_customer: false,
        });
        if (dbError) throw dbError;
      }

      queryClient.invalidateQueries({ queryKey: ["order-attachments", orderId] });
      toast({ title: "Documenti caricati", description: `${validFiles.length} file caricati con successo.` });
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Errore durante il caricamento", description: "Si è verificato un errore. Riprova.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [user, uploading, attachments.length, orderId, queryClient, toast]);

  // Drag-and-drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false); dragCounter.current = 0;
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) uploadMultipleFiles(droppedFiles);
  };

  const visibleAttachments = attachments.filter(a => a.visible_to_customer);
  const internalAttachments = attachments.filter(a => !a.visible_to_customer);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            Documenti Ordine
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

  return (
    <Card
      {...(editable ? {
        onDragEnter: handleDragEnter,
        onDragLeave: handleDragLeave,
        onDragOver: handleDragOver,
        onDrop: handleDrop,
      } : {})}
      className={`relative transition-colors ${editable && isDragging ? "border-dashed border-2 border-primary/50 bg-primary/5" : ""}`}
    >
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          Documenti Ordine
        </CardTitle>
        {editable && (
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={attachments.length >= MAX_FILES_PER_ORDER}>
                <Upload className="h-4 w-4 mr-2" />
                Carica File
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Carica Documento</DialogTitle>
                <DialogDescription>
                  Carica un documento per questo ordine. Per impostazione predefinita,
                  il documento sarà visibile solo all'azienda.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full"
                  variant="outline"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Caricamento...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Seleziona File
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Formati supportati: PDF, Word, Excel, immagini. Max 10MB. ({attachments.length}/{MAX_FILES_PER_ORDER} file)
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                  Annulla
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drag overlay */}
        {editable && isDragging && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-primary/5 border-2 border-dashed border-primary/50 pointer-events-none">
            <Upload className="h-10 w-10 text-primary/60 mb-2" />
            <p className="text-sm font-medium text-primary/70">Trascina i file qui</p>
          </div>
        )}

        {attachments.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            {editable ? "Nessun documento caricato. Carica o trascina i file qui." : "Nessun documento caricato"}
          </p>
        ) : (
          <>
            {visibleAttachments.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Visibili al cliente ({visibleAttachments.length})
                </h4>
                <div className="space-y-2">
                  {visibleAttachments.map((attachment) => (
                    <AttachmentItem
                      key={attachment.id}
                      attachment={attachment}
                      editable={editable}
                      onToggleVisibility={(visible) =>
                        toggleVisibilityMutation.mutate({ id: attachment.id, visible })
                      }
                      onDelete={() => deleteAttachmentMutation.mutate(attachment)}
                    />
                  ))}
                </div>
              </div>
            )}

            {internalAttachments.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <EyeOff className="h-4 w-4" />
                  Solo uso interno ({internalAttachments.length})
                </h4>
                <div className="space-y-2">
                  {internalAttachments.map((attachment) => (
                    <AttachmentItem
                      key={attachment.id}
                      attachment={attachment}
                      editable={editable}
                      onToggleVisibility={(visible) =>
                        toggleVisibilityMutation.mutate({ id: attachment.id, visible })
                      }
                      onDelete={() => deleteAttachmentMutation.mutate(attachment)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface AttachmentItemProps {
  attachment: OrderAttachment;
  editable: boolean;
  onToggleVisibility: (visible: boolean) => void;
  onDelete: () => void;
}

function AttachmentItem({
  attachment,
  editable,
  onToggleVisibility,
  onDelete,
}: AttachmentItemProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  const handleDownload = async () => {
    if (signedUrl) {
      window.open(signedUrl, "_blank");
      return;
    }
    setLoadingUrl(true);
    const url = await getSignedUrl(attachment.file_url);
    setLoadingUrl(false);
    if (url) {
      setSignedUrl(url);
      window.open(url, "_blank");
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
      <span className="text-lg">{getFileIcon(attachment.file_type)}</span>
      
      <div className="flex-1 min-w-0">
        <button
          onClick={handleDownload}
          className="text-sm font-medium hover:underline truncate block text-left"
          disabled={loadingUrl}
        >
          {attachment.file_name}
        </button>
        <span className="text-xs text-muted-foreground">
          {formatFileSize(attachment.file_size)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {editable && (
          <>
            <div className="flex items-center gap-2">
              <Switch
                checked={attachment.visible_to_customer}
                onCheckedChange={onToggleVisibility}
              />
              <Badge
                variant={attachment.visible_to_customer ? "default" : "secondary"}
                className={attachment.visible_to_customer 
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" 
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                }
              >
                {attachment.visible_to_customer ? (
                  <>
                    <Eye className="h-3 w-3 mr-1" />
                    Visibile
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3 w-3 mr-1" />
                    Privato
                  </>
                )}
              </Badge>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare il documento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Questa azione è irreversibile. Il documento "{attachment.file_name}" verrà eliminato permanentemente.
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

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleDownload}
          disabled={loadingUrl}
        >
          {loadingUrl ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
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
      return data as OrderAttachment[];
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
