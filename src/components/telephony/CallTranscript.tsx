import type { CentralinoCall } from "@/lib/centralinoCalls";

export function CallTranscript({ turns }: { turns: CentralinoCall["transcript"] }) {
  if (!turns.length) return (
    <p className="text-sm text-muted-foreground">
      Trascrizione ancora assente o disattivata per questa chiamata.
    </p>
  );
  return (
    <ol className="max-h-80 space-y-2 overflow-y-auto" aria-label="Trascrizione della chiamata">
      {turns.map((turn, index) => (
        <li key={index} className="rounded-lg border p-2.5 text-sm leading-5">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {["agent", "assistant"].includes(turn.role || "") ? "Agente" : "Interlocutore"}
          </p>
          <p className="whitespace-pre-wrap break-words">{turn.message || turn.text}</p>
        </li>
      ))}
    </ol>
  );
}
