/**
 * AIBrainGraph — v2.0
 *
 * Visualizzazione a grafo interattivo del "cervello AI" dell'azienda.
 * Mostra le connessioni tra le 18 Personas AI e le loro memorie come
 * una mappa neurale — stile Obsidian Graph View / InfraNodus.
 *
 * v2.0 improvements:
 *   1. Search nel grafo con highlight/fade
 *   2. Cross-persona edges (connessioni trasversali tra dipartimenti)
 *   3. Clustering visivo con anelli per persona
 *   4. Real-time live via Supabase subscription
 *   5. Double-click persona → zoom cinematico
 *   6. Insights panel (god nodes, orfani, bridge, health)
 *   7. Edge hover → tooltip con keyword condivise
 *   8. Heat map mode (recency/hits vs tipo)
 *   9. Export screenshot PNG
 *  10. Stemming italiano basico per NLP migliore
 *
 * Tech: SVG renderer proprietario, con posizioni deterministiche e fallback sicuro.
 */

import { forwardRef, useState, useMemo, useCallback, useRef, useEffect, useImperativeHandle } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";
import {
  DEMO_AI_PERSONAS,
  DEMO_MEMORIES,
  isOrchestratorPersonaKey,
  resolveDemoPersonaKey,
} from "./brainGraphDemoMemories";
import { BrainStarfield } from "./BrainStarfield";
import { BrainInsightFeed } from "./BrainInsightFeed";
import { BrainSemanticSearch } from "./BrainSemanticSearch";
import { BrainPersonaStats } from "./BrainPersonaStats";
import { BrainOnboardingTour } from "./BrainOnboardingTour";
import { BrainMascot } from "./BrainMascot";
import { BrainPersonaSheet } from "./BrainPersonaSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Brain, Maximize2, Minimize2, RotateCcw,
  Filter, X, Sparkles, Network, Camera,
  Flame, Palette, ChevronRight, ChevronDown,
  Link2, Zap, Ghost, Settings2, ZoomIn, ZoomOut,
} from "lucide-react";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";

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

interface GraphNodeData {
  type?: "persona" | "memory" | "silvio";
  persona?: PersonaLite;
  memory?: MemoryRow;
  memoryCount?: number;
  personaCount?: number;
  activePersonaCount?: number;
  connectionCount?: number;
  emoji?: string;
  typeLabel?: string;
  personaName?: string;
  previewLabel?: string;
  [key: string]: unknown;
}

interface GraphNode {
  id: string;
  label?: string;
  fill?: string;
  size?: number;
  labelVisible?: boolean;
  cluster?: string;
  fx?: number;
  fy?: number;
  fz?: number;
  data?: GraphNodeData;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  size?: number;
  fill?: string;
}

interface LooseSupabaseResult<T = unknown> {
  data?: T | null;
  error?: unknown;
}

interface LooseSupabaseQuery<T = unknown> extends PromiseLike<LooseSupabaseResult<T>> {
  select: (columns: string) => LooseSupabaseQuery<T>;
  eq: (column: string, value: unknown) => LooseSupabaseQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => LooseSupabaseQuery<T>;
  limit: (count: number) => LooseSupabaseQuery<T>;
  update: (values: Record<string, unknown>) => LooseSupabaseQuery<T>;
}

interface LooseSupabaseClient {
  from: <T = unknown>(table: string) => LooseSupabaseQuery<T>;
  rpc: <T = unknown>(functionName: string, args?: Record<string, unknown>) => PromiseLike<LooseSupabaseResult<T>>;
}

type InternalGraphNode = GraphNode;
type InternalGraphEdge = GraphEdge;

interface BrainGraphCanvasHandle {
  centerGraph: (ids?: string[]) => void;
  fitNodesInView: (ids?: string[], options?: { fitOnlyIfNodesNotInView?: boolean }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  exportCanvas: () => string | null;
}

const brainSupabase = supabase as unknown as LooseSupabaseClient;

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
  finance:    "#f59e0b",
  operations: "#3b82f6",
  sales:      "#10b981",
  marketing:  "#ec4899",
  hr:         "#8b5cf6",
  strategy:   "#ef4444",
  support:    "#06b6d4",
  tech:       "#6366f1",
  legal:      "#78716c",
  default:    "#f97316",
};

// Emoji caratteristica per ogni categoria persona
const PERSONA_CATEGORY_EMOJI: Record<string, string> = {
  finance:    "💰",
  operations: "🔨",
  sales:      "📊",
  marketing:  "📢",
  hr:         "👥",
  strategy:   "🎯",
  support:    "🎧",
  tech:       "💻",
  legal:      "⚖️",
  compliance: "📋",
  default:    "⚡",
};

// ─── Heat map colors (cold → hot) ────────────────────────────────────────────

function heatColor(value: number): string {
  // value 0→1: cold (blue) → warm (yellow) → hot (red)
  if (value < 0.33) return "#3b82f6";      // blue
  if (value < 0.5)  return "#06b6d4";      // cyan
  if (value < 0.66) return "#fbbf24";      // amber
  if (value < 0.85) return "#f97316";      // orange
  return "#ef4444";                         // red
}

// ─── Stopwords ────────────────────────────────────────────────────────────────

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
const KEYWORD_OVERLAP_THRESHOLD = 2;
const MAX_KEYWORD_BUCKET_SIZE = 50;
const MAX_PAIR_CANDIDATES = 20_000;
const MAX_VISIBLE_MEMORY_CROSS_EDGES = 180;

// ─── #10: Italian stemmer (suffix stripping) ─────────────────────────────────
// Riduce varianti morfologiche allo stesso stem senza dipendenze esterne.
// "cantieri"→"cantier", "pagamento"→"pagament", "fatture"→"fattur"

const IT_SUFFIXES = [
  "azione", "zioni", "mente", "ibile", "abile",
  "ismo", "ista", "iere", "iera",
  "ando", "endo", "ato", "ata", "ati", "ate", "uto", "uta", "iti", "ite",
  "are", "ere", "ire", "ono", "ano",
  "ità", "tà",
  "io", "ia", "ie", "ii",
  "oi", "ai", "ei",
  "i", "e", "o", "a",
];

function stemIt(word: string): string {
  if (word.length < 4) return word;
  for (const suf of IT_SUFFIXES) {
    if (word.length - suf.length >= 3 && word.endsWith(suf)) {
      return word.slice(0, -suf.length);
    }
  }
  return word;
}

// ─── Keyword extraction (with stemming) ───────────────────────────────────────

function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-zà-úA-ZÀ-Ú0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_KEYWORD_LEN && !STOPWORDS.has(w));
  return new Set(words.map(stemIt));
}

/** Returns the actual shared keywords (unstemmed) for tooltip display */
function sharedKeywordsDisplay(textA: string, textB: string): string[] {
  const wordsA = textA.toLowerCase().replace(/[^a-zà-úA-ZÀ-Ú0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length >= MIN_KEYWORD_LEN && !STOPWORDS.has(w));
  const wordsB = new Set(
    textB.toLowerCase().replace(/[^a-zà-úA-ZÀ-Ú0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length >= MIN_KEYWORD_LEN && !STOPWORDS.has(w))
  );
  const stemsB = new Map<string, string>();
  for (const w of wordsB) stemsB.set(stemIt(w), w);

  const shared: string[] = [];
  const seen = new Set<string>();
  for (const w of wordsA) {
    const stem = stemIt(w);
    if (stemsB.has(stem) && !seen.has(stem)) {
      seen.add(stem);
      shared.push(w);
    }
  }
  return shared;
}

interface KeywordPairOverlap {
  a: string;
  b: string;
  overlap: number;
}

function getPairKey(a: string, b: string) {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function buildKeywordPairOverlaps(keywordMap: Map<string, Set<string>>): KeywordPairOverlap[] {
  const inverted = new Map<string, string[]>();

  for (const [nodeId, keywords] of keywordMap) {
    for (const keyword of keywords) {
      const list = inverted.get(keyword);
      if (list) list.push(nodeId);
      else inverted.set(keyword, [nodeId]);
    }
  }

  const counts = new Map<string, { a: string; b: string; overlap: number }>();

  for (const ids of inverted.values()) {
    if (ids.length < 2 || ids.length > MAX_KEYWORD_BUCKET_SIZE) continue;

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i] < ids[j] ? ids[i] : ids[j];
        const b = ids[i] < ids[j] ? ids[j] : ids[i];
        const key = `${a}__${b}`;
        const existing = counts.get(key);

        if (existing) {
          existing.overlap += 1;
        } else if (counts.size < MAX_PAIR_CANDIDATES) {
          counts.set(key, { a, b, overlap: 1 });
        }
      }
    }
  }

  return [...counts.values()]
    .filter((pair) => pair.overlap >= KEYWORD_OVERLAP_THRESHOLD)
    .sort((a, b) => b.overlap - a.overlap);
}

// ─── Graph builder ────────────────────────────────────────────────────────────

interface GraphBuildResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Map edge_id → shared keyword strings (for tooltip) */
  edgeKeywords: Map<string, string[]>;
  /** Map memory_id → Set<connected_node_ids> (for insights) */
  connectionsMap: Map<string, Set<string>>;
  /** Cross-persona edges (persona_key → persona_key → count) */
  crossPersonaLinks: Map<string, Map<string, number>>;
}

type ColorMode = "cluster" | "type" | "heat";

