/**
 * CustomerComposeBar — compose inline pagina cliente.
 *
 * 2026-05-27 (richiesta utente "invia email da qui ottimizzata"):
 * input in fondo alla colonna centro, pattern marketing
 * (MarketingContactDetail). Supporta:
 *  - email   → invocazione email-send via outbox (compose dialog completa)
 *  - whatsapp/sms → coming soon, link al rispettivo modulo
 *  - nota interna → salvataggio nel diario
 *
 * Per l'email: apre EmailComposeDialog pre-popolato col destinatario
 * cliente, NON manda direttamente (l'utente vuole vedere
 * subject/body prima di inviare per evitare typo).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mail, MessageSquare, Smartphone, StickyNote, Send, Loader2, ChevronDown,
} from "lucide-react";
import { EmailComposeDialog, type ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";

type Channel = "email" | "whatsapp" | "sms" | "note";

interface CustomerComposeBarProps {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  /** Callback dopo nota salvata (es. invalida diario query). */
  onNoteSaved?: () => void;
}

const CHANNELS: { key: Channel; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "email",    label: "Email",    icon: <Mail className="h-3.5 w-3.5" />,          color: "text-violet-600" },
  { key: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-emerald-600" },
  { key: "sms",      label: "SMS",      icon: <Smartphone className="h-3.5 w-3.5" />,    color: "text-blue-600" },
  { key: "note",     label: "Nota",     icon: <StickyNote className="h-3.5 w-3.5" />,    color: "text-amber-600" },
];

export function CustomerComposeBar({
  customerId,
  customerEmail,
  customerPhone,
  onNoteSaved,
}: CustomerComposeBarProps) {
  const { user, effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<Channel>("note");
  const [text, setText] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext>({ mode: "new" });

  const cleanPhone = (customerPhone ?? "").replace(/\D/g, "");
  const waHref = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith("39") || cleanPhone.length > 10 ? cleanPhone : `39${cleanPhone}`}`
    : null;

  // 2026-05-27: schema reale tabella è `customer_messages` (vedi
  // CustomerDiaryPanel) con campi sender_role/sender_id/channel/body.
  // "internal" è la channel per note interne staff-only.
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
      // Invalida sia il diario sia eventuali query timeline che leggono customer_messages
      qc.invalidateQueries({ queryKey: ["customer-messages", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-diary", customerId] });
      setText("");
      toast.success("Nota salvata nel diario");
      onNoteSaved?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio nota");
    },
  });

  const handleSubmit = () => {
    const content = text.trim();
    if (!content && channel !== "email") return;

    if (channel === "email") {
      // Email: apre il dialog completo (compose dialog ha già subject/body/attachments)
      setComposeContext({
        mode: "new",
        initialTo: customerEmail ? [customerEmail] : undefined,
        initialSubject: text || undefined,
      });
      setComposeOpen(true);
      setText("");
      return;
    }

    if (channel === "whatsapp") {
      if (!waHref) {
        toast.error("Nessun numero WhatsApp disponibile");
        return;
      }
      const url = `${waHref}?text=${encodeURIComponent(content)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      setText("");
      return;
    }

    if (channel === "sms") {
      toast.info("Invio SMS disponibile presto", {
        description: "Apri /azienda/sms per inviare manualmente.",
      });
      return;
    }

    if (channel === "note") {
      saveNote.mutate(content);
    }
  };

  const activeChannel = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0];
  const placeholder =
    channel === "email"     ? "Oggetto email (poi apri compose completo)…" :
    channel === "whatsapp"  ? "Scrivi messaggio WhatsApp…" :
    channel === "sms"       ? "Scrivi SMS…" :
                              "Scrivi una nota interna…";

  return (
    <>
      <div className="border-t shrink-0 bg-card">
        <div className="px-3 py-2 flex items-end gap-2">
          {/* Channel selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 px-2 gap-1.5 shrink-0">
                <span className={activeChannel.color}>{activeChannel.icon}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {CHANNELS.map((c) => (
                <DropdownMenuItem
                  key={c.key}
                  onClick={() => setChannel(c.key)}
                  disabled={c.key === "email" && !customerEmail}
                >
                  <span className={`mr-2 ${c.color}`}>{c.icon}</span>
                  {c.label}
                  {c.key === "email" && !customerEmail && (
                    <span className="ml-auto text-[10px] text-muted-foreground">no email</span>
                  )}
                  {c.key === "whatsapp" && !waHref && (
                    <span className="ml-auto text-[10px] text-muted-foreground">no tel.</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Input */}
          {channel === "note" ? (
            <Textarea
              placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 5000))}
              rows={1}
              className="min-h-[40px] max-h-32 text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) handleSubmit();
                }
              }}
            />
          ) : (
            <Input
              placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 5000))}
              className="h-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (text.trim() || channel === "email")) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          )}

          {/* Send button */}
          <Button
            size="sm"
            className="h-9 px-3 shrink-0"
            onClick={handleSubmit}
            disabled={
              (channel !== "email" && !text.trim()) ||
              saveNote.isPending ||
              (channel === "email" && !customerEmail) ||
              (channel === "whatsapp" && !waHref)
            }
          >
            {saveNote.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="px-3 pb-2 text-[10px] text-muted-foreground">
          {channel === "email" && "Enter per aprire compose completo con oggetto pre-compilato."}
          {channel === "note" && "Enter per salvare. Shift+Enter per nuova riga."}
          {(channel === "whatsapp" || channel === "sms") && "Enter per inviare."}
        </p>
      </div>

      {/* Email compose dialog */}
      <EmailComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        context={composeContext}
        companyIdOverride={effectiveCompany?.id}
      />
    </>
  );
}
