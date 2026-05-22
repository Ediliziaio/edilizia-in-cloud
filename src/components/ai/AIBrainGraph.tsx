/**
 * AIBrainGraph — v1.0
 *
 * Visualizzazione a grafo interattivo del "cervello AI" dell'azienda.
 * Mostra le connessioni tra le 18 Personas AI e le loro memorie come
 * una mappa neurale — stile Obsidian Graph View / InfraNodus.
 *
 * Nodi:
 *   • Persona (grandi, colorati per category) — hub centrali
 *   • Memory  (medi, colorati per memory_type) — fatti/decisioni/pattern
 *
 * Edges:
 *   • persona → memory (ogni memoria appartiene a una persona)
 *   • memory ↔ memory (connessione semantica via keyword overlap)
 *
 * Tech: reagraph (WebGL, force-directed 3D) su React.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GraphCanvas, darkTheme, type GraphNode, type GraphEdge, type GraphCanvasRef } from "reagraph";
import type { InternalGraphNode } from "reagraph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Brain, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut,
  Filter, X, Sparkles, Network,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemoryRow {
  id: string;
  persona_key: string;
  memory_type: "fact" | "preference" | "decision" | "pattern" | "avoid";
  content: string;
  confidence: number | null;
  hits_count: number | null;
  enabled: boolean;
  source: string | null;
  created_at: string;
}

interface PersonaLite {
  persona_key: string;
  display_name: string;
  category: string;
  color: string | null;
  icon: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MEMORY_TYPE_COLORS: Record<string, string> = {
  fact:       "#60a5fa", // blue-400
  preference: "#a78bfa", // violet-400
  decision:   "#34d399", // emerald-400
  pattern:    "#fbbf24", // amber-400
  avoid:      "#f87171", // rose-400
};

const MEMORY_TYPE_LABELS: Record<string, string> = {
  fact:       "Fatto",
  preference: "Preferenza",
  decision:   "Decisione",
  pattern:    "Pattern",
  avoid:      "Da evitare",
};

const PERSONA_CATEGORY_COLORS: Record<string, string> = {
  finance:    "#f59e0b", // amber-500
  operations: "#3b82f6", // blue-500
  sales:      "#10b981", // emerald-500
  marketing:  "#ec4899", // pink-500
  hr:         "#8b5cf6", // violet-500
  strategy:   "#ef4444", // red-500
  support:    "#06b6d4", // cyan-500
  tech:       "#6366f1", // indigo-500
  legal:      "#78716c", // stone-500
  default:    "#f97316", // orange-500
};

/** Stopwords italiane + inglesi comuni — per estrarre keyword significative */
const STOPWORDS = new Set([
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "del", "della",
  "dei", "delle", "a", "al", "alla", "ai", "alle", "da", "dal", "dalla", "dai",
  "dalle", "in", "nel", "nella", "nei", "nelle", "con", "su", "sul", "sulla",
  "sui", "sulle", "per", "tra", "fra", "che", "chi", "non", "ma", "se", "e",
  "o", "ed", "anche", "come", "dove", "quando", "più", "meno", "molto", "poco",
  "tutto", "tutti", "ogni", "questo", "questa", "questi", "queste", "quello",
  "quella", "quelli", "quelle", "è", "sono", "ha", "hanno", "fare", "fatto",
  "essere", "stato", "stata", "stati", "state", "viene", "vengono", "può",
  "possono", "deve", "devono", "sempre", "mai", "poi", "già", "solo", "ancora",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have",
  "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
  "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at", "by",
  "from", "as", "into", "through", "during", "before", "after", "above", "below",
  "and", "but", "or", "not", "no", "so", "if", "then", "than", "too", "very",
  "just", "about", "up", "out", "all", "their", "there", "here", "its", "it",
  "this", "that", "these", "those", "other", "which", "who", "whom", "what",
  "each", "every", "both", "few", "more", "most", "some", "any", "such", "only",
]);

const MIN_KEYWORD_LEN = 3;
const KEYWORD_OVERLAP_THRESHOLD = 2; // min shared keywords per edge

// ─── Keyword extraction ───────────────────────────────────────────────────────

function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-zà-úA-ZÀ-Ú0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_KEYWORD_LEN && !STOPWORDS.has(w));
  return new Set(words);
}

// ─── Graph builder ────────────────────────────────────────────────────────────

