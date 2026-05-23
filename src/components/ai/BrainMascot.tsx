/**
 * BrainMascot — piccola mascotte conversazionale in basso a destra.
 *
 * Mostra suggerimenti contestuali basati sullo stato del cervello:
 *   • "Oggi ho imparato X cose nuove"
 *   • "Conosco Bianchi Srl meglio di tutti — 4 personas lo ricordano"
 *   • "PM Cantiere è dormiente da 14 giorni"
 *
 * Cambia messaggio ogni 8 secondi. Cliccabile per skip al successivo.
 * Closeable con X (persiste in sessionStorage — riappare al reload).
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { Brain, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoryLite {
  id: string;
  persona_key: string;
  content: string;
  hits_count: number | null;
  enabled: boolean;
  created_at: string;
}

interface PersonaLite {
  persona_key: string;
  display_name: string;
  category: string;
}

interface Message {
  emoji: string;
  text: string;
  nodeId?: string; // se cliccabile → centra su questo nodo
}

interface Props {
  memories: MemoryLite[];
  personas: PersonaLite[];
  crossPersonaLinks: Map<string, Map<string, number>>;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
}

const STORAGE_KEY = "eic_brain_mascot_dismissed_session";
const ROTATE_MS = 8000;

export function BrainMascot({ memories, personas, crossPersonaLinks, onNodeClick, className }: Props) {
  // Auto-genera 3-5 messaggi rilevanti
  const messages = useMemo<Message[]>(() => {
    const list: Message[] = [];
    const enabledMems = memories.filter((m) => m.enabled);
    const personaMap = new Map(personas.map((p) => [p.persona_key, p]));

    // Memorie create oggi
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = enabledMems.filter((m) => new Date(m.created_at) >= todayStart).length;
    if (todayCount > 0) {
      list.push({
        emoji: "✨",
        text: `Oggi ho imparato ${todayCount} ${todayCount === 1 ? "cosa nuova" : "cose nuove"}!`,
      });
    }

    // Asse cross-persona più forte
    let topPair: { pA: string; pB: string; count: number } | null = null;
    for (const [pA, targets] of crossPersonaLinks) {
      for (const [pB, count] of targets) {
        if (!topPair || count > topPair.count) topPair = { pA, pB, count };
      }
    }
    if (topPair && topPair.count >= 3) {
      const nameA = personaMap.get(topPair.pA)?.display_name ?? topPair.pA;
      const nameB = personaMap.get(topPair.pB)?.display_name ?? topPair.pB;
      list.push({
        emoji: "🔗",
        text: `${nameA} e ${nameB} pensano sempre alle stesse cose — ${topPair.count} memorie comuni.`,
      });
    }

    // Memoria più richiamata
    const sortedByHits = [...enabledMems].sort((a, b) => (b.hits_count ?? 0) - (a.hits_count ?? 0));
    if (sortedByHits.length > 0 && (sortedByHits[0].hits_count ?? 0) >= 10) {
      const top = sortedByHits[0];
      const persona = personaMap.get(top.persona_key)?.display_name ?? top.persona_key;
      const preview = top.content.length > 60 ? top.content.slice(0, 57) + "…" : top.content;
      list.push({
        emoji: "🔥",
        text: `Questa la chiediamo sempre — ${persona}: "${preview}"`,
        nodeId: `m_${top.id}`,
      });
    }

    // Persona dormiente (nessuna memoria creata negli ultimi 14 giorni)
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const lastByPersona = new Map<string, number>();
    for (const m of enabledMems) {
      const t = new Date(m.created_at).getTime();
      lastByPersona.set(m.persona_key, Math.max(lastByPersona.get(m.persona_key) ?? 0, t));
    }
    for (const p of personas) {
      const last = lastByPersona.get(p.persona_key);
      if (last && (now - last) > 14 * dayMs) {
        const days = Math.floor((now - last) / dayMs);
        list.push({
          emoji: "💤",
          text: `${p.display_name} è dormiente da ${days} giorni. Vuoi parlarci?`,
          nodeId: `p_${p.persona_key}`,
        });
        break; // un solo dormiente alla volta
      }
    }

    // Cervello in costruzione
    if (enabledMems.length < 10) {
      list.push({
        emoji: "🧠",
        text: `Ho solo ${enabledMems.length} memorie. Parlami di più nella tab Chat — imparerò!`,
      });
    } else {
      // Insight: distribuzione personas
      const activePerPersona = new Set(enabledMems.map((m) => m.persona_key));
      if (activePerPersona.size >= 5) {
        list.push({
          emoji: "🌐",
          text: `Conosco ${activePerPersona.size} reparti diversi della tua azienda. Sono "in rete".`,
        });
      }
    }

    return list;
  }, [memories, personas, crossPersonaLinks]);

  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [fade, setFade] = useState(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sessione: se chiuso, rimane chiuso fino a reload
  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") setDismissed(true);
    } catch { /* ignore */ }
  }, []);

  // Rotate ogni N secondi
  useEffect(() => {
    if (dismissed || messages.length <= 1) return;
    const t = setInterval(() => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      setFade(true);
      fadeTimeoutRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % messages.length);
        setFade(false);
      }, 250);
    }, ROTATE_MS);
    return () => {
      clearInterval(t);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [dismissed, messages.length]);

  useEffect(() => {
    if (idx >= messages.length) setIdx(0);
  }, [idx, messages.length]);

  if (dismissed || messages.length === 0) return null;
  const msg = messages[idx];
  if (!msg) return null;

  const handleClose = () => {
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  const handleClick = () => {
    if (msg.nodeId && onNodeClick) {
      onNodeClick(msg.nodeId);
    } else {
      // Skip al messaggio successivo
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      setFade(true);
      fadeTimeoutRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % messages.length);
        setFade(false);
      }, 150);
    }
  };

  return (
    <div className={cn("absolute bottom-3 right-3 z-30 max-w-xs pointer-events-auto animate-in slide-in-from-bottom-2 fade-in duration-500", className)}>
      <div
        className={cn(
          "group relative bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl shadow-2xl shadow-orange-500/20 p-3 pr-7 cursor-pointer transition-all hover:shadow-orange-500/40 hover:scale-[1.02]",
          fade && "opacity-0",
        )}
        onClick={handleClick}
      >
        {/* Coda fumetto */}
        <div className="absolute -bottom-1.5 right-5 w-3 h-3 bg-gradient-to-br from-orange-500 to-amber-500 transform rotate-45" />

        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          className="absolute top-1.5 right-1.5 text-white/60 hover:text-white transition-colors"
          aria-label="Chiudi"
        >
          <X className="h-3 w-3" />
        </button>

        <div className="flex items-start gap-2">
          {/* Avatar mascot */}
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-base shadow-inner">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[9px] uppercase tracking-wider text-white/80 font-semibold">Il tuo cervello dice</span>
              <span className="text-[10px]">{msg.emoji}</span>
            </div>
            <p className={cn(
              "text-[11px] text-white leading-snug transition-opacity duration-200 line-clamp-3",
              fade && "opacity-0",
            )}>
              {msg.text}
            </p>
            {msg.nodeId && (
              <div className="flex items-center gap-0.5 mt-1 text-[9px] text-white/80 group-hover:text-white">
                <span>Click per vedere</span>
                <ArrowRight className="h-2.5 w-2.5" />
              </div>
            )}
          </div>
        </div>

        {/* Dots indicator */}
        {messages.length > 1 && (
          <div className="flex items-center gap-0.5 mt-2 justify-end">
            {messages.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 rounded-full transition-all",
                  i === idx ? "bg-white w-3" : "bg-white/40 w-1",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
