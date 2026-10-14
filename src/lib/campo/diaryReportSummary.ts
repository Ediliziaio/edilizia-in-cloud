import { isClientReport } from "./reportKind";
import { ETICHETTA_STATO_OPERAIO, statoRapportino } from "./rapportinoStato";

export function diaryReportSummary(report: {
  stato?: string | null; approvato?: boolean | null; role_type?: string | null;
  lavoro_completato?: boolean | null; firma_cliente_url?: string | null;
  descrizione_lavori?: string | null; ore_lavorate?: number | null; ore_straordinario?: number | null;
  percentuale_avanzamento?: number | null; presenze?: unknown; foto_urls?: string[] | null;
}) {
  const client = isClientReport(report);
  const state = statoRapportino(report)!;
  const crew = Array.isArray(report.presenze) ? report.presenze.length : 0;
  const hours = (report.ore_lavorate ?? 0) + (report.ore_straordinario ?? 0);
  const progress = report.percentuale_avanzamento;
  const description = [
    report.descrizione_lavori || (client ? "Conferma dei lavori con il cliente" : "Rapportino campo"),
    ETICHETTA_STATO_OPERAIO[state],
    !client && crew ? `${crew} presenze di squadra` : !client && Number.isFinite(hours) && hours >= 0 ? `${hours}h dichiarate` : null,
    !client && progress != null && progress > 0 ? `${progress}% ${state === "approvato" ? "dichiarato nel rapporto approvato" : "proposto, non applicato"}` : null,
    report.foto_urls?.length ? `${report.foto_urls.length} foto` : null,
  ].filter(Boolean).join(" · ");
  return { client, state, description,
    title: client ? "Rapporto cliente" : report.role_type === "subcontractor" ? "Giornaliero subappaltatore" : "Rapportino giornaliero" };
}
