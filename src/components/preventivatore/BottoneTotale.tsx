/**
 * Da telefono e da tablet il totale sta nel piede e apre l'anteprima: si vede
 * sempre quanto fa, e con un tocco com'è fatto.
 */
import { ChevronUp } from "lucide-react";

interface Props {
  valore: string;
  onClick: () => void;
}

export function BottoneTotale({ valore, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Totale ${valore}: apri l'anteprima`}
      className="tap-compact flex min-w-0 items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 text-left"
    >
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Totale</span>
        <span className="truncate text-base font-bold tabular-nums text-slate-900">{valore}</span>
      </span>
      <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
    </button>
  );
}
