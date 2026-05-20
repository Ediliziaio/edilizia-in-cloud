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
  CheckSquare, X, Sparkles,
} from "lucide-react";

// ─── Constants & helpers ─────────────────────────────────────────────────────

const PAGE_SIZE = 50;

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
      return (data ?? []) as unknown as PersonaLite[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const personaByKey = useMemo(() => {
    const m = new Map<string, PersonaLite>();
    for (const p of personas) m.set(p.persona_key, p);
    return m;
  }, [personas]);

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

  const allSessions = useMemo(
    () => sessionsQ.data?.pages.flat() ?? [],
    [sessionsQ.data],
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
  }, [filterPersona, filterPeriod, showArchived, debouncedSearch]);

  // ── Open session messages (lazy on drawer open) ───────────────────────────
  // PERF: i messaggi sono IMMUTABILI dopo creazione -> staleTime Infinity.
  // Riaprire il drawer non rifa fetch. Memoria sotto controllo perche gcTime
  // default (5min) ripulisce le sessioni non aperte da tempo.
  const { data: openMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["ai-persona-session-messages", openSessionId],
    enabled: !!openSessionId,
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
    () => allSessions.find((s) => s.id === openSessionId) ?? null,
    [allSessions, openSessionId],
  );

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
    setSelectedIds(new Set(allSessions.map((s) => s.id)));
  }, [allSessions]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleResume = useCallback((s: SessionRow) => {
    // Auto-resume completo: la chat tab leggerà ?sessionId per attivare la sessione.
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", "chat");
    sp.set("persona", s.persona_key);
    sp.set("sessionId", s.id);
    window.history.pushState(null, "", `${window.location.pathname}?${sp.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setOpenSessionId(null);
  }, []);

  const handleExport = useCallback((s: SessionRow) => {
    if (openMessages.length === 0) {
      toast.info("Apri prima la sessione per caricare i messaggi");
      return;
    }
    const persona = personaByKey.get(s.persona_key) ?? null;
    downloadMarkdown(s, openMessages, persona);
  }, [openMessages, personaByKey]);

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

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stats banner — sempre globale, non sul paginato. Skeleton durante load. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {statsLoading ? (
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
              value={String(stats?.sessions_count ?? 0)}
              icon={<History className="h-3.5 w-3.5" />}
              subtitle={showArchived ? "incl. archiviate" : "solo attive"}
              accent="emerald"
            />
            <StatCard
              label="Messaggi"
              value={String(stats?.messages_count ?? 0)}
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              subtitle={
                stats && stats.sessions_count > 0
                  ? `media ${Math.round(stats.messages_count / stats.sessions_count)}/sess`
                  : "nessuna chat ancora"
              }
              accent="blue"
            />
            <StatCard
              label="Costo periodo"
              value={fmtEur(stats?.total_cost_eur ?? 0, 3)}
              icon={<Coins className="h-3.5 w-3.5" />}
              subtitle="scalato dal saldo AI"
              accent="amber"
            />
            <StatCard
              label="Persona top"
              value={stats?.top_persona_key ? personaByKey.get(stats.top_persona_key)?.display_name ?? stats.top_persona_key : "—"}
              icon={<Sparkles className="h-3.5 w-3.5" />}
              subtitle={stats && stats.top_persona_count > 0 ? `${stats.top_persona_count} sessioni` : "—"}
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterPersona} onValueChange={setFilterPersona}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le personas</SelectItem>
            {personas.map((p) => (
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
            Tutte visibili ({allSessions.length})
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
      ) : allSessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nessuna sessione per questi filtri</p>
            <p className="text-xs mt-1">
              Apri la tab <strong>Chat</strong> e parla con una delle 18 personas.
              Le conversazioni appariranno qui, e potrai promuoverne i passaggi più utili a memoria persistente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {allSessions.map((s) => (
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
              disabled={!openSession || openMessages.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Esporta MD
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openSession && archiveMut.mutate({ id: openSession.id, archived: !openSession.archived })}
              className="gap-2 ml-auto"
              disabled={!openSession || archiveMut.isPending}
            >
              {openSession?.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {openSession?.archived ? "Riattiva" : "Archivia"}
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground bg-violet-50/50 dark:bg-violet-950/20 px-4 py-1.5 border-b">
            💡 <strong>Tip:</strong> seleziona del testo nella risposta AI per promuovere solo quella frase a memoria.
          </p>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {messagesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : openMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  Nessun messaggio (sessione vuota)
                </p>
              ) : (
                openMessages
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
        <DialogContent className="sm:max-w-lg">
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
  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-all",
        session.archived && "opacity-60",
        selected ? "border-violet-400 ring-1 ring-violet-200 bg-violet-50/30 dark:bg-violet-950/10" : "hover:bg-muted/30",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="pt-1.5 shrink-0">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            aria-label="Seleziona sessione"
          />
        </div>
        <button
          type="button"
          onClick={hasAnySelection ? onToggleSelect : onOpen}
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
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        </button>
      </div>
      <div className="border-t px-3 py-2 flex items-center gap-2 bg-muted/20">
        <Button size="sm" variant="ghost" onClick={onResume} className="h-7 gap-1.5 text-xs">
          <ExternalLink className="h-3 w-3" />
          Continua chat
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onArchive}
          disabled={archivePending}
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
