import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ALLOWED_MIME_TYPES, MAX_FILES_PER_ORDER, isValidMimeType } from "./OrderAttachments";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FORMATS = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.includes("pdf")) return "📄";
  if (type.includes("image")) return "🖼️";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("sheet") || type.includes("excel")) return "📊";
  return "📎";
}

interface PendingFilesUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export function PendingFilesUpload({ files, onFilesChange }: PendingFilesUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid: File[] = [];

    const remaining = MAX_FILES_PER_ORDER - files.length;
    if (remaining <= 0) {
      toast.error("Limite file raggiunto", {
        description: `Massimo ${MAX_FILES_PER_ORDER} file per ordine.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    for (const file of selected) {
      if (valid.length >= remaining) {
        toast.warning("Limite file", {
          description: `Solo ${remaining} file possono essere ancora aggiunti.`,
        });
        break;
      }
      if (!isValidMimeType(file.type)) {
        toast.error("Tipo file non consentito", {
          description: `"${file.name}" non è un formato valido. Supportati: PDF, Word, Excel, immagini.`,
        });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error("File troppo grande", {
          description: `"${file.name}" supera il limite di 10MB.`,
        });
        continue;
      }
      valid.push(file);
    }

    if (valid.length > 0) {
      onFilesChange([...files, ...valid]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          Documenti Ordine
        </CardTitle>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept={ACCEPTED_FORMATS}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES_PER_ORDER}
          >
            <Upload className="h-4 w-4 mr-2" />
            Carica File
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Nessun documento selezionato. I file verranno caricati alla creazione dell'ordine.
          </p>
        ) : (
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
              >
                <span className="text-lg">{getFileIcon(file.type)}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-center pt-1">
              Formati: PDF, Word, Excel, immagini. Max 10MB per file. ({files.length}/{MAX_FILES_PER_ORDER})
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
