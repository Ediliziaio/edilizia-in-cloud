import { Fragment, useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Search, Play, Pause, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { callElevenLabsProxy } from "../hooks/useElevenLabsProxy";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Conversation {
  id: string;
  status: string;
  duration_seconds: number;
  messages_count: number;
  appointment_created: boolean;
  started_at: string;
  elevenlabs_conversation_id: string | null;
  contact_id: string | null;
}

interface AnalyticsTableProps {
  conversations: Conversation[];
}

const formatDuration = (sec: number) => {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}m ${s}s`;
};

function AudioPlayer({ conversationId }: { conversationId: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadAndPlay = async () => {
    if (audioRef.current && blobUrl) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioRef.current.play().catch(() => setIsPlaying(false));
        setIsPlaying(true);
      }
      return;
    }

    setIsLoading(true);
    try {
      const data = await callElevenLabsProxy<{ audio_base64?: string; content_type?: string }>({
        action: "get_conversation_audio",
        payload: { conversation_id: conversationId },
      });
      if (!data?.audio_base64) throw new Error("Audio non disponibile");
      const contentType = data.content_type || "audio/mpeg";
      const binary = atob(data.audio_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
      setBlobUrl(url);
      const audio = new Audio(url);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => { setIsPlaying(false); toast.error("Errore riproduzione audio"); };
      await audio.play();
      audioRef.current = audio;
      setIsPlaying(true);
    } catch {
      toast.error("Impossibile caricare l'audio della conversazione");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 h-8"
      onClick={loadAndPlay}
      disabled={isLoading}
    >
      {isLoading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : isPlaying
          ? <Pause className="h-3.5 w-3.5" />
          : <Play className="h-3.5 w-3.5" />}
      {isLoading ? "Caricamento..." : isPlaying ? "Pausa" : "Ascolta registrazione"}
    </Button>
  );
}

interface TranscriptMessage {
  role: string;
  message?: string;
  content?: string;
  time_in_call_secs?: number;
}

function TranscriptViewer({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const openTranscript = async () => {
    setOpen(true);
    if (messages.length > 0) return;
    setIsLoading(true);
    try {
      const data = await callElevenLabsProxy<{ transcript?: TranscriptMessage[]; messages?: TranscriptMessage[] }>({
        action: "get_conversation",
        payload: { conversation_id: conversationId },
      });
      setMessages(data?.transcript || data?.messages || []);
    } catch {
      toast.error("Impossibile caricare la trascrizione");
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (secs?: number) => {
    if (!secs) return "";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2 h-8" onClick={openTranscript}>
        <FileText className="h-3.5 w-3.5" /> Trascrizione
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Trascrizione conversazione</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Trascrizione non disponibile
            </p>
          ) : (
            <ScrollArea className="h-[400px] pr-2">
              <div className="space-y-3">
                {messages.map((msg, idx) => {
                  const isAgent = msg.role === "agent" || msg.role === "assistant";
                  const text = msg.message || msg.content || "";
                  return (
                    <div key={idx} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        isAgent
                          ? "bg-muted text-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-medium opacity-70 capitalize">
                            {isAgent ? "Agente" : "Utente"}
                          </span>
                          {msg.time_in_call_secs !== undefined && (
                            <span className="text-[10px] opacity-50">{formatTime(msg.time_in_call_secs)}</span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap">{text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AnalyticsTable({ conversations }: AnalyticsTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = conversations.filter((c) => {
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    const matchSearch = search === "" ||
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      (c.elevenlabs_conversation_id || "").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca conversazione..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="completed">Completata</SelectItem>
            <SelectItem value="failed">Fallita</SelectItem>
            <SelectItem value="in_progress">In corso</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Data</TableHead>
              <TableHead>Durata</TableHead>
              <TableHead>Messaggi</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Appuntamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nessuna conversazione trovata
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((conv) => (
                <Fragment key={conv.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                  >
                    <TableCell>
                      {expandedId === conv.id
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(conv.started_at), "d MMM yyyy HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatDuration(conv.duration_seconds)}
                    </TableCell>
                    <TableCell className="text-sm">{conv.messages_count}</TableCell>
                    <TableCell>
                      <Badge
                        variant={conv.status === "completed" ? "default" : conv.status === "failed" ? "destructive" : "secondary"}
                      >
                        {conv.status === "completed" ? "Completata" : conv.status === "failed" ? "Fallita" : conv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {conv.appointment_created && (
                        <Badge variant="outline" className="text-xs">Sì</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedId === conv.id && (
                    <TableRow key={`${conv.id}-details`}>
                      <TableCell colSpan={6} className="bg-muted/30 p-4">
                        <div className="space-y-3 text-sm">
                          <div className="grid grid-cols-1 gap-1">
                            <p><span className="text-muted-foreground">ID:</span> {conv.id}</p>
                            {conv.elevenlabs_conversation_id && (
                              <p><span className="text-muted-foreground">ElevenLabs ID:</span> {conv.elevenlabs_conversation_id}</p>
                            )}
                            {conv.contact_id && (
                              <p><span className="text-muted-foreground">Contatto:</span> {conv.contact_id}</p>
                            )}
                          </div>
                          {conv.elevenlabs_conversation_id && conv.status === "completed" && (
                            <div className="flex gap-2 flex-wrap">
                              <AudioPlayer conversationId={conv.elevenlabs_conversation_id} />
                              <TranscriptViewer conversationId={conv.elevenlabs_conversation_id} />
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
