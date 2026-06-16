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
  AlarmClock, AlarmClockOff, Eye, PenSquare, ChevronDown, ChevronRight, Gauge, Globe, Flame,
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
import { OutreachNewMailDialog } from "./OutreachNewMailDialog";
import {
  INTENT_META, ENROLLMENT_STATUS_META, type Conversation, type StatusFilter, type DateFilter,
  type SequenceOption, type LeadContext, type LeadSequence, type MsgDelivery, type AiSummary,
  type SnoozePreset, type SenderRow, type ThreadMsg, contactName, iniziali, relativeTime, fullTime,
  providerLabel, senderStatusColor, stripHtml, snoozeUntil,
  useOutreachConversations, useReplyComposer, useLeadContext, useLeadActions, isEnrollmentLive,
} from "./useOutreachConversations";
import { useReplySnippets, type ReplySnippet } from "./useReplySnippets";
import { avatarTint } from "./outreachAvatar";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { isMissingColumnError } from "./_shared";

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
const MAIL_CLIENT_HEIGHT = "h-[calc(100vh-13rem)] min-h-[560px]";

/* ──────────────────────────────────────────────────────────────────────────
   Pannello Caselle A SCALA — helper di presentazione (puri) + capacità pool.
   Pensato per 100+ caselle su più domini: raggruppamento per dominio,
   ricerca, riepilogo pool con capacità giornaliera stimata ONESTA.
   ────────────────────────────────────────────────────────────────────────── */

/** Dominio di una casella (parte dopo la @, minuscola). "—" se non parsabile. */
function senderDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "—";
}

/** Un dominio con le sue caselle, per il raggruppamento collassabile. */
interface DomainGroup {
  domain: string;
  senders: SenderRow[];
  /** Caselle non lette (somma) del gruppo, per il badge sull'header dominio. */
  unread: number;
}

/**
 * Raggruppa le caselle per dominio (dopo il filtro di ricerca). Ordina i domini
 * per nome; dentro ogni dominio le caselle restano nell'ordine sorgente (email).
 * Logica pura → testabile e niente lavoro in render oltre il memo del chiamante.
 */
function groupSendersByDomain(
  senders: SenderRow[],
  unreadBySender: Map<string, number>,
): DomainGroup[] {
  const map = new Map<string, DomainGroup>();
  for (const s of senders) {
    const domain = senderDomain(s.email);
    let g = map.get(domain);
    if (!g) { g = { domain, senders: [], unread: 0 }; map.set(domain, g); }
    g.senders.push(s);
    g.unread += unreadBySender.get(s.id) ?? 0;
  }
  return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain, "it"));
}

/** Etichetta di stato casella per il riepilogo (attiva/warming/in pausa/spenta). */
const SENDER_STATE_BUCKET = (status: string): "active" | "warming" | "other" =>
  status === "active" ? "active" : status === "warming" ? "warming" : "other";

/** Capacità giornaliera (warmup-aware) di una casella, identica al Pool mittenti. */
const CAP_BASE = 5;
const CAP_STEP = 5;
function senderDailyCap(row: { daily_cap_target: number | null; warmup_day: number | null }): number {
  const target = row.daily_cap_target ?? 0;
  const warm = CAP_BASE + (row.warmup_day ?? 0) * CAP_STEP;
  return Math.max(0, Math.min(target || warm, warm));
}

interface SenderCapacityRow {
  id: string;
  daily_cap_target: number | null;
  warmup_day: number | null;
  daily_sent: number | null;
}

export interface PoolCapacity {
  /** Capacità giornaliera stimata = somma dei cap warmup-aware delle caselle attive/warming. */
  dailyCap: number;
  /** Email già spedite oggi (somma daily_sent), per il residuo. */
  sentToday: number;
  /** Capacità residua oggi = max(0, dailyCap - sentToday). */
  remaining: number;
  /** True finché i dati cap non sono disponibili (loading o colonne assenti). */
  unavailable: boolean;
}

/**
 * useSenderCapacity — capacità giornaliera ONESTA del pool, in una query mirata
 * e SELF-CONTAINED (non tocca useOutreachConversations): legge solo i campi cap
 * di outreach_sender_accounts e somma il cap warmup-aware delle caselle che
 * spediscono (active/warming). Best-effort: se le colonne non esistono (migrazione
 * pool non applicata) torna `unavailable` e il riepilogo mostra solo i conteggi.
 */
