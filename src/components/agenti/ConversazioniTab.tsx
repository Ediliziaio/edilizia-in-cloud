import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import { useUnifiedAgents } from "@/hooks/useUnifiedAgents";
import {
  MessageSquare,
  Loader2,
  Play,
  Pause,
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  ChevronLeft,
  Bot,
  User,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface ConversationV2 {
  id: string;
  agent_id: string;
  company_id: string;
  elevenlabs_conversation_id: string | null;
  contact_id: string | null;
  stato: string;
  canale: string;
  direzione: string | null;
  durata_secondi: number | null;
  riassunto: string | null;
  trascrizione_json: { role?: string; message?: string; time?: number }[] | null;
  numero_chiamante: string | null;
  numero_chiamato: string | null;
  sentiment: string | null;
  costo_crediti: number | null;
  creato_il: string;
  iniziata_il: string | null;
  terminata_il: string | null;
  audio_url: string | null;
}

interface ConversazioniTabProps {
  agentIdFilter?: string;
}

export function ConversazioniTab({ agentIdFilter }: ConversazioniTabProps = {}) {
  const companyId = useEffectiveCompanyId();
  const [agentFilter, setAgentFilter] = useState(agentIdFilter || "tutti");

  // Sync agentIdFilter prop changes
  useEffect(() => {
    setAgentFilter(agentIdFilter || "tutti");
  }, [agentIdFilter]);
  const [selectedConv, setSelectedConv] = useState<ConversationV2 | null>(null);

  const { data: agents = [] } = useUnifiedAgents();

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["ai-conversations-v2", companyId, agentFilter],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("ai_conversations_v2" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false })
        .limit(100);

      if (agentFilter !== "tutti") {
        q = q.eq("agent_id", agentFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ConversationV2[];
    },
  });

  if (selectedConv) {
    return (
      <ConversazioneDetail
        conv={selectedConv}
        agentName={agents.find((a) => a.id === selectedConv.agent_id)?.nome || "Agente"}
        onBack={() => setSelectedConv(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Conversazioni
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Storico completo delle conversazioni degli agenti AI.
          </p>
        </div>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-52 h-8 text-sm">
            <SelectValue placeholder="Filtra per agente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli agenti</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <MessageSquare className="h-7 w-7 text-primary" />
          </div>
          <p className="text-foreground font-medium">Nessuna conversazione</p>
          <p className="text-sm text-muted-foreground mt-1">
            Le conversazioni appariranno qui dopo che gli agenti gestiscono le prime chiamate o chat.
          </p>
          {/* Audit AI 2026-06: senza il webhook eventi del provider vocale i
              dati non arrivano MAI — dirlo evita di scambiare il vuoto per
              "nessuna attività". */}
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            La raccolta automatica delle conversazioni (webhook eventi provider) non è ancora attiva.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => {
            const agente = agents.find((a) => a.id === conv.agent_id);
            const dur = conv.durata_secondi || 0;
            const mins = Math.floor(dur / 60);
            const secs = dur % 60;

            return (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv)}
                className="w-full text-left p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      {conv.direzione === "outbound" ? (
                        <PhoneOutgoing className="h-4 w-4 text-primary" />
                      ) : (
                        <PhoneIncoming className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {agente?.nome || "Agente sconosciuto"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {conv.numero_chiamante || conv.elevenlabs_conversation_id?.slice(0, 12) || conv.id.slice(0, 8)}
                        {conv.numero_chiamato && ` → ${conv.numero_chiamato}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {mins}:{secs.toString().padStart(2, "0")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(conv.creato_il), "dd MMM HH:mm", { locale: it })}
                      </p>
                    </div>
                    <Badge
                      variant={conv.stato === "completata" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {conv.stato}
                    </Badge>
                    {conv.sentiment && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          conv.sentiment === "positivo"
                            ? "border-green-300 text-green-600"
                            : conv.sentiment === "negativo"
                              ? "border-red-300 text-red-600"
                              : ""
                        }`}
                      >
                        {conv.sentiment}
                      </Badge>
                    )}
                  </div>
                </div>
                {conv.riassunto && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{conv.riassunto}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Detail view with audio player + transcription ───
function ConversazioneDetail({
  conv,
  agentName,
  onBack,
}: {
  conv: ConversationV2;
  agentName: string;
  onBack: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioSrc, setAudioSrc] = useState<string | null>(conv.audio_url);
  const [loadingAudio, setLoadingAudio] = useState(false);

  const transcript = (conv.trascrizione_json || []) as { role?: string; message?: string; time?: number }[];
  const dur = conv.durata_secondi || 0;

  // Cleanup blob URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioSrc && audioSrc.startsWith("blob:")) {
        URL.revokeObjectURL(audioSrc);
      }
    };
  }, [audioSrc]);

  const fetchAudio = useCallback(async () => {
    if (audioSrc || !conv.elevenlabs_conversation_id) return;
    setLoadingAudio(true);
    try {
      const result = await callElevenLabsProxy<{ audio_base64: string; content_type: string }>({
        action: "get_conversation_audio",
        payload: { conversation_id: conv.elevenlabs_conversation_id },
      });
      if (result?.audio_base64) {
        setAudioSrc(`data:${result.content_type};base64,${result.audio_base64}`);
      }
    } catch (e: any) {
      toast.error("Impossibile caricare l'audio");
    } finally {
      setLoadingAudio(false);
    }
  }, [conv.elevenlabs_conversation_id, audioSrc]);

  const togglePlay = async () => {
    if (!audioSrc) {
      await fetchAudio();
    }
    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      if (!playing) {
        audioRef.current.play();
        setPlaying(true);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">{agentName}</h2>
          <p className="text-xs text-muted-foreground">
            {format(new Date(conv.creato_il), "dd MMMM yyyy, HH:mm", { locale: it })}
            {" · "}
            {Math.floor(dur / 60)}:{(dur % 60).toString().padStart(2, "0")} min
            {conv.direzione && ` · ${conv.direzione === "inbound" ? "In entrata" : "In uscita"}`}
          </p>
        </div>
        <Badge variant={conv.stato === "completata" ? "default" : "secondary"}>{conv.stato}</Badge>
      </div>

      {/* Audio Player */}
      {(conv.elevenlabs_conversation_id || audioSrc) && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={togglePlay}
                disabled={loadingAudio}
              >
                {loadingAudio ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" />
                )}
              </Button>
              <div className="flex-1">
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{ width: dur > 0 ? `${(currentTime / dur) * 100}%` : "0%" }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, "0")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {Math.floor(dur / 60)}:{(dur % 60).toString().padStart(2, "0")}
                  </span>
                </div>
              </div>
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            </div>
            {audioSrc && (
              <audio
                ref={audioRef}
                src={audioSrc}
                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                onEnded={() => setPlaying(false)}
                className="hidden"
              />
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transcription */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Trascrizione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[500px] overflow-y-auto">
            {transcript.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nessuna trascrizione disponibile
              </p>
            ) : (
              transcript.map((msg, i) => {
                const isAgent = msg.role === "agent";
                return (
                  <button
                    key={i}
                    onClick={() => msg.time != null && seekTo(msg.time)}
                    className={`flex gap-2.5 w-full text-left rounded-lg p-2.5 transition-colors hover:bg-accent/50 ${
                      msg.time != null && currentTime >= msg.time && (transcript[i + 1]?.time == null || currentTime < (transcript[i + 1]?.time ?? Infinity))
                        ? "bg-primary/5 border border-primary/20"
                        : ""
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isAgent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isAgent ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {isAgent ? "Agente" : "Utente"}
                        </span>
                        {msg.time != null && (
                          <span className="text-[10px] text-muted-foreground">
                            {Math.floor(msg.time / 60)}:{Math.floor(msg.time % 60).toString().padStart(2, "0")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{msg.message}</p>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Info panel */}
        <div className="space-y-4">
          {conv.riassunto && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Riassunto</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{conv.riassunto}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dettagli</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {conv.numero_chiamante && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chiamante</span>
                  <span className="font-mono text-foreground">{conv.numero_chiamante}</span>
                </div>
              )}
              {conv.numero_chiamato && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chiamato</span>
                  <span className="font-mono text-foreground">{conv.numero_chiamato}</span>
                </div>
              )}
              {conv.costo_crediti != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Costo</span>
                  <span className="text-foreground">€{conv.costo_crediti.toFixed(4)}</span>
                </div>
              )}
              {conv.sentiment && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sentiment</span>
                  <Badge variant="outline" className="text-xs">{conv.sentiment}</Badge>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Canale</span>
                <span className="text-foreground capitalize">{conv.canale}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
