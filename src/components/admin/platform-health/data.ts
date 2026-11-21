import { format, formatDistance } from "date-fns";
import { it } from "date-fns/locale";

export const segnalazioniKey = ["admin-errori-raggruppati"] as const;

export interface JobRiga {
  job: string;
  schedule?: string;
  attivo?: boolean;
  esecuzioni: number;
  falliti: number;
  ultima: string | null;
  ultimo_errore?: string | null;
  errore?: string | null;
  ultimo_esito?: string | null;
  guasto?: boolean;
}

export interface FunzioneRiga {
  funzione: string;
  chiamate: number;
  errori: number;
  latenza_media_ms: number | null;
  latenza_max_ms: number | null;
  ultima: string | null;
}

export interface Salute {
  riepilogo: {
    job_totali: number;
    job_attivi: number;
    job_con_errori: number;
    job_singhiozzi?: number;
    funzioni_strumentate: number;
    funzioni_totali_stimate: number;
    errori_edge_24h: number;
    aziende_attive_24h: number;
    trial_scaduti_da_gestire: number;
    insoluti_aperti: number;
    aziende_cancellate_in_attesa: number;
    disponibilita_24h_pct: number | null;
    segreti_cron_in_chiaro: number;
  };
  job_falliti: JobRiga[];
  job: JobRiga[];
  funzioni: FunzioneRiga[];
  battito?: {
    stato: {
      ultimo_esito: string | null;
      ultimo_controllo: string | null;
      ultima_durata_ms: number | null;
      falliti_di_fila: number;
      controlli_24h: number;
      falliti_24h: number;
      disponibilita_24h_pct: number | null;
    } | null;
    interruzioni: Array<{ inizio: string; fine: string; controlli_falliti: number }>;
  };
  calcolato_il: string;
}

export type StatoJob = "guasti" | "rientrati" | "regolari" | "senza-esecuzioni" | "disattivati";

export const statiJob = {
  guasti: "Da verificare",
  rientrati: "Errore isolato",
  regolari: "Regolare",
  "senza-esecuzioni": "Nessuna esecuzione",
  disattivati: "Disattivato",
} satisfies Record<StatoJob, string>;

export const ordineStatiJob: Record<StatoJob, number> = {
  guasti: 0, rientrati: 1, regolari: 2, "senza-esecuzioni": 3, disattivati: 4,
};

export function statoJob(job: JobRiga, storico?: JobRiga): StatoJob {
  if (job.attivo === false) return "disattivati";
  if (storico) return storico.guasto === false ? "rientrati" : "guasti";
  if (job.falliti > 0) return job.ultimo_esito === "succeeded" ? "rientrati" : "guasti";
  return job.esecuzioni > 0 ? "regolari" : "senza-esecuzioni";
}

const percentuale = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

export function formattaPercentuale(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : percentuale.format(value) + "%";
}

export function dataSalute(value: string | null | undefined, pattern = "d MMM yyyy · HH:mm") {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return format(new Date(value), pattern, { locale: it });
}

export function tempoSalute(value: string | null | undefined, riferimento: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  if (!Number.isFinite(Date.parse(riferimento))) return dataSalute(value);
  return formatDistance(new Date(value), new Date(riferimento), { addSuffix: true, locale: it });
}

export function latenzaSalute(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : value + " ms";
}
