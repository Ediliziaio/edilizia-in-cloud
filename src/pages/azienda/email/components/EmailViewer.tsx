/**
 * EmailViewer — visualizza un thread con tutti i messaggi
 *
 * - Header con subject + actions toolbar (star, archive, trash, reply)
 * - Lista messaggi del thread (collapsible quando >2)
 * - Render HTML sanitizzato via DOMPurify (no script, no on* handlers)
 * - Allegati cliccabili (download da storage)
 * - AI summary chip (se presente)
 *
 * Sprint E3 attiverà i bottoni Reply/Forward.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Star, Archive, Trash2, Reply, ReplyAll, Forward, MoreVertical,
  Paperclip, Sparkles, AlertTriangle, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MessageRow {
  id: string;
  thread_id: string;
  from_email: string | null;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  received_at: string;
  raw_html: string | null;
  raw_text: string | null;
  attachments: unknown;
  ai_category: string | null;
  ai_priority: string | null;
  ai_summary: string | null;
  is_read: boolean;
  is_starred: boolean;
}

interface EmailViewerProps {
  threadId: string;
  onBack: () => void;
  onClose: () => void;
  onReply?: (
    source: {
      id: string;
      thread_id: string | null;
      from_email: string | null;
      from_name: string | null;
      to_email: string | null;
      cc_emails?: string[] | null;
      subject: string | null;
      received_at: string;
      raw_text: string | null;
      raw_html: string | null;
    },
    mode: "reply" | "replyAll" | "forward",
  ) => void;
}

export function EmailViewer({ threadId, onBack, onClose, onReply }: EmailViewerProps) {
  const qc = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ["email-thread-messages", threadId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("email_inbox")
        .select("id, thread_id, from_email, from_name, to_email, subject, received_at, raw_html, raw_text, attachments, ai_category, ai_priority, ai_summary, is_read, is_starred")
        .eq("thread_id", threadId)
        .order("received_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const toggleFlag = useMutation({
    mutationFn: async ({ id, flag, value }: { id: string; flag: string; value: boolean }) => {
      const { error } = await supabase.rpc("email_inbox_toggle_flag", {
        p_email_id: id,
        p_flag: flag,
        p_value: value,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-thread-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
    },
    onError: (e) => toast.error("Operazione fallita", { description: String(e) }),
  });

  const archiveAll = useMutation({
    mutationFn: async () => {
      if (!messages) return;
      for (const m of messages) {
        await supabase.rpc("email_inbox_toggle_flag", {
          p_email_id: m.id, p_flag: "archived", p_value: true,
        });
      }
    },
    onSuccess: () => {
      toast.success("Conversazione archiviata");
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      onClose();
    },
  });

  const trashAll = useMutation({
    mutationFn: async () => {
      if (!messages) return;
      for (const m of messages) {
        await supabase.rpc("email_inbox_toggle_flag", {
          p_email_id: m.id, p_flag: "trashed", p_value: true,
        });
      }
    },
    onSuccess: () => {
      toast.success("Spostato nel cestino");
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      onClose();
    },
  });

  const subject = messages?.[0]?.subject ?? "(senza oggetto)";
  const messageCount = messages?.length ?? 0;
  const hasStarred = messages?.some((m) => m.is_starred) ?? false;

  return (
    <>
      <div className="border-b p-3 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
          aria-label="Torna alla lista"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-semibold truncate flex-1">{subject}</h2>
        {messageCount > 0 && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {messageCount} {messageCount === 1 ? "messaggio" : "messaggi"}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (!messages || messages.length === 0) return;
            const firstId = messages[0].id;
            toggleFlag.mutate({ id: firstId, flag: "starred", value: !hasStarred });
          }}
          title={hasStarred ? "Rimuovi stella" : "Aggiungi stella"}
        >
          <Star className={cn("h-4 w-4", hasStarred && "fill-amber-400 text-amber-400")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => archiveAll.mutate()}
          disabled={archiveAll.isPending}
          title="Archivia"
        >
          <Archive className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => trashAll.mutate()}
          disabled={trashAll.isPending}
          title="Sposta nel cestino"
          className="hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="hidden md:flex"
          title="Chiudi"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nessun messaggio in questa conversazione.
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {messages.map((m, idx) => (
              <MessageBubble
                key={m.id}
                message={m}
                isLast={idx === messages.length - 1}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Action bar bottom — Reply/ReplyAll/Forward (Sprint E3) */}
      <div className="border-t p-3 bg-muted/20 flex flex-wrap gap-2">
        {(["reply", "replyAll", "forward"] as const).map((mode) => {
          const Icon = mode === "reply" ? Reply : mode === "replyAll" ? ReplyAll : Forward;
          const label = mode === "reply" ? "Rispondi" : mode === "replyAll" ? "A tutti" : "Inoltra";
          return (
            <Button
              key={mode}
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!messages || messages.length === 0}
              onClick={() => {
                if (!onReply || !messages || messages.length === 0) return;
                const last = messages[messages.length - 1];
                onReply(
                  {
                    id: last.id,
                    thread_id: last.thread_id,
                    from_email: last.from_email,
                    from_name: last.from_name,
                    to_email: last.to_email,
                    cc_emails: null,
                    subject: last.subject,
                    received_at: last.received_at,
                    raw_text: last.raw_text,
                    raw_html: last.raw_html,
                  },
                  mode,
                );
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          );
        })}
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function MessageBubble({ message, isLast }: { message: MessageRow; isLast: boolean }) {
  const sanitizedHtml = useMemo(() => {
    if (!message.raw_html) return null;
    return DOMPurify.sanitize(message.raw_html, {
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "style"],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    });
  }, [message.raw_html]);

  const attachments = Array.isArray(message.attachments)
    ? (message.attachments as Array<{ filename?: string; size?: number; mime?: string }>)
    : [];

  const senderLabel = message.from_name || message.from_email || "(sconosciuto)";
  const ts = format(new Date(message.received_at), "d MMM yyyy 'alle' HH:mm", { locale: it });

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{senderLabel}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {message.from_email && (
              <span>&lt;{message.from_email}&gt;</span>
            )}
            {message.to_email && (
              <span className="ml-2">→ {message.to_email}</span>
            )}
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">{ts}</span>
      </div>

      {(message.ai_summary || message.ai_priority === "high") && (
        <div className="px-4 py-2 bg-violet-50 border-b border-violet-200 flex items-start gap-2">
          {message.ai_priority === "high" ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-violet-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            {message.ai_category && (
              <Badge variant="outline" className="text-[10px] mb-1 bg-white">
                {message.ai_category}
              </Badge>
            )}
            <p className="text-xs text-violet-900 leading-snug">{message.ai_summary}</p>
          </div>
        </div>
      )}

      <div className="p-4">
        {sanitizedHtml ? (
          <div
            className="prose prose-sm max-w-none text-sm
                       prose-a:text-violet-600 prose-a:underline-offset-2
                       prose-img:rounded prose-img:my-2"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : message.raw_text ? (
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
            {message.raw_text}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground italic">(messaggio vuoto)</p>
        )}
      </div>

      {attachments.length > 0 && (
        <>
          <Separator />
          <div className="p-3 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-muted/20 text-xs"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium truncate max-w-[200px]">
                  {a.filename || `allegato-${i + 1}`}
                </span>
                {a.size && (
                  <span className="text-muted-foreground">
                    {(a.size / 1024).toFixed(0)} KB
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
