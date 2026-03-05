import { useState, useRef, useEffect } from "react";
import { Paperclip, Upload, X, FileText, Image, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface OrderItemAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
}

interface OrderItemAttachmentsProps {
  itemId: string;
  itemName: string;
  attachments: OrderItemAttachment[];
  editable?: boolean;
  onAttachmentsChange: () => void;
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** Helper: get signed URL for a file_url that may be a relative path or full URL */
async function getSignedDownloadUrl(fileUrl: string): Promise<string> {
  // If it's a relative path (no http), use it directly
  let filePath = fileUrl;
  // If it's a full URL, extract path after bucket name
  if (fileUrl.startsWith("http")) {
    const parts = fileUrl.split("/order-attachments/");
    if (parts.length > 1) {
      filePath = decodeURIComponent(parts[1]);
    } else {
      return fileUrl; // fallback
    }
  }
  const { data, error } = await supabase.storage
    .from("order-attachments")
    .createSignedUrl(filePath, 3600);
  if (error || !data?.signedUrl) return fileUrl;
  return data.signedUrl;
}

/** Helper: extract storage path from file_url */
function extractStoragePath(fileUrl: string): string {
  if (fileUrl.startsWith("http")) {
    const parts = fileUrl.split("/order-attachments/");
    if (parts.length > 1) return decodeURIComponent(parts[1]);
  }
  return fileUrl;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) {
    return <Image className="h-4 w-4" />;
  }
  return <FileText className="h-4 w-4" />;
}

function ImageThumbnail({ fileUrl, fileName }: { fileUrl: string; fileName: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    getSignedDownloadUrl(fileUrl).then(setSrc);
  }, [fileUrl]);
  return src ? (
    <img src={src} alt={fileName} className="h-10 w-10 object-cover rounded" />
  ) : (
    <div className="h-10 w-10 flex items-center justify-center bg-muted rounded">
      <Image className="h-5 w-5" />
    </div>
  );
}

export function OrderItemAttachments({
  itemId,
  itemName,
  attachments,
  editable = true,
  onAttachmentsChange,
}: OrderItemAttachmentsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        title: "Tipo file non supportato",
        description: "Formati accettati: JPG, PNG, WEBP, PDF, DOC, DOCX",
        variant: "destructive",
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File troppo grande",
        description: "La dimensione massima è 10MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${itemId}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("order-attachments")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save relative path (not public URL) for signed URL access
      const { error: dbError } = await supabase
        .from("order_item_attachments")
        .insert({
          order_item_id: itemId,
          file_name: file.name,
          file_url: filePath,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
        });

      if (dbError) throw dbError;

      toast({
        title: "File caricato",
        description: `${file.name} allegato con successo`,
      });

      onAttachmentsChange();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Errore caricamento",
        description: error.message || "Impossibile caricare il file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (attachment: OrderItemAttachment) => {
    setDeleting(attachment.id);

    try {
      // Extract file path (supports both relative paths and legacy full URLs)
      const filePath = extractStoragePath(attachment.file_url);
      await supabase.storage.from("order-attachments").remove([filePath]);

      // Delete database record
      const { error } = await supabase
        .from("order_item_attachments")
        .delete()
        .eq("id", attachment.id);

      if (error) throw error;

      toast({
        title: "File eliminato",
        description: `${attachment.file_name} rimosso`,
      });

      onAttachmentsChange();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Errore eliminazione",
        description: error.message || "Impossibile eliminare il file",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const openFile = async (fileUrl: string) => {
    const signedUrl = await getSignedDownloadUrl(fileUrl);
    window.open(signedUrl, "_blank");
  };

  return (
    <>
      {/* Compact view for item row */}
      <div className="flex items-center gap-1 flex-wrap">
        {attachments.slice(0, 3).map((att) => (
          <button
            key={att.id}
            onClick={() => openFile(att.file_url)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded hover:bg-muted/80 transition-colors"
            title={att.file_name}
          >
            {getFileIcon(att.file_type)}
            <span className="max-w-[60px] truncate">{att.file_name}</span>
          </button>
        ))}
        {attachments.length > 3 && (
          <span className="text-xs text-muted-foreground">
            +{attachments.length - 3}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={() => setDialogOpen(true)}
        >
          <Paperclip className="h-3 w-3 mr-1" />
          {attachments.length > 0 ? attachments.length : "Allega"}
        </Button>
      </div>

      {/* Full dialog for managing attachments */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Allegati: {itemName}
            </DialogTitle>
            <DialogDescription>
              {editable
                ? "Gestisci i documenti e le foto allegati a questo articolo"
                : "Visualizza gli allegati di questo articolo"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Upload section */}
            {editable && (
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES.join(",")}
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={uploading}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Caricamento...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Carica File
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  JPG, PNG, PDF, DOC - Max 10MB
                </p>
              </div>
            )}

            {/* Attachments list */}
            {attachments.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nessun allegato
              </p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-card"
                  >
                    <button
                      onClick={() => openFile(att.file_url)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left hover:text-primary transition-colors"
                    >
                      {att.file_type.startsWith("image/") ? (
                        <ImageThumbnail fileUrl={att.file_url} fileName={att.file_name} />
                      ) : (
                        <div className="h-10 w-10 flex items-center justify-center bg-muted rounded">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{att.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(att.file_size)}
                        </p>
                      </div>
                    </button>

                    {editable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(att)}
                        disabled={deleting === att.id}
                      >
                        {deleting === att.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
