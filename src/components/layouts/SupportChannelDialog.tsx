/**
 * SupportChannelDialog — Hub di assistenza per l'azienda.
 *
 * v2 (2026-05-10): aggiunto AI Assistant come canale primario.
 *
 * Flow:
 *   "channels" (default) — 4 canali: Silvio AI (hero) + Chat team + Email + Richiamata
 *   "ai_chat"            — chat conversazionale con Silvio Assistente Supporto
 *   "escalate_form"      — form per aprire ticket formale (con conversazione AI allegata)
 *   "callback"           — form richiesta richiamata (legacy invariato)
 *   "ticket_success"     — conferma ticket aperto + CTA per aprire chat supporto
 *
 * Architettura AI:
 *   POST /functions/v1/support-ai-chat
 *     action="chat"     → AI risponde + suggest_escalation flag
 *     action="escalate" → crea support_message formattato come "🎫 Ticket #ABCD"
 *
 * Il SuperAdmin riceve il ticket nella sua chat support esistente con tutto il
 * contesto della conversazione AI (nessuna UI cambio dal lato platform).
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  MessageSquare,
  Mail,
  PhoneCall,
  Sparkles,
  ArrowLeft,
  Send,
  CheckCircle2,
  Loader2,
  Ticket,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SupportChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Apre la chat con il team di supporto (SupportChatSheet) */
  onOpenChat: () => void;
}

type DialogMode = "channels" | "ai_chat" | "escalate_form" | "callback" | "ticket_success";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

type Priority = "bassa" | "normale" | "alta" | "urgente";

const PRIORITY_LABELS: Record<Priority, { label: string; emoji: string; description: string }> = {
  bassa: { label: "Bassa", emoji: "🟢", description: "Domanda generale, nessuna urgenza" },
  normale: { label: "Normale", emoji: "🟡", description: "Risposta entro 24h" },
  alta: { label: "Alta", emoji: "🟠", description: "Mi blocca alcune attività" },
  urgente: { label: "Urgente", emoji: "🔴", description: "Sistema bloccato, perdita dati" },
};

