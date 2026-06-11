/**
 * AssistenteAIPage — Chat con le 18 personas AI per l'azienda.
 *
 * Layout 3 colonne:
 *   [Sidebar sx]: persona selector (filtrato da RBAC) + sessioni storia
 *   [Centro]: chat interface con persona attiva
 *   [Sidebar dx]: meta (token usati, costo sessione, persona info, azioni proposte)
 *
 * Flow:
 *   1. Utente sceglie persona dalla griglia
 *   2. Crea/riprende sessione
 *   3. Chatta — ogni messaggio chiama edge function ai-orchestrator
 *   4. Storia salvata in ai_persona_sessions + ai_persona_messages
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Send, Plus, Bot, MessageSquare, Coins, AlertTriangle, Loader2, Search, ArrowLeft,
} from "lucide-react";
import { PERSONA_ICON_MAP, PERSONA_COLOR_RING } from "@/lib/personaVisuals";
import { useShowAIRunMeta } from "@/lib/ai/use-ai-model-selector";

// Alias locali per minimizzare diff con il resto del file.
const ICON_MAP = PERSONA_ICON_MAP;
const COLOR_RING = PERSONA_COLOR_RING;

const CATEGORY_LABEL: Record<string, string> = {
  finance: "Finanza",
  operations: "Operations",
  sales: "Vendite",
  marketing: "Marketing",
  hr: "HR",
  compliance: "Compliance",
  client: "Cliente",
  meta: "Executive",
};

interface Persona {
  persona_key: string;
  display_name: string;
  short_label: string;
  mission: string;
  category: string;
  recommended_tier_key: string;
  icon: string;
  color: string;
  enabled: boolean;
  is_system: boolean;
  // 🆕 GAP 1 (Discoverability): chip cliccabili in empty state chat
  example_questions?: string[];
  allowed_roles: string[];
}

interface ChatSession {
  id: string;
  persona_key: string;
  title: string;
  message_count: number;
  total_cost_billed_eur: number;
  last_message_at: string;
  archived: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  cost_billed_eur: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  model_used: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface OrchestratorResponse {
  sessionId: string;
  messageId: string;
  response: string;
  personaDisplayName: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  costBilledEur: number;
  marginEur: number;
  ledgerId?: string;
}

const fmtEur = (n: number | null | undefined, decimals = 4) =>
  n == null ? "—" : `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

// ════════════════════════════════════════════════════════════════════════════

interface AssistenteAIPageProps {
  /** Quando true: nasconde header h1 + DiscoveryBanner (forniti dal parent hub). */
  embedded?: boolean;
}

