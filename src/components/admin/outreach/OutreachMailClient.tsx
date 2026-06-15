import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Inbox, Mailbox, Mail, Search, ChevronLeft, MessageSquare, AlertTriangle, Building2,
  Send, Loader2, Wand2, CheckCheck, Archive, Layers, PanelRightOpen, PanelRightClose,
  User, Phone, Tag, ShieldBan, Pause, Play, ThumbsUp, ThumbsDown, Clock, Briefcase,
  Activity, ShieldCheck,
} from "lucide-react";
import { MigrationGate } from "./_shared";
import { OutreachConvertContactDialog } from "./OutreachConvertContactDialog";
import {
  INTENT_META, ENROLLMENT_STATUS_META, type Conversation, type StatusFilter,
  type LeadContext, type LeadSequence,
  contactName, iniziali, relativeTime, fullTime, providerLabel, senderStatusColor,
  useOutreachConversations, useReplyComposer, useLeadContext, useLeadActions, isEnrollmentLive,
} from "./useOutreachConversations";

/**
 * OutreachMailClient — client email a 3 pannelli dedicato al COLD outreach.
 * Modellato su /admin/email (EmailLayout): pannello caselle, lista conversazioni,
 * thread + risposta. A differenza dell'inbox compatta (OutreachInbox) qui c'è il
 * terzo pannello con le CASELLE del pool e si può filtrare per casella di invio.
 *
 * Riusa tutta la logica via useOutreachConversations / useReplyComposer (DRY):
 * stesse query, stesso raggruppamento, stesse mutazioni (segna-letto/bulk) e
 * stesse azioni Bozza AI / Invia risposta dell'inbox.
 *
 *   ┌──────────────┬──────────────────┬───────────────────────────┐
 *   │ Caselle      │ Conversazioni    │ Thread + risposta         │
 *   │ + filtri     │ (per contatto)   │ Bozza AI · Invia          │
 *   └──────────────┴──────────────────┴───────────────────────────┘
 * Mobile: 2 livelli (lista → dettaglio); il pannello caselle diventa un
 * selettore in cima alla lista.
 */
