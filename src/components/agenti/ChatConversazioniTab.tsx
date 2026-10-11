import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentChatHistoryRequest } from "@/lib/agentChatHistory";
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
  source: "agente" | "sito";
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
  const [source, setSource] = useState("tutti");
  const [page, setPage] = useState(0);
  const [messagePage, setMessagePage] = useState(0);
  const [search, setSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => { setSearch(cerca.trim()); setPage(0); }, 300); return () => clearTimeout(timer); }, [cerca]);
  useEffect(() => { setSelectedSession(null); setPage(0); setMessagePage(0); }, [companyId, filtroStato, source]);
  const showDate = (value: string, pattern: string) => Number.isFinite(new Date(value).getTime())
    ? format(new Date(value), pattern, { locale: it }) : "Data non disponibile";

  // Fetch sessions with agent name
  const { data: sessionResult, isLoading, isError, error: sessionError, refetch } = useQuery({
    queryKey: ["chat-sessions", companyId, filtroStato, source, page, search],
    enabled: !!companyId,
    queryFn: async () => {
      return agentChatHistoryRequest<{ sessions: ChatSession[]; has_more: boolean }>(companyId!, "chat_sessions",
        { page, source, status: filtroStato, search });
    },
    refetchInterval: 60_000, retry: false,
  });
  const sessions = sessionResult?.sessions || [];
  const selectedSessionData = sessions.find(s => s.source + ":" + s.id === selectedSession);

  // Fetch messages for selected session
  const { data: messageResult, isLoading: loadingMessages, isError: messagesError, refetch: retryMessages } = useQuery({
    queryKey: ["chat-messages", companyId, selectedSession, messagePage],
    enabled: !!companyId && !!selectedSessionData,
    queryFn: async () => {
      return agentChatHistoryRequest<{ messages: ChatMessage[]; has_more: boolean }>(companyId!, "chat_messages",
        { session_id: selectedSessionData!.id, source: selectedSessionData!.source, page: messagePage });
    },
    retry: false,
  });
  const messages = messageResult?.messages || [];

  // Client-side search filter
  const filteredSessions = useMemo(() => {
    if (!cerca.trim()) return sessions;
    const term = cerca.trim().toLowerCase();
    return sessions.filter(s =>
      (s.agent_nome?.toLowerCase().includes(term)) ||
      s.canale.toLowerCase().includes(term) ||
      s.stato.toLowerCase().includes(term)
    );
  }, [sessions, cerca]);

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
              {showDate(selectedSessionData.iniziata_il, "d MMM yyyy HH:mm")}
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
                ) : messagesError ? (
                  <div role="alert" className="py-8 text-center"><p>Impossibile caricare i messaggi.</p>
                    <Button variant="outline" className="mt-2" onClick={() => retryMessages()}>Riprova</Button></div>
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
                            {showDate(msg.creato_il, "HH:mm")}
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
        {(messagePage > 0 || messageResult?.has_more) && <div className="flex items-center justify-between">
          <Button variant="outline" disabled={messagePage === 0 || loadingMessages} onClick={() => setMessagePage(p => p - 1)}>Messaggi precedenti</Button>
          <span className="text-sm">Pagina {messagePage + 1}</span>
          <Button variant="outline" disabled={!messageResult?.has_more || loadingMessages} onClick={() => setMessagePage(p => p + 1)}>Messaggi successivi</Button>
        </div>}
      </div>
    );
  }

  return (
    // Telefono: ricerca e stato sulla stessa riga, stato vuoto in una riga.
    <div className="space-y-4 max-md:space-y-3">
      <p className="text-sm text-muted-foreground" role="status">
        Conversazioni degli agenti e del widget del sito, distinte per canale. La ricerca comprende tutto lo storico.
      </p>
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
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="tutti">Tutti i canali</SelectItem><SelectItem value="agente">Agenti AI</SelectItem><SelectItem value="sito">Widget sito</SelectItem></SelectContent>
        </Select>
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border p-4"><p>{sessionError instanceof Error ? sessionError.message : "Impossibile caricare le sessioni chat."}</p>
          <Button variant="outline" className="mt-2" onClick={() => refetch()}>Riprova</Button></div>
      ) : filteredSessions.length === 0 && sessions.length > 0 ? (
        <div className="py-8 text-center"><p>Nessuna sessione corrisponde alla ricerca.</p>
          <Button variant="outline" className="mt-2" onClick={() => setCerca("")}>Azzera ricerca</Button></div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center max-md:py-4">
          <MessageSquare className="h-10 w-10 text-muted-foreground mb-3 max-md:hidden" />
          <p className="font-semibold max-md:text-[13px]">Nessuna sessione chat</p>
          <p className="text-sm text-muted-foreground mt-1 max-md:hidden">
            Nessuna sessione registrata per gli agenti AI e i filtri selezionati.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((s) => (
            <Card
              key={s.source + ":" + s.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => { setSelectedSession(s.source + ":" + s.id); setMessagePage(0); }}
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
                      {showDate(s.iniziata_il, "d MMM HH:mm")}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {(page > 0 || sessionResult?.has_more) && <div className="flex items-center justify-between">
        <Button variant="outline" disabled={page === 0 || isLoading} onClick={() => setPage(p => p - 1)}>Precedenti</Button>
        <span className="text-sm">Pagina {page + 1}</span>
        <Button variant="outline" disabled={!sessionResult?.has_more || isLoading} onClick={() => setPage(p => p + 1)}>Successive</Button>
      </div>}
    </div>
  );
}
