import type { CentralinoCall } from "@/lib/centralinoCalls";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function CallTranscript({ turns, onSeek }: { turns: CentralinoCall["transcript"]; onSeek?: (time: number) => void }) {
  const t = useT();
  if (!turns.length) return (
    <p className="text-sm text-muted-foreground">
      {t("Trascrizione ancora assente o disattivata per questa chiamata.")}
    </p>
  );
  return (
    <ol className="max-h-80 space-y-2 overflow-y-auto" aria-label={t("Trascrizione della chiamata")}>
      {turns.map((turn, index) => {
        const second = typeof turn.time === "number" && Number.isFinite(turn.time) && turn.time >= 0
          ? Math.floor(turn.time) : null;
        const label = second === null ? null : `${Math.floor(second / 60)}:${String(second % 60).padStart(2, "0")}`;
        return (
        <li key={index} className="rounded-lg border p-2.5 text-sm leading-5">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
            <span>{["agent", "assistant"].includes(turn.role || "") ? t("Agente") : t("Interlocutore")}</span>
            {second !== null && (onSeek
              ? <button type="button" className="underline" onClick={() => onSeek(second)}>{t("Vai a {nome}", { nome: label ?? "" })}</button>
              : <span>{label}</span>)}
          </div>
          <p className="whitespace-pre-wrap break-words">{turn.message || turn.text}</p>
        </li>
        );
      })}
    </ol>
  );
}
