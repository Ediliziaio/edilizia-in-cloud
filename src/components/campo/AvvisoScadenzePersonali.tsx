/**
 * In Home: «La tua visita medica è scaduta», «Il corso antincendio scade il 12 dic» — solo se c'è qualcosa.
 * Regola del founder: anomalie e scadenze sempre visibili, non dentro una pagina da aprire.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { categoriaLabel } from "@/types/hrDocumenti";
import { scadenzeDaAvvisare, type DocumentoConScadenza } from "@/lib/campo/scadenzePersonali";

const dataBreve = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });

export function AvvisoScadenzePersonali() {
  const { data: hrProfilo } = useMyHrProfilo();
  const profiloId = hrProfilo?.id ?? null;
  const { data: avvisi = [] } = useQuery({
    queryKey: ["campo-scadenze-personali", profiloId],
    enabled: !!profiloId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_documenti")
        .select("id, categoria, titolo, data_scadenza, alert_giorni_prima")
        .eq("hr_profilo_id", profiloId!)
        .not("data_scadenza", "is", null);
      if (error) throw error;
      return scadenzeDaAvvisare((data ?? []) as DocumentoConScadenza[]);
    },
  });
  if (!avvisi.length) return null;
  const scaduti = avvisi.filter(a => a.stato === "scaduto").length;
  return (
    <Link to="/campo/documenti"
      className={`flex items-start gap-3 rounded-2xl border p-3 ${scaduti ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"}`}>
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {scaduti ? `${scaduti === 1 ? "Un tuo documento è scaduto" : `${scaduti} tuoi documenti sono scaduti`}` : "Un tuo documento sta per scadere"}
        </p>
        <ul className="mt-0.5 space-y-0.5 text-xs">
          {avvisi.slice(0, 3).map(a => (
            <li key={a.id}>
              {a.titolo?.trim() || categoriaLabel(a.categoria)} · {a.stato === "scaduto" ? "scaduto il" : "scade il"} {dataBreve.format(new Date(`${a.data_scadenza}T12:00:00`))}
            </li>
          ))}
          {avvisi.length > 3 && <li>e altri {avvisi.length - 3}</li>}
        </ul>
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden="true" />
    </Link>
  );
}
