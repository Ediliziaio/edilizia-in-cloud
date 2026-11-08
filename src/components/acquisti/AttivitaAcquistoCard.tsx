import { AlertTriangle, ListChecks } from "lucide-react";
import type { AttivitaAcquisto } from "@/lib/acquisti/attivita";
export function AttivitaAcquistoCard({
  attivita,
}: {
  attivita: AttivitaAcquisto[];
}) {
  // Niente da fare: nessun riquadro, solo spazio in meno prima del contenuto.
  if (attivita.length === 0) return null;
  return (
    <section
      aria-label="Da completare"
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <ListChecks className="h-4 w-4 text-orange-500" />
        Da completare{" "}
        <span className="text-slate-500">({attivita.length})</span>
      </h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {attivita.map((a, i) => (
          <li
            key={`${a.id}-${i}`}
            className={`flex gap-2 rounded-xl p-3 ${a.priorita === "attenzione" ? "bg-amber-50" : "bg-slate-50"}`}
          >
            <AlertTriangle
              className={`mt-0.5 h-4 w-4 shrink-0 ${a.priorita === "attenzione" ? "text-amber-600" : "text-slate-400"}`}
            />
            <div>
              <p className="text-xs font-semibold text-slate-800">
                {a.titolo}
              </p>
              <p className="mt-1 text-xs text-slate-600">{a.dettaglio}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
