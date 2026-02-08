import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  FileText,
  Image,
  Upload,
  Trash2,
  Download,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  EMPLOYEE_DOCUMENT_TYPES,
  getDocumentTypeLabel,
} from "@/lib/documentTypes";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface EmployeeAttachment {
  id: string;
  employee_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  document_type: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
}

interface EmployeeAttachmentsProps {
  employee: {
    id: string;
    first_name: string;
    last_name: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function EmployeeAttachments({
  employee,
  open,
  onOpenChange,
}: EmployeeAttachmentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [documentType, setDocumentType] = useState<string>("altro");
  const [expiryDate, setExpiryDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Fetch attachments
  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["employee-attachments", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_attachments")
        .select("*")
        .eq("employee_id", employee.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as EmployeeAttachment[];
    },
    enabled: open,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Non autenticato");

      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `employees/${employee.id}/${timestamp}-${sanitizedName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("personnel-attachments")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("personnel-attachments").getPublicUrl(filePath);

      // Save to database
      const { error: dbError } = await supabase
        .from("employee_attachments")
        .insert({
          employee_id: employee.id,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          file_size: file.size,
          document_type: documentType,
          expiry_date: expiryDate?.toISOString().split("T")[0] || null,
          notes: notes || null,
          uploaded_by: user.id,
        });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["employee-attachments", employee.id],
      });
      toast({
        title: "Documento caricato",
        description: "Il documento è stato caricato con successo.",
      });
      resetUploadForm();
    },
    onError: (error) => {
      console.error("Upload error:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il caricamento.",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (attachment: EmployeeAttachment) => {
      // Extract file path from URL
      const urlParts = attachment.file_url.split("/personnel-attachments/");
      if (urlParts.length > 1) {
        const filePath = decodeURIComponent(urlParts[1]);
        await supabase.storage.from("personnel-attachments").remove([filePath]);
      }

      const { error } = await supabase
        .from("employee_attachments")
        .delete()
        .eq("id", attachment.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["employee-attachments", employee.id],
      });
      toast({
        title: "Documento eliminato",
        description: "Il documento è stato eliminato.",
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

  const resetUploadForm = () => {
    setShowUploadForm(false);
    setSelectedFile(null);
    setDocumentType("altro");
    setExpiryDate(undefined);
    setNotes("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File troppo grande",
        description: "Il file non può superare i 10MB.",
        variant: "destructive",
      });
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        title: "Tipo file non supportato",
        description: "Formati supportati: PDF, Word, Excel, immagini.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setShowUploadForm(true);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    await uploadMutation.mutateAsync(selectedFile);
    setIsUploading(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const expiryDate = new Date(date);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiryDate <= thirtyDaysFromNow && expiryDate >= new Date();
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) {
      return <Image className="h-5 w-5 text-blue-500" />;
    }
    return <FileText className="h-5 w-5 text-orange-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documenti - {employee.first_name} {employee.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Button */}
          <div className="flex justify-end">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Carica Documento
            </Button>
          </div>

          {/* Upload Form */}
          {showUploadForm && selectedFile && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="flex items-center gap-2">
                {getFileIcon(selectedFile.type)}
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-muted-foreground text-sm">
                  ({formatFileSize(selectedFile.size)})
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo Documento</Label>
                  <Select value={documentType} onValueChange={setDocumentType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYEE_DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Data Scadenza (opzionale)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {expiryDate
                          ? format(expiryDate, "dd/MM/yyyy", { locale: it })
                          : "Seleziona data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={expiryDate}
                        onSelect={setExpiryDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Note (opzionale)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Note aggiuntive..."
                  rows={2}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={resetUploadForm}>
                  Annulla
                </Button>
                <Button onClick={handleUpload} disabled={isUploading}>
                  {isUploading ? "Caricamento..." : "Carica"}
                </Button>
              </div>
            </div>
          )}

          {/* Attachments List */}
          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Caricamento...
              </div>
            ) : attachments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nessun documento caricato.
              </div>
            ) : (
              <div className="space-y-3">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getFileIcon(attachment.file_type)}
                        <div>
                          <p className="font-medium">{attachment.file_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(attachment.file_size)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a
                            href={attachment.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Eliminare il documento?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Questa azione è irreversibile.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(attachment)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Elimina
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm">
                      {attachment.document_type && (
                        <Badge variant="secondary">
                          {getDocumentTypeLabel(
                            attachment.document_type,
                            EMPLOYEE_DOCUMENT_TYPES
                          )}
                        </Badge>
                      )}
                      {attachment.expiry_date && (
                        <Badge
                          variant={
                            isExpired(attachment.expiry_date)
                              ? "destructive"
                              : isExpiringSoon(attachment.expiry_date)
                              ? "default"
                              : "outline"
                          }
                          className="flex items-center gap-1"
                        >
                          {isExpired(attachment.expiry_date) && (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          Scadenza:{" "}
                          {format(new Date(attachment.expiry_date), "dd/MM/yyyy", {
                            locale: it,
                          })}
                        </Badge>
                      )}
                    </div>

                    {attachment.notes && (
                      <p className="text-sm text-muted-foreground">
                        {attachment.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
