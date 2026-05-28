/**
 * AIPersonasSessionsTab — v8.6.73 (rev. 2026-05-20)
 *
 * Tab "Sessioni" dell'hub AI Personas — scalabile a 1000+ conversazioni.
 *
 * Scalabilità (refactor v8.6.73):
 *   - Paginazione server-side via useInfiniteQuery (50/pagina, range())
 *   - Search server-side con ilike + debounce 300ms (no client filter)
 *   - Stats globali via RPC ai_persona_sessions_stats (no client SUM/COUNT)
 *   - Trigram index su title per ilike veloce anche con 100k+ righe
 *   - Bulk archive via RPC ai_persona_sessions_bulk_archive (1 UPDATE)
 *
 * Funzionalità:
 *   1. Lista paginata con infinite scroll (IntersectionObserver)
 *   2. Filtri: persona, periodo, archiviate, search debounced
 *   3. Bulk select + bulk archive
 *   4. Drawer dettaglio messaggi
 *   5. Promuovi a memoria — modal con:
 *      a. Promozione del messaggio intero (bottone su bubble)
 *      b. Promozione della selezione testo (floating tooltip su selection)
 *   6. Continua chat → autoresume sessione via ?tab=chat&sessionId=
 *   7. Esporta Markdown
 */
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";
import {
  DEMO_AI_PERSONAS,
  DEMO_MEMORIES,
  isOrchestratorPersonaKey,
  resolveDemoPersonaKey,
} from "@/components/ai/brainGraphDemoMemories";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getPersonaIcon, getPersonaColorRing } from "@/lib/personaVisuals";
import {
  Search, Archive, ArchiveRestore, Download, MessageSquare, Brain,
  History, Coins, ChevronRight, Loader2, ExternalLink, UserIcon,
  CheckCircle2, CheckSquare, Clock3, Database, FilterX, Gauge,
  Link2, Network, ShieldAlert, X, Sparkles,
} from "lucide-react";

// ─── Constants & helpers ─────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const COSTLY_SESSION_THRESHOLD_EUR = 0.035;
const KNOWLEDGE_SESSION_MIN_MESSAGES = 4;
const STALE_SESSION_DAYS = 21;

const PERIOD_OPTIONS = [
  { key: "7d",  label: "Ultimi 7 giorni",  days: 7 },
  { key: "30d", label: "Ultimi 30 giorni", days: 30 },
  { key: "90d", label: "Ultimi 90 giorni", days: 90 },
  { key: "all", label: "Tutte",            days: null as number | null },
] as const;

type PeriodKey = (typeof PERIOD_OPTIONS)[number]["key"];

function periodToDays(p: PeriodKey): number | null {
  return PERIOD_OPTIONS.find((o) => o.key === p)?.days ?? null;
}

