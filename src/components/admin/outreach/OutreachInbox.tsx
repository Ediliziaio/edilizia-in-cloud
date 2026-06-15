import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Inbox, Mail, Search, ChevronLeft, MessageSquare, AlertTriangle, Building2, Send, Loader2, Wand2, CheckCheck, Archive,
} from "lucide-react";
import { MigrationGate } from "./_shared";
import {
  INTENT_META, type Conversation, type StatusFilter,
  contactName, iniziali, relativeTime, fullTime,
  useOutreachConversations, useReplyComposer,
} from "./useOutreachConversations";

/**
 * OutreachInbox — inbox conversazioni compatta dell'Outreach Engine (2 pannelli:
 * lista a sinistra, thread a destra). Unisce email INVIATE (outreach_send_queue)
 * e RISPOSTE (outreach_replies) in un thread per contatto.
 *
 * La logica (query, raggruppamento, mutazioni, azioni di risposta) vive in
 * useOutreachConversations / useReplyComposer, condivisa con il client a 3
 * pannelli OutreachMailClient (DRY). Qui resta solo lo strato di presentazione
 * della vista compatta. Per la vista completa con pannello caselle → tab "Posta".
 */
export function OutreachInbox({ companyId }: { companyId: string }) {
  const {
    conversations, counts,
    isLoading, errored, tableMissing,
    markRead, markAllRead, archiveRead, filterConversations,
  } = useOutreachConversations(companyId);
  const { replyText, setReplyText, sending, aiDrafting, sendReply, draftWithAi } = useReplyComposer(companyId);

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterConversations(conversations, filter, search),
    [conversations, filter, search, filterConversations],
  );

  const selected = useMemo(
    () => conversations.find((c) => c.key === selectedKey) ?? null,
    [conversations, selectedKey],
  );

  // Apre la conversazione e segna lette le sue risposte non lette (handler onClick:
  // niente setState-in-effect → nessun warning React Compiler). Svuota la bozza
  // di risposta al cambio conversazione.
  const handleSelect = (conv: Conversation) => {
    setSelectedKey(conv.key);
    setReplyText("");
    if (conv.unread && conv.contact?.id) markRead.mutate(conv.contact.id);
  };

  if (tableMissing) {
    return (
      <MigrationGate
        title="Inbox conversazioni — pronta"
        unlocks={[
          "Ogni contatto con il suo thread: tutte le email inviate e le risposte in un colpo d'occhio.",
          "Lista a sinistra, conversazione a destra — come un vero client email.",
          "Filtra per interessati o non letti e lavora prima le trattative calde.",
        ]}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[560px] overflow-hidden rounded-xl border bg-card">
        <div className="w-full space-y-2 border-r p-3 md:w-[340px]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
            </div>
          ))}
        </div>
        <div className="hidden flex-1 items-center justify-center md:flex">
          <Skeleton className="h-40 w-2/3 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (errored) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-red-600">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Errore nel caricamento: {errored instanceof Error ? errored.message : "imprevisto"}
      </div>
    );
  }

  return (
    <div className="flex h-[560px] overflow-hidden rounded-xl border bg-card">
      {/* ═══ Lista conversazioni ═══ */}
      <aside className={cn(
        "flex w-full flex-col border-r bg-background md:w-[340px] md:min-w-[300px]",
        selected ? "hidden md:flex" : "flex",
      )}>
        <div className="border-b p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Inbox className="h-4 w-4 text-orange-500" /> Conversazioni
            {counts.unread > 0 && <Badge className="bg-orange-500">{counts.unread}</Badge>}
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca nome o email…"
              aria-label="Cerca conversazione"
              className="h-9 pl-8"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {([
              { k: "all", label: "Tutte" },
              { k: "interested", label: "Interessati", count: counts.interested },
              { k: "unread", label: "Non lette", count: counts.unread },
              { k: "archived", label: "Archiviate", count: counts.archived },
            ] as const).map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setFilter(f.k)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  filter === f.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {f.label}
                {"count" in f && f.count > 0 && (
                  <span className="ml-1 rounded-full bg-background/20 px-1 tabular-nums">{f.count}</span>
                )}
              </button>
            ))}
          </div>
          {(counts.unread > 0 || counts.read > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {counts.unread > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  disabled={markAllRead.isPending}
                  onClick={() => markAllRead.mutate()}
                  title="Segna come lette tutte le risposte non lette"
                >
                  {markAllRead.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                  Segna tutte lette
                </Button>
              )}
              {counts.read > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  disabled={archiveRead.isPending}
                  onClick={() => archiveRead.mutate()}
                  title="Archivia le conversazioni le cui risposte sono già state lette"
                >
                  {archiveRead.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                  Archivia lette
                </Button>
              )}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Inbox className="mx-auto mb-2 h-5 w-5 opacity-50" />
              {conversations.length === 0
                ? "Nessuna conversazione ancora. Le email inviate e le risposte compaiono qui."
                : "Nessuna conversazione per questo filtro."}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((conv) => {
                const name = contactName(conv.contact, conv.email);
                const company = conv.contact?.company_name;
                const active = conv.key === selectedKey;
                const intentMeta = conv.lastIntent ? INTENT_META[conv.lastIntent] : null;
                return (
                  <li key={conv.key}>
                    <button
                      onClick={() => handleSelect(conv)}
                      className={cn(
                        "flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                        active && "bg-muted",
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-xs text-primary">{iniziali(name)}</AvatarFallback>
                        </Avatar>
                        {conv.unread && (
                          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-orange-500 ring-2 ring-background" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-sm", conv.unread ? "font-semibold" : "font-medium")}>{name}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(conv.lastAt)}</span>
                        </div>
                        {company && (
                          <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0" />{company}
                          </div>
                        )}
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">{conv.lastSnippet}</span>
                          {intentMeta && (
                            <Badge variant="outline" className={cn("shrink-0 text-[10px]", intentMeta.cls)}>{intentMeta.label}</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </aside>

      {/* ═══ Thread ═══ */}
      <section
        key={selectedKey ?? "vuota"}
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-muted/20",
          selected ? "flex max-md:animate-in max-md:slide-in-from-right-4 max-md:fade-in-0 max-md:duration-200" : "hidden md:flex",
        )}
      >
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
            <div>
              <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">Seleziona una conversazione.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3 sm:px-4">
              <Button variant="ghost" size="icon" className="-ml-1 md:hidden" aria-label="Torna alla lista" onClick={() => setSelectedKey(null)}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-xs text-primary">{iniziali(contactName(selected.contact, selected.email))}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{contactName(selected.contact, selected.email)}</div>
                <div className="flex items-center gap-3 truncate text-xs text-muted-foreground">
                  {(selected.contact?.email || selected.email) && (
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{selected.contact?.email || selected.email}</span>
                  )}
                  {selected.contact?.company_name && (
                    <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{selected.contact.company_name}</span>
                  )}
                </div>
              </div>
            </header>

            <ScrollArea className="flex-1 px-3 py-4 sm:px-4">
              <div className="mx-auto max-w-3xl space-y-3">
                {selected.messages.map((m, i) => {
                  const out = m.direction === "out";
                  const prev = selected.messages[i - 1];
                  // Mostra l'oggetto solo se cambia rispetto al messaggio precedente.
                  const showSubject = !!m.subject && m.subject !== prev?.subject;
                  const intentMeta = m.intent ? INTENT_META[m.intent] : null;
                  return (
                    <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[85%] rounded-2xl border px-3.5 py-2 shadow-sm",
                        out ? "border-primary/20 bg-primary/10" : "bg-background",
                      )}>
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {out ? "Inviata" : "Risposta"}
                          {intentMeta && (
                            <Badge variant="outline" className={cn("ml-1 px-1 py-0 text-[9px] normal-case", intentMeta.cls)}>{intentMeta.label}</Badge>
                          )}
                        </div>
                        {showSubject && <div className="mb-1 text-sm font-semibold">{m.subject}</div>}
                        {out ? (
                          // Inviate: corpo HTML nostro → render fedele.
                          <div
                            className="prose prose-sm max-w-none break-words text-sm [&_a]:text-primary [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: m.body || "—" }}
                          />
                        ) : (
                          // Risposte: testo/snippet grezzo → niente HTML non fidato.
                          <p className="whitespace-pre-wrap break-words text-sm">{m.body || "—"}</p>
                        )}
                        <div className="mt-1 text-right text-[10px] text-muted-foreground">{fullTime(m.at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* ═══ Box risposta 2-vie ═══ */}
            {selected.contact?.id ? (
              <div className="shrink-0 border-t bg-background p-3 sm:px-4">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Scrivi una risposta… verrà inviata dalla stessa casella che ha contattato il prospect."
                  aria-label="Testo della risposta"
                  rows={3}
                  className="resize-none text-sm"
                  disabled={sending || aiDrafting}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !sending && replyText.trim()) {
                      e.preventDefault();
                      void sendReply(selected.contact!.id);
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Invio per inviare</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void draftWithAi(selected.contact!.id)}
                      disabled={sending || aiDrafting}
                      className="gap-1.5"
                      title="L'AI legge la conversazione e propone una risposta da rivedere"
                    >
                      {aiDrafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      {aiDrafting ? "Scrivo…" : "Bozza AI"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void sendReply(selected.contact!.id)}
                      disabled={sending || aiDrafting || !replyText.trim()}
                      className="gap-1.5"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {sending ? "Invio…" : "Invia risposta"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="shrink-0 border-t bg-background px-4 py-3 text-[11px] text-muted-foreground">
                Conversazione senza contatto collegato — rispondi dal tuo client email.
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