function buildGraphData(
  personas: PersonaLite[],
  memories: MemoryRow[],
  filterPersona: string | null,
  filterType: string | null,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Filter memories
  let filtered = memories.filter((m) => m.enabled);
  if (filterPersona) filtered = filtered.filter((m) => m.persona_key === filterPersona);
  if (filterType) filtered = filtered.filter((m) => m.memory_type === filterType);

  // Active persona keys (those with at least 1 memory)
  const activePersonaKeys = new Set(filtered.map((m) => m.persona_key));

  // Persona nodes
  const personaMap = new Map(personas.map((p) => [p.persona_key, p]));
  for (const pKey of activePersonaKeys) {
    const p = personaMap.get(pKey);
    if (!p) continue;
    const catColor = PERSONA_CATEGORY_COLORS[p.category] ?? PERSONA_CATEGORY_COLORS.default;
    nodes.push({
      id: `p_${p.persona_key}`,
      label: p.display_name,
      fill: catColor,
      size: 8,
      data: { type: "persona", persona: p },
    });
  }

  // Memory nodes + persona→memory edges
  const keywordsMap = new Map<string, Set<string>>();
  for (const m of filtered) {
    const memId = `m_${m.id}`;
    const typeColor = MEMORY_TYPE_COLORS[m.memory_type] ?? "#94a3b8";
    const hits = m.hits_count ?? 0;
    // Size proportional to hits (min 2, max 6)
    const size = Math.min(6, Math.max(2, 2 + Math.log2(hits + 1)));

    // Truncate label to 60 chars for readability
    const label = m.content.length > 60 ? m.content.slice(0, 57) + "…" : m.content;

    nodes.push({
      id: memId,
      label,
      fill: typeColor,
      size,
      data: {
        type: "memory",
        memory: m,
        typeLabel: MEMORY_TYPE_LABELS[m.memory_type] ?? m.memory_type,
      },
    });

    // Edge: persona → memory
    edges.push({
      id: `e_p_${m.persona_key}_m_${m.id}`,
      source: `p_${m.persona_key}`,
      target: memId,
      size: 1,
    });

    // Extract keywords for cross-linking
    keywordsMap.set(memId, extractKeywords(m.content));
  }

  // Memory ↔ Memory edges (semantic overlap)
  const memIds = [...keywordsMap.keys()];
  const crossEdgeSet = new Set<string>();
  for (let i = 0; i < memIds.length; i++) {
    const kwA = keywordsMap.get(memIds[i])!;
    for (let j = i + 1; j < memIds.length; j++) {
      const kwB = keywordsMap.get(memIds[j])!;
      let overlap = 0;
      for (const w of kwA) {
        if (kwB.has(w)) overlap++;
        if (overlap >= KEYWORD_OVERLAP_THRESHOLD) break;
      }
      if (overlap >= KEYWORD_OVERLAP_THRESHOLD) {
        const edgeKey = `${memIds[i]}__${memIds[j]}`;
        if (!crossEdgeSet.has(edgeKey)) {
          crossEdgeSet.add(edgeKey);
          edges.push({
            id: `e_cross_${edgeKey}`,
            source: memIds[i],
            target: memIds[j],
            size: 0.5,
            fill: "#475569", // slate-600
          });
        }
      }
    }
  }

  return { nodes, edges };
}

// ─── Custom dark theme ────────────────────────────────────────────────────────

