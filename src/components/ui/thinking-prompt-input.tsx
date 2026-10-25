import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUp, Check, ChevronRight, LoaderCircle, Sparkles, Square, Circle, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import "./thinking-prompt-input.css";

export type ThinkingStatus = "idle" | "thinking" | "answering" | "done" | "stopped";
export type ThinkingStep = { id: string; text: string; status: "pending" | "active" | "complete" | "stopped" };

/** Public operation summaries supplied by the caller, never private model reasoning.
 * No timers fabricate successful phases in this view; status comes from the operation.
 */
export function ThinkingProgress({ status, steps, elapsedSeconds = 0, simulated = false, onReveal }: {
  status: ThinkingStatus; steps: ThinkingStep[]; elapsedSeconds?: number; simulated?: boolean; onReveal?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const region = useId();
  const busy = status === "thinking" || status === "answering";
  const open = busy || expanded;
  useLayoutEffect(() => { if (open) onReveal?.(); }, [open, steps, onReveal]);
  const seconds = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.floor(elapsedSeconds)) : 0;
  const allComplete = steps.length > 0 && steps.every(step => step.status === "complete");
  const title = busy ? "Elaborazione in corso" : status === "stopped" ? "Operazione interrotta" : allComplete ? "Passaggi completati" : "Stato dei passaggi";
  return <div className="thinking-progress" data-state={status}>
    <button type="button" aria-expanded={open} aria-controls={region} onClick={() => setExpanded(value => !value)} disabled={busy}>
      <Sparkles size={14} aria-hidden="true" /><span className={busy ? "thinking-progress-shimmer" : ""}>{title}{simulated ? " · simulazione" : ""}</span>
      <small>{seconds}s</small><ChevronRight size={13} className={open ? "thinking-progress-chevron open" : "thinking-progress-chevron"} aria-hidden="true" />
    </button>
    <ol id={region} hidden={!open} aria-label="Fasi operative">
      {steps.map(step => <li key={step.id} data-step-state={step.status}>
        <span className="thinking-progress-icon">{step.status === "complete" ? <Check size={13} aria-hidden="true" /> : step.status === "active" ? <LoaderCircle size={13} className="thinking-progress-spinner" aria-hidden="true" /> : step.status === "stopped" ? <Minus size={13} aria-hidden="true" /> : <Circle size={8} aria-hidden="true" />}</span>
        <span>{step.text}</span><span className="sr-only"> — {step.status === "complete" ? "completata" : step.status === "active" ? "in corso" : step.status === "stopped" ? "interrotta" : "in attesa"}</span>
      </li>)}
    </ol>
    {busy && <p className="sr-only" role="status">{steps.find(step => step.status === "active")?.text ?? title}</p>}
  </div>;
}

/** Adapted from the supplied reference: controlled composer, IME-safe Enter,
 * lightweight native height animation, stop/send transition and reduced motion.
 */
export function ThinkingPromptInput({ value, onValueChange, onSubmit, onStop, busy, disabled = false, placeholder = "Descrivi il lavoro o rispondi alla domanda…", label = "Messaggio all’assistente preventivi", className, compact = false, inline = false, tools, trailingTools }: {
  value: string; onValueChange: (value: string) => void; onSubmit: () => void; onStop: () => void;
  busy: boolean; disabled?: boolean; placeholder?: string; label?: string; className?: string;
  compact?: boolean; inline?: boolean; tools?: ReactNode; trailingTools?: ReactNode;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = textarea.current;
    if (!input) return;
    const before = input.getBoundingClientRect().height;
    input.style.height = "auto";
    const height = Math.max(compact ? 28 : 64, Math.min(input.scrollHeight, compact ? 112 : 140));
    input.style.height = `${height}px`;
    if (!window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(before - height) < 1 || !input.animate) return;
    const animation = input.animate([{ height: `${before}px` }, { height: `${height}px` }], { duration: 180, easing: "cubic-bezier(.22,1,.36,1)" });
    return () => animation.cancel();
  }, [value, compact]);
  const submit = () => { if (!busy && !disabled && value.trim()) onSubmit(); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
  };
  return <form className={cn("thinking-composer", compact && "thinking-composer--compact", inline && "thinking-composer--inline", className)} onSubmit={event => { event.preventDefault(); submit(); }}>
    <textarea ref={textarea} aria-label={label} placeholder={placeholder} maxLength={3000} rows={compact ? 1 : 2} value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)} onKeyDown={keyDown} />
    <div className="thinking-composer-actions">{tools ? <div className="thinking-composer-tools">{tools}</div> : !inline && <span><Sparkles size={13} aria-hidden="true" /> Assistente preventivi</span>}
      <div className="thinking-composer-send-tools">{trailingTools}
      <button type={busy ? "button" : "submit"} aria-label={busy ? "Interrompi risposta" : "Invia messaggio"} onClick={busy ? onStop : undefined} disabled={disabled || (!busy && !value.trim())} data-busy={busy}>
        <ArrowUp size={18} className="thinking-send" aria-hidden="true" /><Square size={12} className="thinking-stop" fill="currentColor" aria-hidden="true" />
      </button>
      </div>
    </div>
  </form>;
}
