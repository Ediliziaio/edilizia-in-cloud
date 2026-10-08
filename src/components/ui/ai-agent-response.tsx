import { useId, useState } from "react";
import { ChevronDown, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import "./ai-agent-response.css";

export interface AgentActivity {
  id: string;
  label: string;
}

/** Decorative animation only: it never advances request state. */
export function PixelDotsLoader({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("silvio-pixel-grid", className)}>
    {Array.from({ length: 9 }, (_, i) => <span key={i} className="silvio-pixel-dot"
      style={{ animationDelay: `${(i % 3 + Math.abs(Math.floor(i / 3) - 1)) * 90}ms` }} />)}
  </span>;
}

/** These events describe tool starts, not successful or completed actions. */
export function AgentThinking({ label, activities = [], hint, onStop }: {
  label: string;
  activities?: readonly AgentActivity[];
  hint?: string;
  onStop?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const activityId = useId();
  const seen = new Set<string>();
  const steps = activities.filter(step => {
    if (!step.id || !step.label.trim() || seen.has(step.id)) return false;
    seen.add(step.id);
    return true;
  });
  return <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 text-sm shadow-sm">
    <div className="flex min-w-0 items-center gap-2.5">
      <PixelDotsLoader className="text-orange-500" />
      <p role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1 text-[13px] font-medium leading-5">
        <span className="silvio-thinking-shimmer">{label}</span>
      </p>
      {steps.length > 0 && <button type="button" aria-expanded={expanded} aria-controls={activityId}
        aria-label={expanded ? "Nascondi attività avviate" : "Mostra attività avviate"}
        onClick={() => setExpanded(value => !value)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
      </button>}
    </div>
    {steps.length > 0 && <div id={activityId} hidden={!expanded} className="ml-1.5 mt-2.5">
      <p className="mb-2 pl-5 text-[11px] font-medium text-slate-400">Attività avviate · {steps.length}</p>
      <ol className="max-h-40 space-y-2.5 overflow-y-auto border-l border-slate-200 py-0.5 pl-5 pr-1 text-xs leading-5 text-slate-600">
        {steps.map(step => <li key={step.id} className="silvio-thinking-step relative break-words">
          <span aria-hidden="true" className="absolute -left-[23px] top-[7px] h-1.5 w-1.5 rounded-full bg-slate-300 ring-4 ring-white" />
          {/* A legacy fallback can contain an internal tool name; never expose it. */}
          {/^Eseguo\s*:/i.test(step.label.trim()) ? "Consulto i dati disponibili" : step.label}
        </li>)}
      </ol>
    </div>}
    {hint && <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>}
    {onStop && <button type="button" onClick={onStop}
      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
      <Square aria-hidden="true" className="h-3 w-3" /> Interrompi attesa
    </button>}
  </div>;
}
