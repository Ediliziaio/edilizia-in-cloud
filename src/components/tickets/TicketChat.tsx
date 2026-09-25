import { useState, useRef, useEffect, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, User, Paperclip, X, FileText, Download, Image as ImageIcon, MessageSquare, Upload, Sparkles, BookOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/formatters";
import type { TicketMessage } from "@/types/tickets";
import { useIsMobile } from "@/hooks/use-mobile";

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

/** Pulsante-icona della toolbar del composer (allega / bozza AI / KB). */
function ToolbarIconButton({
  icon,
  tooltip,
  onClick,
  disabled,
  loading,
  className,
}: {
  icon: ReactNode;
  tooltip: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`tap-compact flex-shrink-0 h-auto max-sm:h-8 max-sm:w-8 ${className ?? ""}`}
            onClick={onClick}
            disabled={disabled}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TicketChat({
  ticketId,
  messages,
  customerId: _customerId,
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
  const isMobile = useIsMobile();
  const [newMessage, setNewMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [kbLoading, setKbLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File troppo grande", description: "La dimensione massima consentita è 10MB.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  };

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
    if (file.size > MAX_FILE_SIZE) {
      throw new Error("La dimensione massima consentita è 10MB.");
    }
    const path = `${ticketId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("ticket-attachments")
      .upload(path, file, { contentType: file.type });
    if (error) throw error;

    const { data: signedData, error: signedErr } = await supabase.storage
      .from("ticket-attachments")
      .createSignedUrl(path, 60 * 60 * 24); // 24 hours

    if (signedErr || !signedData?.signedUrl) {
      return path;
    }
    return signedData.signedUrl;
  };

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Sessione non valida. Ricarica la pagina e riprova.");
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
        sender_id: user.id,
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
    onError: (err: Error) => {
      setUploading(false);
      toast({
        title: "Errore",
        description: err.message || "Impossibile inviare il messaggio. Riprova.",
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

  // Bozza risposta AI: usa support-ai-chat per suggerire la prossima risposta
  // dell'operatore a partire dalla conversazione del ticket.
  const handleAiDraft = async () => {
    if (aiDrafting || messages.length === 0) return;
    setAiDrafting(true);
    try {
      const conversation = messages.map((m) => ({
        role: m.sender_id === user?.id ? "assistant" : "user",
        content: m.message,
      }));
      const { data, error } = await supabase.functions.invoke("support-ai-chat", {
        body: { action: "chat", conversation },
      });
      if (error) throw error;
      const draft = (data?.reply ?? "").trim();
      if (!draft) {
        toast({
          title: "Nessuna bozza",
          description: "L'AI non ha prodotto una risposta. Riprova.",
          variant: "destructive",
        });
        return;
      }
      setNewMessage(draft);
      toast({ title: "Bozza generata", description: "Rivedi e modifica prima di inviare." });
    } catch (err) {
      toast({
        title: "Errore AI",
        description: err instanceof Error ? err.message : "Impossibile generare la bozza.",
        variant: "destructive",
      });
    } finally {
      setAiDrafting(false);
    }
  };

  // Knowledge Base: cerca nella KB (silvio-kb-search) l'articolo più pertinente
  // alla domanda del cliente e lo inserisce nella risposta.
  const handleKbLookup = async () => {
    if (kbLoading) return;
    let lastCustomer: TicketMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id !== user?.id) {
        lastCustomer = messages[i];
        break;
      }
    }
    const query = (newMessage.trim() || lastCustomer?.message || "").trim();
    if (query.length < 3) {
      toast({
        title: "Niente da cercare",
        description: "Scrivi una domanda o attendi un messaggio del cliente.",
        variant: "destructive",
      });
      return;
    }
    setKbLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("silvio-kb-search", {
        body: { query, top_k: 3 },
      });
      if (error) throw error;
      const results = (data?.results ?? []) as Array<{ title?: string; content?: string }>;
      if (!results.length) {
        toast({ title: "Nessun articolo trovato", description: "La Knowledge Base non ha risposte pertinenti." });
        return;
      }
      const top = results[0];
      const snippet = `📚 ${top.title ?? "Articolo KB"}\n\n${(top.content ?? "").trim()}`;
      setNewMessage((prev) => (prev.trim() ? `${prev}\n\n${snippet}` : snippet));
      toast({
        title: "Articolo KB inserito",
        description:
          results.length > 1
            ? `${results.length} articoli trovati: inserito il più pertinente.`
            : "Inserito nella risposta.",
      });
    } catch (err) {
      toast({
        title: "Errore KB",
        description: err instanceof Error ? err.message : "Ricerca KB non riuscita.",
        variant: "destructive",
      });
    } finally {
      setKbLoading(false);
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
    <Card
      className="flex flex-col relative"
      style={{ height, minHeight: "300px" }}
      onDragEnter={disabled ? undefined : handleDragEnter}
      onDragLeave={disabled ? undefined : handleDragLeave}
      onDragOver={disabled ? undefined : handleDragOver}
      onDrop={disabled ? undefined : handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg backdrop-blur-sm">
          <Upload className="h-10 w-10 text-primary mb-2" />
          <p className="text-sm font-medium text-primary">Rilascia per allegare</p>
        </div>
      )}
      <CardHeader className="border-b flex-shrink-0 max-sm:px-3 max-sm:py-2.5">
        <CardTitle className="text-lg max-sm:text-sm">Conversazione</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 max-sm:py-6">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nessun messaggio</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Scrivi il primo messaggio per iniziare la conversazione.</p>
          </div>
        )}
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
        <div className="border-t p-4 flex-shrink-0 max-sm:p-2">
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
          {/* Mobile: una barra sola, arrotondata: graffetta, bozza AI, testo che
              prende tutto lo spazio, invio. Prima tre icone da 44px lasciavano
              al testo 100px e il segnaposto andava su tre righe. */}
          <form onSubmit={handleSend} className="flex gap-2 max-sm:items-center max-sm:gap-0.5 max-sm:rounded-3xl max-sm:border max-sm:bg-background max-sm:py-1 max-sm:pl-1 max-sm:pr-1">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleFileSelect}
            />
            <ToolbarIconButton
              icon={<Paperclip className="h-4 w-4" />}
              tooltip="Allega file (max 10MB)"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            />
            <ToolbarIconButton
              icon={<Sparkles className="h-4 w-4" />}
              loading={aiDrafting}
              tooltip={
                messages.length === 0
                  ? "Bozza AI disponibile dopo il primo messaggio"
                  : "Genera bozza risposta con AI"
              }
              onClick={handleAiDraft}
              disabled={aiDrafting || uploading || messages.length === 0}
              className="text-violet-600 hover:text-violet-700 dark:text-violet-400"
            />
            {!isMobile && (
              <ToolbarIconButton
                icon={<BookOpen className="h-4 w-4" />}
                loading={kbLoading}
                tooltip="Cerca in Knowledge Base e inserisci"
                onClick={handleKbLookup}
                disabled={kbLoading || uploading}
                className="text-sky-600 hover:text-sky-700 dark:text-sky-400"
              />
            )}
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isMobile ? "Scrivi un messaggio" : "Scrivi un messaggio... (Enter per inviare, Shift+Enter per a capo)"}
              rows={isMobile ? 1 : 2}
              maxLength={2000}
              className="resize-none max-sm:min-h-[36px] max-sm:border-0 max-sm:px-2 max-sm:py-2 max-sm:shadow-none max-sm:focus-visible:ring-0 max-sm:focus-visible:ring-offset-0"
            />
            <Button
              type="submit"
              size="icon"
              disabled={(!newMessage.trim() && !selectedFile) || sendMessageMutation.isPending || uploading}
              className="tap-compact flex-shrink-0 h-auto max-sm:h-9 max-sm:w-9 max-sm:rounded-full"
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
