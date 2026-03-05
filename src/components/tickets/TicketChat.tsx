import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, User, Paperclip, X, FileText, Download, Image as ImageIcon } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import type { TicketMessage } from "@/types/tickets";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = "image/*,.pdf,.doc,.docx,.xls,.xlsx";

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(url);
}

function getFileName(url: string) {
  try {
    const parts = url.split("/");
    const last = parts[parts.length - 1];
    // Remove UUID prefix if present (format: uuid-filename)
    const match = last.match(/^[0-9a-f-]{36}-(.+)$/i);
    return match ? decodeURIComponent(match[1]) : decodeURIComponent(last);
  } catch {
    return "file";
  }
}

interface TicketChatProps {
  ticketId: string;
  messages: TicketMessage[];
  customerId?: string;
  disabled?: boolean;
  disabledMessage?: string;
  invalidateKeys?: string[][];
  height?: string;
}

export function TicketChat({
  ticketId,
  messages,
  customerId,
  disabled = false,
  disabledMessage,
  invalidateKeys = [],
  height = "calc(100vh - 400px)",
}: TicketChatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newMessage, setNewMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const channel = supabase
      .channel(`ticket-messages-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => {
          invalidateKeys.forEach((key) =>
            queryClient.invalidateQueries({ queryKey: key })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, queryClient, invalidateKeys]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File troppo grande",
        description: "La dimensione massima consentita è 10MB.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${ticketId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("ticket-attachments")
      .upload(path, file, { contentType: file.type });
    if (error) throw error;

    const { data } = supabase.storage
      .from("ticket-attachments")
      .getPublicUrl(path);
    // For private buckets we use createSignedUrl instead
    const { data: signedData, error: signedErr } = await supabase.storage
      .from("ticket-attachments")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

    if (signedErr || !signedData?.signedUrl) {
      // Fallback to path-based reference
      return path;
    }
    return signedData.signedUrl;
  };

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let attachmentUrl: string | null = null;

      if (selectedFile) {
        attachmentUrl = await uploadFile(selectedFile);
      }

      const insertData: {
        ticket_id: string;
        sender_id: string;
        message: string;
        attachment_url?: string;
      } = {
        ticket_id: ticketId,
        sender_id: user!.id,
        message: newMessage.trim() || (selectedFile ? `📎 ${selectedFile.name}` : ""),
      };

      if (attachmentUrl) {
        insertData.attachment_url = attachmentUrl;
      }

      const { error } = await supabase
        .from("ticket_messages")
        .insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMessage("");
      setSelectedFile(null);
      setUploading(false);
      invalidateKeys.forEach((key) =>
        queryClient.invalidateQueries({ queryKey: key })
      );
    },
    onError: () => {
      setUploading(false);
      toast({
        title: "Errore",
        description: "Impossibile inviare il messaggio. Riprova.",
        variant: "destructive",
      });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedFile) return;
    sendMessageMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((newMessage.trim() || selectedFile) && !sendMessageMutation.isPending) {
        sendMessageMutation.mutate();
      }
    }
  };

  const renderAttachment = (url: string, isSelf: boolean) => {
    if (isImageUrl(url)) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2">
          <img
            src={url}
            alt="Allegato"
            className="max-w-[240px] max-h-[180px] rounded-md object-cover border"
            loading="lazy"
          />
        </a>
      );
    }
    const fileName = getFileName(url);
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 mt-2 px-3 py-2 rounded-md text-xs font-medium ${
          isSelf
            ? "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
            : "bg-muted-foreground/10 text-foreground hover:bg-muted-foreground/20"
        }`}
      >
        <FileText className="h-4 w-4 flex-shrink-0" />
        <span className="truncate max-w-[180px]">{fileName}</span>
        <Download className="h-3.5 w-3.5 flex-shrink-0" />
      </a>
    );
  };

  return (
    <Card className="flex flex-col" style={{ height, minHeight: "300px" }}>
      <CardHeader className="border-b flex-shrink-0">
        <CardTitle className="text-lg">Conversazione</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isSelf = msg.sender_id === user?.id;
          const senderName = msg.sender
            ? `${msg.sender.first_name} ${msg.sender.last_name}`
            : "Utente";

          return (
            <div
              key={msg.id}
              className={`flex ${isSelf ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  isSelf
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {!isSelf && (
                  <div className="flex items-center gap-1 mb-1">
                    <User className="h-3 w-3" />
                    <span className="text-xs font-medium">{senderName}</span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                {msg.attachment_url && renderAttachment(msg.attachment_url, isSelf)}
                <p
                  className={`text-xs mt-1 ${
                    isSelf
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatDateTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </CardContent>

      {disabled ? (
        disabledMessage && (
          <div className="border-t p-4 text-center text-sm text-muted-foreground">
            {disabledMessage}
          </div>
        )
      ) : (
        <div className="border-t p-4 flex-shrink-0">
          {selectedFile && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted rounded-md text-sm">
              {selectedFile.type.startsWith("image/") ? (
                <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="truncate flex-1">{selectedFile.name}</span>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {(selectedFile.size / 1024 / 1024).toFixed(1)}MB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => setSelectedFile(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="flex-shrink-0 h-auto"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi un messaggio... (Enter per inviare, Shift+Enter per a capo)"
              rows={2}
              className="resize-none"
            />
            <Button
              type="submit"
              size="icon"
              disabled={(!newMessage.trim() && !selectedFile) || sendMessageMutation.isPending || uploading}
              className="flex-shrink-0 h-auto"
            >
              {sendMessageMutation.isPending || uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}
