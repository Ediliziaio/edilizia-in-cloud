/**
 * AIPersonasSessionsTab — v8.6.72 (rev. 2026-05-20)
 *
 * Tab "Sessioni" dell'hub AI Personas. Mostra lo storico delle conversazioni
 * (ai_persona_sessions + ai_persona_messages) con focus su:
 *
 *   1. Lista filtrabile delle sessioni passate
 *   2. Drawer dettaglio messaggi (read-only)
 *   3. "Promuovi a memoria" — converte un messaggio AI in fact/preference/
 *      decision permanente in ai_persona_memory (RPC record_persona_memory).
 *      Questo chiude il loop richiesto dall'utente: "le conversazioni
 *      alimentano la memoria perche tutto migliora".
 *
 * Azioni per-sessione:
 *   - Apri (drawer dettaglio)
 *   - Continua chat (porta alla tab Chat con sessionId resumed)
 *   - Archivia / Riattiva
 *   - Esporta Markdown (download .md della trascrizione)
 *
 * RLS: ai_persona_sessions_owner filtra automaticamente per user_id=auth.uid().
 *      L'utente vede solo le proprie sessioni private.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Search, Archive, ArchiveRestore, Download, MessageSquare, Brain, Sparkles,
  History, Coins, ChevronRight, Loader2, ExternalLink, BotIcon, UserIcon,
} from "lucide-react";

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

type MemoryType = "fact" | "preference" | "decision" | "pattern" | "avoid";

const TYPE_LABEL: Record<MemoryType, string> = {
  fact: "Fatto",
  preference: "Preferenza",
  decision: "Decisione",
  pattern: "Pattern",
  avoid: "Da evitare",
};

const PERIOD_OPTIONS = [
  { key: "7d",  label: "Ultimi 7 giorni" },
  { key: "30d", label: "Ultimi 30 giorni" },
  { key: "90d", label: "Ultimi 90 giorni" },
  { key: "all", label: "Tutte" },
] as const;

type PeriodKey = (typeof PERIOD_OPTIONS)[number]["key"];

function periodToCutoff(p: PeriodKey): string | null {
  if (p === "all") return null;
  const days = p === "7d" ? 7 : p === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function fmtRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = now - t;
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
    const when = new Date(m.created_at).toLocaleString("it-IT");
    lines.push(`### ${who} · _${when}_`);
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function AIPersonasSessionsTab() {
  const qc = useQueryClient();
  const { effectiveCompany, user } = useAuth();

  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<PeriodKey>("30d");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  // Drawer state
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  // Promote-to-memory dialog state
  const [promoteState, setPromoteState] = useState<{
    open: boolean;
    sessionId: string;
    personaKey: string;
    sourceMessageId: string;
    memoryType: MemoryType;
    content: string;
  } | null>(null);

  // ── Personas catalog (per icon/color/label nella lista) ───────────────────
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

  // ── Sessions list ──────────────────────────────────────────────────────────
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["ai-persona-sessions-tab", user?.id, filterPersona, filterPeriod, showArchived],
    enabled: !!user?.id,
    queryFn: async (): Promise<SessionRow[]> => {
      let q = supabase
        .from("ai_persona_sessions" as never)
        .select("id, persona_key, title, message_count, total_cost_billed_eur, total_tokens_in, total_tokens_out, last_message_at, archived, created_at")
        .order("last_message_at", { ascending: false })
        .limit(100);

      if (filterPersona !== "all") q = q.eq("persona_key", filterPersona);
      if (!showArchived) q = q.eq("archived", false);

      const cutoff = periodToCutoff(filterPeriod);
      if (cutoff) q = q.gte("last_message_at", cutoff);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SessionRow[];
    },
  });

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const s = search.toLowerCase();
    return sessions.filter((row) => row.title.toLowerCase().includes(s));
  }, [sessions, search]);

  // ── Aggregate stats (sul set FILTRATO, niente surprise) ────────────────────
  const stats = useMemo(() => {
    let messages = 0;
    let cost = 0;
    const byPersona = new Map<string, number>();
    for (const s of sessions) {
      messages += s.message_count;
      cost += Number(s.total_cost_billed_eur);
      byPersona.set(s.persona_key, (byPersona.get(s.persona_key) ?? 0) + 1);
    }
    let topPersonaKey: string | null = null;
    let topCount = 0;
    byPersona.forEach((c, k) => {
      if (c > topCount) {
        topCount = c;
        topPersonaKey = k;
      }
    });
    return {
      sessionsCount: sessions.length,
      messagesCount: messages,
      costEur: cost,
      topPersona: topPersonaKey ? personaByKey.get(topPersonaKey)?.display_name ?? topPersonaKey : null,
      topPersonaCount: topCount,
    };
  }, [sessions, personaByKey]);

  // ── Open session messages (lazy on drawer open) ────────────────────────────
  const { data: openMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["ai-persona-session-messages", openSessionId],
    enabled: !!openSessionId,
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
    () => sessions.find((s) => s.id === openSessionId) ?? null,
    [sessions, openSessionId],
  );

  // ── Mutations ──────────────────────────────────────────────────────────────

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
      void qc.invalidateQueries({ queryKey: ["ai-persona-sessions-tab"] });
      void qc.invalidateQueries({ queryKey: ["my_persona_sessions"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
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
        p_confidence: 0.9, // user-promoted = alta fiducia
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Promosso a memoria persistente", {
        description: "La persona AI lo ricorderà nelle prossime conversazioni.",
      });
      setPromoteState(null);
      void qc.invalidateQueries({ queryKey: ["ai-persona-memory"] });
    },
    onError: (e) => toast.error("Errore promozione", { description: String(e) }),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleResume = (s: SessionRow) => {
    // Apre la tab Chat con la sessione preselezionata.
    // AssistenteAIPage non legge ?sessionId, ma legge ?persona; combinato con
    // il fatto che le sessioni recenti sono in sidebar sx, l'utente le riprende
    // da lì. Per ora apriamo solo la persona, lasciando alla sidebar la ripresa
    // (UX accettabile come MVP — TODO: parametro ?sessionId in autosend).
    const sp = new URLSearchParams();
    sp.set("tab", "chat");
    sp.set("persona", s.persona_key);
    window.history.pushState(null, "", `?${sp.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setOpenSessionId(null);
  };

  const handleExport = (s: SessionRow) => {
    if (openMessages.length === 0) {
      toast.info("Apri prima la sessione per caricare i messaggi");
      return;
    }
    const persona = personaByKey.get(s.persona_key) ?? null;
    downloadMarkdown(s, openMessages, persona);
  };

  const handlePromoteClick = (msg: MessageRow, session: SessionRow) => {
    setPromoteState({
      open: true,
      sessionId: session.id,
      personaKey: session.persona_key,
      sourceMessageId: msg.id,
      memoryType: "fact",
      content: msg.content.slice(0, 500), // pre-popola con primi 500 char
    });
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stats banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard
          label="Sessioni"
          value={String(stats.sessionsCount)}
          icon={<History className="h-3.5 w-3.5" />}
          subtitle={showArchived ? "incl. archiviate" : "solo attive"}
        />
        <StatCard
          label="Messaggi"
          value={String(stats.messagesCount)}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          subtitle={`media ${stats.sessionsCount > 0 ? Math.round(stats.messagesCount / stats.sessionsCount) : 0}/sess`}
        />
        <StatCard
          label="Costo periodo"
          value={fmtEur(stats.costEur, 3)}
          icon={<Coins className="h-3.5 w-3.5" />}
          subtitle="scalato dal saldo AI"
        />
        <StatCard
          label="Persona top"
          value={stats.topPersona ?? "—"}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          subtitle={stats.topPersonaCount > 0 ? `${stats.topPersonaCount} sessioni` : "nessuna chat ancora"}
        />
      </div>

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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
          />
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
          {filteredSessions.length} risultati
        </Badge>
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filteredSessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nessuna sessione per questi filtri</p>
            <p className="text-xs mt-1">
              Apri la tab <strong>Chat</strong> e fai partire una conversazione con una delle 18 personas.
              Le sessioni appariranno qui, e potrai promuoverne i passaggi più utili a memoria persistente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              persona={personaByKey.get(s.persona_key) ?? null}
              onOpen={() => setOpenSessionId(s.id)}
              onResume={() => handleResume(s)}
              onArchive={() => archiveMut.mutate({ id: s.id, archived: !s.archived })}
              archivePending={archiveMut.isPending}
            />
          ))}
        </div>
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

          <div className="px-4 py-2 border-b flex items-center gap-2 bg-muted/30">
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
              Esporta Markdown
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
                      onPromote={() => openSession && handlePromoteClick(m, openSession)}
                    />
                  ))
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Dialog "Promuovi a memoria" */}
      <Dialog
        open={!!promoteState?.open}
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

function StatCard({
  label, value, icon, subtitle,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-0.5 truncate">{value}</div>
      {subtitle && (
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</div>
      )}
    </div>
  );
}

function SessionCard({
  session, persona, onOpen, onResume, onArchive, archivePending,
}: {
  session: SessionRow;
  persona: PersonaLite | null;
  onOpen: () => void;
  onResume: () => void;
  onArchive: () => void;
  archivePending: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card hover:bg-muted/30 transition-colors",
        session.archived && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left p-3 flex items-start gap-3"
      >
        <div className="shrink-0 h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
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
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div className={cn(
        "shrink-0 h-7 w-7 rounded-md flex items-center justify-center",
        isUser ? "bg-violet-600 text-white" : "bg-violet-100 text-violet-700",
      )}>
        {isUser ? <UserIcon className="h-3.5 w-3.5" /> : <BotIcon className="h-3.5 w-3.5" />}
      </div>
      <div className={cn(
        "rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap break-words",
        isUser ? "bg-violet-600 text-white" : "bg-muted",
      )}>
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
              title="Salva come memoria persistente della persona"
            >
              <Brain className="h-3 w-3" />
              Promuovi a memoria
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
