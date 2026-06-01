import { useEffect, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Send, User, Loader2, Sparkles } from "lucide-react";
import {
  useTicketRisposte, type TicketRow,
} from "@/hooks/useTicketAzienda";
import { SUPPORT_PRIORITIES } from "@/types/tickets";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const prioritaConfig: Record<
  TicketRow["priorita"],
  { label: string; className: string }
> = {
  urgente: { label: "Urgente", className: "bg-red-100 text-red-700 border-red-200" },
  alta: { label: "Alta", className: "bg-orange-100 text-orange-700 border-orange-200" },
  normale: { label: "Normale", className: "bg-gray-100 text-gray-700 border-gray-200" },
  bassa: { label: "Bassa", className: "bg-green-100 text-green-700 border-green-200" },
};

// FIX schema: enum DB ticket_status ha solo 3 valori
const statoLabels: Record<TicketRow["stato"], string> = {
  aperto: "Aperto",
  in_lavorazione: "In lavorazione",
  risolto: "Risolto",
};

interface TicketDetailDrawerProps {
  ticket: TicketRow | null;
  onClose: () => void;
  onCambiaStato: (ticketId: string, stato: TicketRow["stato"]) => void;
  isChangingState: boolean;
}

const RISPOSTA_MAX = 5000;

export function TicketDetailDrawer({
  ticket, onClose, onCambiaStato, isChangingState,
}: TicketDetailDrawerProps) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [risposta, setRisposta] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiTriaging, setAiTriaging] = useState(false);

  const { risposte, isLoading, aggiungiRisposta } = useTicketRisposte(ticket?.id);

  // Reset state quando il ticket cambia o si chiude.
  useEffect(() => {
    setRisposta("");
  }, [ticket?.id]);

  // Nome autore visualizzato (display only — il sender_id reale viene salvato in DB)
  const autoreNome = (() => {
    if (profile?.first_name || profile?.last_name) {
      return `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
    }
    return user?.email ?? "SuperAdmin";
  })();

  const handleSendRisposta = () => {
    const t = risposta.trim();
    if (!t) return;
    if (t.length > RISPOSTA_MAX) return;
    if (!user?.id) {
      // Difensivo: la mutation richiede sender_id; senza utente loggato
      // non possiamo procedere.
      return;
    }

    aggiungiRisposta.mutate(
      {
        testo: t,
        sender_id: user.id, // FIX schema: ticket_messages.sender_id è UUID NOT NULL
        autore_nome: autoreNome,
      },
      {
        onSuccess: () => {
          setRisposta("");
        },
      },
    );
  };

  // Bozza risposta AI (support-ai-chat) a partire da richiesta + thread.
  const handleAiDraft = async () => {
    if (aiDrafting || !ticket) return;
    setAiDrafting(true);
    try {
      const conversation: { role: string; content: string }[] = [
        {
          role: "user",
          content: [ticket.titolo, ticket.descrizione].filter(Boolean).join("\n\n"),
        },
        ...risposte
          .filter((r) => !r.is_interno)
          .map((r) => ({
            role: r.autore_nome && r.autore_nome === autoreNome ? "assistant" : "user",
            content: r.testo,
          })),
      ];
      const { data, error } = await supabase.functions.invoke("support-ai-chat", {
        body: { action: "chat", conversation },
      });
      if (error) throw error;
      const draft = (data?.reply ?? "").trim();
      if (!draft) {
        toast.error("L'AI non ha prodotto una risposta. Riprova.");
        return;
      }
      setRisposta(draft);
      toast.success("Bozza generata — rivedi prima di inviare.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile generare la bozza.");
    } finally {
      setAiDrafting(false);
    }
  };

  // Triage AI: l'AI analizza richiesta + thread e aggiorna la priorità.
  const handleAiTriage = async () => {
    if (aiTriaging || !ticket) return;
    setAiTriaging(true);
    try {
      const content = [
        ticket.titolo,
        ticket.descrizione,
        ...risposte.filter((r) => !r.is_interno).map((r) => r.testo),
      ]
        .filter(Boolean)
        .join("\n");
      const { data, error } = await supabase.functions.invoke("support-ai-chat", {
        body: { action: "chat", conversation: [{ role: "user", content }] },
      });
      if (error) throw error;
      const sp = String(data?.suggested_priority ?? "");
      if (!(SUPPORT_PRIORITIES as readonly string[]).includes(sp)) {
        toast.info("Analisi AI completata: nessun cambio di priorità suggerito.");
        return;
      }
      if (sp === ticket.priorita) {
        toast.info(`L'AI conferma la priorità attuale (${sp}).`);
        return;
      }
      const { error: upErr } = await supabase
        .from("tickets")
        .update({ priority: sp, priorita: sp })
        .eq("id", ticket.id);
      if (upErr) throw upErr;
      queryClient.invalidateQueries({ queryKey: ["ticket-azienda", ticket.company_id] });
      queryClient.invalidateQueries({ queryKey: ["company-detail", ticket.company_id] });
      toast.success(`Priorità aggiornata dall'AI: ${sp}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Triage AI non riuscito.");
    } finally {
      setAiTriaging(false);
    }
  };

  const rispostaLen = risposta.length;
  const rispostaOver = rispostaLen > RISPOSTA_MAX;

  return (
    <Sheet
      open={!!ticket}
      onOpenChange={(open) => {
        if (!open && aggiungiRisposta.isPending) return; // blocca chiusura durante invio
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-hidden">
        {ticket ? (
          <>
            <SheetHeader className="flex-shrink-0">
              <SheetTitle className="text-base leading-tight pr-4">
                {ticket.titolo}
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <Badge
                  variant="outline"
                  className={`text-xs ${prioritaConfig[ticket.priorita].className}`}
                >
                  {prioritaConfig[ticket.priorita].label}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-violet-600 hover:text-violet-700 dark:text-violet-400"
                  onClick={handleAiTriage}
                  disabled={aiTriaging}
                  title="Triage AI: suggerisci e applica la priorità"
                >
                  {aiTriaging ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                </Button>
                {ticket.categoria && (
                  <Badge variant="secondary" className="text-xs">
                    {ticket.categoria}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {format(new Date(ticket.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                </span>
              </div>
              {/* FIX: assignee + aperto_da visibili (prima erano nascosti) */}
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {ticket.aperto_da_nome && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Aperto da {ticket.aperto_da_nome}
                  </span>
                )}
                {ticket.assegnato_a_nome && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Assegnato a {ticket.assegnato_a_nome}
                  </span>
                )}
                {ticket.risolto_at && (
                  <span className="text-emerald-600">
                    Risolto il{" "}
                    {format(new Date(ticket.risolto_at), "dd/MM/yyyy", { locale: it })}
                  </span>
                )}
              </div>
            </SheetHeader>

            <div className="flex items-center gap-2 mt-3 flex-shrink-0">
              <span className="text-sm text-muted-foreground">Stato:</span>
              <Select
                value={ticket.stato}
                onValueChange={(v) => onCambiaStato(ticket.id, v as TicketRow["stato"])}
                disabled={isChangingState}
              >
                <SelectTrigger className="h-7 text-xs w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(statoLabels) as TicketRow["stato"][]).map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {statoLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isChangingState && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>

            {ticket.descrizione ? (
              <div className="mt-3 flex-shrink-0">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {ticket.descrizione}
                </p>
              </div>
            ) : (
              <div className="mt-3 flex-shrink-0">
                <p className="text-sm text-muted-foreground italic">
                  Nessuna descrizione fornita
                </p>
              </div>
            )}

            <Separator className="my-3 flex-shrink-0" />

            {/* Thread risposte */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-12 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : risposte.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nessuna risposta ancora
                </p>
              ) : (
                risposte.map((r) => (
                  <div key={r.id} className="rounded-lg p-3 text-sm bg-muted">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-xs">
                        {r.autore_nome ?? "SuperAdmin"}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(r.created_at), "dd/MM HH:mm", { locale: it })}
                      </span>
                    </div>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {r.testo}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Input risposta — toggle "Nota interna" rimosso: il DB
                ticket_messages non supporta is_interno. Per note interne usare
                il campo `tickets.internal_notes` (out of scope qui). */}
            <div className="mt-3 space-y-2 flex-shrink-0 border-t pt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Risposta visibile all'azienda</span>
                <span>
                  Firmato come <strong>{autoreNome}</strong>
                </span>
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={risposta}
                  onChange={(e) => setRisposta(e.target.value)}
                  placeholder="Scrivi una risposta..."
                  rows={3}
                  className={cn(
                    "resize-none text-sm",
                    rispostaOver && "border-destructive",
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      handleSendRisposta();
                    }
                  }}
                />
                <div className="flex flex-col gap-2 self-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-violet-600 hover:text-violet-700 dark:text-violet-400"
                    onClick={handleAiDraft}
                    disabled={aiDrafting || aggiungiRisposta.isPending}
                    title="Genera bozza risposta con AI"
                  >
                    {aiDrafting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSendRisposta}
                    disabled={
                      !risposta.trim() ||
                      rispostaOver ||
                      aggiungiRisposta.isPending
                    }
                  >
                    {aggiungiRisposta.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px]">
                    ⌘/Ctrl + Enter
                  </kbd>{" "}
                  per inviare
                </span>
                <span
                  className={
                    rispostaOver ? "text-destructive font-bold" : ""
                  }
                >
                  {rispostaLen}/{RISPOSTA_MAX}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
