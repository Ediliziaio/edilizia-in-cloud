/**
 * CustomerComposeBar — compose inline pagina cliente.
 *
 * 2026-05-27 v2 (richiesta utente "email vera con mittente/oggetto/body
 * non dialog separato"):
 *  - channel default: nota interna (riga unica)
 *  - channel email: si ESPANDE in form completo INLINE:
 *      From (account mittente) | To (read-only, cliente) | Subject | Body | Send
 *      → invio reale via email_outbox + edge function email-send
 *  - channel whatsapp: apre wa.me con testo (link esterno)
 *  - channel sms: link a /azienda/sms (placeholder coming-soon)
 *  - channel note: textarea autosize 1-3 righe → INSERT customer_messages
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mail, MessageSquare, Smartphone, StickyNote, Send, Loader2, ChevronDown,
  X as XIcon, Paperclip as PaperclipIcon,
} from "lucide-react";
import { friendlyPostgresError } from "@/lib/postgresErrors";

type Channel = "email" | "whatsapp" | "sms" | "note";

interface CustomerComposeBarProps {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  /** Callback dopo nota/email salvata (es. invalida diario/timeline). */
  onSent?: () => void;
}

const CHANNELS: { key: Channel; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "note",     label: "Nota interna", icon: <StickyNote className="h-3.5 w-3.5" />,    color: "text-amber-600" },
  { key: "email",    label: "Email",        icon: <Mail className="h-3.5 w-3.5" />,          color: "text-violet-600" },
  { key: "whatsapp", label: "WhatsApp",     icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-emerald-600" },
  { key: "sms",      label: "SMS",          icon: <Smartphone className="h-3.5 w-3.5" />,    color: "text-blue-600" },
];

