import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Inbox, Mailbox, Mail, Search, ChevronLeft, MessageSquare, AlertTriangle, Building2,
  Send, Loader2, Wand2, CheckCheck, Archive, Layers,
  User, Phone, Tag, ShieldBan, Pause, Play, ThumbsUp, ThumbsDown, Clock, Briefcase,
  Activity, ShieldCheck, Check, XCircle, Ban, MessageSquareReply, X, CalendarClock, GitBranch, Sparkles,
  AlarmClock, AlarmClockOff, Eye, PenSquare, SlidersHorizontal, MoreHorizontal, CornerUpLeft, PanelRightClose,
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
import { OutreachBookDemoAction } from "./OutreachBookDemoAction";
import { OutreachNewMailDialog } from "./OutreachNewMailDialog";
import {
  INTENT_META, ENROLLMENT_STATUS_META, type Conversation, type DateFilter,
  type SequenceOption, type LeadContext, type LeadSequence, type MsgDelivery, type AiSummary,
  type SnoozePreset, type SenderRow, type ThreadMsg, type BrandRow, contactName, iniziali, relativeTime, fullTime,
  providerLabel, senderStatusColor, stripHtml, snoozeUntil, dateFilterFloor,
  useOutreachConversations, useReplyComposer, useLeadContext, useLeadActions, isEnrollmentLive,
} from "./useOutreachConversations";
import {
  SENZA_BRAND, contaPerBrand, contaPosta, eAutomatica, filtraPosta, tintaBrand,
  type ContatoriPosta, type FiltroRisposte, type TintaBrand, type VistaPosta,
} from "./postaViste";
import { useReplySnippets, type ReplySnippet } from "./useReplySnippets";
import { avatarTint } from "./outreachAvatar";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";

/**
 * OutreachMailClient — la Posta del cold outreach (tab «Posta» dell'Outreach Engine).
 *
 * Ridisegnata il 22/09/2026 su richiesta di Florin: «non riesco a dividere le
 * email dei brand, capire le risposte, e se clicco su una mail poi non riesco
 * a tornare indietro».
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ Tutti · ● Brand A 14 · ● Brand B 6 …        Cerca  Filtri  Nuova │
 *   ├──────────────────────┬──────────────────────────────────────────┤
 *   │ Risposte|Automatiche │ ← Indietro   Persona   ● Brand  casella  │
 *   │ Inviate|Archivio     │                                          │
 *   │ Da leggere · …       │  Tu …                  Ha risposto …     │
 *   │ elenco               │  risposta + Bozza AI + Invia             │
 *   └──────────────────────┴──────────────────────────────────────────┘
 *
 * - I brand stanno in alto, al posto della colonna delle caselle (90 caselle
 *   su 30 domini non dicevano di quale brand fosse una risposta). La casella
 *   resta un filtro, in «Filtri».
 * - La vista di partenza sono le risposte scritte da una persona; le
 *   automatiche e le sole inviate hanno la loro vista (postaViste.ts).
 * - Aprire una conversazione non cambia più la pagina intorno: prima il
 *   pannello del lead si apriva e la colonna delle caselle spariva, senza un
 *   tasto per tornare. Ora c'è «Indietro», c'è Esc, e anche il tasto indietro
 *   del browser chiude la conversazione (è nella cronologia, senza dati
 *   personali nell'indirizzo).
 */

/**
 * Altezza del client: riempie il viewport disponibile come un vero mail client
 * (header pagina + tab + padding ≈ 13rem di offset), con un pavimento usabile su
 * viewport corti. Le colonne scrollano internamente; il box risposta resta
 * ancorato in fondo. Usata sia in loading sia a regime.
 */
const MAIL_CLIENT_HEIGHT = "h-[calc(100vh-13rem)] min-h-[560px]";

