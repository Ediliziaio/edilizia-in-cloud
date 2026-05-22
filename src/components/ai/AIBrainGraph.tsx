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
 * Tech: reagraph (WebGL, force-directed 3D) su React.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";
import { DEMO_MEMORIES, PERSONA_FALLBACKS } from "./brainGraphDemoMemories";
import { BrainStarfield } from "./BrainStarfield";
import { BrainInsightFeed } from "./BrainInsightFeed";
import { GraphCanvas, lightTheme, type GraphNode, type GraphEdge, type GraphCanvasRef } from "reagraph";
import type { InternalGraphNode, InternalGraphEdge } from "reagraph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Brain, Maximize2, Minimize2, RotateCcw,
  Filter, X, Sparkles, Network, Search, Camera,
  Flame, Palette, ChevronRight, ChevronDown,
  AlertTriangle, Link2, Zap, Ghost, Settings2,
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

  const activePersonaKeys = new Set(filtered.map((m) => m.persona_key));

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

  // Sort active personas per category per posizionarle in ordine deterministico
  const activePersonasList = [...activePersonaKeys]
    .map((k) => personaMap.get(k))
    .filter((p): p is PersonaLite => p != null)
    .sort((a, b) => {
      // Ordine per categoria poi per name
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.display_name.localeCompare(b.display_name);
    });

  const isGalaxyPure = viewMode === "galaxy" && expandedPersonas.size === 0;
  const RADIUS = 280;

  activePersonasList.forEach((p, i) => {
    const catColor = PERSONA_CATEGORY_COLORS[p.category] ?? PERSONA_CATEGORY_COLORS.default;
    const memCount = memoriesPerPersona.get(p.persona_key) ?? 0;

    const size = viewMode === "galaxy"
      ? 20 + Math.round((memCount / maxMemCount) * 18)   // hub 20-38 (era 14-30)
      : 11;

    // Layout circolare deterministico in galaxy puro
    const angle = (i / activePersonasList.length) * Math.PI * 2 - Math.PI / 2;
    const fx = isGalaxyPure ? Math.cos(angle) * RADIUS : undefined;
    const fy = isGalaxyPure ? Math.sin(angle) * RADIUS : undefined;

    nodes.push({
      id: `p_${p.persona_key}`,
      label: `${p.display_name}${viewMode === "galaxy" ? ` · ${memCount}` : ""}`,
      fill: catColor,
      size,
      labelVisible: true,
      // cluster solo quando layout lo supporta (force directed)
      ...(isGalaxyPure ? {} : { cluster: `cat_${p.category}` }),
      fx,
      fy,
      data: { type: "persona", persona: p, memoryCount: memCount },
    });
    connectionsMap.set(`p_${p.persona_key}`, new Set());
  });

  // Memory nodes + edges
  // In galaxy mode mostriamo SOLO le memorie delle personas espanse — il resto
  // resta "compresso" nel nodo persona (size proporzionale)
  const showAllMemories = viewMode === "detail";
  const visibleMemories = showAllMemories
    ? filtered
    : filtered.filter((m) => expandedPersonas.has(m.persona_key));

  const keywordsMap = new Map<string, Set<string>>();
  const memoryByPersona = new Map<string, string[]>(); // persona_key → [memId, ...]

  for (const m of visibleMemories) {
    const memId = `m_${m.id}`;
    const hits = m.hits_count ?? 0;
    const size = Math.min(6, Math.max(2, 2 + Math.log2(hits + 1)));
    // Short label (32 chars) per leggibilità su grafi densi
    const label = m.content.length > 32 ? m.content.slice(0, 30) + "…" : m.content;

    // Persona for this memory
    const persona = personaMap.get(m.persona_key);

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

    keywordsMap.set(memId, extractKeywords(m.content));
  }

  // Memory ↔ Memory cross-edges (semantic overlap)
  // Per calcolare i ponti cross-persona ho bisogno di analizzare TUTTE le memorie
  // anche se non sono visualizzate (in galaxy mode). Calcolo le cross-persona
  // da tutte le filtered, ma genero edges memory↔memory solo per memorie visibili.
  const allKeywordsMap = new Map<string, Set<string>>();
  for (const m of filtered) {
    allKeywordsMap.set(`m_${m.id}`, extractKeywords(m.content));
  }
  const allMemIds = [...allKeywordsMap.keys()];

  const memIds = [...keywordsMap.keys()];
  const crossEdgeSet = new Set<string>();
  for (let i = 0; i < memIds.length; i++) {
    const kwA = keywordsMap.get(memIds[i])!;
    const memA = visibleMemories.find((m) => `m_${m.id}` === memIds[i])!;
    for (let j = i + 1; j < memIds.length; j++) {
      const kwB = keywordsMap.get(memIds[j])!;
      const memB = visibleMemories.find((m) => `m_${m.id}` === memIds[j])!;
      let overlap = 0;
      for (const w of kwA) {
        if (kwB.has(w)) overlap++;
      }
      if (overlap >= KEYWORD_OVERLAP_THRESHOLD) {
        const edgeKey = `${memIds[i]}__${memIds[j]}`;
        if (!crossEdgeSet.has(edgeKey)) {
          crossEdgeSet.add(edgeKey);
          const edgeId = `e_cross_${edgeKey}`;
          edges.push({
            id: edgeId,
            source: memIds[i],
            target: memIds[j],
            size: Math.min(2, 0.5 + overlap * 0.3),
            fill: "#475569",
          });

          // #7: store shared keywords for tooltip
          const shared = sharedKeywordsDisplay(memA.content, memB.content);
          edgeKeywords.set(edgeId, shared);

          // Track connections
          connectionsMap.get(memIds[i])?.add(memIds[j]);
          connectionsMap.get(memIds[j])?.add(memIds[i]);

          // #2: Track cross-persona links
          if (memA.persona_key !== memB.persona_key) {
            const [pA, pB] = [memA.persona_key, memB.persona_key].sort();
            if (!crossPersonaLinks.has(pA)) crossPersonaLinks.set(pA, new Map());
            const existing = crossPersonaLinks.get(pA)!.get(pB) ?? 0;
            crossPersonaLinks.get(pA)!.set(pB, existing + 1);
          }
        }
      }
    }
  }

  // Calcolo cross-persona da TUTTE le memorie (anche non visibili in galaxy mode)
  // per mostrare i ponti persona↔persona corretti
  const allCrossPersona = new Map<string, Map<string, number>>();
  for (let i = 0; i < allMemIds.length; i++) {
    const kwA = allKeywordsMap.get(allMemIds[i])!;
    const memA = filtered.find((m) => `m_${m.id}` === allMemIds[i]);
    if (!memA) continue;
    for (let j = i + 1; j < allMemIds.length; j++) {
      const kwB = allKeywordsMap.get(allMemIds[j])!;
      const memB = filtered.find((m) => `m_${m.id}` === allMemIds[j]);
      if (!memB || memA.persona_key === memB.persona_key) continue;
      let overlap = 0;
      for (const w of kwA) {
        if (kwB.has(w)) overlap++;
        if (overlap >= KEYWORD_OVERLAP_THRESHOLD) break;
      }
      if (overlap >= KEYWORD_OVERLAP_THRESHOLD) {
        const [pA, pB] = [memA.persona_key, memB.persona_key].sort();
        if (!allCrossPersona.has(pA)) allCrossPersona.set(pA, new Map());
        const existing = allCrossPersona.get(pA)!.get(pB) ?? 0;
        allCrossPersona.get(pA)!.set(pB, existing + 1);
      }
    }
  }

  // #2: Add cross-persona edges
  for (const [pA, targets] of allCrossPersona) {
    for (const [pB, count] of targets) {
      if (count >= 1 && activePersonaKeys.has(pA) && activePersonaKeys.has(pB)) {
        edges.push({
          id: `e_xp_${pA}_${pB}`,
          source: `p_${pA}`,
          target: `p_${pB}`,
          size: Math.min(5, 1.5 + count * 0.5), // più visibile
          fill: "#fb923c", // orange-400 ben visibile su nero
          // niente label sull'edge (il numero compare nel detail panel)
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

interface Insights {
  godNodes: Array<{ id: string; label: string; connections: number }>;
  orphans: Array<{ id: string; label: string }>;
  bridges: Array<{ id: string; label: string; personasLinked: string[] }>;
  healthPct: number; // % memorie con hits > 0
  totalCrossLinks: number;
}

function computeInsights(
  nodes: GraphNode[],
  connectionsMap: Map<string, Set<string>>,
  crossPersonaLinks: Map<string, Map<string, number>>,
  memories: MemoryRow[],
  personas: PersonaLite[],
): Insights {
  const personaMap = new Map(personas.map((p) => [p.persona_key, p]));

  // God nodes: memory nodes with most connections (excluding persona edges)
  const memoryNodes = nodes.filter((n) => n.data?.type === "memory");
  const ranked = memoryNodes
    .map((n) => ({
      id: n.id,
      label: n.label ?? "",
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
          const connMem = memories.find((mm) => `m_${mm.id}` === cId);
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
      label: nodes.find((n) => n.id === memId)?.label ?? "",
      personasLinked: [...pks].map((pk) => personaMap.get(pk)?.display_name ?? pk),
    }))
    .sort((a, b) => b.personasLinked.length - a.personasLinked.length)
    .slice(0, 5);

  // Health: % memorie con almeno 1 hit
  const withHits = memories.filter((m) => m.enabled && (m.hits_count ?? 0) > 0).length;
  const totalEnabled = memories.filter((m) => m.enabled).length;
  const healthPct = totalEnabled > 0 ? Math.round((withHits / totalEnabled) * 100) : 0;

  // Total cross-links
  let totalCrossLinks = 0;
  for (const [, targets] of crossPersonaLinks) {
    for (const [, count] of targets) totalCrossLinks += count;
  }

  return { godNodes, orphans, bridges, healthPct, totalCrossLinks };
}

// ─── Custom dark theme ────────────────────────────────────────────────────────

// Theme ispirato a knowledge graph viz professionali (sfondo nero deep)
const BRAIN_THEME = {
  ...lightTheme,
  canvas: {
    background: "transparent",     // trasparente per mostrare grid background CSS
    fog: null,
  },
  node: {
    ...lightTheme.node,
    fill: "#f97316",
    activeFill: "#fb923c",
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.2,
    label: {
      ...lightTheme.node.label,
      color: "#ffffff",
      activeColor: "#ffffff",
      stroke: "#000000",
      backgroundColor: "#1e293b",
      backgroundOpacity: 1,        // pill solido, leggibile
      padding: 6,
      radius: 6,
      fontSize: 6,
    },
  },
  edge: {
    ...lightTheme.edge,
    fill: "#fb923c",                // arancio brillante per tutte le edges
    activeFill: "#ffffff",
    opacity: 0.7,                   // ben visibile
    selectedOpacity: 1,
    inactiveOpacity: 0.1,
    label: {
      ...lightTheme.edge.label,
      color: "transparent",         // nessuna label edges (eliminano i puntini neri)
      activeColor: "transparent",
      fontSize: 0,
    },
  },
  arrow: {
    fill: "#64748b",
    activeFill: "#fb923c",
  },
  ring: {
    fill: "#fb923c",
    activeFill: "#f97316",
  },
  cluster: {
    stroke: "#1e1e1e",
    fill: "#0a0a0a",
    opacity: 0,                    // anelli cluster invisibili (riducono rumore)
    selectedOpacity: 0,
    inactiveOpacity: 0,
    label: {
      stroke: "#000000",
      color: "transparent",         // niente label cluster automatici
      fontSize: 0,
      offset: [0, 0, 0] as [number, number, number],
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
  const qc = useQueryClient();
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const [is3D, setIs3D] = useState(false); // default 2D: cluster meglio leggibili
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isDemoCompany = effectiveCompany?.id === DEMO_COMPANY_ID;

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
          window.setTimeout(() => setLivePulse(false), 1500);
          void qc.invalidateQueries({ queryKey: ["brain-graph-memories"] });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [effectiveCompany?.id, qc]);

  // ── Build graph ───────────────────────────────────────────────────────────

  const graphData = useMemo(
    () => buildGraphData(personas, memories, filterPersona, filterType, colorMode, viewMode, expandedPersonas),
    [personas, memories, filterPersona, filterType, colorMode, viewMode, expandedPersonas],
  );

  const { nodes, edges, edgeKeywords, connectionsMap, crossPersonaLinks } = graphData;

  // ── #6: Insights ──────────────────────────────────────────────────────────

  const insights = useMemo(
    () => computeInsights(nodes, connectionsMap, crossPersonaLinks, memories, personas),
    [nodes, connectionsMap, crossPersonaLinks, memories, personas],
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
  const totalCrossPersonaLinks = useMemo(() => {
    let n = 0;
    for (const [, t] of crossPersonaLinks) for (const [, c] of t) n += c;
    return n;
  }, [crossPersonaLinks]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const personaCount = nodes.filter((n) => n.data?.type === "persona").length;
    const memoryCount = nodes.filter((n) => n.data?.type === "memory").length;
    const crossEdges = edges.filter((e) => e.id.startsWith("e_cross_")).length;
    const xpEdges = edges.filter((e) => e.id.startsWith("e_xp_")).length;
    return { personaCount, memoryCount, crossEdges, xpEdges, totalEdges: edges.length };
  }, [nodes, edges]);

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
      const personaKey = node.data.persona.persona_key;
      // Find all memory nodes belonging to this persona
      const relatedIds = [node.id];
      for (const e of edges) {
        if (e.source === node.id) relatedIds.push(e.target);
        if (e.target === node.id) relatedIds.push(e.source);
      }
      graphRef.current?.centerGraph(relatedIds);
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
  const handleEdgePointerOver = useCallback((edge: InternalGraphEdge, event?: { nativeEvent?: MouseEvent }) => {
    if (edge.id.startsWith("e_cross_")) {
      const x = (event?.nativeEvent?.clientX ?? 0);
      const y = (event?.nativeEvent?.clientY ?? 0);
      setHoveredEdge({ id: edge.id, x, y });
    }
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

  // #9: Export screenshot
  const handleExport = useCallback(() => {
    try {
      const dataUrl = graphRef.current?.exportCanvas();
      if (!dataUrl) return;
      const link = document.createElement("a");
      link.download = `cervello-ai-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Screenshot esportato");
    } catch {
      toast.error("Errore esportazione");
    }
  }, []);

  // ── Seed demo: popola memorie realistiche per Demo Azienda ──────────────
  // Mappa ogni persona_key delle memorie demo a un persona_key reale presente
  // nel sistema (via PERSONA_FALLBACKS). Salta le memorie senza match.
  const handleSeedDemo = useCallback(async () => {
    if (!effectiveCompany?.id || !isDemoCompany) return;
    setIsSeeding(true);
    try {
      const availableKeys = new Set(personas.map((p) => p.persona_key));

      let inserted = 0;
      let skipped = 0;

      for (const mem of DEMO_MEMORIES) {
        // Find first matching key in fallback chain
        const fallbackChain = PERSONA_FALLBACKS[mem.persona_key] ?? [mem.persona_key];
        const targetKey = fallbackChain.find((k) => availableKeys.has(k));
        if (!targetKey) { skipped++; continue; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).rpc("record_persona_memory", {
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
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

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!fullscreen) void containerRef.current.requestFullscreen?.();
    else void document.exitFullscreen?.();
  }, [fullscreen]);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

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

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-[500px] rounded-xl border border-slate-800"
        style={gridBgStyle}
      >
        <div className="flex flex-col items-center gap-3">
          <Brain className="h-10 w-10 text-orange-400 animate-pulse" />
          <p className="text-sm text-slate-400">Caricamento cervello AI…</p>
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
          <p className="text-xs text-slate-500">
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
                <p className="text-[11px] text-slate-600">La conoscenza condivisa delle 18 personas</p>
              </div>
            </div>

            {/* 3 numeri hero */}
            <div className="flex items-center gap-4 md:gap-6 md:ml-6">
              <div>
                <div className="text-2xl font-bold text-slate-900 tabular-nums leading-tight">{totalMemories}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">memorie</div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <div className="text-2xl font-bold text-orange-600 tabular-nums leading-tight">{totalCrossPersonaLinks}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">ponti cross-team</div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <div className={cn(
                  "text-2xl font-bold tabular-nums leading-tight",
                  insights.healthPct >= 70 ? "text-emerald-600" : insights.healthPct >= 40 ? "text-amber-600" : "text-rose-600",
                )}>
                  {insights.healthPct}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">salute</div>
              </div>
            </div>

            {/* Insight feed rotante */}
            <div className="md:ml-auto md:max-w-sm w-full md:w-auto">
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
          "relative rounded-xl overflow-hidden border border-slate-800",
          fullscreen ? "fixed inset-0 z-50 rounded-none" : "h-[600px]",
        )}
        style={gridBgStyle}
      >
      {/* Starfield background animato (dietro al canvas WebGL) */}
      <BrainStarfield />

      {/* LIVE heartbeat indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div
          className={cn(
            "flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-sm rounded-full border px-2.5 py-1 shadow-lg transition-all duration-300",
            livePulse
              ? "border-emerald-400/70 scale-110 shadow-emerald-500/30"
              : "border-slate-700",
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
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Badge className="bg-slate-900/85 text-slate-200 border-slate-700 backdrop-blur-sm shadow-lg text-[10px] gap-1.5">
            <Brain className="h-3 w-3 text-orange-400" />
            {stats.personaCount} personas
          </Badge>
          <Badge className="bg-slate-900/85 text-slate-200 border-slate-700 backdrop-blur-sm shadow-lg text-[10px] gap-1.5">
            <Sparkles className="h-3 w-3 text-violet-400" />
            {stats.memoryCount} memorie
          </Badge>
          <Badge className="bg-slate-900/85 text-slate-200 border-slate-700 backdrop-blur-sm shadow-lg text-[10px] gap-1.5">
            <Network className="h-3 w-3 text-emerald-400" />
            {stats.crossEdges} connessioni
          </Badge>
          {stats.xpEdges > 0 && (
            <Badge className="bg-orange-100 text-orange-700 border-orange-300 backdrop-blur-sm text-[10px] gap-1.5">
              <Link2 className="h-3 w-3" />
              {stats.xpEdges} cross-persona
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* #1: Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
            <Input
              placeholder="Cerca nel grafo…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-40 pl-7 pr-2 text-[10px] bg-slate-900/85 border-slate-700 text-slate-200 placeholder:text-slate-500 shadow-sm backdrop-blur-sm focus:w-56 transition-all"
            />
            {searchQuery && (
              <button
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Quick actions: Galassia ↔ Dettaglio toggle (singolo pulsante) */}
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 px-2.5 text-[10px] gap-1 backdrop-blur-sm shadow-sm border",
              viewMode === "detail"
                ? "bg-orange-500 text-white border-orange-400 hover:bg-orange-600"
                : "bg-slate-900/85 text-slate-200 border-slate-700 hover:bg-slate-800 hover:text-white",
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
          {/* Reset */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 bg-slate-900/85 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700 backdrop-blur-sm shadow-sm"
            onClick={resetView}
            title="Reset vista"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          {/* Fullscreen */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 bg-slate-900/85 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700 backdrop-blur-sm shadow-sm"
            onClick={toggleFullscreen}
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
                className="h-7 w-7 bg-slate-900/85 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700 backdrop-blur-sm shadow-sm"
                title="Opzioni avanzate"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-60 p-3 bg-slate-900/95 border-slate-700 text-slate-200 shadow-2xl"
            >
              <div className="space-y-3">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Colore nodi</p>
                  <div className="flex bg-slate-800 rounded-md border border-slate-700 overflow-hidden">
                    {(["cluster", "type", "heat"] as ColorMode[]).map((m) => (
                      <button
                        key={m}
                        className={cn(
                          "flex-1 h-7 text-[10px] flex items-center justify-center gap-1 transition-colors",
                          colorMode === m ? "bg-orange-500 text-white" : "text-slate-300 hover:bg-slate-700",
                          m !== "cluster" && "border-l border-slate-700",
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
                  <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Dimensione</p>
                  <div className="flex bg-slate-800 rounded-md border border-slate-700 overflow-hidden">
                    <button
                      className={cn(
                        "flex-1 h-7 text-[10px] transition-colors",
                        !is3D ? "bg-orange-500 text-white" : "text-slate-300 hover:bg-slate-700",
                      )}
                      onClick={() => setIs3D(false)}
                    >
                      2D
                    </button>
                    <button
                      className={cn(
                        "flex-1 h-7 text-[10px] transition-colors border-l border-slate-700",
                        is3D ? "bg-orange-500 text-white" : "text-slate-300 hover:bg-slate-700",
                      )}
                      onClick={() => setIs3D(true)}
                    >
                      3D
                    </button>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-700">
                  <button
                    className="w-full h-7 text-[10px] text-slate-300 hover:bg-slate-800 hover:text-white rounded-md flex items-center justify-center gap-1.5 transition-colors"
                    onClick={handleExport}
                  >
                    <Camera className="h-3 w-3" />
                    Esporta screenshot PNG
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
          <div className="bg-slate-900/85 backdrop-blur-sm rounded-full border border-slate-700 px-3 py-1 shadow-lg">
            <p className="text-[10px] text-slate-300 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-orange-400" />
              Click su una persona per esplorare le sue memorie
            </p>
          </div>
        </div>
      )}

      {/* ── Search results count ──────────────────────────────────────────── */}
      {searchSelections !== null && (
        <div className="absolute top-12 right-3 z-10 pointer-events-auto">
          <Badge className="bg-slate-900/85 text-slate-200 border-slate-700 backdrop-blur-sm shadow-lg text-[10px]">
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
            className="h-5 px-1.5 text-[9px] text-slate-500 hover:text-white"
            onClick={resetView}
          >
            Resetta
          </Button>
        </div>
      )}

      {/* ── #6: Insights panel ─────────────────────────────────────────────── */}
      <div className="absolute top-12 left-3 z-10 pointer-events-auto" style={{ marginTop: (filterPersona || filterType) ? 28 : 0 }}>
        <button
          className="flex items-center gap-1.5 text-[10px] text-slate-300 hover:text-white bg-slate-900/85 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-slate-700 shadow-sm transition-colors"
          onClick={() => setInsightsOpen(!insightsOpen)}
        >
          <Zap className="h-3 w-3 text-orange-400" />
          Insights
          {insightsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        {insightsOpen && (
          <div className="mt-1 bg-slate-900/95 backdrop-blur-md rounded-lg border border-slate-700 p-2.5 w-64 space-y-2.5 shadow-2xl">
            {/* Health */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Salute cervello</span>
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
              <p className="text-[9px] text-slate-600 mt-0.5">
                {insights.healthPct}% delle memorie usate almeno 1 volta
              </p>
            </div>

            {/* God nodes */}
            {insights.godNodes.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Nodi centrali</span>
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
                    <span className="text-slate-600 ml-auto shrink-0">{n.connections}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Bridges */}
            {insights.bridges.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Link2 className="h-3 w-3 text-orange-400" />
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Ponti tra personas</span>
                </div>
                {insights.bridges.map((b) => (
                  <button
                    key={b.id}
                    className="w-full text-left text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 truncate flex items-center gap-1.5"
                    onClick={() => graphRef.current?.centerGraph([b.id])}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                    <span className="truncate">{b.label}</span>
                    <span className="text-slate-600 ml-auto shrink-0">{b.personasLinked.length}p</span>
                  </button>
                ))}
              </div>
            )}

            {/* Orphans */}
            {insights.orphans.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Ghost className="h-3 w-3 text-slate-500" />
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Orfane (isolate)</span>
                </div>
                {insights.orphans.slice(0, 3).map((o) => (
                  <button
                    key={o.id}
                    className="w-full text-left text-[10px] text-slate-500 hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-800 truncate flex items-center gap-1.5"
                    onClick={() => graphRef.current?.centerGraph([o.id])}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
                    <span className="truncate">{o.label}</span>
                  </button>
                ))}
                {insights.orphans.length > 3 && (
                  <p className="text-[9px] text-slate-600 px-1.5">+{insights.orphans.length - 3} altre</p>
                )}
              </div>
            )}

            {/* Cross-links total */}
            {insights.totalCrossLinks > 0 && (
              <div className="pt-1 border-t border-slate-700">
                <p className="text-[9px] text-slate-500">
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
        <div className="bg-slate-900/85 backdrop-blur-sm rounded-lg p-2 border border-slate-700 shadow-lg">
          <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1.5 font-semibold">
            {colorMode === "heat"
              ? "Attività (dormiente → attiva)"
              : colorMode === "type"
              ? "Tipo memoria"
              : "Cluster (per persona)"}
          </p>
          {colorMode === "heat" ? (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-slate-400">Dormiente</span>
              <div className="flex-1 h-2 rounded-full" style={{
                background: "linear-gradient(to right, #3b82f6, #06b6d4, #fbbf24, #f97316, #ef4444)",
              }} />
              <span className="text-[9px] text-slate-400">Attiva</span>
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
                const personasInCat = personas.filter((p) => p.category === cat);
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
          <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-700">
            <span className="h-[2px] w-4 bg-orange-400/60" />
            <span className="text-[9px] text-slate-400">Connessione cross-persona</span>
          </div>
        </div>
      </div>

      {/* ── #7: Edge tooltip ───────────────────────────────────────────────── */}
      {hoveredEdge && (
        <div
          className="fixed z-50 bg-slate-900/95 backdrop-blur-md rounded-lg border border-slate-700 px-3 py-2 shadow-2xl pointer-events-none"
          style={{
            left: hoveredEdge.x + 12,
            top: hoveredEdge.y - 10,
            maxWidth: 220,
          }}
        >
          <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 font-semibold">Keyword condivise</p>
          <div className="flex flex-wrap gap-1">
            {(edgeKeywords.get(hoveredEdge.id) ?? []).map((kw) => (
              <Badge key={kw} className="text-[9px] h-4 px-1.5 bg-orange-100 text-orange-700 border-orange-300">
                {kw}
              </Badge>
            ))}
            {(edgeKeywords.get(hoveredEdge.id) ?? []).length === 0 && (
              <span className="text-[10px] text-slate-500">overlap semantico</span>
            )}
          </div>
        </div>
      )}

      {/* ── Detail panel ───────────────────────────────────────────────────── */}
      {selectedNode && (
        <div className="absolute bottom-3 right-3 z-10 w-72 bg-slate-900/95 backdrop-blur-md rounded-lg border border-slate-700 p-3 pointer-events-auto shadow-2xl">
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
                      <div className="mt-2 pt-2 border-t border-slate-700">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Connessa con</p>
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
                    <span className="text-[10px] text-slate-500">
                      {selectedNode.data.personaName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-100 leading-relaxed mt-1">
                    {selectedNode.data.memory.content}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
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
              className="h-6 w-6 shrink-0 text-slate-500 hover:text-white"
              onClick={() => setSelectedNode(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Graph canvas ───────────────────────────────────────────────────── */}
      {/* Canvas WebGL — z-index above starfield, nessun filter per nitidezza max */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
      <GraphCanvas
        ref={graphRef}
        nodes={nodes}
        edges={edges}
        theme={BRAIN_THEME}
        glOptions={{ alpha: true, antialias: true }}
        layoutType={is3D ? "forceDirected3d" : "forceDirected2d"}
        clusterAttribute={
          viewMode === "galaxy" && expandedPersonas.size === 0 ? undefined : "cluster"
        }
        layoutOverrides={{
          // Galaxy pure: forze ridotte → fx/fy comandano (cerchio perfetto)
          // Detail/expanded: forze normali per layout dinamico
          clusterStrength: viewMode === "galaxy" && expandedPersonas.size === 0 ? 0 : 2.0,
          nodeStrength: viewMode === "galaxy" && expandedPersonas.size === 0 ? -50 : -400,
          linkDistance: viewMode === "galaxy" && expandedPersonas.size === 0 ? 200 : 80,
          linkStrengthIntraCluster: 0.7,
          linkStrengthInterCluster: viewMode === "galaxy" && expandedPersonas.size === 0 ? 0 : 0.02,
        }}
        sizingType="attribute"
        sizingAttribute="size"
        defaultNodeSize={4}
        minNodeSize={2}
        maxNodeSize={10}
        animated
        draggable
        labelType="nodes"
        edgeInterpolation="curved"
        edgeArrowPosition="none"
        clusterAttribute="cluster"
        selections={selections}
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
