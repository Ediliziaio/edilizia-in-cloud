/**
 * BrainSemanticSearch — input di ricerca semantica del Cervello AI.
 *
 * Cerca tra:
 *   • Display name delle personas
 *   • Content delle memorie
 *   • Tipo memoria (fact/preference/decision/pattern/avoid)
 *
 * Output: dropdown con risultati raggruppati per persona, ognuno
 * cliccabile per centrare il grafo + aprire il detail panel.
 *
 * Logica di ranking semplice ma efficace:
 *   • Match esatto su keyword + early position → score 100
 *   • Match nel content (substring) → score 70
 *   • Match nel nome persona → score 50
 *   • Match nel tipo memoria → score 30
 *   • Bonus +20 se la memoria ha alti hits_count
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { Search, X, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchMemory {
  id: string;
  persona_key: string;
  content: string;
  memory_type: string;
  hits_count: number | null;
  enabled: boolean;
}

interface SearchPersona {
  persona_key: string;
  display_name: string;
  category: string;
}

interface SearchResult {
  type: "memory" | "persona";
  id: string;          // node id (m_xxx or p_xxx)
  title: string;
  subtitle: string;
  score: number;
  category?: string;
  memory?: SearchMemory;
  persona?: SearchPersona;
}

interface Props {
  memories: SearchMemory[];
  personas: SearchPersona[];
  onSelect: (nodeId: string) => void;
  /** Map category → emoji (passed in from parent) */
  categoryEmoji: Record<string, string>;
  /** Map memory_type → label */
  typeLabels: Record<string, string>;
  /** Map memory_type → color */
  typeColors: Record<string, string>;
  className?: string;
}

const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 8;

export function BrainSemanticSearch({
  memories,
  personas,
  onSelect,
  categoryEmoji,
  typeLabels,
  typeColors,
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const personaMap = useMemo(
    () => new Map(personas.map((p) => [p.persona_key, p])),
    [personas],
  );

  const memoryCountsByPersona = useMemo(() => {
    const counts = new Map<string, number>();
    for (const memory of memories) {
      if (!memory.enabled) continue;
      counts.set(memory.persona_key, (counts.get(memory.persona_key) ?? 0) + 1);
    }
    return counts;
  }, [memories]);

  const searchableMemories = useMemo(() => memories
    .filter((memory) => memory.enabled)
    .map((memory) => {
      const persona = personaMap.get(memory.persona_key);
      return {
        memory,
        persona,
        contentLower: memory.content.toLowerCase(),
        personaNameLower: persona?.display_name.toLowerCase() ?? "",
        typeNameLower: (typeLabels[memory.memory_type] ?? "").toLowerCase(),
      };
    }), [memories, personaMap, typeLabels]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < MIN_QUERY_LEN) return [];
    const qWords = q.split(/\s+/).filter((w) => w.length >= 3);

    const scored: SearchResult[] = [];

    // Score memorie
    for (const item of searchableMemories) {
      const { memory: m, persona, contentLower, personaNameLower, typeNameLower } = item;
      let score = 0;

      // Match early in content
      const pos = contentLower.indexOf(q);
      if (pos >= 0) {
        score += pos === 0 ? 100 : 70 - Math.min(pos, 30);
      }
      // Word-level match
      let wordMatches = 0;
      for (const w of qWords) {
        if (contentLower.includes(w)) wordMatches++;
      }
      score += wordMatches * 15;
      // Persona name match
      if (personaNameLower.includes(q)) score += 50;
      // Type match
      if (typeNameLower.includes(q)) score += 30;
      // Hit bonus (popolari pesano di più)
      score += Math.min(20, (m.hits_count ?? 0));

      if (score > 0) {
        scored.push({
          type: "memory",
          id: `m_${m.id}`,
          title: m.content,
          subtitle: persona?.display_name ?? m.persona_key,
          score,
          category: persona?.category,
          memory: m,
          persona: persona ?? undefined,
        });
      }
    }

    // Score personas
    for (const p of personas) {
      const name = p.display_name.toLowerCase();
      const cat = p.category.toLowerCase();
      let score = 0;
      if (name === q) score += 100;
      else if (name.startsWith(q)) score += 80;
      else if (name.includes(q)) score += 60;
      if (cat.includes(q)) score += 30;
      if (score > 0) {
        const memCount = memoryCountsByPersona.get(p.persona_key) ?? 0;
        scored.push({
          type: "persona",
          id: `p_${p.persona_key}`,
          title: p.display_name,
          subtitle: `${memCount} memorie · ${p.category}`,
          score,
          category: p.category,
          persona: p,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS);
  }, [query, personas, searchableMemories, memoryCountsByPersona]);

  // Open when typing, close on click outside
  useEffect(() => {
    if (query.trim().length >= MIN_QUERY_LEN) setOpen(true);
    else setOpen(false);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handlePick = (r: SearchResult) => {
    onSelect(r.id);
    setOpen(false);
    inputRef.current?.blur();
  };

  /** Highlight della keyword nel testo (substring case-insensitive) */
  const highlight = (text: string, q: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-orange-500/30 text-orange-200 rounded px-0.5">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-300 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder={focused ? "es. Bianchi, fatture, ritardo…" : "Chiedi al cervello…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setQuery(""); inputRef.current?.blur(); }
            if (e.key === "Enter" && results[0]) { handlePick(results[0]); }
          }}
          className={cn(
            "h-7 pl-7 pr-7 text-[10px] bg-slate-900/95 border border-slate-600 text-slate-200 placeholder:text-slate-300 backdrop-blur-sm shadow-sm rounded-md outline-none transition-all",
            focused ? "w-60" : "w-44",
            results.length > 0 && open && "rounded-b-none",
          )}
        />
        {query && (
          <button
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white"
            onClick={() => setQuery("")}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Dropdown risultati */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-0 bg-slate-900/98 border border-slate-600 border-t-transparent rounded-b-md shadow-2xl backdrop-blur-md max-h-80 overflow-y-auto">
          <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-slate-300 font-semibold border-b border-slate-700 bg-slate-800/50 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-orange-400" />
            {results.length} risultat{results.length === 1 ? "o trovato" : "i trovati"}
          </div>
          {results.map((r) => {
            const emoji = r.category ? (categoryEmoji[r.category] ?? "⚡") : "💾";
            const typeColor = r.memory?.memory_type ? typeColors[r.memory.memory_type] : "#94a3b8";
            return (
              <button
                key={r.id}
                onClick={() => handlePick(r)}
                className="w-full text-left px-2 py-1.5 hover:bg-slate-800 transition-colors flex items-start gap-2 group border-b border-slate-800 last:border-b-0"
                type="button"
              >
                <span className="text-base shrink-0 mt-0.5 leading-none">{emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-white truncate">
                      {highlight(r.title.length > 80 ? r.title.slice(0, 77) + "…" : r.title, query)}
                    </span>
                    {r.type === "memory" && r.memory?.memory_type && (
                      <span
                        className="text-[8px] uppercase font-bold tracking-wider shrink-0 px-1 py-0 rounded border"
                        style={{
                          backgroundColor: `${typeColor}20`,
                          color: typeColor,
                          borderColor: `${typeColor}50`,
                        }}
                      >
                        {typeLabels[r.memory.memory_type] ?? r.memory.memory_type}
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-300 mt-0.5 truncate">{r.subtitle}</div>
                </div>
                <ArrowRight className="h-3 w-3 text-slate-500 group-hover:text-orange-400 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
