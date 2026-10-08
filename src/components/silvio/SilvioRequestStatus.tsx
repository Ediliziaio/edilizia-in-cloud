import { useEffect, useState } from "react";
import { AgentThinking, type AgentActivity } from "@/components/ui/ai-agent-response";

export type SilvioRequestPhase = "sending" | "waiting" | "recovering";

/** Phase comes from the request, never guessed from the question or elapsed time. */
export function SilvioRequestStatus({ phase, onStop, activities }: {
  phase: SilvioRequestPhase;
  onStop?: () => void;
  activities?: readonly AgentActivity[];
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(timer);
  }, []);
  const label = phase === "sending" ? "Invio della domanda…"
    : phase === "recovering" ? "Recupero la risposta salvata…" : "Silvio sta preparando la risposta…";
  const hint = slow || phase === "recovering"
    ? phase === "sending" ? "L’invio non è ancora confermato." : "Non serve reinviare la domanda. La risposta apparirà in questa conversazione."
    : undefined;
  return <AgentThinking label={label} hint={hint} onStop={onStop}
    activities={phase === "waiting" ? activities : undefined} />;
}
