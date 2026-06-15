import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Inbox, Mailbox, Mail, Search, ChevronLeft, MessageSquare, AlertTriangle, Building2,
  Send, Loader2, Wand2, CheckCheck, Archive, Layers, PanelRightOpen, PanelRightClose,
  User, Phone, Tag, ShieldBan, Pause, Play, ThumbsUp, ThumbsDown, Clock, Briefcase,
  Activity, ShieldCheck, Check, XCircle, Ban, MessageSquareReply, X, CalendarClock, GitBranch, Sparkles,
  AlarmClock, AlarmClockOff,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { MigrationGate } from "./_shared";
import { OutreachConvertContactDialog } from "./OutreachConvertContactDialog";
import {
  INTENT_META, ENROLLMENT_STATUS_META, type Conversation, type StatusFilter, type DateFilter,
  type SequenceOption, type LeadContext, type LeadSequence, type MsgDelivery, type AiSummary,
  type SnoozePreset, contactName, iniziali, relativeTime, fullTime, providerLabel, senderStatusColor,
  stripHtml, snoozeUntil,
  useOutreachConversations, useReplyComposer, useLeadContext, useLeadActions, isEnrollmentLive,
} from "./useOutreachConversations";
import { useReplySnippets, type ReplySnippet } from "./useReplySnippets";

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
/**
 * Altezza del client: riempie il viewport disponibile come un vero mail client
 * (header pagina + tab + padding ≈ 15rem di offset), con un pavimento usabile su
 * viewport corti. Le colonne (lista, thread, contesto) scrollano internamente; il
 * box risposta resta ancorato in fondo. Usata sia in loading sia a regime.
 */
const MAIL_CLIENT_HEIGHT = "h-[calc(100vh-15rem)] min-h-[520px]";

