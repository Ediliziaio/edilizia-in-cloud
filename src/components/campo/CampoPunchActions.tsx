import { Coffee, Loader2, LogIn, LogOut, PauseCircle } from "lucide-react";
import type { CampoClockState } from "@/lib/campo/timeSummary";

type Punch = "entrata" | "uscita" | "pausa_inizio" | "pausa_fine";
/** Same thumb-friendly action hierarchy on Home and the dedicated clock page. */
export function CampoPunchActions({ state, busy, canEnter, onPunch }: {
  state: CampoClockState; busy: boolean; canEnter: boolean; onPunch: (type: Punch) => void;
}) {
  const out = state === "out";
  const Icon = busy ? Loader2 : out ? LogIn : LogOut;
  return <div className="space-y-2" aria-label="Azioni di timbratura">
    <button type="button" disabled={busy || (out && !canEnter)} onClick={() => onPunch(out ? "entrata" : "uscita")}
      className={`flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-3 py-4 text-base font-bold text-white disabled:opacity-50 ${out ? "bg-green-600" : "bg-red-600"}`}>
      <Icon className={`h-5 w-5 shrink-0 ${busy ? "animate-spin" : ""}`} />
      {out ? "TIMBRA ENTRATA" : "TIMBRA USCITA"}
    </button>
    {!out && <button type="button" disabled={busy} onClick={() => onPunch(state === "paused" ? "pausa_fine" : "pausa_inizio")}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border bg-background px-3 py-3 text-sm font-semibold disabled:opacity-50">
      {state === "paused" ? <PauseCircle className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
      {state === "paused" ? "FINE PAUSA" : "INIZIA PAUSA"}
    </button>}
    <p className="text-xs leading-relaxed text-muted-foreground">{out
      ? "Scegli il cantiere e timbra quando inizi."
      : "Timbra l’uscita quando finisci qui. Se cambi cantiere, poi registra una nuova entrata nell’altro."}</p>
  </div>;
}