function useSenderCapacity(companyId: string): PoolCapacity {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const q = useQuery({
    queryKey: ["outreach-inbox-sender-capacity", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from("outreach_sender_accounts")
        .select("id,status,daily_cap_target,warmup_day,daily_sent")
        .eq("company_id", companyId);
      if (error) {
        if (isMissingColumnError(error)) return null; // colonne cap assenti → degrado soft
        throw error;
      }
      return (data ?? []) as Array<SenderCapacityRow & { status: string }>;
    },
  });

  return useMemo<PoolCapacity>(() => {
    const rows = q.data;
    if (!rows) return { dailyCap: 0, sentToday: 0, remaining: 0, unavailable: true };
    let dailyCap = 0;
    let sentToday = 0;
    for (const r of rows) {
      // Solo le caselle che spediscono concorrono alla capacità (le spente no).
      if (r.status === "active" || r.status === "warming") dailyCap += senderDailyCap(r);
      sentToday += r.daily_sent ?? 0;
    }
    return { dailyCap, sentToday, remaining: Math.max(0, dailyCap - sentToday), unavailable: false };
  }, [q.data]);
}

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
  const [mailboxSearch, setMailboxSearch] = useState(""); // filtro caselle per email/dominio
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

  // ── Virtualizzazione lista conversazioni (a scala: migliaia di thread) ──
  // Solo le righe visibili sono montate. Altezza variabile (riga con/senza azienda,
  // casella, badge) → measureElement; stima 84px ≈ riga media. Lo scaffold sotto
  // (J/K, selezione, checkbox bulk, filtri) resta invariato: opera su `filtered`.
  const convScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => convScrollRef.current,
    estimateSize: () => 84,
    overscan: 10,
    getItemKey: (index) => filtered[index]?.key ?? index,
  });
  // Ref sempre aggiornato al virtualizer corrente: permette a handler con dipendenze
  // stabili (J/K) di chiamare scrollToIndex senza ri-registrarsi a ogni render.
  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;

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

  // ── Caselle a scala: capacità pool + ricerca + raggruppamento per dominio ──
  // Capacità giornaliera stimata (query mirata, non tocca il hook conversazioni).
  const capacity = useSenderCapacity(companyId);
  // Filtro caselle per email/dominio (case-insensitive), poi raggruppo per dominio.
  const mailboxQuery = mailboxSearch.trim().toLowerCase();
  const filteredSenders = useMemo(
    () => (mailboxQuery
      ? senders.filter((s) => s.email.toLowerCase().includes(mailboxQuery))
      : senders),
    [senders, mailboxQuery],
  );
  const domainGroups = useMemo(
    () => groupSendersByDomain(filteredSenders, unreadBySender),
    [filteredSenders, unreadBySender],
  );
  // Riepilogo conteggi pool (sul totale caselle, non filtrato): attive/warming/totale.
  const poolSummary = useMemo(() => {
    let active = 0, warming = 0;
    for (const s of senders) {
      const b = SENDER_STATE_BUCKET(s.status);
      if (b === "active") active++;
      else if (b === "warming") warming++;
    }
    return { total: senders.length, active, warming, domains: new Set(senders.map((s) => senderDomain(s.email))).size };
  }, [senders]);

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
      // La lista è virtualizzata: porta la riga selezionata in viewport (potrebbe non
      // essere montata). 'auto' = scrolla solo se fuori vista, niente salti inutili.
      rowVirtualizerRef.current.scrollToIndex(nextIdx, { align: "auto" });
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
      <div className={cn(MAIL_CLIENT_HEIGHT, "flex overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm")}>
        <div className="hidden w-[268px] shrink-0 space-y-2 border-r border-border bg-background p-3 lg:block">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-8 w-full rounded-lg" />
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
        <div className="w-full space-y-1 border-r border-border bg-background p-3 md:w-[360px]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg p-2.5">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3 rounded" /><Skeleton className="h-3 w-1/2 rounded" /></div>
            </div>
          ))}
        </div>
        <div className="hidden flex-1 items-center justify-center bg-muted/30 md:flex">
          <Skeleton className="h-44 w-2/3 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (errored) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
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
    <div className={cn(MAIL_CLIENT_HEIGHT, "flex overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-muted/30 shadow-sm")}>
      {/* ═══ Pannello caselle & filtri (sinistra) ═══ */}
      {/* A ≥lg si mostra solo quando il contesto lead è chiuso: con il contesto aperto
          collassa nel selettore compatto in cima alla lista, lasciando spazio al thread. */}
      <aside className={cn(
        "hidden w-[268px] shrink-0 flex-col border-r border-border bg-background",
        mailboxColumnVisible && "lg:flex",
      )}>
        <div className="flex items-center gap-2 px-3 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mailbox className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight">Caselle</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {poolSummary.total > 0
                ? `${poolSummary.total} ${poolSummary.total === 1 ? "casella" : "caselle"} · ${poolSummary.domains} domin${poolSummary.domains === 1 ? "io" : "i"}`
                : "Filtra per mittente"}
            </p>
          </div>
        </div>

        {/* Ricerca caselle (email/dominio) — pensata per liste lunghe (100+). */}
        {senders.length > 0 && (
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={mailboxSearch}
                onChange={(e) => setMailboxSearch(e.target.value)}
                placeholder="Cerca casella o dominio…"
                aria-label="Cerca casella"
                className="h-8 rounded-lg border-border bg-muted/40 pl-8 pr-7 text-[12px] shadow-none focus-visible:bg-background"
              />
              {mailboxSearch && (
                <button
                  type="button"
                  onClick={() => setMailboxSearch("")}
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Pulisci ricerca caselle"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="space-y-0.5 px-2 pb-2">
            {/* "Tutte le caselle" resta in cima come selezione globale. */}
            <MailboxButton
              active={senderId === null}
              onClick={() => selectSender(null)}
              icon={<Layers className="h-4 w-4" />}
              title="Tutte le caselle"
              count={counts.unread || undefined}
              countTone="primary"
            />
            {senders.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Mailbox className="h-4 w-4" />
                </span>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Nessuna casella configurata. Aggiungile in <span className="font-medium text-foreground">Deliverability → Pool mittenti</span>.
                </p>
              </div>
            ) : domainGroups.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[11px] text-muted-foreground">
                Nessuna casella corrisponde a “{mailboxSearch}”.
              </p>
            ) : (
              <div className="mt-1 space-y-0.5">
                {domainGroups.map((g) => (
                  <DomainGroupBlock
                    key={g.domain}
                    group={g}
                    activeSenderId={senderId}
                    convCountBySender={convCountBySender}
                    unreadBySender={unreadBySender}
                    onSelect={selectSender}
                    /* Con una ricerca attiva tutti i gruppi partono espansi (l'utente
                       sta filtrando, vuole vedere i match). */
                    defaultOpen={!!mailboxQuery || domainGroups.length <= 4}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Riepilogo pool: riempie utilmente il fondo colonna anche con poche caselle. */}
        {senders.length > 0 && (
          <PoolSummaryCard summary={poolSummary} capacity={capacity} unreadTotal={counts.unread} />
        )}

        <div className="space-y-2.5 border-t border-border bg-muted/30 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Filtri</div>
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
        "flex w-full flex-col border-r border-border bg-background md:w-[360px] md:min-w-[320px]",
        selected ? "hidden md:flex" : "flex",
      )}>
        <div className="space-y-2.5 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Inbox className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold leading-tight">Conversazioni</h2>
            {counts.unread > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
                {counts.unread}
              </span>
            )}
            {/* Hint scorciatoie tastiera (solo desktop). */}
            <span
              className="ml-auto hidden cursor-help select-none rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline"
              title="Scorciatoie · J/K: conversazione successiva/precedente · ⌘/Ctrl+Invio: invia la risposta"
            >J / K</span>
            {/* Compositore "Nuova email" a freddo (manuale). ml-auto se l'hint J/K è nascosto. */}
            <OutreachNewMailDialog
              companyId={companyId}
              trigger={
                <Button size="sm" className="ml-auto h-7 gap-1.5 rounded-lg text-[11px] lg:ml-1.5">
                  <PenSquare className="h-3.5 w-3.5" /> Nuova email
                </Button>
              }
            />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca nome o email…"
              aria-label="Cerca conversazione"
              className="h-9 rounded-lg border-border bg-muted/40 pl-9 text-sm shadow-none focus-visible:bg-background"
            />
          </div>

          {/* Filtri stato — visibili quando il pannello caselle è nascosto (mobile/tablet,
              o desktop col contesto lead aperto che ne collassa la colonna). */}
          <div className={cn("space-y-2", mailboxColumnVisible && "lg:hidden")}>
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
          <div className={cn(mailboxColumnVisible && "lg:hidden")}>
            <button
              type="button"
              onClick={() => setShowListMobile((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left text-[11px] transition-colors hover:bg-muted/70"
            >
              <Mailbox className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate font-medium">{activeSender ? activeSender.email : "Tutte le caselle"}</span>
              <span className="text-muted-foreground">cambia</span>
            </button>
            {showListMobile && (
              <div className="mt-1 rounded-lg border border-border bg-background p-1.5 shadow-sm">
                {senders.length > 5 && (
                  <div className="relative px-0.5 pb-1.5">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={mailboxSearch}
                      onChange={(e) => setMailboxSearch(e.target.value)}
                      placeholder="Cerca casella o dominio…"
                      aria-label="Cerca casella"
                      className="h-8 rounded-md border-border bg-muted/40 pl-8 text-[12px] shadow-none"
                    />
                  </div>
                )}
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                  <MailboxButton active={senderId === null} onClick={() => selectSender(null)} icon={<Layers className="h-4 w-4" />} title="Tutte le caselle" count={counts.unread || undefined} countTone="primary" />
                  {domainGroups.map((g) => (
                    <DomainGroupBlock
                      key={g.domain}
                      group={g}
                      activeSenderId={senderId}
                      convCountBySender={convCountBySender}
                      unreadBySender={unreadBySender}
                      onSelect={selectSender}
                      defaultOpen
                    />
                  ))}
                  {domainGroups.length === 0 && (
                    <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">Nessuna casella trovata.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Azioni "su tutte" — nascoste quando c'è una selezione multipla attiva
              (in quel caso comanda la barra azioni mirata sotto). */}
          {selectedCount === 0 && (counts.unread > 0 || counts.read > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {counts.unread > 0 && (
                <Button
                  size="sm" variant="outline" className="h-7 gap-1.5 rounded-lg border-border text-[11px] shadow-none"
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
                  size="sm" variant="outline" className="h-7 gap-1.5 rounded-lg border-border text-[11px] shadow-none"
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
          {filtered.length > 0 && selectedCount === 0 && (
            <label className="flex cursor-pointer select-none items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <Checkbox
                checked={false}
                onCheckedChange={toggleSelectAll}
                aria-label="Seleziona tutte le conversazioni filtrate"
              />
              Seleziona tutte
            </label>
          )}

          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] p-1.5">
              <label className="flex cursor-pointer select-none items-center gap-1.5 pl-1 pr-1 text-[11px] font-semibold text-primary">
                <Checkbox
                  checked={allFilteredSelected ? true : "indeterminate"}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Seleziona tutte le conversazioni filtrate"
                />
                {selectedCount} sel.
              </label>
              <span className="h-4 w-px bg-primary/20" aria-hidden />
              <Button
                size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px] hover:bg-primary/10"
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
                size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px] hover:bg-primary/10"
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
                size="sm" variant="ghost" className="ml-auto h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:bg-primary/10"
                onClick={clearSelection}
                title="Annulla la selezione"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          // Empty-state centrato verticalmente (riempie la colonna, niente metà bianca).
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="h-5 w-5" />
            </span>
            <p className="max-w-[230px] text-sm text-muted-foreground">
              {conversations.length === 0
                ? "Nessuna conversazione ancora. Le email inviate e le risposte compaiono qui."
                : activeSender
                  ? "Nessuna conversazione per questa casella e questo filtro."
                  : "Nessuna conversazione per questo filtro."}
            </p>
            {conversations.length > 0 && (filter !== "all" || !!search || !!senderId) && (
              <Button
                variant="ghost" size="sm"
                className="mt-3 h-7 gap-1.5 text-[11px] text-muted-foreground"
                onClick={() => { changeFilter("all"); setSearch(""); selectSender(null); }}
              >
                <X className="h-3 w-3" /> Azzera filtri
              </Button>
            )}
          </div>
        ) : (
          // Lista virtualizzata: scroll parent nativo + righe assolute misurate.
          <div ref={convScrollRef} className="flex-1 overflow-y-auto p-2">
            <ul
              className="relative"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const conv = filtered[vRow.index];
                return (
                  <ConversationRow
                    key={vRow.key}
                    conv={conv}
                    active={conv.key === selectedKey}
                    checked={selectedKeys.has(conv.key)}
                    mailbox={conv.primarySenderId ? sendersById.get(conv.primarySenderId) ?? null : null}
                    onSelect={() => handleSelect(conv)}
                    onToggle={() => toggleSelected(conv.key)}
                    dataIndex={vRow.index}
                    measureRef={rowVirtualizer.measureElement}
                    offsetTop={vRow.start}
                  />
                );
              })}
            </ul>
          </div>
        )}
      </aside>

      {/* ═══ Thread + risposta (destra) ═══ */}
      <section
        key={selectedKey ?? "vuota"}
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-muted/30",
          selected ? "flex max-md:animate-in max-md:slide-in-from-right-4 max-md:fade-in-0 max-md:duration-200" : "hidden md:flex",
        )}
      >
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div className="max-w-xs">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm ring-1 ring-border">
                <MessageSquare className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium text-foreground">Seleziona una conversazione</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Le email inviate appaiono a destra, le risposte a sinistra. Usa <kbd className="rounded border border-border bg-background px-1 text-[10px] font-medium shadow-sm">J</kbd> / <kbd className="rounded border border-border bg-background px-1 text-[10px] font-medium shadow-sm">K</kbd> per spostarti tra le conversazioni.
              </p>
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
                onSend={() => sendReply(
                  selected.contact?.id
                    ? { contactId: selected.contact.id }
                    : { toEmail: selected.email, senderId: selected.primarySenderId },
                )}
                onDraft={() => draftWithAi(
                  selected.contact?.id
                    ? { contactId: selected.contact.id }
                    : { messages: selected.messages },
                )}
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
    <Badge className="ml-1.5 h-4 min-w-4 justify-center bg-primary px-1 text-[10px] tabular-nums">
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
  /** Conversazioni non lette della casella → pillola accent prioritaria. */
  unread?: number;
  countTone?: "muted" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
        active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted/70",
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground group-hover:text-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {badge && (
        <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{badge}</span>
      )}
      {unread != null && unread > 0 ? (
        <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground" title={`${unread} non lette`}>{unread}</span>
      ) : count != null && count > 0 ? (
        <span className={cn(
          "shrink-0 rounded-full px-1.5 text-[10px] font-medium tabular-nums",
          countTone === "primary" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}>{count}</span>
      ) : null}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   DomainGroupBlock — header di dominio collassabile + caselle indentate.
   Scala a molti domini/caselle: l'header mostra dominio, n° caselle e un badge
   non-lette aggregato; cliccando si espande/collassa. Ogni casella è una riga
   compatta con dot stato + provider + non-lette (riusa MailboxButton, indentato).
   Stato open LOCALE (niente setState-in-effect): defaultOpen lo decide il parent.
   ────────────────────────────────────────────────────────────────────────── */
function DomainGroupBlock({
  group, activeSenderId, convCountBySender, unreadBySender, onSelect, defaultOpen,
}: {
  group: DomainGroup;
  activeSenderId: string | null;
  convCountBySender: Map<string, number>;
  unreadBySender: Map<string, number>;
  onSelect: (id: string | null) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // La casella selezionata è in questo dominio → evidenzia l'header anche da chiuso.
  const hasActive = group.senders.some((s) => s.id === activeSenderId);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group/dom flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
          hasActive && !open && "bg-primary/[0.06]",
        )}
        aria-expanded={open}
        title={`${group.domain} · ${group.senders.length} ${group.senders.length === 1 ? "casella" : "caselle"}`}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <Globe className="h-3 w-3 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {group.domain}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {group.senders.length}
        </span>
        {group.unread > 0 && (
          <span
            className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground"
            title={`${group.unread} non lette in questo dominio`}
          >
            {group.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-0.5 pl-3">
          {group.senders.map((s) => (
            <MailboxButton
              key={s.id}
              active={activeSenderId === s.id}
              onClick={() => onSelect(s.id)}
              icon={<span className={cn("h-2 w-2 rounded-full", senderStatusColor(s.status))} title={s.status} />}
              title={s.email}
              badge={providerLabel(s.provider)}
              count={convCountBySender.get(s.id) || undefined}
              unread={unreadBySender.get(s.id) || undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   PoolSummaryCard — riepilogo compatto del pool in fondo alla colonna Caselle.
   Riempie utilmente lo spazio anche con poche caselle: capacità giornaliera
   stimata (warmup-aware, ONESTA), caselle attive/in warming, non-lette totali.
   La capacità degrada con grazia se le colonne cap non sono disponibili.
   ────────────────────────────────────────────────────────────────────────── */
function PoolSummaryCard({
  summary, capacity, unreadTotal,
}: {
  summary: { total: number; active: number; warming: number; domains: number };
  capacity: PoolCapacity;
  unreadTotal: number;
}) {
  const capPct = capacity.dailyCap > 0
    ? Math.min(100, Math.round((capacity.sentToday / capacity.dailyCap) * 100))
    : 0;
  return (
    <div className="space-y-2 border-t border-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Gauge className="h-3.5 w-3.5" /> Pool
      </div>
      {/* Stato caselle: attive · warming · non-lette. */}
      <div className="grid grid-cols-3 gap-1.5">
        <PoolStat icon={<ShieldCheck className="h-3 w-3 text-emerald-600" />} value={summary.active} label="Attive" />
        <PoolStat icon={<Flame className="h-3 w-3 text-amber-600" />} value={summary.warming} label="Warming" />
        <PoolStat icon={<Mail className="h-3 w-3 text-primary" />} value={unreadTotal} label="Da leggere" tone={unreadTotal > 0 ? "primary" : "muted"} />
      </div>
      {/* Capacità giornaliera stimata (somma cap warmup-aware) + uso odierno. */}
      {!capacity.unavailable && capacity.dailyCap > 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Capacità/giorno</span>
            <span className="text-[11px] font-semibold tabular-nums text-foreground">
              {capacity.remaining}<span className="font-normal text-muted-foreground">/{capacity.dailyCap}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", capPct >= 100 ? "bg-amber-500" : "bg-primary")}
              style={{ width: `${capPct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {capacity.sentToday > 0 ? `${capacity.sentToday} inviate oggi · ` : ""}
            {capacity.remaining} email residue
          </p>
        </div>
      ) : (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {summary.total} {summary.total === 1 ? "casella" : "caselle"} su {summary.domains} domin{summary.domains === 1 ? "io" : "i"}.
        </p>
      )}
    </div>
  );
}

/** Mini-stat del riepilogo pool (icona + numero + etichetta). */
function PoolStat({
  icon, value, label, tone = "muted",
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone?: "muted" | "primary";
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-1 py-1.5 text-center">
      <div className="flex items-center justify-center gap-1">
        {icon}
        <span className={cn("text-sm font-semibold tabular-nums", tone === "primary" ? "text-primary" : "text-foreground")}>{value}</span>
      </div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
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
    <div className="flex flex-wrap items-center gap-1.5">
      {([
        { k: "all", label: "Tutte" },
        { k: "interested", label: "Interessati", count: counts.interested },
        { k: "unread", label: "Non lette", count: counts.unread },
        { k: "snoozed", label: "Posticipate", count: counts.snoozed },
        { k: "archived", label: "Archiviate", count: counts.archived },
      ] as const).map((f) => {
        const active = filter === f.k;
        return (
          <button
            key={f.k}
            type="button"
            onClick={() => onChange(f.k)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            {f.label}
            {"count" in f && f.count > 0 && (
              <span className={cn(
                "rounded-full px-1 text-[10px] tabular-nums",
                active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
              )}>{f.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   ConversationRow — riga premium della lista (stile Unibox Instantly/Smartlead).
   Avatar a tinta deterministica + dot non-letto, nome in evidenza, snippet a 1
   riga, ora relativa discreta, badge intent/posticipata e badge casella. Riga
   selezionata: barra accent a sinistra + leggera tinta. Checkbox fuori dal
   <button> (HTML valido) e visibile su hover/selezione per non sporcare la riga.
   ────────────────────────────────────────────────────────────────────────── */
function ConversationRow({
  conv, active, checked, mailbox, onSelect, onToggle, dataIndex, measureRef, offsetTop,
}: {
  conv: Conversation;
  active: boolean;
  checked: boolean;
  mailbox: SenderRow | null;
  onSelect: () => void;
  onToggle: () => void;
  // Wiring virtualizer (assente nei test/usi non virtualizzati → riga statica).
  dataIndex?: number;
  measureRef?: (el: HTMLElement | null) => void;
  offsetTop?: number;
}) {
  const name = contactName(conv.contact, conv.email);
  const company = conv.contact?.company_name;
  const intentMeta = conv.lastIntent ? INTENT_META[conv.lastIntent] : null;
  const virtualized = measureRef != null;
  return (
    <li
      ref={measureRef}
      data-index={dataIndex}
      // Wrapper "nudo": quando virtualizzato è il blocco assoluto misurato dal
      // virtualizer; pb-0.5 ricrea lo spazio tra righe (prima: space-y-0.5 sul <ul>).
      // Lo styling della card sta sull'inner <div> così il gap resta trasparente.
      style={virtualized ? { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${offsetTop}px)`, paddingBottom: 2 } : undefined}
      className={virtualized ? undefined : "pb-0.5"}
    >
      <div
        className={cn(
          "group relative flex items-stretch overflow-hidden rounded-lg transition-colors",
          active ? "bg-primary/[0.07]" : "hover:bg-muted/60",
          checked && !active && "bg-primary/[0.05]",
        )}
      >
      {/* Barra accent della riga selezionata. */}
      {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary" aria-hidden />}
      {/* Checkbox di selezione multipla — fuori dal <button> (HTML valido). */}
      <div className={cn(
        "flex shrink-0 items-center pl-2.5 transition-opacity",
        checked ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
      )}>
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          aria-label={`Seleziona conversazione con ${name}`}
        />
      </div>
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 gap-3 py-2.5 pl-2 pr-3 text-left"
      >
        <div className="relative shrink-0">
          <Avatar className="h-10 w-10">
            <AvatarFallback className={cn("text-xs font-semibold", avatarTint(name))}>{iniziali(name)}</AvatarFallback>
          </Avatar>
          {conv.unread && (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm", conv.unread ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>{name}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{relativeTime(conv.lastAt)}</span>
          </div>
          {company && (
            <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{company}</span>
            </div>
          )}
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className={cn("truncate text-xs", conv.unread ? "text-foreground/70" : "text-muted-foreground")}>{conv.lastSnippet}</span>
            {conv.snoozedUntil ? (
              <Badge variant="outline" className="shrink-0 gap-1 border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-700">
                <AlarmClock className="h-2.5 w-2.5" />{relativeTime(conv.snoozedUntil)}
              </Badge>
            ) : intentMeta && (
              <Badge variant="outline" className={cn("shrink-0 text-[10px] font-medium", intentMeta.cls)}>{intentMeta.label}</Badge>
            )}
          </div>
          {mailbox && (
            <div className="mt-1.5 flex items-center gap-1 truncate">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", senderStatusColor(mailbox.status))} />
              <span className="truncate text-[10px] text-muted-foreground/80">{mailbox.email}</span>
            </div>
          )}
        </div>
      </button>
      </div>
    </li>
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
          <SelectTrigger className="h-7 w-auto min-w-[7.5rem] max-w-[12rem] gap-1.5 rounded-lg border-border bg-background px-2.5 text-[11px] shadow-none" aria-label="Filtra per sequenza">
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
        <SelectTrigger className="h-7 w-auto min-w-[6.5rem] gap-1.5 rounded-lg border-border bg-background px-2.5 text-[11px] shadow-none" aria-label="Filtra per data">
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
  /** Invia la risposta. Il parent sceglie il target (contatto o email sciolta). */
  onSend: () => void | Promise<void>;
  /** Genera la bozza AI. Il parent sceglie la modalità (contact_id o messaggi). */
  onDraft: () => void | Promise<void>;
  onBack: () => void;
  showContext: boolean;
  onToggleContext: () => void;
}) {
  const name = contactName(selected.contact, selected.email);
  const counterpart = selected.contact?.email || selected.email;
  // Si può rispondere se c'è un contatto collegato OPPURE un indirizzo (email
  // sciolta): l'edge outreach-reply-send accetta entrambe le modalità.
  const canReply = !!(selected.contact?.id || selected.email);
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
      <header className="flex shrink-0 flex-col gap-2 border-b border-border bg-background px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-1 shrink-0 md:hidden" aria-label="Torna alla lista" onClick={onBack}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className={cn("text-xs font-semibold", avatarTint(name))}>{iniziali(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="flex items-center gap-3 truncate text-xs text-muted-foreground">
              {counterpart && (
                <span className="inline-flex min-w-0 items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{counterpart}</span></span>
              )}
              {selected.contact?.company_name && (
                <span className="inline-flex min-w-0 items-center gap-1"><Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{selected.contact.company_name}</span></span>
              )}
            </div>
          </div>
          {/* Casella di riferimento — badge curato (da/verso quale casella). */}
          {mailbox ? (
            <Badge
              variant="outline"
              className="hidden max-w-[200px] shrink-0 items-center gap-1.5 rounded-lg border-border bg-muted/40 py-1 pl-2 pr-1.5 font-normal sm:inline-flex"
              title={`Casella: ${mailbox.email}`}
            >
              <Mailbox className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate text-[11px] text-foreground">{mailbox.email}</span>
              <span className="shrink-0 rounded bg-background px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{providerLabel(mailbox.provider)}</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="hidden shrink-0 gap-1 rounded-lg border-border bg-muted/40 font-normal text-[10px] text-muted-foreground sm:inline-flex">
              <Mailbox className="h-3 w-3" /> Casella non tracciata
            </Badge>
          )}
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
        {/* Casella di riferimento compatta su mobile (sotto i floor del badge sopra). */}
        <div className="flex items-center gap-1.5 pl-12 text-[11px] text-muted-foreground sm:hidden">
          <Mailbox className="h-3 w-3 shrink-0 text-primary" />
          {mailbox ? (
            <span className="truncate">Casella: <span className="font-medium text-foreground">{mailbox.email}</span></span>
          ) : (
            <span>Casella non determinata</span>
          )}
        </div>
      </header>

      <ScrollArea className="flex-1 px-3 py-5 sm:px-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {selected.messages.map((m, i) => {
            const prev = selected.messages[i - 1];
            // Mostra l'oggetto solo se cambia rispetto al messaggio precedente.
            const showSubject = !!m.subject && m.subject !== prev?.subject;
            // Separatore data: prima riga o quando cambia il giorno rispetto al precedente.
            const showDay = i === 0 || !sameDay(m.at, prev?.at ?? null);
            return (
              <div key={m.id}>
                {showDay && <ThreadDayDivider iso={m.at} />}
                <ThreadBubble msg={m} showSubject={showSubject} />
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* ═══ Box risposta 2-vie (universale: con o senza contatto collegato) ═══ */}
      {canReply ? (
        <div className="shrink-0 border-t border-border bg-background p-3 sm:px-4">
          {/* Avviso quando manca sia il contatto sia una casella tracciata: l'edge
              ripiegherà su una casella del pool, lo segnaliamo per trasparenza. */}
          {!selected.contact?.id && !mailbox && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              <Mailbox className="h-3.5 w-3.5 shrink-0" />
              Email non in rubrica e casella non tracciata: la risposta partirà da una casella attiva del pool.
            </div>
          )}
          <div className="rounded-xl border border-border bg-muted/30 shadow-sm transition-colors focus-within:border-primary/40 focus-within:bg-background">
            {/* Toolbar: risposte rapide + firma (inserimento 1-click al cursore). */}
            <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
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
              className="resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
              disabled={sending || aiDrafting}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !sending && replyText.trim()) {
                  e.preventDefault();
                  void onSend();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                <kbd className="rounded border border-border bg-background px-1 text-[10px] font-medium">⌘</kbd>
                <kbd className="ml-0.5 rounded border border-border bg-background px-1 text-[10px] font-medium">↵</kbd> per inviare
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={() => void onDraft()}
                  disabled={sending || aiDrafting}
                  className="h-8 gap-1.5 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                  title="L'AI legge la conversazione e propone una risposta da rivedere"
                >
                  {aiDrafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {aiDrafting ? "Scrivo…" : "Bozza AI"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void onSend()}
                  disabled={sending || aiDrafting || !replyText.trim()}
                  className="h-8 gap-1.5"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? "Invio…" : "Invia risposta"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Caso residuo: conversazione senza contatto NÉ email (es. message-id orfano).
        <div className="shrink-0 border-t border-border bg-background px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-[11px] text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            Conversazione senza destinatario determinabile — rispondi dal tuo client email.
          </div>
        </div>
      )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   ThreadBubble — bolla del thread (stile Unibox). Inviate a destra con tinta
   accent leggera, risposte a sinistra neutre su sfondo bianco. Header con
   etichetta direzione, badge consegna/aperta/auto-reply e oggetto (se cambia).
   ────────────────────────────────────────────────────────────────────────── */
function ThreadBubble({ msg, showSubject }: { msg: ThreadMsg; showSubject: boolean }) {
  const out = msg.direction === "out";
  const intentMeta = msg.intent ? INTENT_META[msg.intent] : null;
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] rounded-2xl border px-3.5 py-2.5 shadow-sm",
        out
          ? "rounded-br-md border-primary/20 bg-primary/[0.07]"
          : "rounded-bl-md border-border bg-background",
      )}>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-px",
            out ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}>
            <Mail className="h-2.5 w-2.5" />
            {out ? "Inviata" : "Risposta"}
          </span>
          {/* Stato di consegna (solo inviate): dati reali da outreach_send_queue. */}
          {out && msg.delivery && <DeliveryBadge delivery={msg.delivery} />}
          {intentMeta && (
            <Badge variant="outline" className={cn("px-1.5 py-0 text-[9px] font-medium normal-case", intentMeta.cls)}>{intentMeta.label}</Badge>
          )}
        </div>
        {showSubject && <div className="mb-1 text-sm font-semibold text-foreground">{msg.subject}</div>}
        {out ? (
          // Inviate: corpo HTML nostro → render fedele.
          <div
            className="prose prose-sm max-w-none break-words text-sm text-foreground [&_a]:text-primary [&_p]:my-1"
            dangerouslySetInnerHTML={{ __html: msg.body || "—" }}
          />
        ) : (
          // Risposte: testo/snippet grezzo → niente HTML non fidato.
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{msg.body || "—"}</p>
        )}
        <div className="mt-1.5 text-right text-[10px] tabular-nums text-muted-foreground">{fullTime(msg.at)}</div>
      </div>
    </div>
  );
}

/** Separatore data tra i messaggi del thread (chip centrato discreto). */
function ThreadDayDivider({ iso }: { iso: string | null }) {
  const label = dayLabel(iso);
  if (!label) return null;
  return (
    <div className="my-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">{label}</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
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
    <aside className="flex w-full shrink-0 flex-col border-t border-border bg-muted/30 lg:w-[312px] lg:border-l lg:border-t-0">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-3 py-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <User className="h-3.5 w-3.5" /> Contesto lead
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6 lg:hidden" aria-label="Chiudi contesto" onClick={onClose}>
          <PanelRightClose className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {/* ── Identità ── (card pulita) */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 shadow-sm">
            <Avatar className="h-11 w-11 shrink-0">
              <AvatarFallback className={cn("text-sm font-semibold", avatarTint(name))}>{iniziali(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{name}</div>
              {contact?.company_name && (
                <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{contact.company_name}</span>
                </div>
              )}
              {/* Coordinate sintetiche dentro la card identità. */}
              {email && (
                <div className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" /><span className="truncate font-mono">{email}</span>
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
            <div className="rounded-xl border border-dashed border-border bg-background p-3 text-xs text-muted-foreground shadow-sm">
              <p className="font-medium text-foreground">Nessun contatto collegato</p>
              <p className="mt-1 leading-relaxed">Questa email non è in <code className="rounded bg-muted px-1">marketing_contacts</code>. Le azioni sul lead (sequenza, intento, opportunità, opt-out) si attivano collegando un contatto.</p>
              {email && (
                <p className="mt-2 inline-flex items-center gap-1 break-all"><Mail className="h-3 w-3 shrink-0" />{email}</p>
              )}
            </div>
          ) : (
            <>
              {/* ── Stato / contattabilità + intento ── */}
              <div className="flex flex-wrap items-center gap-1.5">
                {context?.suppressed ? (
                  <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-[10px] font-medium text-red-700">
                    <ShieldBan className="h-3 w-3" /> {contact.optout_email ? "Opt-out" : "Soppresso"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] font-medium text-emerald-700">
                    <ShieldCheck className="h-3 w-3" /> Contattabile
                  </Badge>
                )}
                {lastIntent && INTENT_META[lastIntent] && (
                  <Badge variant="outline" className={cn("text-[10px] font-medium", INTENT_META[lastIntent].cls)}>{INTENT_META[lastIntent].label}</Badge>
                )}
              </div>

              {/* ── Coordinate aggiuntive (email è già nella card identità) ── */}
              {(contact.phone || contact.source) && (
                <div className="space-y-1.5 rounded-xl border border-border bg-background p-3 text-xs shadow-sm">
                  {contact.phone && <InfoRow icon={<Phone className="h-3.5 w-3.5" />} value={contact.phone} />}
                  {contact.source && <InfoRow icon={<Activity className="h-3.5 w-3.5" />} value={contact.source} label="Sorgente" />}
                </div>
              )}

              {/* ── Liste / tag ── */}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {contact.tags.slice(0, 8).map((t) => (
                    <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{t}</span>
                  ))}
                </div>
              )}

              {/* ── Stato sequenza ── */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sequenza</div>
                {loading ? (
                  <Skeleton className="h-14 w-full rounded-xl" />
                ) : context && context.sequences.length > 0 ? (
                  <div className="space-y-1.5">
                    {context.sequences.slice(0, 3).map((s) => {
                      const meta = ENROLLMENT_STATUS_META[s.status];
                      return (
                        <div key={s.enrollmentId} className="rounded-xl border border-border bg-background p-2.5 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium">
                              <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="truncate">{s.sequenceName ?? "Sequenza"}</span>
                            </span>
                            <Badge variant="outline" className={cn("shrink-0 text-[9px] font-medium", meta?.cls)}>{meta?.label ?? s.status}</Badge>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Layers className="h-2.5 w-2.5" /> Step {s.currentStep}</span>
                            {isEnrollmentLive(s.status) && s.nextActionAt && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> Prossimo {relativeTime(s.nextActionAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border bg-background px-3 py-2.5 text-xs text-muted-foreground shadow-sm">Non iscritto a nessuna sequenza.</p>
                )}
              </div>

              {/* ── Mini-stats ── */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Attività</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Inviate" value={context?.sentCount ?? conversation.sentCount} />
                  <Stat label="Risposte" value={context?.replyCount ?? conversation.replyCount} />
                  <Stat label="Ultima" value={relativeTime(context?.lastActivityAt ?? conversation.lastAt) || "—"} small />
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* ── Azioni rapide ── */}
      <div className="shrink-0 space-y-2.5 border-t border-border bg-background p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Intento</div>
        {/* Intent 1-click */}
        <div className="grid grid-cols-3 gap-1.5">
          <Button size="sm" variant={lastIntent === "interested" ? "default" : "outline"} className="h-8 gap-1 px-1 text-[11px]"
            disabled={!contactId || intentPending} onClick={() => onSetIntent("interested")} title="Segna: Interessato">
            <ThumbsUp className="h-3.5 w-3.5" /> Sì
          </Button>
          <Button size="sm" variant={lastIntent === "out_of_office" ? "default" : "outline"} className="h-8 gap-1 px-1 text-[11px]"
            disabled={!contactId || intentPending} onClick={() => onSetIntent("out_of_office")} title="Segna: Non ora / fuori sede">
            <Clock className="h-3.5 w-3.5" /> Dopo
          </Button>
          <Button size="sm" variant={lastIntent === "not_interested" ? "default" : "outline"} className="h-8 gap-1 px-1 text-[11px]"
            disabled={!contactId || intentPending} onClick={() => onSetIntent("not_interested")} title="Segna: Non interessato">
            <ThumbsDown className="h-3.5 w-3.5" /> No
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
        <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
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
    <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-2.5 shadow-sm">
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
    <div className="rounded-xl border border-border bg-background px-1.5 py-2 shadow-sm">
      <div className={cn("font-semibold tabular-nums text-foreground", small ? "text-[11px] leading-tight" : "text-lg leading-none")}>{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
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
  // Open-tracking (opt-in): mostra "Aperta N×" accanto alla consegna quando ci sono
  // aperture tracciate. Dato reale da outreach_send_queue.open_count/opened_at;
  // 0 = mai aperta o tracking off → nessun badge (niente "0 aperture" fuorviante).
  const opened = delivery.openCount > 0;
  const openWhen = fullTime(delivery.openedAt);
  const openTip = [
    `Aperta ${delivery.openCount} ${delivery.openCount === 1 ? "volta" : "volte"}`,
    openWhen ? `Prima apertura: ${openWhen}` : null,
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
      {opened && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="ml-1 gap-0.5 px-1 py-0 text-[9px] font-medium normal-case border-violet-200 bg-violet-50 text-violet-700"
            >
              <Eye className="h-2.5 w-2.5" />
              Aperta{delivery.openCount > 1 ? ` ${delivery.openCount}×` : ""}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px] whitespace-pre-line text-[11px]">{openTip}</TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>
  );
}

/** True se due ISO cadono nello stesso giorno solare (locale). Null → false. */
function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** Etichetta del separatore data nel thread: "Oggi"/"Ieri" o data estesa (IT). */
function dayLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(iso, today.toISOString())) return "Oggi";
  if (sameDay(iso, yesterday.toISOString())) return "Ieri";
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(d);
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
