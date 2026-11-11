import { AlertTriangle, ListChecks } from "lucide-react";
import type { AttivitaAcquisto } from "@/lib/acquisti/attivita";
export function AttivitaAcquistoCard({
  attivita,
}: {
  attivita: AttivitaAcquisto[];
}) {
  // Niente da fare: nessun riquadro, solo spazio in meno prima del contenuto.
  if (attivita.length === 0) return null;
  const attenzione = attivita.some((a) => a.priorita === "attenzione");
  // Un avviso per riga, non un riquadro per avviso (11/11/2026): prima una
  // sola cosa da fare occupava una scheda alta 130 px.
  return (
    <section
      aria-label="Da completare"
      className={`rounded-xl border px-3 py-2 ${attenzione ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white"}`}
    >
      <h2 className={`flex items-center gap-1.5 text-xs font-semibold ${attenzione ? "text-amber-900" : "text-slate-800"}`}>
        <ListChecks className="h-3.5 w-3.5" />
        Da completare ({attivita.length})
      </h2>
      <ul className="mt-1 space-y-1">
        {attivita.map((a, i) => (
          <li key={`${a.id}-${i}`} className="flex items-start gap-1.5 text-xs">
            <AlertTriangle
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${a.priorita === "attenzione" ? "text-amber-600" : "text-slate-400"}`}
            />
            <span>
              <strong className="font-semibold text-slate-800">{a.titolo}.</strong>{" "}
              <span className="text-slate-600">{a.dettaglio}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