export function OutreachMailClient({ companyId }: { companyId: string }) {
  const {
    conversations, counts, sendersById, senders, unreadBySender, sequenceOptions,
    isLoading, errored, tableMissing,
    markRead, markAllRead, archiveRead, setIntent, snoozeConversation, unsnooze,
    filterConversations, signatureForSender,
  } = useOutreachConversations(companyId);
  const { replyText, setReplyText, sending, aiDrafting, sendReply, draftWithAi, summarizing, summarizeWithAi } = useReplyComposer(companyId);
  const snippets = useReplySnippets();

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [senderId, setSenderId] = useState<string | null>(null); // null = tutte le caselle
  const [sequenceId, setSequenceId] = useState<string | null>(null); // null = tutte le sequenze
  const [dateFilter, setDateFilter] = useState<DateFilter>("all"); // finestra ultima attività
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Selezione multipla per le azioni bulk mirate. Resettata al cambio di QUALSIASI
  // filtro/casella negli handler (niente setState-in-effect): le righe selezionate
  // potrebbero uscire dalla lista filtrata, evitiamo di operare su conversazioni nascoste.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showListMobile, setShowListMobile] = useState(false); // overlay caselle su mobile
  // Override esplicito del pannello contesto lead: null = segue il default (aperto
  // se la conversazione ha un contatto collegato, chiuso se è solo un'email sciolta).
  // Si azzera al cambio conversazione negli handler (niente setState-in-effect).
  const [contextOverride, setContextOverride] = useState<boolean | null>(null);

  const filtered = useMemo(
    () => filterConversations(conversations, filter, search, senderId, sequenceId, dateFilter),
    [conversations, filter, search, senderId, sequenceId, dateFilter, filterConversations],
  );

  const selected = useMemo(
    () => conversations.find((c) => c.key === selectedKey) ?? null,
    [conversations, selectedKey],
  );

  // Contesto aperto di default solo quando c'è un lead vero collegato: per le email
  // verso indirizzi non in rubrica il pannello resterebbe vuoto ("Nessun contatto")
  // e schiaccerebbe il thread, quindi parte chiuso. Il toggle resta sempre disponibile.
  const showContext = contextOverride ?? Boolean(selected?.contact);
  // Con il contesto aperto su desktop la colonna "Caselle" collassa nel selettore
  // compatto (come sotto lg), restituendo larghezza al thread di lettura.
  const mailboxColumnVisible = !showContext;

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

  // ── Selezione multipla (derivata sulla lista FILTRATA corrente) ──
  // Conta solo le righe selezionate ancora presenti nel filtro, così la barra
  // azioni non mente se un filtro ne ha nascoste alcune nel frattempo.
  const filteredSelectedKeys = useMemo(
    () => filtered.filter((c) => selectedKeys.has(c.key)).map((c) => c.key),
    [filtered, selectedKeys],
  );
  const selectedCount = filteredSelectedKeys.length;
  const allFilteredSelected = filtered.length > 0 && selectedCount === filtered.length;

  // contactId delle conversazioni selezionate (solo quelle con contatto: le azioni
  // bulk agiscono per contact_id sulle risposte). Dedup difensivo.
  const selectedContactIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conv of filtered) {
      if (selectedKeys.has(conv.key) && conv.contact?.id) ids.add(conv.contact.id);
    }
    return [...ids];
  }, [filtered, selectedKeys]);

  const toggleSelected = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedKeys((prev) => {
      // Se sono già tutte selezionate (rispetto al filtro) → deseleziona tutto.
      const allKeys = filtered.map((c) => c.key);
      const everySelected = allKeys.length > 0 && allKeys.every((k) => prev.has(k));
      return everySelected ? new Set() : new Set(allKeys);
    });

  const clearSelection = () => setSelectedKeys(new Set());

  // Azioni bulk MIRATE: riusano le mutazioni del hook passando i contactId
  // selezionati (le stesse usate per "tutte", estese per accettare un sottoinsieme).
  const bulkMarkRead = () => {
    if (selectedContactIds.length === 0) return;
    markAllRead.mutate(selectedContactIds, { onSuccess: () => clearSelection() });
  };
  const bulkArchive = () => {
    if (selectedContactIds.length === 0) return;
    archiveRead.mutate(selectedContactIds, { onSuccess: () => clearSelection() });
  };

  // Apre la conversazione e segna lette le risposte non lette (handler onClick:
  // niente setState-in-effect). Svuota la bozza al cambio conversazione.
  const handleSelect = (conv: Conversation) => {
    setSelectedKey(conv.key);
    setReplyText("");
    setShowListMobile(false);
    setContextOverride(null); // nuova conversazione → torna al default (contatto sì/no)
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
        setContextOverride(null); // cambio conversazione → default contesto
        if (next.unread && next.contact?.id) markRead.mutate(next.contact.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectedKey, markRead, setReplyText]);

  const selectSender = (id: string | null) => {
    setSenderId(id);
    setSelectedKey(null);
    setSelectedKeys(new Set()); // cambio casella → svuota la selezione multipla
    setShowListMobile(false);
  };

  // Handler dei filtri che, oltre a impostare lo stato, AZZERANO la selezione
  // multipla (le righe selezionate potrebbero uscire dalla lista filtrata).
  const changeFilter = (f: StatusFilter) => { setFilter(f); setSelectedKeys(new Set()); };
  const changeSequence = (id: string | null) => { setSequenceId(id); setSelectedKeys(new Set()); };
  const changeDate = (d: DateFilter) => { setDateFilter(d); setSelectedKeys(new Set()); };

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
      <div className={cn(MAIL_CLIENT_HEIGHT, "flex overflow-hidden rounded-xl border bg-card")}>
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
    // overflow-x-auto: se a viewport stretti i floor delle colonne (conversazioni +
    // thread + contesto) non entrano, scorre in orizzontale invece di schiacciare il
    // thread. Verticale resta clippato per mantenere il bordo arrotondato.
    <div className={cn(MAIL_CLIENT_HEIGHT, "flex overflow-x-auto overflow-y-hidden rounded-xl border bg-card")}>
      {/* ═══ Pannello caselle & filtri (sinistra) ═══ */}
      {/* A ≥lg si mostra solo quando il contesto lead è chiuso: con il contesto aperto
          collassa nel selettore compatto in cima alla lista, lasciando spazio al thread. */}
      <aside className={cn(
        "hidden w-[230px] shrink-0 flex-col border-r bg-background",
        mailboxColumnVisible && "lg:flex",
      )}>
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
        <div className="space-y-2 border-t p-2">
          <FilterPills filter={filter} counts={counts} onChange={changeFilter} />
          <ConversationFacets
            sequenceOptions={sequenceOptions}
            sequenceId={sequenceId}
            onSequence={changeSequence}
            dateFilter={dateFilter}
            onDate={changeDate}
          />
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

          {/* Filtri stato — visibili quando il pannello caselle è nascosto (mobile/tablet,
              o desktop col contesto lead aperto che ne collassa la colonna). */}
          <div className={cn("mt-2 space-y-2", mailboxColumnVisible && "lg:hidden")}>
            <FilterPills filter={filter} counts={counts} onChange={changeFilter} />
            <ConversationFacets
              sequenceOptions={sequenceOptions}
              sequenceId={sequenceId}
              onSequence={changeSequence}
              dateFilter={dateFilter}
              onDate={changeDate}
            />
          </div>

          {/* Selettore casella compatto: idem, sostituisce la colonna caselle quando nascosta. */}
          <div className={cn("mt-2", mailboxColumnVisible && "lg:hidden")}>
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

          {/* Azioni "su tutte" — nascoste quando c'è una selezione multipla attiva
              (in quel caso comanda la barra azioni mirata sotto). */}
          {selectedCount === 0 && (counts.unread > 0 || counts.read > 0) && (
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

          {/* Seleziona tutte (filtrate) + barra azioni mirata sulla selezione. */}
          {filtered.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-muted-foreground">
                <Checkbox
                  checked={allFilteredSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Seleziona tutte le conversazioni filtrate"
                />
                {selectedCount > 0 ? `${selectedCount} selezionate` : "Seleziona tutte"}
              </label>
            </div>
          )}

          {selectedCount > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 p-1.5">
              <Button
                size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
                disabled={markAllRead.isPending || selectedContactIds.length === 0}
                onClick={bulkMarkRead}
                title={selectedContactIds.length === 0
                  ? "Le conversazioni selezionate non hanno un contatto collegato"
                  : "Segna lette le risposte delle conversazioni selezionate"}
              >
                {markAllRead.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                Segna lette
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
                disabled={archiveRead.isPending || selectedContactIds.length === 0}
                onClick={bulkArchive}
                title={selectedContactIds.length === 0
                  ? "Le conversazioni selezionate non hanno un contatto collegato"
                  : "Archivia le risposte lette delle conversazioni selezionate"}
              >
                {archiveRead.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                Archivia
              </Button>
              <Button
                size="sm" variant="ghost" className="h-7 gap-1 text-[11px] text-muted-foreground"
                onClick={clearSelection}
                title="Annulla la selezione"
              >
                <X className="h-3 w-3" /> Deseleziona
              </Button>
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
                const checked = selectedKeys.has(conv.key);
                return (
                  <li
                    key={conv.key}
                    className={cn(
                      "flex items-stretch transition-colors hover:bg-muted/60",
                      active && "bg-muted",
                      checked && "bg-primary/5",
                    )}
                  >
                    {/* Checkbox di selezione multipla — fuori dal <button> (HTML valido). */}
                    <div className="flex shrink-0 items-center pl-2.5">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSelected(conv.key)}
                        aria-label={`Seleziona conversazione con ${name}`}
                      />
                    </div>
                    <button
                      onClick={() => handleSelect(conv)}
                      className="flex min-w-0 flex-1 gap-3 py-2.5 pl-2.5 pr-3 text-left"
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
                          {conv.snoozedUntil ? (
                            <Badge variant="outline" className="shrink-0 gap-1 border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                              <AlarmClock className="h-2.5 w-2.5" />{relativeTime(conv.snoozedUntil)}
                            </Badge>
                          ) : intentMeta && (
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
            {/* Floor di larghezza del thread su desktop: col contesto lead aperto non
                deve mai comprimersi fino a "una parola per riga". min-w-0 resta per lo
                stack mobile (ellissi); a ≥lg vince il floor e, se lo spazio non basta,
                è il contenitore dei pannelli a scorrere in orizzontale. */}
            <div className="flex min-w-0 flex-1 flex-col lg:min-w-[380px]">
              <ThreadPane
                selected={selected}
                mailbox={selected.primarySenderId ? sendersById.get(selected.primarySenderId) ?? null : null}
                signature={signatureForSender(selected.primarySenderId)}
                snippets={snippets}
                replyText={replyText}
                setReplyText={setReplyText}
                sending={sending}
                aiDrafting={aiDrafting}
                onSend={sendReply}
                onDraft={draftWithAi}
                onBack={() => setSelectedKey(null)}
                showContext={showContext}
                onToggleContext={() => setContextOverride(!showContext)}
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
                onClose={() => setContextOverride(false)}
                summarizing={summarizing}
                onSummarize={() => summarizeWithAi(selected.messages)}
                onUseDraft={(text) => setReplyText(text)}
                onSnooze={(until) => selected.contact?.id && snoozeConversation.mutate({ contactId: selected.contact.id, until })}
                onUnsnooze={() => selected.contact?.id && unsnooze.mutate({ contactId: selected.contact.id })}
                snoozePending={snoozeConversation.isPending || unsnooze.isPending}
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
  counts: { interested: number; unread: number; snoozed: number; archived: number };
  onChange: (f: StatusFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {([
        { k: "all", label: "Tutte" },
        { k: "interested", label: "Interessati", count: counts.interested },
        { k: "unread", label: "Non lette", count: counts.unread },
        { k: "snoozed", label: "Posticipate", count: counts.snoozed },
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

/* ──────────────────────────────────────────────────────────────────────────
   Faccette filtro: sequenza/campagna + finestra data sull'ultima attività.
   Due Select compatti shadcn. Il filtro sequenza scompare se non ci sono
   campagne filtrabili (nessuna sequenza attiva né con conversazioni).
   ────────────────────────────────────────────────────────────────────────── */
const ALL_SEQUENCES = "__all__";

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "Sempre" },
  { value: "today", label: "Oggi" },
  { value: "7d", label: "Ultimi 7 giorni" },
  { value: "30d", label: "Ultimi 30 giorni" },
];

function ConversationFacets({
  sequenceOptions, sequenceId, onSequence, dateFilter, onDate,
}: {
  sequenceOptions: SequenceOption[];
  sequenceId: string | null;
  onSequence: (id: string | null) => void;
  dateFilter: DateFilter;
  onDate: (d: DateFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sequenceOptions.length > 0 && (
        <Select
          value={sequenceId ?? ALL_SEQUENCES}
          onValueChange={(v) => onSequence(v === ALL_SEQUENCES ? null : v)}
        >
          <SelectTrigger className="h-7 w-auto min-w-[7.5rem] max-w-[12rem] gap-1.5 px-2 text-[11px]" aria-label="Filtra per sequenza">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Sequenza" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SEQUENCES} className="text-xs">Tutte le sequenze</SelectItem>
            {sequenceOptions.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={dateFilter} onValueChange={(v) => onDate(v as DateFilter)}>
        <SelectTrigger className="h-7 w-auto min-w-[6.5rem] gap-1.5 px-2 text-[11px]" aria-label="Filtra per data">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_FILTER_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ThreadPane({
  selected, mailbox, signature, snippets, replyText, setReplyText, sending, aiDrafting, onSend, onDraft, onBack,
  showContext, onToggleContext,
}: {
  selected: Conversation;
  mailbox: { email: string; provider: string } | null;
  /** Firma del brand della casella (per l'inserimento rapido), o null. */
  signature: string | null;
  snippets: ReturnType<typeof useReplySnippets>;
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
  // Ref alla textarea per l'inserimento snippet/firma al cursore.
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Inserisce testo alla posizione del cursore (o in coda) e riposiziona il caret.
  const insertAtCursor = (text: string) => {
    const el = replyRef.current;
    if (!el) { setReplyText(replyText ? `${replyText}\n${text}` : text); return; }
    const start = el.selectionStart ?? replyText.length;
    const end = el.selectionEnd ?? replyText.length;
    const before = replyText.slice(0, start);
    const after = replyText.slice(end);
    // Spaziatura naturale: se c'è già testo prima senza a-capo, separane con \n.
    const sep = before && !before.endsWith("\n") && !before.endsWith(" ") ? "\n" : "";
    const next = `${before}${sep}${text}${after}`;
    setReplyText(next);
    // Riporta il focus e posiziona il caret dopo il testo inserito.
    requestAnimationFrame(() => {
      el.focus();
      const caret = (before + sep + text).length;
      el.setSelectionRange(caret, caret);
    });
  };

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
                    {/* Stato di consegna (solo inviate): dati reali da outreach_send_queue. */}
                    {out && m.delivery && <DeliveryBadge delivery={m.delivery} />}
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
          {/* Toolbar: risposte rapide + firma (inserimento 1-click al cursore). */}
          <div className="mb-1.5 flex items-center gap-1.5">
            <QuickRepliesMenu
              snippets={snippets}
              disabled={sending || aiDrafting}
              onInsert={insertAtCursor}
            />
            {signature && (
              <Button
                type="button" size="sm" variant="ghost"
                className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
                disabled={sending || aiDrafting}
                onClick={() => insertAtCursor(signatureToText(signature))}
                title="Inserisci la firma del brand"
              >
                <Tag className="h-3.5 w-3.5" /> Firma
              </Button>
            )}
          </div>
          <Textarea
            ref={replyRef}
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
  summarizing, onSummarize, onUseDraft, onSnooze, onUnsnooze, snoozePending,
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
  /** Riepilogo AI: loading + generatore (legge il thread) + inserimento bozza. */
  summarizing: boolean;
  onSummarize: () => Promise<AiSummary | null>;
  onUseDraft: (text: string) => void;
  /** Posticipa: snooze fino a `until` (ISO) / annulla / stato in corso. */
  onSnooze: (until: string) => void;
  onUnsnooze: () => void;
  snoozePending: boolean;
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

          {/* ── Riepilogo AI ── (solo quando c'è un thread da riassumere).
              key=conversation.key: il blocco si rimonta al cambio conversazione,
              azzerando il riepilogo precedente senza setState-in-effect. */}
          {conversation.messages.length > 0 && (
            <AiSummaryBlock
              key={conversation.key}
              summarizing={summarizing}
              onSummarize={onSummarize}
              onUseDraft={onUseDraft}
            />
          )}

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

        {/* Posticipa: nasconde la conversazione dalle viste normali fino all'ora scelta
            (la fa riapparire da sola). Funge anche da promemoria di follow-up. */}
        <SnoozeControl
          contactId={contactId}
          snoozedUntil={conversation.snoozedUntil}
          pending={snoozePending}
          onSnooze={onSnooze}
          onUnsnooze={onUnsnooze}
        />
      </div>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Posticipa (snooze) — menu con preset + Data… (calendario), o badge "Posticipata
   fino a …" con "Annulla posticipo" quando già attiva. Lo snooze stesso funge da
   promemoria: non esiste una tabella task adatta allo scope super-admin Outreach.
   ────────────────────────────────────────────────────────────────────────── */
function SnoozeControl({
  contactId, snoozedUntil, pending, onSnooze, onUnsnooze,
}: {
  contactId: string | null;
  snoozedUntil: string | null;
  pending: boolean;
  onSnooze: (until: string) => void;
  onUnsnooze: () => void;
}) {
  const [calOpen, setCalOpen] = useState(false);

  const presets: { preset: SnoozePreset; label: string }[] = [
    { preset: "3h", label: "Tra 3 ore" },
    { preset: "tomorrow", label: "Domani mattina" },
    { preset: "3d", label: "Tra 3 giorni" },
    { preset: "1w", label: "Tra 1 settimana" },
  ];

  // Già posticipata: mostra fino a quando + azioni per riportarla ora / annullare.
  if (snoozedUntil) {
    return (
      <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
          <AlarmClock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Posticipata fino a {fullTime(snoozedUntil)}</span>
        </div>
        <Button
          size="sm" variant="outline"
          className="h-7 w-full gap-1.5 text-[11px]"
          disabled={!contactId || pending}
          onClick={onUnsnooze}
          title="Riporta subito la conversazione nelle viste normali"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlarmClockOff className="h-3.5 w-3.5" />}
          Ripristina ora
        </Button>
      </div>
    );
  }

  // Non posticipata: menu preset + Data… (apre il calendario in un popover).
  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm" variant="outline"
            className="h-8 flex-1 gap-1.5 text-xs"
            disabled={!contactId || pending}
            title="Nascondi la conversazione fino a una data scelta (promemoria di follow-up)"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlarmClock className="h-3.5 w-3.5" />}
            Posticipa
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-[11px]">Posticipa a…</DropdownMenuLabel>
          {presets.map((p) => (
            <DropdownMenuItem
              key={p.preset}
              className="text-xs"
              onSelect={() => onSnooze(snoozeUntil(p.preset))}
            >
              <Clock className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> {p.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs" onSelect={(e) => { e.preventDefault(); setCalOpen(true); }}>
            <CalendarClock className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> Data…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Selettore data custom: posticipa alle 9:00 del giorno scelto (futuro). */}
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <span className="sr-only" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            initialFocus
            disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            onSelect={(d) => {
              if (!d) return;
              const at = new Date(d);
              at.setHours(9, 0, 0, 0);
              onSnooze(at.toISOString());
              setCalOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Riepilogo AI della conversazione (edge outreach-ai-summary).
   Bottone "Genera riepilogo" → frase di sintesi + hint intento + "Usa come bozza"
   che inserisce la risposta proposta nel box. Stato locale (summary/empty);
   loading e degrado con grazia (toast) li gestisce il composer condiviso.
   ────────────────────────────────────────────────────────────────────────── */
function AiSummaryBlock({
  summarizing, onSummarize, onUseDraft,
}: {
  summarizing: boolean;
  onSummarize: () => Promise<AiSummary | null>;
  onUseDraft: (text: string) => void;
}) {
  const [summary, setSummary] = useState<AiSummary | null>(null);
  // true dopo un tentativo andato a vuoto (200 con campi vuoti / errore): mostra
  // un micro-hint invece di lasciare il blocco identico a "mai generato".
  const [emptyTried, setEmptyTried] = useState(false);

  const generate = async () => {
    setEmptyTried(false);
    const res = await onSummarize();
    if (res) setSummary(res);
    else { setSummary(null); setEmptyTried(true); }
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Riepilogo AI
        </span>
        <Button
          size="sm" variant="ghost"
          className="h-6 gap-1 px-1.5 text-[11px] text-primary hover:text-primary"
          disabled={summarizing}
          onClick={() => void generate()}
          title="L'AI legge la conversazione e ne sintetizza stato, intento e una bozza di risposta"
        >
          {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {summarizing ? "Genero…" : summary ? "Rigenera" : "Genera riepilogo"}
        </Button>
      </div>

      {!summary && !summarizing && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {emptyTried
            ? "Riepilogo non disponibile al momento — riprova."
            : "Sintesi della conversazione, intento e bozza di risposta in un colpo solo."}
        </p>
      )}

      {summary && (
        <div className="mt-2 space-y-2">
          <p className="text-xs leading-relaxed text-foreground">{summary.summary}</p>
          {summary.intentHint && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Activity className="h-3 w-3 shrink-0" />
              <span className="truncate">{summary.intentHint}</span>
            </div>
          )}
          {summary.suggestedReply && (
            <div className="rounded-md border bg-background/70 p-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bozza proposta</div>
              <p className="whitespace-pre-wrap break-words text-[11px] text-foreground">{summary.suggestedReply}</p>
              <Button
                size="sm" variant="outline"
                className="mt-2 h-7 w-full gap-1.5 text-[11px]"
                onClick={() => onUseDraft(summary.suggestedReply)}
                title="Inserisci questa bozza nel box risposta"
              >
                <MessageSquareReply className="h-3.5 w-3.5" /> Usa come bozza
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
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

/* ──────────────────────────────────────────────────────────────────────────
   Stato di consegna per messaggio inviato — ONESTO.
   L'Outreach Engine NON traccia aperture/click/bounce per messaggio (quel
   tracking vive su email_logs lato campagne). Qui mappiamo SOLO i dati reali di
   outreach_send_queue.status: 'sent' = consegnata alla casella/provider; gli
   stati non riusciti (failed/skipped/cancelled) si mostrano onestamente. Niente
   "Aperta"/"Cliccata" inventate.
   ────────────────────────────────────────────────────────────────────────── */
const DELIVERY_META: Record<MsgDelivery["state"], { label: string; cls: string; icon: typeof Check } | null> = {
  // 'sent' nell'Outreach Engine = consegnata al provider d'invio (handoff ok).
  sent: { label: "Consegnata", cls: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: Check },
  queued: { label: "In coda", cls: "border-slate-200 bg-slate-50 text-slate-600", icon: Clock },
  sending: { label: "In invio", cls: "border-blue-200 bg-blue-50 text-blue-700", icon: Loader2 },
  failed: { label: "Non inviata", cls: "border-red-200 bg-red-50 text-red-700", icon: XCircle },
  skipped: { label: "Saltata", cls: "border-amber-200 bg-amber-50 text-amber-700", icon: Ban },
  cancelled: { label: "Annullata", cls: "border-slate-200 bg-slate-50 text-slate-500", icon: Ban },
  unknown: null,
};

function DeliveryBadge({ delivery }: { delivery: MsgDelivery }) {
  const meta = DELIVERY_META[delivery.state];
  if (!meta) return null;
  const Icon = meta.icon;
  const when = fullTime(delivery.sentAt);
  // Tooltip: timestamp invio + eventuale errore/tentativi (dati reali).
  const tip = [
    meta.label + (when ? ` · ${when}` : ""),
    delivery.error ? `Dettaglio: ${delivery.error}` : null,
    delivery.attempts && delivery.attempts > 1 ? `Tentativi: ${delivery.attempts}` : null,
  ].filter(Boolean).join("\n");
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn("ml-1 gap-0.5 px-1 py-0 text-[9px] font-medium normal-case", meta.cls)}
          >
            <Icon className={cn("h-2.5 w-2.5", delivery.state === "sending" && "animate-spin")} />
            {meta.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] whitespace-pre-line text-[11px]">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Firma brand → testo per la textarea (le firme sono HTML, qui le linearizziamo). */
function signatureToText(sig: string): string {
  // Mantiene gli a-capo dei <br>/</p> prima di togliere il resto dei tag.
  const withBreaks = sig.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  const text = stripHtml(withBreaks);
  return text.trim();
}

/* ──────────────────────────────────────────────────────────────────────────
   Risposte rapide (snippet) — popover con inserimento 1-click + gestione.
   ────────────────────────────────────────────────────────────────────────── */
function QuickRepliesMenu({
  snippets, disabled, onInsert,
}: {
  snippets: ReturnType<typeof useReplySnippets>;
  disabled?: boolean;
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newText, setNewText] = useState("");

  const pick = (s: ReplySnippet) => {
    onInsert(s.text);
    setOpen(false);
  };

  const addSnippet = () => {
    snippets.add(newLabel, newText);
    setNewLabel("");
    setNewText("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button" size="sm" variant="ghost"
          className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
          disabled={disabled}
          title="Inserisci una risposta rapida"
        >
          <MessageSquareReply className="h-3.5 w-3.5" /> Risposte rapide
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-semibold">Risposte rapide</span>
          <Button
            type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
            onClick={() => setManaging((v) => !v)}
          >
            {managing ? "Fine" : "Gestisci"}
          </Button>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {snippets.snippets.map((s) => (
            <div key={s.id} className="group flex items-start gap-1 rounded-md px-1 hover:bg-muted/60">
              <button
                type="button"
                onClick={() => pick(s)}
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-1.5 py-1.5 text-left"
                title="Inserisci nel testo"
              >
                <span className="text-xs font-medium">{s.label}</span>
                <span className="line-clamp-2 text-[11px] text-muted-foreground">{s.text}</span>
              </button>
              {managing && !s.builtin && (
                <Button
                  type="button" size="icon" variant="ghost"
                  className="mt-1 h-6 w-6 shrink-0 text-muted-foreground hover:text-red-600"
                  onClick={() => snippets.remove(s.id)}
                  title="Elimina snippet"
                  aria-label={`Elimina ${s.label}`}
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {managing && (
          <div className="space-y-1.5 border-t p-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Etichetta (es. Saluto)"
              className="h-7 text-xs"
            />
            <Textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Testo dello snippet…"
              rows={2}
              className="resize-none text-xs"
            />
            <Button
              type="button" size="sm" className="h-7 w-full gap-1.5 text-[11px]"
              disabled={!newLabel.trim() || !newText.trim()}
              onClick={addSnippet}
            >
              Aggiungi snippet
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
