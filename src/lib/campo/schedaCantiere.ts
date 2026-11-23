import type { TipoDocumentoCantiere } from "@/lib/commesse/documentiCantiere";
import type { FaseInput } from "@/lib/orders/cronoprogramma";
import type { Sottofase } from "@/lib/orders/sottofasi";

export const FOTO_AVANZAMENTO_BUCKET = "campo-avanzamenti";
export const FOTO_RILIEVO_BUCKET = "surveys";
export const dataVisitaCampo = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" });

export interface CantiereTecnico {
  id: string;
  codice: string | null;
  titolo: string | null;
  indirizzo: string | null;
}

export interface FaseSchedaCantiere extends FaseInput {
  note: string | null;
  primo: string | null;
  ultimo: string | null;
  sottofasi: Sottofase[];
}

export interface DocumentoSchedaCantiere {
  id: string;
  nome: string;
  mime: string | null;
  percorso: string;
  categoria: TipoDocumentoCantiere;
  revisione: string | null;
}

export interface SchedaCantiere {
  cantiere: CantiereTecnico & { inizio: string | null; fine: string | null; progresso: number | null };
  fasi?: FaseSchedaCantiere[];
  documenti?: DocumentoSchedaCantiere[];
  permessi?: { aggiorna_fasi: boolean; registra_rilievi: boolean };
  misure?: Record<string, MisuraSottofaseCampo>;
}

export interface MisuraSottofaseCampo {
  totale: number;
  unita: string | null;
  eseguita: number;
}

export interface AvanzamentoRegistratoCampo {
  id: string;
  sottofase: string | null;
  autore: string | null;
  registrato_il: string;
  percentuale: number;
  note: string | null;
  foto: string[];
}

export type TipoVisitaCampo = "rilievo" | "sopralluogo";

export interface VisitaRegistrataCampo {
  id: string;
  codice: string | null;
  tipo: TipoVisitaCampo;
  giorno: string | null;
  misure: string | null;
  note: string | null;
  foto?: string[];
}

export type SezioneSchedaCantiere = "piano" | "documenti";

export interface PersonaAccessoTecnico {
  id: string;
  nome: string;
  abilitato: boolean;
  ammissibile: boolean;
  registra_rilievi?: boolean;
}

export function percorsoCantiereTecnico(ordine?: string) {
  return `/campo/cantieri${ordine ? `/${encodeURIComponent(ordine)}` : ""}`;
}

/**
 * Il gestionale sta sul dominio `app`: dall'app Lavori (`lavori.…`) ci si torna
 * solo con un link assoluto. Altrove (app, www, locale) basta il percorso.
 *
 * Serve a chi entra nell'area campo come tecnico senza avere cantieri assegnati
 * (23/11/2026): la barra del tecnico ha solo «Cantieri» e il tasto Esci, quindi
 * senza questo link la pagina vuota e' un vicolo cieco.
 */
export function linkGestionale(percorso = "/azienda/dashboard") {
  if (typeof window === "undefined") return percorso;
  const host = window.location.hostname;
  return /^lavori\./i.test(host)
    ? `${window.location.protocol}//${host.replace(/^lavori\./i, "app.")}${percorso}`
    : percorso;
}

export function titoloCantiereTecnico(cantiere: CantiereTecnico) {
  return cantiere.titolo?.trim() || cantiere.codice || "Cantiere";
}