function buildGraphData(
  personas: PersonaLite[],
  memories: MemoryRow[],
  filterPersona: string | null,
  filterType: string | null,
  colorMode: ColorMode,
  viewMode: "galaxy" | "detail",
  expandedPersonas: Set<string>,
  viewDim: "2d" | "3d" | "core",
): GraphBuildResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeKeywords = new Map<string, string[]>();
  const connectionsMap = new Map<string, Set<string>>();
  const crossPersonaLinks = new Map<string, Map<string, number>>();

  // Filter
  let filtered = memories.filter((m) => m.enabled);
  if (filterPersona) filtered = filtered.filter((m) => m.persona_key === filterPersona);
  if (filterType) filtered = filtered.filter((m) => m.memory_type === filterType);

  const graphPersonas = (filterPersona
    ? personas.filter((p) => p.persona_key === filterPersona)
    : personas
  ).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.display_name.localeCompare(b.display_name);
  });
  const graphPersonaKeys = new Set(graphPersonas.map((p) => p.persona_key));
  filtered = filtered.filter((m) => graphPersonaKeys.has(m.persona_key));

  // Heat map ranges
  const maxHits = Math.max(1, ...filtered.map((m) => m.hits_count ?? 0));
  const now = Date.now();
  const oldest = Math.min(...filtered.map((m) => new Date(m.created_at).getTime()), now);
  const timeRange = Math.max(1, now - oldest);

  // Persona nodes — layout CIRCOLARE FISSO in galaxy mode + dimensione proporzionale
  const personaMap = new Map(personas.map((p) => [p.persona_key, p]));
  const memoriesPerPersona = new Map<string, number>();
  for (const m of filtered) {
    memoriesPerPersona.set(m.persona_key, (memoriesPerPersona.get(m.persona_key) ?? 0) + 1);
  }
  const maxMemCount = Math.max(1, ...memoriesPerPersona.values());
  const personasInMemoryCount = [...memoriesPerPersona.values()].filter((count) => count > 0).length;

  // Sort personas per category per posizionarle in ordine deterministico.
  // Importante: il grafo deve mostrare tutte le personas abilitate, non solo
  // quelle che hanno gia memorie nel filtro corrente.
  const activePersonasList = graphPersonas;

  // Layout fisso: 2D = cerchio matematico, 3D/core = sfera Fibonacci
  const useFixedCircle = viewDim === "2d";
  const useFixedSphere = viewDim === "3d" || viewDim === "core";
  const RADIUS = 350;        // raggio cerchio (2D) o sfera (3D core)
  const MEM_RADIUS = 70;     // mini-orbite attorno a ogni persona

  // Pre-compute posizioni 3D delle personas (cerchio 2D o sfera 3D)
  const personaPositions = new Map<string, { x: number; y: number; z?: number }>();
  if (useFixedCircle) {
    // Cerchio matematico equispaziato (2D, z=0)
    activePersonasList.forEach((p, i) => {
      const angle = (i / activePersonasList.length) * Math.PI * 2 - Math.PI / 2;
      personaPositions.set(p.persona_key, {
        x: Math.cos(angle) * RADIUS,
        y: Math.sin(angle) * RADIUS,
      });
    });
  } else if (useFixedSphere) {
    // Distribuzione Fibonacci-sphere → punti uniformemente sparsi sulla
    // superficie di una vera sfera 3D (effetto "palla con nodi dentro")
    const n = activePersonasList.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    activePersonasList.forEach((p, i) => {
      const y = 1 - (i / Math.max(1, n - 1)) * 2;     // -1 → 1
      const r = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;
      personaPositions.set(p.persona_key, {
        x: Math.cos(theta) * r * RADIUS,
        y: y * RADIUS,
        z: Math.sin(theta) * r * RADIUS,
      });
    });
  }

  activePersonasList.forEach((p) => {
    const catColor = PERSONA_CATEGORY_COLORS[p.category] ?? PERSONA_CATEGORY_COLORS.default;
    const memCount = memoriesPerPersona.get(p.persona_key) ?? 0;

    const size = viewMode === "galaxy"
      ? 11 + Math.round((memCount / maxMemCount) * 11)   // hub 11-22 (più contenuti)
      : 9;

    // Layout circolare deterministico (2D) o sferico (3D core) — mappa pre-calcolata
    const pos = personaPositions.get(p.persona_key);
    const fx = pos ? pos.x : undefined;
    const fy = pos ? pos.y : undefined;
    const fz = pos?.z; // undefined in 2D, valore reale in core

    const emoji = PERSONA_CATEGORY_EMOJI[p.category] ?? PERSONA_CATEGORY_EMOJI.default;
    nodes.push({
      id: `p_${p.persona_key}`,
      label: `${p.display_name}${viewMode === "galaxy" ? ` · ${memCount}` : ""}`,
      fill: catColor,
      size,
      labelVisible: true,
      cluster: `cat_${p.category}`,
      fx,
      fy,
      fz,                              // 3D position in core/sfera mode
      // Emoji disponibile per detail panel HTML (canvas WebGL non supporta emoji nel testo)
      data: { type: "persona", persona: p, memoryCount: memCount, emoji },
    });
    connectionsMap.set(`p_${p.persona_key}`, new Set());
  });

  nodes.push({
    id: SILVIO_NODE_ID,
    label: "Silvio",
    fill: SILVIO_NODE_FILL,
    size: 34,
    labelVisible: true,
    cluster: "silvio_core",
    fx: 0,
    fy: 0,
    fz: 0,
    data: {
      type: "silvio",
      emoji: "🧠",
      personaCount: activePersonasList.length,
      activePersonaCount: personasInMemoryCount,
      memoryCount: filtered.length,
      previewLabel: "Orchestratore AI aziendale",
    },
  });
  connectionsMap.set(SILVIO_NODE_ID, new Set());

  for (const p of activePersonasList) {
    const memCount = memoriesPerPersona.get(p.persona_key) ?? 0;
    const personaNodeId = `p_${p.persona_key}`;
    edges.push({
      id: `e_silvio_${p.persona_key}`,
      source: SILVIO_NODE_ID,
      target: personaNodeId,
      size: memCount > 0 ? Math.min(4.2, 1.4 + Math.log2(memCount + 1) * 0.45) : 0.75,
      fill: memCount > 0 ? "#fb923c" : "#334155",
    });
    connectionsMap.get(SILVIO_NODE_ID)?.add(personaNodeId);
    connectionsMap.get(personaNodeId)?.add(SILVIO_NODE_ID);
  }

  // Memory nodes + edges
  // In galaxy mode mostriamo SOLO le memorie delle personas espanse — il resto
  // resta "compresso" nel nodo persona (size proporzionale)
  const showAllMemories = viewMode === "detail";
  const visibleMemories = showAllMemories
    ? filtered
    : filtered.filter((m) => expandedPersonas.has(m.persona_key));
  const visibleMemoryByNodeId = new Map(visibleMemories.map((m) => [`m_${m.id}`, m] as const));
  const filteredMemoryByNodeId = new Map(filtered.map((m) => [`m_${m.id}`, m] as const));
  const allKeywordsMap = new Map<string, Set<string>>();
  for (const m of filtered) {
    allKeywordsMap.set(`m_${m.id}`, extractKeywords(m.content));
  }

  const keywordsMap = new Map<string, Set<string>>();
  const memoryByPersona = new Map<string, string[]>(); // persona_key → [memId, ...]

  // Pre-calcolo indice memoria all'interno della sua persona (per posizionamento)
  const memIndexInPersona = new Map<string, number>();
  const memCountByPersonaForLayout = new Map<string, number>();
  for (const m of visibleMemories) {
    const cur = memCountByPersonaForLayout.get(m.persona_key) ?? 0;
    memIndexInPersona.set(m.id, cur);
    memCountByPersonaForLayout.set(m.persona_key, cur + 1);
  }

  for (const m of visibleMemories) {
    const memId = `m_${m.id}`;
    const hits = m.hits_count ?? 0;
    const size = Math.min(6, Math.max(2, 2 + Math.log2(hits + 1)));
    // Short label (32 chars) per leggibilità su grafi densi
    const label = m.content.length > 32 ? m.content.slice(0, 30) + "…" : m.content;

    // Persona for this memory
    const persona = personaMap.get(m.persona_key);

    // Posizione fissa per la memoria: mini-orbita attorno alla persona
    // 2D: cerchio piatto. 3D core: mini-sfera Fibonacci attorno.
    let memFx: number | undefined;
    let memFy: number | undefined;
    let memFz: number | undefined;
    const personaPos = personaPositions.get(m.persona_key);
    if (personaPos && (useFixedCircle || useFixedSphere)) {
      const idx = memIndexInPersona.get(m.id) ?? 0;
      const total = memCountByPersonaForLayout.get(m.persona_key) ?? 1;
      if (useFixedCircle) {
        const a = (idx / total) * Math.PI * 2;
        memFx = personaPos.x + Math.cos(a) * MEM_RADIUS;
        memFy = personaPos.y + Math.sin(a) * MEM_RADIUS;
      } else {
        // Mini-sfera Fibonacci attorno alla persona (in 3D)
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const y = 1 - (idx / Math.max(1, total - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = goldenAngle * idx;
        memFx = personaPos.x + Math.cos(theta) * r * MEM_RADIUS;
        memFy = personaPos.y + y * MEM_RADIUS;
        memFz = (personaPos.z ?? 0) + Math.sin(theta) * r * MEM_RADIUS;
      }
    }

    // Colore: cluster (per persona, default) / type (per tipo memoria) / heat (attività)
    let fill: string;
    if (colorMode === "heat") {
      const recency = (new Date(m.created_at).getTime() - oldest) / timeRange;
      const hitScore = hits / maxHits;
      const heat = recency * 0.4 + hitScore * 0.6;
      fill = heatColor(heat);
    } else if (colorMode === "type") {
      fill = MEMORY_TYPE_COLORS[m.memory_type] ?? "#94a3b8";
    } else {
      // cluster: colore della persona
      const catColor = persona ? (PERSONA_CATEGORY_COLORS[persona.category] ?? PERSONA_CATEGORY_COLORS.default) : "#94a3b8";
      fill = catColor;
    }

    nodes.push({
      id: memId,
      // No label sul grafo (riduce rumore visivo) — visibile solo nel detail panel
      // su click. Il contenuto è in `data.memory.content`.
      fill,
      size,
      // #3: cluster by persona_key
      cluster: `persona_${m.persona_key}`,
      fx: memFx,
      fy: memFy,
      fz: memFz,
      data: {
        type: "memory",
        memory: m,
        typeLabel: MEMORY_TYPE_LABELS[m.memory_type] ?? m.memory_type,
        personaName: persona?.display_name ?? m.persona_key,
        previewLabel: label, // tenuto per ricerca / dettagli
      },
    });

    // Edge: persona → memory
    const personaEdgeId = `e_p_${m.persona_key}_m_${m.id}`;
    edges.push({
      id: personaEdgeId,
      source: `p_${m.persona_key}`,
      target: memId,
      size: 1,
    });

    // Track connections
    connectionsMap.set(memId, new Set([`p_${m.persona_key}`]));
    connectionsMap.get(`p_${m.persona_key}`)?.add(memId);

    // Track per-persona memories
    if (!memoryByPersona.has(m.persona_key)) memoryByPersona.set(m.persona_key, []);
    memoryByPersona.get(m.persona_key)!.push(memId);

    keywordsMap.set(memId, allKeywordsMap.get(memId) ?? extractKeywords(m.content));
  }

  // Memory ↔ Memory cross-edges (semantic overlap)
  // Per calcolare i ponti cross-persona ho bisogno di analizzare TUTTE le memorie
  // anche se non sono visualizzate (in galaxy mode). Calcolo le cross-persona
  // da tutte le filtered, ma genero edges memory↔memory solo per memorie visibili.
  const visiblePairOverlaps = buildKeywordPairOverlaps(keywordsMap)
    .slice(0, MAX_VISIBLE_MEMORY_CROSS_EDGES);

  for (const pair of visiblePairOverlaps) {
    const memA = visibleMemoryByNodeId.get(pair.a);
    const memB = visibleMemoryByNodeId.get(pair.b);
    if (!memA || !memB) continue;

    const edgeKey = getPairKey(pair.a, pair.b);
    const edgeId = `e_cross_${edgeKey}`;
    edges.push({
      id: edgeId,
      source: pair.a,
      target: pair.b,
      size: Math.min(2, 0.5 + pair.overlap * 0.3),
      fill: "#475569",
    });

    edgeKeywords.set(edgeId, sharedKeywordsDisplay(memA.content, memB.content));
    connectionsMap.get(pair.a)?.add(pair.b);
    connectionsMap.get(pair.b)?.add(pair.a);
  }

  // Calcolo cross-persona da TUTTE le memorie (anche non visibili in galaxy mode)
  // per mostrare i ponti persona↔persona corretti
  const allCrossPersona = new Map<string, Map<string, number>>();
  for (const pair of buildKeywordPairOverlaps(allKeywordsMap)) {
    const memA = filteredMemoryByNodeId.get(pair.a);
    const memB = filteredMemoryByNodeId.get(pair.b);
    if (!memA || !memB || memA.persona_key === memB.persona_key) continue;

    const [pA, pB] = [memA.persona_key, memB.persona_key].sort();
    if (!allCrossPersona.has(pA)) allCrossPersona.set(pA, new Map());
    const existing = allCrossPersona.get(pA)!.get(pB) ?? 0;
    allCrossPersona.get(pA)!.set(pB, existing + 1);
  }

  // #2: Add cross-persona edges
  for (const [pA, targets] of allCrossPersona) {
    for (const [pB, count] of targets) {
      if (count >= 1 && graphPersonaKeys.has(pA) && graphPersonaKeys.has(pB)) {
        edges.push({
          id: `e_xp_${pA}_${pB}`,
          source: `p_${pA}`,
          target: `p_${pB}`,
          // Top cross (≥3 link) sono SPESSE per attirare l'occhio
          size: count >= 3 ? Math.min(7, 2.5 + count * 0.6) : Math.min(5, 1.5 + count * 0.5),
          fill: "#fb923c",
        });
        connectionsMap.get(`p_${pA}`)?.add(`p_${pB}`);
        connectionsMap.get(`p_${pB}`)?.add(`p_${pA}`);
      }
    }
  }

  // Aggiorna crossPersonaLinks con il calcolo completo (per insights)
  crossPersonaLinks.clear();
  for (const [pA, targets] of allCrossPersona) {
    crossPersonaLinks.set(pA, targets);
  }

  return { nodes, edges, edgeKeywords, connectionsMap, crossPersonaLinks };
}

// ─── Insights calculator ──────────────────────────────────────────────────────

interface HealthBreakdown {
  coverage: number;    // % personas con >=3 memorie
  crossLinkage: number; // % personas connesse trasversalmente
  freshness: number;   // % memorie aggiornate ultimi 30gg
  activity: number;    // % memorie usate (hits > 0)
}

interface Insights {
  godNodes: Array<{ id: string; label: string; connections: number }>;
  orphans: Array<{ id: string; label: string }>;
  bridges: Array<{ id: string; label: string; personasLinked: string[] }>;
  healthPct: number; // score composto (media pesata delle 4 sub-metriche)
  healthBreakdown: HealthBreakdown;
  totalCrossLinks: number;
}

interface MemoryDuplicateCluster {
  signature: string;
  count: number;
  personas: string[];
}

interface MemoryQualityReport {
  reliabilityPct: number;
  staleCount: number;
  lowConfidenceCount: number;
  unusedCount: number;
  demoCount: number;
  duplicateClusters: MemoryDuplicateCluster[];
  trustedSourcePct: number;
  riskyCount: number;
  qualityActionQueue: string[];
}

interface KnowledgeCommunity {
  key: string;
  label: string;
  color: string;
  personaCount: number;
  activePersonaCount: number;
  memoryCount: number;
  crossLinks: number;
  healthPct: number;
  riskLabel: string;
}

function computeInsights(
  nodes: GraphNode[],
  connectionsMap: Map<string, Set<string>>,
  crossPersonaLinks: Map<string, Map<string, number>>,
  memories: MemoryRow[],
  personas: PersonaLite[],
): Insights {
  const personaMap = new Map(personas.map((p) => [p.persona_key, p]));
  const memoryByNodeId = new Map(memories.map((m) => [`m_${m.id}`, m] as const));
  const nodeLabel = (node: GraphNode | undefined) => {
    const content = node?.data?.memory?.content ?? "";
    return node?.label ?? node?.data?.previewLabel ?? (content.length > 80 ? `${content.slice(0, 77)}…` : content);
  };

  // God nodes: memory nodes with most connections (excluding persona edges)
  const memoryNodes = nodes.filter((n) => n.data?.type === "memory");
  const ranked = memoryNodes
    .map((n) => ({
      id: n.id,
      label: nodeLabel(n),
      connections: (connectionsMap.get(n.id)?.size ?? 0),
    }))
    .sort((a, b) => b.connections - a.connections);

  const godNodes = ranked.slice(0, 5).filter((n) => n.connections > 1);

  // Orphans: memory nodes connected only to their persona (1 connection)
  const orphans = ranked
    .filter((n) => n.connections <= 1)
    .slice(0, 5);

  // Bridges: memorie che collegano personas diverse
  const bridgeSet = new Map<string, Set<string>>(); // memId → Set<persona_key>
  for (const m of memories) {
    const memId = `m_${m.id}`;
    if (!bridgeSet.has(memId)) bridgeSet.set(memId, new Set());
    bridgeSet.get(memId)!.add(m.persona_key);
    // Check connected memories for different personas
    const connected = connectionsMap.get(memId);
    if (connected) {
      for (const cId of connected) {
        if (cId.startsWith("m_")) {
          const connMem = memoryByNodeId.get(cId);
          if (connMem && connMem.persona_key !== m.persona_key) {
            bridgeSet.get(memId)!.add(connMem.persona_key);
          }
        }
      }
    }
  }
  const bridges = [...bridgeSet.entries()]
    .filter(([, pks]) => pks.size >= 2)
    .map(([memId, pks]) => ({
      id: memId,
      label: nodeLabel(nodes.find((n) => n.id === memId)),
      personasLinked: [...pks].map((pk) => personaMap.get(pk)?.display_name ?? pk),
    }))
    .sort((a, b) => b.personasLinked.length - a.personasLinked.length)
    .slice(0, 5);

  // Health score composto (4 sub-metriche)
  const enabledMems = memories.filter((m) => m.enabled);
  const totalEnabled = enabledMems.length;

  // 1. Coverage: % personas con >=3 memorie
  const memCountByPersona = new Map<string, number>();
  for (const m of enabledMems) memCountByPersona.set(m.persona_key, (memCountByPersona.get(m.persona_key) ?? 0) + 1);
  const personasWithEnough = [...memCountByPersona.values()].filter((c) => c >= 3).length;
  const personaDenominator = Math.max(1, personas.length);
  const coverage = personas.length > 0 ? Math.round((personasWithEnough / personaDenominator) * 100) : 0;

  // 2. Cross-linkage: % personas con >=1 cross-persona link
  const personasWithCross = new Set<string>();
  for (const [pA, targets] of crossPersonaLinks) {
    if (targets.size > 0) personasWithCross.add(pA);
    for (const pB of targets.keys()) personasWithCross.add(pB);
  }
  const crossLinkage = personas.length > 0
    ? Math.round((personasWithCross.size / personaDenominator) * 100)
    : 0;

  // 3. Freshness: % memorie aggiornate ultimi 30gg
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const fresh = enabledMems.filter((m) => {
    const age = (now - new Date(m.created_at).getTime()) / dayMs;
    return age <= 30;
  }).length;
  const freshness = totalEnabled > 0 ? Math.round((fresh / totalEnabled) * 100) : 0;

  // 4. Activity: % memorie usate (hits > 0)
  const withHits = enabledMems.filter((m) => (m.hits_count ?? 0) > 0).length;
  const activity = totalEnabled > 0 ? Math.round((withHits / totalEnabled) * 100) : 0;

  const healthBreakdown: HealthBreakdown = { coverage, crossLinkage, freshness, activity };
  // Score composto: media pesata (activity e crossLinkage più importanti)
  const healthPct = Math.round(
    coverage * 0.2 + crossLinkage * 0.3 + freshness * 0.2 + activity * 0.3,
  );

  // Total cross-links
  let totalCrossLinks = 0;
  for (const [, targets] of crossPersonaLinks) {
    for (const [, count] of targets) totalCrossLinks += count;
  }

  return { godNodes, orphans, bridges, healthPct, healthBreakdown, totalCrossLinks };
}

function normalizeMemorySignature(content: string) {
  return content
    .toLowerCase()
    .replace(/[^a-zà-ú0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
    .slice(0, 18)
    .join(" ");
}

function isDemoMemorySource(source: string | null) {
  return source?.startsWith("demo") ?? false;
}

function computeMemoryQualityReport(memories: MemoryRow[], personas: PersonaLite[]): MemoryQualityReport {
  const enabled = memories.filter((memory) => memory.enabled);
  const total = enabled.length;

  if (total === 0) {
    return {
      reliabilityPct: 0,
      staleCount: 0,
      lowConfidenceCount: 0,
      unusedCount: 0,
      demoCount: 0,
      duplicateClusters: [],
      trustedSourcePct: 0,
      riskyCount: 0,
      qualityActionQueue: ["Crea almeno una memoria verificata per iniziare a rendere operativo il cervello."],
    };
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const staleBeforeMs = now - MEMORY_STALE_DAYS * dayMs;
  const duplicateMap = new Map<string, { count: number; personas: Set<string> }>();
  const riskyIds = new Set<string>();

  let staleCount = 0;
  let lowConfidenceCount = 0;
  let unusedCount = 0;
  let demoCount = 0;
  let trustedCount = 0;

  for (const memory of enabled) {
    const confidence = memory.confidence ?? 1;
    const isStale = new Date(memory.created_at).getTime() < staleBeforeMs;
    const isLowConfidence = confidence < MEMORY_LOW_CONFIDENCE_THRESHOLD;
    const isUnused = (memory.hits_count ?? 0) === 0;
    const isDemo = isDemoMemorySource(memory.source);

    if (isStale) {
      staleCount++;
      riskyIds.add(memory.id);
    }
    if (isLowConfidence) {
      lowConfidenceCount++;
      riskyIds.add(memory.id);
    }
    if (isUnused) {
      unusedCount++;
      riskyIds.add(memory.id);
    }
    if (isDemo) demoCount++;
    if (!isDemo && confidence >= 0.75 && (memory.hits_count ?? 0) > 0) trustedCount++;

    const signature = normalizeMemorySignature(memory.content);
    if (signature.length >= 24) {
      const current = duplicateMap.get(signature) ?? { count: 0, personas: new Set<string>() };
      current.count++;
      current.personas.add(memory.persona_key);
      duplicateMap.set(signature, current);
    }
  }

  const duplicateClusters = [...duplicateMap.entries()]
    .filter(([, cluster]) => cluster.count > 1)
    .map(([signature, cluster]) => ({
      signature,
      count: cluster.count,
      personas: [...cluster.personas],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const personasWithMemory = new Set(enabled.map((memory) => memory.persona_key));
  const coveragePct = personas.length > 0 ? personasWithMemory.size / personas.length : 1;
  const confidencePct = 1 - (lowConfidenceCount / total);
  const activityPct = 1 - (unusedCount / total);
  const freshnessPct = 1 - (staleCount / total);
  const uniquePct = 1 - (duplicateClusters.reduce((sum, cluster) => sum + cluster.count, 0) / total);
  const reliabilityPct = Math.max(0, Math.min(100, Math.round(
    coveragePct * 25
    + confidencePct * 25
    + activityPct * 20
    + freshnessPct * 15
    + Math.max(0, uniquePct) * 15,
  )));
  const trustedSourcePct = Math.round((trustedCount / total) * 100);

  const qualityActionQueue: string[] = [];
  if (lowConfidenceCount > 0) qualityActionQueue.push(`Rivedi ${lowConfidenceCount} memorie con fiducia sotto il 70%.`);
  if (staleCount > 0) qualityActionQueue.push(`Verifica ${staleCount} memorie ferme da oltre ${MEMORY_STALE_DAYS} giorni.`);
  if (unusedCount > 0) qualityActionQueue.push(`Fai usare o archivia ${unusedCount} memorie mai richiamate.`);
  if (duplicateClusters.length > 0) qualityActionQueue.push(`Unifica ${duplicateClusters.length} cluster di memorie duplicate.`);
  if (personasWithMemory.size < personas.length) qualityActionQueue.push(`Completa ${personas.length - personasWithMemory.size} personas senza memoria viva.`);
  if (qualityActionQueue.length === 0) qualityActionQueue.push("Qualità alta: puoi scalare nuove memorie e usarle nelle risposte di Silvio.");

  return {
    reliabilityPct,
    staleCount,
    lowConfidenceCount,
    unusedCount,
    demoCount,
    duplicateClusters,
    trustedSourcePct,
    riskyCount: riskyIds.size,
    qualityActionQueue: qualityActionQueue.slice(0, 5),
  };
}

function computeKnowledgeCommunities(
  personas: PersonaLite[],
  memories: MemoryRow[],
  crossPersonaLinks: Map<string, Map<string, number>>,
): KnowledgeCommunity[] {
  const byCategory = new Map<string, {
    personas: PersonaLite[];
    activePersonas: Set<string>;
    memoryCount: number;
    crossLinks: number;
  }>();
  const personaCategory = new Map(personas.map((persona) => [persona.persona_key, persona.category] as const));

  for (const persona of personas) {
    const current = byCategory.get(persona.category) ?? {
      personas: [],
      activePersonas: new Set<string>(),
      memoryCount: 0,
      crossLinks: 0,
    };
    current.personas.push(persona);
    byCategory.set(persona.category, current);
  }

  for (const memory of memories) {
    if (!memory.enabled) continue;
    const category = personaCategory.get(memory.persona_key);
    if (!category) continue;
    const current = byCategory.get(category);
    if (!current) continue;
    current.memoryCount++;
    current.activePersonas.add(memory.persona_key);
  }

  for (const [sourcePersona, targets] of crossPersonaLinks) {
    const sourceCategory = personaCategory.get(sourcePersona);
    if (!sourceCategory) continue;
    const current = byCategory.get(sourceCategory);
    if (!current) continue;
    for (const [targetPersona, count] of targets) {
      if (personaCategory.get(targetPersona) !== sourceCategory) current.crossLinks += count;
    }
  }

  return [...byCategory.entries()]
    .map(([key, community]) => {
      const personaCount = community.personas.length;
      const coverage = personaCount > 0 ? community.activePersonas.size / personaCount : 0;
      const density = Math.min(1, community.memoryCount / Math.max(1, personaCount * 5));
      const bridge = Math.min(1, community.crossLinks / Math.max(1, personaCount * 3));
      const healthPct = Math.round(coverage * 45 + density * 35 + bridge * 20);
      return {
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        color: PERSONA_CATEGORY_COLORS[key] ?? PERSONA_CATEGORY_COLORS.default,
        personaCount,
        activePersonaCount: community.activePersonas.size,
        memoryCount: community.memoryCount,
        crossLinks: community.crossLinks,
        healthPct,
        riskLabel: healthPct >= 75 ? "forte" : healthPct >= 45 ? "da consolidare" : "debole",
      };
    })
    .sort((a, b) => b.healthPct - a.healthPct)
    .slice(0, 6);
}

// ─── Stable SVG graph renderer ────────────────────────────────────────────────

function truncateLabel(value: string | undefined, max = 22) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const DEFAULT_GRAPH_VIEW_BOX = { x: -540, y: -440, width: 1080, height: 880 };
const GRAPH_ASPECT_RATIO = DEFAULT_GRAPH_VIEW_BOX.width / DEFAULT_GRAPH_VIEW_BOX.height;
const GRAPH_MIN_VIEW_WIDTH = 180;
const GRAPH_MAX_VIEW_WIDTH = 2600;
const GRAPH_CONTROL_ZOOM_STEP = 0.82;
const GRAPH_PAN_CLICK_THRESHOLD = 4;
const SILVIO_NODE_ID = "silvio_orchestrator";
const SILVIO_NODE_FILL = "#f97316";
const MAX_RENDERED_EDGES_2D = 1100;
const MAX_RENDERED_EDGES_GLOBE = 760;
const GLOBE_CAMERA_DISTANCE = 760;
const GLOBE_DEPTH_RANGE = 820;
const DEMO_MIN_MEMORIES_PER_PERSONA = 5;
const DEMO_LOADING_GRACE_MS = 1_500;
const MEMORY_STALE_DAYS = 90;
const MEMORY_LOW_CONFIDENCE_THRESHOLD = 0.7;

type GraphViewBox = typeof DEFAULT_GRAPH_VIEW_BOX;
type GraphCamera = { yaw: number; pitch: number };
type ProjectedGraphPoint = { x: number; y: number; z: number; scale: number; opacity: number };

function serializeViewBox(viewBox: GraphViewBox) {
  return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
}

function svgDataUrlToPngDataUrl(dataUrl: string, width = 1600, height = 1304): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas non disponibile"));
        return;
      }
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Impossibile convertire SVG in PNG"));
    image.src = dataUrl;
  });
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label}: timeout dopo ${Math.round(ms / 1000)} secondi`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

interface BrainGraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selections: string[];
  viewDim: "2d" | "3d" | "core";
  onNodeClick: (node: InternalGraphNode) => void;
  onNodeDoubleClick: (node: InternalGraphNode) => void;
  onCanvasClick: () => void;
  onEdgePointerOver: (edge: InternalGraphEdge, event?: { nativeEvent?: MouseEvent }) => void;
  onEdgePointerOut: () => void;
}

const BrainGraphCanvas = forwardRef<BrainGraphCanvasHandle, BrainGraphCanvasProps>(function BrainGraphCanvas(
  { nodes, edges, selections, viewDim, onNodeClick, onNodeDoubleClick, onCanvasClick, onEdgePointerOver, onEdgePointerOut },
  ref,
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panStartRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    viewBox: GraphViewBox;
  } | null>(null);
  const rotateStartRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    camera: GraphCamera;
  } | null>(null);
  const didPanRef = useRef(false);
  const selectedSet = useMemo(() => new Set(selections), [selections]);
  const hasSelection = selectedSet.size > 0;
  const [viewBox, setViewBox] = useState(DEFAULT_GRAPH_VIEW_BOX);
  const [isPanning, setIsPanning] = useState(false);
  const [isRotatingGlobe, setIsRotatingGlobe] = useState(false);
  const [camera, setCamera] = useState<GraphCamera>({ yaw: -0.45, pitch: 0.26 });
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node] as const)), [nodes]);
  const renderedNodes = useMemo(
    () => [...nodes].sort((a, b) => {
      if (a.id === SILVIO_NODE_ID) return 1;
      if (b.id === SILVIO_NODE_ID) return -1;
      return 0;
    }),
    [nodes],
  );
  const isGlobeView = viewDim === "3d" || viewDim === "core";

  const positions = useMemo(() => {
    const map = new Map<string, ProjectedGraphPoint>();
    const fallbackRadius = 330;
    const total = Math.max(1, nodes.length);
    const yawSin = Math.sin(camera.yaw);
    const yawCos = Math.cos(camera.yaw);
    const pitchSin = Math.sin(camera.pitch);
    const pitchCos = Math.cos(camera.pitch);

    nodes.forEach((node, index) => {
      const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
      const fallback = {
        x: Math.cos(angle) * fallbackRadius,
        y: Math.sin(angle) * fallbackRadius,
        z: 0,
      };
      const baseX = typeof node.fx === "number" ? node.fx : fallback.x;
      const baseY = typeof node.fy === "number" ? node.fy : fallback.y;
      const baseZ = typeof node.fz === "number" ? node.fz : 0;

      if (!isGlobeView) {
        map.set(node.id, { x: baseX, y: baseY, z: baseZ, scale: 1, opacity: 1 });
        return;
      }

      const yawX = baseX * yawCos + baseZ * yawSin;
      const yawZ = -baseX * yawSin + baseZ * yawCos;
      const pitchY = baseY * pitchCos - yawZ * pitchSin;
      const pitchZ = baseY * pitchSin + yawZ * pitchCos;
      const perspective = GLOBE_CAMERA_DISTANCE / Math.max(360, GLOBE_CAMERA_DISTANCE - pitchZ * 0.52);
      const depth = Math.max(0, Math.min(1, (pitchZ + GLOBE_DEPTH_RANGE / 2) / GLOBE_DEPTH_RANGE));

      map.set(node.id, {
        x: yawX * perspective,
        y: pitchY * perspective,
        z: pitchZ,
        scale: 0.58 + depth * 0.56,
        opacity: 0.28 + depth * 0.72,
      });
    });

    return map;
  }, [camera.pitch, camera.yaw, isGlobeView, nodes]);

  const visibleEdges = useMemo(() => {
    const limit = isGlobeView ? MAX_RENDERED_EDGES_GLOBE : MAX_RENDERED_EDGES_2D;
    if (edges.length <= limit || hasSelection) return edges;

    return [...edges]
      .sort((a, b) => {
        const score = (edge: GraphEdge) => {
          if (edge.id.startsWith("e_silvio_")) return 4_000 + (edge.size ?? 1) * 10;
          if (edge.id.startsWith("e_xp_")) return 3_000 + (edge.size ?? 1) * 10;
          if (edge.id.startsWith("e_p_")) return 2_000 + (edge.size ?? 1) * 10;
          return 1_000 + (edge.size ?? 1) * 10;
        };
        return score(b) - score(a);
      })
      .slice(0, limit);
  }, [edges, hasSelection, isGlobeView]);

  const depthSortedNodes = useMemo(
    () => [...renderedNodes].sort((a, b) => {
      if (a.id === SILVIO_NODE_ID) return 1;
      if (b.id === SILVIO_NODE_ID) return -1;
      if (!isGlobeView) return 0;
      return (positions.get(a.id)?.z ?? 0) - (positions.get(b.id)?.z ?? 0);
    }),
    [isGlobeView, positions, renderedNodes],
  );

  useEffect(() => {
    if (viewDim !== "core") return undefined;

    let frameId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(48, now - last);
      last = now;
      if (!rotateStartRef.current) {
        setCamera((current) => ({ ...current, yaw: current.yaw + elapsed * 0.00022 }));
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [viewDim]);

  const updateZoom = useCallback((scale: number, anchor?: { x: number; y: number }) => {
    setViewBox((current) => {
      const nextWidth = Math.min(
        GRAPH_MAX_VIEW_WIDTH,
        Math.max(GRAPH_MIN_VIEW_WIDTH, current.width * scale),
      );
      if (Math.abs(nextWidth - current.width) < 0.1) return current;

      const nextHeight = nextWidth / GRAPH_ASPECT_RATIO;
      const zoomAnchor = anchor ?? {
        x: current.x + current.width / 2,
        y: current.y + current.height / 2,
      };
      const widthRatio = nextWidth / current.width;
      const heightRatio = nextHeight / current.height;

      return {
        x: zoomAnchor.x - (zoomAnchor.x - current.x) * widthRatio,
        y: zoomAnchor.y - (zoomAnchor.y - current.y) * heightRatio,
        width: nextWidth,
        height: nextHeight,
      };
    });
  }, []);

  const clientPointToGraphPoint = useCallback((clientX: number, clientY: number, sourceViewBox: GraphViewBox = viewBox) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: sourceViewBox.x + ((clientX - rect.left) / rect.width) * sourceViewBox.width,
      y: sourceViewBox.y + ((clientY - rect.top) / rect.height) * sourceViewBox.height,
    };
  }, [viewBox]);

  const handleWheelZoom = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const anchor = clientPointToGraphPoint(event.clientX, event.clientY);
    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    if (delta === 0) return;

    const normalized = Math.min(0.42, Math.max(0.04, Math.abs(delta) * 0.0016));
    updateZoom(Math.exp(delta > 0 ? normalized : -normalized), anchor ?? undefined);
  }, [clientPointToGraphPoint, updateZoom]);

  const handlePanStart = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if ((event.target as Element | null)?.closest?.("[data-brain-node='true']")) return;

    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);

    if (isGlobeView && !event.shiftKey) {
      rotateStartRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        camera,
      };
      didPanRef.current = false;
      setIsRotatingGlobe(true);
      return;
    }

    panStartRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      viewBox,
    };
    didPanRef.current = false;
    setIsPanning(true);
  }, [camera, isGlobeView, viewBox]);

  const handlePanMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const rotateStart = rotateStartRef.current;
    if (rotateStart?.pointerId === event.pointerId) {
      const dx = event.clientX - rotateStart.clientX;
      const dy = event.clientY - rotateStart.clientY;
      if (Math.hypot(dx, dy) >= GRAPH_PAN_CLICK_THRESHOLD) didPanRef.current = true;
      setCamera({
        yaw: rotateStart.camera.yaw + dx * 0.0065,
        pitch: Math.max(-1.12, Math.min(1.12, rotateStart.camera.pitch - dy * 0.0052)),
      });
      return;
    }

    const start = panStartRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!start || start.pointerId !== event.pointerId || !rect || rect.width <= 0 || rect.height <= 0) return;

    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;
    if (Math.hypot(dx, dy) >= GRAPH_PAN_CLICK_THRESHOLD) didPanRef.current = true;

    setViewBox({
      x: start.viewBox.x - dx * (start.viewBox.width / rect.width),
      y: start.viewBox.y - dy * (start.viewBox.height / rect.height),
      width: start.viewBox.width,
      height: start.viewBox.height,
    });
  }, []);

  const handlePanEnd = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const rotateStart = rotateStartRef.current;
    if (rotateStart?.pointerId === event.pointerId) {
      if (svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
      rotateStartRef.current = null;
      setIsRotatingGlobe(false);
      return;
    }

    const start = panStartRef.current;
    if (start?.pointerId === event.pointerId) {
      if (svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
      panStartRef.current = null;
      setIsPanning(false);
    }
  }, []);

  const handleSvgClick = useCallback((event: ReactMouseEvent<SVGSVGElement>) => {
    if (didPanRef.current) {
      didPanRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onCanvasClick();
  }, [onCanvasClick]);

  const fitToNodes = useCallback((ids?: string[]) => {
    const targetIds = ids && ids.length > 0 ? ids : nodes.map((node) => node.id);
    const targets = targetIds
      .map((id) => {
        const pos = positions.get(id);
        const node = nodeById.get(id);
        if (!pos || !node) return null;
        const isPersona = node.data?.type === "persona";
        const radius = isPersona
          ? Math.max(16, (node.size ?? 10) * 1.45)
          : Math.max(5, (node.size ?? 3) * 2.1);
        return { ...pos, radius };
      })
      .filter((target): target is { x: number; y: number; z: number; radius: number } => target !== null);

    if (targets.length === 0) {
      setViewBox(DEFAULT_GRAPH_VIEW_BOX);
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const target of targets) {
      minX = Math.min(minX, target.x - target.radius);
      maxX = Math.max(maxX, target.x + target.radius);
      minY = Math.min(minY, target.y - target.radius);
      maxY = Math.max(maxY, target.y + target.radius);
    }

    const padding = targets.length === 1 ? 120 : 150;
    let width = Math.max(220, maxX - minX + padding * 2);
    let height = Math.max(180, maxY - minY + padding * 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    if (width / height > GRAPH_ASPECT_RATIO) {
      height = width / GRAPH_ASPECT_RATIO;
    } else {
      width = height * GRAPH_ASPECT_RATIO;
    }

    setViewBox({
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    });
  }, [nodeById, nodes, positions]);

  useEffect(() => {
    setViewBox(DEFAULT_GRAPH_VIEW_BOX);
  }, [viewDim]);

  useImperativeHandle(ref, () => ({
    centerGraph: (ids?: string[]) => fitToNodes(ids),
    fitNodesInView: (ids?: string[]) => fitToNodes(ids),
    zoomIn: () => updateZoom(GRAPH_CONTROL_ZOOM_STEP),
    zoomOut: () => updateZoom(1 / GRAPH_CONTROL_ZOOM_STEP),
    resetView: () => setViewBox(DEFAULT_GRAPH_VIEW_BOX),
    exportCanvas: () => {
      if (!svgRef.current) return null;
      const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const serialized = new XMLSerializer().serializeToString(clone);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
    },
  }), [fitToNodes, updateZoom]);

  return (
    <svg
      ref={svgRef}
      className="h-full w-full"
      viewBox={serializeViewBox(viewBox)}
      role="img"
      aria-label="Mappa visiva del Cervello AI"
      onClick={handleSvgClick}
      onWheel={handleWheelZoom}
      onPointerDown={handlePanStart}
      onPointerMove={handlePanMove}
      onPointerUp={handlePanEnd}
      onPointerCancel={handlePanEnd}
      style={{
        cursor: isPanning || isRotatingGlobe ? "grabbing" : isGlobeView ? "grab" : "grab",
        touchAction: "none",
      }}
    >
      <defs>
        <radialGradient id="brain-node-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id="silvio-core-gradient" cx="40%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#fff7ed" />
          <stop offset="38%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
        <filter id="brain-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <style>{`
          @keyframes brain-core-orbit {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .brain-core-spin {
            transform-box: fill-box;
            transform-origin: center;
            animation: brain-core-orbit 58s linear infinite;
          }
          @keyframes silvio-pulse {
            0%, 100% { opacity: .28; transform: scale(1); }
            50% { opacity: .56; transform: scale(1.08); }
          }
          .silvio-orbit-ring {
            transform-box: fill-box;
            transform-origin: center;
            animation: silvio-pulse 3.8s ease-in-out infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .brain-core-spin, .silvio-orbit-ring { animation: none; }
          }
        `}</style>
      </defs>
      <g>
        {visibleEdges.map((edge) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);
          if (!source || !target) return null;
          const selected = selectedSet.has(edge.source) || selectedSet.has(edge.target) || selectedSet.has(edge.id);
          const isCross = edge.id.startsWith("e_cross_") || edge.id.startsWith("e_xp_");
          const isSilvioEdge = edge.id.startsWith("e_silvio_");
          const depthOpacity = isGlobeView ? Math.min(source.opacity, target.opacity) : 1;
          const opacity = (hasSelection && !selected
            ? 0.12
            : isSilvioEdge
              ? (edge.size ?? 1) < 1 ? 0.24 : 0.54
              : isCross ? 0.66 : 0.34) * depthOpacity;
          const width = Math.max(0.8, Math.min(5, edge.size ?? 1)) * (isGlobeView ? Math.max(0.62, (source.scale + target.scale) / 2) : 1);
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          const curve = isSilvioEdge ? 0 : isCross ? 24 : 8;
          const d = `M ${source.x} ${source.y} Q ${midX} ${midY - curve} ${target.x} ${target.y}`;
          return (
            <path
              key={edge.id}
              d={d}
              fill="none"
              stroke={selected ? "#fbbf24" : edge.fill ?? (isCross ? "#fb923c" : "#64748b")}
              strokeWidth={selected ? width + 1.2 : width}
              strokeOpacity={opacity}
              strokeLinecap="round"
              strokeDasharray={isSilvioEdge && (edge.size ?? 1) < 1 ? "4 7" : undefined}
              vectorEffect="non-scaling-stroke"
              onMouseEnter={(event) => onEdgePointerOver(edge, { nativeEvent: event.nativeEvent })}
              onMouseLeave={onEdgePointerOut}
            />
          );
        })}

        {depthSortedNodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const type = node.data?.type;
          const selected = selectedSet.has(node.id);
          const faded = hasSelection && !selected;
          const isPersona = type === "persona";
          const isSilvio = type === "silvio";
          const radius = isPersona
            ? Math.max(16, (node.size ?? 10) * 1.45)
            : isSilvio
              ? Math.max(34, (node.size ?? 18) * 1.18)
              : Math.max(5, (node.size ?? 3) * 2.1);
          const fill = node.fill ?? "#f97316";
          const emoji = isPersona ? String(node.data?.emoji ?? PERSONA_CATEGORY_EMOJI.default) : "";
          const label = isPersona
            ? truncateLabel(node.data?.persona?.display_name ?? node.label, 24)
            : isSilvio
              ? "Silvio"
            : truncateLabel(node.data?.previewLabel ?? node.label, 22);

          return (
            <g
              key={node.id}
              data-brain-node="true"
              transform={`translate(${pos.x} ${pos.y}) scale(${pos.scale})`}
              opacity={(faded ? 0.28 : 1) * (isSilvio ? 1 : isGlobeView ? pos.opacity : 1)}
              className="cursor-pointer transition-opacity"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onNodeClick(node);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onNodeDoubleClick(node);
              }}
            >
              {isSilvio && (
                <>
                  <circle className="silvio-orbit-ring" r={radius + 34} fill="none" stroke="#fb923c" strokeWidth={1.2} strokeOpacity={0.48} strokeDasharray="5 8" />
                  <circle r={radius + 23} fill="#fb923c" opacity={0.13} filter="url(#brain-soft-glow)" />
                  <circle r={radius + 12} fill="none" stroke="#fed7aa" strokeWidth={1.4} strokeOpacity={0.5} />
                </>
              )}
              <circle
                r={radius + 8}
                fill={fill}
                opacity={selected ? 0.22 : isSilvio ? 0.24 : isPersona ? 0.14 : 0.08}
                filter={selected || isPersona || isSilvio ? "url(#brain-soft-glow)" : undefined}
              />
              <circle
                r={radius}
                fill={isSilvio ? "url(#silvio-core-gradient)" : fill}
                stroke={selected ? "#fde68a" : isSilvio ? "#fed7aa" : isPersona ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.38)"}
                strokeWidth={selected ? 3 : isSilvio ? 2.4 : isPersona ? 1.5 : 1}
              />
              <circle r={Math.max(2, radius * 0.42)} fill="url(#brain-node-glow)" opacity={0.72} />
              {(isPersona || isSilvio) && (
                <text
                  y="5"
                  textAnchor="middle"
                  fontSize={isSilvio ? 22 : Math.max(12, radius * 0.58)}
                  className="select-none"
                >
                  {isSilvio ? "🧠" : emoji}
                </text>
              )}
              {isSilvio && (
                <text
                  y={radius + 31}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  fill="#fed7aa"
                  stroke="#020617"
                  strokeWidth={3}
                  paintOrder="stroke"
                  className="select-none"
                >
                  guida tutte le personas
                </text>
              )}
              {(isPersona || isSilvio || selected) && label && (
                <text
                  y={radius + (isSilvio ? 18 : 16)}
                  textAnchor="middle"
                  fontSize={isSilvio ? 15 : isPersona ? 12 : 9}
                  fontWeight={isPersona || isSilvio ? 800 : 500}
                  fill={selected ? "#fde68a" : "#f8fafc"}
                  stroke="#020617"
                  strokeWidth={4}
                  paintOrder="stroke"
                  className="select-none"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIBrainGraph() {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const graphRef = useRef<BrainGraphCanvasHandle | null>(null);
  // Vista: 2D piatto | 3D libero | Nucleo rotante (3D + camera orbit auto)
  const [viewDim, setViewDim] = useState<"2d" | "3d" | "core">("2d");
  const [selectedNode, setSelectedNode] = useState<InternalGraphNode | null>(null);
  const [filterPersona, setFilterPersona] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [colorMode, setColorMode] = useState<ColorMode>("cluster");
  const [viewMode, setViewMode] = useState<"galaxy" | "detail">("galaxy"); // galaxy=solo persone, detail=tutte le memorie
  const [expandedPersonas, setExpandedPersonas] = useState<Set<string>>(new Set());
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<{ id: string; x: number; y: number } | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [recentEventsCount, setRecentEventsCount] = useState(0);
  const [livePulse, setLivePulse] = useState(false); // pulse animation on the LIVE indicator
  const [timeFilter, setTimeFilter] = useState<"7d" | "30d" | "90d" | "all">("all");
  const [personaSheetKey, setPersonaSheetKey] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [demoLoadingGraceElapsed, setDemoLoadingGraceElapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const livePulseTimeoutRef = useRef<number | null>(null);

  const isDemoCompany = effectiveCompany?.id === DEMO_COMPANY_ID;

  // ── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: remotePersonas = [],
    isLoading: isPersonasLoading,
    isError: isPersonasError,
    error: personasError,
    refetch: refetchPersonas,
  } = useQuery({
    queryKey: ["brain-graph-personas"],
    queryFn: async (): Promise<PersonaLite[]> => {
      const { data, error } = await withTimeout(
        brainSupabase
          .from("ai_personas_public")
          .select("persona_key, display_name, category, color, icon")
          .eq("enabled", true)
          .order("category"),
        8_000,
        "Caricamento personas AI",
      );
      if (error) throw error;
      return (data ?? []) as PersonaLite[];
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const {
    data: remoteMemories = [],
    isLoading: isMemoriesLoading,
    isError: isMemoriesError,
    error: memoriesError,
    refetch: refetchMemories,
  } = useQuery({
    queryKey: ["brain-graph-memories", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    queryFn: async (): Promise<MemoryRow[]> => {
      const { data, error } = await withTimeout(
        brainSupabase
          .from("ai_persona_memory")
          .select("id, persona_key, memory_type, content, confidence, hits_count, enabled, source, created_at")
          .eq("company_id", effectiveCompany!.id)
          .eq("enabled", true)
          .order("hits_count", { ascending: false })
          .limit(300),
        8_000,
        "Caricamento memorie AI",
      );
      if (error) throw error;
      return (data ?? []) as MemoryRow[];
    },
    staleTime: 30_000,
    retry: 1,
  });

  const remoteGraphPersonas = useMemo<PersonaLite[]>(
    () => remotePersonas.filter((persona) => !isOrchestratorPersonaKey(persona.persona_key)),
    [remotePersonas],
  );

  const demoFallbackPersonas = useMemo<PersonaLite[]>(
    () => DEMO_AI_PERSONAS.filter((persona) => !isOrchestratorPersonaKey(persona.persona_key)),
    [],
  );

  const demoFallbackMemories = useMemo<MemoryRow[]>(() => {
    const availableKeys = new Set(demoFallbackPersonas.map((persona) => persona.persona_key));
    return DEMO_MEMORIES.flatMap((memory, index) => {
      const targetKey = resolveDemoPersonaKey(memory.persona_key, availableKeys);
      if (!targetKey) return [];
      return [{
        id: `demo-${index}`,
        persona_key: targetKey,
        memory_type: memory.memory_type,
        content: memory.content,
        confidence: memory.confidence,
        hits_count: memory.hits_count,
        enabled: true,
        source: "demo_fallback",
        created_at: new Date(Date.now() - index * 3_600_000).toISOString(),
      }];
    });
  }, [demoFallbackPersonas]);

  useEffect(() => {
    if (!isDemoCompany) {
      setDemoLoadingGraceElapsed(false);
      return;
    }

    setDemoLoadingGraceElapsed(false);
    const timeoutId = window.setTimeout(() => setDemoLoadingGraceElapsed(true), DEMO_LOADING_GRACE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [effectiveCompany?.id, isDemoCompany]);

  const demoFallbackReady = isDemoCompany
    && (demoLoadingGraceElapsed || loadingTimedOut || isPersonasError || isMemoriesError)
    && (remoteGraphPersonas.length === 0 || remoteMemories.length === 0);

  const useDemoFallback = demoFallbackReady;

  const personas = useMemo(
    () => (useDemoFallback && remoteGraphPersonas.length === 0 ? demoFallbackPersonas : remoteGraphPersonas),
    [demoFallbackPersonas, remoteGraphPersonas, useDemoFallback],
  );

  const knownPersonaKeys = useMemo(
    () => new Set(personas.map((persona) => persona.persona_key)),
    [personas],
  );

  const baseMemories = useMemo(
    () => (useDemoFallback && remoteMemories.length === 0 ? demoFallbackMemories : remoteMemories),
    [demoFallbackMemories, remoteMemories, useDemoFallback],
  );

  const normalizedBaseMemories = useMemo<MemoryRow[]>(
    () => baseMemories.flatMap((memory) => {
      if (knownPersonaKeys.has(memory.persona_key)) return [memory];
      const targetKey = resolveDemoPersonaKey(memory.persona_key, knownPersonaKeys);
      if (!targetKey) return [];
      return [{ ...memory, persona_key: targetKey }];
    }),
    [baseMemories, knownPersonaKeys],
  );

  const demoCoverageMemories = useMemo<MemoryRow[]>(() => {
    if (!isDemoCompany || personas.length === 0) return [];

    const counts = new Map<string, number>();
    const existingByPersona = new Map<string, Set<string>>();
    for (const memory of normalizedBaseMemories) {
      if (!memory.enabled || !knownPersonaKeys.has(memory.persona_key)) continue;
      counts.set(memory.persona_key, (counts.get(memory.persona_key) ?? 0) + 1);
      if (!existingByPersona.has(memory.persona_key)) existingByPersona.set(memory.persona_key, new Set());
      existingByPersona.get(memory.persona_key)!.add(memory.content.trim().toLowerCase());
    }

    const demoRowsByPersona = new Map<string, typeof DEMO_MEMORIES>();
    for (const memory of DEMO_MEMORIES) {
      const targetKey = resolveDemoPersonaKey(memory.persona_key, knownPersonaKeys);
      if (!targetKey) continue;
      const list = demoRowsByPersona.get(targetKey);
      if (list) list.push(memory);
      else demoRowsByPersona.set(targetKey, [memory]);
    }

    const additions: MemoryRow[] = [];
    for (const persona of personas) {
      const currentCount = counts.get(persona.persona_key) ?? 0;
      if (currentCount >= DEMO_MIN_MEMORIES_PER_PERSONA) continue;

      const usedContent = existingByPersona.get(persona.persona_key) ?? new Set<string>();
      const candidates = demoRowsByPersona.get(persona.persona_key) ?? [];
      let addedForPersona = 0;
      const needed = DEMO_MIN_MEMORIES_PER_PERSONA - currentCount;

      for (const candidate of candidates) {
        const normalizedContent = candidate.content.trim().toLowerCase();
        if (usedContent.has(normalizedContent)) continue;
        usedContent.add(normalizedContent);
        const overlayIndex = additions.length;
        additions.push({
          id: `demo-coverage-${persona.persona_key}-${overlayIndex}`,
          persona_key: persona.persona_key,
          memory_type: candidate.memory_type,
          content: candidate.content,
          confidence: candidate.confidence,
          hits_count: Math.max(candidate.hits_count, 3),
          enabled: true,
          source: "demo_coverage",
          created_at: new Date(Date.now() - overlayIndex * 1_800_000).toISOString(),
        });
        addedForPersona++;
        if (addedForPersona >= needed) break;
      }
    }

    return additions;
  }, [isDemoCompany, knownPersonaKeys, normalizedBaseMemories, personas]);

  const memories = useMemo(
    () => [...normalizedBaseMemories, ...demoCoverageMemories],
    [demoCoverageMemories, normalizedBaseMemories],
  );

  // ── #4: Real-time subscription ────────────────────────────────────────────

  useEffect(() => {
    if (!effectiveCompany?.id) return;
    const ch = supabase
      .channel(`brain-graph-rt-${effectiveCompany.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_persona_memory",
          filter: `company_id=eq.${effectiveCompany.id}`,
        },
        () => {
          // Pulse the LIVE indicator briefly + bump event counter
          setRecentEventsCount((n) => n + 1);
          setLivePulse(true);
          if (livePulseTimeoutRef.current !== null) window.clearTimeout(livePulseTimeoutRef.current);
          livePulseTimeoutRef.current = window.setTimeout(() => {
            setLivePulse(false);
            livePulseTimeoutRef.current = null;
          }, 1500);
          void qc.invalidateQueries({ queryKey: ["brain-graph-memories"] });
        },
      )
      .subscribe();
    return () => {
      if (livePulseTimeoutRef.current !== null) {
        window.clearTimeout(livePulseTimeoutRef.current);
        livePulseTimeoutRef.current = null;
      }
      void supabase.removeChannel(ch);
    };
  }, [effectiveCompany?.id, qc]);

  // ── Build graph ───────────────────────────────────────────────────────────

  // Memorie filtrate per finestra temporale (timeFilter)
  const timeFilteredMemories = useMemo(() => {
    if (timeFilter === "all") return memories;
    const dayMs = 24 * 60 * 60 * 1000;
    const days = timeFilter === "7d" ? 7 : timeFilter === "30d" ? 30 : 90;
    const threshold = Date.now() - days * dayMs;
    return memories.filter((m) => new Date(m.created_at).getTime() >= threshold);
  }, [memories, timeFilter]);

  const graphData = useMemo(
    () => buildGraphData(personas, timeFilteredMemories, filterPersona, filterType, colorMode, viewMode, expandedPersonas, viewDim),
    [personas, timeFilteredMemories, filterPersona, filterType, colorMode, viewMode, expandedPersonas, viewDim],
  );

  const { nodes, edges, edgeKeywords, connectionsMap, crossPersonaLinks } = graphData;

  const isInitialGraphLoading = !demoFallbackReady && (isPersonasLoading || isMemoriesLoading);
  const isGraphLoading = isInitialGraphLoading;

  useEffect(() => {
    if (!isGraphLoading) {
      setLoadingTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setLoadingTimedOut(true), 10_000);
    return () => window.clearTimeout(timeoutId);
  }, [isGraphLoading]);

  // ── #6: Insights ──────────────────────────────────────────────────────────

  const insights = useMemo(
    () => computeInsights(nodes, connectionsMap, crossPersonaLinks, memories, personas),
    [nodes, connectionsMap, crossPersonaLinks, memories, personas],
  );
  const memoryQuality = useMemo(
    () => computeMemoryQualityReport(memories, personas),
    [memories, personas],
  );
  const knowledgeCommunities = useMemo(
    () => computeKnowledgeCommunities(personas, memories, crossPersonaLinks),
    [personas, memories, crossPersonaLinks],
  );

  // Insight narrativo automatico — la frase "vendibile" che racconta cosa sa l'AI
  // Calcoliamo direttamente da memories+personas (non dipende da viewMode).
  const heroInsight = useMemo(() => {
    if (memories.length === 0) {
      return {
        title: "Cervello in costruzione",
        text: "Parla con le AI Personas o aggiungi memorie manuali — il sistema imparerà nel tempo.",
      };
    }

    // Top cross-persona link più forte
    let topPair: { pA: string; pB: string; count: number } | null = null;
    for (const [pA, targets] of crossPersonaLinks) {
      for (const [pB, count] of targets) {
        if (!topPair || count > topPair.count) topPair = { pA, pB, count };
      }
    }
    if (topPair && topPair.count >= 2) {
      const nameA = personas.find((p) => p.persona_key === topPair!.pA)?.display_name ?? topPair.pA;
      const nameB = personas.find((p) => p.persona_key === topPair!.pB)?.display_name ?? topPair.pB;
      return {
        title: "Asse di conoscenza più forte",
        text: `${nameA} ↔ ${nameB} condividono ${topPair.count} memorie. Le due personas pensano "alla stessa cosa".`,
      };
    }

    // Most-used memory
    const sorted = [...memories].filter((m) => m.enabled).sort((a, b) => (b.hits_count ?? 0) - (a.hits_count ?? 0));
    if (sorted.length > 0 && (sorted[0].hits_count ?? 0) > 0) {
      const top = sorted[0];
      const personaName = personas.find((p) => p.persona_key === top.persona_key)?.display_name ?? top.persona_key;
      const preview = top.content.length > 70 ? top.content.slice(0, 67) + "…" : top.content;
      return {
        title: "Informazione più usata",
        text: `${personaName} ricorda: "${preview}" (${top.hits_count} richiami).`,
      };
    }

    return {
      title: "Cervello attivo",
      text: `${memories.filter((m) => m.enabled).length} memorie attive distribuite su ${new Set(memories.map((m) => m.persona_key)).size} personas.`,
    };
  }, [memories, personas, crossPersonaLinks]);

  const totalMemories = memories.filter((m) => m.enabled).length;
  const personasInMemory = useMemo(
    () => new Set(
      memories
        .filter((m) => m.enabled && knownPersonaKeys.has(m.persona_key))
        .map((m) => m.persona_key),
    ).size,
    [knownPersonaKeys, memories],
  );
  const personaActivationPct = personas.length > 0
    ? Math.round((personasInMemory / personas.length) * 100)
    : 0;
  const totalCrossPersonaLinks = useMemo(() => {
    let n = 0;
    for (const [, t] of crossPersonaLinks) for (const [, c] of t) n += c;
    return n;
  }, [crossPersonaLinks]);

  // Confronto vs 7 giorni fa: quante memorie create / hits accumulati
  const periodComparison = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * dayMs;
    const fourteenDaysAgo = now - 14 * dayMs;

    let current = 0;
    let previous = 0;
    for (const m of memories) {
      if (!m.enabled) continue;
      const t = new Date(m.created_at).getTime();
      if (t >= sevenDaysAgo) current++;
      else if (t >= fourteenDaysAgo) previous++;
    }
    const delta = current - previous;
    return { current, previous, delta };
  }, [memories]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const personaCount = nodes.filter((n) => n.data?.type === "persona").length;
    const memoryCount = nodes.filter((n) => n.data?.type === "memory").length;
    const crossEdges = edges.filter((e) => e.id.startsWith("e_cross_")).length;
    const xpEdges = edges.filter((e) => e.id.startsWith("e_xp_")).length;
    return { personaCount, memoryCount, crossEdges, xpEdges, totalEdges: edges.length };
  }, [nodes, edges]);

  const graphIntegrity = useMemo(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const missingEdges = edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));
    const disconnectedNodes = nodes.filter((node) => (
      node.id !== SILVIO_NODE_ID
      && (connectionsMap.get(node.id)?.size ?? 0) === 0
    ));
    const memoriesWithoutPersonaEdge = nodes.filter((node) => {
      if (node.data?.type !== "memory") return false;
      const personaKey = node.data.memory?.persona_key;
      return !edges.some((edge) => edge.source === `p_${personaKey}` && edge.target === node.id);
    });
    const personasWithoutMemories = nodes.filter((node) => (
      node.data?.type === "persona"
      && (node.data.memoryCount ?? 0) === 0
    ));

    return {
      ok: missingEdges.length === 0
        && disconnectedNodes.length === 0
        && memoriesWithoutPersonaEdge.length === 0
        && personasWithoutMemories.length === 0,
      missingEdges: missingEdges.length,
      disconnectedNodes: disconnectedNodes.length,
      memoriesWithoutPersonaEdge: memoriesWithoutPersonaEdge.length,
      personasWithoutMemories: personasWithoutMemories.length,
    };
  }, [connectionsMap, edges, nodes]);

  // ── #1: Search → selections / actives ─────────────────────────────────────

  const searchSelections = useMemo(() => {
    if (!searchQuery.trim()) return null; // null = no search active
    const q = searchQuery.toLowerCase();
    const matching = nodes
      .filter((n) => {
        const label = (n.label ?? "").toLowerCase();
        const content = n.data?.memory?.content?.toLowerCase() ?? "";
        const personaName = n.data?.persona?.display_name?.toLowerCase() ?? "";
        return label.includes(q) || content.includes(q) || personaName.includes(q);
      })
      .map((n) => n.id);
    return matching;
  }, [searchQuery, nodes]);

  // ── Interactions ──────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((node: InternalGraphNode) => {
    // In galaxy mode: click su persona = toggle expand/collapse
    if (viewMode === "galaxy" && node.data?.type === "persona") {
      const pKey = node.data.persona.persona_key;
      setExpandedPersonas((prev) => {
        const next = new Set(prev);
        if (next.has(pKey)) next.delete(pKey);
        else next.add(pKey);
        return next;
      });
      setSelectedNode(node);
      return;
    }
    setSelectedNode((prev) => prev?.id === node.id ? null : node);
  }, [viewMode]);

  // #5: Double-click persona → zoom cinematico
  const handleNodeDoubleClick = useCallback((node: InternalGraphNode) => {
    if (node.data?.type === "persona") {
      // Find all memory nodes belonging to this persona
      const relatedIds = [node.id];
      for (const e of edges) {
        if (e.source === node.id) relatedIds.push(e.target);
        if (e.target === node.id) relatedIds.push(e.source);
      }
      graphRef.current?.centerGraph(relatedIds);
      setSelectedNode(node);
    } else if (node.data?.type === "silvio") {
      graphRef.current?.centerGraph();
      setSelectedNode(node);
    } else if (node.data?.type === "memory") {
      // Zoom to this memory + all connected
      const relatedIds = [node.id];
      for (const e of edges) {
        if (e.source === node.id) relatedIds.push(e.target);
        if (e.target === node.id) relatedIds.push(e.source);
      }
      graphRef.current?.centerGraph(relatedIds);
    }
  }, [edges]);

  const handleCanvasClick = useCallback(() => {
    setSelectedNode(null);
    setHoveredEdge(null);
  }, []);

  // #7: Edge hover → tooltip
  // Track posizione mouse globale per posizionare tooltip edges
  // (l'event di reagraph non garantisce clientX/clientY validi → fallback al pointer)
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  const handleEdgePointerOver = useCallback((edge: InternalGraphEdge, event?: { nativeEvent?: MouseEvent }) => {
    if (!edge.id.startsWith("e_cross_")) return;
    // Preferisci clientX/Y dell'event, ma se sono 0/undefined usa il pointer
    // tracker globale (evita tooltip in alto a sinistra del viewport)
    const evX = event?.nativeEvent?.clientX;
    const evY = event?.nativeEvent?.clientY;
    const x = (evX && evX > 0) ? evX : mousePosRef.current.x;
    const y = (evY && evY > 0) ? evY : mousePosRef.current.y;
    // Skip se ancora 0 (mouse mai mosso) — non vogliamo tooltip strani
    if (x <= 0 && y <= 0) return;
    setHoveredEdge({ id: edge.id, x, y });
  }, []);

  const handleEdgePointerOut = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const resetView = useCallback(() => {
    graphRef.current?.centerGraph();
    setSelectedNode(null);
    setFilterPersona(null);
    setFilterType(null);
    setSearchQuery("");
    setHoveredEdge(null);
  }, []);

  const zoomInGraph = useCallback(() => {
    graphRef.current?.zoomIn();
  }, []);

  const zoomOutGraph = useCallback(() => {
    graphRef.current?.zoomOut();
  }, []);

  const fitGraphToView = useCallback(() => {
    graphRef.current?.centerGraph();
  }, []);

  // #9: Export screenshot
  const handleExport = useCallback(async () => {
    try {
      const svgDataUrl = graphRef.current?.exportCanvas();
      if (!svgDataUrl) return;
      const dataUrl = await svgDataUrlToPngDataUrl(svgDataUrl);
      const link = document.createElement("a");
      link.download = `cervello-ai-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Screenshot esportato");
    } catch {
      toast.error("Errore esportazione");
    }
  }, []);

  // Export PDF Report executive (1 pagina con screenshot + numeri + insight + top memorie)
  const handlePdfReport = useCallback(async () => {
    try {
      // Lazy load jsPDF (riduce bundle iniziale)
      const { jsPDF } = await import("jspdf");
      const svgDataUrl = graphRef.current?.exportCanvas();
      const dataUrl = svgDataUrl ? await svgDataUrlToPngDataUrl(svgDataUrl) : null;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const today = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
      const companyName = effectiveCompany?.name ?? "Azienda";

      // ── Header ──
      pdf.setFillColor(249, 115, 22);
      pdf.rect(0, 0, 210, 14, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Cervello AI — Report Esecutivo", 12, 9.5);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(today, 198, 9.5, { align: "right" });

      // ── Sottotitolo ──
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.text(companyName, 12, 24);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(100, 116, 139);
      pdf.text("La conoscenza condivisa delle AI Personas aziendali", 12, 29);

      // ── 4 numeri hero ──
      const heroY = 38;
      const cells = [
        { label: "MEMORIE", value: String(totalMemories), color: [30, 41, 59] },
        { label: "PONTI CROSS-TEAM", value: String(totalCrossPersonaLinks), color: [249, 115, 22] },
        { label: "SALUTE", value: `${insights.healthPct}%`, color: insights.healthPct >= 70 ? [16, 185, 129] : insights.healthPct >= 40 ? [245, 158, 11] : [244, 63, 94] },
        { label: "PERSONAS", value: String(stats.personaCount), color: [124, 58, 237] },
      ];
      cells.forEach((c, i) => {
        const x = 12 + i * 48;
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(x, heroY, 44, 22, 2, 2, "F");
        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(c.color[0], c.color[1], c.color[2]);
        pdf.text(c.value, x + 22, heroY + 11, { align: "center" });
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 116, 139);
        pdf.text(c.label, x + 22, heroY + 17, { align: "center" });
      });

      // ── Screenshot grafo ──
      if (dataUrl) {
        try {
          pdf.addImage(dataUrl, "PNG", 12, 66, 186, 100);
        } catch { /* fallback noop */ }
      }

      // ── Insight narrativo ──
      pdf.setFillColor(255, 247, 237);
      pdf.roundedRect(12, 172, 186, 18, 2, 2, "F");
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(194, 65, 12);
      pdf.text(heroInsight.title.toUpperCase(), 16, 178);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(51, 65, 85);
      const insightLines = pdf.splitTextToSize(heroInsight.text, 178);
      pdf.text(insightLines, 16, 183);

      // ── Top 5 memorie più richiamate ──
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(30, 41, 59);
      pdf.text("Top 5 memorie più richiamate", 12, 202);

      const personaMapLocal = new Map(personas.map((p) => [p.persona_key, p]));
      const top5 = [...memories]
        .filter((m) => m.enabled)
        .sort((a, b) => (b.hits_count ?? 0) - (a.hits_count ?? 0))
        .slice(0, 5);

      let y = 208;
      top5.forEach((m, i) => {
        const personaName = personaMapLocal.get(m.persona_key)?.display_name ?? m.persona_key;
        const preview = m.content.length > 95 ? m.content.slice(0, 92) + "…" : m.content;
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(249, 115, 22);
        pdf.text(`${i + 1}.`, 12, y);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`${m.hits_count ?? 0} hits`, 200, y, { align: "right" });
        pdf.setTextColor(30, 41, 59);
        pdf.setFont("helvetica", "normal");
        pdf.text(`${personaName}: ${preview}`, 17, y, { maxWidth: 175 });
        y += 8;
      });

      // ── Footer ──
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(148, 163, 184);
      pdf.text("Generato da Edilizia in Cloud — Cervello AI", 105, 287, { align: "center" });

      pdf.save(`cervello-ai-report-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("Report PDF esportato");
    } catch (err) {
      toast.error("Errore generazione PDF", { description: String((err as Error).message ?? err) });
    }
  }, [effectiveCompany?.name, totalMemories, totalCrossPersonaLinks, insights.healthPct, stats.personaCount, personas, memories, heroInsight]);

  // ── Seed demo: popola memorie realistiche per Demo Azienda ──────────────
  // Mappa ogni persona_key demo a un persona_key reale presente nel sistema.
  // Salta solo le memorie senza un match valido nel catalogo attivo.
  const handleSeedDemo = useCallback(async () => {
    if (!effectiveCompany?.id || !isDemoCompany) return;
    setIsSeeding(true);
    try {
      const availableKeys = new Set(personas.map((p) => p.persona_key));

      let inserted = 0;
      let skipped = 0;

      for (const mem of DEMO_MEMORIES) {
        const targetKey = resolveDemoPersonaKey(mem.persona_key, availableKeys);
        if (!targetKey) { skipped++; continue; }

        const { error } = await brainSupabase.rpc("record_persona_memory", {
          p_company_id: effectiveCompany.id,
          p_user_id: null,
          p_persona_key: targetKey,
          p_memory_type: mem.memory_type,
          p_content: mem.content,
          p_source: "demo_seed",
          p_confidence: mem.confidence,
        });

        if (!error) {
          inserted++;
          // Boost hits_count to simulate usage
          if (mem.hits_count > 0) {
            await brainSupabase
              .from("ai_persona_memory")
              .update({ hits_count: mem.hits_count })
              .eq("company_id", effectiveCompany.id)
              .eq("persona_key", targetKey)
              .eq("content", mem.content);
          }
        } else {
          skipped++;
        }
      }

      toast.success(`Cervello popolato — ${inserted} memorie create`, {
        description: skipped > 0 ? `${skipped} skippate (persona non trovata)` : "Il grafo si aggiornerà tra un istante.",
      });

      void qc.invalidateQueries({ queryKey: ["brain-graph-memories"] });
    } catch (err) {
      toast.error("Errore popolamento demo", { description: String((err as Error).message ?? err) });
    } finally {
      setIsSeeding(false);
    }
  }, [effectiveCompany?.id, isDemoCompany, personas, qc]);

  // ── Fullscreen ────────────────────────────────────────────────────────────

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!fullscreen) {
      setFullscreen(true);
      try {
        await containerRef.current.requestFullscreen?.();
      } catch {
        // Fallback: la classe fixed resta attiva anche se il browser blocca Fullscreen API.
      }
    } else {
      setFullscreen(false);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen?.();
        } catch {
          // Fallback visivo già disattivato.
        }
      }
    }
  }, [fullscreen]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setFullscreen(false);
      else if (document.fullscreenElement === containerRef.current) setFullscreen(true);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && fullscreen) {
        setFullscreen(false);
        if (document.fullscreenElement) void document.exitFullscreen?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  // ── Compute final selections ──────────────────────────────────────────────

  const selections = useMemo(() => {
    // Search takes priority
    if (searchSelections !== null) return searchSelections;
    // Then node selection
    if (!selectedNode) return [];
    const sel = [selectedNode.id];
    for (const e of edges) {
      if (e.source === selectedNode.id) sel.push(e.target);
      else if (e.target === selectedNode.id) sel.push(e.source);
    }
    return sel;
  }, [searchSelections, selectedNode, edges]);

  const edgeTooltipPosition = useMemo(() => {
    if (!hoveredEdge || typeof window === "undefined") return null;
    const tooltipWidth = 240;
    const tooltipHeight = 120;
    return {
      left: Math.max(12, Math.min(hoveredEdge.x + 12, window.innerWidth - tooltipWidth)),
      top: Math.max(12, Math.min(hoveredEdge.y - 10, window.innerHeight - tooltipHeight)),
    };
  }, [hoveredEdge]);

  // ── Render ────────────────────────────────────────────────────────────────

  // Dark elegant background — nero deep con sottile radial gradient + grid
  const gridBgStyle: React.CSSProperties = {
    backgroundColor: "#000000",
    backgroundImage: `
      radial-gradient(ellipse at center, rgba(30, 30, 50, 0.4) 0%, transparent 70%),
      linear-gradient(rgba(100, 100, 130, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(100, 100, 130, 0.04) 1px, transparent 1px)
    `,
    backgroundSize: "100% 100%, 40px 40px, 40px 40px",
  };

  const loadError = !useDemoFallback && (isPersonasError || isMemoriesError)
    ? (personasError as Error | null)?.message ?? (memoriesError as Error | null)?.message ?? "Errore caricamento Cervello AI"
    : null;

  if (isGraphLoading && !loadingTimedOut) {
    return (
      <div
        className="flex items-center justify-center h-[500px] rounded-xl border border-slate-800"
        style={gridBgStyle}
      >
        <div className="flex flex-col items-center gap-3">
          <Brain className="h-10 w-10 text-orange-400 animate-pulse" />
          <p className="text-sm text-slate-300">Caricamento cervello AI…</p>
        </div>
      </div>
    );
  }

  if (loadError || (loadingTimedOut && !useDemoFallback)) {
    return (
      <div
        className="flex items-center justify-center h-[500px] rounded-xl border border-slate-800"
        style={gridBgStyle}
      >
        <div className="flex flex-col items-center gap-3 text-center px-4 max-w-md">
          <Network className="h-12 w-12 text-orange-400" />
          <p className="text-sm text-slate-100 font-semibold">Cervello AI non caricato</p>
          <p className="text-xs text-slate-300">
            {loadError ?? "Il caricamento sta impiegando troppo tempo"}. Puoi riprovare senza ricaricare tutta la pagina.
          </p>
          <Button
            size="sm"
            className="mt-2 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => {
              setLoadingTimedOut(false);
              void refetchPersonas();
              void refetchMemories();
            }}
          >
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-[400px] rounded-xl border border-slate-800"
        style={gridBgStyle}
      >
        <div className="flex flex-col items-center gap-3 text-center px-4 max-w-md">
          <Network className="h-12 w-12 text-slate-700" />
          <p className="text-sm text-slate-200 font-medium">Nessuna memoria AI ancora</p>
          <p className="text-xs text-slate-300">
            Inizia a parlare con le AI Personas nella tab Chat. Il sistema creerà automaticamente
            memorie che appariranno qui come nodi collegati.
          </p>
          {isDemoCompany && (
            <Button
              size="sm"
              className="mt-3 gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleSeedDemo}
              disabled={isSeeding}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isSeeding ? "Popolamento…" : "Popola con memorie demo"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Hero panel storytelling ──────────────────────────────────────── */}
      {!fullscreen && (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-orange-50/30 to-amber-50/40 p-4 md:p-5">
          {/* Background pattern decorativo */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(circle, #f97316 1px, transparent 1px)`,
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Cervello AI</h3>
                <p className="text-[11px] text-slate-600">Tutte le personas AI abilitate, connesse alla memoria aziendale</p>
              </div>
            </div>

            {/* Numeri hero */}
            <div className="flex items-center gap-4 md:gap-6 md:ml-6">
              <div>
                <div className="text-2xl font-bold text-slate-900 tabular-nums leading-tight">{stats.personaCount}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">personas AI</div>
                <div className="text-[9px] text-orange-600 font-semibold">{personasInMemory} in rete · {personaActivationPct}%</div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <div className="flex items-baseline gap-1.5">
                  <div className="text-2xl font-bold text-slate-900 tabular-nums leading-tight">{totalMemories}</div>
                  {periodComparison.delta !== 0 && (
                    <span className={cn(
                      "text-[10px] font-semibold tabular-nums",
                      periodComparison.delta > 0 ? "text-emerald-600" : "text-rose-600",
                    )}>
                      {periodComparison.delta > 0 ? "▲" : "▼"}{Math.abs(periodComparison.delta)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  memorie {periodComparison.delta !== 0 ? "vs 7gg" : ""}
                </div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <div className="text-2xl font-bold text-orange-600 tabular-nums leading-tight">{totalCrossPersonaLinks}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">ponti cross-team</div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-left cursor-pointer group">
                    <div className={cn(
                      "text-2xl font-bold tabular-nums leading-tight group-hover:underline",
                      insights.healthPct >= 70 ? "text-emerald-600" : insights.healthPct >= 40 ? "text-amber-600" : "text-rose-600",
                    )}>
                      {insights.healthPct}%
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                      salute
                      <span className="text-orange-500 text-[9px]">▾</span>
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-3 bg-white border-slate-200 shadow-xl">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Brain Health Score</p>
                  <div className="space-y-2">
                    {([
                      { label: "Copertura", value: insights.healthBreakdown.coverage, desc: "% personas con ≥3 memorie" },
                      { label: "Cross-linkage", value: insights.healthBreakdown.crossLinkage, desc: "% personas connesse" },
                      { label: "Freschezza", value: insights.healthBreakdown.freshness, desc: "% memorie ultimi 30gg" },
                      { label: "Attività", value: insights.healthBreakdown.activity, desc: "% memorie usate" },
                    ] as const).map((m) => (
                      <div key={m.label}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-semibold text-slate-700">{m.label}</span>
                          <span className={cn(
                            "text-[10px] font-bold tabular-nums",
                            m.value >= 70 ? "text-emerald-600" : m.value >= 40 ? "text-amber-600" : "text-rose-600",
                          )}>
                            {m.value}%
                          </span>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              m.value >= 70 ? "bg-emerald-500" : m.value >= 40 ? "bg-amber-500" : "bg-rose-500",
                            )}
                            style={{ width: `${m.value}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-slate-500 mt-0.5">{m.desc}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-400 mt-3 pt-2 border-t border-slate-100">
                    Score = (copertura×0.2 + cross×0.3 + freschezza×0.2 + attività×0.3)
                  </p>
                </PopoverContent>
              </Popover>
            </div>

            {/* Filtro temporale */}
            <div className="md:ml-auto flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Periodo</span>
              <div className="flex bg-white border border-slate-200 rounded-md overflow-hidden shadow-sm">
                {([
                  { v: "7d", l: "7g" },
                  { v: "30d", l: "30g" },
                  { v: "90d", l: "90g" },
                  { v: "all", l: "Tutto" },
                ] as const).map((opt, i) => (
                  <button
                    key={opt.v}
                    onClick={() => setTimeFilter(opt.v)}
                    className={cn(
                      "h-7 px-2 text-[10px] font-medium transition-colors",
                      timeFilter === opt.v
                        ? "bg-orange-500 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      i > 0 && "border-l border-slate-200",
                    )}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Insight feed rotante */}
            <div className="md:max-w-sm w-full md:w-auto">
              <BrainInsightFeed
                memories={memories}
                personas={personas}
                crossPersonaLinks={crossPersonaLinks}
                totalCrossPersonaLinks={totalCrossPersonaLinks}
                healthPct={insights.healthPct}
                recentEventsCount={recentEventsCount}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Graph container ──────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={cn(
          "relative rounded-xl overflow-hidden border border-slate-800 bg-black",
          fullscreen ? "fixed inset-0 z-[120] h-screen w-screen rounded-none border-0" : "h-[600px]",
        )}
        style={gridBgStyle}
      >
      {/* Starfield background animato (dietro al canvas WebGL) */}
      <BrainStarfield />

      {/* Onboarding tour (solo primo accesso, persistito in localStorage) */}
      <BrainOnboardingTour />

      {/* Sheet fullscreen scheda persona */}
      <BrainPersonaSheet
        open={personaSheetKey !== null}
        onClose={() => setPersonaSheetKey(null)}
        persona={personaSheetKey ? personas.find((p) => p.persona_key === personaSheetKey) ?? null : null}
        emoji={personaSheetKey ? (PERSONA_CATEGORY_EMOJI[personas.find((p) => p.persona_key === personaSheetKey)?.category ?? ""] ?? "⚡") : "⚡"}
        color={personaSheetKey ? (PERSONA_CATEGORY_COLORS[personas.find((p) => p.persona_key === personaSheetKey)?.category ?? ""] ?? PERSONA_CATEGORY_COLORS.default) : "#f97316"}
        memories={memories}
        allPersonas={personas}
        crossPersonaLinks={crossPersonaLinks}
        typeColors={MEMORY_TYPE_COLORS}
        typeLabels={MEMORY_TYPE_LABELS}
      />

      {/* Brain mascot (chiacchiera in basso a destra) */}
      <BrainMascot
        memories={memories}
        personas={personas}
        crossPersonaLinks={crossPersonaLinks}
        className={selectedNode ? "hidden md:block md:right-[19.5rem]" : undefined}
        onNodeClick={(nodeId) => {
          if (nodeId.startsWith("m_") && viewMode === "galaxy") {
            const mem = memories.find((m) => `m_${m.id}` === nodeId);
            if (mem && !expandedPersonas.has(mem.persona_key)) {
              setExpandedPersonas((prev) => new Set([...prev, mem.persona_key]));
            }
          }
          setTimeout(() => {
            graphRef.current?.fitNodesInView([nodeId], { fitOnlyIfNodesNotInView: false });
            const node = nodes.find((n) => n.id === nodeId);
            if (node) setSelectedNode(node as unknown as InternalGraphNode);
          }, 100);
        }}
      />

      {/* LIVE heartbeat indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div
          className={cn(
            "flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-sm rounded-full border px-2.5 py-1 shadow-lg transition-all duration-300",
            livePulse
              ? "border-emerald-400/70 scale-110 shadow-emerald-500/30"
              : "border-slate-600",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-all",
              livePulse ? "bg-emerald-400 animate-ping" : "bg-emerald-500 animate-pulse",
            )}
          />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300">
            LIVE
          </span>
          {recentEventsCount > 0 && (
            <span className="text-[9px] text-emerald-400 font-bold tabular-nums">
              {recentEventsCount}
            </span>
          )}
        </div>
      </div>
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-2 pointer-events-none sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-full flex-wrap items-center gap-1.5 pointer-events-auto sm:gap-2">
          <Badge className="bg-slate-900/95 text-slate-200 border-slate-600 backdrop-blur-sm shadow-lg text-[10px] gap-1.5">
            <Brain className="h-3 w-3 text-orange-400" />
            {stats.personaCount} personas · {personasInMemory} in rete
          </Badge>
            <Badge className="bg-slate-900/95 text-slate-200 border-slate-600 backdrop-blur-sm shadow-lg text-[10px] gap-1.5">
              <Sparkles className="h-3 w-3 text-violet-400" />
              {totalMemories} memorie
            </Badge>
            <Badge className="bg-slate-900/95 text-slate-200 border-slate-600 backdrop-blur-sm shadow-lg text-[10px] gap-1.5">
              <Network className="h-3 w-3 text-emerald-400" />
              {totalCrossPersonaLinks} connessioni
            </Badge>
          {stats.xpEdges > 0 && (
            <Badge className="bg-orange-100 text-orange-700 border-orange-300 backdrop-blur-sm text-[10px] gap-1.5">
              <Link2 className="h-3 w-3" />
              {stats.xpEdges} cross-persona
            </Badge>
          )}
          <Badge
            className={cn(
              "backdrop-blur-sm text-[10px] gap-1.5 shadow-lg",
              graphIntegrity.ok
                ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/40"
                : "bg-rose-500/15 text-rose-200 border-rose-500/40",
            )}
            title={
              graphIntegrity.ok
                ? "Tutti i nodi visibili hanno collegamenti validi e ogni persona ha memoria viva"
                : `${graphIntegrity.missingEdges} edge mancanti, ${graphIntegrity.disconnectedNodes} nodi isolati, ${graphIntegrity.memoriesWithoutPersonaEdge} memorie senza persona, ${graphIntegrity.personasWithoutMemories} personas senza memoria`
            }
          >
            <Zap className="h-3 w-3" />
            {graphIntegrity.ok ? "QA rete OK" : "QA rete"}
          </Badge>
          {useDemoFallback && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 backdrop-blur-sm text-[10px] gap-1.5">
              Anteprima demo
            </Badge>
          )}
        </div>

        <div className="flex max-w-full flex-wrap items-center justify-start gap-1.5 pointer-events-auto sm:justify-end">
          {/* AI Search semantico con dropdown risultati */}
          <BrainSemanticSearch
            className="w-40 sm:w-auto"
            memories={memories}
            personas={personas}
            categoryEmoji={PERSONA_CATEGORY_EMOJI}
            typeLabels={MEMORY_TYPE_LABELS}
            typeColors={MEMORY_TYPE_COLORS}
            onSelect={(nodeId) => {
              // Se è una memoria di una persona NON espansa in galaxy mode,
              // espandiamo automaticamente quel cluster
              if (nodeId.startsWith("m_") && viewMode === "galaxy") {
                const mem = memories.find((m) => `m_${m.id}` === nodeId);
                if (mem && !expandedPersonas.has(mem.persona_key)) {
                  setExpandedPersonas((prev) => new Set([...prev, mem.persona_key]));
                }
              }
              // Zoom + centra
              setTimeout(() => {
                graphRef.current?.fitNodesInView([nodeId], { fitOnlyIfNodesNotInView: false });
                const node = nodes.find((n) => n.id === nodeId);
                if (node) setSelectedNode(node as unknown as InternalGraphNode);
              }, 100); // delay per dare tempo al layout di includere il nuovo nodo
            }}
          />

          {/* Toggle Globo 3D rotante (effetto WOW) */}
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 px-2.5 text-[10px] gap-1 backdrop-blur-sm shadow-sm border",
              viewDim === "core"
                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-400 hover:opacity-90"
                : "bg-slate-900/95 text-slate-200 border-slate-600 hover:bg-slate-800 hover:text-white",
            )}
            onClick={() => setViewDim(viewDim === "core" ? "2d" : "core")}
            title={viewDim === "core" ? "Esci dal Globo 3D" : "Globo 3D — ruota la conoscenza da ogni angolazione"}
          >
            <Brain className="h-3 w-3" />
            Globo 3D
          </Button>
          {/* Quick actions: Galassia ↔ Dettaglio toggle (singolo pulsante) */}
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 px-2.5 text-[10px] gap-1 backdrop-blur-sm shadow-sm border",
              viewMode === "detail"
                ? "bg-orange-500 text-white border-orange-400 hover:bg-orange-600"
                : "bg-slate-900/95 text-slate-200 border-slate-600 hover:bg-slate-800 hover:text-white",
            )}
            onClick={() => {
              if (viewMode === "galaxy") setViewMode("detail");
              else { setViewMode("galaxy"); setExpandedPersonas(new Set()); }
            }}
            title={viewMode === "galaxy" ? "Mostra tutte le memorie" : "Torna alla vista galassia"}
          >
            {viewMode === "galaxy" ? (
              <><Sparkles className="h-3 w-3" /> Espandi tutto</>
            ) : (
              <><Brain className="h-3 w-3" /> Galassia</>
            )}
          </Button>
          {/* Demo seed (only for demo company) */}
          {isDemoCompany && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 border border-orange-500/40 shadow-sm gap-1"
              onClick={handleSeedDemo}
              disabled={isSeeding}
              title="Popola con memorie demo realistiche"
            >
              <Sparkles className="h-3 w-3" />
              {isSeeding ? "Popolo…" : "Demo"}
            </Button>
          )}
          {/* Zoom controls */}
          <div className="flex items-center overflow-hidden rounded-md border border-slate-600 bg-slate-900/95 shadow-sm backdrop-blur-sm">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-none border-0 text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={zoomOutGraph}
              aria-label="Zoom indietro"
              title="Zoom indietro"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-none border-0 border-l border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={zoomInGraph}
              aria-label="Zoom avanti"
              title="Zoom avanti"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-none border-0 border-l border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={fitGraphToView}
              aria-label="Adatta grafo alla vista"
              title="Adatta grafo alla vista"
            >
              <Network className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Reset */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 bg-slate-900/95 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-600 backdrop-blur-sm shadow-sm"
            onClick={resetView}
            aria-label="Reset vista grafo"
            title="Reset vista"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          {/* Fullscreen */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 bg-slate-900/95 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-600 backdrop-blur-sm shadow-sm"
            onClick={toggleFullscreen}
            aria-label="Modalita fullscreen grafo"
            title={fullscreen ? "Esci fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          {/* Settings popover (advanced options nascoste qui) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 bg-slate-900/95 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-600 backdrop-blur-sm shadow-sm"
                aria-label="Opzioni avanzate grafo"
                title="Opzioni avanzate"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="z-[80] w-60 p-3 bg-slate-900/95 border-slate-600 text-slate-200 shadow-2xl"
            >
              <div className="space-y-3">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-slate-300 font-semibold mb-1.5">Colore nodi</p>
                  <div className="flex bg-slate-800 rounded-md border border-slate-600 overflow-hidden">
                    {(["cluster", "type", "heat"] as ColorMode[]).map((m) => (
                      <button
                        key={m}
                        className={cn(
                          "flex-1 h-7 text-[10px] flex items-center justify-center gap-1 transition-colors",
                          colorMode === m ? "bg-orange-500 text-white" : "text-slate-300 hover:bg-slate-700",
                          m !== "cluster" && "border-l border-slate-600",
                        )}
                        onClick={() => setColorMode(m)}
                      >
                        {m === "cluster" ? <Network className="h-3 w-3" /> : m === "type" ? <Palette className="h-3 w-3" /> : <Flame className="h-3 w-3" />}
                        {m === "cluster" ? "Persona" : m === "type" ? "Tipo" : "Attività"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-slate-300 font-semibold mb-1.5">Vista</p>
                  <div className="flex bg-slate-800 rounded-md border border-slate-600 overflow-hidden">
                    <button
                      className={cn(
                        "flex-1 h-7 text-[10px] transition-colors",
                        viewDim === "2d" ? "bg-orange-500 text-white" : "text-slate-300 hover:bg-slate-700",
                      )}
                      onClick={() => setViewDim("2d")}
                      title="Vista piatta classica"
                    >
                      2D
                    </button>
                    <button
                      className={cn(
                        "flex-1 h-7 text-[10px] transition-colors border-l border-slate-600",
                        viewDim === "3d" ? "bg-orange-500 text-white" : "text-slate-300 hover:bg-slate-700",
                      )}
                      onClick={() => setViewDim("3d")}
                      title="Globo manuale: trascina lo sfondo per ruotare"
                    >
                      3D
                    </button>
                    <button
                      className={cn(
                        "flex-1 h-7 text-[10px] transition-colors border-l border-slate-600 flex items-center justify-center gap-1",
                        viewDim === "core" ? "bg-orange-500 text-white" : "text-slate-300 hover:bg-slate-700",
                      )}
                      onClick={() => setViewDim("core")}
                      title="Orbita automatica: trascina per cambiare angolo"
                    >
                      <Brain className="h-3 w-3" />
                      Orbita
                    </button>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-600 space-y-1">
                  <button
                    className="w-full h-7 text-[10px] text-slate-300 hover:bg-slate-800 hover:text-white rounded-md flex items-center justify-center gap-1.5 transition-colors"
                    onClick={handleExport}
                  >
                    <Camera className="h-3 w-3" />
                    Esporta screenshot PNG
                  </button>
                  <button
                    className="w-full h-7 text-[10px] text-orange-400 hover:bg-orange-500/20 hover:text-orange-300 rounded-md flex items-center justify-center gap-1.5 transition-colors border border-orange-500/30"
                    onClick={handlePdfReport}
                  >
                    <Sparkles className="h-3 w-3" />
                    Report PDF executive
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Galaxy mode hint — solo quando nessuna è espansa, posizionato in basso (no overlap con LIVE) */}
      {viewMode === "galaxy" && expandedPersonas.size === 0 && nodes.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-slate-900/95 backdrop-blur-sm rounded-full border border-slate-600 px-3 py-1 shadow-lg">
            <p className="text-[10px] text-slate-300 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-orange-400" />
              {viewDim === "2d" ? "Click su una persona per esplorare le sue memorie" : "Trascina lo spazio per ruotare il globo"}
            </p>
          </div>
        </div>
      )}

      {/* ── Search results count ──────────────────────────────────────────── */}
      {searchSelections !== null && (
        <div className="absolute top-12 right-3 z-10 pointer-events-auto">
          <Badge className="bg-slate-900/95 text-slate-200 border-slate-600 backdrop-blur-sm shadow-lg text-[10px]">
            {searchSelections.length} risultat{searchSelections.length === 1 ? "o" : "i"}
          </Badge>
        </div>
      )}

      {/* ── Active filters ────────────────────────────────────────────────── */}
      {(filterPersona || filterType) && (
        <div className="absolute top-12 left-3 z-10 flex items-center gap-1.5 pointer-events-auto">
          {filterPersona && (
            <Badge
              className="bg-orange-100 text-orange-700 border-orange-300 backdrop-blur-sm text-[10px] gap-1 cursor-pointer hover:bg-orange-200"
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
            className="h-5 px-1.5 text-[9px] text-slate-300 hover:text-white"
            onClick={resetView}
          >
            Resetta
          </Button>
        </div>
      )}

      {/* ── #6: Insights panel ─────────────────────────────────────────────── */}
      <div className="absolute top-12 left-3 z-10 pointer-events-auto" style={{ marginTop: (filterPersona || filterType) ? 28 : 0 }}>
        <button
          className="flex items-center gap-1.5 text-[10px] text-slate-300 hover:text-white bg-slate-900/95 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-slate-600 shadow-sm transition-colors"
          onClick={() => setInsightsOpen(!insightsOpen)}
        >
          <Zap className="h-3 w-3 text-orange-400" />
          Insights
          {insightsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        {insightsOpen && (
          <div className="mt-1 bg-slate-900/95 backdrop-blur-md rounded-lg border border-slate-600 p-2.5 w-72 max-h-[74vh] overflow-y-auto space-y-2.5 shadow-2xl">
            {/* Health */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-slate-300 uppercase tracking-wider font-semibold">Salute cervello</span>
                <span className={cn(
                  "text-[11px] font-bold",
                  insights.healthPct >= 70 ? "text-emerald-400" : insights.healthPct >= 40 ? "text-amber-400" : "text-rose-400",
                )}>
                  {insights.healthPct}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    insights.healthPct >= 70 ? "bg-emerald-500" : insights.healthPct >= 40 ? "bg-amber-500" : "bg-rose-500",
                  )}
                  style={{ width: `${insights.healthPct}%` }}
                />
              </div>
              <p className="text-[9px] text-slate-300 mt-0.5">
                {insights.healthPct}% delle memorie usate almeno 1 volta
              </p>
            </div>

            {/* Memory quality */}
            <div className="pt-2 border-t border-slate-700/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-slate-300 uppercase tracking-wider font-semibold">Affidabilita memoria</span>
                <span className={cn(
                  "text-[11px] font-bold tabular-nums",
                  memoryQuality.reliabilityPct >= 75 ? "text-emerald-400" : memoryQuality.reliabilityPct >= 45 ? "text-amber-400" : "text-rose-400",
                )}>
                  {memoryQuality.reliabilityPct}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "bassa fiducia", value: memoryQuality.lowConfidenceCount },
                  { label: "vecchie", value: memoryQuality.staleCount },
                  { label: "mai usate", value: memoryQuality.unusedCount },
                  { label: "duplicate", value: memoryQuality.duplicateClusters.length },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1">
                    <div className="text-[12px] font-bold text-slate-100 tabular-nums">{item.value}</div>
                    <div className="text-[8px] uppercase tracking-wider text-slate-400">{item.label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[9px] text-slate-300">
                Fonti affidabili: <span className="text-emerald-300 font-semibold">{memoryQuality.trustedSourcePct}%</span>
                {memoryQuality.demoCount > 0 && <> · demo preview: {memoryQuality.demoCount}</>}
              </p>
            </div>

            {/* Community intelligence */}
            {knowledgeCommunities.length > 0 && (
              <div className="pt-2 border-t border-slate-700/80">
                <div className="flex items-center gap-1 mb-1.5">
                  <Network className="h-3 w-3 text-cyan-300" />
                  <span className="text-[9px] text-slate-300 uppercase tracking-wider font-semibold">Community intelligence</span>
                </div>
                <div className="space-y-1.5">
                  {knowledgeCommunities.slice(0, 4).map((community) => (
                    <div key={community.key} className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: community.color }} />
                          <span className="truncate text-[10px] font-semibold text-slate-100">{community.label}</span>
                        </div>
                        <span className={cn(
                          "text-[10px] font-bold tabular-nums",
                          community.healthPct >= 75 ? "text-emerald-300" : community.healthPct >= 45 ? "text-amber-300" : "text-rose-300",
                        )}>
                          {community.healthPct}%
                        </span>
                      </div>
                      <p className="mt-0.5 text-[9px] text-slate-400">
                        {community.activePersonaCount}/{community.personaCount} personas · {community.memoryCount} memorie · {community.crossLinks} ponti · {community.riskLabel}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action queue */}
            <div className="pt-2 border-t border-slate-700/80">
              <div className="flex items-center gap-1 mb-1">
                <Zap className="h-3 w-3 text-orange-400" />
                <span className="text-[9px] text-slate-300 uppercase tracking-wider font-semibold">Prossime azioni</span>
              </div>
              <div className="space-y-1">
                {memoryQuality.qualityActionQueue.map((action) => (
                  <div key={action} className="rounded-md bg-orange-500/10 border border-orange-500/20 px-2 py-1 text-[9px] text-orange-100">
                    {action}
                  </div>
                ))}
              </div>
            </div>

            {/* God nodes */}
            {insights.godNodes.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  <span className="text-[9px] text-slate-300 uppercase tracking-wider font-semibold">Nodi centrali</span>
                </div>
                {insights.godNodes.map((n) => (
                  <button
                    key={n.id}
                    className="w-full text-left text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 truncate flex items-center gap-1.5"
                    onClick={() => {
                      graphRef.current?.centerGraph([n.id]);
                      const gn = nodes.find((nn) => nn.id === n.id);
                      if (gn) setSelectedNode(gn as unknown as InternalGraphNode);
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="truncate">{n.label}</span>
                    <span className="text-slate-300 ml-auto shrink-0">{n.connections}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Bridges */}
            {insights.bridges.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Link2 className="h-3 w-3 text-orange-400" />
                  <span className="text-[9px] text-slate-300 uppercase tracking-wider font-semibold">Ponti tra personas</span>
                </div>
                {insights.bridges.map((b) => (
                  <button
                    key={b.id}
                    className="w-full text-left text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 truncate flex items-center gap-1.5"
                    onClick={() => graphRef.current?.centerGraph([b.id])}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                    <span className="truncate">{b.label}</span>
                    <span className="text-slate-300 ml-auto shrink-0">{b.personasLinked.length}p</span>
                  </button>
                ))}
              </div>
            )}

            {/* Orphans */}
            {insights.orphans.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Ghost className="h-3 w-3 text-slate-300" />
                  <span className="text-[9px] text-slate-300 uppercase tracking-wider font-semibold">Orfane (isolate)</span>
                </div>
                {insights.orphans.slice(0, 3).map((o) => (
                  <button
                    key={o.id}
                    className="w-full text-left text-[10px] text-slate-300 hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-800 truncate flex items-center gap-1.5"
                    onClick={() => graphRef.current?.centerGraph([o.id])}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
                    <span className="truncate">{o.label}</span>
                  </button>
                ))}
                {insights.orphans.length > 3 && (
                  <p className="text-[9px] text-slate-300 px-1.5">+{insights.orphans.length - 3} altre</p>
                )}
              </div>
            )}

            {/* Cross-links total */}
            {insights.totalCrossLinks > 0 && (
              <div className="pt-1 border-t border-slate-600">
                <p className="text-[9px] text-slate-300">
                  <span className="text-orange-400 font-semibold">{insights.totalCrossLinks}</span> connessioni cross-persona trovate
                  {" — "}il cervello pensa trasversalmente
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 pointer-events-auto max-w-xs">
        <div className="bg-slate-900/95 backdrop-blur-sm rounded-lg p-2 border border-slate-600 shadow-lg">
          <p className="text-[9px] text-slate-300 uppercase tracking-wider mb-1.5 font-semibold">
            {colorMode === "heat"
              ? "Attività (dormiente → attiva)"
              : colorMode === "type"
              ? "Tipo memoria"
              : "Cluster (per persona)"}
          </p>
          {colorMode === "heat" ? (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-slate-300">Dormiente</span>
              <div className="flex-1 h-2 rounded-full" style={{
                background: "linear-gradient(to right, #3b82f6, #06b6d4, #fbbf24, #f97316, #ef4444)",
              }} />
              <span className="text-[9px] text-slate-300">Attiva</span>
            </div>
          ) : colorMode === "type" ? (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(MEMORY_TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  className={cn(
                    "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-all",
                    filterType === key ? "ring-1 ring-orange-400 bg-orange-500/20" : "hover:bg-slate-800",
                  )}
                  onClick={() => setFilterType(filterType === key ? null : key)}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: MEMORY_TYPE_COLORS[key] }}
                  />
                  <span className="text-slate-300">{label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {/* Lista personas con colore */}
              {[...new Set(personas.filter((p) =>
                memories.some((m) => m.persona_key === p.persona_key && m.enabled)
              ).map((p) => p.category))].map((cat) => {
                const color = PERSONA_CATEGORY_COLORS[cat] ?? PERSONA_CATEGORY_COLORS.default;
                return (
                  <div key={cat} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-slate-300 capitalize">{cat}</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Cross-persona edge legend */}
          <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-600">
            <span className="h-[2px] w-4 bg-orange-400/60" />
            <span className="text-[9px] text-slate-300">Connessione cross-persona</span>
          </div>
        </div>
      </div>

      {/* ── #7: Edge tooltip ───────────────────────────────────────────────── */}
      {hoveredEdge && edgeTooltipPosition && (
        <div
          className="fixed z-50 bg-slate-900/95 backdrop-blur-md rounded-lg border border-slate-600 px-3 py-2 shadow-2xl pointer-events-none"
          style={{
            left: edgeTooltipPosition.left,
            top: edgeTooltipPosition.top,
            maxWidth: 220,
          }}
        >
          <p className="text-[9px] text-slate-300 uppercase tracking-wider mb-1 font-semibold">Keyword condivise</p>
          <div className="flex flex-wrap gap-1">
            {(edgeKeywords.get(hoveredEdge.id) ?? []).map((kw) => (
              <Badge key={kw} className="text-[9px] h-4 px-1.5 bg-orange-100 text-orange-700 border-orange-300">
                {kw}
              </Badge>
            ))}
            {(edgeKeywords.get(hoveredEdge.id) ?? []).length === 0 && (
              <span className="text-[10px] text-slate-300">overlap semantico</span>
            )}
          </div>
        </div>
      )}

      {/* ── Detail panel ───────────────────────────────────────────────────── */}
      {selectedNode && (
        <div className="absolute bottom-3 right-3 z-10 w-72 bg-slate-900/95 backdrop-blur-md rounded-lg border border-slate-600 p-3 pointer-events-auto shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {selectedNode.data?.type === "silvio" ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-orange-300 via-orange-500 to-red-600 flex items-center justify-center text-lg shadow-lg shadow-orange-500/40">
                      🧠
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white leading-tight">Silvio</p>
                      <p className="text-[9px] uppercase tracking-wider text-orange-300 font-semibold">orchestratore AI</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-200 leading-relaxed">
                    Conosce la memoria aziendale, collega le personas e guida le risposte operative del sistema.
                  </p>
                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                    <div className="rounded-md bg-orange-500/15 border border-orange-500/30 px-2 py-1">
                      <p className="text-sm font-bold text-orange-200 tabular-nums">{stats.personaCount}</p>
                      <p className="text-[8px] uppercase tracking-wider text-orange-300">personas</p>
                    </div>
                    <div className="rounded-md bg-slate-800/80 border border-slate-600 px-2 py-1">
                      <p className="text-sm font-bold text-slate-100 tabular-nums">{totalMemories}</p>
                      <p className="text-[8px] uppercase tracking-wider text-slate-300">memorie</p>
                    </div>
                    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/25 px-2 py-1">
                      <p className="text-sm font-bold text-emerald-200 tabular-nums">{totalCrossPersonaLinks}</p>
                      <p className="text-[8px] uppercase tracking-wider text-emerald-300">ponti</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-orange-300 hover:text-orange-200 hover:bg-orange-500/20 gap-1 px-2 bg-orange-500/10 border border-orange-500/30"
                      onClick={() => {
                        setViewDim("core");
                        graphRef.current?.centerGraph();
                      }}
                    >
                      <Brain className="h-3 w-3" />
                      Nucleo
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-slate-300 hover:text-white hover:bg-slate-800 gap-1 px-2"
                      onClick={() => {
                        setViewMode("detail");
                        setExpandedPersonas(new Set(personas.map((p) => p.persona_key)));
                      }}
                    >
                      <Sparkles className="h-3 w-3" />
                      Vedi tutto
                    </Button>
                  </div>
                </>
              ) : selectedNode.data?.type === "persona" ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-base shrink-0"
                      style={{ backgroundColor: selectedNode.fill as string }}
                    >
                      {selectedNode.data.emoji ?? "⚡"}
                    </div>
                    <span className="text-sm font-semibold text-white truncate">
                      {selectedNode.data.persona.display_name}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-300">
                    Categoria: {selectedNode.data.persona.category}
                  </p>

                  {/* Mini-stats: donut + sparkline + top memorie */}
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <BrainPersonaStats
                      memories={memories.filter((m) => m.persona_key === selectedNode.data.persona.persona_key)}
                      typeColors={MEMORY_TYPE_COLORS}
                      typeLabels={MEMORY_TYPE_LABELS}
                    />
                  </div>
                  {/* Cross-persona connections for this persona */}
                  {(() => {
                    const pk = selectedNode.data.persona.persona_key;
                    const xpLinks: Array<{ name: string; count: number }> = [];
                    for (const [pA, targets] of crossPersonaLinks) {
                      if (pA === pk) {
                        for (const [pB, count] of targets) {
                          const name = personas.find((p) => p.persona_key === pB)?.display_name ?? pB;
                          xpLinks.push({ name, count });
                        }
                      }
                      for (const [pB, count] of (crossPersonaLinks.get(pA) ?? new Map())) {
                        if (pB === pk && pA !== pk) {
                          const name = personas.find((p) => p.persona_key === pA)?.display_name ?? pA;
                          if (!xpLinks.find((l) => l.name === name)) xpLinks.push({ name, count });
                        }
                      }
                    }
                    if (xpLinks.length === 0) return null;
                    return (
                      <div className="mt-2 pt-2 border-t border-slate-600">
                        <p className="text-[9px] text-slate-300 uppercase tracking-wider mb-1">Connessa con</p>
                        {xpLinks.map((l) => (
                          <div key={l.name} className="flex items-center justify-between text-[10px]">
                            <span className="text-orange-700 font-medium">{l.name}</span>
                            <span className="text-slate-300">{l.count} link</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {viewMode === "galaxy" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 gap-1 px-2 bg-orange-500/10 border border-orange-500/30"
                        onClick={() => {
                          const pKey = selectedNode.data.persona.persona_key;
                          setExpandedPersonas((prev) => {
                            const next = new Set(prev);
                            if (next.has(pKey)) next.delete(pKey);
                            else next.add(pKey);
                            return next;
                          });
                        }}
                      >
                        <Sparkles className="h-3 w-3" />
                        {expandedPersonas.has(selectedNode.data.persona.persona_key) ? "Comprimi" : "Espandi"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 gap-1 px-2 bg-orange-500/10 border border-orange-500/30"
                      onClick={() => {
                        setPersonaSheetKey(selectedNode.data.persona.persona_key);
                      }}
                    >
                      <Maximize2 className="h-3 w-3" />
                      Scheda completa
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 gap-1 px-2"
                      onClick={() => {
                        setFilterPersona(selectedNode.data.persona.persona_key);
                        setSelectedNode(null);
                      }}
                    >
                      <Filter className="h-3 w-3" />
                      Filtra
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-slate-300 hover:text-white hover:bg-slate-800 gap-1 px-2"
                      onClick={() => {
                        const relatedIds = [selectedNode.id];
                        for (const e of edges) {
                          if (e.source === selectedNode.id) relatedIds.push(e.target);
                          if (e.target === selectedNode.id) relatedIds.push(e.source);
                        }
                        graphRef.current?.centerGraph(relatedIds);
                      }}
                    >
                      <Maximize2 className="h-3 w-3" />
                      Zoom
                    </Button>
                  </div>
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
                    <span className="text-[10px] text-slate-300">
                      {selectedNode.data.personaName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-100 leading-relaxed mt-1">
                    {selectedNode.data.memory.content}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-300">
                    <span>{selectedNode.data.memory.hits_count ?? 0} hits</span>
                    <span>Conf. {((selectedNode.data.memory.confidence ?? 1) * 100).toFixed(0)}%</span>
                    <span>{selectedNode.data.memory.source ?? "auto"}</span>
                  </div>
                  {/* Connections count */}
                  {(() => {
                    const conn = connectionsMap.get(selectedNode.id);
                    const crossCount = conn ? [...conn].filter((id) => id.startsWith("m_")).length : 0;
                    if (crossCount === 0) return null;
                    return (
                      <p className="text-[9px] text-orange-400 mt-1.5">
                        Collegata a {crossCount} altr{crossCount === 1 ? "a memoria" : "e memorie"}
                      </p>
                    );
                  })()}
                </>
              ) : null}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 text-slate-300 hover:text-white"
              onClick={() => setSelectedNode(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Graph canvas ───────────────────────────────────────────────────── */}
      {/* SVG stabile sopra lo starfield: evita crash WebGL/reagraph e resta esportabile. */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <BrainGraphCanvas
          ref={graphRef}
          nodes={nodes}
          edges={edges}
          selections={selections}
          viewDim={viewDim}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onCanvasClick={handleCanvasClick}
          onEdgePointerOver={handleEdgePointerOver}
          onEdgePointerOut={handleEdgePointerOut}
        />
      </div>
      </div>
    </div>
  );
}
