import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  MessageSquare, Search, Clock, User, Bot, Loader2, ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatSession {
  id: string;
  agent_id: string;
  canale: string;
  stato: string;
  iniziata_il: string;
  terminata_il: string | null;
  messaggi_totali: number;
  durata_secondi: number;
  agent_nome?: string;
}

interface ChatMessage {
  id: string;
  ruolo: string;
  contenuto: string;
  creato_il: string;
}

export function ChatConversazioniTab() {
  const companyId = useEffectiveCompanyId();
  const [cerca, setCerca] = useState("");
  const [filtroStato, setFiltroStato] = useState("tutti");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  // Fetch sessions with agent name
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["chat-sessions", companyId, filtroStato, cerca],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("ai_chat_sessions")
        .select("*, ai_agents_v2!inner(nome)")
        .eq("company_id", companyId!)
        .order("iniziata_il", { ascending: false });

      if (filtroStato !== "tutti") q = q.eq("stato", filtroStato);

      const { data, error } = await q.limit(100);
      if (error) throw error;
      return (data || []).map((s: Record<string, unknown>) => ({
        ...s,
        agent_nome: (s.ai_agents_v2 as Record<string, string>)?.nome,
      })) as ChatSession[];
    },
  });

  // Fetch messages for selected session
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ["chat-messages", selectedSession],
    enabled: !!selectedSession,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .select("*")
        .eq("session_id", selectedSession!)
        .order("creato_il", { ascending: true });
      if (error) throw error;
      return (data || []) as ChatMessage[];
    },
  });

  // Client-side search filter
  const filteredSessions = useMemo(() => {
    if (!cerca.trim()) return sessions;
    const term = cerca.toLowerCase();
    return sessions.filter(s =>
      (s.agent_nome?.toLowerCase().includes(term)) ||
      s.canale.toLowerCase().includes(term) ||
      s.stato.toLowerCase().includes(term)
    );
  }, [sessions, cerca]);

  const selectedSessionData = sessions.find(s => s.id === selectedSession);

  if (selectedSession && selectedSessionData) {
    return (
      <div className="space-y-4">
        {/* Back + header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedSession(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Indietro
          </Button>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              Chat con {selectedSessionData.agent_nome || "Agente"}
            </h3>
            <p className="text-[10px] text-muted-foreground max-md:text-[11px]">
              {format(new Date(selectedSessionData.iniziata_il), "d MMM yyyy HH:mm", { locale: it })}
              {" · "}{selectedSessionData.messaggi_totali} messaggi
            </p>
          </div>
          <Badge variant={selectedSessionData.stato === "attiva" ? "default" : "secondary"}>
            {selectedSessionData.stato}
          </Badge>
        </div>

        {/* Messages */}
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="p-4 space-y-3">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nessun messaggio in questa sessione.
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.ruolo === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                          msg.ruolo === "user"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : msg.ruolo === "system"
                            ? "bg-muted text-muted-foreground text-xs italic"
                            : "bg-card border border-border rounded-bl-md"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {msg.ruolo === "assistant" && <Bot className="h-3 w-3 text-primary" />}
                          {msg.ruolo === "user" && <User className="h-3 w-3" />}
                          <span className="text-[9px] opacity-70 max-md:text-[11px]">
                            {format(new Date(msg.creato_il), "HH:mm")}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.contenuto}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    // Telefono: ricerca e stato sulla stessa riga, stato vuoto in una riga.
    <div className="space-y-4 max-md:space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap max-md:flex-nowrap max-md:gap-2">
        <div className="relative flex-1 max-w-xs max-md:min-w-0 max-md:max-w-none">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca sessione..."
            className="pl-8 h-8 text-sm max-md:h-9"
          />
        </div>
        <Select value={filtroStato} onValueChange={setFiltroStato}>
          <SelectTrigger className="w-36 h-8 text-sm max-md:h-9 max-md:w-28 max-md:shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti</SelectItem>
            <SelectItem value="attiva">Attive</SelectItem>
            <SelectItem value="chiusa">Chiuse</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center max-md:py-4">
          <MessageSquare className="h-10 w-10 text-muted-foreground mb-3 max-md:hidden" />
          <p className="font-semibold max-md:text-[13px]">Nessuna sessione chat</p>
          <p className="text-sm text-muted-foreground mt-1 max-md:hidden">
            Le sessioni appariranno quando gli utenti interagiranno con i tuoi agenti chat.
          </p>
          {/* Audit AI 2026-06: stesso discorso delle conversazioni vocali —
              il salvataggio sessioni dal widget/provider non è ancora cablato. */}
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 max-md:mt-1.5 max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:text-[11px]">
            Il salvataggio automatico delle sessioni chat non è ancora attivo.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((s) => (
            <Card
              key={s.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => setSelectedSession(s.id)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {s.agent_nome || "Agente"}
                    </p>
                    <Badge variant={s.stato === "attiva" ? "default" : "secondary"} className="text-[9px] max-md:text-[11px]">
                      {s.stato}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] max-md:text-[11px]">{s.canale}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 max-md:text-[11px]">
                      <MessageSquare className="h-2.5 w-2.5" /> {s.messaggi_totali} msg
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 max-md:text-[11px]">
                      <Clock className="h-2.5 w-2.5" /> {Math.round(s.durata_secondi / 60)}m
                    </span>
                    <span className="text-[10px] text-muted-foreground max-md:text-[11px]">
                      {format(new Date(s.iniziata_il), "d MMM HH:mm", { locale: it })}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