/** Colori del brand (classi scritte per intero: Tailwind le deve trovare nel sorgente). */
const TINTA_CLASSI: Record<TintaBrand, { punto: string; chip: string }> = {
  violet: { punto: "bg-violet-500", chip: "border-violet-200 bg-violet-50 text-violet-700" },
  rose: { punto: "bg-rose-500", chip: "border-rose-200 bg-rose-50 text-rose-700" },
  sky: { punto: "bg-sky-500", chip: "border-sky-200 bg-sky-50 text-sky-700" },
  emerald: { punto: "bg-emerald-500", chip: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  amber: { punto: "bg-amber-500", chip: "border-amber-200 bg-amber-50 text-amber-700" },
  teal: { punto: "bg-teal-500", chip: "border-teal-200 bg-teal-50 text-teal-700" },
  fuchsia: { punto: "bg-fuchsia-500", chip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700" },
};

/** Il brand come lo mostra la Posta: nome e colore. */
interface BrandVista {
  id: string;
  nome: string;
  tinta: TintaBrand;
}

/** Il pannello del lead si apre da solo solo sugli schermi larghi. */
function useLarghezzaMinima(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const iscrivi = useCallback((avvisa: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", avvisa);
    return () => mql.removeEventListener("change", avvisa);
  }, [query]);
  return useSyncExternalStore(iscrivi, () => window.matchMedia(query).matches, () => false);
}

/** Quale conversazione è aperta: sta nello stato della cronologia, non nell'indirizzo. */
interface StatoStoriaPosta {
  postaConv?: string;
  /** L'abbiamo aperta noi dall'elenco: chiudere = tornare indietro di un passo. */
  postaDaLista?: boolean;
}

export function OutreachMailClient({ companyId }: { companyId: string }) {
  const {
    conversations, sendersById, senders, brands, unreadBySender, sequenceOptions,
    isLoading, errored, tableMissing,
    markRead, markAllRead, archiveRead, setIntent, snoozeConversation, unsnooze,
    signatureForSender,
  } = useOutreachConversations(companyId);
  const { replyText, setReplyText, sending, aiDrafting, sendReply, draftWithAi, summarizing, summarizeWithAi } = useReplyComposer(companyId);
  const snippets = useReplySnippets();

  const [brand, setBrand] = useState<string | null>(null); // null = tutti i brand
  const [vista, setVista] = useState<VistaPosta>("risposte");
  const [filtro, setFiltro] = useState<FiltroRisposte>("tutte");
  const [search, setSearch] = useState("");
  const [senderId, setSenderId] = useState<string | null>(null); // null = tutte le caselle
  const [sequenceId, setSequenceId] = useState<string | null>(null); // null = tutte le sequenze
  const [dateFilter, setDateFilter] = useState<DateFilter>("all"); // finestra ultima attività
  // Selezione multipla per le azioni bulk mirate. Si svuota a ogni cambio di
  // filtro negli handler (niente setState-in-effect): le righe selezionate
  // potrebbero uscire dalla lista filtrata.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // Override esplicito del pannello contesto lead: null = segue il default
  // (aperto se c'è un contatto e lo schermo è largo). Si azzera al cambio
  // conversazione negli handler.
  const [contextOverride, setContextOverride] = useState<boolean | null>(null);

  // ── La conversazione aperta vive nella cronologia del browser ──
  const location = useLocation();
  const navigate = useNavigate();
  const stato = (location.state ?? {}) as StatoStoriaPosta & Record<string, unknown>;
  const selectedKey = typeof stato.postaConv === "string" ? stato.postaConv : null;
  const qui = { pathname: location.pathname, search: location.search, hash: location.hash };
  const statoSenzaPosta = (): Record<string, unknown> => {
    const resto: Record<string, unknown> = { ...stato };
    delete resto.postaConv;
    delete resto.postaDaLista;
    return resto;
  };

  const filtered = useMemo(
    () => filtraPosta(conversations, {
      vista, filtro, brand, casellaId: senderId, sequenzaId: sequenceId,
      daQuando: dateFilterFloor(dateFilter), ricerca: search,
    }),
    [conversations, vista, filtro, brand, senderId, sequenceId, dateFilter, search],
  );
  const contatori = useMemo(() => contaPosta(conversations, brand), [conversations, brand]);
  const perBrand = useMemo(() => contaPerBrand(conversations), [conversations]);

  const selected = useMemo(
    () => conversations.find((c) => c.key === selectedKey) ?? null,
    [conversations, selectedKey],
  );

  // ── Brand: linguette in alto e colore di ogni conversazione ──
  const brandVista = useMemo(() => {
    const m = new Map<string, BrandVista>();
    for (const b of brands) m.set(b.id, { id: b.id, nome: b.name, tinta: tintaBrand(b.name) });
    m.set(SENZA_BRAND, { id: SENZA_BRAND, nome: "Senza brand", tinta: tintaBrand("") });
    return m;
  }, [brands]);
  const brandDi = (c: { brandId: string | null }) => brandVista.get(c.brandId ?? SENZA_BRAND) ?? null;
  // I brand attivi e quelli che hanno posta; i brand in pausa senza posta restano fuori.
  const linguette = useMemo(() => {
    const conPosta = new Set(conversations.map((c) => c.brandId ?? SENZA_BRAND));
    const scelti = brands
      .filter((b: BrandRow) => b.status === "active" || conPosta.has(b.id))
      .map((b) => b.id);
    if (conPosta.has(SENZA_BRAND)) scelti.push(SENZA_BRAND);
    return scelti.map((id) => ({
      ...(brandVista.get(id) as BrandVista),
      ...(perBrand.get(id) ?? { daLeggere: 0, risposte: 0 }),
    }));
  }, [brands, conversations, perBrand, brandVista]);
  const totaleDaLeggere = useMemo(
    () => [...perBrand.values()].reduce((s, v) => s + v.daLeggere, 0),
    [perBrand],
  );

  // ── Virtualizzazione lista conversazioni (a scala: centinaia di thread) ──
  // Solo le righe visibili sono montate. Altezza variabile → measureElement.
  const convScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => convScrollRef.current,
    estimateSize: () => 96,
    overscan: 10,
    getItemKey: (index) => filtered[index]?.key ?? index,
  });
  // Ref sempre aggiornato al virtualizer corrente, per J/K.
  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;

  // Il contesto del lead si apre da solo quando c'è un contatto e lo schermo è
  // largo: su uno schermo stretto schiaccerebbe il thread. Il bottone
  // «Dettagli» lo apre e lo chiude sempre.
  const ampio = useLarghezzaMinima(1440);
  const showContext = contextOverride ?? (Boolean(selected?.contact) && ampio);

  // Contesto + azioni del lead selezionato (DRY: dal hook condiviso).
  const { context: leadContext, isLoading: leadLoading, liveSequence } =
    useLeadContext(companyId, selected?.contact ?? null, selected);
  const leadActions = useLeadActions(companyId);

  // ── Selezione multipla (derivata sulla lista FILTRATA corrente) ──
  const selezionate = useMemo(() => filtered.filter((c) => selectedKeys.has(c.key)), [filtered, selectedKeys]);
  const selectedCount = selezionate.length;
  const allFilteredSelected = filtered.length > 0 && selectedCount === filtered.length;
  const azzeraSelezione = () => setSelectedKeys(new Set());
  const toggleSelected = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const toggleSelectAll = () =>
    setSelectedKeys((prev) => {
      const allKeys = filtered.map((c) => c.key);
      const everySelected = allKeys.length > 0 && allKeys.every((k) => prev.has(k));
      return everySelected ? new Set() : new Set(allKeys);
    });
  // Le azioni lavorano sulle risposte delle conversazioni (non sul contatto
  // intero: le sue risposte agli altri brand restano come sono).
  const daLeggereDi = (convs: Conversation[]) => convs.flatMap((c) => c.unreadReplyIds);
  const lettiDi = (convs: Conversation[]) => convs.flatMap((c) => c.readReplyIds);

  // ── Aprire e chiudere una conversazione ──
  // Dall'elenco si aggiunge un passo alla cronologia; passando da una
  // conversazione all'altra (clic o J/K) lo si sostituisce: «indietro» torna
  // sempre all'elenco.
  const apri = (conv: Conversation) => {
    const giaAperta = selectedKey != null;
    navigate(qui, {
      replace: giaAperta,
      state: {
        ...statoSenzaPosta(),
        postaConv: conv.key,
        postaDaLista: giaAperta ? stato.postaDaLista === true : true,
      },
    });
    setReplyText("");
    setContextOverride(null);
    if (conv.unreadReplyIds.length > 0) markRead.mutate({ replyIds: conv.unreadReplyIds });
  };
  const chiudi = () => {
    if (stato.postaDaLista === true) navigate(-1);
    else navigate(qui, { replace: true, state: statoSenzaPosta() });
  };

  // Scorciatoie: J/K spostano la selezione nella lista filtrata, Esc chiude la
  // conversazione. Ignorate mentre si scrive (non rubano i tasti alla
  // risposta) e con un menu o una finestra aperti (Esc chiude quelli). Il
  // listener si registra a ogni render: legge sempre lo stato corrente.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (e.key === "Escape") {
        if (document.querySelector("[role='dialog'][data-state='open'], [role='menu'][data-state='open'], [data-radix-popper-content-wrapper]")) return;
        if (selectedKey) { e.preventDefault(); chiudi(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (k !== "j" && k !== "k") return;
      if (filtered.length === 0) return;
      e.preventDefault();
      const idx = filtered.findIndex((c) => c.key === selectedKey);
      const nextIdx = k === "j"
        ? (idx < 0 ? 0 : Math.min(idx + 1, filtered.length - 1))
        : (idx < 0 ? 0 : Math.max(idx - 1, 0));
      const next = filtered[nextIdx];
      if (next && next.key !== selectedKey) apri(next);
      // La lista è virtualizzata: porta la riga selezionata in viewport.
      rowVirtualizerRef.current.scrollToIndex(nextIdx, { align: "auto" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Cambi di filtro: svuotano la selezione multipla. Cambiando brand si
  // tolgono anche casella e sequenza, che appartengono a un brand.
  const cambiaBrand = (b: string | null) => { setBrand(b); setSenderId(null); setSequenceId(null); azzeraSelezione(); };
  const cambiaVista = (v: VistaPosta) => { setVista(v); setFiltro("tutte"); azzeraSelezione(); };
  const cambiaFiltro = (f: FiltroRisposte) => { setFiltro((prev) => (prev === f ? "tutte" : f)); azzeraSelezione(); };
  const cambiaCasella = (id: string | null) => { setSenderId(id); azzeraSelezione(); };
  const cambiaSequenza = (id: string | null) => { setSequenceId(id); azzeraSelezione(); };
  const cambiaData = (d: DateFilter) => { setDateFilter(d); azzeraSelezione(); };
  const azzeraFiltri = () => { setSenderId(null); setSequenceId(null); setDateFilter("all"); azzeraSelezione(); };

  if (tableMissing) {
    return (
      <MigrationGate
        title="Posta cold — client pronto"
        unlocks={[
          "Tutte le email cold (inviate + risposte) in un unico client, conversazione per conversazione.",
          "Le risposte divise per brand, le automatiche a parte.",
          "Rispondi dalla stessa casella, con bozza AI — come un vero client email, ma per il freddo.",
        ]}
      />
    );
  }

  if (isLoading) {
    return (
      <div className={cn(MAIL_CLIENT_HEIGHT, "flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm")}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-28 rounded-lg" />)}
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-full space-y-1 border-r border-border p-3 md:w-[380px]">
            <Skeleton className="mb-2 h-7 w-full rounded-lg" />
            {Array.from({ length: 7 }).map((_, i) => (
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

  const casellaAttiva = senderId ? sendersById.get(senderId) ?? null : null;
  const sequenzaAttiva = sequenceId ? sequenceOptions.find((s) => s.id === sequenceId) ?? null : null;
  const filtriAttivi = (senderId ? 1 : 0) + (sequenceId ? 1 : 0) + (dateFilter !== "all" ? 1 : 0);
  const daLeggereMostrate = daLeggereDi(filtered);
  const lettiMostrati = lettiDi(filtered);

  return (
    <div className={cn(MAIL_CLIENT_HEIGHT, "flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm")}>
      {/* ═══ Barra: brand + ricerca + filtri + nuova email ═══ */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <BrandTabs
          linguette={linguette}
          attivo={brand}
          totaleDaLeggere={totaleDaLeggere}
          onChange={cambiaBrand}
        />
        {/* Sul telefono va a capo e prende tutta la riga: la ricerca si allarga. */}
        <div className="ml-auto flex w-full items-center gap-1.5 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); azzeraSelezione(); }}
              placeholder="Cerca nome, email, azienda…"
              aria-label="Cerca conversazione"
              className="h-8 w-full rounded-lg border-border bg-muted/40 pl-8 text-[12px] shadow-none focus-visible:bg-background sm:w-48 lg:w-60"
            />
          </div>
          <FiltriPopover
            senders={senders}
            brandVista={brandVista}
            brandAttivo={brand}
            unreadBySender={unreadBySender}
            senderId={senderId}
            onSender={cambiaCasella}
            sequenceOptions={sequenceOptions}
            sequenceId={sequenceId}
            onSequence={cambiaSequenza}
            dateFilter={dateFilter}
            onDate={cambiaData}
            attivi={filtriAttivi}
            onAzzera={azzeraFiltri}
          />
          {/* Compositore "Nuova email" a freddo (manuale). */}
          <OutreachNewMailDialog
            companyId={companyId}
            trigger={
              <Button size="sm" className="h-8 shrink-0 gap-1.5 rounded-lg text-[12px]" aria-label="Nuova email">
                <PenSquare className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Nuova email</span>
              </Button>
            }
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-x-auto">
        {/* ═══ Elenco (sinistra) ═══ */}
        <aside className={cn(
          "flex w-full shrink-0 flex-col border-r border-border bg-background md:w-[380px]",
          selected ? "hidden md:flex" : "flex",
        )}>
          <div className="space-y-2 border-b border-border px-3 py-2.5">
            <VistaSwitch vista={vista} contatori={contatori} onChange={cambiaVista} />
            {vista === "risposte" && (
              <FiltroChips filtro={filtro} contatori={contatori} onChange={cambiaFiltro} />
            )}
            {filtriAttivi > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {casellaAttiva && (
                  <FiltroAttivo onRemove={() => cambiaCasella(null)} icon={<Mailbox className="h-3 w-3" />}>{casellaAttiva.email}</FiltroAttivo>
                )}
                {sequenzaAttiva && (
                  <FiltroAttivo onRemove={() => cambiaSequenza(null)} icon={<GitBranch className="h-3 w-3" />}>{sequenzaAttiva.name}</FiltroAttivo>
                )}
                {dateFilter !== "all" && (
                  <FiltroAttivo onRemove={() => cambiaData("all")} icon={<CalendarClock className="h-3 w-3" />}>
                    {DATE_FILTER_OPTIONS.find((o) => o.value === dateFilter)?.label}
                  </FiltroAttivo>
                )}
              </div>
            )}

            {/* Selezione multipla e azioni sulla lista mostrata. */}
            {filtered.length > 0 && (
              <div className="flex min-h-7 items-center gap-2 text-[11px] text-muted-foreground">
                <Checkbox
                  checked={allFilteredSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Seleziona tutte le conversazioni mostrate"
                />
                {selectedCount > 0 ? (
                  <>
                    <span className="font-semibold text-primary">{selectedCount} selezionate</span>
                    {daLeggereDi(selezionate).length > 0 && (
                      <Button
                        size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"
                        disabled={markAllRead.isPending}
                        onClick={() => markAllRead.mutate(daLeggereDi(selezionate), { onSuccess: azzeraSelezione })}
                      >
                        {markAllRead.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                        Segna lette
                      </Button>
                    )}
                    {lettiDi(selezionate).length > 0 && (
                      <Button
                        size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"
                        disabled={archiveRead.isPending}
                        onClick={() => archiveRead.mutate(lettiDi(selezionate), { onSuccess: azzeraSelezione })}
                        title="Archivia le risposte già lette delle conversazioni selezionate"
                      >
                        {archiveRead.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                        Archivia
                      </Button>
                    )}
                    <Button
                      size="icon" variant="ghost" className="ml-auto h-7 w-7"
                      onClick={azzeraSelezione} aria-label="Annulla la selezione"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span>{filtered.length} {filtered.length === 1 ? "conversazione" : "conversazioni"}</span>
                    {(daLeggereMostrate.length > 0 || lettiMostrati.length > 0) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" aria-label="Azioni sulla lista">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuLabel className="text-[11px]">Su quelle mostrate</DropdownMenuLabel>
                          {daLeggereMostrate.length > 0 && (
                            <DropdownMenuItem className="text-xs" onSelect={() => markAllRead.mutate(daLeggereMostrate)}>
                              <CheckCheck className="mr-2 h-3.5 w-3.5" /> Segna lette ({daLeggereMostrate.length})
                            </DropdownMenuItem>
                          )}
                          {lettiMostrati.length > 0 && (
                            <DropdownMenuItem className="text-xs" onSelect={() => archiveRead.mutate(lettiMostrati)}>
                              <Archive className="mr-2 h-3.5 w-3.5" /> Archivia le lette ({lettiMostrati.length})
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="h-5 w-5" />
              </span>
              <p className="max-w-[250px] text-sm text-muted-foreground">{testoVuoto(vista, filtro, conversations.length === 0)}</p>
              {(filtriAttivi > 0 || !!search || filtro !== "tutte") && (
                <Button
                  variant="ghost" size="sm"
                  className="mt-3 h-7 gap-1.5 text-[11px] text-muted-foreground"
                  onClick={() => { azzeraFiltri(); setSearch(""); setFiltro("tutte"); }}
                >
                  <X className="h-3 w-3" /> Azzera filtri
                </Button>
              )}
            </div>
          ) : (
            // Lista virtualizzata: scroll parent nativo + righe assolute misurate.
            <div ref={convScrollRef} className="flex-1 overflow-y-auto">
              <ul className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((vRow) => {
                  const conv = filtered[vRow.index];
                  return (
                    <ConversationRow
                      key={vRow.key}
                      conv={conv}
                      vista={vista}
                      brand={brand == null ? brandDi(conv) : null}
                      active={conv.key === selectedKey}
                      checked={selectedKeys.has(conv.key)}
                      mailbox={conv.primarySenderId ? sendersById.get(conv.primarySenderId) ?? null : null}
                      onSelect={() => apri(conv)}
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

        {/* ═══ Conversazione aperta (destra) ═══ */}
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
                <p className="text-sm font-medium text-foreground">
                  {vista === "inviate" ? "Scegli un'email dall'elenco" : "Scegli una risposta dall'elenco"}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Si apre qui accanto. Torni all'elenco con «Indietro» o con <Kbd>Esc</Kbd>; <Kbd>J</Kbd> e <Kbd>K</Kbd> passano alla successiva e alla precedente.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              {/* Floor di larghezza del thread su desktop: col contesto lead aperto non
                  deve mai comprimersi fino a "una parola per riga". */}
              <div className="flex min-w-0 flex-1 flex-col lg:min-w-[380px]">
                <ThreadPane
                  selected={selected}
                  brand={brandDi(selected)}
                  sendersById={sendersById}
                  mailbox={selected.primarySenderId ? sendersById.get(selected.primarySenderId) ?? null : null}
                  signature={signatureForSender(selected.primarySenderId)}
                  snippets={snippets}
                  replyText={replyText}
                  setReplyText={setReplyText}
                  sending={sending}
                  aiDrafting={aiDrafting}
                  // Sempre con la casella della conversazione: è del suo brand.
                  // Senza, la funzione usava l'ultima casella che aveva scritto
                  // al contatto, magari di un altro brand.
                  onSend={() => sendReply(
                    selected.contact?.id
                      ? { contactId: selected.contact.id, senderId: selected.primarySenderId }
                      : { toEmail: selected.email, senderId: selected.primarySenderId },
                  )}
                  onDraft={() => draftWithAi(
                    selected.contact?.id
                      ? { contactId: selected.contact.id }
                      : { messages: selected.messages },
                  )}
                  onBack={chiudi}
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
                  onSetIntent={(intent) => selected.contact?.id && setIntent.mutate({
                    contactId: selected.contact.id, intent, replyId: selected.lastReplyId,
                  })}
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
    </div>
  );
}

/** Cosa dire quando la lista è vuota, secondo la vista. */
function testoVuoto(vista: VistaPosta, filtro: FiltroRisposte, nessunaPosta: boolean): string {
  if (nessunaPosta) return "Nessuna conversazione ancora. Le email inviate e le risposte compaiono qui.";
  if (vista === "risposte") {
    if (filtro === "da_leggere") return "Nessuna risposta da leggere.";
    if (filtro === "da_rispondere") return "Hai risposto a tutti.";
    if (filtro === "interessati") return "Nessun interessato con questi filtri.";
    if (filtro === "posticipate") return "Nessuna conversazione posticipata.";
    return "Nessuna risposta con questi filtri.";
  }
  if (vista === "automatiche") return "Nessuna risposta automatica con questi filtri.";
  if (vista === "archiviate") return "Nessuna conversazione archiviata con questi filtri.";
  return "Nessuna email inviata con questi filtri.";
}

/**
 * PostaUnreadBadge — pillola arancione col numero di risposte da leggere,
 * accanto al TabsTrigger "Posta". Vive nella tab bar ed è montato SU OGNI TAB,
 * quindi usa una singola query di conteggio (`count exact, head`) invece del
 * hook completo. Dal 22/09/2026 non conta le risposte automatiche, come il
 * filtro «Da leggere» della Posta.
 */
export function PostaUnreadBadge({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["outreach-posta-unread-count", companyId],
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from("outreach_replies")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "unread")
        .or("intent.is.null,intent.neq.auto_reply");
      if (error) return null; // tabella assente o RLS → nessun badge (non rompe la tab bar)
      return count ?? 0;
    },
  });
  const unread = q.data ?? 0;
  if (unread <= 0) return null;
  return (
    <Badge className="ml-1.5 h-4 min-w-4 justify-center bg-primary px-1 text-[10px] tabular-nums">
      {unread > 99 ? "99+" : unread}
    </Badge>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sotto-componenti presentazionali
   ────────────────────────────────────────────────────────────────────────── */

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-background px-1 text-[10px] font-medium shadow-sm">{children}</kbd>;
}

/** Pallino + nome del brand. */
function BrandLabel({ brand, className }: { brand: BrandVista; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground", className)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", TINTA_CLASSI[brand.tinta].punto)} aria-hidden />
      <span className="truncate">{brand.nome}</span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   BrandTabs — le linguette dei brand in cima alla Posta. Il numero è quello
   delle risposte vere da leggere (in evidenza), altrimenti quante risposte ci
   sono in tutto (in grigio).
   ────────────────────────────────────────────────────────────────────────── */
function BrandTabs({
  linguette, attivo, totaleDaLeggere, onChange,
}: {
  linguette: Array<BrandVista & { daLeggere: number; risposte: number }>;
  attivo: string | null;
  totaleDaLeggere: number;
  onChange: (id: string | null) => void;
}) {
  const voce = (
    key: string, selezionata: boolean, onClick: () => void,
    contenuto: React.ReactNode, daLeggere: number, risposte: number,
  ) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={selezionata}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors",
        selezionata
          ? "border-foreground/20 bg-muted text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {contenuto}
      {daLeggere > 0 ? (
        <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground" title={`${daLeggere} da leggere`}>{daLeggere}</span>
      ) : risposte > 0 ? (
        <span className="text-[10px] tabular-nums text-muted-foreground" title={`${risposte} risposte`}>{risposte}</span>
      ) : null}
    </button>
  );
  const totaleRisposte = linguette.reduce((s, l) => s + l.risposte, 0);
  return (
    <div role="tablist" aria-label="Brand" className="scrollbar-none -mx-1 flex min-w-0 max-w-full items-center gap-1 overflow-x-auto px-1">
      {voce("tutti", attivo == null, () => onChange(null), <span>Tutti i brand</span>, totaleDaLeggere, totaleRisposte)}
      {linguette.map((l) => voce(
        l.id,
        attivo === l.id,
        () => onChange(l.id),
        <>
          <span className={cn("h-2 w-2 shrink-0 rounded-full", TINTA_CLASSI[l.tinta].punto)} aria-hidden />
          <span className="whitespace-nowrap">{l.nome}</span>
        </>,
        l.daLeggere,
        l.risposte,
      ))}
    </div>
  );
}

/** Le quattro viste della lista: risposte vere, automatiche, inviate, archivio. */
function VistaSwitch({
  vista, contatori, onChange,
}: {
  vista: VistaPosta;
  contatori: ContatoriPosta;
  onChange: (v: VistaPosta) => void;
}) {
  const voci: { k: VistaPosta; label: string; n: number; titolo: string }[] = [
    { k: "risposte", label: "Risposte", n: contatori.risposte, titolo: "Le risposte scritte da una persona" },
    { k: "automatiche", label: "Automatiche", n: contatori.automatiche, titolo: "Risponditori automatici: «abbiamo ricevuto la tua richiesta», ferie…" },
    { k: "inviate", label: "Inviate", n: contatori.inviate, titolo: "Le ultime email partite, senza risposta" },
    { k: "archiviate", label: "Archivio", n: contatori.archiviate, titolo: "Le conversazioni archiviate" },
  ];
  return (
    // Colonne larghe quanto il testo: a colonne uguali «Automatiche» veniva tagliata.
    <div role="tablist" aria-label="Tipo di posta" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
      {voci.map((v) => (
        <button
          key={v.k}
          type="button"
          role="tab"
          aria-selected={vista === v.k}
          title={v.titolo}
          onClick={() => onChange(v.k)}
          className={cn(
            "flex min-w-0 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
            vista === v.k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="truncate">{v.label}</span>
          {v.n > 0 && <span className="shrink-0 tabular-nums text-muted-foreground">{v.n}</span>}
        </button>
      ))}
    </div>
  );
}

/** Filtri dentro le risposte: da leggere, da rispondere, interessati, posticipate. */
function FiltroChips({
  filtro, contatori, onChange,
}: {
  filtro: FiltroRisposte;
  contatori: ContatoriPosta;
  onChange: (f: FiltroRisposte) => void;
}) {
  const voci: { k: FiltroRisposte; label: string; n?: number }[] = [
    { k: "tutte", label: "Tutte" },
    { k: "da_leggere", label: "Da leggere", n: contatori.daLeggere },
    { k: "da_rispondere", label: "Da rispondere", n: contatori.daRispondere },
    { k: "interessati", label: "Interessati", n: contatori.interessati },
  ];
  if (contatori.posticipate > 0 || filtro === "posticipate") {
    voci.push({ k: "posticipate", label: "Posticipate", n: contatori.posticipate });
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {voci.map((f) => {
        const active = filtro === f.k;
        return (
          <button
            key={f.k}
            type="button"
            onClick={() => onChange(f.k)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            {f.label}
            {f.n != null && f.n > 0 && (
              <span className={cn("tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{f.n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Un filtro attivo, con la × per toglierlo (così una lista vuota si spiega da sola). */
function FiltroAttivo({ children, icon, onRemove }: { children: React.ReactNode; icon: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pl-1.5 pr-0.5 text-[11px] text-foreground">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Togli il filtro"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Filtri secondari: casella (cercabile, divisa per brand), sequenza, periodo.
   La casella prima era una colonna intera (90 caselle su 30 domini): ora è un
   filtro, perché a dividere la posta sono i brand.
   ────────────────────────────────────────────────────────────────────────── */
const ALL_SEQUENCES = "__all__";

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "Sempre" },
  { value: "today", label: "Ultime 24 ore" },
  { value: "7d", label: "Ultimi 7 giorni" },
  { value: "30d", label: "Ultimi 30 giorni" },
];

function FiltriPopover({
  senders, brandVista, brandAttivo, unreadBySender, senderId, onSender,
  sequenceOptions, sequenceId, onSequence, dateFilter, onDate, attivi, onAzzera,
}: {
  senders: SenderRow[];
  brandVista: Map<string, BrandVista>;
  brandAttivo: string | null;
  unreadBySender: Map<string, number>;
  senderId: string | null;
  onSender: (id: string | null) => void;
  sequenceOptions: SequenceOption[];
  sequenceId: string | null;
  onSequence: (id: string | null) => void;
  dateFilter: DateFilter;
  onDate: (d: DateFilter) => void;
  attivi: number;
  onAzzera: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Caselle del brand scelto, raggruppate per brand (nell'ordine dei nomi).
  const gruppi = useMemo(() => {
    const m = new Map<string, { nome: string; caselle: SenderRow[] }>();
    for (const s of senders) {
      const k = s.brand_id ?? SENZA_BRAND;
      if (brandAttivo != null && k !== brandAttivo) continue;
      const g = m.get(k) ?? { nome: brandVista.get(k)?.nome ?? "Senza brand", caselle: [] };
      g.caselle.push(s);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  }, [senders, brandVista, brandAttivo]);
  const sequenze = sequenceOptions.filter((s) => brandAttivo == null || (s.brandId ?? SENZA_BRAND) === brandAttivo);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 rounded-lg border-border text-[12px] shadow-none">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtri
          {attivi > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground">{attivi}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">Casella</div>
          <Command className="rounded-lg border border-border">
            <CommandInput placeholder="Cerca casella o dominio…" className="h-8 text-xs" />
            <CommandList className="max-h-56">
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">Nessuna casella trovata.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="tutte le caselle" onSelect={() => { onSender(null); setOpen(false); }} className="text-xs">
                  <Layers className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> Tutte le caselle
                  {senderId == null && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                </CommandItem>
              </CommandGroup>
              {gruppi.map((g) => (
                <CommandGroup key={g.nome} heading={g.nome}>
                  {g.caselle.map((s) => (
                    <CommandItem key={s.id} value={s.email} onSelect={() => { onSender(s.id); setOpen(false); }} className="text-xs">
                      <span className={cn("mr-2 h-2 w-2 shrink-0 rounded-full", senderStatusColor(s.status))} title={s.status} />
                      <span className="min-w-0 flex-1 truncate">{s.email}</span>
                      <span className="ml-1 shrink-0 rounded bg-muted px-1 text-[9px] font-semibold uppercase text-muted-foreground">{providerLabel(s.provider)}</span>
                      {(unreadBySender.get(s.id) ?? 0) > 0 && (
                        <span className="ml-1 shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground">{unreadBySender.get(s.id)}</span>
                      )}
                      {senderId === s.id && <Check className="ml-1 h-3.5 w-3.5 shrink-0 text-primary" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">Sequenza</div>
            <Select value={sequenceId ?? ALL_SEQUENCES} onValueChange={(v) => onSequence(v === ALL_SEQUENCES ? null : v)}>
              <SelectTrigger className="h-8 w-full gap-1.5 rounded-lg px-2 text-[11px] shadow-none" aria-label="Filtra per sequenza">
                <SelectValue placeholder="Sequenza" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SEQUENCES} className="text-xs">Tutte</SelectItem>
                {sequenze.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">Periodo</div>
            <Select value={dateFilter} onValueChange={(v) => onDate(v as DateFilter)}>
              <SelectTrigger className="h-8 w-full gap-1.5 rounded-lg px-2 text-[11px] shadow-none" aria-label="Filtra per periodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {attivi > 0 && (
          <Button variant="ghost" size="sm" className="h-7 w-full gap-1.5 text-[11px] text-muted-foreground" onClick={onAzzera}>
            <X className="h-3 w-3" /> Azzera filtri
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   ConversationRow — riga dell'elenco. Per le risposte mostra le parole della
   persona (non la nostra ultima email), il brand, l'esito e se aspetta una
   nostra risposta. Righe separate da una linea, non card arrotondate.
   ────────────────────────────────────────────────────────────────────────── */
function ConversationRow({
  conv, vista, brand, active, checked, mailbox, onSelect, onToggle, dataIndex, measureRef, offsetTop,
}: {
  conv: Conversation;
  vista: VistaPosta;
  /** Il brand, quando la lista li mostra tutti (con un brand scelto è sottinteso). */
  brand: BrandVista | null;
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
  const company = conv.contact?.company_name && conv.contact.company_name !== name ? conv.contact.company_name : null;
  const intentMeta = conv.lastIntent ? INTENT_META[conv.lastIntent] : null;
  const risposta = conv.ultimaRisposta;
  const mostraRisposta = vista !== "inviate" && !!risposta;
  const testo = mostraRisposta ? `«${risposta?.testo || "—"}»` : conv.lastSnippet;
  const quando = mostraRisposta ? risposta?.at ?? conv.lastAt : conv.lastAt;
  const virtualized = measureRef != null;
  return (
    <li
      ref={measureRef}
      data-index={dataIndex}
      style={virtualized ? { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${offsetTop}px)` } : undefined}
    >
      <div
        className={cn(
          "group relative flex items-stretch border-b border-border/70 transition-colors",
          active ? "bg-primary/[0.07]" : "hover:bg-muted/50",
          checked && !active && "bg-primary/[0.04]",
        )}
      >
        {/* Barra accent della riga aperta. */}
        {active && <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />}
        {/* Checkbox di selezione multipla — fuori dal <button> (HTML valido). */}
        <div className={cn(
          "flex shrink-0 items-start pl-3 pt-3.5 transition-opacity",
          checked ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
        )}>
          <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Seleziona conversazione con ${name}`} />
        </div>
        <button onClick={onSelect} className="flex min-w-0 flex-1 gap-3 py-2.5 pl-2 pr-3 text-left">
          <div className="relative shrink-0">
            <Avatar className="h-9 w-9">
              <AvatarFallback className={cn("text-xs font-semibold", avatarTint(name))}>{iniziali(name)}</AvatarFallback>
            </Avatar>
            {conv.unread && (
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-background" aria-label="Da leggere" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("truncate text-sm", conv.unread ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>{name}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{relativeTime(quando)}</span>
            </div>
            {company && (
              <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{company}</span>
              </div>
            )}
            {(brand || conv.snoozedUntil || conv.tipo !== "inviata") && (
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                {brand && <BrandLabel brand={brand} />}
                {conv.snoozedUntil ? (
                  <Badge variant="outline" className="shrink-0 gap-1 border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-700">
                    <AlarmClock className="h-2.5 w-2.5" />{relativeTime(conv.snoozedUntil)}
                  </Badge>
                ) : conv.tipo === "automatica" ? (
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-medium text-muted-foreground">Risposta automatica</Badge>
                ) : conv.tipo === "risposta" && intentMeta ? (
                  <Badge variant="outline" className={cn("shrink-0 px-1.5 py-0 text-[10px] font-medium", intentMeta.cls)}>{intentMeta.label}</Badge>
                ) : null}
              </div>
            )}
            <p className={cn(
              "mt-0.5 line-clamp-2 break-words text-xs",
              conv.unread ? "text-foreground/80" : "text-muted-foreground",
            )}>{testo}</p>
            {conv.tipo === "risposta" && conv.daRispondere ? (
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
                <CornerUpLeft className="h-3 w-3" /> Da rispondere
              </div>
            ) : conv.tipo === "risposta" && conv.abbiamoRisposto ? (
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                <Check className="h-3 w-3" /> Hai risposto
              </div>
            ) : vista === "inviate" && mailbox ? (
              <div className="mt-1 flex items-center gap-1 truncate">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", senderStatusColor(mailbox.status))} />
                <span className="truncate text-[10px] text-muted-foreground/80">{mailbox.email}</span>
              </div>
            ) : null}
          </div>
        </button>
      </div>
    </li>
  );
}

function ThreadPane({
  selected, brand, sendersById, mailbox, signature, snippets, replyText, setReplyText, sending, aiDrafting, onSend, onDraft, onBack,
  showContext, onToggleContext,
}: {
  selected: Conversation;
  brand: BrandVista | null;
  /** Per dire da quale casella è partita ogni nostra email. */
  sendersById: Map<string, SenderRow>;
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
      <header className="flex shrink-0 flex-col gap-1.5 border-b border-border bg-background px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          {/* Sempre visibile: prima su desktop non c'era modo di tornare all'elenco. */}
          <Button
            variant="ghost" size="sm"
            className="-ml-1.5 h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onBack}
            title="Torna all'elenco (Esc)"
          >
            <ChevronLeft className="h-4 w-4" /> Indietro
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
              {selected.contact?.company_name && selected.contact.company_name !== name && (
                <span className="hidden min-w-0 items-center gap-1 sm:inline-flex"><Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{selected.contact.company_name}</span></span>
              )}
            </div>
          </div>
          {brand && (
            <span className={cn(
              "hidden shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium sm:inline-flex",
              TINTA_CLASSI[brand.tinta].chip,
            )}>
              <span className={cn("h-2 w-2 rounded-full", TINTA_CLASSI[brand.tinta].punto)} aria-hidden />
              {brand.nome}
            </span>
          )}
          <Button
            variant={showContext ? "secondary" : "ghost"} size="sm"
            className="hidden h-8 shrink-0 gap-1.5 px-2 text-xs lg:inline-flex"
            aria-pressed={showContext}
            onClick={onToggleContext}
            title={showContext ? "Nascondi i dettagli del lead" : "Mostra i dettagli del lead: sequenza, esito, opportunità"}
          >
            <User className="h-3.5 w-3.5" /> Dettagli
          </Button>
        </div>
        {/* Casella della conversazione: da qui parte anche la risposta. */}
        <div className="flex items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
          <Mailbox className="h-3 w-3 shrink-0 text-primary" />
          {mailbox ? (
            <span className="truncate">
              Casella <span className="font-medium text-foreground">{mailbox.email}</span>
              <span className="ml-1.5 rounded bg-muted px-1 text-[9px] font-semibold uppercase tracking-wide">{providerLabel(mailbox.provider)}</span>
            </span>
          ) : (
            <span>Casella non tracciata</span>
          )}
          {brand && <BrandLabel brand={brand} className="ml-2 sm:hidden" />}
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
            const casella = m.senderAccountId ? sendersById.get(m.senderAccountId)?.email ?? null : null;
            return (
              <div key={m.id}>
                {showDay && <ThreadDayDivider iso={m.at} />}
                <ThreadBubble msg={m} showSubject={showSubject} casella={casella} />
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
                ? `Scrivi una risposta… partirà da ${mailbox.email}.`
                : "Scrivi una risposta… partirà dalla stessa casella che ha contattato il prospect."}
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
   ThreadBubble — un messaggio del thread. Nostre a destra («Tu», con la
   casella che l'ha spedita), risposte a sinistra: «Ha risposto» se l'ha
   scritta una persona, «Risposta automatica» (tratteggiata, in grigio) se è
   un risponditore. Prima erano tutte «Risposta», e un «abbiamo ricevuto la tua
   richiesta» sembrava una risposta vera.
   ────────────────────────────────────────────────────────────────────────── */
function ThreadBubble({ msg, showSubject, casella }: { msg: ThreadMsg; showSubject: boolean; casella: string | null }) {
  const out = msg.direction === "out";
  const automatica = eAutomatica(msg);
  const intentMeta = !out && !automatica && msg.intent ? INTENT_META[msg.intent] : null;
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] rounded-2xl border px-3.5 py-2.5",
        out
          ? "rounded-br-md border-primary/20 bg-primary/[0.07] shadow-sm"
          : automatica
            ? "rounded-bl-md border-dashed border-border bg-muted/40"
            : "rounded-bl-md border-emerald-200 bg-background shadow-sm",
      )}>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={cn(
            "font-semibold",
            out ? "text-primary" : automatica ? "text-muted-foreground" : "text-emerald-700",
          )}>
            {out ? "Tu" : automatica ? "Risposta automatica" : "Ha risposto"}
          </span>
          {out && casella && <span className="truncate text-muted-foreground">da {casella}</span>}
          {/* Stato di consegna (solo inviate): dati reali da outreach_send_queue. */}
          {out && msg.delivery && <DeliveryBadge delivery={msg.delivery} />}
          {intentMeta && (
            <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] font-medium", intentMeta.cls)}>{intentMeta.label}</Badge>
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
          <p className={cn("whitespace-pre-wrap break-words text-sm", automatica ? "text-muted-foreground" : "text-foreground")}>{msg.body || "—"}</p>
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
        {/* Prenota demo: monta la dialog appuntamento CRM esistente (insert in
            `appointments` + sync Google/Apple + comparsa nel Calendario marketing),
            precompilando contatto e titolo demo. Visibile solo con un lead collegato. */}
        <OutreachBookDemoAction
          companyId={companyId}
          contactId={contactId}
          contactName={name}
        />
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
            autoFocus
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
