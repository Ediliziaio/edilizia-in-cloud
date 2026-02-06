import { useState, useRef } from "react";
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

interface OrderAttachment {
  id: string;
  order_id: string;
  file_name: string;
  file_url: string;
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

export function OrderAttachments({ orderId, editable = true }: OrderAttachmentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      // Extract file path from URL
      const urlParts = attachment.file_url.split("/order-attachments/");
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
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

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File troppo grande",
        description: "La dimensione massima consentita è 10MB.",
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

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("order-attachments")
        .getPublicUrl(filePath);

      // Save to database
      const { error: dbError } = await supabase
        .from("order_attachments")
        .insert({
          order_id: orderId,
          file_name: file.name,
          file_url: publicUrl,
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          Documenti Ordine
        </CardTitle>
        {editable && (
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
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
                  Formati supportati: PDF, Word, Excel, immagini. Max 10MB.
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
        {attachments.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Nessun documento caricato
          </p>
        ) : (
          <>
            {/* Visible to Customer Section */}
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

            {/* Internal Only Section */}
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
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
      <span className="text-lg">{getFileIcon(attachment.file_type)}</span>
      
      <div className="flex-1 min-w-0">
        <a
          href={attachment.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium hover:underline truncate block"
        >
          {attachment.file_name}
        </a>
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

        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
            <Download className="h-4 w-4" />
          </a>
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
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as OrderAttachment[];
    },
    enabled: !!orderId,
  });

  // Don't show the card if there are no documents
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
            <div
              key={attachment.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
            >
              <span className="text-lg">{getFileIcon(attachment.file_type)}</span>
              
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">
                  {attachment.file_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.file_size)}
                </span>
              </div>

              <Button variant="outline" size="sm" asChild>
                <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2" />
                  Scarica
                </a>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
