/**
 * QuickContactSendDialog — popup rapido per inviare SMS / WhatsApp / Email a un
 * contatto, senza navigare via dalla pagina corrente (es. dialog opportunità).
 *
 * Riusa l'infrastruttura esistente:
 *  - SMS      → hook useSendSms (edge telnyx-send-sms)
 *  - WhatsApp → WhatsAppComposer + edge whatsapp-send (numero + template/finestra 24h)
 *  - Email    → insert email_outbox (queued) + edge email-send
 *
 * Mostra solo i canali disponibili in base ai dati del contatto (telefono/email).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useSendSms } from "@/hooks/useSendSms";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Smartphone, MessageSquare, Mail, Send, Loader2 } from "lucide-react";

export type QuickSendChannel = "sms" | "whatsapp" | "email";

interface QuickContactSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  defaultChannel?: QuickSendChannel;
  /** Callback dopo un invio riuscito (es. refresh timeline). */
  onSent?: () => void;
}

interface EmailAccount {
  id: string;
  email_address: string | null;
  provider: string | null;
}

const SMS_MAX = 459; // 3 segmenti GSM-7

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function QuickContactSendDialog({
  open, onOpenChange, contactId, name, phone, email, defaultChannel = "sms", onSent,
}: QuickContactSendDialogProps) {
  const { user, effectiveCompany } = useAuth();
  const qc = useQueryClient();

  const cleanPhone = (phone ?? "").replace(/\D/g, "");
  const hasPhone = cleanPhone.length >= 6;
  const hasEmail = !!(email && email.includes("@"));

  // Canale iniziale valido (se manca il dato, ripiega su uno disponibile)
  const initialChannel: QuickSendChannel =
    defaultChannel === "email" && !hasEmail ? (hasPhone ? "whatsapp" : "email")
    : (defaultChannel === "sms" || defaultChannel === "whatsapp") && !hasPhone ? (hasEmail ? "email" : defaultChannel)
    : defaultChannel;

  const [channel, setChannel] = useState<QuickSendChannel>(initialChannel);
  const [smsText, setSmsText] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Reset all'apertura
  useEffect(() => {
    if (open) {
      setChannel(initialChannel);
      setSmsText("");
      setEmailSubject("");
      setEmailBody("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fullName = (name ?? "").trim();
  const waContactFields = useMemo<Record<string, string>>(() => {
    const [fn, ...rest] = fullName.split(/\s+/);
    return {
      nome: fn ?? "", cognome: rest.join(" "), nome_completo: fullName,
      telefono: phone ?? "", email: email ?? "",
    };
  }, [fullName, phone, email]);

  // ── SMS ──
  const { sendSmsAsync, isPending: smsSending } = useSendSms();
  const handleSendSms = async () => {
    if (!smsText.trim()) return;
    try {
      await sendSmsAsync({
        to_number: phone ?? cleanPhone,
        body: smsText.trim(),
        trigger_entity: contactId ? "contact" : null,
        trigger_ref: contactId ?? null,
      });
      setSmsText("");
      onSent?.();
      onOpenChange(false);
    } catch { /* toast gestito dal hook */ }
  };

  // ── Email accounts (solo quando serve) ──
  const { data: emailAccounts = [] } = useQuery({
    queryKey: ["quick-send-email-accounts", user?.id, effectiveCompany?.id],
    enabled: open && channel === "email" && !!user?.id && !!effectiveCompany?.id,
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
      if (error) return [] as EmailAccount[];
      return (data ?? []) as EmailAccount[];
    },
  });
  useEffect(() => {
    if (channel === "email" && !emailFrom && emailAccounts.length > 0) setEmailFrom(emailAccounts[0].id);
  }, [channel, emailFrom, emailAccounts]);

  const sendEmail = useMutation({
    mutationFn: async () => {
      if (!user?.id || !effectiveCompany?.id) throw new Error("Non autenticato");
      if (!emailFrom) throw new Error("Seleziona l'account mittente");
      if (!hasEmail) throw new Error("Il contatto non ha un'email");
      const subject = emailSubject.trim();
      const body = emailBody.trim();
      if (!subject) throw new Error("Aggiungi un oggetto");
      if (!body) throw new Error("Scrivi un messaggio");
      const bodyHtml = body.split("\n").map((l) => `<p>${escapeHtml(l) || "<br/>"}</p>`).join("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: outboxRow, error: insErr } = await (supabase as any)
        .from("email_outbox")
        .insert({
          user_id: user.id, company_id: effectiveCompany.id, oauth_connection_id: emailFrom,
          to_emails: [email], cc_emails: [], bcc_emails: [],
          subject, body_text: body, body_html: bodyHtml, attachments: [], status: "queued",
        })
        .select("id").single();
      if (insErr) throw insErr;
      const { data, error } = await supabase.functions.invoke("email-send", { body: { outbox_id: outboxRow.id } });
      if (error) throw new Error(error.message ?? "Invio fallito");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((data as any)?.ok === false) throw new Error((data as any)?.error ?? "Invio fallito");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      toast.success(`Email inviata a ${email}`);
      onSent?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error("Errore invio email", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Invia messaggio</DialogTitle>
          <DialogDescription className="text-xs">
            {fullName || "Contatto"}
            {hasPhone && <span> · {phone}</span>}
            {hasEmail && <span> · {email}</span>}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={channel} onValueChange={(v) => setChannel(v as QuickSendChannel)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sms" disabled={!hasPhone} className="gap-1.5">
              <Smartphone className="h-3.5 w-3.5" /> SMS
            </TabsTrigger>
            <TabsTrigger value="whatsapp" disabled={!hasPhone} className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
            </TabsTrigger>
            <TabsTrigger value="email" disabled={!hasEmail} className="gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
            </TabsTrigger>
          </TabsList>

          {/* SMS */}
          <TabsContent value="sms" className="space-y-2 pt-2">
            {hasPhone ? (
              <>
                <Textarea
                  placeholder="Scrivi l'SMS…"
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value.slice(0, SMS_MAX))}
                  rows={4}
                  className="text-sm resize-y"
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {smsText.length}/{SMS_MAX} · {Math.max(1, Math.ceil(smsText.length / 153))} segmento/i
                  </span>
                  <Button size="sm" className="gap-1.5" onClick={handleSendSms} disabled={!smsText.trim() || smsSending}>
                    {smsSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Invia SMS
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Il contatto non ha un numero di telefono.</p>
            )}
          </TabsContent>

          {/* WhatsApp */}
          <TabsContent value="whatsapp" className="space-y-2 pt-2">
            {hasPhone ? (
              <WhatsAppComposer
                phone={cleanPhone}
                isSending={waSending}
                contactFields={waContactFields}
                onSend={async ({ waNumberId, content, template }) => {
                  if (!effectiveCompany?.id) { toast.error("Azienda non disponibile"); return; }
                  setWaSending(true);
                  try {
                    const payload: Record<string, unknown> = {
                      company_id: effectiveCompany.id, to: cleanPhone, wa_number_id: waNumberId,
                    };
                    if (template) {
                      payload.template = { name: template.name, language: template.language, variables: template.variables };
                    } else {
                      payload.text = { body: content };
                    }
                    const { data, error } = await supabase.functions.invoke("whatsapp-send", { body: payload });
                    if (error) throw error;
                    if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
                    toast.success("Messaggio WhatsApp inviato");
                    onSent?.();
                    onOpenChange(false);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Errore invio WhatsApp");
                  } finally {
                    setWaSending(false);
                  }
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Il contatto non ha un numero di telefono.</p>
            )}
          </TabsContent>

          {/* Email */}
          <TabsContent value="email" className="space-y-2 pt-2">
            {!hasEmail ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Il contatto non ha un'email.</p>
            ) : emailAccounts.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                Nessuna casella collegata.{" "}
                <a href="/azienda/impostazioni/mio-profilo?tab=email" className="underline font-medium">Collega Gmail/Outlook/IMAP</a> per inviare email da qui.
              </div>
            ) : (
              <>
                <div className="space-y-0.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Da</Label>
                  <Select value={emailFrom} onValueChange={setEmailFrom}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Scegli mittente" /></SelectTrigger>
                    <SelectContent>
                      {emailAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          {a.email_address ?? a.id}{a.provider && <span className="ml-2 text-[10px] text-muted-foreground capitalize">({a.provider})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input placeholder="Oggetto" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value.slice(0, 200))} className="h-8 text-sm" />
                <Textarea placeholder="Scrivi l'email…" value={emailBody} onChange={(e) => setEmailBody(e.target.value.slice(0, 50_000))} rows={5} className="text-sm resize-y" />
                <div className="flex justify-end">
                  <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={() => sendEmail.mutate()} disabled={!emailFrom || !emailSubject.trim() || !emailBody.trim() || sendEmail.isPending}>
                    {sendEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Invia Email
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default QuickContactSendDialog;
