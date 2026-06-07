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
import { Mail, MessageSquare, MessageCircle, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntitaTipo } from "@/hooks/useConversazioni";

type Canale = "email" | "whatsapp" | "sms";

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

  const [canale, setCanale] = useState<Canale>(email ? "email" : telefono ? "whatsapp" : "email");
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [waText, setWaText] = useState("");

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

  const sendEmail = useMutation({
    mutationFn: async () => {
      if (!user?.id || !effectiveCompany?.id) throw new Error("Non autenticato");
      if (!fromId) throw new Error("Seleziona l'account mittente");
      if (!email) throw new Error("Il contatto non ha un indirizzo email");
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

  const apriWhatsApp = () => {
    if (waHref && waText.trim()) {
      window.open(`${waHref}?text=${encodeURIComponent(waText.trim())}`, "_blank", "noopener,noreferrer");
      setWaText("");
    }
  };

  const CANALI: { key: Canale; label: string; Icon: typeof Mail; disabled: boolean }[] = [
    { key: "email", label: "Email", Icon: Mail, disabled: !email },
    { key: "whatsapp", label: "WhatsApp", Icon: MessageCircle, disabled: !waHref },
    { key: "sms", label: "SMS", Icon: MessageSquare, disabled: false },
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
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
              Nessuna casella email collegata.{" "}
              <a href="/azienda/impostazioni/email" className="underline font-medium">Collega Gmail/Outlook</a> per inviare da qui.
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
            className="h-8 text-sm"
            disabled={accounts.length === 0}
          />
          <div className="flex items-end gap-2">
            <Textarea
              placeholder="Scrivi l'email…"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 50_000))}
              rows={2}
              className="text-sm resize-y min-h-[56px]"
              disabled={accounts.length === 0}
            />
            <Button
              size="icon"
              className="shrink-0"
              aria-label="Invia email"
              onClick={() => sendEmail.mutate()}
              disabled={!fromId || !email || !subject.trim() || !body.trim() || sendEmail.isPending}
            >
              {sendEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* WHATSAPP */}
      {canale === "whatsapp" && (
        <div className="p-3 max-w-3xl mx-auto">
          <div className="flex items-end gap-2">
            <Textarea
              placeholder={waHref ? "Messaggio WhatsApp…" : "Contatto senza numero"}
              value={waText}
              onChange={(e) => setWaText(e.target.value.slice(0, 5000))}
              rows={1}
              disabled={!waHref}
              className="text-sm resize-none min-h-[40px]"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); apriWhatsApp(); } }}
            />
            <Button size="icon" className="shrink-0 bg-emerald-600 hover:bg-emerald-700" aria-label="Invia messaggio WhatsApp" onClick={apriWhatsApp} disabled={!waHref || !waText.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Apre WhatsApp con il messaggio precompilato.</p>
        </div>
      )}

      {/* SMS */}
      {canale === "sms" && (
        <div className="p-3 max-w-3xl mx-auto text-xs text-muted-foreground italic">
          Invio SMS singolo in arrivo. Per ora usa il <a href="/azienda/sms" className="underline">modulo SMS</a> dedicato.
        </div>
      )}
    </div>
  );
}
