import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FISH_DEMO_OPERATORS,
  FISH_DEMO_HANDOFF_MS,
  type FishDemoOutcome,
} from "../../../supabase/functions/_shared/fishDemoHandoff";

export type HandoffDemoState = {
  operator: string;
  reason: string;
} & (
  | { phase: "ringing"; deadline: number }
  | { phase: "accepted" | "no_answer" | "cancelled" }
);

function RingCountdown({ deadline }: { deadline: number }) {
  const seconds = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      200,
    );
    return () => clearInterval(timer);
  }, [deadline]);
  return (
    <div className="space-y-1.5">
      <progress
        aria-label="Tempo prima del ritorno all’AI"
        className="h-2 w-full accent-sky-700"
        max={FISH_DEMO_HANDOFF_MS / 1000}
        value={remaining}
      />
      <p className="text-xs tabular-nums text-muted-foreground">
        {remaining} s prima del ritorno all’AI
      </p>
    </div>
  );
}

export function FishHandoffSimulation({
  state,
  onOutcome,
}: {
  state: HandoffDemoState | null;
  onOutcome: (outcome: FishDemoOutcome) => void;
}) {
  const status =
    state &&
    {
      ringing: `Squillo simulato a ${state.operator}`,
      accepted: `${state.operator} ha accettato · passaggio dimostrativo`,
      no_answer: `${state.operator} non ha risposto · ritorno all’AI`,
      cancelled: "Passaggio interrotto",
    }[state.phase];
  return (
    <section
      className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-2.5 dark:border-sky-900 dark:bg-sky-950/30"
      aria-label="Banco prova del passaggio"
    >
      <h3 className="text-sm font-semibold">
        Primo operatore disponibile · simulazione
      </h3>
      <ul
        className="flex flex-wrap gap-2"
        aria-label="Operatori di test in ordine"
      >
        {FISH_DEMO_OPERATORS.map((operator) => (
          <li
            key={operator.id}
            className={`rounded-full border px-3 py-1 text-xs ${
              !operator.available
                ? "bg-muted text-muted-foreground"
                : operator.name === state?.operator
                  ? "border-sky-400 bg-sky-100 font-medium text-sky-900 dark:bg-sky-900 dark:text-sky-100"
                  : "bg-background"
            }`}
          >
            {operator.name} · {operator.available ? "libero" : "occupato"}
          </li>
        ))}
      </ul>
      {state ? (
        <div className="space-y-2 rounded-lg border bg-background p-3 text-sm">
          <p role="status" className="font-medium">
            {status}
          </p>
          {state.reason && (
            <p className="text-xs leading-5 text-muted-foreground">
              {state.reason}
            </p>
          )}
          {state.phase === "ringing" && (
            <>
              <RingCountdown deadline={state.deadline} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onOutcome("accepted")}>
                  Operatore risponde
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOutcome("no_answer")}
                >
                  Non risponde: torna all’AI
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Chiedi di parlare con una persona per provare risposta o mancata
          risposta.
        </p>
      )}
    </section>
  );
}