export default function AssistenteAIPage({ embedded = false }: AssistenteAIPageProps = {}) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activePersonaKey, setActivePersonaKey] = useState<string | null>(
    () => searchParams.get("persona"),
  );
  const [draftMessage, setDraftMessage] = useState("");
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Tracciamo l'ultimo set di params processato anziché un boolean: così quando
  // arrivano nuovi parametri (es. tab Sessioni > Continua chat con sessionId
  // diverso) il deep-link re-fire correttamente anche se la pagina era già montata.
  const lastProcessedParamsRef = useRef<string>("");

  // ─── DATA: personas (con check RBAC su client lato — orchestrator ricontrolla server-side) ──
  const { data: personas, isLoading: personasLoading } = useQuery({
    queryKey: ["azienda_ai_personas_allowed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_personas_public" as never)
        .select("persona_key, display_name, short_label, mission, category, recommended_tier_key, icon, color, enabled, is_system, allowed_roles, example_questions")
        .eq("enabled", true)
        .eq("is_system", false)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Persona[];
    },
    // PERF: catalogo personas cambia raramente (deploy-time). 5 min e' ampio.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // ─── DATA: sessioni utente ─────────────────────────────────────────────
  const { data: sessions } = useQuery({
    queryKey: ["my_persona_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_persona_sessions" as never)
        .select("id, persona_key, title, message_count, total_cost_billed_eur, last_message_at, archived")
        .eq("archived", false)
        .order("last_message_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as ChatSession[];
    },
    // PERF: sidebar sessioni si aggiorna comunque dopo ogni invio via
    // invalidate in sendMut.onSuccess -> staleTime ampio evita refetch
    // su window focus.
    staleTime: 60_000,
  });

  // ─── DATA: messaggi della sessione attiva ──────────────────────────────
  const { data: messages, isFetching: messagesLoading } = useQuery({
    queryKey: ["persona_messages", activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return [];
      const { data, error } = await supabase
        .from("ai_persona_messages" as never)
        .select("id, role, content, cost_billed_eur, tokens_in, tokens_out, model_used, created_at, metadata")
        .eq("session_id", activeSessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ChatMessage[];
    },
    enabled: !!activeSessionId,
    // PERF: messaggi non cambiano dopo create (immutabili). Invalidate
    // esplicita dopo sendMut.onSuccess -> niente refetch su focus.
    staleTime: 5 * 60 * 1000,
  });

  // ─── MUTATION: invio messaggio ─────────────────────────────────────────
  const sendMut = useMutation({
    mutationFn: async (input: { message: string; personaKey: string; sessionId: string | null }) => {
      const { data, error } = await supabase.functions.invoke<OrchestratorResponse>("ai-orchestrator", {
        body: {
          sessionId: input.sessionId ?? undefined,
          personaKey: input.personaKey,
          message: input.message,
        },
      });
      if (error) {
        // Try to parse rbac_denied error from edge function
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const body = await ctx.json?.();
            if (body?.error === "rbac_denied") {
              throw new Error(`🚫 ${body.message}`);
            }
            throw new Error(body?.error ?? error.message);
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message.startsWith("🚫")) throw parseErr;
          }
        }
        throw new Error(error.message);
      }
      return data!;
    },
    onSuccess: (result) => {
      setActiveSessionId(result.sessionId);
      setDraftMessage("");
      qc.invalidateQueries({ queryKey: ["persona_messages", result.sessionId] });
      qc.invalidateQueries({ queryKey: ["my_persona_sessions"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  // ─── EFFECTS: scroll auto in fondo + reset draft on session change ────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 🆕 GAP 1 (Discoverability): deep-link autosend + resume
  // /azienda/assistente-ai?persona=cfo&q=Come%20va%20la%20cassa  → autosend
  // /azienda/assistente-ai?persona=cfo&sessionId=UUID            → resume sessione
  // chiamato da Command Palette (Cmd+K), tab Sessioni "Continua chat", proactive proposals.
  useEffect(() => {
    if (!personas || personas.length === 0) return;
    const personaParam = searchParams.get("persona");
    const qParam = searchParams.get("q");
    const sessionIdParam = searchParams.get("sessionId");
    if (!personaParam && !sessionIdParam) return;

    // Idempotency: skip se questa stessa combinazione è già stata processata
    const fingerprint = `${personaParam ?? ""}|${qParam ?? ""}|${sessionIdParam ?? ""}`;
    if (lastProcessedParamsRef.current === fingerprint) return;
    lastProcessedParamsRef.current = fingerprint;

    // Resume sessione esistente: ha precedenza su persona+q
    if (sessionIdParam) {
      setActiveSessionId(sessionIdParam);
      if (personaParam) {
        const personaExists = personas.some((p) => p.persona_key === personaParam);
        if (personaExists) setActivePersonaKey(personaParam);
      }
      const next = new URLSearchParams(searchParams);
      next.delete("sessionId");
      setSearchParams(next, { replace: true });
      return;
    }

    // Nuova sessione su persona (con eventuale autosend)
    if (!personaParam) return;
    const personaExists = personas.some((p) => p.persona_key === personaParam);
    if (!personaExists) {
      toast.error(`Persona "${personaParam}" non disponibile per il tuo ruolo`);
      return;
    }
    setActivePersonaKey(personaParam);
    setActiveSessionId(null);
    if (qParam && qParam.trim()) {
      setTimeout(() => {
        sendMut.mutate({
          message: qParam.trim(),
          personaKey: personaParam,
          sessionId: null,
        });
        const next = new URLSearchParams(searchParams);
        next.delete("q");
        setSearchParams(next, { replace: true });
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, searchParams]);

  // ─── HELPERS ───────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const filtered = (personas ?? []).filter(p =>
      !search ||
      p.display_name.toLowerCase().includes(search.toLowerCase()) ||
      p.short_label.toLowerCase().includes(search.toLowerCase())
    );
    const map = new Map<string, Persona[]>();
    for (const p of filtered) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return Array.from(map.entries()).map(([cat, items]) => ({ cat, items }));
  }, [personas, search]);

  const activePersona = useMemo(
    () => (personas ?? []).find(p => p.persona_key === activePersonaKey),
    [personas, activePersonaKey],
  );

  const totalSessionCost = useMemo(
    () => (messages ?? []).reduce((sum, m) => sum + Number(m.cost_billed_eur ?? 0), 0),
    [messages],
  );

  // Regola prodotto (2026-06): costi AI MAI visibili in chat agli utenti
  // normali (solo demo Test Lab + super_admin). Restano nelle impostazioni
  // azienda (AIPersonasSessionsTab) e nelle pagine superadmin.
  const showRunMeta = useShowAIRunMeta();

  // ─── HANDLERS ─────────────────────────────────────────────────────────
  const handleSelectPersona = (key: string) => {
    setActivePersonaKey(key);
    setActiveSessionId(null); // nuova sessione (sarà creata dal primo invio)
  };

  const handleResumeSession = (s: ChatSession) => {
    setActiveSessionId(s.id);
    setActivePersonaKey(s.persona_key);
  };

  const handleSend = () => {
    if (sendMut.isPending) return;
    const trimmed = draftMessage.trim();
    if (!trimmed) return;
    if (!activePersonaKey) {
      toast.error("Seleziona prima una persona");
      return;
    }
    sendMut.mutate({
      message: trimmed,
      personaKey: activePersonaKey,
      sessionId: activeSessionId,
    });
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setActivePersonaKey(null);
    setDraftMessage("");
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div className={cn(
      "flex flex-col gap-4",
      embedded ? "h-[calc(100vh-12rem)]" : "h-[calc(100vh-4rem)]",
    )}>
      {!embedded && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bot className="h-6 w-6 text-violet-600" />
                Assistente AI
              </h1>
              <p className="text-sm text-muted-foreground">
                Chatta con le persone AI specializzate per ogni area aziendale ·{" "}
                <kbd className="px-1.5 py-0.5 text-[10px] rounded border bg-muted font-mono">⌘K</kbd>{" "}
                per ricerca rapida
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleNewChat} className="gap-2">
              <Plus className="h-4 w-4" /> Nuova chat
            </Button>
          </div>

          {/* 🆕 GAP 1: Discovery banner primo accesso (dismissable) */}
          <DiscoveryBanner personaCount={personas?.length ?? 0} />
        </>
      )}

      {embedded && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleNewChat} className="gap-2">
            <Plus className="h-4 w-4" /> Nuova chat
          </Button>
        </div>
      )}


      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">

        {/* ─── SIDEBAR SX: persona selector + sessioni ─────────────────── */}
        <div className="col-span-12 md:col-span-3 flex flex-col gap-3 min-h-0">
          {!activeSessionId && !activePersonaKey ? (
            <Card className="flex-1 min-h-0 flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Scegli una persona AI</CardTitle>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </CardHeader>
              <ScrollArea className="flex-1">
                <CardContent className="space-y-3">
                  {personasLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
                    </div>
                  ) : grouped.length === 0 ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Nessuna persona disponibile per il tuo ruolo.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    grouped.map(({ cat, items }) => (
                      <div key={cat}>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          {CATEGORY_LABEL[cat] ?? cat}
                        </div>
                        <div className="space-y-1">
                          {items.map(p => (
                            <PersonaButton key={p.persona_key} persona={p} onSelect={handleSelectPersona} />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </ScrollArea>
            </Card>
          ) : (
            <Card className="flex-1 min-h-0 flex flex-col">
              <CardHeader className="pb-3 flex-row items-start justify-between">
                <CardTitle className="text-sm">Conversazioni recenti</CardTitle>
                <Button size="sm" variant="ghost" onClick={handleNewChat} title="Cambia persona">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </CardHeader>
              <ScrollArea className="flex-1">
                <CardContent className="space-y-1">
                  {(sessions ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Nessuna conversazione precedente
                    </p>
                  ) : (
                    (sessions ?? []).map(s => (
                      <button
                        key={s.id}
                        className={cn(
                          "w-full text-left p-2.5 rounded-lg hover:bg-accent transition text-xs space-y-0.5",
                          activeSessionId === s.id && "bg-accent ring-1 ring-violet-200"
                        )}
                        onClick={() => handleResumeSession(s)}
                      >
                        <div className="font-medium truncate">{s.title}</div>
                        <div className="text-muted-foreground flex items-center justify-between">
                          <span>{s.message_count} msg</span>
                          {showRunMeta && <span>{fmtEur(s.total_cost_billed_eur, 2)}</span>}
                        </div>
                      </button>
                    ))
                  )}
                </CardContent>
              </ScrollArea>
            </Card>
          )}
        </div>

        {/* ─── CENTRO: chat interface ──────────────────────────────────── */}
        <div className="col-span-12 md:col-span-6 flex flex-col gap-3 min-h-0">
          <Card className="flex-1 min-h-0 flex flex-col">
            {activePersona ? (
              <CardHeader className="pb-3 flex-row items-center gap-3 border-b">
                <PersonaIcon icon={activePersona.icon} color={activePersona.color} size="sm" />
                <div className="flex-1">
                  <CardTitle className="text-base">{activePersona.display_name}</CardTitle>
                  <CardDescription className="text-xs">{activePersona.short_label}</CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {activePersona.recommended_tier_key}
                </Badge>
              </CardHeader>
            ) : (
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base text-muted-foreground">
                  Seleziona una persona dalla sidebar per iniziare
                </CardTitle>
              </CardHeader>
            )}

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {!activeSessionId && activePersona ? (
                  <div className="text-center py-8 max-w-2xl mx-auto">
                    <PersonaIcon icon={activePersona.icon} color={activePersona.color} size="lg" />
                    <h3 className="mt-4 font-semibold text-lg">{activePersona.display_name}</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
                      {activePersona.mission}
                    </p>
                    {/* 🆕 GAP 1: chip esempi cliccabili (era solo "scrivi un messaggio") */}
                    {(activePersona.example_questions ?? []).length > 0 ? (
                      <div className="mt-8 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Prova a chiedere
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {activePersona.example_questions!.slice(0, 5).map((q, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                if (!activePersonaKey || sendMut.isPending) return;
                                sendMut.mutate({
                                  message: q,
                                  personaKey: activePersonaKey,
                                  sessionId: activeSessionId,
                                });
                              }}
                              disabled={sendMut.isPending}
                              className={cn(
                                "text-xs px-3 py-2 rounded-full border bg-background",
                                "hover:bg-accent hover:border-primary/50 transition-colors",
                                "text-left max-w-xs disabled:opacity-50",
                              )}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-6">
                        Scrivi un messaggio per iniziare la conversazione
                      </p>
                    )}
                  </div>
                ) : !activePersona ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto opacity-30 mb-3" />
                    <p className="text-sm">Nessuna persona selezionata</p>
                  </div>
                ) : messagesLoading && (messages ?? []).length === 0 ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
                  </div>
                ) : (
                  <>
                    {(messages ?? []).map(m => <MessageBubble key={m.id} message={m} persona={activePersona ?? null} />)}
                    {sendMut.isPending && <TypingIndicator persona={activePersona ?? null} />}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="border-t p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={activePersona
                    ? `Chiedi a ${activePersona.display_name}…`
                    : "Seleziona prima una persona"}
                  rows={1}
                  className="resize-none min-h-[40px] max-h-32"
                  disabled={!activePersonaKey || sendMut.isPending}
                />
                <Button
                  onClick={handleSend}
                  disabled={!activePersonaKey || !draftMessage.trim() || sendMut.isPending}
                  size="icon"
                  className="h-10 w-10 shrink-0"
                >
                  {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                Invio per inviare • Shift+Invio per nuova riga
              </p>
            </div>
          </Card>
        </div>

        {/* ─── SIDEBAR DX: meta sessione ───────────────────────────────── */}
        <div className="col-span-12 md:col-span-3 flex flex-col gap-3 min-h-0">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" /> Sessione corrente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Messaggi</span>
                <span className="font-mono">{messages?.length ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Token in / out</span>
                <span className="font-mono">
                  {(messages ?? []).reduce((s, m) => s + (m.tokens_in ?? 0), 0)}
                  {" / "}
                  {(messages ?? []).reduce((s, m) => s + (m.tokens_out ?? 0), 0)}
                </span>
              </div>
              {showRunMeta && (
                <>
                  <Separator />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Costo sessione</span>
                    <span className="font-mono font-semibold">{fmtEur(totalSessionCost, 4)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {activePersona && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">Persona attiva</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <PersonaIcon icon={activePersona.icon} color={activePersona.color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{activePersona.display_name}</div>
                    <div className="text-[10px] text-muted-foreground">{activePersona.short_label}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{activePersona.mission}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px]">{activePersona.recommended_tier_key}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABEL[activePersona.category]}</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          <Alert className="text-xs">
            <AlertDescription>
              Ogni messaggio scala dal saldo AI dell'azienda. Vedi consumi in
              {" "}<a href="/azienda/impostazioni/crediti" className="underline">Impostazioni → Crediti</a>.
            </AlertDescription>
          </Alert>
        </div>

      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

/**
 * 🆕 GAP 1 (Discoverability): banner introduttivo dismissable, mostrato la
 * prima volta che l'utente apre /azienda/assistente-ai. Spiega in 1 frase
 * cosa sono le 18 personas e che il Cmd+K mostra esempi pronti.
 *
 * Stato persisted in localStorage per-user (chiave: ai_intro_banner_dismissed).
 */
const BANNER_KEY = "ai_intro_banner_dismissed_v1";

function DiscoveryBanner({ personaCount }: { personaCount: number }) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(BANNER_KEY) === "1";
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try { window.localStorage.setItem(BANNER_KEY, "1"); } catch { /* noop */ }
    setDismissed(true);
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 via-purple-50 to-indigo-50 dark:border-violet-900 dark:from-violet-950/30 dark:via-purple-950/30 dark:to-indigo-950/30 p-4 flex items-start gap-3">
      <div className="shrink-0 h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
        <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm font-semibold">
          Hai {personaCount > 0 ? personaCount : "diverse"} AI specializzate che lavorano per la tua azienda 24/7
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          CFO per la cassa, Compliance per il DURC, PM Cantiere per la pianificazione, Sales per i lead… Ognuno con i suoi tool e la sua expertise.
          Premi <kbd className="px-1 py-0.5 text-[10px] rounded border bg-background font-mono">⌘K</kbd> ovunque per cercare per esempio
          (es. "Genera LIPE" oppure "Suggerisci squadra"), oppure clicca uno dei chip qui sotto quando entri in una chat.
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Chiudi"
      >
        ✕
      </button>
    </div>
  );
}

function PersonaButton({ persona, onSelect }: { persona: Persona; onSelect: (key: string) => void }) {
  const Icon = ICON_MAP[persona.icon] ?? Bot;
  const colorCls = COLOR_RING[persona.color] ?? COLOR_RING.slate;
  return (
    <button
      onClick={() => onSelect(persona.persona_key)}
      className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent transition text-left"
    >
      <div className={cn("rounded-md ring-1 p-1.5 shrink-0", colorCls)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{persona.display_name}</div>
        <div className="text-[10px] text-muted-foreground truncate">{persona.short_label}</div>
      </div>
    </button>
  );
}

function PersonaIcon({ icon, color, size = "sm" }: { icon: string; color: string; size?: "sm" | "lg" }) {
  const Icon = ICON_MAP[icon] ?? Bot;
  const colorCls = COLOR_RING[color] ?? COLOR_RING.slate;
  const sizeCls = size === "lg" ? "p-4 ring-2" : "p-2 ring-1";
  const iconSize = size === "lg" ? "h-7 w-7" : "h-4 w-4";
  return (
    <div className={cn("inline-flex rounded-lg shrink-0", colorCls, sizeCls)}>
      <Icon className={iconSize} />
    </div>
  );
}

function MessageBubble({ message, persona }: { message: ChatMessage; persona: Persona | null }) {
  const isUser = message.role === "user";
  const isError = message.metadata?.error === true;
  // Costo/token/modello sotto il messaggio: meta dev/debug, MAI per utenti normali.
  const showRunMeta = useShowAIRunMeta();

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {!isUser && persona && (
        <PersonaIcon icon={persona.icon} color={persona.color} size="sm" />
      )}
      <div className={cn(
        "rounded-lg px-3 py-2 max-w-[80%] text-sm whitespace-pre-wrap break-words",
        isUser ? "bg-violet-600 text-white" : isError ? "bg-rose-50 border border-rose-200 text-rose-900" : "bg-muted",
      )}>
        {message.content}
        {showRunMeta && !isUser && message.cost_billed_eur != null && (
          <div className="text-[10px] opacity-60 mt-1.5 flex items-center gap-2">
            <span>{message.tokens_in} → {message.tokens_out} tok</span>
            <span>·</span>
            <span>{fmtEur(message.cost_billed_eur, 5)}</span>
            {message.model_used && <><span>·</span><span className="font-mono">{message.model_used}</span></>}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ persona }: { persona: Persona | null }) {
  return (
    <div className="flex gap-3">
      {persona && <PersonaIcon icon={persona.icon} color={persona.color} size="sm" />}
      <div className="bg-muted rounded-lg px-4 py-3 inline-flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
