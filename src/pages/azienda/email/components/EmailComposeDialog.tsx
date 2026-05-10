/**
 * EmailComposeDialog — finestra compose Gmail-like (Sprint E3)
 *
 * Modi: new (vuoto) | reply (pre-popolato Re:/quote) | replyAll | forward (Fwd:/quote)
 *
 * - Auto-save bozza in email_outbox ogni 30s (debounced) con status='draft'
 * - Send → status='queued' → invoca edge email-send → status='sending'/'sent'
 * - TipTap rich editor sarebbe ideale, qui per E3 manteniamo textarea +
 *   conversione newline → <br> per HTML basico (E5 upgrade a TipTap)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Send, Loader2, Save, Mail, X, Paperclip, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface ComposeContext {
  mode: ComposeMode;
  /** Email originale (per reply/forward) */
  source?: {
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
  } | null;
  /** Valori iniziali per "new" */
  initialTo?: string[];
  initialSubject?: string;
}

interface EmailComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: ComposeContext;
}

const SUBJECT_PREFIX_RE = /^\s*(re|fwd?|i|aw|wg|sv|tr)\s*[:\-\[]\s*/i;

function stripPrefix(subject: string | null): string {
  if (!subject) return "";
  let s = subject;
  while (SUBJECT_PREFIX_RE.test(s)) s = s.replace(SUBJECT_PREFIX_RE, "");
  return s.trim();
}

function buildQuoteText(src: ComposeContext["source"]): string {
  if (!src) return "";
  const date = new Date(src.received_at).toLocaleString("it-IT");
  const sender = src.from_name ? `${src.from_name} <${src.from_email}>` : src.from_email;
  const sep = "\n\n----- Messaggio originale -----\n";
  const header = `Da: ${sender}\nData: ${date}\nOggetto: ${src.subject ?? ""}\n\n`;
  const body = src.raw_text || (src.raw_html ? src.raw_html.replace(/<[^>]+>/g, "") : "");
  const quoted = body.split("\n").map((l) => `> ${l}`).join("\n");
  return sep + header + quoted;
}

export function EmailComposeDialog({ open, onOpenChange, context }: EmailComposeDialogProps) {
  const qc = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const userId = user?.id;
  const companyId = effectiveCompany?.id;

  const initial = useMemo(() => {
    const src = context.source;
    if (context.mode === "reply" || context.mode === "replyAll") {
      const baseSubject = stripPrefix(src?.subject ?? "");
      const quote = buildQuoteText(src ?? undefined);
      const recipients = src?.from_email ? [src.from_email] : [];
      const cc = context.mode === "replyAll" && src?.cc_emails
        ? src.cc_emails
        : [];
      return {
        to: recipients.join(", "),
        cc: cc.join(", "),
        bcc: "",
        subject: `Re: ${baseSubject}`,
        body: `\n\n${quote}`,
        inReplyToId: src?.id ?? null,
        threadId: src?.thread_id ?? null,
      };
    }
    if (context.mode === "forward") {
      const baseSubject = stripPrefix(src?.subject ?? "");
      const quote = buildQuoteText(src ?? undefined);
      return {
        to: "",
        cc: "",
        bcc: "",
        subject: `Fwd: ${baseSubject}`,
        body: `\n\n${quote}`,
        inReplyToId: null,
        threadId: src?.thread_id ?? null,
      };
    }
    return {
      to: (context.initialTo ?? []).join(", "),
      cc: "",
      bcc: "",
      subject: context.initialSubject ?? "",
      body: "",
      inReplyToId: null,
      threadId: null,
    };
  }, [context]);

  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [bcc, setBcc] = useState(initial.bcc);
  const [showCcBcc, setShowCcBcc] = useState(initial.cc.length > 0 || initial.bcc.length > 0);
  const [subject, setSubject] = useState(initial.subject);
  const [bodyText, setBodyText] = useState(initial.body);
  const [accountId, setAccountId] = useState<string>("");
  const [outboxId, setOutboxId] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Reset state quando cambia context
  useEffect(() => {
    if (!open) return;
    setTo(initial.to);
    setCc(initial.cc);
    setBcc(initial.bcc);
    setSubject(initial.subject);
    setBodyText(initial.body);
    setShowCcBcc(initial.cc.length > 0 || initial.bcc.length > 0);
    setOutboxId(null);
  }, [open, initial]);

  // Carica connessioni per account selector (default: prima active)
  const { data: connections } = useQuery({
    queryKey: ["email-compose-accounts", userId, companyId],
    enabled: !!userId && !!companyId && open,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, email_address, status")
        .eq("company_id", companyId!)
        .eq("user_id", userId!)
        .eq("status", "active");
      return (data ?? []) as Array<{ id: string; provider: string; email_address: string; status: string }>;
    },
  });

  useEffect(() => {
    if (!accountId && connections && connections.length > 0) {
      setAccountId(connections[0].id);
    }
  }, [connections, accountId]);

  // Parse comma-separated emails
  const parseEmails = (raw: string): string[] =>
    raw.split(",").map((e) => e.trim()).filter((e) => e.length > 0);

  // Auto-save bozza ogni 30s (debounced)
  const saveDraft = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!userId || !companyId) throw new Error("Not authenticated");
      const payload = {
        user_id: userId,
        company_id: companyId,
        oauth_connection_id: accountId || null,
        thread_id: initial.threadId,
        in_reply_to_id: initial.inReplyToId,
        to_emails: parseEmails(to),
        cc_emails: parseEmails(cc),
        bcc_emails: parseEmails(bcc),
        subject: subject || "(senza oggetto)",
        body_text: bodyText,
        body_html: bodyText.split("\n").map((l) => `<p>${escapeHtml(l) || "<br/>"}</p>`).join(""),
        status: "draft" as const,
      };
      if (outboxId) {
        const { error } = await supabase
          .from("email_outbox")
          .update(payload)
          .eq("id", outboxId);
        if (error) throw error;
        return outboxId;
      } else {
        const { data, error } = await supabase
          .from("email_outbox")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onMutate: () => setAutoSaveStatus("saving"),
    onSuccess: (id) => {
      setOutboxId(id);
      setAutoSaveStatus("saved");
    },
    onError: () => setAutoSaveStatus("error"),
  });

  // Debounce auto-save
  const debounceTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!to && !subject && !bodyText) return; // niente da salvare
    debounceTimerRef.current = window.setTimeout(() => {
      saveDraft.mutate();
    }, 5000);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, bodyText, accountId, open]);

  // Send
  const sendMutation = useMutation({
    mutationFn: async () => {
      // 1) Save (o update) bozza con status=queued
      if (!userId || !companyId) throw new Error("Not authenticated");
      if (!accountId) throw new Error("Seleziona un account mittente");
      const recipients = parseEmails(to);
      if (recipients.length === 0) throw new Error("Aggiungi almeno un destinatario");
      if (!subject.trim()) throw new Error("Aggiungi un oggetto");

      const payload = {
        user_id: userId,
        company_id: companyId,
        oauth_connection_id: accountId,
        thread_id: initial.threadId,
        in_reply_to_id: initial.inReplyToId,
        to_emails: recipients,
        cc_emails: parseEmails(cc),
        bcc_emails: parseEmails(bcc),
        subject: subject.trim(),
        body_text: bodyText,
        body_html: bodyText.split("\n").map((l) => `<p>${escapeHtml(l) || "<br/>"}</p>`).join(""),
        status: "queued" as const,
      };

      let id = outboxId;
      if (id) {
        const { error } = await supabase
          .from("email_outbox")
          .update(payload)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("email_outbox")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        id = data.id as string;
        setOutboxId(id);
      }

      // 2) Invoca edge email-send con outbox_id
      const { data: result, error: sendErr } = await supabase.functions.invoke("email-send", {
        body: { outbox_id: id },
      });
      if (sendErr) throw new Error(sendErr.message ?? "Invio fallito");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      if (r?.ok === false) throw new Error(r.error ?? "Invio fallito");
      return r;
    },
    onSuccess: () => {
      toast.success("Email inviata");
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      qc.invalidateQueries({ queryKey: ["email-thread-messages"] });
      qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Invio fallito", { description: String(e) }),
  });

  const isSending = sendMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !isSending && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-violet-600" />
            {context.mode === "reply" || context.mode === "replyAll" ? "Rispondi" :
             context.mode === "forward" ? "Inoltra" : "Nuova email"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Account mittente */}
          {connections && connections.length > 0 && (
            <div>
              <Label className="text-xs">Da</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleziona account…" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {c.provider}
                        </Badge>
                        {c.email_address}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* To */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">A</Label>
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setShowCcBcc((v) => !v)}
              >
                {showCcBcc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Cc/Bcc
              </button>
            </div>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinatario@esempio.it (separa con virgole)"
              className="h-9"
            />
          </div>

          {showCcBcc && (
            <>
              <div>
                <Label className="text-xs">Cc</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@esempio.it" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Bcc</Label>
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@esempio.it" className="h-9" />
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">Oggetto</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Oggetto del messaggio"
              className="h-9"
            />
          </div>

          <div>
            <Label className="text-xs">Messaggio</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Scrivi il tuo messaggio…"
              rows={14}
              className="resize-none font-sans"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-muted/20 flex items-center gap-2 flex-wrap shrink-0">
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={isSending}
            className="gap-2 bg-violet-600 hover:bg-violet-700"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Invio…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Invia
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled
            title="Allegati — Sprint E5"
            className="opacity-50"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <span className={cn(
            "ml-auto text-[11px] flex items-center gap-1",
            autoSaveStatus === "saving" && "text-muted-foreground",
            autoSaveStatus === "saved" && "text-emerald-600",
            autoSaveStatus === "error" && "text-rose-600",
          )}>
            {autoSaveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…</>}
            {autoSaveStatus === "saved" && <><Save className="h-3 w-3" /> Bozza salvata</>}
            {autoSaveStatus === "error" && <>Errore salvataggio</>}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Chiudi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
