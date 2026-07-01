/**
 * OrderNotesDialog — "Note interne di commessa"
 *
 * Thread collaborativo (stile Slack/Asana, design chiaro) per le note interne
 * di una commessa. Riusa le tabelle Chat Team via useOrderNotesChannel.
 *
 * Le notifiche ai menzionati sono gestite server-side dal trigger DB su
 * internal_chat_messages — qui inseriamo solo il messaggio con `mentions`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  NotebookPen,
  AtSign,
  Send,
  Loader2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import { useOrderNotesChannel } from "@/hooks/useOrderNotesChannel";

interface OrderNotesDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  orderCode?: string | null;
}

// ─── Avatar helpers ──────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsOf(first?: string | null, last?: string | null): string {
  const a = first?.[0] ?? "";
  const b = last?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

function shortTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Ieri ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: it });
}

// Evidenzia gli @mention come pill accent
function renderContent(text: string) {
  const parts = text.split(/(@[\p{L}]+(?:\s+[\p{L}]+)?)/gu);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span
        key={i}
        className="rounded bg-primary/10 px-1 py-0.5 font-medium text-primary"
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

// ─── Small avatar ────────────────────────────────────────────────────────────
function InitialAvatar({
  id,
  first,
  last,
  size = 28,
  className,
}: {
  id: string;
  first?: string | null;
  last?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        colorFor(id),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initialsOf(first, last)}
    </div>
  );
}

export function OrderNotesDialog({
  open,
  onOpenChange,
  orderId,
  orderCode,
}: OrderNotesDialogProps) {
  const {
    messages,
    memberIds,
    team,
    profilesById,
    currentUserId,
    isLoading,
    isError,
    refetch,
    sendMessage,
    contactTeam,
    isSending,
    isContacting,
  } = useOrderNotesChannel(orderId, { orderCode });

  const [text, setText] = useState("");
  const [pendingMentions, setPendingMentions] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isSoloMe =
    memberIds.length <= 1 &&
    (memberIds.length === 0 || memberIds[0] === currentUserId);

  // Auto-scroll al fondo su nuovi messaggi / apertura
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, open, isLoading]);

  // Reset composer alla chiusura (gestito in handleOpenChange, non in un effect:
  // setState sincrono in effect provoca cascading renders — vedi lint react-hooks).
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setText("");
      setPendingMentions(new Set());
      setMentionQuery(null);
      setContactOpen(false);
      setSelectedContacts(new Set());
    }
    onOpenChange(next);
  };

  // Rileva il token "@parola" corrente per l'autocomplete
  const handleTextChange = (value: string) => {
    setText(value);
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : value.length;
    const before = value.slice(0, caret);
    const match = before.match(/@([\p{L}]*)$/u);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return team
      .filter((m) => m.id !== currentUserId)
      .filter((m) => m.label.toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, team, currentUserId]);

  const insertMention = (member: { id: string; label: string }) => {
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : text.length;
    const before = text.slice(0, caret).replace(/@([\p{L}]*)$/u, "");
    const after = text.slice(caret);
    const next = `${before}@${member.label} ${after}`;
    setText(next);
    setPendingMentions((prev) => new Set(prev).add(member.id));
    setMentionQuery(null);
    // Rifocalizza la textarea
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node) {
        node.focus();
        const pos = (before + `@${member.label} `).length;
        node.setSelectionRange(pos, pos);
      }
    });
  };

  // Deriva le menzioni finali: pendingMentions + match "@First Last" nel testo
  const resolveMentions = (): string[] => {
    const ids = new Set(pendingMentions);
    for (const m of team) {
      if (m.id === currentUserId) continue;
      if (m.label && text.includes(`@${m.label}`)) ids.add(m.id);
    }
    return Array.from(ids);
  };

  const canSend = text.trim().length > 0 && !isSending;

  const handleSend = async () => {
    if (!canSend) return;
    const content = text.trim();
    const mentions = resolveMentions();
    try {
      await sendMessage({ content, mentions });
      setText("");
      setPendingMentions(new Set());
      setMentionQuery(null);
    } catch {
      /* toast già gestito nel hook */
    }
  };

  const handleContact = async () => {
    const ids = Array.from(selectedContacts);
    if (ids.length === 0) return;
    try {
      await contactTeam(ids);
      setContactOpen(false);
      setSelectedContacts(new Set());
    } catch {
      /* toast già gestito nel hook */
    }
  };

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const overlapAvatars = memberIds.slice(0, 4);
  const memberLabel = isSoloMe ? "Solo tu" : `Gruppo · ${memberIds.length}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 p-0">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <NotebookPen className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold leading-tight">
                Note interne
              </DialogTitle>
              <p className="truncate text-xs text-muted-foreground">
                {orderCode ? `Commessa ${orderCode} · ` : ""}visibili al team, non al cliente
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex -space-x-2">
              {overlapAvatars.map((id) => {
                const p = profilesById[id];
                return (
                  <InitialAvatar
                    key={id}
                    id={id}
                    first={p?.first_name}
                    last={p?.last_name}
                    size={26}
                    className="ring-2 ring-background"
                  />
                );
              })}
            </div>
            <span className="text-xs text-muted-foreground">{memberLabel}</span>
          </div>
        </DialogHeader>

        {/* Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Caricamento…
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Impossibile caricare. Riprova.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Riprova
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <NotebookPen className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="max-w-[16rem] text-sm text-muted-foreground">
                Nessuna nota ancora. Scrivi un promemoria per il team o coinvolgi
                un collega con @.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                const isMe = msg.sender_id === currentUserId;
                const author = profilesById[msg.sender_id];
                const authorName =
                  `${author?.first_name ?? ""} ${author?.last_name ?? ""}`.trim() ||
                  (isMe ? "Tu" : "Utente");
                return (
                  <div key={msg.id} className="flex gap-2.5">
                    <InitialAvatar
                      id={msg.sender_id}
                      first={author?.first_name}
                      last={author?.last_name}
                      size={28}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-foreground">
                          {authorName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {shortTime(msg.created_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                        {renderContent(msg.content)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t p-3">
          <div className="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
            {/* Autocomplete @mention */}
            {mentionQuery !== null && mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-0 z-10 mb-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
                {mentionMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => insertMention(m)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-accent"
                  >
                    <InitialAvatar
                      id={m.id}
                      first={m.first_name}
                      last={m.last_name}
                      size={22}
                    />
                    <span className="truncate">{m.label}</span>
                  </button>
                ))}
              </div>
            )}

            <Textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Scrivi una nota o @menziona un collega…"
              className="min-h-[64px] resize-none border-0 bg-transparent px-3 py-2 text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0"
            />

            <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    const next = `${text}@`;
                    setText(next);
                    setMentionQuery("");
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                >
                  <AtSign className="h-3.5 w-3.5" />
                  Menziona
                </Button>

                <Popover open={contactOpen} onOpenChange={setContactOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Contatta il team
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-0">
                    <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                      Aggiungi al gruppo commessa
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {team.filter((m) => m.id !== currentUserId).length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          Nessun collega disponibile.
                        </p>
                      ) : (
                        team
                          .filter((m) => m.id !== currentUserId)
                          .map((m) => {
                            const already = memberIds.includes(m.id);
                            return (
                              <label
                                key={m.id}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-accent",
                                  already && "opacity-50",
                                )}
                              >
                                <Checkbox
                                  checked={selectedContacts.has(m.id) || already}
                                  disabled={already}
                                  onCheckedChange={() => toggleContact(m.id)}
                                />
                                <InitialAvatar
                                  id={m.id}
                                  first={m.first_name}
                                  last={m.last_name}
                                  size={22}
                                />
                                <span className="truncate">{m.label}</span>
                                {already && (
                                  <span className="ml-auto text-[10px] text-muted-foreground">
                                    già nel gruppo
                                  </span>
                                )}
                              </label>
                            );
                          })
                      )}
                    </div>
                    <div className="border-t p-2">
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        disabled={selectedContacts.size === 0 || isContacting}
                        onClick={() => void handleContact()}
                      >
                        {isContacting && (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        )}
                        Aggiungi
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <Button
                type="button"
                size="sm"
                className="h-7 gap-1 px-3"
                disabled={!canSend}
                onClick={() => void handleSend()}
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Invia
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OrderNotesDialog;
