/**
 * AIMemoryPage — GAP 9b
 *
 * Pagina admin per gestire la memoria delle 18 personas AI.
 * Mostra le memory esistenti per persona + permette CRUD manuale.
 *
 * Le memory sono auto-popolate dal feedback loop ai-orchestrator (per ora
 * solo lettura), ma il company_admin può:
 *   - Aggiungere fact/preference/decision/pattern/avoid manuali
 *   - Editare content/type/confidence
 *   - Disabilitare/abilitare entry
 *   - Eliminare definitivamente
 *
 * Filtri: persona, memory_type, search content.
 */
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Activity, AlertCircle, Brain, CheckCircle2, Clock3, Database, Edit2, EyeOff, Eye,
  FilterX, Link2, Plus, Search, ShieldAlert, Sparkles, Trash2,
} from "lucide-react";

interface MemoryRow {
  id: string;
  company_id: string;
  user_id: string | null;
  persona_key: string;
  memory_type: "fact" | "preference" | "decision" | "pattern" | "avoid";
  content: string;
  source: string | null;
  confidence: number | null;
  enabled: boolean;
  hits_count: number;
  last_used_at: string | null;
  created_at: string;
  isDemoPreview?: boolean;
}

interface PersonaLite {
  persona_key: string;
  display_name: string;
  category: string;
}