interface EmailAccount {
  id: string;
  email_address: string | null;
  provider: string | null;
  status: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function CustomerComposeBar({
  customerId,
  customerEmail,
  customerPhone,
  onSent,
}: CustomerComposeBarProps) {
  const { user, effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<Channel>("note");

  // Stati specifici per ogni channel
  const [noteText, setNoteText] = useState("");
  const [waText, setWaText] = useState("");
  const [emailFrom, setEmailFrom] = useState<string>("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailExpanded, setEmailExpanded] = useState(false);

  const cleanPhone = (customerPhone ?? "").replace(/\D/g, "");
  const waHref = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith("39") || cleanPhone.length > 10 ? cleanPhone : `39${cleanPhone}`}`
    : null;

  // Fetch account email connessi (solo quando channel=email)
  const { data: emailAccounts = [] } = useQuery({
    queryKey: ["customer-compose-accounts", user?.id, effectiveCompany?.id],
    enabled: !!user?.id && !!effectiveCompany?.id && channel === "email",
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, email_address, status")
        .eq("user_id", user!.id)
        .eq("company_id", effectiveCompany!.id)
        .eq("status", "active")
        .order("provider", { ascending: true });
      if (error) {
        const code = (error as { code?: string }).code;
        // Tabella non disponibile o RLS bloccante → ritorna lista vuota (UI mostra avviso)
        if (code === "42P01" || code === "42501") return [] as EmailAccount[];
        throw error;
      }
      return (data ?? []) as EmailAccount[];
    },
  });

  // Auto-select primo account se non ancora scelto
  useEffect(() => {
    if (channel === "email" && !emailFrom && emailAccounts.length > 0) {
      setEmailFrom(emailAccounts[0].id);
    }
  }, [channel, emailFrom, emailAccounts]);

  // ─── Mutation: salva nota interna nel diario ───
  const saveNote = useMutation({
    mutationFn: async (content: string) => {
      if (!user?.id || !effectiveCompany?.id) throw new Error("Non autenticato");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("customer_messages")
        .insert({
          company_id: effectiveCompany.id,
          customer_id: customerId,
          sender_role: "staff",
          sender_id: user.id,
          channel: "internal",
          body: content.slice(0, 5000),
          delivery_status: "sent",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-messages", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-diary", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-diary-timeline", customerId] });
      setNoteText("");
      toast.success("Nota salvata nel diario");
      onSent?.();
    },
    onError: (e) => {
      const { title, description } = friendlyPostgresError(e, { operation: "salvataggio nota" });
      toast.error(title, { description });
    },
  });

  // ─── Mutation: invio email "vero" inline ───
  // Pattern: insert email_outbox (status=queued) → invoke email-send con outbox_id
  // Stesso flusso di EmailComposeDialog ma senza il modale.
  const sendEmail = useMutation({
    mutationFn: async () => {
      if (!user?.id || !effectiveCompany?.id) throw new Error("Non autenticato");
      if (!emailFrom) throw new Error("Seleziona l'account mittente");
      if (!customerEmail) throw new Error("Il cliente non ha un indirizzo email");
      const subject = emailSubject.trim();
      const body = emailBody.trim();
      if (!subject) throw new Error("Aggiungi un oggetto");
      if (!body) throw new Error("Scrivi un messaggio");

      const bodyHtml = body
        .split("\n")
        .map((line) => `<p>${escapeHtml(line) || "<br/>"}</p>`)
        .join("");

      // 1) Insert outbox row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: outboxRow, error: insErr } = await (supabase as any)
        .from("email_outbox")
        .insert({
          user_id: user.id,
          company_id: effectiveCompany.id,
          oauth_connection_id: emailFrom,
          to_emails: [customerEmail],
          cc_emails: [],
          bcc_emails: [],
          subject,
          body_text: body,
          body_html: bodyHtml,
          attachments: [],
          status: "queued",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const outboxId = outboxRow?.id as string;
      if (!outboxId) throw new Error("Errore creazione bozza");

      // 2) Hang-protection 30s (stesso pattern di EmailComposeDialog iter 14)
      const sendController = new AbortController();
      const timeoutId = setTimeout(() => sendController.abort(), 30_000);
      try {
        const { data, error } = await supabase.functions.invoke("email-send", {
          body: { outbox_id: outboxId },
        });
        if (error) throw new Error(error.message ?? "Invio fallito");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = data as any;
        if (r?.ok === false) throw new Error(r?.error ?? "Invio fallito");
        return r;
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
          throw new Error("Server lento (timeout 30s). La bozza è salvata, riprova.");
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      qc.invalidateQueries({ queryKey: ["customer-email-timeline", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-email-conversations", customerId] });
      setEmailSubject("");
      setEmailBody("");
      setEmailExpanded(false);
      toast.success(`Email inviata a ${customerEmail}`);
      onSent?.();
    },
    onError: (e) => {
      const { title, description } = friendlyPostgresError(e, { operation: "invio email" });
      toast.error(title, { description });
    },
  });

  const activeChannel = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0];

  // ─── RENDER PER CHANNEL ───

  // EMAIL → form completo expanded (mittente + oggetto + body + send)
  if (channel === "email") {
    return (
      <div className="border-t shrink-0 bg-card">
        <div className="px-3 py-2.5 border-b flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ChannelDropdown channel={channel} onChange={setChannel} hasEmail={!!customerEmail} hasPhone={!!waHref} />
            <span className="text-xs font-semibold text-violet-700">Nuova email</span>
          </div>
          {emailExpanded && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { setEmailExpanded(false); setEmailSubject(""); setEmailBody(""); }}
              aria-label="Chiudi compose email"
            >
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {!emailExpanded ? (
          // Stato collassato: prompt + click "Scrivi nuova email"
          <div className="px-3 py-3 flex items-center gap-2">
            <Input
              placeholder={customerEmail ? "Oggetto email…" : "Cliente senza email"}
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value.slice(0, 200))}
              onFocus={() => setEmailExpanded(true)}
              disabled={!customerEmail}
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              className="h-9 shrink-0"
              onClick={() => setEmailExpanded(true)}
              disabled={!customerEmail}
            >
              Scrivi
            </Button>
          </div>
        ) : (
          // Stato expanded: form completo
          <div className="px-3 py-2.5 space-y-2">
            {/* Mittente + Destinatario in una riga */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Da</Label>
                <Select value={emailFrom} onValueChange={setEmailFrom} disabled={emailAccounts.length === 0}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={
                      emailAccounts.length === 0 ? "Nessun account email collegato" : "Scegli mittente"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {emailAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.email_address ?? a.id}
                        {a.provider && (
                          <span className="ml-2 text-[10px] text-muted-foreground capitalize">({a.provider})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">A</Label>
                <Input
                  value={customerEmail ?? ""}
                  disabled
                  className="h-8 text-xs bg-muted/40"
                />
              </div>
            </div>

            {/* Oggetto */}
            <div className="space-y-0.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Oggetto *</Label>
              <Input
                placeholder="Oggetto dell'email"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value.slice(0, 200))}
                className="h-8 text-sm"
                autoFocus
              />
            </div>

            {/* Body */}
            <div className="space-y-0.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Messaggio *</Label>
              <Textarea
                placeholder="Scrivi il contenuto dell'email…"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value.slice(0, 50_000))}
                rows={4}
                className="text-sm resize-y min-h-[100px]"
              />
              <p className="text-[10px] text-muted-foreground">
                Salutato automaticamente. {emailBody.length}/50000 caratteri.
              </p>
            </div>

            {/* Footer: allegati (placeholder) + send */}
            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5 text-muted-foreground"
                disabled
                title="Allegati disponibili nel compose completo (futuro)"
              >
                <PaperclipIcon className="h-3.5 w-3.5" />
                Allegati
              </Button>
              <div className="flex items-center gap-2">
                {sendEmail.isPending && (
                  <span className="text-[10px] text-muted-foreground">Invio in corso…</span>
                )}
                <Button
                  size="sm"
                  className="h-8 px-3 gap-1.5 bg-violet-600 hover:bg-violet-700"
                  onClick={() => sendEmail.mutate()}
                  disabled={
                    !emailFrom ||
                    !customerEmail ||
                    !emailSubject.trim() ||
                    !emailBody.trim() ||
                    sendEmail.isPending
                  }
                >
                  {sendEmail.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Invia
                </Button>
              </div>
            </div>

            {emailAccounts.length === 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                Nessun account email collegato.{" "}
                <a href="/azienda/impostazioni/email" className="underline font-medium">
                  Connetti la tua casella Gmail/Outlook
                </a>{" "}
                per inviare email da qui.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // WHATSAPP → input semplice + apre wa.me
  if (channel === "whatsapp") {
    return (
      <div className="border-t shrink-0 bg-card">
        <div className="px-3 py-2 flex items-end gap-2">
          <ChannelDropdown channel={channel} onChange={setChannel} hasEmail={!!customerEmail} hasPhone={!!waHref} />
          <Input
            placeholder={waHref ? "Scrivi messaggio WhatsApp…" : "Cliente senza numero di telefono"}
            value={waText}
            onChange={(e) => setWaText(e.target.value.slice(0, 5000))}
            disabled={!waHref}
            className="h-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && waText.trim() && waHref) {
                e.preventDefault();
                window.open(`${waHref}?text=${encodeURIComponent(waText.trim())}`, "_blank", "noopener,noreferrer");
                setWaText("");
              }
            }}
          />
          <Button
            size="sm"
            className="h-9 px-3 shrink-0 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              if (waHref && waText.trim()) {
                window.open(`${waHref}?text=${encodeURIComponent(waText.trim())}`, "_blank", "noopener,noreferrer");
                setWaText("");
              }
            }}
            disabled={!waHref || !waText.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="px-3 pb-2 text-[10px] text-muted-foreground">
          Si apre WhatsApp Web in una nuova scheda con il messaggio precompilato.
        </p>
      </div>
    );
  }

  // SMS → placeholder (link al modulo SMS dedicato)
  if (channel === "sms") {
    return (
      <div className="border-t shrink-0 bg-card">
        <div className="px-3 py-2 flex items-center gap-2">
          <ChannelDropdown channel={channel} onChange={setChannel} hasEmail={!!customerEmail} hasPhone={!!waHref} />
          <div className="flex-1 text-xs text-muted-foreground italic">
            Invio SMS singolo disponibile presto.{" "}
            <a href="/azienda/sms" className="underline">Apri modulo SMS</a> per invio manuale.
          </div>
        </div>
      </div>
    );
  }

  // NOTE → textarea autosize
  return (
    <div className="border-t shrink-0 bg-card">
      <div className="px-3 py-2 flex items-end gap-2">
        <ChannelDropdown channel={channel} onChange={setChannel} hasEmail={!!customerEmail} hasPhone={!!waHref} />
        <Textarea
          placeholder="Scrivi una nota interna…"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value.slice(0, 5000))}
          rows={1}
          className="min-h-[40px] max-h-32 text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (noteText.trim()) saveNote.mutate(noteText.trim());
            }
          }}
        />
        <Button
          size="sm"
          className="h-9 px-3 shrink-0"
          onClick={() => noteText.trim() && saveNote.mutate(noteText.trim())}
          disabled={!noteText.trim() || saveNote.isPending}
        >
          {saveNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="px-3 pb-2 text-[10px] text-muted-foreground">
        <span className={activeChannel.color}>{activeChannel.icon}</span>{" "}
        Visibile solo al team. Enter per salvare · Shift+Enter per nuova riga.
      </p>
    </div>
  );
}

// ─── Channel dropdown trigger ───
function ChannelDropdown({
  channel,
  onChange,
  hasEmail,
  hasPhone,
}: {
  channel: Channel;
  onChange: (c: Channel) => void;
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  const active = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 px-2 gap-1.5 shrink-0">
          <span className={active.color}>{active.icon}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {CHANNELS.map((c) => {
          const disabled =
            (c.key === "email" && !hasEmail) ||
            (c.key === "whatsapp" && !hasPhone);
          return (
            <DropdownMenuItem
              key={c.key}
              onClick={() => onChange(c.key)}
              disabled={disabled}
            >
              <span className={`mr-2 ${c.color}`}>{c.icon}</span>
              {c.label}
              {c.key === "email" && !hasEmail && (
                <span className="ml-auto text-[10px] text-muted-foreground">no email</span>
              )}
              {c.key === "whatsapp" && !hasPhone && (
                <span className="ml-auto text-[10px] text-muted-foreground">no tel.</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