export function OutreachMailClient({ companyId }: { companyId: string }) {
  const {
    conversations, counts, sendersById, senders, unreadBySender,
    isLoading, errored, tableMissing,
    markRead, markAllRead, archiveRead, setIntent, filterConversations,
  } = useOutreachConversations(companyId);
  const { replyText, setReplyText, sending, aiDrafting, sendReply, draftWithAi } = useReplyComposer(companyId);

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [senderId, setSenderId] = useState<string | null>(null); // null = tutte le caselle
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showListMobile, setShowListMobile] = useState(false); // overlay caselle su mobile
  const [showContext, setShowContext] = useState(true); // pannello contesto lead (destra)

  const filtered = useMemo(
    () => filterConversations(conversations, filter, search, senderId),
    [conversations, filter, search, senderId, filterConversations],
  );

  const selected = useMemo(
    () => conversations.find((c) => c.key === selectedKey) ?? null,
    [conversations, selectedKey],
  );

  // Contesto + azioni del lead selezionato (DRY: dal hook condiviso).
  const { context: leadContext, isLoading: leadLoading, liveSequence } =
    useLeadContext(companyId, selected?.contact ?? null, selected);
  const leadActions = useLeadActions(companyId);

  // Numero di conversazioni attive per casella (badge nel pannello sinistro).
  const convCountBySender = useMemo(() => {
    const m = new Map<string, number>();
    for (const conv of conversations) {
      if (conv.archived) continue;
      for (const id of conv.senderAccountIds) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [conversations]);

  // Apre la conversazione e segna lette le risposte non lette (handler onClick:
  // niente setState-in-effect). Svuota la bozza al cambio conversazione.
  const handleSelect = (conv: Conversation) => {
    setSelectedKey(conv.key);
    setReplyText("");
    setShowListMobile(false);
    if (conv.unread && conv.contact?.id) markRead.mutate(conv.contact.id);
  };

  // Scorciatoie J/K: sposta la selezione nella lista filtrata. Ignorate mentre si
  // scrive in un input/textarea (così non rubano i tasti alla composizione). Il
  // listener si ri-registra quando cambia la lista filtrata o la selezione: la
  // closure cattura i valori correnti, niente ref scritti in render.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k !== "j" && k !== "k") return;
      if (filtered.length === 0) return;
      e.preventDefault();
      const idx = filtered.findIndex((c) => c.key === selectedKey);
      const nextIdx = k === "j"
        ? (idx < 0 ? 0 : Math.min(idx + 1, filtered.length - 1))
        : (idx < 0 ? 0 : Math.max(idx - 1, 0));
      const next = filtered[nextIdx];
      if (next && next.key !== selectedKey) {
        setSelectedKey(next.key);
        setReplyText("");
        if (next.unread && next.contact?.id) markRead.mutate(next.contact.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectedKey, markRead, setReplyText]);

  const selectSender = (id: string | null) => {
    setSenderId(id);
    setSelectedKey(null);
    setShowListMobile(false);
  };

  if (tableMissing) {
    return (
      <MigrationGate
        title="Posta cold — client a 3 pannelli pronto"
        unlocks={[
          "Tutte le email cold (inviate + risposte) in un unico client, conversazione per conversazione.",
          "Pannello caselle: filtra le conversazioni per la casella che le ha inviate.",
          "Rispondi dalla stessa casella, con bozza AI — come un vero client email, ma per il freddo.",
        ]}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[620px] overflow-hidden rounded-xl border bg-card">
        <div className="hidden w-[220px] shrink-0 space-y-2 border-r p-3 lg:block">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
        </div>
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

  const activeSender = senderId ? sendersById.get(senderId) ?? null : null;

  return (
    <div className="flex h-[620px] overflow-hidden rounded-xl border bg-card">
      {/* ═══ Pannello caselle & filtri (sinistra) ═══ */}
      <aside className="hidden w-[230px] shrink-0 flex-col border-r bg-background lg:flex">
        <div className="border-b p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Mailbox className="h-4 w-4 text-orange-500" /> Caselle
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Filtra per casella che ha inviato</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-0.5 p-2">
            <MailboxButton
              active={senderId === null}
              onClick={() => selectSender(null)}
              icon={<Layers className="h-4 w-4" />}
              title="Tutte le caselle"
              count={counts.unread || undefined}
              countTone="orange"
            />
            {senders.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-muted-foreground">
                Nessuna casella configurata. Aggiungile in Deliverability → Pool mittenti.
              </p>
            ) : (
              senders.map((s) => (
                <MailboxButton
                  key={s.id}
                  active={senderId === s.id}
                  onClick={() => selectSender(s.id)}
                  icon={<span className={cn("h-2 w-2 rounded-full", senderStatusColor(s.status))} title={s.status} />}
                  title={s.email}
                  badge={providerLabel(s.provider)}
                  count={convCountBySender.get(s.id) || undefined}
                  unread={unreadBySender.get(s.id) || undefined}
                />
              ))
            )}
          </div>
        </ScrollArea>
        <div className="border-t p-2">
          <FilterPills filter={filter} counts={counts} onChange={setFilter} />
        </div>
      </aside>

      {/* ═══ Lista conversazioni (centro) ═══ */}
      <aside className={cn(
        "flex w-full flex-col border-r bg-background md:w-[340px] md:min-w-[300px]",
        selected ? "hidden md:flex" : "flex",
      )}>
        <div className="border-b p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Inbox className="h-4 w-4 text-orange-500" /> Conversazioni
            {counts.unread > 0 && <Badge className="bg-orange-500">{counts.unread}</Badge>}
            {/* Hint scorciatoie tastiera (solo desktop). */}
            <span
              className="hidden cursor-help select-none rounded border px-1 text-[10px] font-normal text-muted-foreground lg:inline"
              title="Scorciatoie · J/K: conversazione successiva/precedente · ⌘/Ctrl+Invio: invia la risposta"
            >?</span>
            {activeSender && (
              <Badge variant="outline" className="ml-auto max-w-[150px] gap-1 truncate text-[10px] font-normal">
                <Mailbox className="h-3 w-3 shrink-0" /><span className="truncate">{activeSender.email}</span>
              </Badge>
            )}
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

          {/* Filtri stato — visibili anche senza il pannello caselle (mobile/tablet) */}
          <div className="mt-2 lg:hidden">
            <FilterPills filter={filter} counts={counts} onChange={setFilter} />
          </div>

          {/* Selettore casella compatto su mobile/tablet (pannello sinistro nascosto) */}
          <div className="mt-2 lg:hidden">
            <button
              type="button"
              onClick={() => setShowListMobile((v) => !v)}
              className="flex w-full items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-left text-[11px]"
            >
              <Mailbox className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{activeSender ? activeSender.email : "Tutte le caselle"}</span>
              <span className="text-muted-foreground">cambia</span>
            </button>
            {showListMobile && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-background p-1">
                <MailboxButton active={senderId === null} onClick={() => selectSender(null)} icon={<Layers className="h-4 w-4" />} title="Tutte le caselle" />
                {senders.map((s) => (
                  <MailboxButton
                    key={s.id}
                    active={senderId === s.id}
                    onClick={() => selectSender(s.id)}
                    icon={<span className={cn("h-2 w-2 rounded-full", senderStatusColor(s.status))} />}
                    title={s.email}
                    badge={providerLabel(s.provider)}
                  />
                ))}
              </div>
            )}
          </div>

          {(counts.unread > 0 || counts.read > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {counts.unread > 0 && (
                <Button
                  size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
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
                  size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
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
                : activeSender
                  ? "Nessuna conversazione per questa casella e questo filtro."
                  : "Nessuna conversazione per questo filtro."}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((conv) => {
                const name = contactName(conv.contact, conv.email);
                const company = conv.contact?.company_name;
                const active = conv.key === selectedKey;
                const intentMeta = conv.lastIntent ? INTENT_META[conv.lastIntent] : null;
                const mailbox = conv.primarySenderId ? sendersById.get(conv.primarySenderId) ?? null : null;
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
                        {mailbox && (
                          <div className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted-foreground/80">
                            <Mailbox className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{mailbox.email}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </aside>

      {/* ═══ Thread + risposta (destra) ═══ */}
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
              <p className="mt-1 text-xs">Inviate a destra, risposte a sinistra. <kbd className="rounded border bg-muted px-1 text-[10px]">J</kbd>/<kbd className="rounded border bg-muted px-1 text-[10px]">K</kbd> per spostarti.</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col">
              <ThreadPane
                selected={selected}
                mailbox={selected.primarySenderId ? sendersById.get(selected.primarySenderId) ?? null : null}
                replyText={replyText}
                setReplyText={setReplyText}
                sending={sending}
                aiDrafting={aiDrafting}
                onSend={sendReply}
                onDraft={draftWithAi}
                onBack={() => setSelectedKey(null)}
                showContext={showContext}
                onToggleContext={() => setShowContext((v) => !v)}
              />
            </div>
            {showContext && (
              <LeadContextPanel
                companyId={companyId}
                conversation={selected}
                context={leadContext}
                loading={leadLoading}
                liveSequence={liveSequence}
                actions={leadActions}
                onSetIntent={(intent) => selected.contact?.id && setIntent.mutate({ contactId: selected.contact.id, intent })}
                intentPending={setIntent.isPending}
                onClose={() => setShowContext(false)}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * PostaUnreadBadge — pillola arancione col numero di risposte non lette, da usare
 * accanto al label del TabsTrigger "Posta". Riusa il conteggio del hook condiviso
 * (stessa fonte del client), così resta sempre allineato. Niente badge se zero.
 */
export function PostaUnreadBadge({ companyId }: { companyId: string }) {
  const { counts, tableMissing, errored } = useOutreachConversations(companyId);
  if (tableMissing || errored || counts.unread <= 0) return null;
  return (
    <Badge className="ml-1.5 h-4 min-w-4 justify-center bg-orange-500 px-1 text-[10px] tabular-nums">
      {counts.unread > 99 ? "99+" : counts.unread}
    </Badge>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sotto-componenti presentazionali
   ────────────────────────────────────────────────────────────────────────── */

function MailboxButton({
  active, onClick, icon, title, badge, count, unread, countTone = "muted",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  count?: number;
  /** Conversazioni non lette della casella → pillola arancione prioritaria. */
  unread?: number;
  countTone?: "muted" | "orange";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
        active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted/70",
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {badge && (
        <span className="shrink-0 rounded bg-muted px-1 text-[9px] font-medium uppercase text-muted-foreground">{badge}</span>
      )}
      {unread != null && unread > 0 ? (
        <span className="shrink-0 rounded-full bg-orange-500 px-1.5 text-[10px] tabular-nums text-white" title={`${unread} non lette`}>{unread}</span>
      ) : count != null && count > 0 ? (
        <span className={cn(
          "shrink-0 rounded-full px-1.5 text-[10px] tabular-nums",
          countTone === "orange" ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground",
        )}>{count}</span>
      ) : null}
    </button>
  );
}

function FilterPills({
  filter, counts, onChange,
}: {
  filter: StatusFilter;
  counts: { interested: number; unread: number; archived: number };
  onChange: (f: StatusFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {([
        { k: "all", label: "Tutte" },
        { k: "interested", label: "Interessati", count: counts.interested },
        { k: "unread", label: "Non lette", count: counts.unread },
        { k: "archived", label: "Archiviate", count: counts.archived },
      ] as const).map((f) => (
        <button
          key={f.k}
          type="button"
          onClick={() => onChange(f.k)}
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
  );
}

function ThreadPane({
  selected, mailbox, replyText, setReplyText, sending, aiDrafting, onSend, onDraft, onBack,
  showContext, onToggleContext,
}: {
  selected: Conversation;
  mailbox: { email: string; provider: string } | null;
  replyText: string;
  setReplyText: (v: string) => void;
  sending: boolean;
  aiDrafting: boolean;
  onSend: (contactId: string) => void | Promise<void>;
  onDraft: (contactId: string) => void | Promise<void>;
  onBack: () => void;
  showContext: boolean;
  onToggleContext: () => void;
}) {
  const name = contactName(selected.contact, selected.email);
  const counterpart = selected.contact?.email || selected.email;
  const contactId = selected.contact?.id ?? null;
  return (
    <>
      <header className="flex shrink-0 flex-col gap-1 border-b bg-background px-3 py-2 sm:px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-1 md:hidden" aria-label="Torna alla lista" onClick={onBack}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">{iniziali(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="flex items-center gap-3 truncate text-xs text-muted-foreground">
              {counterpart && (
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{counterpart}</span>
              )}
              {selected.contact?.company_name && (
                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{selected.contact.company_name}</span>
              )}
            </div>
          </div>
          {/* Toggle pannello contesto lead (nascosto su mobile: là è in fondo al thread). */}
          <Button
            variant="ghost" size="icon"
            className="hidden shrink-0 lg:inline-flex"
            aria-label={showContext ? "Nascondi contesto lead" : "Mostra contesto lead"}
            title={showContext ? "Nascondi contesto lead" : "Mostra contesto lead"}
            onClick={onToggleContext}
          >
            {showContext ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>
        {/* Casella di riferimento della conversazione (da/verso quale casella). */}
        <div className="flex items-center gap-1.5 pl-0 text-[11px] text-muted-foreground sm:pl-12">
          <Mailbox className="h-3 w-3 shrink-0 text-orange-500" />
          {mailbox ? (
            <span className="truncate">
              Casella: <span className="font-medium text-foreground">{mailbox.email}</span>
              <span className="ml-1 rounded bg-muted px-1 text-[9px] font-medium uppercase">{providerLabel(mailbox.provider)}</span>
            </span>
          ) : (
            <span>Casella non determinata (nessun invio tracciato)</span>
          )}
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
      {contactId ? (
        <div className="shrink-0 border-t bg-background p-3 sm:px-4">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={mailbox
              ? `Scrivi una risposta… verrà inviata da ${mailbox.email}.`
              : "Scrivi una risposta… verrà inviata dalla stessa casella che ha contattato il prospect."}
            aria-label="Testo della risposta"
            rows={3}
            className="resize-none text-sm"
            disabled={sending || aiDrafting}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !sending && replyText.trim()) {
                e.preventDefault();
                void onSend(contactId);
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Invio per inviare</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline"
                onClick={() => void onDraft(contactId)}
                disabled={sending || aiDrafting}
                className="gap-1.5"
                title="L'AI legge la conversazione e propone una risposta da rivedere"
              >
                {aiDrafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {aiDrafting ? "Scrivo…" : "Bozza AI"}
              </Button>
              <Button
                size="sm"
                onClick={() => void onSend(contactId)}
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
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Pannello CONTESTO LEAD + AZIONI RAPIDE (colonna destra / stack su mobile)
   ────────────────────────────────────────────────────────────────────────── */

type LeadActionsApi = ReturnType<typeof useLeadActions>;

function LeadContextPanel({
  companyId, conversation, context, loading, liveSequence, actions, onSetIntent, intentPending, onClose,
}: {
  companyId: string;
  conversation: Conversation;
  context: LeadContext | null;
  loading: boolean;
  liveSequence: LeadSequence | null;
  actions: LeadActionsApi;
  onSetIntent: (intent: string) => void;
  intentPending: boolean;
  onClose: () => void;
}) {
  const contact = context?.contact ?? conversation.contact ?? null;
  const contactId = contact?.id ?? null;
  const email = contact?.email ?? conversation.email ?? null;
  const name = contactName(contact, conversation.email);
  const lastIntent = conversation.lastIntent;
  const paused = !!liveSequence && liveSequence.status === "paused";
  const busy = actions.pauseSequence.isPending || actions.resumeSequence.isPending || actions.suppressContact.isPending;

  return (
    <aside className="flex w-full shrink-0 flex-col border-t bg-background lg:w-[300px] lg:border-l lg:border-t-0">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <User className="h-3.5 w-3.5" /> Contesto lead
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6 lg:hidden" aria-label="Chiudi contesto" onClick={onClose}>
          <PanelRightClose className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* ── Identità ── */}
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-xs text-primary">{iniziali(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{name}</div>
              {contact?.company_name && (
                <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3 shrink-0" />{contact.company_name}
                </div>
              )}
            </div>
          </div>

          {!contact ? (
            // Caso test attuale: conversazione esistente ma email non in rubrica.
            <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Nessun contatto collegato</p>
              <p className="mt-1">Questa email non è in <code className="rounded bg-muted px-1">marketing_contacts</code>. Le azioni sul lead (sequenza, intento, opportunità, opt-out) si attivano collegando un contatto.</p>
              {email && (
                <p className="mt-2 inline-flex items-center gap-1 break-all"><Mail className="h-3 w-3 shrink-0" />{email}</p>
              )}
            </div>
          ) : (
            <>
              {/* ── Coordinate ── */}
              <div className="space-y-1.5 text-xs">
                {email && <InfoRow icon={<Mail className="h-3.5 w-3.5" />} value={email} mono />}
                {contact.phone && <InfoRow icon={<Phone className="h-3.5 w-3.5" />} value={contact.phone} />}
                {contact.source && <InfoRow icon={<Activity className="h-3.5 w-3.5" />} value={contact.source} label="Sorgente" />}
              </div>

              {/* ── Contattabilità ── */}
              <div className="flex flex-wrap items-center gap-1.5">
                {context?.suppressed ? (
                  <Badge variant="outline" className="gap-1 border-red-200 bg-red-100 text-[10px] text-red-700">
                    <ShieldBan className="h-3 w-3" /> {contact.optout_email ? "Opt-out" : "Soppresso"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-100 text-[10px] text-emerald-700">
                    <ShieldCheck className="h-3 w-3" /> Contattabile
                  </Badge>
                )}
                {lastIntent && INTENT_META[lastIntent] && (
                  <Badge variant="outline" className={cn("text-[10px]", INTENT_META[lastIntent].cls)}>{INTENT_META[lastIntent].label}</Badge>
                )}
              </div>

              {/* ── Liste / tag ── */}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {contact.tags.slice(0, 8).map((t) => (
                    <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>
                  ))}
                </div>
              )}

              {/* ── Stato sequenza ── */}
              <div>
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sequenza</div>
                {loading ? (
                  <Skeleton className="h-12 w-full rounded-md" />
                ) : context && context.sequences.length > 0 ? (
                  <div className="space-y-1.5">
                    {context.sequences.slice(0, 3).map((s) => {
                      const meta = ENROLLMENT_STATUS_META[s.status];
                      return (
                        <div key={s.enrollmentId} className="rounded-md border bg-muted/20 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium">{s.sequenceName ?? "Sequenza"}</span>
                            <Badge variant="outline" className={cn("shrink-0 text-[9px]", meta?.cls)}>{meta?.label ?? s.status}</Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span>Step {s.currentStep}</span>
                            {isEnrollmentLive(s.status) && s.nextActionAt && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Prossimo {relativeTime(s.nextActionAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Non iscritto a nessuna sequenza.</p>
                )}
              </div>

              {/* ── Mini-stats ── */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Inviate" value={context?.sentCount ?? conversation.sentCount} />
                <Stat label="Risposte" value={context?.replyCount ?? conversation.replyCount} />
                <Stat label="Ultima" value={relativeTime(context?.lastActivityAt ?? conversation.lastAt) || "—"} small />
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* ── Azioni rapide ── */}
      <div className="shrink-0 space-y-2 border-t bg-background p-3">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Azioni rapide</div>
        {/* Intent 1-click */}
        <div className="grid grid-cols-3 gap-1.5">
          <Button size="sm" variant={lastIntent === "interested" ? "default" : "outline"} className="h-7 gap-1 px-1 text-[11px]"
            disabled={!contactId || intentPending} onClick={() => onSetIntent("interested")} title="Segna: Interessato">
            <ThumbsUp className="h-3 w-3" /> Sì
          </Button>
          <Button size="sm" variant={lastIntent === "out_of_office" ? "default" : "outline"} className="h-7 gap-1 px-1 text-[11px]"
            disabled={!contactId || intentPending} onClick={() => onSetIntent("out_of_office")} title="Segna: Non ora / fuori sede">
            <Clock className="h-3 w-3" /> Dopo
          </Button>
          <Button size="sm" variant={lastIntent === "not_interested" ? "default" : "outline"} className="h-7 gap-1 px-1 text-[11px]"
            disabled={!contactId || intentPending} onClick={() => onSetIntent("not_interested")} title="Segna: Non interessato">
            <ThumbsDown className="h-3 w-3" /> No
          </Button>
        </div>
        {/* Pausa/Riprendi + Converti + Sopprimi */}
        <div className="grid grid-cols-2 gap-1.5">
          {paused ? (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!contactId || busy}
              onClick={() => contactId && actions.resumeSequence.mutate(contactId)}>
              {actions.resumeSequence.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Riprendi
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!contactId || !liveSequence || busy}
              onClick={() => contactId && actions.pauseSequence.mutate(contactId)} title={liveSequence ? "Metti in pausa la sequenza" : "Nessuna sequenza attiva"}>
              {actions.pauseSequence.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} Pausa
            </Button>
          )}
          <OutreachConvertContactDialog
            companyId={companyId}
            trigger={
              <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 text-xs" disabled={!contactId}>
                <Briefcase className="h-3.5 w-3.5" /> Opportunità
              </Button>
            }
            initialContactId={contactId ?? undefined}
          />
        </div>
        <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 text-xs text-red-600 hover:text-red-700"
          disabled={!contactId || busy || context?.suppressed}
          onClick={() => contactId && actions.suppressContact.mutate({ contactId, email })}
          title={context?.suppressed ? "Già soppresso" : "Aggiungi alla blocklist e ferma la sequenza"}>
          {actions.suppressContact.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldBan className="h-3.5 w-3.5" />}
          {context?.suppressed ? "Già soppresso" : "Sopprimi (opt-out)"}
        </Button>
      </div>
    </aside>
  );
}

function InfoRow({ icon, value, label, mono }: { icon: React.ReactNode; value: string; label?: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      {label && <span className="shrink-0 text-[10px] uppercase">{label}:</span>}
      <span className={cn("min-w-0 truncate text-foreground", mono && "break-all font-mono text-[11px]")}>{value}</span>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/20 px-1.5 py-1.5">
      <div className={cn("font-semibold tabular-nums", small ? "text-[11px] leading-tight" : "text-base")}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
