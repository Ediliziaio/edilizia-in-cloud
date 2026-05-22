/**
 * BrainPersonaSheet — modale fullscreen per scheda persona AI.
 *
 * Mostra tutte le informazioni dettagliate di una persona quando l'utente
 * clicca "Scheda completa" nel detail panel del grafo.
 *
 * Sezioni:
 *   • Header con avatar emoji + nome + categoria + memorie totali
 *   • Tab Memorie: lista completa con filtro per tipo
 *   • Tab Connessioni: tabella delle altre personas collegate
 *   • Tab Stats: donut + sparkline + heatmap (riutilizza BrainPersonaStats)
 */

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link2, Sparkles, Activity } from "lucide-react";
import { BrainPersonaStats } from "./BrainPersonaStats";

interface MemoryRow {
  id: string;
  persona_key: string;
  content: string;
  memory_type: string;
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
}

interface Props {
  open: boolean;
  onClose: () => void;
  persona: PersonaLite | null;
  emoji: string;
  color: string;
  memories: MemoryRow[];
  allPersonas: PersonaLite[];
  crossPersonaLinks: Map<string, Map<string, number>>;
  typeColors: Record<string, string>;
  typeLabels: Record<string, string>;
}

export function BrainPersonaSheet({
  open,
  onClose,
  persona,
  emoji,
  color,
  memories,
  allPersonas,
  crossPersonaLinks,
  typeColors,
  typeLabels,
}: Props) {
  const [filterType, setFilterType] = useState<string | null>(null);

  const personaMemories = useMemo(
    () => persona ? memories.filter((m) => m.persona_key === persona.persona_key && m.enabled) : [],
    [memories, persona],
  );

  const filteredMems = useMemo(
    () => filterType ? personaMemories.filter((m) => m.memory_type === filterType) : personaMemories,
    [personaMemories, filterType],
  );

  // Connessioni cross-persona di questa persona
  const connections = useMemo(() => {
    if (!persona) return [];
    const list: Array<{ name: string; count: number; category: string }> = [];
    const pk = persona.persona_key;
    for (const [pA, targets] of crossPersonaLinks) {
      if (pA === pk) {
        for (const [pB, count] of targets) {
          const p = allPersonas.find((pp) => pp.persona_key === pB);
          list.push({ name: p?.display_name ?? pB, count, category: p?.category ?? "" });
        }
      }
      for (const [pB, count] of (crossPersonaLinks.get(pA) ?? new Map())) {
        if (pB === pk && pA !== pk) {
          const p = allPersonas.find((pp) => pp.persona_key === pA);
          if (!list.find((l) => l.name === p?.display_name)) {
            list.push({ name: p?.display_name ?? pA, count, category: p?.category ?? "" });
          }
        }
      }
    }
    return list.sort((a, b) => b.count - a.count);
  }, [persona, crossPersonaLinks, allPersonas]);

  if (!persona) return null;

  // Conteggio per tipo
  const byType = personaMemories.reduce<Record<string, number>>((acc, m) => {
    acc[m.memory_type] = (acc[m.memory_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 overflow-y-auto bg-slate-50">
        {/* Header con gradient */}
        <div
          className="p-6 pb-4 text-white"
          style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` }}
        >
          <SheetHeader className="text-left">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-xl bg-white/25 backdrop-blur-sm flex items-center justify-center text-2xl shadow-lg shrink-0">
                {emoji}
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-xl font-bold text-white">{persona.display_name}</SheetTitle>
                <p className="text-xs text-white/80 mt-0.5 capitalize">
                  {persona.category} · {personaMemories.length} memorie · {connections.length} connessioni
                </p>
              </div>
            </div>
          </SheetHeader>
        </div>

        {/* Tab interface */}
        <Tabs defaultValue="memorie" className="px-4 mt-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="memorie" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Memorie ({personaMemories.length})
            </TabsTrigger>
            <TabsTrigger value="connessioni" className="gap-1.5 text-xs">
              <Link2 className="h-3.5 w-3.5" />
              Connessioni ({connections.length})
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />
              Statistiche
            </TabsTrigger>
          </TabsList>

          {/* TAB MEMORIE */}
          <TabsContent value="memorie" className="mt-3 space-y-2 pb-6">
            {/* Filter chips per tipo */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                onClick={() => setFilterType(null)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-md border transition-colors",
                  filterType === null
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100",
                )}
              >
                Tutti ({personaMemories.length})
              </button>
              {Object.entries(byType).map(([type, count]) => {
                const c = typeColors[type] ?? "#94a3b8";
                const active = filterType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setFilterType(active ? null : type)}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md border transition-colors flex items-center gap-1",
                      active && "ring-2 ring-offset-1",
                    )}
                    style={{
                      backgroundColor: active ? `${c}20` : "white",
                      color: c,
                      borderColor: `${c}50`,
                      ...(active ? { boxShadow: `0 0 0 2px ${c}40` } : {}),
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
                    {typeLabels[type] ?? type} ({count})
                  </button>
                );
              })}
            </div>

            {/* Lista memorie */}
            {filteredMems.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Nessuna memoria per questo filtro.</p>
            ) : (
              filteredMems
                .sort((a, b) => (b.hits_count ?? 0) - (a.hits_count ?? 0))
                .map((m) => {
                  const c = typeColors[m.memory_type] ?? "#94a3b8";
                  return (
                    <div key={m.id} className="bg-white rounded-lg border border-slate-200 p-3 hover:border-slate-300 transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 px-1.5 font-semibold border"
                          style={{
                            backgroundColor: `${c}15`,
                            color: c,
                            borderColor: `${c}50`,
                          }}
                        >
                          {typeLabels[m.memory_type] ?? m.memory_type}
                        </Badge>
                        <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                          <span>{m.hits_count ?? 0} hits</span>
                          <span className="text-slate-300">·</span>
                          <span>Conf {((m.confidence ?? 1) * 100).toFixed(0)}%</span>
                          <span className="text-slate-300">·</span>
                          <span>{new Date(m.created_at).toLocaleDateString("it-IT")}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{m.content}</p>
                    </div>
                  );
                })
            )}
          </TabsContent>

          {/* TAB CONNESSIONI */}
          <TabsContent value="connessioni" className="mt-3 pb-6">
            {connections.length === 0 ? (
              <div className="text-center py-10">
                <Link2 className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-600 font-medium">Nessuna connessione cross-persona</p>
                <p className="text-xs text-slate-400 mt-1">
                  {persona.display_name} non condivide memorie con altre personas.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-500 mb-2">
                  Personas che condividono memorie con <strong className="text-slate-700">{persona.display_name}</strong>:
                </p>
                {connections.map((c) => (
                  <div key={c.name} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.name}</p>
                      <p className="text-[10px] text-slate-500 capitalize">{c.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-orange-600 tabular-nums leading-tight">{c.count}</p>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                        {c.count === 1 ? "memoria comune" : "memorie comuni"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* TAB STATS (riutilizza BrainPersonaStats con dark adaptation) */}
          <TabsContent value="stats" className="mt-3 pb-6">
            <div className="bg-slate-900 rounded-xl p-4">
              <BrainPersonaStats
                memories={personaMemories}
                typeColors={typeColors}
                typeLabels={typeLabels}
              />
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
