/**
 * PersonaChat — MP-AIE-02 v2
 *
 * Componente shared usato sia da SilvioChatSheet (canale 'silvio') sia da
 * AssistenteAIPage per le 17 personas (canale 'web_persona'). Espone una
 * UX uniforme con: header persona + scroll messaggi + tool execution viewer
 * + action proposal cards + input + invio.
 *
 * NON sostituisce le funzionalità satellite di Silvio (FAB, BellPopover,
 * MemoryPanel, ecc.) — quelle restano nei loro file.
 */
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useAIChat, type AIChatChannel } from "@/components/ai/shared/useAIChat";
import { ToolExecutionViewer } from "@/components/ai/ToolExecution/ToolExecutionViewer";
import { ActionProposalCard } from "@/components/ai/ActionProposals/ActionProposalCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Send, Sparkles } from "lucide-react";

interface PersonaChatProps {
  channel: AIChatChannel;
  /** "silvio" o uno dei 17 keys persona. */
  personaKey: string;
  personaDisplayName: string;
  personaIcon?: ComponentType<{ className?: string }>;
  /** ID iniziale della sessione/canale. Se omesso, viene creato al primo invio. */
  initialSessionId?: string;
  onSessionChange?: (id: string) => void;
  /** Placeholder textarea custom. Default localizzato. */
  inputPlaceholder?: string;
  /** Empty state custom. Default localizzato. */
  emptyHint?: string;
}

export function PersonaChat({
  channel,
  personaKey,
  personaDisplayName,
  personaIcon,
  initialSessionId,
  onSessionChange,
  inputPlaceholder,
  emptyHint,
}: PersonaChatProps) {
  const { messages, isLoading, error, sendMessage, sessionId } = useAIChat({
    channel,
    personaKey,
    sessionId: initialSessionId,
  });

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Notify parent when session changes
  useEffect(() => {
    if (sessionId) onSessionChange?.(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleSend = async () => {
    if (!draft.trim() || isLoading) return;
    const text = draft.trim();
    setDraft("");
    await sendMessage(text);
  };

  const Icon = personaIcon ?? Bot;
  const placeholder =
    inputPlaceholder ?? `Scrivi a ${personaDisplayName}…`;
  const empty =
    emptyHint ??
    (channel === "silvio"
      ? "Ciao! Sono Silvio, il tuo cervello AI. Cosa vuoi fare oggi?"
      : `Inizia una conversazione con ${personaDisplayName}.`);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <Avatar className="h-10 w-10 bg-primary/10">
          <AvatarFallback>
            <Icon className="h-5 w-5 text-primary" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{personaDisplayName}</h2>
          {channel === "silvio" && (
            <p className="text-xs text-muted-foreground">
              Sempre disponibile · cervello universale
            </p>
          )}
        </div>
      </header>

      <ScrollArea className="flex-1" ref={scrollRef as unknown as React.RefObject<HTMLDivElement>}>
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          {messages.length === 0 && !isLoading && (
            <div className="rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-6 w-6" />
              {empty}
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {m.content && (
                  <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                )}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <ToolExecutionViewer toolCalls={m.toolCalls} />
                )}
                {m.proposalIds?.map((pid) => (
                  <ActionProposalCard key={pid} proposalId={pid} />
                ))}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <Skeleton className="h-16 w-2/3 rounded-lg" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>

      <footer className="border-t border-border p-3">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={placeholder}
            className="min-h-[60px] resize-none"
            disabled={isLoading}
            autoFocus
          />
          <Button onClick={handleSend} disabled={!draft.trim() || isLoading} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

export default PersonaChat;
