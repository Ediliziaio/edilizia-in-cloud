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
import { Send, Lock, User, Loader2 } from "lucide-react";
import {
  useTicketRisposte, type TicketRow,
} from "@/hooks/useTicketAzienda";
import { useAuth } from "@/contexts/AuthContext";
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

const statoLabels: Record<TicketRow["stato"], string> = {
  aperto: "Aperto",
  in_lavorazione: "In lavorazione",
  in_attesa: "In attesa",
  risolto: "Risolto",
  chiuso: "Chiuso",
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
  const [risposta, setRisposta] = useState("");
  const [isInterno, setIsInterno] = useState(false);

  const { risposte, isLoading, aggiungiRisposta } = useTicketRisposte(ticket?.id);

  // FIX critico: reset state quando il ticket cambia o si chiude.
  // Prima `risposta` e `isInterno` persistevano tra ticket diversi:
  //  - User apre ticket A, scrive metà risposta, chiude
  //  - Riapre ticket B → vede ancora il testo per A
  //  - Peggio: imposta "Nota interna" su A, invia, NON resetta isInterno,
  //    apre B → ancora in modalità interno → leak risposta interna al cliente.
  useEffect(() => {
    setRisposta("");
    setIsInterno(false);
  }, [ticket?.id]);

  // FIX: nome autore reale invece di "SuperAdmin" hardcoded → audit trail corretto
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

    aggiungiRisposta.mutate(
      { testo: t, autore_nome: autoreNome, is_interno: isInterno },
      {
        onSuccess: () => {
          setRisposta("");
          // FIX: reset isInterno DOPO l'invio. Senza, la prossima risposta
          // sarebbe ancora "interna" senza che l'admin se ne accorga →
          // potenziale leak di nota destinata al team al cliente.
          setIsInterno(false);
        },
      },
    );
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
                  <div
                    key={r.id}
                    className={`rounded-lg p-3 text-sm ${
                      r.is_interno
                        ? "bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-900"
                        : "bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-xs">
                        {r.autore_nome ?? "SuperAdmin"}
                      </span>
                      {r.is_interno && (
                        <div className="flex items-center gap-0.5 text-yellow-700 dark:text-yellow-400 text-xs">
                          <Lock className="h-3 w-3" /> Interno
                        </div>
                      )}
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

            {/* Input risposta */}
            <div className="mt-3 space-y-2 flex-shrink-0 border-t pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded transition-colors",
                    !isInterno
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                  onClick={() => setIsInterno(false)}
                  type="button"
                  disabled={aggiungiRisposta.isPending}
                >
                  Risposta
                </button>
                <button
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded transition-colors",
                    isInterno
                      ? "bg-yellow-500 text-white"
                      : "hover:bg-muted",
                  )}
                  onClick={() => setIsInterno(true)}
                  type="button"
                  disabled={aggiungiRisposta.isPending}
                >
                  <Lock className="h-3 w-3" /> Nota interna
                </button>
                <span className="ml-auto">
                  Firmato come <strong>{autoreNome}</strong>
                </span>
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={risposta}
                  onChange={(e) => setRisposta(e.target.value)}
                  placeholder={
                    isInterno
                      ? "Nota interna (non visibile all'azienda)..."
                      : "Scrivi una risposta..."
                  }
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
                <Button
                  size="sm"
                  className="self-end"
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