function periodToCutoffIso(p: PeriodKey): string | null {
  const days = periodToDays(p);
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}g fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function fmtEur(n: number | null | undefined, decimals = 4): string {
  if (n == null) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function isDemoSession(session: SessionRow | null | undefined) {
  return !!session?.isDemoPreview || session?.id.startsWith("demo-session-");
}

function isCostlySession(session: SessionRow) {
  return (session.total_cost_billed_eur ?? 0) >= COSTLY_SESSION_THRESHOLD_EUR;
}

function isShortSession(session: SessionRow) {
  return (session.message_count ?? 0) <= 2;
}

function isKnowledgeCandidate(session: SessionRow) {
  return !isShortSession(session)
    && ((session.message_count ?? 0) >= KNOWLEDGE_SESSION_MIN_MESSAGES || (session.total_tokens_out ?? 0) >= 900);
}

function isInactiveSession(session: SessionRow) {
  const staleBefore = Date.now() - STALE_SESSION_DAYS * 24 * 60 * 60 * 1000;
  return new Date(session.last_message_at).getTime() < staleBefore;
}

function sessionHealthScore(session: SessionRow) {
  let score = 50;
  if (isKnowledgeCandidate(session)) score += 25;
  if (!isShortSession(session)) score += 10;
  if (!isCostlySession(session)) score += 10;
  if (!session.archived) score += 5;
  if (isInactiveSession(session)) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function applySessionQualityFilter(sessions: SessionRow[], filter: SessionQualityFilter) {
  if (filter === "knowledge") return sessions.filter(isKnowledgeCandidate);
  if (filter === "costly") return sessions.filter(isCostlySession);
  if (filter === "short") return sessions.filter(isShortSession);
  if (filter === "inactive") return sessions.filter(isInactiveSession);
  if (filter === "demo") return sessions.filter(isDemoSession);
  return sessions;
}

function buildDemoSessionTitle(persona: PersonaLite, memoryCount: number) {
  const topic = persona.category === "finance"
    ? "cassa, margini e scadenze"
    : persona.category === "operations"
      ? "cantieri, squadre e rischi"
      : persona.category === "sales"
        ? "pipeline, lead e preventivi"
        : persona.category === "compliance"
          ? "controlli, contratti e sicurezza"
          : "decisioni operative";
  return `${persona.display_name} · ${topic} (${memoryCount} spunti)`;
}

function downloadMarkdown(session: SessionRow, messages: MessageRow[], persona: PersonaLite | null): void {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(`**Persona:** ${persona?.display_name ?? session.persona_key}`);
  lines.push(`**Data inizio:** ${new Date(session.created_at).toLocaleString("it-IT")}`);
  lines.push(`**Messaggi:** ${session.message_count}`);
  lines.push(`**Costo:** ${fmtEur(session.total_cost_billed_eur, 4)}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const m of messages) {
    if (m.role === "system" || m.role === "tool") continue;
    const who = m.role === "user" ? "👤 Tu" : `🤖 ${persona?.display_name ?? "Assistente"}`;
    lines.push(`### ${who} · _${new Date(m.created_at).toLocaleString("it-IT")}_`);
    lines.push("");
    lines.push(m.content);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeTitle = session.title.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
  a.download = `chat-${safeTitle}-${session.id.slice(0, 8)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  persona_key: string;
  title: string;
  message_count: number;
  total_cost_billed_eur: number;
  total_tokens_in: number;
  total_tokens_out: number;
  last_message_at: string;
  archived: boolean;
  created_at: string;
  isDemoPreview?: boolean;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  cost_billed_eur: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  model_used: string | null;
  created_at: string;
  isDemoPreview?: boolean;
}

interface PersonaLite {
  persona_key: string;
  display_name: string;
  category: string | null;
  color: string | null;
  icon: string | null;
}

interface StatsRow {
  sessions_count: number;
  messages_count: number;
  total_cost_eur: number;
  top_persona_key: string | null;
  top_persona_count: number;
}

type MemoryType = "fact" | "preference" | "decision" | "pattern" | "avoid";
type SessionQualityFilter = "all" | "knowledge" | "costly" | "short" | "inactive" | "demo";

const TYPE_LABEL: Record<MemoryType, string> = {
  fact: "Fatto",
  preference: "Preferenza",
  decision: "Decisione",
  pattern: "Pattern",
  avoid: "Da evitare",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AIPersonasSessionsTab() {
  const qc = useQueryClient();
  const { effectiveCompany, user } = useAuth();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<PeriodKey>("30d");
  const [showArchived, setShowArchived] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [sessionQualityFilter, setSessionQualityFilter] = useState<SessionQualityFilter>("all");
  const debouncedSearch = useDebounce(searchInput.trim(), 300);

  // ── Selection state (bulk archive) ────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Drawer state ──────────────────────────────────────────────────────────
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  // ── Promote state (memoria) ───────────────────────────────────────────────
  const [promoteState, setPromoteState] = useState<{
    sessionId: string;
    personaKey: string;
    sourceMessageId: string | null;
    memoryType: MemoryType;
    content: string;
  } | null>(null);

  // ── Selection-to-promote (highlight passage) ──────────────────────────────
  // Floating button mostrato quando l'utente seleziona del testo dentro un
  // bubble assistant nel drawer.
  const [selectionPopover, setSelectionPopover] = useState<{
    x: number;
    y: number;
    text: string;
    messageId: string;
  } | null>(null);

  // ── Personas catalog ──────────────────────────────────────────────────────
  const { data: personas = [] } = useQuery({
    queryKey: ["sessions-personas-catalog"],
    queryFn: async (): Promise<PersonaLite[]> => {
      const { data, error } = await supabase
        .from("ai_personas_public" as never)
        .select("persona_key, display_name, category, color, icon");
      if (error) throw error;
      return ((data ?? []) as unknown as PersonaLite[])
        .filter((persona) => !isOrchestratorPersonaKey(persona.persona_key));
    },
    staleTime: 5 * 60 * 1000,
  });

  const personasForSessions = useMemo<PersonaLite[]>(
    () => personas.length > 0
      ? personas
      : DEMO_AI_PERSONAS.filter((persona) => !isOrchestratorPersonaKey(persona.persona_key)),
    [personas],
  );

  const knownPersonaKeys = useMemo(
    () => new Set(personasForSessions.map((persona) => persona.persona_key)),
    [personasForSessions],
  );

  const personaByKey = useMemo(() => {
    const m = new Map<string, PersonaLite>();
    for (const p of personasForSessions) m.set(p.persona_key, p);
    return m;
  }, [personasForSessions]);

  // ── Stats globali (RPC) con fallback graceful se non deployata ────────────
  // Se la RPC non esiste (migration non eseguita), facciamo fallback su query
  // dirette: count + select aggregato client-side sulla prima pagina. Non
  // perfetto ma evita la pagina con "—" dappertutto.
  // PERF: staleTime 30s -> evita refetch costosi su tab switch / window focus.
  // Le stats vengono comunque invalidate da archiveMut/bulkArchiveMut.onSuccess.
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ["ai-persona-sessions-stats", user?.id, filterPersona, filterPeriod, showArchived],
    enabled: !!user?.id,
    retry: false, // se RPC mancante, no retry inutili
    staleTime: 30_000,
    queryFn: async (): Promise<StatsRow> => {
      // Tentativo RPC (path ottimale)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpcResult = await (supabase as any).rpc("ai_persona_sessions_stats", {
        p_persona_key: filterPersona === "all" ? null : filterPersona,
        p_period_days: periodToDays(filterPeriod),
        p_include_archived: showArchived,
      });

      if (!rpcResult.error) {
        const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
        return {
          sessions_count: Number(row?.sessions_count ?? 0),
          messages_count: Number(row?.messages_count ?? 0),
          total_cost_eur: Number(row?.total_cost_eur ?? 0),
          top_persona_key: row?.top_persona_key ?? null,
          top_persona_count: Number(row?.top_persona_count ?? 0),
        };
      }

      // ⚠ FALLBACK: RPC non disponibile → calcolo client su tutte le sessioni
      // del filtro (con limite di sicurezza 500 per non saturare il browser).
      // Questo è il path "migration non ancora deployata" — degradiamo grazia.
      let q = supabase
        .from("ai_persona_sessions" as never)
        .select("persona_key, message_count, total_cost_billed_eur")
        .limit(500);
      if (filterPersona !== "all") q = q.eq("persona_key", filterPersona);
      if (!showArchived) q = q.eq("archived", false);
      const cutoff = periodToCutoffIso(filterPeriod);
      if (cutoff) q = q.gte("last_message_at", cutoff);

      const { data: rows, error: fallbackErr } = await q;
      if (fallbackErr) throw fallbackErr;

      type Lite = { persona_key: string; message_count: number; total_cost_billed_eur: number };
      const list = (rows ?? []) as unknown as Lite[];
      let messages = 0;
      let cost = 0;
      const byPersona = new Map<string, number>();
      for (const r of list) {
        messages += Number(r.message_count) || 0;
        cost += Number(r.total_cost_billed_eur) || 0;
        byPersona.set(r.persona_key, (byPersona.get(r.persona_key) ?? 0) + 1);
      }
      let topKey: string | null = null;
      let topCount = 0;
      byPersona.forEach((c, k) => { if (c > topCount) { topCount = c; topKey = k; } });
      return {
        sessions_count: list.length,
        messages_count: messages,
        total_cost_eur: cost,
        top_persona_key: topKey,
        top_persona_count: topCount,
      };
    },
  });

  // ── Paginated sessions (infinite scroll) ──────────────────────────────────
  const sessionsQ = useInfiniteQuery({
    queryKey: ["ai-persona-sessions-paginated", user?.id, filterPersona, filterPeriod, showArchived, debouncedSearch],
    enabled: !!user?.id,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("ai_persona_sessions" as never)
        .select("id, persona_key, title, message_count, total_cost_billed_eur, total_tokens_in, total_tokens_out, last_message_at, archived, created_at")
        .order("last_message_at", { ascending: false })
        .range(from, to);

      if (filterPersona !== "all") q = q.eq("persona_key", filterPersona);
      if (!showArchived) q = q.eq("archived", false);

      const cutoff = periodToCutoffIso(filterPeriod);
      if (cutoff) q = q.gte("last_message_at", cutoff);

      if (debouncedSearch) q = q.ilike("title", `%${debouncedSearch}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SessionRow[];
    },
    getNextPageParam: (lastPage, allPages) => {
      // Se l'ultima pagina è < PAGE_SIZE, abbiamo finito
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length; // next page index
    },
  });

  const allSessionsRaw = useMemo(
    () => sessionsQ.data?.pages.flat() ?? [],
    [sessionsQ.data],
  );

  const allSessions = useMemo<SessionRow[]>(
    () => allSessionsRaw.flatMap((session) => {
      if (knownPersonaKeys.has(session.persona_key)) return [session];
      const targetKey = resolveDemoPersonaKey(session.persona_key, knownPersonaKeys);
      if (!targetKey) return [];
      return [{ ...session, persona_key: targetKey }];
    }),
    [allSessionsRaw, knownPersonaKeys],
  );

  const isDemoCompany = effectiveCompany?.id === DEMO_COMPANY_ID;

  const demoPreviewSessions = useMemo<SessionRow[]>(() => {
    if (!isDemoCompany || allSessions.length > 0 || personasForSessions.length === 0) return [];

    const memoriesByPersona = new Map<string, typeof DEMO_MEMORIES>();
    for (const memory of DEMO_MEMORIES) {
      const targetKey = resolveDemoPersonaKey(memory.persona_key, knownPersonaKeys);
      if (!targetKey) continue;
      const list = memoriesByPersona.get(targetKey);
      if (list) list.push(memory);
      else memoriesByPersona.set(targetKey, [memory]);
    }

    const cutoff = periodToCutoffIso(filterPeriod);
    const searchNeedle = debouncedSearch.toLowerCase();

    return personasForSessions
      .map((persona, index) => {
        const personaMemories = memoriesByPersona.get(persona.persona_key) ?? [];
        const createdAt = new Date(Date.now() - (index + 1) * 23 * 60 * 60 * 1000).toISOString();
        const session: SessionRow = {
          id: `demo-session-${persona.persona_key}`,
          persona_key: persona.persona_key,
          title: buildDemoSessionTitle(persona, personaMemories.length),
          message_count: 4 + Math.min(6, Math.max(1, Math.ceil(personaMemories.length / 4))),
          total_cost_billed_eur: 0.006 + index * 0.0017,
          total_tokens_in: 680 + personaMemories.length * 14,
          total_tokens_out: 920 + personaMemories.length * 22,
          last_message_at: createdAt,
          archived: false,
          created_at: createdAt,
          isDemoPreview: true,
        };
        return session;
      })
      .filter((session) => {
        if (filterPersona !== "all" && session.persona_key !== filterPersona) return false;
        if (cutoff && new Date(session.last_message_at).getTime() < new Date(cutoff).getTime()) return false;
        if (showArchived && session.archived) return true;
        if (!showArchived && session.archived) return false;
        if (!searchNeedle) return true;
        const personaName = personaByKey.get(session.persona_key)?.display_name.toLowerCase() ?? "";
        return session.title.toLowerCase().includes(searchNeedle)
          || personaName.includes(searchNeedle)
          || session.persona_key.toLowerCase().includes(searchNeedle);
      });
  }, [
    allSessions.length,
    debouncedSearch,
    filterPeriod,
    filterPersona,
    isDemoCompany,
    knownPersonaKeys,
    personaByKey,
    personasForSessions,
    showArchived,
  ]);

  const sessionsForView = useMemo(
    () => applySessionQualityFilter(
      allSessions.length > 0 ? allSessions : demoPreviewSessions,
      sessionQualityFilter,
    ),
    [allSessions, demoPreviewSessions, sessionQualityFilter],
  );

  // ── Infinite scroll trigger via IntersectionObserver ──────────────────────
  // PERF: dipendiamo SOLO dai campi necessari (hasNextPage, isFetchingNextPage,
  // fetchNextPage). Se mettessimo l'intero `sessionsQ` come dep, l'observer
  // verrebbe ricreato ad ogni render (l'oggetto query cambia identita), con
  // overhead e potenziali race. fetchNextPage e' stabile per design react-query.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = sessionsQ;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Reset selezione quando filtri cambiano ────────────────────────────────
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterPersona, filterPeriod, showArchived, debouncedSearch, sessionQualityFilter]);

  // ── Open session messages (lazy on drawer open) ───────────────────────────
  // PERF: i messaggi sono IMMUTABILI dopo creazione -> staleTime Infinity.
  // Riaprire il drawer non rifa fetch. Memoria sotto controllo perche gcTime
  // default (5min) ripulisce le sessioni non aperte da tempo.
  const { data: openMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["ai-persona-session-messages", openSessionId],
    enabled: !!openSessionId && !openSessionId.startsWith("demo-session-"),
    staleTime: Infinity,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from("ai_persona_messages" as never)
        .select("id, role, content, cost_billed_eur, tokens_in, tokens_out, model_used, created_at")
        .eq("session_id", openSessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MessageRow[];
    },
  });

  const openSession = useMemo(
    () => sessionsForView.find((s) => s.id === openSessionId) ?? null,
    [sessionsForView, openSessionId],
  );

  const demoOpenMessages = useMemo<MessageRow[]>(() => {
    if (!openSession || !isDemoSession(openSession)) return [];
    const persona = personaByKey.get(openSession.persona_key);
    const personaMemories = DEMO_MEMORIES
      .filter((memory) => resolveDemoPersonaKey(memory.persona_key, knownPersonaKeys) === openSession.persona_key)
      .slice(0, 4);
    const started = new Date(openSession.created_at).getTime();
    const mainInsight = personaMemories[0]?.content ?? "Questa persona ha memoria operativa collegata al cervello AI.";
    const secondInsight = personaMemories[1]?.content ?? "La conversazione puo' diventare una memoria persistente con un click.";
    return [
      {
        id: `${openSession.id}-user-1`,
        role: "user",
        content: `Fammi un briefing rapido per ${persona?.display_name ?? openSession.persona_key}: cosa devo sapere oggi?`,
        cost_billed_eur: null,
        tokens_in: 120,
        tokens_out: null,
        model_used: null,
        created_at: new Date(started + 60_000).toISOString(),
        isDemoPreview: true,
      },
      {
        id: `${openSession.id}-assistant-1`,
        role: "assistant",
        content: `${mainInsight}\n\nAzione consigliata: trasformare questo punto in memoria se e' ancora valido, cosi' Silvio e le altre personas lo useranno nei prossimi prompt.`,
        cost_billed_eur: 0.0021,
        tokens_in: 320,
        tokens_out: 540,
        model_used: "demo-ai-persona",
        created_at: new Date(started + 140_000).toISOString(),
        isDemoPreview: true,
      },
      {
        id: `${openSession.id}-user-2`,
        role: "user",
        content: "Collegalo anche al contesto aziendale e dimmi che rischio devo controllare.",
        cost_billed_eur: null,
        tokens_in: 92,
        tokens_out: null,
        model_used: null,
        created_at: new Date(started + 220_000).toISOString(),
        isDemoPreview: true,
      },
      {
        id: `${openSession.id}-assistant-2`,
        role: "assistant",
        content: `${secondInsight}\n\nControllo QA: questa sessione ha abbastanza contesto per generare memoria, insight nel Cervello e follow-up nella Chat.`,
        cost_billed_eur: 0.0026,
        tokens_in: 380,
        tokens_out: 610,
        model_used: "demo-ai-persona",
        created_at: new Date(started + 330_000).toISOString(),
        isDemoPreview: true,
      },
    ];
  }, [knownPersonaKeys, openSession, personaByKey]);

  const messagesForOpenSession = isDemoSession(openSession) ? demoOpenMessages : openMessages;
  const messagesAreLoading = isDemoSession(openSession) ? false : messagesLoading;

  // ── Mutations ─────────────────────────────────────────────────────────────

  const archiveMut = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("ai_persona_sessions" as never)
        .update({ archived })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.archived ? "Sessione archiviata" : "Sessione riattivata");
      void qc.invalidateQueries({ queryKey: ["ai-persona-sessions-paginated"] });
      void qc.invalidateQueries({ queryKey: ["ai-persona-sessions-stats"] });
      void qc.invalidateQueries({ queryKey: ["my_persona_sessions"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const bulkArchiveMut = useMutation({
    mutationFn: async ({ ids, archived }: { ids: string[]; archived: boolean }) => {
      // Path 1: RPC bulk (1 UPDATE, ottimale)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpcResult = await (supabase as any).rpc("ai_persona_sessions_bulk_archive", {
        p_session_ids: ids,
        p_archived: archived,
      });
      if (!rpcResult.error) return Number(rpcResult.data ?? ids.length);

      // Path 2: fallback su UPDATE diretto con .in("id", ids) — la RLS owner
      // garantisce comunque che si tocchino solo le proprie sessioni.
      const { error } = await supabase
        .from("ai_persona_sessions" as never)
        .update({ archived })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count, vars) => {
      toast.success(
        vars.archived
          ? `${count} sessioni archiviate`
          : `${count} sessioni riattivate`,
      );
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: ["ai-persona-sessions-paginated"] });
      void qc.invalidateQueries({ queryKey: ["ai-persona-sessions-stats"] });
      void qc.invalidateQueries({ queryKey: ["my_persona_sessions"] });
    },
    onError: (e) => toast.error("Errore bulk archive", { description: String(e) }),
  });

  const promoteMut = useMutation({
    mutationFn: async (input: {
      personaKey: string;
      memoryType: MemoryType;
      content: string;
      sessionId: string;
    }) => {
      if (!effectiveCompany?.id) throw new Error("no_company");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("record_persona_memory", {
        p_company_id: effectiveCompany.id,
        p_user_id: user?.id ?? null,
        p_persona_key: input.personaKey,
        p_memory_type: input.memoryType,
        p_content: input.content.trim(),
        p_source: `session:${input.sessionId}`,
        p_confidence: 0.9,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Promosso a memoria persistente", {
        description: "La persona AI lo ricorderà nelle prossime conversazioni.",
      });
      setPromoteState(null);
      setSelectionPopover(null);
      void qc.invalidateQueries({ queryKey: ["ai-persona-memory"] });
    },
    onError: (e) => toast.error("Errore promozione", { description: String(e) }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(sessionsForView.filter((s) => !isDemoSession(s)).map((s) => s.id)));
  }, [sessionsForView]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleResume = useCallback((s: SessionRow) => {
    // Auto-resume completo: la chat tab leggerà ?sessionId per attivare la sessione.
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", "chat");
    sp.set("persona", s.persona_key);
    if (isDemoSession(s)) {
      sp.delete("sessionId");
      toast.info("Sessione demo", { description: "Apro la persona in chat reale: la demo non viene salvata." });
    } else {
      sp.set("sessionId", s.id);
    }
    window.history.pushState(null, "", `${window.location.pathname}?${sp.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setOpenSessionId(null);
  }, []);

  const handleExport = useCallback((s: SessionRow) => {
    const messages = isDemoSession(s) ? demoOpenMessages : openMessages;
    if (messages.length === 0) {
      toast.info("Apri prima la sessione per caricare i messaggi");
      return;
    }
    const persona = personaByKey.get(s.persona_key) ?? null;
    downloadMarkdown(s, messages, persona);
  }, [demoOpenMessages, openMessages, personaByKey]);

  const handlePromoteFull = useCallback((msg: MessageRow, session: SessionRow) => {
    setPromoteState({
      sessionId: session.id,
      personaKey: session.persona_key,
      sourceMessageId: msg.id,
      memoryType: "fact",
      content: msg.content.slice(0, 500),
    });
  }, []);

  const handlePromoteSelection = useCallback(() => {
    if (!selectionPopover || !openSession) return;
    setPromoteState({
      sessionId: openSession.id,
      personaKey: openSession.persona_key,
      sourceMessageId: selectionPopover.messageId,
      memoryType: "fact",
      content: selectionPopover.text,
    });
    setSelectionPopover(null);
  }, [selectionPopover, openSession]);

  // ── Selezione testo → "Promuovi selezione" popover ────────────────────────
  // PERF: usiamo 'mouseup' (1 fire per drag completo) anziche 'selectionchange'
  // (decine di fire al secondo durante un drag). Per selezione via tastiera
  // (Shift+Arrow) aggiungiamo 'keyup'. Early bail-out: se non c'e selezione o
  // < 12 char, niente DOM walk costoso (getBoundingClientRect + parentNode loop).
  useEffect(() => {
    if (!openSessionId) {
      setSelectionPopover(null);
      return;
    }
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        // niente selezione: clear solo se serve (evita re-render inutili)
        setSelectionPopover((prev) => (prev === null ? prev : null));
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 12) {
        setSelectionPopover((prev) => (prev === null ? prev : null));
        return;
      }
      // DOM walk (max ~10 livelli, costo trascurabile a questo punto)
      const findBubble = (n: Node | null | undefined): HTMLElement | null => {
        let cur: Node | null = n ?? null;
        while (cur) {
          if (cur instanceof HTMLElement && cur.dataset.bubbleRole === "assistant") {
            return cur;
          }
          cur = cur.parentNode;
        }
        return null;
      };
      const bubble = findBubble(sel.anchorNode) ?? findBubble(sel.focusNode);
      if (!bubble) {
        setSelectionPopover((prev) => (prev === null ? prev : null));
        return;
      }
      const messageId = bubble.dataset.messageId;
      if (!messageId) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setSelectionPopover({
        x: rect.left + rect.width / 2,
        y: rect.top,
        text,
        messageId,
      });
    };
    document.addEventListener("mouseup", handler);
    document.addEventListener("keyup", handler);
    return () => {
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("keyup", handler);
    };
  }, [openSessionId]);

  const sessionCoverage = useMemo(() => {
    const sessionsByPersona = new Map<string, number>();
    const knowledgeByPersona = new Map<string, number>();
    for (const session of (allSessions.length > 0 ? allSessions : demoPreviewSessions)) {
      if (!session.archived) {
        sessionsByPersona.set(session.persona_key, (sessionsByPersona.get(session.persona_key) ?? 0) + 1);
      }
      if (isKnowledgeCandidate(session)) {
        knowledgeByPersona.set(session.persona_key, (knowledgeByPersona.get(session.persona_key) ?? 0) + 1);
      }
    }
    const personasWithoutSessions = personasForSessions.filter((persona) => !sessionsByPersona.has(persona.persona_key));
    const coveragePct = personasForSessions.length > 0
      ? Math.round((sessionsByPersona.size / personasForSessions.length) * 100)
      : 0;
    return {
      sessionsByPersona,
      knowledgeByPersona,
      personasWithoutSessions,
      coveragePct,
    };
  }, [allSessions, demoPreviewSessions, personasForSessions]);

  const sessionOps = useMemo(() => {
    const sourceSessions = allSessions.length > 0 ? allSessions : demoPreviewSessions;
    const demoCount = sourceSessions.filter(isDemoSession).length;
    const knowledgeCount = sourceSessions.filter(isKnowledgeCandidate).length;
    const costlyCount = sourceSessions.filter(isCostlySession).length;
    const shortCount = sourceSessions.filter(isShortSession).length;
    const inactiveCount = sourceSessions.filter(isInactiveSession).length;
    const totalCost = sourceSessions.reduce((sum, session) => sum + Number(session.total_cost_billed_eur ?? 0), 0);
    const healthAvg = sourceSessions.length > 0
      ? Math.round(sourceSessions.reduce((sum, session) => sum + sessionHealthScore(session), 0) / sourceSessions.length)
      : 0;
    return {
      realCount: allSessions.length,
      demoCount,
      knowledgeCount,
      costlyCount,
      shortCount,
      inactiveCount,
      totalCost,
      healthAvg,
    };
  }, [allSessions, demoPreviewSessions]);

  const displayStats = useMemo<StatsRow>(() => {
    const sourceSessions = allSessions.length > 0 ? allSessions : demoPreviewSessions;
    if (sourceSessions.length > 0) {
      const top = [...sessionCoverage.sessionsByPersona.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        sessions_count: sourceSessions.length,
        messages_count: sourceSessions.reduce((sum, session) => sum + session.message_count, 0),
        total_cost_eur: sourceSessions.reduce((sum, session) => sum + Number(session.total_cost_billed_eur ?? 0), 0),
        top_persona_key: top?.[0] ?? null,
        top_persona_count: top?.[1] ?? 0,
      };
    }
    return {
      sessions_count: stats?.sessions_count ?? 0,
      messages_count: stats?.messages_count ?? 0,
      total_cost_eur: stats?.total_cost_eur ?? 0,
      top_persona_key: stats?.top_persona_key && !isOrchestratorPersonaKey(stats.top_persona_key) ? stats.top_persona_key : null,
      top_persona_count: stats?.top_persona_key && !isOrchestratorPersonaKey(stats.top_persona_key) ? stats.top_persona_count : 0,
    };
  }, [allSessions, demoPreviewSessions, sessionCoverage.sessionsByPersona, stats]);

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-violet-200 bg-gradient-to-br from-violet-50 via-white to-slate-50 dark:from-violet-950/20 dark:via-background dark:to-background">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-violet-100 text-violet-700 border-violet-200">
                  <Database className="h-3 w-3" />
                  {sessionOps.realCount} reali
                </Badge>
                {sessionOps.demoCount > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <Sparkles className="h-3 w-3" />
                    Sessioni demo {sessionOps.demoCount}
                  </Badge>
                )}
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  {sessionCoverage.coveragePct}% copertura
                </Badge>
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Centro controllo sessioni</h2>
                <p className="text-xs text-muted-foreground">
                  Trasforma le conversazioni AI in memoria persistente, controlla costi, copertura personas e sessioni da rivedere.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[420px]">
              <div className="rounded-lg border bg-white/80 p-2 dark:bg-background/60">
                <p className="text-xl font-bold tabular-nums">{sessionOps.knowledgeCount}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">da trasformare</p>
              </div>
              <div className="rounded-lg border bg-white/80 p-2 dark:bg-background/60">
                <p className="text-xl font-bold tabular-nums">{sessionOps.healthAvg}%</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">salute</p>
              </div>
              <div className="rounded-lg border bg-white/80 p-2 dark:bg-background/60">
                <p className="text-xl font-bold tabular-nums">{fmtEur(sessionOps.totalCost, 3)}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">costo</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats banner — sempre globale, non sul paginato. Skeleton durante load. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {statsLoading && sessionOps.demoCount === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-3 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              label="Sessioni"
              value={String(displayStats.sessions_count)}
              icon={<History className="h-3.5 w-3.5" />}
              subtitle={sessionOps.demoCount > 0 ? "anteprima Demo Azienda" : showArchived ? "incl. archiviate" : "solo attive"}
              accent="emerald"
            />
            <StatCard
              label="Messaggi"
              value={String(displayStats.messages_count)}
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              subtitle={
                displayStats.sessions_count > 0
                  ? `media ${Math.round(displayStats.messages_count / displayStats.sessions_count)}/sess`
                  : "nessuna chat ancora"
              }
              accent="blue"
            />
            <StatCard
              label="Costo periodo"
              value={fmtEur(displayStats.total_cost_eur, 3)}
              icon={<Coins className="h-3.5 w-3.5" />}
              subtitle="scalato dal saldo AI"
              accent="amber"
            />
            <StatCard
              label="Persona top"
              value={displayStats.top_persona_key ? personaByKey.get(displayStats.top_persona_key)?.display_name ?? displayStats.top_persona_key : "—"}
              icon={<Sparkles className="h-3.5 w-3.5" />}
              subtitle={displayStats.top_persona_count > 0 ? `${displayStats.top_persona_count} sessioni` : "—"}
              accent="violet"
            />
          </>
        )}
      </div>

      {statsError && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-2 py-1">
          Statistiche non disponibili (RPC non deployata). I numeri possono essere parziali.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Copertura conversazioni per persona</p>
              <p className="text-xs text-muted-foreground">
                Vedi quali AI hanno gia' conversazioni utili e quali non hanno ancora contesto reale.
              </p>
            </div>
            {sessionCoverage.personasWithoutSessions.length > 0 ? (
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                <ShieldAlert className="h-3 w-3" />
                {sessionCoverage.personasWithoutSessions.length} senza sessioni
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                Tutte coperte
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {personasForSessions.map((persona) => {
              const count = sessionCoverage.sessionsByPersona.get(persona.persona_key) ?? 0;
              const knowledgeCount = sessionCoverage.knowledgeByPersona.get(persona.persona_key) ?? 0;
              const pct = count > 0 ? Math.min(100, 34 + count * 22 + knowledgeCount * 12) : 8;
              return (
                <button
                  key={persona.persona_key}
                  type="button"
                  onClick={() => setFilterPersona(persona.persona_key)}
                  className={cn(
                    "rounded-lg border p-2 text-left transition-colors hover:bg-muted/50",
                    filterPersona === persona.persona_key && "border-violet-300 bg-violet-50 text-violet-950",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold">{persona.display_name}</p>
                    <span className="text-xs font-bold tabular-nums">{count}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn("h-full rounded-full", count === 0 ? "bg-rose-400" : knowledgeCount > 0 ? "bg-emerald-500" : "bg-amber-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {count === 0 ? "da avviare" : knowledgeCount > 0 ? `${knowledgeCount} utili` : "solo chat breve"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-violet-600" />
            <p className="text-sm font-semibold">Da conversazione a memoria</p>
          </div>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-violet-100 text-center text-[11px] font-bold leading-5 text-violet-700">1</span>
              Apri una sessione con almeno 4 messaggi.
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-violet-100 text-center text-[11px] font-bold leading-5 text-violet-700">2</span>
              Seleziona la frase importante o usa Promuovi tutto.
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-violet-100 text-center text-[11px] font-bold leading-5 text-violet-700">3</span>
              Salvala in Memoria e poi controlla il collegamento nel Cervello.
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild className="h-8 gap-1.5">
              <a href="/azienda/impostazioni/ai-memoria?tab=memoria">
                <Brain className="h-3.5 w-3.5" />
                Apri in Memoria
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild className="h-8 gap-1.5">
              <a href="/azienda/impostazioni/ai-memoria?tab=cervello">
                <Network className="h-3.5 w-3.5" />
                Vedi nel Cervello
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Select value={filterPersona} onValueChange={setFilterPersona}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le personas</SelectItem>
            {personasForSessions.map((p) => (
              <SelectItem key={p.persona_key} value={p.persona_key}>{p.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as PeriodKey)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((p) => (
              <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per titolo…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-9"
          />
          {searchInput && searchInput !== debouncedSearch && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived(!showArchived)}
          className="h-9 gap-2"
        >
          {showArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          {showArchived ? "Nascondi archiviate" : "Mostra archiviate"}
        </Button>

        <Badge variant="outline" className="ml-auto text-xs">
          {sessionsForView.length} sessioni
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { value: "all", label: "Tutte", icon: FilterX },
          { value: "knowledge", label: "Da trasformare", icon: Brain },
          { value: "costly", label: "Costo alto", icon: Coins },
          { value: "short", label: "Brevi", icon: MessageSquare },
          { value: "inactive", label: "Ferme", icon: Clock3 },
          { value: "demo", label: "Sessioni demo", icon: Sparkles },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={sessionQualityFilter === item.value ? "default" : "outline"}
              className="h-8 gap-1.5"
              onClick={() => setSessionQualityFilter(item.value as SessionQualityFilter)}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Button>
          );
        })}
      </div>

      {/* Bulk action bar (mostrata solo con selezione attiva) */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 rounded-lg border border-violet-300 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-700 px-3 py-2 flex items-center gap-2 shadow-sm">
          <CheckSquare className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-medium">
            {selectedIds.size} {selectedIds.size === 1 ? "sessione selezionata" : "sessioni selezionate"}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={selectAllVisible}
            className="h-8 gap-1.5"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Tutte visibili ({sessionsForView.filter((s) => !isDemoSession(s)).length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkArchiveMut.mutate({ ids: Array.from(selectedIds), archived: !showArchived })}
            disabled={bulkArchiveMut.isPending}
            className="h-8 gap-1.5"
          >
            {bulkArchiveMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : showArchived ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {showArchived ? "Riattiva tutte" : "Archivia tutte"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            className="h-8 gap-1.5 ml-auto"
          >
            <X className="h-3.5 w-3.5" />
            Annulla
          </Button>
        </div>
      )}

      {/* Sessions list */}
      {sessionsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : sessionsForView.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nessuna sessione per questi filtri</p>
            <p className="text-xs mt-1">
              Apri la tab <strong>Chat</strong> e parla con una delle 18 personas.
              Le conversazioni appariranno qui, e potrai promuoverne i passaggi più utili a memoria persistente.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button size="sm" asChild className="gap-2">
                <a href="/azienda/impostazioni/ai-memoria?tab=chat">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Apri Chat
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setSessionQualityFilter("all");
                  setFilterPersona("all");
                  setFilterPeriod("30d");
                  setShowArchived(false);
                  setSearchInput("");
                }}
              >
                <FilterX className="h-3.5 w-3.5" />
                Pulisci filtri
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {sessionsForView.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                persona={personaByKey.get(s.persona_key) ?? null}
                selected={selectedIds.has(s.id)}
                onToggleSelect={() => toggleSelect(s.id)}
                onOpen={() => setOpenSessionId(s.id)}
                onResume={() => handleResume(s)}
                onArchive={() => archiveMut.mutate({ id: s.id, archived: !s.archived })}
                archivePending={archiveMut.isPending}
                hasAnySelection={selectedIds.size > 0}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />

          {sessionsQ.isFetchingNextPage && (
            <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carico altre sessioni…
            </div>
          )}

          {!sessionsQ.hasNextPage && allSessions.length >= PAGE_SIZE && (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Fine elenco · {allSessions.length} sessioni mostrate
              {stats && stats.sessions_count > allSessions.length && (
                <> su {stats.sessions_count} totali (riduci il periodo per vedere più indietro)</>
              )}
            </p>
          )}
        </>
      )}

      {/* Drawer dettaglio sessione */}
      <Sheet open={!!openSessionId} onOpenChange={(v) => !v && setOpenSessionId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-violet-600" />
              {openSession?.title ?? "Sessione"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {openSession ? (
                <>
                  {personaByKey.get(openSession.persona_key)?.display_name ?? openSession.persona_key} ·{" "}
                  {openSession.message_count} messaggi ·{" "}
                  {fmtEur(openSession.total_cost_billed_eur, 4)} · iniziata{" "}
                  {fmtRelative(openSession.created_at)}
                </>
              ) : "Caricamento…"}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 py-2 border-b flex flex-wrap items-center gap-2 bg-muted/30">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openSession && handleResume(openSession)}
              className="gap-2"
              disabled={!openSession}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Continua chat
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openSession && handleExport(openSession)}
              className="gap-2"
              disabled={!openSession || messagesForOpenSession.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Esporta MD
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openSession && archiveMut.mutate({ id: openSession.id, archived: !openSession.archived })}
              className="gap-2 ml-auto"
              disabled={!openSession || archiveMut.isPending || isDemoSession(openSession)}
            >
              {openSession?.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {openSession?.archived ? "Riattiva" : "Archivia"}
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground bg-violet-50/50 dark:bg-violet-950/20 px-4 py-1.5 border-b">
            <strong>Tip:</strong> seleziona del testo nella risposta AI per promuovere solo quella frase a memoria.
          </p>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {messagesAreLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : messagesForOpenSession.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  Nessun messaggio (sessione vuota)
                </p>
              ) : (
                messagesForOpenSession
                  .filter((m) => m.role !== "system" && m.role !== "tool")
                  .map((m) => (
                    <SessionMessageBubble
                      key={m.id}
                      message={m}
                      persona={openSession ? personaByKey.get(openSession.persona_key) ?? null : null}
                      onPromote={() => openSession && handlePromoteFull(m, openSession)}
                    />
                  ))
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Floating "Promuovi selezione" tooltip */}
      {selectionPopover && (
        <div
          className="fixed z-[60] -translate-x-1/2 -translate-y-full"
          style={{ left: selectionPopover.x, top: selectionPopover.y - 8 }}
        >
          <button
            type="button"
            onClick={handlePromoteSelection}
            className="bg-violet-600 hover:bg-violet-700 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 transition-colors animate-in fade-in slide-in-from-bottom-1"
          >
            <Brain className="h-3 w-3" />
            Promuovi selezione a memoria
          </button>
        </div>
      )}

      {/* Promote-to-memory dialog */}
      <Dialog
        open={!!promoteState}
        onOpenChange={(v) => !v && setPromoteState(null)}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-violet-600" />
              Promuovi a memoria persistente
            </DialogTitle>
            <DialogDescription>
              Il testo qui sotto verrà salvato come memoria della persona{" "}
              <strong>{promoteState ? personaByKey.get(promoteState.personaKey)?.display_name ?? promoteState.personaKey : ""}</strong>.
              Sarà iniettato nelle prossime conversazioni come contesto.
            </DialogDescription>
          </DialogHeader>

          {promoteState && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Tipo di memoria</Label>
                <Select
                  value={promoteState.memoryType}
                  onValueChange={(v) => setPromoteState({ ...promoteState, memoryType: v as MemoryType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABEL).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Contenuto (modifica liberamente)</Label>
                <Textarea
                  value={promoteState.content}
                  onChange={(e) => setPromoteState({ ...promoteState, content: e.target.value })}
                  rows={5}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Suggerimento: riassumi in una frase chiara. Es. "Il cliente Rossi paga sempre a 60gg".
                </p>
              </div>

              <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2">
                <strong>Provenienza:</strong> sessione{" "}
                <code className="bg-background rounded px-1">{promoteState.sessionId.slice(0, 8)}</code>
                {" — "}fiducia 90% (user-promoted).
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteState(null)}>Annulla</Button>
            <Button
              onClick={() =>
                promoteState && promoteMut.mutate({
                  personaKey: promoteState.personaKey,
                  memoryType: promoteState.memoryType,
                  content: promoteState.content,
                  sessionId: promoteState.sessionId,
                })
              }
              disabled={!promoteState || promoteMut.isPending || !promoteState.content.trim()}
              className="gap-2"
            >
              {promoteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              Salva in memoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const ACCENT_CLS: Record<string, string> = {
  emerald: "border-l-emerald-500",
  blue: "border-l-blue-500",
  amber: "border-l-amber-500",
  violet: "border-l-violet-500",
};

function StatCard({
  label, value, icon, subtitle, accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
  accent?: keyof typeof ACCENT_CLS;
}) {
  const accentCls = accent ? ACCENT_CLS[accent] : "border-l-slate-300";
  return (
    <div className={cn("rounded-lg border border-l-4 bg-card p-3 transition-colors", accentCls)}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-0.5 truncate" title={value}>{value}</div>
      {subtitle && (
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</div>
      )}
    </div>
  );
}

function SessionCard({
  session, persona, selected, onToggleSelect, onOpen, onResume, onArchive,
  archivePending, hasAnySelection,
}: {
  session: SessionRow;
  persona: PersonaLite | null;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onResume: () => void;
  onArchive: () => void;
  archivePending: boolean;
  hasAnySelection: boolean;
}) {
  const demoPreview = isDemoSession(session);
  const health = sessionHealthScore(session);
  const knowledgeCandidate = isKnowledgeCandidate(session);
  const costly = isCostlySession(session);
  const short = isShortSession(session);
  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-all",
        session.archived && "opacity-60",
        demoPreview && "border-amber-200 bg-amber-50/30",
        selected ? "border-violet-400 ring-1 ring-violet-200 bg-violet-50/30 dark:bg-violet-950/10" : "hover:bg-muted/30",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="pt-1.5 shrink-0">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            aria-label="Seleziona sessione"
            disabled={demoPreview}
          />
        </div>
        <button
          type="button"
          onClick={hasAnySelection && !demoPreview ? onToggleSelect : onOpen}
          className="flex-1 text-left flex items-start gap-3 min-w-0"
        >
          {(() => {
            const PIcon = getPersonaIcon(persona?.icon);
            const colorCls = getPersonaColorRing(persona?.color);
            return (
              <div className={cn("shrink-0 h-9 w-9 rounded-lg ring-1 flex items-center justify-center", colorCls)}>
                <PIcon className="h-4 w-4" />
              </div>
            );
          })()}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{session.title}</span>
              {demoPreview && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-700 border-amber-200">demo</Badge>
              )}
              {knowledgeCandidate && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">da trasformare</Badge>
              )}
              {costly && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-orange-50 text-orange-700 border-orange-200">costo alto</Badge>
              )}
              {short && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-slate-100 text-slate-600 border-slate-200">breve</Badge>
              )}
              {session.archived && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">archiviata</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{persona?.display_name ?? session.persona_key}</span>
              <span>·</span>
              <span>{session.message_count} msg</span>
              <span>·</span>
              <span>{fmtEur(session.total_cost_billed_eur, 4)}</span>
              <span>·</span>
              <span>{fmtRelative(session.last_message_at)}</span>
              <span>·</span>
              <span>QA {health}%</span>
            </div>
            <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", health >= 80 ? "bg-emerald-500" : health >= 60 ? "bg-amber-500" : "bg-rose-500")}
                style={{ width: `${Math.max(health, 8)}%` }}
              />
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        </button>
      </div>
      <div className="border-t px-3 py-2 flex flex-wrap items-center gap-2 bg-muted/20">
        <Button size="sm" variant="ghost" onClick={onResume} className="h-7 gap-1.5 text-xs">
          <ExternalLink className="h-3 w-3" />
          Continua chat
        </Button>
        <Button size="sm" variant="ghost" asChild className="h-7 gap-1.5 text-xs">
          <a href={`/azienda/impostazioni/ai-memoria?tab=memoria&persona=${encodeURIComponent(session.persona_key)}`}>
            <Brain className="h-3 w-3" />
            Apri in Memoria
          </a>
        </Button>
        <Button size="sm" variant="ghost" asChild className="h-7 gap-1.5 text-xs">
          <a href={`/azienda/impostazioni/ai-memoria?tab=cervello&persona=${encodeURIComponent(session.persona_key)}`}>
            <Link2 className="h-3 w-3" />
            Vedi nel Cervello
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onArchive}
          disabled={archivePending || demoPreview}
          className="h-7 gap-1.5 text-xs ml-auto"
        >
          {session.archived ? (
            <>
              <ArchiveRestore className="h-3 w-3" />
              Riattiva
            </>
          ) : (
            <>
              <Archive className="h-3 w-3" />
              Archivia
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function SessionMessageBubble({
  message, persona, onPromote,
}: {
  message: MessageRow;
  persona: PersonaLite | null;
  onPromote: () => void;
}) {
  const isUser = message.role === "user";
  const PIcon = getPersonaIcon(persona?.icon);
  const personaColorCls = getPersonaColorRing(persona?.color);
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div className={cn(
        "shrink-0 h-7 w-7 rounded-md flex items-center justify-center ring-1",
        isUser
          ? "bg-slate-700 text-white ring-slate-600"
          : personaColorCls,
      )}>
        {isUser ? <UserIcon className="h-3.5 w-3.5" /> : <PIcon className="h-3.5 w-3.5" />}
      </div>
      <div
        data-bubble-role={isUser ? "user" : "assistant"}
        data-message-id={message.id}
        className={cn(
          "rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap break-words",
          isUser
            ? "bg-slate-800 text-slate-50 dark:bg-slate-700"
            : "bg-muted",
        )}
      >
        <div className="text-[10px] opacity-70 mb-1">
          {isUser ? "Tu" : persona?.display_name ?? "Assistente"}
          {" · "}
          {new Date(message.created_at).toLocaleString("it-IT", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </div>
        {message.content}
        {!isUser && (
          <div className="mt-2 pt-2 border-t border-foreground/10 flex items-center justify-between gap-2 text-[10px] opacity-80">
            <span>
              {message.tokens_in ?? 0} → {message.tokens_out ?? 0} tok ·{" "}
              {fmtEur(message.cost_billed_eur, 5)}
              {message.model_used && <> · <span className="font-mono">{message.model_used}</span></>}
            </span>
            <button
              type="button"
              onClick={onPromote}
              className="inline-flex items-center gap-1 hover:bg-foreground/10 rounded px-1.5 py-0.5 transition-colors"
              title="Salva l'intero messaggio come memoria persistente"
            >
              <Brain className="h-3 w-3" />
              Promuovi tutto
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
