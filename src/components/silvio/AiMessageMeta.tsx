/**
 * AiMessageMeta — banner/badge/chip che vivono SOPRA o SOTTO il content
 * dei messaggi AI nella chat. Sintetizza i metadata MP-03/04/09:
 *
 *   • [Top] banner "Richiede review umana" se requires_human_review=true
 *   • [Top] badge "Confidence bassa" se ai_confidence='low'
 *   • [Top] badge "Analisi multi-area" se council_data.is_multi_area
 *   • [Bottom] CouncilExpandable: card collassabili con sub_outputs delle aree
 *   • [Bottom] FollowupChips: max 3 chip cliccabili → richiamano onAskFollowup
 *
 * Tutto opzionale. Se i metadata sono null/undefined il componente non
 * rende nulla. Mai degrada la chat se mancano dati.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Brain, ChevronDown, Sparkles, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChatMarkdown, type ChatMarkdownSource } from "@/components/ui/ChatMarkdown";

export interface CouncilSubOutput {
  area: string;
  persona_key: string;
  sub_query: string;
  why?: string;
  response: string | null;
  rag_sources?: ChatMarkdownSource[];
  confidence?: string | null;
  error?: string;
  duration_ms?: number;
}

export interface CouncilData {
  is_multi_area: boolean;
  involved_personas?: string[];
  involved_areas?: string[];
  estimated_complexity?: "simple" | "medium" | "complex";
  sub_outputs?: CouncilSubOutput[];
  synthesis_used?: boolean;
}

export interface AiMeta {
  ai_confidence?: "high" | "medium" | "low" | null;
  ai_requires_human_review?: boolean | null;
  followup_suggestions?: string[] | null;
  council_data?: CouncilData | null;
}

const PERSONA_LABELS: Record<string, string> = {
  silvio: "Silvio",
  cfo: "CFO",
  commercialista: "Commercialista",
  controller: "Controller",
  legale: "Legale",
  tecnico: "Tecnico",
  pm_cantiere: "PM Cantiere",
  capocantiere: "Capocantiere",
  hr: "HR",
  sales: "Sales",
  direttore_vendite: "Direttore Vendite",
  direttore_marketing: "Direttore Marketing",
  amministrazione: "Amministrazione",
  acquisti: "Acquisti",
  compliance: "Compliance",
  cliente_tutor: "Cliente Tutor",
  assistente_cliente: "Assistente Cliente",
  assistente_imprenditore: "Assistente Imprenditore",
  brain: "Brain Aziendale",
};

const AREA_EMOJI: Record<string, string> = {
  finance: "💰",
  operations: "🏗️",
  sales: "🎯",
  marketing: "📣",
  hr: "👥",
  compliance: "🛡️",
  fiscal: "🧾",
  client: "🤝",
  tech: "💻",
  strategic: "🧠",
};

const AREA_LABELS: Record<string, string> = {
  finance: "Finanza",
  operations: "Operatività",
  sales: "Vendite",
  marketing: "Marketing",
  hr: "Personale",
  compliance: "Compliance",
  fiscal: "Fiscale",
  client: "Clienti",
  tech: "Tecnologia",
  strategic: "Strategia",
};

export function AiMessageMetaTop({ meta }: { meta?: AiMeta }) {
  if (!meta) return null;
  const showReview = meta.ai_requires_human_review === true;
  const showLowConf = meta.ai_confidence === "low";
  const showCouncil = meta.council_data?.is_multi_area === true;
  const councilAreasCount = meta.council_data?.sub_outputs?.length
    ?? meta.council_data?.involved_areas?.length
    ?? 0;

  if (!showReview && !showLowConf && !showCouncil) return null;

  return (
    <div className="mb-1.5 space-y-1.5">
      {showReview && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>Richiede review umana</strong> — verifica con responsabile dell'area prima di agire.
          </span>
        </div>
      )}
      {showLowConf && (
        <div className="flex items-start gap-1.5 px-2 py-1 bg-orange-50 border border-orange-200 rounded-md text-[11px] text-orange-800">
          <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            <strong>Confidence bassa</strong> — l'AI segnala incertezza.
          </span>
        </div>
      )}
      {showCouncil && (
        <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700 bg-purple-50">
          <Users className="h-3 w-3 mr-1" />
          Analisi multi-area · {councilAreasCount} aree
        </Badge>
      )}
    </div>
  );
}

export function AiMessageMetaBottom({
  meta,
  onAskFollowup,
}: {
  meta?: AiMeta;
  onAskFollowup?: (query: string) => void;
}) {
  if (!meta) return null;
  const followups = meta.followup_suggestions ?? [];
  const subOutputs = meta.council_data?.sub_outputs ?? [];

  if (followups.length === 0 && subOutputs.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-2">
      {/* Council view: card collassabili per area */}
      {subOutputs.length > 0 && <CouncilExpandable subOutputs={subOutputs} />}

      {/* Followup chips */}
      {followups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {followups.slice(0, 3).map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onAskFollowup?.(q)}
              // tap-compact: su mobile la regola dei 44px le gonfiava a pillole alte.
              className="tap-compact px-2.5 py-1 text-left text-[11px] leading-snug rounded-full bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-300 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CouncilExpandable({ subOutputs }: { subOutputs: CouncilSubOutput[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-purple-200 bg-purple-50/30 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-purple-100/50 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700">
          <Brain className="h-3.5 w-3.5" />
          Vedi dettagli per area ({subOutputs.length})
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-purple-600" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5 pt-1 space-y-2">
              {subOutputs.map((s, i) => (
                <div key={i} className="bg-white border border-purple-100 rounded-md p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-purple-700">
                      {AREA_EMOJI[s.area] ?? "•"} {AREA_LABELS[s.area] ?? PERSONA_LABELS[s.persona_key] ?? s.area}
                      <span className="text-[10px] text-slate-400 font-normal ml-1.5">
                        ({s.area})
                      </span>
                    </span>
                    {s.confidence && (
                      <Badge variant="outline" className="text-[9px] py-0 h-4">
                        {s.confidence}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 italic mb-1">
                    Domanda: {s.sub_query}
                  </p>
                  {s.error ? (
                    <p className="text-[11px] text-red-600">⚠️ Errore: {s.error}</p>
                  ) : s.response ? (
                    <div className="text-[12px] text-slate-700">
                      <ChatMarkdown content={s.response} sources={s.rag_sources} />
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">(nessuna risposta)</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
