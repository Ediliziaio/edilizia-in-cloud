import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionTimeline } from "./ActionTimeline";
import { useInternalCallLog, useInternalCallActions } from "../hooks/useInternalCallLogs";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Phone, Clock, MessageSquare, User } from "lucide-react";

interface Props {
  callId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CallDetailDrawer({ callId, open, onOpenChange }: Props) {
  const { data: call, isLoading } = useInternalCallLog(callId ?? undefined);
  const { data: actions = [] } = useInternalCallActions(callId ?? undefined);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Dettaglio Chiamata</SheetTitle>
        </SheetHeader>

        {isLoading || !call ? (
          <div className="space-y-4 mt-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{call.contact_name ?? call.caller_phone ?? "Sconosciuto"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{call.caller_phone ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatDuration(call.duration_seconds)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>{call.messages_count} messaggi</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={call.call_direction === "inbound" ? "default" : "secondary"}>
                {call.call_direction === "inbound" ? "In entrata" : "In uscita"}
              </Badge>
              <Badge variant={call.status === "completed" ? "default" : "outline"}>
                {call.status}
              </Badge>
              {call.outcome && <Badge variant="outline">{call.outcome}</Badge>}
            </div>

            {call.summary && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Riepilogo</p>
                <p className="text-sm">{call.summary}</p>
              </div>
            )}

            <Tabs defaultValue="actions" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="actions" className="flex-1">Azioni CRM</TabsTrigger>
                <TabsTrigger value="transcript" className="flex-1">Trascrizione</TabsTrigger>
              </TabsList>

              <TabsContent value="actions" className="mt-3">
                <ScrollArea className="h-[400px]">
                  <ActionTimeline actions={actions} />
                </ScrollArea>
              </TabsContent>

              <TabsContent value="transcript" className="mt-3">
                <ScrollArea className="h-[400px]">
                  <TranscriptView transcript={call.transcript} />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TranscriptView({ transcript }: { transcript: any }) {
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Trascrizione non disponibile.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {transcript.map((msg: any, i: number) => {
        const isAgent = msg.role === "agent" || msg.role === "assistant";
        return (
          <div
            key={i}
            className={`flex ${isAgent ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                isAgent
                  ? "bg-muted text-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              <p className="text-[10px] font-medium opacity-70 mb-0.5">
                {isAgent ? "Agente" : "Cliente"}
              </p>
              <p>{msg.content ?? msg.text ?? msg.message ?? ""}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