const TYPE_LABEL: Record<MemoryRow["memory_type"], { label: string; color: string }> = {
  fact:       { label: "Fatto",        color: "bg-blue-100 text-blue-700 border-blue-300" },
  preference: { label: "Preferenza",    color: "bg-violet-100 text-violet-700 border-violet-300" },
  decision:   { label: "Decisione",     color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  pattern:    { label: "Pattern",       color: "bg-amber-100 text-amber-700 border-amber-300" },
  avoid:      { label: "Da evitare",    color: "bg-rose-100 text-rose-700 border-rose-300" },
};

interface FormData {
  id?: string;
  persona_key: string;
  memory_type: MemoryRow["memory_type"];
  content: string;
  source: string;
  confidence: number;
}

const EMPTY_FORM: FormData = {
  persona_key: "",
  memory_type: "fact",
  content: "",
  source: "user_explicit",
  confidence: 1.0,
};

const MEMORY_QUERY_LIMIT = 1000;
const DEMO_MIN_MEMORIES_PER_PERSONA = 5;
const LOW_CONFIDENCE_THRESHOLD = 0.75;
const STALE_DAYS = 90;

type QualityFilter = "all" | "needs_attention" | "never_used" | "low_confidence" | "demo" | "recent";

function isManualMemory(memory: MemoryRow) {
  return !memory.source || memory.source === "user_explicit" || memory.source === "manual";
}

function isDemoMemory(memory: MemoryRow) {
  return memory.isDemoPreview || memory.source === "demo_preview" || memory.source === "demo_coverage";
}

function isLowConfidence(memory: MemoryRow) {
  return (memory.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD;
}

function isNeverUsed(memory: MemoryRow) {
  return (memory.hits_count ?? 0) === 0;
}

function isRecent(memory: MemoryRow) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return new Date(memory.created_at).getTime() >= sevenDaysAgo;
}

function isStale(memory: MemoryRow) {
  const staleBefore = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  return new Date(memory.created_at).getTime() < staleBefore;
}

function sourceLabel(memory: MemoryRow) {
  if (isDemoMemory(memory)) return "Demo";
  if (isManualMemory(memory)) return "Manuale";
  return "AI";
}

interface AIMemoryPageProps {
  /** Quando true, nasconde l'header h1 + descrizione (utile se la pagina viene
   *  embeddata in un hub a tab dove l'header viene fornito dal parent). */
  embedded?: boolean;
}

export default function AIMemoryPage({ embedded = false }: AIMemoryPageProps = {}) {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [search, setSearch] = useState("");
  // PERF: debounce search per evitare filter() ad ogni keystroke su liste grandi
  const debouncedSearch = useDebounce(search.trim().toLowerCase(), 200);
  const [showDisabled, setShowDisabled] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  // Personas list
  const { data: personas = [] } = useQuery({
    queryKey: ["memory-personas"],
    queryFn: async (): Promise<PersonaLite[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("ai_personas_public")
        .select("persona_key, display_name, category")
        .eq("enabled", true)
        .order("category");
      return ((data ?? []) as PersonaLite[]).filter((persona) => !isOrchestratorPersonaKey(persona.persona_key));
    },
    staleTime: 5 * 60 * 1000,
  });

  const personasForMemory = useMemo<PersonaLite[]>(
    () => personas.length > 0
      ? personas
      : DEMO_AI_PERSONAS.filter((persona) => !isOrchestratorPersonaKey(persona.persona_key)),
    [personas],
  );

  const knownPersonaKeys = useMemo(
    () => new Set(personasForMemory.map((persona) => persona.persona_key)),
    [personasForMemory],
  );

  // Memory rows
  const { data: realMemories = [], isLoading } = useQuery({
    queryKey: ["ai-persona-memory", effectiveCompany?.id, showDisabled],
    enabled: !!effectiveCompany?.id,
    queryFn: async (): Promise<MemoryRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("ai_persona_memory")
        .select("id, company_id, user_id, persona_key, memory_type, content, source, confidence, enabled, hits_count, last_used_at, created_at")
        .eq("company_id", effectiveCompany!.id)
        .order("hits_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MEMORY_QUERY_LIMIT);
      if (!showDisabled) q = q.eq("enabled", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MemoryRow[];
    },
    // PERF: memorie aziendali cambiano raramente (refresh viene dal realtime)
    // -> 30s staleTime evita refetch inutili a ogni re-mount/focus.
    staleTime: 30_000,
  });

  const normalizedRealMemories = useMemo<MemoryRow[]>(
    () => realMemories.flatMap((memory) => {
      if (knownPersonaKeys.has(memory.persona_key)) return [memory];
      const targetKey = resolveDemoPersonaKey(memory.persona_key, knownPersonaKeys);
      if (!targetKey) return [];
      return [{ ...memory, persona_key: targetKey }];
    }),
    [knownPersonaKeys, realMemories],
  );

  const isDemoCompany = effectiveCompany?.id === DEMO_COMPANY_ID;

  const demoPreviewMemories = useMemo<MemoryRow[]>(() => {
    if (!isDemoCompany || personasForMemory.length === 0) return [];

    const existingByPersona = new Map<string, Set<string>>();
    const counts = new Map<string, number>();
    for (const memory of normalizedRealMemories) {
      if (!memory.enabled || !knownPersonaKeys.has(memory.persona_key)) continue;
      counts.set(memory.persona_key, (counts.get(memory.persona_key) ?? 0) + 1);
      if (!existingByPersona.has(memory.persona_key)) existingByPersona.set(memory.persona_key, new Set());
      existingByPersona.get(memory.persona_key)!.add(memory.content.trim().toLowerCase());
    }

    const shouldShowFullDemo = normalizedRealMemories.length === 0;
    const demoByPersona = new Map<string, typeof DEMO_MEMORIES>();
    for (const memory of DEMO_MEMORIES) {
      const targetKey = resolveDemoPersonaKey(memory.persona_key, knownPersonaKeys);
      if (!targetKey) continue;
      const list = demoByPersona.get(targetKey);
      if (list) list.push(memory);
      else demoByPersona.set(targetKey, [memory]);
    }

    const additions: MemoryRow[] = [];
    for (const persona of personasForMemory) {
      const candidates = demoByPersona.get(persona.persona_key) ?? [];
      const currentCount = counts.get(persona.persona_key) ?? 0;
      const maxToAdd = shouldShowFullDemo
        ? candidates.length
        : Math.max(0, DEMO_MIN_MEMORIES_PER_PERSONA - currentCount);
      if (maxToAdd <= 0) continue;

      const usedContent = existingByPersona.get(persona.persona_key) ?? new Set<string>();
      let addedForPersona = 0;
      for (const candidate of candidates) {
        const normalizedContent = candidate.content.trim().toLowerCase();
        if (usedContent.has(normalizedContent)) continue;
        usedContent.add(normalizedContent);
        const index = additions.length;
        additions.push({
          id: `demo-preview-${persona.persona_key}-${index}`,
          company_id: effectiveCompany?.id ?? DEMO_COMPANY_ID,
          user_id: null,
          persona_key: persona.persona_key,
          memory_type: candidate.memory_type,
          content: candidate.content,
          source: shouldShowFullDemo ? "demo_preview" : "demo_coverage",
          confidence: candidate.confidence,
          enabled: true,
          hits_count: candidate.hits_count,
          last_used_at: null,
          created_at: new Date(Date.now() - index * 1_800_000).toISOString(),
          isDemoPreview: true,
        });
        addedForPersona++;
        if (addedForPersona >= maxToAdd) break;
      }
    }
    return additions;
  }, [effectiveCompany?.id, isDemoCompany, knownPersonaKeys, normalizedRealMemories, personasForMemory]);

  const memories = useMemo(
    () => [...normalizedRealMemories, ...demoPreviewMemories],
    [demoPreviewMemories, normalizedRealMemories],
  );

  // PERF: memoizzato per non ricalcolare ad ogni render (e mantenere identita
  // referenziale stabile -> children non si re-renderizzano inutilmente).
  const filteredMemories = useMemo(() => {
    let next = memories;
    if (filterPersona !== "all") next = next.filter((memory) => memory.persona_key === filterPersona);
    if (filterType !== "all") next = next.filter((memory) => memory.memory_type === filterType);
    if (debouncedSearch) {
      const personaNameByKey = new Map(personasForMemory.map((persona) => [persona.persona_key, persona.display_name.toLowerCase()]));
      next = next.filter((memory) => (
        memory.content.toLowerCase().includes(debouncedSearch)
        || memory.persona_key.toLowerCase().includes(debouncedSearch)
        || (personaNameByKey.get(memory.persona_key) ?? "").includes(debouncedSearch)
        || (memory.source ?? "").toLowerCase().includes(debouncedSearch)
      ));
    }
    if (qualityFilter === "needs_attention") {
      next = next.filter((memory) => isLowConfidence(memory) || isNeverUsed(memory) || isStale(memory));
    } else if (qualityFilter === "never_used") {
      next = next.filter(isNeverUsed);
    } else if (qualityFilter === "low_confidence") {
      next = next.filter(isLowConfidence);
    } else if (qualityFilter === "demo") {
      next = next.filter(isDemoMemory);
    } else if (qualityFilter === "recent") {
      next = next.filter(isRecent);
    }
    return next;
  }, [debouncedSearch, filterPersona, filterType, memories, personasForMemory, qualityFilter]);

  // ── Realtime subscription: aggiorna la lista quando memorie vengono
  // create/aggiornate/eliminate (sia da utente in un'altra tab che dal
  // feedback loop AI server-side). Senza questo la pagina mostrerebbe
  // dati stantii finché l'utente non ricarica.
  useEffect(() => {
    if (!effectiveCompany?.id) return;
    const ch = supabase
      .channel(`ai-persona-memory-rt-${effectiveCompany.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_persona_memory",
          filter: `company_id=eq.${effectiveCompany.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["ai-persona-memory"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [effectiveCompany?.id, qc]);

  // ── Statistiche aggregate (header dashboard) ───────────────────────────
  // Calcolate sul subset filtrato dal server (filterPersona/filterType/
  // showDisabled): mostrano sempre quello che l'utente sta VEDENDO.
  // - byType: distribuzione tra fact/preference/decision/pattern/avoid
  // - bySource: quante auto-popolate vs manuali (capire se l'AI sta
  //   effettivamente imparando)
  // - hits: somma hit count = quante volte le memorie sono state usate
  // - latestAdd: timestamp ultima memoria creata (heartbeat del sistema)
  const stats = useMemo(() => {
    const byType: Record<MemoryRow["memory_type"], number> = {
      fact: 0, preference: 0, decision: 0, pattern: 0, avoid: 0,
    };
    let manual = 0;
    let auto = 0;
    let demo = 0;
    let real = 0;
    let hits = 0;
    let latestAddTs = 0;
    let lowConfidence = 0;
    let neverUsed = 0;
    let stale = 0;
    let disabled = 0;
    const personasWithMemories = new Set<string>();
    for (const m of memories) {
      byType[m.memory_type] = (byType[m.memory_type] ?? 0) + 1;
      if (isDemoMemory(m)) demo++;
      else real++;
      if (!isDemoMemory(m) && isManualMemory(m)) manual++;
      else if (!isDemoMemory(m)) auto++;
      if (!m.enabled) disabled++;
      if (isLowConfidence(m)) lowConfidence++;
      if (isNeverUsed(m)) neverUsed++;
      if (isStale(m)) stale++;
      if (m.enabled && knownPersonaKeys.has(m.persona_key)) personasWithMemories.add(m.persona_key);
      hits += m.hits_count ?? 0;
      const ts = m.created_at ? new Date(m.created_at).getTime() : 0;
      if (ts > latestAddTs) latestAddTs = ts;
    }
    const personasWithoutMemories = personasForMemory.filter((persona) => !personasWithMemories.has(persona.persona_key));
    const coveragePct = personasForMemory.length > 0
      ? Math.round((personasWithMemories.size / personasForMemory.length) * 100)
      : 0;
    const healthPct = memories.length > 0
      ? Math.max(0, Math.round(100 - ((lowConfidence + neverUsed + stale) / Math.max(1, memories.length * 3)) * 100))
      : 0;
    return {
      total: memories.length,
      byType,
      manual,
      auto,
      demo,
      real,
      hits,
      lowConfidence,
      neverUsed,
      stale,
      disabled,
      coveragePct,
      healthPct,
      personasWithMemories: personasWithMemories.size,
      personasWithoutMemories,
      latestAdd: latestAddTs > 0 ? new Date(latestAddTs) : null,
    };
  }, [knownPersonaKeys, memories, personasForMemory]);

  const personaHealth = useMemo(
    () => personasForMemory.map((persona) => {
      const personaMemories = memories.filter((memory) => memory.enabled && memory.persona_key === persona.persona_key);
      const weakCount = personaMemories.filter((memory) => isLowConfidence(memory) || isNeverUsed(memory) || isStale(memory)).length;
      const topMemory = [...personaMemories].sort((a, b) => (b.hits_count ?? 0) - (a.hits_count ?? 0))[0];
      return {
        persona,
        count: personaMemories.length,
        weakCount,
        healthPct: personaMemories.length > 0
          ? Math.max(0, Math.round(100 - (weakCount / personaMemories.length) * 100))
          : 0,
        topMemory,
      };
    }),
    [memories, personasForMemory],
  );

  // Mutations
  const upsertMut = useMutation({
    mutationFn: async (data: FormData) => {
      if (!effectiveCompany?.id) throw new Error("no_company");
      if (data.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("ai_persona_memory")
          .update({
            persona_key: data.persona_key,
            memory_type: data.memory_type,
            content: data.content.trim(),
            source: data.source,
            confidence: data.confidence,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).rpc("record_persona_memory", {
          p_company_id: effectiveCompany.id,
          p_user_id: null, // memory globale per company (non user-specific)
          p_persona_key: data.persona_key,
          p_memory_type: data.memory_type,
          p_content: data.content.trim(),
          p_source: data.source,
          p_confidence: data.confidence,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Memory salvata");
      setEditOpen(false);
      setForm(EMPTY_FORM);
      void qc.invalidateQueries({ queryKey: ["ai-persona-memory"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("ai_persona_memory")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai-persona-memory"] });
    },
    onError: (e) => toast.error("Errore aggiornamento memory", { description: String(e) }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("ai_persona_memory")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memory eliminata");
      void qc.invalidateQueries({ queryKey: ["ai-persona-memory"] });
    },
    onError: (e) => toast.error("Errore eliminazione memory", { description: String(e) }),
  });

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, persona_key: filterPersona !== "all" ? filterPersona : (personasForMemory[0]?.persona_key ?? "") });
    setEditOpen(true);
  };

  const openEdit = (m: MemoryRow) => {
    setForm({
      id: m.id,
      persona_key: m.persona_key,
      memory_type: m.memory_type,
      content: m.content,
      source: m.source ?? "user_explicit",
      confidence: m.confidence ?? 1.0,
    });
    setEditOpen(true);
  };

  return (
    <div className={cn(embedded ? "space-y-4" : "p-4 md:p-6 max-w-screen-xl mx-auto space-y-4")}>
      {!embedded && (
        <div className="flex items-start gap-3">
          <div className="shrink-0 h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <Brain className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Centro controllo memoria</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Verifica cosa ricordano le AI, quali personas sono coperte e quali memorie vanno corrette.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" asChild className="gap-2">
              <a href="/azienda/assistente-ai">
                <Sparkles className="h-4 w-4" />
                Apri le 18 Personas
              </a>
            </Button>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Aggiungi memoria
            </Button>
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Centro controllo memoria</h2>
            <p className="text-xs text-muted-foreground">
              Dati reali, memorie demo e qualità della conoscenza AI nello stesso posto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setQualityFilter("demo")}
            >
              <Sparkles className="h-4 w-4" />
              Completa personas
            </Button>
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Aggiungi memoria
            </Button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden border-orange-200 bg-gradient-to-br from-orange-50 via-white to-slate-50 dark:from-orange-950/20 dark:via-background dark:to-background">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                  <Database className="h-3 w-3" />
                  {stats.real} reali
                </Badge>
                {stats.demo > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <Sparkles className="h-3 w-3" />
                    Memorie demo {stats.demo}
                  </Badge>
                )}
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  {stats.coveragePct}% copertura
                </Badge>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  La memoria AI alimenta prompt, chat e Cervello visuale.
                </p>
                <p className="text-xs text-muted-foreground">
                  Le demo sono visibili per rendere coerente il Cervello; non sono salvate nel database finché non crei o importi memorie reali.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
              <div className="rounded-lg border bg-white/80 p-2 dark:bg-background/60">
                <p className="text-xl font-bold tabular-nums">{stats.personasWithMemories}/{personasForMemory.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">personas</p>
              </div>
              <div className="rounded-lg border bg-white/80 p-2 dark:bg-background/60">
                <p className="text-xl font-bold tabular-nums">{stats.healthPct}%</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">salute</p>
              </div>
              <div className="rounded-lg border bg-white/80 p-2 dark:bg-background/60">
                <p className="text-xl font-bold tabular-nums">{stats.lowConfidence + stats.neverUsed + stats.stale}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">attenzioni</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats dashboard — aggiornate in realtime via Supabase subscription */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Totale memorie</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5">{stats.total}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {stats.real} reali · {stats.demo} demo
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">QA copertura</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5">{stats.coveragePct}%</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {stats.personasWithMemories}/{personasForMemory.length} personas coperte
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Utilizzi totali</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5">{stats.hits}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            quante volte caricate nei prompt AI
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Da verificare</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5">{stats.lowConfidence + stats.neverUsed + stats.stale}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {stats.neverUsed} mai usate · {stats.lowConfidence} bassa fiducia
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Per tipo</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(stats.byType).filter(([, n]) => n > 0).map(([t, n]) => (
              <Badge key={t} variant="outline" className={cn("text-[10px] h-5 px-1.5", TYPE_LABEL[t as MemoryRow["memory_type"]].color)}>
                {TYPE_LABEL[t as MemoryRow["memory_type"]].label}: {n}
              </Badge>
            ))}
            {stats.total === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ultima aggiunta</div>
          <div className="text-sm font-semibold mt-0.5">
            {stats.latestAdd
              ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(stats.latestAdd)
              : "—"}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Aggiornamento live
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Copertura per persona</p>
            <p className="text-xs text-muted-foreground">
              Clicca una persona per filtrare le sue memorie e capire dove il cervello è più forte.
            </p>
          </div>
          {stats.personasWithoutMemories.length > 0 ? (
            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
              <ShieldAlert className="h-3 w-3" />
              {stats.personasWithoutMemories.length} personas senza memoria
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              Tutte le personas hanno memoria
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {personaHealth.map(({ persona, count, healthPct, weakCount }) => (
            <button
              key={persona.persona_key}
              type="button"
              onClick={() => setFilterPersona(persona.persona_key)}
              className={cn(
                "rounded-lg border p-2 text-left transition-colors hover:bg-muted/50",
                filterPersona === persona.persona_key && "border-orange-300 bg-orange-50 text-orange-950",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold">{persona.display_name}</p>
                <span className="text-xs font-bold tabular-nums">{count}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full",
                    count === 0 ? "bg-rose-400" : healthPct >= 80 ? "bg-emerald-500" : "bg-amber-500",
                  )}
                  style={{ width: `${Math.max(count === 0 ? 8 : healthPct, 8)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {count === 0 ? "da completare" : weakCount > 0 ? `${weakCount} attenzioni` : "salute alta"}
              </p>
            </button>
          ))}
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
            {personasForMemory.map((p) => (
              <SelectItem key={p.persona_key} value={p.persona_key}>{p.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            {Object.entries(TYPE_LABEL).map(([key, t]) => (
              <SelectItem key={key} value={key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca contenuto, persona o fonte..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
          />
        </div>

        <Button
          variant={showDisabled ? "default" : "outline"}
          size="sm"
          onClick={() => setShowDisabled(!showDisabled)}
          className="h-9 gap-2"
        >
          {showDisabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showDisabled ? "Nascondi disabilitate" : "Includi disabilitate"}
        </Button>

        <Badge variant="outline" className="ml-auto text-xs">
          {filteredMemories.length} entries
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { value: "all", label: "Tutte", icon: FilterX },
          { value: "needs_attention", label: "Da verificare", icon: ShieldAlert },
          { value: "never_used", label: "Mai usate", icon: Activity },
          { value: "low_confidence", label: "Bassa fiducia", icon: AlertCircle },
          { value: "recent", label: "Recenti", icon: Clock3 },
          { value: "demo", label: "Memorie demo", icon: Sparkles },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={qualityFilter === item.value ? "default" : "outline"}
              className="h-8 gap-1.5"
              onClick={() => setQualityFilter(item.value as QualityFilter)}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Button>
          );
        })}
      </div>

      {/* Memory list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filteredMemories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nessuna memoria per questi filtri</p>
            <p className="text-xs mt-1">
              Le memory si auto-popolano usando le AI personas, oppure puoi aggiungerle manualmente.
            </p>
            <Button onClick={openCreate} className="mt-4 gap-2" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Aggiungi prima memoria
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredMemories.map((m) => {
            const persona = personasForMemory.find((p) => p.persona_key === m.persona_key);
            const typeBadge = TYPE_LABEL[m.memory_type];
            const demoPreview = isDemoMemory(m);
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-lg border p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors",
                  !m.enabled && "opacity-50",
                  demoPreview && "border-amber-200 bg-amber-50/30",
                )}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px]", typeBadge.color)}>
                      {typeBadge.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {persona?.display_name ?? m.persona_key}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        demoPreview
                          ? "bg-amber-100 text-amber-700 border-amber-200"
                          : isManualMemory(m)
                            ? "bg-slate-100 text-slate-700 border-slate-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200",
                      )}
                    >
                      {sourceLabel(m)}
                    </Badge>
                    {!m.enabled && (
                      <Badge variant="outline" className="text-[10px] gap-1 bg-slate-100 text-slate-600">
                        <EyeOff className="h-2.5 w-2.5" />
                        Disabilitata
                      </Badge>
                    )}
                    {isNeverUsed(m) && (
                      <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                        Mai usata
                      </Badge>
                    )}
                    {isLowConfidence(m) && (
                      <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                        Da verificare
                      </Badge>
                    )}
                    {isStale(m) && (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                        Obsoleta
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {m.hits_count} hits · creata il {new Date(m.created_at).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                  <p className="text-sm leading-snug">{m.content}</p>
                  {m.source && m.confidence != null && (
                    <p className="text-[10px] text-muted-foreground">
                      Fonte: {m.source} · Confidence: {(m.confidence * 100).toFixed(0)}%
                      {demoPreview ? " · anteprima non salvata" : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    asChild
                    title="Vedi nel Cervello"
                  >
                    <a href={`/azienda/impostazioni/ai-memoria?tab=cervello&memory=${encodeURIComponent(m.id)}`}>
                      <Link2 className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => toggleMut.mutate({ id: m.id, enabled: !m.enabled })}
                    disabled={demoPreview}
                    title={m.enabled ? "Disabilita" : "Riattiva"}
                  >
                    {m.enabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => openEdit(m)}
                    disabled={demoPreview}
                    title="Modifica"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-rose-600 hover:text-rose-700"
                    onClick={() => {
                      if (confirm("Eliminare definitivamente questa memoria? L'azione è irreversibile.")) {
                        deleteMut.mutate(m.id);
                      }
                    }}
                    disabled={demoPreview}
                    title="Elimina"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifica memoria" : "Aggiungi memoria"}</DialogTitle>
            <DialogDescription>
              Una memory che la persona AI ricorderà nelle prossime conversazioni.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Persona</Label>
              <Select value={form.persona_key} onValueChange={(v) => setForm({ ...form, persona_key: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Scegli persona" />
                </SelectTrigger>
                <SelectContent>
                  {personasForMemory.map((p) => (
                    <SelectItem key={p.persona_key} value={p.persona_key}>{p.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.memory_type} onValueChange={(v) => setForm({ ...form, memory_type: v as FormData["memory_type"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([key, t]) => (
                    <SelectItem key={key} value={key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Contenuto</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="es. Florin preferisce vedere il P&L mensile vs settimanale"
                rows={3}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Scrivi una frase chiara e breve. Verrà iniettata nel prompt della persona.
              </p>
            </div>
            <div>
              <Label className="text-xs">Confidence ({(form.confidence * 100).toFixed(0)}%)</Label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.1"
                value={form.confidence}
                onChange={(e) => setForm({ ...form, confidence: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annulla</Button>
            <Button
              onClick={() => upsertMut.mutate(form)}
              disabled={upsertMut.isPending || !form.persona_key || !form.content.trim()}
            >
              {upsertMut.isPending ? "Salvo…" : (form.id ? "Salva modifiche" : "Crea memoria")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-900">
        <CardContent className="p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Privacy:</strong> le memory sono multi-tenant (visibili solo nella tua azienda).
            Quelle con <code className="bg-muted px-1 rounded">user_id NULL</code> sono globali per
            tutti gli utenti della company. Per memory user-specific (preferenze personali), usa la
            chat con la persona — l'AI le creerà automaticamente quando rileva pattern stabili.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
