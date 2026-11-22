import type { CSSProperties } from "react";
import { Check, Minus, type LucideIcon } from "lucide-react";
import "./fish-agent-pipeline.css";

export interface PipelineStep {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  state: "waiting" | "active" | "done" | "skipped" | "attention";
}

export function VoiceActivity() {
  return (
    <span className="eic-voice-bars" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function AgentPipeline({
  title,
  steps,
}: {
  title: string;
  steps: PipelineStep[];
}) {
  return (
    <section aria-label={title} className="eic-pipeline eic-motion-enter">
      <h2 className="eic-pipeline-title">{title}</h2>
      <ol
        className="eic-pipeline-grid"
        style={{ "--eic-pipeline-columns": steps.length } as CSSProperties}
      >
        {steps.map(({ id, label, detail, icon: Icon, state }, index) => (
          <li
            key={id}
            className="eic-pipeline-step"
            data-state={state}
            aria-current={state === "active" ? "step" : undefined}
          >
            {index > 0 && (
              <span aria-hidden="true" className="eic-pipeline-track">
                <i />
                <i />
                <i />
              </span>
            )}
            <span key={state} aria-hidden="true" className="eic-pipeline-icon">
              {state === "done" ? (
                <Check size={17} />
              ) : state === "skipped" ? (
                <Minus size={17} />
              ) : (
                <Icon size={17} />
              )}
            </span>
            <div className="min-w-0">
              <span className="eic-pipeline-label">{label}</span>
              <span className="eic-pipeline-detail">{detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
