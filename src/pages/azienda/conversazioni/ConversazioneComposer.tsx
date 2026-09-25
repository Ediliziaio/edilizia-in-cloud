import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Mail, MessageSquare, MessageCircle, Send, Loader2, Instagram, Facebook } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntitaTipo } from "@/hooks/useConversazioni";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";

type Canale = "email" | "whatsapp" | "whatsapp_locale" | "sms" | "instagram" | "messenger";
type PiattaformaSocial = "instagram" | "messenger";

interface IdentitaSocial {
  piattaforma: PiattaformaSocial;
  nome: string | null;
  username: string | null;
  ultimo_in_at: string | null;
}

/** Meta lascia rispondere entro 24 ore dall'ultimo messaggio della persona. */
function finestraAperta(ultimoIn: string | null): boolean {
  return !!ultimoIn && Date.now() - new Date(ultimoIn).getTime() < 24 * 60 * 60 * 1000;
}

interface EmailAccount {
  id: string;
  email_address: string | null;
  provider: string | null;
}

interface Props {
  entitaTipo: EntitaTipo;
  entitaId: string;
  email: string | null;
  telefono: string | null;
  /** Callback dopo invio riuscito (es. refresh timeline). */
  onSent?: () => void;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Composer multi-canale dell'inbox Conversazioni.
 *  • Email    → invio REALE (insert email_outbox → edge function email-send),
 *               stesso flusso comprovato di CustomerComposeBar.
 *  • WhatsApp → apre wa.me col testo precompilato (nessuna config Meta richiesta).
 *  • SMS      → rimando al modulo SMS dedicato (coerente col resto dell'app).
 */
export default function ConversazioneComposer({ entitaTipo, entitaId, email, telefono, onSent }: Props) {
  const { user, effectiveCompany } = useAuth();
  const qc = useQueryClient();

  // null = nessuna scelta: il canale predefinito si ricava dai dati del contatto.
  const [canaleScelto, setCanale] = useState<Canale | null>(null);
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [testoLocale, setTestoLocale] = useState("");
  const [testoSocial, setTestoSocial] = useState("");

  // Instagram e Messenger: il canale compare solo se il contatto ci ha scritto.
  const { data: identitaSocial = [] } = useQuery({
    queryKey: ["social-identita", entitaTipo, entitaId],
    enabled: entitaTipo === "contatto" && !!entitaId,
    staleTime: 30_000,
    queryFn: async (): Promise<IdentitaSocial[]> => {
      // Tabella nuova, non ancora nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("social_identita")
        .select("piattaforma, nome, username, ultimo_in_at")
        .eq("contact_id", entitaId)
        .order("ultimo_in_at", { ascending: false, nullsFirst: false });
      if (error) return [];
      return (data ?? []) as IdentitaSocial[];
    },
  });
  const socialDi = (p: PiattaformaSocial) => identitaSocial.find((i) => i.piattaforma === p) ?? null;

  // Chi ha scritto solo da Instagram/Messenger non ha email né telefono:
  // il composer si apre direttamente sul canale da cui è arrivato.
  const canale: Canale = canaleScelto
    ?? (email ? "email" : telefono ? "whatsapp" : identitaSocial[0]?.piattaforma ?? "email");

  const inviaSocial = useMutation({
    mutationFn: async (piattaforma: PiattaformaSocial) => {
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");
      const { data, error } = await supabase.functions.invoke("meta-api-proxy", {
        body: { action: "invia-messaggio-social", company_id: effectiveCompany.id, contact_id: entitaId, piattaforma, testo: testoSocial },
      });
      const r = data as { ok?: boolean; error?: string } | null;
      if (r?.error) throw new Error(r.error);
      if (error) throw new Error(error.message ?? "Invio non riuscito");
    },
    onSuccess: (_d, piattaforma) => {
      setTestoSocial("");
      toast.success(`Messaggio ${piattaforma === "instagram" ? "Instagram" : "Messenger"} inviato`);
      qc.invalidateQueries({ queryKey: ["conversazione-timeline", entitaTipo, entitaId] });
      qc.invalidateQueries({ queryKey: ["conversazioni-lista"] });
      onSent?.();
    },
    onError: (e) => toast.error("Messaggio non inviato", { description: (e as Error).message }),
  });

  // Numeri del canale WhatsApp LOCALE (non ufficiale, solo piattaforma).
  // La RLS su openwa_numbers e' super-admin-only: per chiunque altro la query
  // torna vuota o negata → il canale semplicemente non compare. Nessun flag.
  const { data: numeriLocali = [] } = useQuery({
    queryKey: ["conv-compose-openwa"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_numbers")
        .select("id, display_name, numero, stato")
        .eq("stato", "connected")
        .is("deleted_at", null);
      if (error) return [];
      return (data ?? []) as Array<{ id: string; display_name: string | null; numero: string | null; stato: string }>;
    },
  });

  const inviaLocale = useMutation({
    mutationFn: async () => {
      if (!cleanPhone) throw new Error("Il contatto non ha un numero di telefono");
      const testo = testoLocale.trim();
      if (!testo) throw new Error("Scrivi un messaggio");
      const { data, error } = await supabase.functions.invoke("openwa-gateway", {
        body: { action: "send_text", to: telefono, text: testo },
      });
      if (error) throw new Error(error.message ?? "Invio fallito");
      const r = data as { ok?: boolean; error?: string } | null;
      if (r?.ok === false || r?.error) throw new Error(r?.error ?? "Invio fallito");
    },
    onSuccess: () => {
      setTestoLocale("");
      toast.success("Messaggio WhatsApp Locale inviato");
      qc.invalidateQueries({ queryKey: ["conversazione-timeline", entitaTipo, entitaId] });
      qc.invalidateQueries({ queryKey: ["conversazioni-lista"] });
      qc.invalidateQueries({ queryKey: ["openwa"] });
      onSent?.();
    },
    onError: (e) => toast.error("Invio WhatsApp Locale fallito", { description: (e as Error).message }),
  });

  // In area piattaforma le impostazioni email stanno sotto /admin: il link
  // fisso a /azienda/... portava fuori contesto.
  const impostazioniEmailHref = window.location.pathname.startsWith("/admin")
    ? "/admin/impostazioni/email"
    : "/azienda/impostazioni/email";

  const cleanPhone = (telefono ?? "").replace(/\D/g, "");
  const waHref = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith("39") || cleanPhone.length > 10 ? cleanPhone : `39${cleanPhone}`}`
    : null;

  // Account email collegati (solo se canale=email).
  const { data: accounts = [] } = useQuery({
    queryKey: ["conv-compose-accounts", user?.id, effectiveCompany?.id],
    enabled: !!user?.id && !!effectiveCompany?.id && canale === "email",
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
        if (code === "42P01" || code === "42501") return [] as EmailAccount[];
        throw error;
      }
      return (data ?? []) as EmailAccount[];
    },
  });

  // Mittente effettivo: scelto dall'utente o primo account disponibile.
  // Derivato (niente useEffect → niente set-state-in-effect / cascading render).
  const fromId = from || accounts[0]?.id || "";

  /**
   * Invio col mittente della piattaforma (nessun OAuth richiesto).
   * La riga in email_outbox non e' una formalita': la timeline delle
   * conversazioni legge da li', quindi senza non resterebbe traccia del
   * messaggio nella chat.
   */
  const inviaDaPiattaforma = async () => {
    const s2 = subject.trim(), b2 = body.trim();
    if (!s2) throw new Error("Aggiungi un oggetto");
    if (!b2) throw new Error("Scrivi un messaggio");
    const html = b2.split("\n").map((l) => `<p>${escapeHtml(l) || "<br/>"}</p>`).join("");
    const { data, error } = await supabase.functions.invoke("send-transactional-v2", {
      body: {
        companyId: effectiveCompany?.id ?? null,
        to: email,
        precomputedSubject: s2,
        precomputedHtml: html,
        precomputedText: b2,
        metadata: { source: "conversazioni" },
      },
    });
    if (error) throw new Error(error.message ?? "Invio fallito");
    const r = data as { ok?: boolean; error?: string } | null;
    if (r?.ok === false || r?.error) throw new Error(r?.error ?? "Invio fallito");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("email_outbox").insert({
      user_id: user!.id,
      company_id: effectiveCompany!.id,
      to_emails: [email],
      cc_emails: [], bcc_emails: [],
      subject: s2, body_text: b2, body_html: html,
      attachments: [], status: "sent", sent_at: new Date().toISOString(),
    });
  };

  const sendEmail = useMutation({
    mutationFn: async () => {
      if (!user?.id || !effectiveCompany?.id) throw new Error("Non autenticato");
      if (!email) throw new Error("Il contatto non ha un indirizzo email");
      // Senza casella personale collegata l'email non era proprio inviabile da
      // qui: il canale restava bloccato. Ma la piattaforma ha gia' un mittente
      // proprio (quello che manda le transazionali), quindi si puo' scrivere
      // lo stesso — solo da quell'indirizzo invece che dal proprio.
      if (!fromId) return await inviaDaPiattaforma();
      const s = subject.trim();
      const b = body.trim();
      if (!s) throw new Error("Aggiungi un oggetto");
      if (!b) throw new Error("Scrivi un messaggio");

      const bodyHtml = b.split("\n").map((l) => `<p>${escapeHtml(l) || "<br/>"}</p>`).join("");

      // 1) Insert outbox row (status=queued)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error: insErr } = await (supabase as any)
        .from("email_outbox")
        .insert({
          user_id: user.id,
          company_id: effectiveCompany.id,
          oauth_connection_id: fromId,
          to_emails: [email],
          cc_emails: [],
          bcc_emails: [],
          subject: s,
          body_text: b,
          body_html: bodyHtml,
          attachments: [],
          status: "queued",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const outboxId = row?.id as string;
      if (!outboxId) throw new Error("Errore creazione bozza");

      // 2) Invoke email-send con hang-protection 30s
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30_000);
      try {
        const { data, error } = await supabase.functions.invoke("email-send", {
          body: { outbox_id: outboxId },
        });
        if (error) throw new Error(error.message ?? "Invio fallito");
        const r = data as { ok?: boolean; error?: string } | null;
        if (r?.ok === false) throw new Error(r?.error ?? "Invio fallito");
      } finally {
        clearTimeout(t);
      }
    },
    onSuccess: () => {
      setSubject("");
      setBody("");
      toast.success(`Email inviata a ${email}`);
      qc.invalidateQueries({ queryKey: ["conversazione-timeline", entitaTipo, entitaId] });
      qc.invalidateQueries({ queryKey: ["conversazioni-lista"] });
      onSent?.();
    },
    onError: (e) => toast.error("Invio email fallito", { description: (e as Error).message }),
  });

  const CANALI: { key: Canale; label: string; Icon: typeof Mail; disabled: boolean }[] = [
    { key: "email", label: "Email", Icon: Mail, disabled: !email },
    { key: "whatsapp", label: "WhatsApp", Icon: MessageCircle, disabled: !waHref },
    // Canale non ufficiale della piattaforma: compare solo se c'e' almeno un
    // numero collegato E il contatto ha un telefono.
    ...(numeriLocali.length > 0
      ? [{ key: "whatsapp_locale" as Canale, label: "WA Locale", Icon: MessageCircle, disabled: !cleanPhone }]
      : []),
    { key: "sms", label: "SMS", Icon: MessageSquare, disabled: false },
    ...(socialDi("instagram") ? [{ key: "instagram" as Canale, label: "Instagram", Icon: Instagram, disabled: false }] : []),
    ...(socialDi("messenger") ? [{ key: "messenger" as Canale, label: "Messenger", Icon: Facebook, disabled: false }] : []),
  ];

  return (
    <div className="border-t bg-background shrink-0">
      {/* Selettore canale */}
      <div className="flex items-center gap-1 px-3 pt-2">
        {CANALI.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={c.disabled}
            onClick={() => setCanale(c.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              canale === c.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              c.disabled && "opacity-40 cursor-not-allowed",
            )}
          >
            <c.Icon className="h-3.5 w-3.5" />{c.label}
          </button>
        ))}
      </div>

      {/* EMAIL */}
      {canale === "email" && (
        <div className="p-3 space-y-2 max-w-3xl mx-auto">
          {accounts.length === 0 ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
              Nessuna casella personale collegata: l'email partirà dall'indirizzo della
              piattaforma. Per scrivere dal tuo,{" "}
              <a href={impostazioniEmailHref} className="underline font-medium">collega Gmail o Outlook</a>.
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={fromId} onValueChange={setFrom}>
                <SelectTrigger className="h-8 text-xs w-[200px] shrink-0" aria-label="Account email mittente"><SelectValue placeholder="Mittente" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">{a.email_address ?? a.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={email ?? ""} disabled className="h-8 text-xs bg-muted/40" />
            </div>
          )}
          <Input
            placeholder="Oggetto…"
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 200))}
            className="h-9 text-base sm:h-8 sm:text-sm"
          />
          <div className="flex items-end gap-2">
            <Textarea
              placeholder="Scrivi l'email…"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 50_000))}
              rows={2}
              className="text-sm resize-y min-h-[56px]"
            />
            <Button
              size="icon"
              className="shrink-0"
              aria-label="Invia email"
              onClick={() => sendEmail.mutate()}
              disabled={!email || !subject.trim() || !body.trim() || sendEmail.isPending}
            >
              {sendEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* WHATSAPP — invio API reale (numero + template + finestra 24h) via whatsapp-send,
          loggato → il messaggio rientra nel thread. Niente più wa.me manuale. */}
      {canale === "whatsapp" && (
        <div className="p-3 max-w-3xl mx-auto">
          {cleanPhone ? (
            <WhatsAppComposer
              phone={cleanPhone}
              isSending={waSending}
              onSend={async ({ waNumberId, content, template }) => {
                if (!effectiveCompany?.id) { toast.error("Azienda non disponibile"); return; }
                setWaSending(true);
                try {
                  const payload: Record<string, unknown> = {
                    company_id: effectiveCompany.id,
                    to: cleanPhone,
                    wa_number_id: waNumberId,
                    // Il messaggio resta su questo contatto anche se il numero è su più schede.
                    ...(entitaTipo === "contatto" ? { contact_id: entitaId } : {}),
                  };
                  if (template) {
                    payload.template = { name: template.name, language: template.language, variables: template.variables };
                  } else {
                    payload.text = { body: content };
                  }
                  const { data, error } = await supabase.functions.invoke("whatsapp-send", { body: payload });
                  if (error) throw error;
                  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
                  // Una persona ha risposto a mano: l'agente WhatsApp non le
                  // parla sopra. Col template no: chi manda il primo messaggio
                  // vuole proprio che alla risposta del lead pensi l'agente.
                  if (!template && entitaTipo === "contatto") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { error: pausaErr } = await (supabase as any).from("conversazioni").upsert({
                      company_id: effectiveCompany.id,
                      entita_tipo: "contatto",
                      entita_id: entitaId,
                      bot_in_pausa: true,
                      bot_in_pausa_motivo: "Ha risposto una persona dalla chat",
                      bot_in_pausa_il: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    }, { onConflict: "company_id,entita_tipo,entita_id" });
                    if (pausaErr) console.warn("[composer] pausa assistente non salvata:", pausaErr.message);
                    qc.invalidateQueries({ queryKey: ["conversazione-assistente"] });
                  }
                  toast.success("Messaggio WhatsApp inviato");
                  qc.invalidateQueries({ queryKey: ["conversazione-timeline", entitaTipo, entitaId] });
                  qc.invalidateQueries({ queryKey: ["conversazioni-lista"] });
                  onSent?.();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Errore invio WhatsApp");
                } finally {
                  setWaSending(false);
                }
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">Contatto senza numero di telefono.</p>
          )}
        </div>
      )}

      {/* WHATSAPP LOCALE — canale non ufficiale (OpenWA): invio diretto dal
          numero della piattaforma, il messaggio rientra nel thread. */}
      {canale === "whatsapp_locale" && (
        <div className="p-3 max-w-3xl mx-auto space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Parte dal numero {numeriLocali[0]?.display_name || numeriLocali[0]?.numero}
            {numeriLocali.length > 1 && " (o dal numero già usato con questo contatto)"} · canale non ufficiale
          </p>
          <div className="flex items-end gap-2">
            <Textarea
              placeholder={`Messaggio WhatsApp a ${telefono ?? ""}…`}
              value={testoLocale}
              onChange={(e) => setTestoLocale(e.target.value.slice(0, 4000))}
              rows={2}
              className="text-sm resize-y min-h-[56px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (testoLocale.trim() && !inviaLocale.isPending) inviaLocale.mutate();
                }
              }}
            />
            <Button
              size="icon"
              className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
              aria-label="Invia WhatsApp Locale"
              onClick={() => inviaLocale.mutate()}
              disabled={!cleanPhone || !testoLocale.trim() || inviaLocale.isPending}
            >
              {inviaLocale.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* INSTAGRAM / MESSENGER — risposta entro 24 ore dall'ultimo messaggio */}
      {(canale === "instagram" || canale === "messenger") && (() => {
        const piattaforma: PiattaformaSocial = canale;
        const id = socialDi(piattaforma);
        const aperta = finestraAperta(id?.ultimo_in_at ?? null);
        const etichetta = piattaforma === "instagram" ? "Instagram" : "Messenger";
        return (
          <div className="p-3 max-w-3xl mx-auto space-y-2">
            <p className="text-[11px] text-muted-foreground">
              {etichetta}{id?.username ? ` · @${id.username}` : id?.nome ? ` · ${id.nome}` : ""}
              {aperta && " · puoi rispondere fino a 24 ore dal suo ultimo messaggio"}
            </p>
            {!aperta && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Sono passate più di 24 ore dal suo ultimo messaggio: Meta non permette di rispondere da qui
                finché non scrive di nuovo. Puoi rispondere dall'app di {etichetta}.
              </div>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                placeholder={`Messaggio ${etichetta}…`}
                value={testoSocial}
                onChange={(e) => setTestoSocial(e.target.value.slice(0, 1000))}
                rows={2}
                disabled={!aperta}
                className="text-sm resize-y min-h-[56px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (aperta && testoSocial.trim() && !inviaSocial.isPending) inviaSocial.mutate(piattaforma);
                  }
                }}
              />
              <Button
                size="icon"
                className="shrink-0"
                aria-label={`Invia messaggio ${etichetta}`}
                onClick={() => inviaSocial.mutate(piattaforma)}
                disabled={!aperta || !testoSocial.trim() || inviaSocial.isPending}
              >
                {inviaSocial.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        );
      })()}

      {/* SMS */}
      {canale === "sms" && (
        <div className="p-3 max-w-3xl mx-auto text-xs text-muted-foreground italic">
          Invio SMS singolo in arrivo. Per ora usa il <a href="/azienda/sms" className="underline">modulo SMS</a> dedicato.
        </div>
      )}
    </div>
  );
}
