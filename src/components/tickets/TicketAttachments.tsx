import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Download, Loader2 } from "lucide-react";

interface TicketAttachmentsProps {
  ticketId: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function getFileName(url: string): string {
  try {
    const parts = url.split("/");
    const last = parts[parts.length - 1];
    // Remove UUID prefix if present (format: uuid_filename)
    const underscoreIdx = last.indexOf("_");
    if (underscoreIdx > 30) return decodeURIComponent(last.substring(underscoreIdx + 1));
    return decodeURIComponent(last);
  } catch {
    return "file";
  }
}

function isImage(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
}

export function TicketAttachments({ ticketId }: TicketAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadMutation.mutate(files);
  };

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: queryKeys.ticketAttachments.byTicket(ticketId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("id, attachment_url, created_at")
        .eq("ticket_id", ticketId)
        .not("attachment_url", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((m) => m.attachment_url);
    },
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!user) throw new Error("Non autenticato");

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`"${file.name}" supera il limite di 10MB`);
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
          throw new Error(`"${file.name}": tipo file non supportato`);
        }

        const ext = file.name.split(".").pop() || "bin";
        const path = `${ticketId}/${crypto.randomUUID()}_${file.name}`;

        const { error: uploadErr } = await supabase.storage
          .from("ticket-attachments")
          .upload(path, file, { contentType: file.type });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from("ticket-attachments")
          .getPublicUrl(path);

        const { error: msgErr } = await supabase.from("ticket_messages").insert({
          ticket_id: ticketId,
          sender_id: user.id,
          message: `📎 ${file.name}`,
          attachment_url: urlData.publicUrl,
        });
        if (msgErr) throw msgErr;
      }
    },
    onSuccess: () => {
      toast({ title: "Caricato", description: "Allegato caricato con successo." });
      queryClient.invalidateQueries({ queryKey: ["ticket-attachments", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin-ticket-messages", ticketId] });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) uploadMutation.mutate(files);
    e.target.value = "";
  };

  return (
    <Card
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg backdrop-blur-sm">
          <Upload className="h-8 w-8 text-primary mb-2" />
          <p className="text-sm font-medium text-primary">Rilascia per caricare</p>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Allegati</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Caricamento...</p>
        ) : attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Nessun allegato</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {attachments.map((a) => {
              const url = a.attachment_url!;
              const name = getFileName(url);
              const img = isImage(url);
              return (
                <a
                  key={a.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors group"
                >
                  {img ? (
                    <img src={url} alt={name} className="h-8 w-8 rounded object-cover flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-xs truncate flex-1">{name}</span>
                  <Download className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