export function SupportChannelDialog({ open, onOpenChange, onOpenChat }: SupportChannelDialogProps) {
  const { user, effectiveCompany } = useAuth();
  const [mode, setMode] = useState<DialogMode>("channels");

  // AI chat state
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showEscalateButton, setShowEscalateButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Escalate form state
  const [ticketTitolo, setTicketTitolo] = useState("");
  const [ticketDescrizione, setTicketDescrizione] = useState("");
  const [ticketPriorita, setTicketPriorita] = useState<Priority>("normale");
  const [escalating, setEscalating] = useState(false);
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);

  // Callback form state (legacy)
  const [phone, setPhone] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [callbackSending, setCallbackSending] = useState(false);

  // Auto-scroll AI chat
  useEffect(() => {
    if (mode === "ai_chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, mode]);

  // Reset state when dialog closes
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setMode("channels");
      setMessages([]);
      setAiInput("");
      setAiLoading(false);
      setShowEscalateButton(false);
      setTicketTitolo("");
      setTicketDescrizione("");
      setTicketPriorita("normale");
      setEscalating(false);
      setCreatedTicketId(null);
      setPhone("");
      setPreferredTime("");
      setCallbackSending(false);
    }
    onOpenChange(v);
  };

  // ─── AI CHAT ──────────────────────────────────────────────────────────────
  const sendAiMessage = async () => {
    const trimmed = aiInput.trim();
    if (!trimmed || aiLoading) return;

    const newUserMsg: AiMessage = { role: "user", content: trimmed };
    const newConversation = [...messages, newUserMsg];
    setMessages(newConversation);
    setAiInput("");
    setAiLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("support-ai-chat", {
        body: { action: "chat", conversation: newConversation },
      });

      if (error) throw error;

      const aiReply: AiMessage = {
        role: "assistant",
        content: data?.reply ?? "Mi dispiace, non sono riuscito a rispondere. Riprova o apri un ticket diretto.",
      };
      setMessages((prev) => [...prev, aiReply]);

      // Pre-fill ticket form se l'AI suggerisce escalation
      if (data?.suggest_escalation) {
        setShowEscalateButton(true);
        if (data.suggested_title && !ticketTitolo) setTicketTitolo(data.suggested_title);
        if (data.suggested_priority) setTicketPriorita(data.suggested_priority);
      }
      // Mostra sempre il bottone escalation dopo 2+ scambi anche senza suggerimento esplicito
      if (newConversation.length >= 4) setShowEscalateButton(true);
    } catch (err) {
      console.error("[SupportChannelDialog] AI chat error:", err);
      const errorMsg: AiMessage = {
        role: "assistant",
        content:
          "Mi dispiace, ho un problema tecnico. Vuoi aprire un ticket diretto al supporto? Risposta entro 24h.",
      };
      setMessages((prev) => [...prev, errorMsg]);
      setShowEscalateButton(true);
    } finally {
      setAiLoading(false);
    }
  };

  const startAiChat = () => {
    setMode("ai_chat");
    // Welcome message dell'AI
    setMessages([
      {
        role: "assistant",
        content:
          "Ciao 👋 Sono **Silvio Assistente Supporto**. Dimmi che problema stai avendo o cosa vuoi capire — proverò a risolvere subito. Se non basta, apriamo insieme un ticket al team.",
      },
    ]);
  };

  // ─── ESCALATE TICKET ──────────────────────────────────────────────────────
  const goToEscalateForm = () => {
    // Pre-fill descrizione con ultimo messaggio utente se titolo c'è già
    if (!ticketDescrizione) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      setTicketDescrizione(lastUserMsg);
    }
    if (!ticketTitolo) {
      const firstUserMsg = messages.find((m) => m.role === "user")?.content ?? "";
      setTicketTitolo(firstUserMsg.length > 80 ? firstUserMsg.slice(0, 77) + "..." : (firstUserMsg || "Richiesta supporto"));
    }
    setMode("escalate_form");
  };

  const submitEscalation = async () => {
    if (!ticketTitolo.trim() || !ticketDescrizione.trim()) {
      toast.error("Titolo e descrizione sono obbligatori");
      return;
    }
    setEscalating(true);
    try {
      const { data, error } = await supabase.functions.invoke("support-ai-chat", {
        body: {
          action: "escalate",
          conversation: messages,
          titolo: ticketTitolo.trim(),
          descrizione: ticketDescrizione.trim(),
          priorita: ticketPriorita,
        },
      });
      if (error) throw error;
      setCreatedTicketId(data?.ticket_id ?? null);
      setMode("ticket_success");
      toast.success(`Ticket #${data?.ticket_id ?? ""} aperto al supporto`);
    } catch (err) {
      console.error("[SupportChannelDialog] escalate error:", err);
      toast.error("Errore nell'apertura del ticket. Riprova o usa la chat diretta.");
    } finally {
      setEscalating(false);
    }
  };

  // ─── CALLBACK (legacy invariato) ──────────────────────────────────────────
  const handleEmail = () => {
    const subject = encodeURIComponent(`Richiesta assistenza - ${effectiveCompany?.name || ""}`);
    window.open(`mailto:supporto@ediliziacloud.it?subject=${subject}`, "_blank");
    handleOpenChange(false);
  };

  const handleCallback = async () => {
    if (!phone.trim() || !user || !effectiveCompany) return;
    setCallbackSending(true);
    const message = `[RICHIAMATA] Telefono: ${phone.trim()}${preferredTime ? ` | Orario preferito: ${preferredTime}` : ""}`;
    await supabase.from("support_messages").insert({
      company_id: effectiveCompany.id,
      sender_id: user.id,
      sender_role: "company",
      message,
    });
    toast.success("Richiesta di richiamata inviata!");
    setCallbackSending(false);
    handleOpenChange(false);
  };

  const handleChatTeam = () => {
    handleOpenChange(false);
    onOpenChat();
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-md",
          mode === "ai_chat" && "sm:max-w-lg",
          mode === "escalate_form" && "sm:max-w-lg",
        )}
      >
        {/* ─── MODE: channels ──────────────────────────────────────────── */}
        {mode === "channels" && (
          <>
            <DialogHeader>
              <DialogTitle>Come possiamo aiutarti?</DialogTitle>
              <DialogDescription>
                Risolvi subito con Silvio AI o scegli un altro canale di supporto
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* HERO: Silvio AI Assistant — featured */}
              <button
                type="button"
                onClick={startAiChat}
                className="w-full text-left rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 hover:border-primary hover:shadow-md transition-all relative overflow-hidden group"
              >
                <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground text-[10px]">
                  CONSIGLIATO
                </Badge>
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-primary/15 group-hover:bg-primary/25 transition-colors">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-base">Silvio Assistente AI</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Risolvi subito il tuo problema. Se non basta, apriamo insieme un ticket al supporto.
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-primary font-medium">
                      <span>Chatta ora</span>
                      <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Altri canali — più piccoli, in colonna */}
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium pt-2 px-1">
                Oppure contattaci direttamente
              </p>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={handleChatTeam}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">Chat con il team</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Parla in tempo reale con un operatore umano
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleEmail}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">Email</p>
                    <p className="text-xs text-muted-foreground truncate">supporto@ediliziacloud.it</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("callback")}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <PhoneCall className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">Richiamata</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Ti chiamiamo noi all'orario che preferisci
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── MODE: ai_chat ──────────────────────────────────────────── */}
        {mode === "ai_chat" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setMode("channels")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Silvio Assistente AI
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Domanda libera. Se serve, escaliamo al team.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex flex-col h-[400px]">
              <ScrollArea className="flex-1 pr-3 -mx-1 px-1">
                <div className="space-y-3 py-2">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-2",
                        m.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      {m.role === "assistant" && (
                        <div className="shrink-0 h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap",
                          m.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted rounded-bl-sm",
                        )}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex gap-2">
                      <div className="shrink-0 h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                      </div>
                      <div className="rounded-2xl rounded-bl-sm px-3 py-2 bg-muted">
                        <div className="flex gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.15s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.3s]" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="space-y-2 pt-3 border-t mt-2">
                {showEscalateButton && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    onClick={goToEscalateForm}
                  >
                    <Ticket className="h-3.5 w-3.5" />
                    Apri ticket al supporto
                  </Button>
                )}
                <div className="flex gap-2">
                  <Input
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendAiMessage();
                      }
                    }}
                    placeholder="Scrivi a Silvio..."
                    disabled={aiLoading}
                  />
                  <Button
                    onClick={sendAiMessage}
                    disabled={!aiInput.trim() || aiLoading}
                    size="icon"
                    className="shrink-0"
                  >
                    {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ─── MODE: escalate_form ────────────────────────────────────── */}
        {mode === "escalate_form" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setMode("ai_chat")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <Ticket className="h-4 w-4 text-amber-600" />
                    Apri ticket al supporto
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Il team risponde entro 24h. Verrà inclusa la conversazione con Silvio.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ticket-titolo" className="text-sm font-medium">
                  Titolo *
                </Label>
                <Input
                  id="ticket-titolo"
                  value={ticketTitolo}
                  onChange={(e) => setTicketTitolo(e.target.value)}
                  placeholder="es. Errore caricamento fattura SDI"
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Priorità</Label>
                <RadioGroup value={ticketPriorita} onValueChange={(v) => setTicketPriorita(v as Priority)}>
                  <div className="grid gap-1.5">
                    {(Object.entries(PRIORITY_LABELS) as Array<[Priority, typeof PRIORITY_LABELS[Priority]]>).map(
                      ([key, info]) => (
                        <label
                          key={key}
                          htmlFor={`prio-${key}`}
                          className={cn(
                            "flex items-center gap-3 rounded-md border p-2.5 cursor-pointer hover:bg-accent/50 transition-colors",
                            ticketPriorita === key && "border-primary bg-primary/5",
                          )}
                        >
                          <RadioGroupItem id={`prio-${key}`} value={key} />
                          <span className="text-base">{info.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{info.label}</p>
                            <p className="text-xs text-muted-foreground">{info.description}</p>
                          </div>
                        </label>
                      ),
                    )}
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticket-descr" className="text-sm font-medium">
                  Descrizione *
                </Label>
                <Textarea
                  id="ticket-descr"
                  value={ticketDescrizione}
                  onChange={(e) => setTicketDescrizione(e.target.value)}
                  placeholder="Spiega il problema con dettagli (modulo, schermata, errore visto...)"
                  rows={4}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground">
                  {ticketDescrizione.length}/2000 caratteri
                </p>
              </div>

              {messages.length > 0 && (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground border">
                  <p className="font-medium text-foreground flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Conversazione AI inclusa
                  </p>
                  Includeremo automaticamente la chat con Silvio ({messages.length} messaggi) per dare contesto al team.
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setMode("ai_chat")} disabled={escalating}>
                  Torna alla chat
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={submitEscalation}
                  disabled={escalating || !ticketTitolo.trim() || !ticketDescrizione.trim()}
                >
                  {escalating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Apertura...
                    </>
                  ) : (
                    <>
                      <Ticket className="h-4 w-4" />
                      Apri ticket
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ─── MODE: callback (legacy) ────────────────────────────────── */}
        {mode === "callback" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setMode("channels")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle className="text-base">Richiedi richiamata</DialogTitle>
                  <DialogDescription className="text-xs">
                    Ti contattiamo noi all'orario indicato
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Numero di telefono *</Label>
                <Input
                  placeholder="+39 333 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Orario preferito</Label>
                <Input
                  placeholder="es. 10:00 - 12:00"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setMode("channels")}>
                  Indietro
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCallback}
                  disabled={!phone.trim() || callbackSending}
                >
                  {callbackSending ? "Invio..." : "Invia richiesta"}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ─── MODE: ticket_success ───────────────────────────────────── */}
        {mode === "ticket_success" && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Ticket aperto</DialogTitle>
              <DialogDescription className="sr-only">Conferma apertura ticket al supporto</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center text-center py-4 space-y-4">
              <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-semibold">Ticket aperto!</p>
                {createdTicketId && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Numero: <span className="font-mono font-medium">#{createdTicketId}</span>
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground border w-full">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-left">
                    Il team del supporto ha ricevuto il ticket con tutta la conversazione di contesto.
                    Risponderà direttamente nella <strong>chat di supporto</strong> entro 24h.
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full pt-2">
                <Button variant="outline" className="flex-1" onClick={() => handleOpenChange(false)}>
                  Chiudi
                </Button>
                <Button className="flex-1 gap-2" onClick={handleChatTeam}>
                  <MessageSquare className="h-4 w-4" />
                  Apri chat supporto
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
