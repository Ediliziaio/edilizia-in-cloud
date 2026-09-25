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
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useSendSms } from "@/hooks/useSendSms";
import { MessageTemplatePicker } from "@/components/templates/MessageTemplatePicker";
import { buildTemplateVars } from "@/lib/messageTemplateVars";
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
import { Smartphone, MessageSquare, Mail, Send, Loader2, Sparkles, PenLine, Paperclip, X } from "lucide-react";
import { EmailTemplatePicker } from "@/components/email/EmailTemplatePicker";
import { OrderDocumentAttacher } from "@/components/email/OrderDocumentAttacher";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";

export type QuickSendChannel = "sms" | "whatsapp" | "email" | "whatsapp_locale";

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
  /** Testo precompilato per i canali (es. sollecito pagamento, invio stato). */
  prefill?: { smsText?: string; emailSubject?: string; emailBody?: string; waText?: string };
  /** Allegati già caricati nel bucket email-attachments (es. PDF della commessa). */
  initialAttachments?: Array<{ name: string; size: number; mime: string; storage_path: string }>;
  /** ID commessa per mostrare i documenti allegabili. */
  orderId?: string | null;
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

/** Estrae il messaggio d'errore dal body di una edge function (FunctionsHttpError). */
async function extractInvokeError(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return body.error;
    }
  } catch { /* ignore */ }
  return (error as Error)?.message ?? "Errore imprevisto";
}

/** CSV/space-separated → lista email valide, lowercased, dedup. */
function parseEmails(raw: string): string[] {
  if (!raw.trim()) return [];
  const seen = new Set<string>();
  return raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase())
    .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !seen.has(e) && seen.add(e));
}

