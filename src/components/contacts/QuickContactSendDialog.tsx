/**
 * QuickContactSendDialog — popup rapido per inviare SMS / WhatsApp / Email a un
 * contatto, senza navigare via dalla pagina corrente (es. dialog opportunità).
 *
 * Funzioni:
 *  - SMS      → useSendSms (edge telnyx-send-sms)
 *  - WhatsApp → WhatsAppComposer + edge whatsapp-send (template/finestra 24h)
 *  - Email    → email_outbox + edge email-send, con firma editabile e selezione mittente
 *  - AI       → "✨ Genera con AI" su SMS ed Email (edge ai-compose-message): da
 *               un'istruzione libera + tono produce il messaggio, poi modificabile.
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
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Smartphone, MessageSquare, Mail, Send, Loader2, Sparkles, PenLine } from "lucide-react";

export type QuickSendChannel = "sms" | "whatsapp" | "email";

interface QuickContactSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Contesto per l'AI (es. nome opportunità, settore). */
  context?: string | null;
  defaultChannel?: QuickSendChannel;
  onSent?: () => void;
}

interface EmailAccount {
  id: string;
  email_address: string | null;
  provider: string | null;
  signature_html?: string | null;
  signature_text?: string | null;
}

const SMS_MAX = 459;
const TONES = ["professionale e cordiale", "breve e diretto", "amichevole", "formale"];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function QuickContactSendDialog({
  open, onOpenChange, contactId, name, phone, email, context, defaultChannel = "sms", onSent,
}: QuickContactSendDialogProps) {
  const { user, effectiveCompany } = useAuth();
  const qc = useQueryClient();

  const cleanPhone = (phone ?? "").replace(/\D/g, "");
  const hasPhone = cleanPhone.length >= 6;
  const hasEmail = !!(email && email.includes("@"));
  const fullName = (name ?? "").trim();

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
  const [sigEnabled, setSigEnabled] = useState(true);
  const [sigText, setSigText] = useState("");
  const [sigEdit, setSigEdit] = useState(false);

  // AI assist (condiviso SMS/Email)
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiTone, setAiTone] = useState(TONES[0]);

  useEffect(() => {
    if (open) {
      setChannel(initialChannel);
      setSmsText(""); setEmailSubject(""); setEmailBody("");
      setAiInstruction(""); setAiTone(TONES[0]); setSigEdit(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const waContactFields = useMemo<Record<string, string>>(() => {
    const [fn, ...rest] = fullName.split(/\s+/);
    return { nome: fn ?? "", cognome: rest.join(" "), nome_completo: fullName, telefono: phone ?? "", email: email ?? "" };
  }, [fullName, phone, email]);

  // ── SMS ──
  const { sendSmsAsync, isPending: smsSending } = useSendSms();
  const handleSendSms = async () => {
    if (!smsText.trim()) return;
    try {
      await sendSmsAsync({ to_number: phone ?? cleanPhone, body: smsText.trim(), trigger_entity: contactId ? "contact" : null, trigger_ref: contactId ?? null });
      setSmsText(""); onSent?.(); onOpenChange(false);
    } catch { /* toast nel hook */ }
  };

  // ── Email accounts (con firma) ──
  const { data: emailAccounts = [] } = useQuery({
    queryKey: ["quick-send-email-accounts", user?.id, effectiveCompany?.id],
    enabled: open && channel === "email" && !!user?.id && !!effectiveCompany?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let { data, error } = await (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, email_address, status, signature_html, signature_text")
        .eq("user_id", user!.id).eq("company_id", effectiveCompany!.id).eq("status", "active")
        .order("provider", { ascending: true });
      if (error && (error as { code?: string }).code === "42703") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const retry = await (supabase as any)
          .from("v_email_oauth_connections_meta")
          .select("id, provider, email_address, status")
          .eq("user_id", user!.id).eq("company_id", effectiveCompany!.id).eq("status", "active")
          .order("provider", { ascending: true });
        data = retry.data; error = retry.error;
      }
      if (error) return [] as EmailAccount[];
      return (data ?? []) as EmailAccount[];
    },
  });
  const selectedAccount = emailAccounts.find((a) => a.id === emailFrom);

  // Auto-seleziona primo account + precompila firma dall'account
  useEffect(() => {
    if (channel === "email" && !emailFrom && emailAccounts.length > 0) setEmailFrom(emailAccounts[0].id);
  }, [channel, emailFrom, emailAccounts]);
  useEffect(() => {
    const sig = (selectedAccount?.signature_text ?? "").trim();
    setSigText(sig);
    setSigEnabled(!!sig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailFrom, emailAccounts.length]);

  // ── AI compose ──
  const composeAi = useMutation({
    mutationFn: async (ch: QuickSendChannel): Promise<{ subject?: string; body?: string }> => {
      const { data, error } = await supabase.functions.invoke("ai-compose-message", {
        body: {
          channel: ch,
          instruction: aiInstruction.trim(),
          tone: aiTone,
          contact_name: fullName || null,
          context: context ?? null,
          company_id: effectiveCompany?.id ?? null,
        },
      });
      if (error) throw new Error(error.message ?? "Generazione fallita");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (r?.ok === false) throw new Error(r?.error ?? "Generazione fallita");
      return { subject: r?.subject, body: r?.body };
    },
    onSuccess: (r, ch) => {
      if (ch === "sms") setSmsText((r.body ?? "").slice(0, SMS_MAX));
      else if (ch === "email") {
        if (r.subject) setEmailSubject(r.subject.slice(0, 200));
        if (r.body) setEmailBody(r.body.slice(0, 50_000));
      }
      toast.success("Bozza generata", { description: "Modificala pure prima di inviare." });
    },
    onError: (e) => toast.error("AI non disponibile", { description: e instanceof Error ? e.message : String(e) }),
  });

  // ── Email send (con firma) ──
  const sendEmail = useMutation({
    mutationFn: async () => {
      if (!user?.id || !effectiveCompany?.id) throw new Error("Non autenticato");
      if (!emailFrom) throw new Error("Seleziona l'account mittente");
      if (!hasEmail) throw new Error("Il contatto non ha un'email");
      const subject = emailSubject.trim();
      const body = emailBody.trim();
      if (!subject) throw new Error("Aggiungi un oggetto");
      if (!body) throw new Error("Scrivi un messaggio");

      const sig = sigEnabled ? sigText.trim() : "";
      const finalText = sig ? `${body}\n\n-- \n${sig}` : body;
      const bodyHtml = body.split("\n").map((l) => `<p>${escapeHtml(l) || "<br/>"}</p>`).join("");
      const sigHtml = sig ? `<br/><div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:8px;color:#6b7280;font-size:13px">${sig.split("\n").map((l) => `<p>${escapeHtml(l) || "<br/>"}</p>`).join("")}</div>` : "";
      const finalHtml = `${bodyHtml}${sigHtml}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: outboxRow, error: insErr } = await (supabase as any)
        .from("email_outbox")
        .insert({
          user_id: user.id, company_id: effectiveCompany.id, oauth_connection_id: emailFrom,
          to_emails: [email], cc_emails: [], bcc_emails: [],
          subject, body_text: finalText, body_html: finalHtml, attachments: [], status: "queued",
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
      onSent?.(); onOpenChange(false);
    },
    onError: (e) => toast.error("Errore invio email", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
            <TabsTrigger value="sms" disabled={!hasPhone} className="gap-1.5"><Smartphone className="h-3.5 w-3.5" /> SMS</TabsTrigger>
            <TabsTrigger value="whatsapp" disabled={!hasPhone} className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp</TabsTrigger>
            <TabsTrigger value="email" disabled={!hasEmail} className="gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</TabsTrigger>
          </TabsList>

          {/* SMS */}
          <TabsContent value="sms" className="space-y-2 pt-2">
            {hasPhone ? (
              <>
                <AiAssistRow instruction={aiInstruction} setInstruction={setAiInstruction} tone={aiTone} setTone={setAiTone} pending={composeAi.isPending} onGenerate={() => composeAi.mutate("sms")} />
                <Textarea placeholder="Scrivi l'SMS…" value={smsText} onChange={(e) => setSmsText(e.target.value.slice(0, SMS_MAX))} rows={4} className="text-sm resize-y" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{smsText.length}/{SMS_MAX} · {Math.max(1, Math.ceil(smsText.length / 153))} segmento/i</span>
                  <Button size="sm" className="gap-1.5" onClick={handleSendSms} disabled={!smsText.trim() || smsSending}>
                    {smsSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Invia SMS
                  </Button>
                </div>
              </>
            ) : <p className="text-xs text-muted-foreground italic py-4 text-center">Il contatto non ha un numero di telefono.</p>}
          </TabsContent>

          {/* WhatsApp */}
          <TabsContent value="whatsapp" className="space-y-2 pt-2">
            {hasPhone ? (
              <WhatsAppComposer
                phone={cleanPhone} isSending={waSending} contactFields={waContactFields}
                onSend={async ({ waNumberId, content, template }) => {
                  if (!effectiveCompany?.id) { toast.error("Azienda non disponibile"); return; }
                  setWaSending(true);
                  try {
                    const payload: Record<string, unknown> = { company_id: effectiveCompany.id, to: cleanPhone, wa_number_id: waNumberId };
                    if (template) payload.template = { name: template.name, language: template.language, variables: template.variables };
                    else payload.text = { body: content };
                    const { data, error } = await supabase.functions.invoke("whatsapp-send", { body: payload });
                    if (error) throw error;
                    if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
                    toast.success("Messaggio WhatsApp inviato"); onSent?.(); onOpenChange(false);
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Errore invio WhatsApp"); }
                  finally { setWaSending(false); }
                }}
              />
            ) : <p className="text-xs text-muted-foreground italic py-4 text-center">Il contatto non ha un numero di telefono.</p>}
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

                <AiAssistRow instruction={aiInstruction} setInstruction={setAiInstruction} tone={aiTone} setTone={setAiTone} pending={composeAi.isPending} onGenerate={() => composeAi.mutate("email")} />

                <Input placeholder="Oggetto" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value.slice(0, 200))} className="h-8 text-sm" />
                <Textarea placeholder="Scrivi l'email…" value={emailBody} onChange={(e) => setEmailBody(e.target.value.slice(0, 50_000))} rows={5} className="text-sm resize-y" />

                {/* Firma editabile */}
                <div className="rounded-lg border p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-medium flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5 text-violet-600" /> Firma</Label>
                    <div className="flex items-center gap-2">
                      <button type="button" className="text-[10px] text-blue-600 hover:underline" onClick={() => setSigEdit((v) => !v)}>
                        {sigEdit ? "Nascondi" : "Modifica"}
                      </button>
                      <Switch checked={sigEnabled} onCheckedChange={setSigEnabled} aria-label="Includi firma" />
                    </div>
                  </div>
                  {sigEnabled && sigEdit && (
                    <Textarea placeholder="La tua firma (es. Nome Cognome · Azienda · tel)…" value={sigText} onChange={(e) => setSigText(e.target.value.slice(0, 1000))} rows={3} className="text-xs resize-y" />
                  )}
                  {sigEnabled && !sigEdit && (
                    <p className="text-[10px] text-muted-foreground whitespace-pre-wrap line-clamp-2">{sigText || "Nessuna firma impostata sull'account — clicca «Modifica» per scriverla."}</p>
                  )}
                  {!sigEnabled && <p className="text-[10px] text-muted-foreground">Firma disattivata per questa email.</p>}
                </div>

                <div className="flex justify-end">
                  <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={() => sendEmail.mutate()} disabled={!emailFrom || !emailSubject.trim() || !emailBody.trim() || sendEmail.isPending}>
                    {sendEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Invia Email
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

/** Riga "Scrivi con l'AI" — componente a livello modulo per non remountare il textarea. */
function AiAssistRow({
  instruction, setInstruction, tone, setTone, pending, onGenerate,
}: {
  instruction: string;
  setInstruction: (v: string) => void;
  tone: string;
  setTone: (v: string) => void;
  pending: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-700">
        <Sparkles className="h-3.5 w-3.5" /> Scrivi con l'AI
      </div>
      <Textarea
        placeholder="Cosa vuoi dire? Es: «proponi un sopralluogo per gli impianti del condominio la prossima settimana»"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value.slice(0, 1000))}
        rows={2}
        className="text-xs resize-none bg-white"
      />
      <div className="flex items-center gap-1.5">
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger className="h-7 text-[11px] flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TONES.map((t) => <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-7 gap-1.5 bg-orange-600 hover:bg-orange-700 text-xs" onClick={onGenerate} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Genera
        </Button>
      </div>
    </div>
  );
}

export default QuickContactSendDialog;
