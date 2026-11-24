/**
 * BrainInsightFeed — feed rotante di insight per AIBrainGraph.
 *
 * Mostra 4-6 storie diverse che ruotano automaticamente ogni 6 secondi
 * con fade in/out. Tipi di insight calcolati runtime dai dati reali.
 *
 * Layout: card compatto, gradiente arancio sottile, icona, titolo
 * uppercase, frase narrativa. Tappabile per skippare alla successiva.
 */

import { useState, useEffect, useMemo } from "react";
import { Sparkles, Flame, Link2, TrendingUp, Brain, Activity, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface InsightStory {
  id: string;
  icon: typeof Sparkles;
  title: string;
  text: string;
  accent: string;       // tailwind color class for icon
}

interface MemoryLite {
  persona_key: string;
  content: string;
  hits_count: number | null;
  enabled: boolean;
  created_at: string;
  memory_type: string;
}

interface PersonaLite {
  persona_key: string;
  display_name: string;
  category: string;
}

interface Props {
  memories: MemoryLite[];
  personas: PersonaLite[];
  crossPersonaLinks: Map<string, Map<string, number>>;
  totalCrossPersonaLinks: number;
  healthPct: number;
  recentEventsCount: number;  // realtime activity counter
}

const ROTATE_INTERVAL_MS = 6000;

export function BrainInsightFeed({
  memories,
  personas,
  crossPersonaLinks,
  totalCrossPersonaLinks,
  healthPct,
  recentEventsCount,
}: Props) {
  const t = useT();
  const stories = useMemo<InsightStory[]>(() => {
    const list: InsightStory[] = [];
    const enabledMems = memories.filter((m) => m.enabled);
    const personaMap = new Map(personas.map((p) => [p.persona_key, p.display_name]));

    // 1. Asse cross-persona più forte
    let topPair: { pA: string; pB: string; count: number } | null = null;
    for (const [pA, targets] of crossPersonaLinks) {
      for (const [pB, count] of targets) {
        if (!topPair || count > topPair.count) topPair = { pA, pB, count };
      }
    }
    if (topPair && topPair.count >= 2) {
      list.push({
        id: "axis",
        icon: Link2,
        accent: "text-orange-500",
        title: t("Asse di conoscenza più forte"),
        text: t("{nomeA} ↔ {nomeB} condividono {n} memorie. Pensano \"alla stessa cosa\".", { nomeA: String(personaMap.get(topPair.pA) ?? topPair.pA), nomeB: String(personaMap.get(topPair.pB) ?? topPair.pB), n: topPair.count }),
      });
    }

    // 2. Memoria più usata
    const sortedByHits = [...enabledMems].sort((a, b) => (b.hits_count ?? 0) - (a.hits_count ?? 0));
    if (sortedByHits.length > 0 && (sortedByHits[0].hits_count ?? 0) > 0) {
      const top = sortedByHits[0];
      const personaName = personaMap.get(top.persona_key) ?? top.persona_key;
      const preview = top.content.length > 80 ? top.content.slice(0, 77) + "…" : top.content;
      list.push({
        id: "hot-memory",
        icon: Flame,
        accent: "text-rose-500",
        title: t("Memoria più richiamata"),
        text: t("{persona}: \"{anteprima}\" — {n} richiami totali.", { persona: String(personaName), anteprima: preview, n: top.hits_count ?? 0 }),
      });
    }

    // 3. Memoria più recente
    const sortedByDate = [...enabledMems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    if (sortedByDate.length > 0) {
      const top = sortedByDate[0];
      const personaName = personaMap.get(top.persona_key) ?? top.persona_key;
      const preview = top.content.length > 70 ? top.content.slice(0, 67) + "…" : top.content;
      const days = Math.max(0, Math.floor((Date.now() - new Date(top.created_at).getTime()) / (1000 * 60 * 60 * 24)));
      const when = days === 0 ? t("oggi") : days === 1 ? t("ieri") : t("{n} giorni fa", { n: days });
      list.push({
        id: "fresh",
        icon: Sparkles,
        accent: "text-emerald-500",
        title: t("Ultima memoria creata"),
        text: t("{quando}, {persona} ha imparato: \"{anteprima}\".", { quando: when, persona: String(personaName), anteprima: preview }),
      });
    }

    // 4. Distribuzione personas
    const perPersona = new Map<string, number>();
    for (const m of enabledMems) perPersona.set(m.persona_key, (perPersona.get(m.persona_key) ?? 0) + 1);
    if (perPersona.size > 0) {
      const sorted = [...perPersona.entries()].sort((a, b) => b[1] - a[1]);
      const topPersona = sorted[0];
      const topName = personaMap.get(topPersona[0]) ?? topPersona[0];
      list.push({
        id: "distribution",
        icon: TrendingUp,
        accent: "text-blue-500",
        title: t("Persona più informata"),
        text: t("{nome} ha {n} memorie attive — è il \"cervello\" più ricco della squadra.", { nome: String(topName), n: topPersona[1] }),
      });
    }

    // 5. Cross-team totale
    if (totalCrossPersonaLinks >= 3) {
      list.push({
        id: "cross-total",
        icon: Brain,
        accent: "text-violet-500",
        title: t("Rete neurale aziendale"),
        text: t("{n} ponti collegano le tue personas. Il cervello AI pensa trasversalmente, non a silos.", { n: totalCrossPersonaLinks }),
      });
    }

    // 6. Health score
    list.push({
      id: "health",
      icon: Activity,
      accent: healthPct >= 70 ? "text-emerald-500" : healthPct >= 40 ? "text-amber-500" : "text-rose-500",
      title: t("Salute del cervello"),
      text: healthPct >= 70
        ? t("{pct}% delle memorie sono attive. Il sistema impara e ricorda bene.", { pct: healthPct })
        : healthPct >= 40
        ? t("{pct}% delle memorie sono attive. Spazio di miglioramento — usa di più le AI Personas.", { pct: healthPct })
        : t("Solo {pct}% delle memorie attive. Le AI hanno bisogno di più conversazioni.", { pct: healthPct }),
    });

    // 7. Real-time activity (if events)
    if (recentEventsCount > 0) {
      list.push({
        id: "live",
        icon: Activity,
        accent: "text-emerald-500",
        title: t("Attività live"),
        text: t(recentEventsCount === 1 ? "{n} evento di apprendimento registrato in questa sessione. Il cervello sta imparando ora." : "{n} eventi di apprendimento registrati in questa sessione. Il cervello sta imparando ora.", { n: recentEventsCount }),
      });
    }

    return list;
  }, [memories, personas, crossPersonaLinks, totalCrossPersonaLinks, healthPct, recentEventsCount, t]);

  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);

  // Rotate automatically
  useEffect(() => {
    if (stories.length <= 1) return;
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIdx((i) => (i + 1) % stories.length);
        setFading(false);
      }, 300);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [stories.length]);

  // Reset idx if it goes out of bounds (story list shrinks)
  useEffect(() => {
    if (idx >= stories.length && stories.length > 0) setIdx(0);
  }, [idx, stories.length]);

  if (stories.length === 0) return null;

  const current = stories[idx];
  if (!current) return null;
  const Icon = current.icon;

  const goNext = () => {
    setFading(true);
    setTimeout(() => {
      setIdx((i) => (i + 1) % stories.length);
      setFading(false);
    }, 200);
  };

  return (
    <button
      onClick={goNext}
      className="group w-full text-left rounded-lg bg-white/70 border border-orange-200/60 px-3 py-2 backdrop-blur-sm hover:bg-white/90 transition-colors cursor-pointer flex items-start gap-2"
      title={t("Click per il prossimo insight")}
    >
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5 transition-transform group-hover:scale-110", current.accent)} />
      <div className={cn("min-w-0 flex-1 transition-opacity duration-300", fading ? "opacity-0" : "opacity-100")}>
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-orange-700 font-semibold leading-tight truncate">
            {current.title}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            {stories.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 w-1 rounded-full transition-all",
                  i === idx ? "bg-orange-500 w-2" : "bg-orange-200",
                )}
              />
            ))}
          </div>
        </div>
        <p className="text-[11px] text-slate-700 leading-snug mt-0.5 line-clamp-2">{current.text}</p>
      </div>
      <ChevronRight className="h-3 w-3 text-orange-400 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