export function QuickContactSendDialog({
  open, onOpenChange, contactId, name, phone, email, context, defaultChannel = "sms", onSent,
  prefill, initialAttachments, orderId,
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
  // WhatsApp Locale (canale non-ufficiale, solo contesto piattaforma/super_admin).
  const isPlatformContext = effectiveCompany?.id === PLATFORM_ADMIN_COMPANY_ID;
  const [waLocaleText, setWaLocaleText] = useState("");
  const [waLocaleSending, setWaLocaleSending] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waSeedText, setWaSeedText] = useState("");
  const [waSeedAt, setWaSeedAt] = useState(0);
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sigEnabled, setSigEnabled] = useState(true);
  const [sigText, setSigText] = useState("");
  const [sigEdit, setSigEdit] = useState(false);
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [ccBccVisible, setCcBccVisible] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; size: number; mime: string; storage_path: string; bucket?: string; uploading: boolean }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI assist (condiviso SMS/Email)
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiTone, setAiTone] = useState(TONES[0]);

  useEffect(() => {
    if (open) {
      setChannel(initialChannel);
      setSmsText(prefill?.smsText ?? "");
      setEmailSubject(prefill?.emailSubject ?? "");
      setEmailBody(prefill?.emailBody ?? "");
      setAiInstruction(""); setAiTone(TONES[0]); setSigEdit(false);
      setEmailCc(""); setEmailBcc(""); setCcBccVisible(false);
      setAttachments((initialAttachments ?? []).map((a) => ({ ...a, uploading: false })));
      // Precompila il composer WhatsApp (usa il meccanismo seed esistente).
      if (prefill?.waText) { setWaSeedText(prefill.waText); setWaSeedAt((n) => n + 1); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const waContactFields = useMemo<Record<string, string>>(() => {
    const [fn, ...rest] = fullName.split(/\s+/);
    return { nome: fn ?? "", cognome: rest.join(" "), nome_completo: fullName, telefono: phone ?? "", email: email ?? "" };
  }, [fullName, phone, email]);

  // ── SMS ──
  const { sendSmsAsync, isPending: smsSending } = useSendSms();

  // Variabili merge-field per i template (nome/email/azienda…)
  const templateVars = useMemo(() => {
    const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
    return buildTemplateVars({
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" "),
      email, phone,
      companyName: effectiveCompany?.name ?? null,
    });
  }, [name, email, phone, effectiveCompany?.name]);
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
    mutationFn: async (vars: { ch: QuickSendChannel; mode?: "generate" | "refine"; currentText?: string; instructionOverride?: string }): Promise<{ subject?: string; body?: string; mode: "generate" | "refine"; ch: QuickSendChannel }> => {
      const { data, error } = await supabase.functions.invoke("ai-compose-message", {
        body: {
          channel: vars.ch,
          mode: vars.mode ?? "generate",
          current_text: vars.currentText ?? "",
          instruction: (vars.instructionOverride ?? aiInstruction).trim(),
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
      return { subject: r?.subject, body: r?.body, mode: vars.mode ?? "generate", ch: vars.ch };
    },
    onSuccess: (r) => {
      if (r.ch === "sms") setSmsText((r.body ?? "").slice(0, SMS_MAX));
      else if (r.ch === "email") {
        if (r.subject && r.mode !== "refine") setEmailSubject(r.subject.slice(0, 200));
        if (r.body) setEmailBody(r.body.slice(0, 50_000));
      } else if (r.ch === "whatsapp") {
        setWaSeedText(r.body ?? "");
        setWaSeedAt((n) => n + 1);
      }
      toast.success(r.mode === "refine" ? "Testo rielaborato" : "Bozza generata", { description: "Modificala pure prima di inviare." });
    },
    onError: (e) => toast.error("AI non disponibile", { description: e instanceof Error ? e.message : String(e) }),
  });

  // ── Allegati email (bucket email-attachments) ──
  const handleFiles = async (files: FileList | null) => {
    if (!files || !user?.id) return;
    for (const file of Array.from(files)) {
      if (file.size > 15 * 1024 * 1024) { toast.error(`${file.name} supera 15MB`); continue; }
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const storagePath = `${user.id}/quick/${crypto.randomUUID()}-${safe}`;
      setAttachments((a) => [...a, { name: file.name, size: file.size, mime: file.type || "application/octet-stream", storage_path: storagePath, uploading: true }]);
      const { error } = await supabase.storage.from("email-attachments").upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (error) {
        setAttachments((a) => a.filter((x) => x.storage_path !== storagePath));
        toast.error(`Upload fallito: ${file.name}`);
      } else {
        setAttachments((a) => a.map((x) => x.storage_path === storagePath ? { ...x, uploading: false } : x));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const removeAttachment = (storagePath: string) => {
    setAttachments((a) => a.filter((x) => x.storage_path !== storagePath));
    void supabase.storage.from("email-attachments").remove([storagePath]);
  };

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
          to_emails: [email], cc_emails: parseEmails(emailCc), bcc_emails: parseEmails(emailBcc),
          subject, body_text: finalText, body_html: finalHtml,
          attachments: attachments.filter((a) => !a.uploading).map((a) => ({ filename: a.name, size: a.size, mime: a.mime, storage_path: a.storage_path, ...(a.bucket ? { bucket: a.bucket } : {}) })),
          status: "queued",
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

  // ⌘/Ctrl+Invio: invio rapido da tastiera su SMS ed Email
  const handleComposerKeyDown = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return;
    e.preventDefault();
    if (channel === "sms" && smsText.trim() && !smsSending) void handleSendSms();
    if (channel === "email" && emailFrom && emailSubject.trim() && emailBody.trim() && !sendEmail.isPending && !attachments.some((a) => a.uploading)) {
      sendEmail.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-[880px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Invia messaggio</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-medium text-foreground">{fullName || "Contatto"}</span>
              {hasPhone && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Smartphone className="h-3 w-3" /> {phone}
                </span>
              )}
              {hasEmail && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Mail className="h-3 w-3" /> {email}
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={channel} onValueChange={(v) => setChannel(v as QuickSendChannel)}>
          <TabsList className={`grid w-full h-11 ${isPlatformContext ? "grid-cols-4" : "grid-cols-3"}`}>
            <TabsTrigger value="sms" disabled={!hasPhone} className="gap-2 text-sm"><Smartphone className="h-4 w-4" /> SMS</TabsTrigger>
            <TabsTrigger value="whatsapp" disabled={!hasPhone} className="gap-2 text-sm"><MessageSquare className="h-4 w-4" /> WhatsApp</TabsTrigger>
            <TabsTrigger value="email" disabled={!hasEmail} className="gap-2 text-sm"><Mail className="h-4 w-4" /> Email</TabsTrigger>
            {isPlatformContext && (
              <TabsTrigger value="whatsapp_locale" disabled={!hasPhone} className="gap-2 text-sm"><MessageSquare className="h-4 w-4" /> WA Locale</TabsTrigger>
            )}
          </TabsList>

          {/* SMS — composer a sinistra, AI/template a destra (stack su mobile) */}
          <TabsContent value="sms" className="pt-3">
            {hasPhone ? (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-2">
                  <Textarea
                    placeholder="Scrivi l'SMS…"
                    value={smsText}
                    onChange={(e) => setSmsText(e.target.value.slice(0, SMS_MAX))}
                    onKeyDown={handleComposerKeyDown}
                    rows={9}
                    className="text-sm resize-y min-h-[160px]"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{smsText.length}/{SMS_MAX} · {Math.max(1, Math.ceil(smsText.length / 153))} segmento/i</span>
                    <Button className="gap-1.5" onClick={handleSendSms} disabled={!smsText.trim() || smsSending}>
                      {smsSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Invia SMS
                    </Button>
                  </div>
                  <p className="text-right text-[10px] text-muted-foreground max-md:text-[11px]">⌘+Invio per inviare</p>
                </div>
                <aside className="space-y-3">
                  <AiAssistRow
                    instruction={aiInstruction} setInstruction={setAiInstruction} tone={aiTone} setTone={setAiTone}
                    pending={composeAi.isPending} currentText={smsText}
                    onGenerate={() => composeAi.mutate({ ch: "sms" })}
                    onRefine={(act) => composeAi.mutate({ ch: "sms", mode: "refine", currentText: smsText, instructionOverride: act })}
                  />
                  <div className="rounded-lg border p-2.5">
                    <MessageTemplatePicker channel="sms" vars={templateVars} align="end" onInsert={({ body }) => setSmsText(body.slice(0, SMS_MAX))} />
                  </div>
                </aside>
              </div>
            ) : <p className="text-xs text-muted-foreground italic py-4 text-center">Il contatto non ha un numero di telefono.</p>}
          </TabsContent>

          {/* WhatsApp — composer a sinistra, AI a destra */}
          <TabsContent value="whatsapp" className="pt-3">
            {hasPhone ? (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
                <div>
              <WhatsAppComposer
                phone={cleanPhone} isSending={waSending} contactFields={waContactFields}
                seedText={waSeedText} seedAt={waSeedAt}
                onSend={async ({ waNumberId, content, template }) => {
                  if (!effectiveCompany?.id) { toast.error("Azienda non disponibile"); return; }
                  setWaSending(true);
                  try {
                    const payload: Record<string, unknown> = { company_id: effectiveCompany.id, to: cleanPhone, wa_number_id: waNumberId, ...(contactId ? { contact_id: contactId } : {}) };
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
                </div>
                <aside className="space-y-3">
                  <AiAssistRow
                    instruction={aiInstruction} setInstruction={setAiInstruction} tone={aiTone} setTone={setAiTone}
                    pending={composeAi.isPending} currentText=""
                    onGenerate={() => composeAi.mutate({ ch: "whatsapp" })}
                    onRefine={() => composeAi.mutate({ ch: "whatsapp" })}
                  />
                </aside>
              </div>
            ) : <p className="text-xs text-muted-foreground italic py-4 text-center">Il contatto non ha un numero di telefono.</p>}
          </TabsContent>

          {/* WhatsApp Locale (canale non-ufficiale, solo piattaforma) */}
          {isPlatformContext && (
            <TabsContent value="whatsapp_locale" className="space-y-2 pt-2">
              {hasPhone ? (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Invio dal pool di numeri non-ufficiali. Il mittente è scelto per tag e capacità giornaliera.
                  </p>
                  <Textarea
                    placeholder="Scrivi il messaggio WhatsApp…"
                    value={waLocaleText}
                    onChange={(e) => setWaLocaleText(e.target.value)}
                    rows={8}
                    className="text-sm resize-y min-h-[160px]"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={!waLocaleText.trim() || waLocaleSending}
                      onClick={async () => {
                        if (waLocaleSending) return;
                        setWaLocaleSending(true);
                        try {
                          const { error } = await supabase.functions.invoke("openwa-gateway", {
                            body: { action: "send_text", contact_id: contactId ?? null, to: cleanPhone, text: waLocaleText.trim() },
                          });
                          if (error) throw new Error(await extractInvokeError(error));
                          toast.success("Messaggio WhatsApp Locale inviato");
                          setWaLocaleText("");
                          onSent?.();
                          onOpenChange(false);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Errore invio");
                        } finally {
                          setWaLocaleSending(false);
                        }
                      }}
                    >
                      {waLocaleSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Invia
                    </Button>
                  </div>
                </>
              ) : <p className="text-xs text-muted-foreground italic py-4 text-center">Il contatto non ha un numero di telefono.</p>}
            </TabsContent>
          )}

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
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
                {/* Colonna composer: Da / Oggetto / corpo / allegati / invio */}
                <div className="space-y-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-0.5">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground max-md:text-[11px]">Da</Label>
                      <Select value={emailFrom} onValueChange={setEmailFrom}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Scegli mittente" /></SelectTrigger>
                        <SelectContent>
                          {emailAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id} className="text-xs">
                              {a.email_address ?? a.id}{a.provider && <span className="ml-2 text-[10px] text-muted-foreground capitalize max-md:text-[11px]">({a.provider})</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground max-md:text-[11px]">A</Label>
                      <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-xs text-muted-foreground truncate">{email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input placeholder="Oggetto" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value.slice(0, 200))} className="h-9 text-sm flex-1" />
                    {!ccBccVisible && (
                      <button type="button" className="text-[11px] text-blue-600 hover:underline font-medium shrink-0" onClick={() => setCcBccVisible(true)}>+ Cc/Ccn</button>
                    )}
                  </div>
                  {ccBccVisible && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Cc (virgola)" value={emailCc} onChange={(e) => setEmailCc(e.target.value)} className="h-8 text-xs" />
                      <Input placeholder="Ccn / Bcc (virgola)" value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} className="h-8 text-xs" />
                    </div>
                  )}

                  <Textarea
                    placeholder="Scrivi l'email…"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value.slice(0, 50_000))}
                    onKeyDown={handleComposerKeyDown}
                    rows={12}
                    className="text-sm resize-y min-h-[220px]"
                  />

                  {/* Allegati */}
                  <div className="space-y-1">
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                    {attachments.length > 0 && (
                      <ul className="space-y-1">
                        {attachments.map((a) => (
                          <li key={a.storage_path} className="flex items-center gap-2 rounded border px-2 py-1 text-[11px]">
                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate flex-1">{a.name}</span>
                            <span className="text-muted-foreground shrink-0">{(a.size / 1024).toFixed(0)} KB</span>
                            {a.uploading ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> : (
                              <button type="button" onClick={() => removeAttachment(a.storage_path)} className="text-rose-500 hover:text-rose-700 shrink-0" aria-label="Rimuovi allegato"><X className="h-3 w-3" /></button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground" onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="h-3.5 w-3.5" /> Allega file
                    </Button>
                    <Button className="gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={() => sendEmail.mutate()} disabled={!emailFrom || !emailSubject.trim() || !emailBody.trim() || sendEmail.isPending || attachments.some((a) => a.uploading)}>
                      {sendEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Invia Email
                    </Button>
                  </div>
                  <p className="text-right text-[10px] text-muted-foreground max-md:text-[11px]">⌘+Invio per inviare</p>
                </div>

                {/* Colonna strumenti: AI, template, firma, documenti commessa */}
                <aside className="space-y-3">
                  <AiAssistRow
                    instruction={aiInstruction} setInstruction={setAiInstruction} tone={aiTone} setTone={setAiTone}
                    pending={composeAi.isPending} currentText={emailBody}
                    onGenerate={() => composeAi.mutate({ ch: "email" })}
                    onRefine={(act) => composeAi.mutate({ ch: "email", mode: "refine", currentText: emailBody, instructionOverride: act })}
                  />

                  <div className="rounded-lg border p-2.5 space-y-2">
                    <MessageTemplatePicker
                      channel="email"
                      vars={templateVars}
                      align="end"
                      onInsert={({ subject, body }) => { if (subject) setEmailSubject(subject.slice(0, 200)); setEmailBody(body.slice(0, 50_000)); }}
                    />
                    <EmailTemplatePicker
                      onApply={(t) => { setEmailSubject(t.subject); setEmailBody(t.body_text); }}
                    />
                  </div>

                  {/* Firma editabile */}
                  <div className="rounded-lg border p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-medium flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5 text-violet-600" /> Firma</Label>
                      <div className="flex items-center gap-2">
                        <button type="button" className="text-[10px] text-blue-600 hover:underline max-md:text-[11px]" onClick={() => setSigEdit((v) => !v)}>
                          {sigEdit ? "Nascondi" : "Modifica"}
                        </button>
                        <Switch checked={sigEnabled} onCheckedChange={setSigEnabled} aria-label="Includi firma" />
                      </div>
                    </div>
                    {sigEnabled && sigEdit && (
                      <Textarea placeholder="La tua firma (es. Nome Cognome · Azienda · tel)…" value={sigText} onChange={(e) => setSigText(e.target.value.slice(0, 1000))} rows={3} className="text-xs resize-y" />
                    )}
                    {sigEnabled && !sigEdit && (
                      <p className="text-[10px] text-muted-foreground whitespace-pre-wrap line-clamp-2 max-md:text-[11px]">{sigText || "Nessuna firma impostata sull'account — clicca «Modifica» per scriverla."}</p>
                    )}
                    {!sigEnabled && <p className="text-[10px] text-muted-foreground max-md:text-[11px]">Firma disattivata per questa email.</p>}
                  </div>

                  {/* Documenti commessa */}
                  {orderId && (
                    <OrderDocumentAttacher
                      orderId={orderId}
                      alreadyAttached={attachments.map((a) => a.storage_path)}
                      onAttach={(doc) =>
                        setAttachments((prev) => [
                          ...prev,
                          {
                            name: doc.name,
                            size: doc.size ?? 0,
                            mime: doc.mime ?? "application/octet-stream",
                            storage_path: doc.file_url,
                            bucket: doc.bucket,
                            uploading: false,
                          },
                        ])
                      }
                      onDetach={(url) =>
                        setAttachments((prev) => prev.filter((a) => a.storage_path !== url))
                      }
                    />
                  )}
                </aside>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const PRESETS = ["Proponi un sopralluogo", "Sollecito preventivo", "Conferma appuntamento", "Ringraziamento"];

/** Riga "Scrivi con l'AI" — a livello modulo per non remountare il textarea. */
function AiAssistRow({
  instruction, setInstruction, tone, setTone, pending, onGenerate, onRefine, currentText,
}: {
  instruction: string;
  setInstruction: (v: string) => void;
  tone: string;
  setTone: (v: string) => void;
  pending: boolean;
  onGenerate: () => void;
  onRefine: (action: string) => void;
  currentText: string;
}) {
  const hasText = currentText.trim().length > 0;
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-700">
        <Sparkles className="h-3.5 w-3.5" /> Scrivi con l'AI
      </div>
      {/* Preset rapidi → riempiono l'istruzione */}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setInstruction(p)}
            className="rounded-full border border-orange-200 bg-white px-2 py-0.5 text-[10px] text-orange-700 hover:bg-orange-100 max-md:text-[11px]"
          >
            {p}
          </button>
        ))}
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
      {/* Rielabora il testo già scritto */}
      {hasText && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <span className="text-[10px] text-muted-foreground max-md:text-[11px]">Sul testo:</span>
          {[["Migliora", "migliora il testo rendendolo più chiaro e professionale"], ["Accorcia", "accorcia il testo mantenendo il messaggio"], ["Allunga", "espandi il testo con qualche dettaglio utile"], ["Più formale", "rendi il testo più formale"]].map(([label, act]) => (
            <button
              key={label}
              type="button"
              disabled={pending}
              onClick={() => onRefine(act)}
              className="rounded-md border bg-white px-1.5 py-0.5 text-[10px] hover:bg-muted disabled:opacity-50 max-md:text-[11px]"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default QuickContactSendDialog;