const BRAIN_THEME = {
  ...darkTheme,
  canvas: {
    background: "#0c0a1a",       // deep dark purple
    fog: "#0c0a1a",
  },
  node: {
    ...darkTheme.node,
    fill: "#f97316",              // default orange (overridden per-node via fill)
    activeFill: "#fb923c",
    opacity: 0.92,
    selectedOpacity: 1,
    inactiveOpacity: 0.3,
    label: {
      ...darkTheme.node.label,
      color: "#e2e8f0",           // slate-200
      activeColor: "#ffffff",
      stroke: "#0c0a1a",
      backgroundColor: "#1e1b3a",
      backgroundOpacity: 0.85,
      padding: 4,
      radius: 3,
    },
  },
  edge: {
    ...darkTheme.edge,
    fill: "#334155",              // slate-700
    activeFill: "#f97316",        // orange on hover
    opacity: 0.35,
    selectedOpacity: 0.8,
    inactiveOpacity: 0.08,
    label: {
      ...darkTheme.edge.label,
      color: "#94a3b8",
      activeColor: "#e2e8f0",
    },
  },
  arrow: {
    fill: "#475569",
    activeFill: "#f97316",
  },
  ring: {
    fill: "#f97316",
    activeFill: "#fb923c",
  },
  cluster: {
    stroke: "#1e293b",
    fill: "#1e1b3a",
    opacity: 0.15,
    selectedOpacity: 0.3,
    inactiveOpacity: 0.05,
    label: {
      stroke: "#0c0a1a",
      color: "#94a3b8",
      fontSize: 3,
      offset: [0, -2, 0] as [number, number, number],
    },
  },
  lasso: {
    background: "rgba(249,115,22,0.1)",
    border: "1px solid rgba(249,115,22,0.5)",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIBrainGraph() {
  const { effectiveCompany } = useAuth();
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const [is3D, setIs3D] = useState(true);
  const [selectedNode, setSelectedNode] = useState<InternalGraphNode | null>(null);
  const [filterPersona, setFilterPersona] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: personas = [] } = useQuery({
    queryKey: ["brain-graph-personas"],
    queryFn: async (): Promise<PersonaLite[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("ai_personas_public")
        .select("persona_key, display_name, category, color, icon")
        .eq("enabled", true)
        .order("category");
      return (data ?? []) as PersonaLite[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["brain-graph-memories", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    queryFn: async (): Promise<MemoryRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("ai_persona_memory")
        .select("id, persona_key, memory_type, content, confidence, hits_count, enabled, source, created_at")
        .eq("company_id", effectiveCompany!.id)
        .eq("enabled", true)
        .order("hits_count", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as MemoryRow[];
    },
    staleTime: 30_000,
  });

  // ── Build graph ───────────────────────────────────────────────────────────

  const { nodes, edges } = useMemo(
    () => buildGraphData(personas, memories, filterPersona, filterType),
    [personas, memories, filterPersona, filterType],
  );

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const personaCount = nodes.filter((n) => n.data?.type === "persona").length;
    const memoryCount = nodes.filter((n) => n.data?.type === "memory").length;
    const crossEdges = edges.filter((e) => e.id.startsWith("e_cross_")).length;
    return { personaCount, memoryCount, crossEdges, totalEdges: edges.length };
  }, [nodes, edges]);

  // ── Interactions ──────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((node: InternalGraphNode) => {
    setSelectedNode((prev) => prev?.id === node.id ? null : node);
  }, []);

  const handleCanvasClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const resetView = useCallback(() => {
    graphRef.current?.centerGraph();
    setSelectedNode(null);
    setFilterPersona(null);
    setFilterType(null);
  }, []);

  // ── Fullscreen ────────────────────────────────────────────────────────────

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!fullscreen) {
      void containerRef.current.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }, [fullscreen]);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Active selections for highlight ───────────────────────────────────────

  const selections = useMemo(() => {
    if (!selectedNode) return [];
    const sel = [selectedNode.id];
    // Also highlight connected nodes
    for (const e of edges) {
      if (e.source === selectedNode.id) sel.push(e.target);
      else if (e.target === selectedNode.id) sel.push(e.source);
    }
    return sel;
  }, [selectedNode, edges]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-[#0c0a1a] rounded-xl">
        <div className="flex flex-col items-center gap-3">
          <Brain className="h-10 w-10 text-orange-400 animate-pulse" />
          <p className="text-sm text-slate-400">Caricamento cervello AI…</p>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-[#0c0a1a] rounded-xl">
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <Network className="h-12 w-12 text-slate-600" />
          <p className="text-sm text-slate-400 font-medium">Nessuna memoria AI ancora</p>
          <p className="text-xs text-slate-500 max-w-sm">
            Inizia a parlare con le AI Personas nella tab Chat. Il sistema creerà automaticamente
            memorie che appariranno qui come nodi collegati.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative rounded-xl overflow-hidden border border-slate-800 bg-[#0c0a1a]",
        fullscreen ? "fixed inset-0 z-50 rounded-none" : "h-[600px]",
      )}
    >
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Stats badges */}
          <Badge className="bg-slate-800/80 text-slate-300 border-slate-700 backdrop-blur-sm text-[10px] gap-1.5">
            <Brain className="h-3 w-3 text-orange-400" />
            {stats.personaCount} personas
          </Badge>
          <Badge className="bg-slate-800/80 text-slate-300 border-slate-700 backdrop-blur-sm text-[10px] gap-1.5">
            <Sparkles className="h-3 w-3 text-violet-400" />
            {stats.memoryCount} memorie
          </Badge>
          <Badge className="bg-slate-800/80 text-slate-300 border-slate-700 backdrop-blur-sm text-[10px] gap-1.5">
            <Network className="h-3 w-3 text-emerald-400" />
            {stats.crossEdges} connessioni
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* 2D/3D toggle */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-[10px] bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white backdrop-blur-sm"
            onClick={() => setIs3D(!is3D)}
          >
            {is3D ? "3D" : "2D"}
          </Button>
          {/* Reset */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-white backdrop-blur-sm"
            onClick={resetView}
            title="Reset vista"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          {/* Fullscreen */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-white backdrop-blur-sm"
            onClick={toggleFullscreen}
            title={fullscreen ? "Esci fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      {(filterPersona || filterType) && (
        <div className="absolute top-12 left-3 z-10 flex items-center gap-1.5">
          {filterPersona && (
            <Badge
              className="bg-orange-900/60 text-orange-300 border-orange-700 backdrop-blur-sm text-[10px] gap-1 cursor-pointer hover:bg-orange-800/60"
              onClick={() => setFilterPersona(null)}
            >
              {personas.find((p) => p.persona_key === filterPersona)?.display_name ?? filterPersona}
              <X className="h-2.5 w-2.5" />
            </Badge>
          )}
          {filterType && (
            <Badge
              className="backdrop-blur-sm text-[10px] gap-1 cursor-pointer hover:opacity-80"
              style={{ backgroundColor: `${MEMORY_TYPE_COLORS[filterType]}33`, color: MEMORY_TYPE_COLORS[filterType], borderColor: `${MEMORY_TYPE_COLORS[filterType]}66` }}
              onClick={() => setFilterType(null)}
            >
              {MEMORY_TYPE_LABELS[filterType] ?? filterType}
              <X className="h-2.5 w-2.5" />
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[9px] text-slate-500 hover:text-white"
            onClick={resetView}
          >
            Resetta tutto
          </Button>
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 pointer-events-auto">
        <div className="bg-slate-900/80 backdrop-blur-sm rounded-lg p-2 border border-slate-800">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1.5 font-semibold">Tipo memoria</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(MEMORY_TYPE_LABELS).map(([key, label]) => (
              <button
                key={key}
                className={cn(
                  "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-all",
                  filterType === key
                    ? "ring-1 ring-white/40 bg-white/10"
                    : "hover:bg-white/5",
                )}
                onClick={() => setFilterType(filterType === key ? null : key)}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: MEMORY_TYPE_COLORS[key] }}
                />
                <span className="text-slate-400">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Detail panel ───────────────────────────────────────────────────── */}
      {selectedNode && (
        <div className="absolute bottom-3 right-3 z-10 w-72 bg-slate-900/90 backdrop-blur-md rounded-lg border border-slate-700 p-3 pointer-events-auto shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {selectedNode.data?.type === "persona" ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: selectedNode.fill as string }}
                    />
                    <span className="text-sm font-semibold text-white truncate">
                      {selectedNode.data.persona.display_name}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Categoria: {selectedNode.data.persona.category}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {memories.filter((m) => m.persona_key === selectedNode.data.persona.persona_key).length} memorie totali
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 h-6 text-[10px] text-orange-400 hover:text-orange-300 hover:bg-orange-900/30 gap-1 px-2"
                    onClick={() => {
                      setFilterPersona(selectedNode.data.persona.persona_key);
                      setSelectedNode(null);
                    }}
                  >
                    <Filter className="h-3 w-3" />
                    Filtra solo questa persona
                  </Button>
                </>
              ) : selectedNode.data?.type === "memory" ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      className="text-[9px] h-4 px-1.5 border"
                      style={{
                        backgroundColor: `${MEMORY_TYPE_COLORS[selectedNode.data.memory.memory_type]}22`,
                        color: MEMORY_TYPE_COLORS[selectedNode.data.memory.memory_type],
                        borderColor: `${MEMORY_TYPE_COLORS[selectedNode.data.memory.memory_type]}55`,
                      }}
                    >
                      {selectedNode.data.typeLabel}
                    </Badge>
                    <span className="text-[10px] text-slate-500">
                      {personas.find((p) => p.persona_key === selectedNode.data.memory.persona_key)?.display_name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed mt-1">
                    {selectedNode.data.memory.content}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                    <span>{selectedNode.data.memory.hits_count ?? 0} hits</span>
                    <span>Conf. {((selectedNode.data.memory.confidence ?? 1) * 100).toFixed(0)}%</span>
                    <span>{selectedNode.data.memory.source ?? "auto"}</span>
                  </div>
                </>
              ) : null}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 text-slate-500 hover:text-white"
              onClick={() => setSelectedNode(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Graph canvas ───────────────────────────────────────────────────── */}
      <GraphCanvas
        ref={graphRef}
        nodes={nodes}
        edges={edges}
        theme={BRAIN_THEME}
        layoutType={is3D ? "forceDirected3d" : "forceDirected2d"}
        sizingType="attribute"
        sizingAttribute="size"
        defaultNodeSize={4}
        minNodeSize={2}
        maxNodeSize={10}
        animated
        draggable
        labelType="auto"
        edgeInterpolation="curved"
        edgeArrowPosition="none"
        selections={selections}
        onNodeClick={handleNodeClick}
        onCanvasClick={handleCanvasClick}
      />
    </div>
  );
}
