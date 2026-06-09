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
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
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
  signature_html?: string | null;
  signature_text?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Parse CSV / space-separated emails, lowercased, dedup, basic validation. */
function parseEmails(raw: string): string[] {
  if (!raw.trim()) return [];
  const seen = new Set<string>();
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => {
      if (!e || !e.includes("@") || !e.includes(".")) return false;
      if (seen.has(e)) return false;
      seen.add(e);
      return true;
    });
}

function findInvalidEmail(raw: string): string | null {
  if (!raw.trim()) return null;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const piece of raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)) {
    if (!re.test(piece)) return piece;
  }
  return null;
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
  const [waSending, setWaSending] = useState(false);
  const [emailFrom, setEmailFrom] = useState<string>("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailExpanded, setEmailExpanded] = useState(false);
  // 2026-05-27 (richiesta utente): CC + BCC (CCN) con toggle stile Gmail.
  // Stringa separata da virgole/spazi. Parsed in submit con parseEmails().
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailCcVisible, setEmailCcVisible] = useState(false);
  const [emailBccVisible, setEmailBccVisible] = useState(false);

  const cleanPhone = (customerPhone ?? "").replace(/\D/g, "");
  const waHref = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith("39") || cleanPhone.length > 10 ? cleanPhone : `39${cleanPhone}`}`
    : null;

  // Nome/cognome del cliente per auto-compilare le variabili dei template WhatsApp.
  // Degrada in modo morbido: se il profilo non è leggibile, restano email/telefono.
  const { data: customerProfile } = useQuery({
    queryKey: ["customer-wa-fields", customerId],
    enabled: !!customerId && channel === "whatsapp",
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", customerId)
        .maybeSingle();
      if (error) return null;
      return data as { first_name: string | null; last_name: string | null } | null;
    },
  });

  const waContactFields = useMemo<Record<string, string>>(() => {
    const fn = (customerProfile?.first_name ?? "").trim();
    const ln = (customerProfile?.last_name ?? "").trim();
    return {
      nome: fn,
      cognome: ln,
      nome_completo: `${fn} ${ln}`.trim(),
      telefono: customerPhone ?? "",
      email: customerEmail ?? "",
    };
  }, [customerProfile, customerPhone, customerEmail]);

  // Fetch account email connessi (solo quando channel=email)
  const { data: emailAccounts = [] } = useQuery({
    queryKey: ["customer-compose-accounts", user?.id, effectiveCompany?.id],
    enabled: !!user?.id && !!effectiveCompany?.id && channel === "email",
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // 2026-05-27: includo signature_html/text (aggiunti via migration
      // 20270527050000_email_account_signature). Backcompat: se la view non
      // ha ancora i campi (DB non aggiornato), Postgres ritorna error e
      // riproviamo senza signature.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let { data, error } = await (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, email_address, status, signature_html, signature_text")
        .eq("user_id", user!.id)
        .eq("company_id", effectiveCompany!.id)
        .eq("status", "active")
        .order("provider", { ascending: true });
      // Fallback se colonne firma non esistono ancora (migration pending)
      if (error && (error as { code?: string }).code === "42703") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const retry = await (supabase as any)
          .from("v_email_oauth_connections_meta")
          .select("id, provider, email_address, status")
          .eq("user_id", user!.id)
          .eq("company_id", effectiveCompany!.id)
          .eq("status", "active")
          .order("provider", { ascending: true });
        data = retry.data;
        error = retry.error;
      }
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

      // 2026-05-27: parsing CC/BCC + validazione
      const ccList = parseEmails(emailCc);
      const bccList = parseEmails(emailBcc);
      const invalidCc = findInvalidEmail(emailCc);
      const invalidBcc = findInvalidEmail(emailBcc);
      if (invalidCc) throw new Error(`Email CC non valida: ${invalidCc}`);
      if (invalidBcc) throw new Error(`Email CCN non valida: ${invalidBcc}`);

      // 2026-05-27 (firma email auto-append):
      // Se l'account ha signature_html / signature_text settata, l'appendiamo
      // al body con separator standard email "--\n" (RFC 3676).
      // Pattern Gmail: la firma NON è visibile nel form composer (per
      // pulizia) ma viene aggiunta automaticamente in invio.
      const selectedAccount = emailAccounts.find((a) => a.id === emailFrom);
      const sigText = (selectedAccount?.signature_text ?? "").trim();
      const sigHtml = (selectedAccount?.signature_html ?? "").trim();

      const finalBodyText = sigText
        ? `${body}\n\n-- \n${sigText}`
        : body;

      const finalBodyHtml = (() => {
        const userHtml = body
          .split("\n")
          .map((line) => `<p>${escapeHtml(line) || "<br/>"}</p>`)
          .join("");
        if (!sigHtml && !sigText) return userHtml;
        // Se ho solo signature_text, lo converto in HTML semplice
        const sigFinalHtml = sigHtml || sigText
          .split("\n")
          .map((line) => `<p>${escapeHtml(line) || "<br/>"}</p>`)
          .join("");
        return `${userHtml}<br/><div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:8px;color:#6b7280;font-size:13px">${sigFinalHtml}</div>`;
      })();

      const bodyHtml = finalBodyHtml;

      // 1) Insert outbox row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: outboxRow, error: insErr } = await (supabase as any)
        .from("email_outbox")
        .insert({
          user_id: user.id,
          company_id: effectiveCompany.id,
          oauth_connection_id: emailFrom,
          to_emails: [customerEmail],
          cc_emails: ccList,
          bcc_emails: bccList,
          subject,
          body_text: finalBodyText,
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
          throw new Error("Server lento (timeout 30s). La bozza è salvata, riprova.", { cause: err });
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
      setEmailCc("");
      setEmailBcc("");
      setEmailCcVisible(false);
      setEmailBccVisible(false);
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
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">A</Label>
                  {/* Toggle CC / CCN stile Gmail — visibile inline */}
                  <div className="flex items-center gap-1 text-[10px]">
                    {!emailCcVisible && (
                      <button
                        type="button"
                        className="text-blue-600 hover:underline font-medium"
                        onClick={() => setEmailCcVisible(true)}
                      >
                        + Cc
                      </button>
                    )}
                    {!emailBccVisible && (
                      <button
                        type="button"
                        className="text-blue-600 hover:underline font-medium"
                        onClick={() => setEmailBccVisible(true)}
                      >
                        + Ccn
                      </button>
                    )}
                  </div>
                </div>
                <Input
                  value={customerEmail ?? ""}
                  disabled
                  className="h-8 text-xs bg-muted/40"
                />
              </div>
            </div>

            {/* Cc + Ccn (CCN) — visibili solo dopo toggle */}
            {emailCcVisible && (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cc</Label>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => { setEmailCcVisible(false); setEmailCc(""); }}
                    aria-label="Rimuovi campo Cc"
                  >
                    Rimuovi
                  </button>
                </div>
                <Input
                  placeholder="email1@esempio.it, email2@esempio.it"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Conoscenza (visibile a tutti i destinatari). Separa con virgole.
                </p>
              </div>
            )}
            {emailBccVisible && (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ccn (Bcc)</Label>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => { setEmailBccVisible(false); setEmailBcc(""); }}
                    aria-label="Rimuovi campo Ccn"
                  >
                    Rimuovi
                  </button>
                </div>
                <Input
                  placeholder="email1@esempio.it, email2@esempio.it"
                  value={emailBcc}
                  onChange={(e) => setEmailBcc(e.target.value)}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Conoscenza nascosta (gli altri destinatari NON vedono questi indirizzi).
                </p>
              </div>
            )}

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
              <p className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                <span>{emailBody.length}/50000 caratteri.</span>
                {(() => {
                  const acc = emailAccounts.find((a) => a.id === emailFrom);
                  const hasSig = !!(acc?.signature_html?.trim() || acc?.signature_text?.trim());
                  return hasSig ? (
                    <span className="text-emerald-700 flex items-center gap-0.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Firma applicata automaticamente
                    </span>
                  ) : (
                    <a href="/azienda/impostazioni/integrazioni" className="text-blue-600 hover:underline">
                      + Aggiungi firma email
                    </a>
                  );
                })()}
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

  // WHATSAPP → invio API CONFORME (numero + template + finestra 24h) via whatsapp-send
  if (channel === "whatsapp") {
    return (
      <div className="border-t shrink-0 bg-card">
        <div className="px-3 py-2 space-y-2">
          <ChannelDropdown channel={channel} onChange={setChannel} hasEmail={!!customerEmail} hasPhone={!!cleanPhone} />
          {cleanPhone ? (
            <WhatsAppComposer
              phone={cleanPhone}
              isSending={waSending}
              contactFields={waContactFields}
              onSend={async ({ waNumberId, content, template }) => {
                if (!effectiveCompany?.id) {
                  toast.error("Azienda non disponibile");
                  return;
                }
                setWaSending(true);
                try {
                  const payload: Record<string, unknown> = {
                    company_id: effectiveCompany.id,
                    to: cleanPhone,
                    wa_number_id: waNumberId,
                  };
                  if (template) {
                    payload.template = {
                      name: template.name,
                      language: template.language,
                      variables: template.variables,
                    };
                  } else {
                    payload.text = { body: content };
                  }
                  const { data, error } = await supabase.functions.invoke("whatsapp-send", { body: payload });
                  if (error) throw error;
                  if ((data as { error?: string } | null)?.error) {
                    throw new Error((data as { error: string }).error);
                  }
                  toast.success("Messaggio WhatsApp inviato");
                  qc.invalidateQueries({ queryKey: ["customer-diary-timeline", customerId] });
                  qc.invalidateQueries({ queryKey: ["customer-messages", customerId] });
                  onSent?.();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Errore invio WhatsApp");
                } finally {
                  setWaSending(false);
                }
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">Cliente senza numero di telefono.</p>
          )}
        </div>
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
