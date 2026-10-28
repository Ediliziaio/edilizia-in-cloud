import type { EvidenzaFascicolo, FaseFascicolo } from "./fascicolo";
import { errorePeriodo, nelContestoApplicabilita } from "./fascicolo";
import {
  criterioNominativo,
  destinatarioCriterio,
  MAX_CRITERI_ITP,
} from "./soggettiItp";
export type EsitoItp =
  | "positivo"
  | "negativo"
  | "da_integrare"
  | "non_applicabile"
  | "annullata";
export const ESITI_ITP: Record<EsitoItp, string> = {
  positivo: "Esito positivo registrato",
  negativo: "Esito negativo registrato",
  da_integrare: "Integrazioni richieste",
  non_applicabile: "Non applicabilità motivata",
  annullata: "Registrazione rettificata / annullata",
};
export interface ContestoItp {
  impresa: {
    id: string;
    ragione_sociale: string | null;
    campo_subappaltatore_id: string | null;
  };
  commessa: {
    id: string;
    order_code: string | null;
    description: string | null;
  };
  fase: Pick<FaseFascicolo, "id" | "name" | "start_date" | "end_date"> | null;
}
export interface CriterioItp {
  destinatario?: import("./soggettiItp").DestinatarioItp;
  operaio_id?: string;
  incarico_id?: string;
  ruolo?: import("./fascicolo").RuoloIncarico;
  gruppo_id?: string;
  copertura?: string;
  soggetto_snapshot?: import("./soggettiItp").SoggettoSnapshotItp;
  profilo_id?: string;
  profilo_versione?: number;
  requisito_id?: string;
  profilo_snapshot?: import("./profiliRequisiti").ProfiloSnapshot;
  id: string;
  titolo: string;
  catalogo_id: string | null;
  catalogo_versione: number | null;
  applicabilita: "da_chiarire" | "applicabile" | "non_applicabile";
  esito: "da_verificare" | "conforme" | "non_conforme" | "non_applicabile";
  riferimento: string;
  note: string;
  evidenze: string[];
}
export interface DatiVerificaItp {
  soggetti_attesi?: import("./soggettiItp").SoggettiItp;
  fase_id: string | null;
  dal: string;
  al: string | null;
  esito: EsitoItp;
  attivita: string;
  responsabile: string;
  ruolo_responsabile: string;
  motivazione: string;
  completezza: boolean;
  criteri: CriterioItp[];
  contesto_atteso: ContestoItp;
  evidenze_attese: Record<string, string>;
}
export interface VerificaItp {
  soggetti?: import("./soggettiItp").SoggettiItp | null;
  id: string;
  company_id: string;
  order_id: string;
  subappaltatore_id: string;
  fase_id: string | null;
  versione: number;
  precedente_id: string | null;
  dal: string;
  al: string | null;
  esito: EsitoItp;
  attivita: string;
  responsabile: string;
  ruolo_responsabile: string;
  motivazione: string;
  completezza: boolean;
  criteri: CriterioItp[];
  evidenze: Array<
    Pick<
      EvidenzaFascicolo,
      | "id"
      | "titolo"
      | "tipo"
      | "catalogo_id"
      | "catalogo_versione"
      | "order_id"
      | "operaio_id"
      | "incarico_id"
      | "fase_id"
      | "applicabile_dal"
      | "applicabile_al"
      | "stato"
      | "data_scadenza"
      | "file_path"
      | "file_name"
      | "updated_at"
    >
  >;
  contesto: ContestoItp;
  registrato_da: string;
  registrato_da_nome: string;
  registrato_il: string;
}
export function nuovoCriterioItp(): CriterioItp {
  return {
    id: crypto.randomUUID(),
    titolo: "",
    catalogo_id: null,
    catalogo_versione: null,
    applicabilita: "da_chiarire",
    esito: "da_verificare",
    riferimento: "",
    note: "",
    evidenze: [],
  };
}
export function erroreVerificaItp(
  d: Omit<DatiVerificaItp, "contesto_atteso" | "evidenze_attese">,
): string | null {
  const periodo = errorePeriodo(d.dal, d.al);
  if (periodo) return periodo;
  if (
    !d.attivita.trim() ||
    !d.responsabile.trim() ||
    !d.ruolo_responsabile.trim() ||
    !d.motivazione.trim()
  )
    return "Indica lavori, responsabile, ruolo e motivazione dell’esito.";
  if (d.esito === "annullata") return null;
  if (!d.criteri.length || d.criteri.length > MAX_CRITERI_ITP)
    return "Definisci i criteri esaminati (massimo 500).";
  if (["positivo", "non_applicabile"].includes(d.esito) && !d.completezza)
    return "Conferma di avere definito ed esaminato i requisiti applicabili al caso.";
  for (const c of d.criteri) {
    if (!c.titolo.trim()) return "Indica il titolo di ogni criterio.";
    if (
      d.esito === "positivo" &&
      c.applicabilita === "applicabile" &&
      criterioNominativo(c) &&
      !(destinatarioCriterio(c) === "operaio" ? c.operaio_id : c.incarico_id)
    )
      return "Seleziona il titolare del criterio nominativo.";

    if (
      c.applicabilita === "non_applicabile" &&
      (c.esito !== "non_applicabile" || !c.note.trim() || !c.riferimento.trim())
    )
      return "Motiva ogni non applicabilità e indica il riferimento.";
    if (
      d.esito === "positivo" &&
      (c.applicabilita === "da_chiarire" ||
        (c.applicabilita === "applicabile" &&
          (c.esito !== "conforme" ||
            !c.evidenze.length ||
            !c.riferimento.trim())))
    )
      return "L’esito positivo richiede criteri definiti, riferimenti ed evidenze verificate.";
    if (d.esito === "non_applicabile" && c.applicabilita !== "non_applicabile")
      return "Per l’esito non applicabile motiva tutti i criteri.";
  }
  if (
    d.esito === "positivo" &&
    !d.criteri.some((c) => c.applicabilita === "applicabile")
  )
    return "Un esito positivo richiede almeno un criterio applicabile.";
  if (
    d.esito === "negativo" &&
    !d.criteri.some(
      (c) => c.applicabilita === "applicabile" && c.esito === "non_conforme",
    )
  )
    return "Indica almeno un criterio applicabile con esito non conforme.";
  return null;
}
function canonico(v: unknown): string {
  if (v && typeof v === "object") {
    if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => JSON.stringify(k) + ":" + canonico(x))
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
/** A past verdict stays visible, but changed/expired sources require a new review. */
export function avvisiVerificaItp(
  v: VerificaItp,
  evidenze: readonly EvidenzaFascicolo[],
  contesto: ContestoItp | undefined,
  data: string,
): string[] {
  const avvisi: string[] = [];
  if (contesto && canonico(v.contesto) !== canonico(contesto))
    avvisi.push("Impresa, commessa o pianificazione della fase sono cambiate.");
  for (const prima of v.evidenze) {
    const ora = evidenze.find((e) => e.id === prima.id);
    if (!ora) {
      avvisi.push(`Evidenza non più disponibile: ${prima.titolo}.`);
      continue;
    }
    if (
      ora.updated_at !== prima.updated_at ||
      ora.file_path !== prima.file_path ||
      ora.stato !== prima.stato
    )
      avvisi.push(`Evidenza cambiata: ${prima.titolo}.`);
    if (ora.data_scadenza && ora.data_scadenza < data)
      avvisi.push(`Evidenza scaduta: ${prima.titolo}.`);
    if (
      !nelContestoApplicabilita(ora, { data, faseId: v.fase_id ?? undefined })
    )
      avvisi.push(`Evidenza fuori periodo o fase: ${prima.titolo}.`);
    if (v.esito === "positivo" && ora.tipo === "durc" && !ora.data_scadenza)
      avvisi.push(
        `Scadenza effettiva del DURC non registrata: ${prima.titolo}.`,
      );
  }
  return [...new Set(avvisi)];
}
export function ultimaVerificaItp(
  v: readonly VerificaItp[],
  subId: string,
  data: string,
  faseId?: string,
) {
  return v
    .filter(
      (x) =>
        x.subappaltatore_id === subId &&
        x.dal <= data &&
        (!x.al || x.al >= data) &&
        (!faseId || !x.fase_id || x.fase_id === faseId),
    )
    .sort((a, b) => b.versione - a.versione)[0];
}

/** Profile snapshots are reconstructed by the server; do not upload repeated display-only copies. */
export function datiItpPerRegistrazione(
  dati: DatiVerificaItp,
): DatiVerificaItp {
  return {
    ...dati,
    soggetti_attesi: dati.criteri.some(criterioNominativo)
      ? dati.soggetti_attesi
      : undefined,
    criteri: dati.criteri.map((c) => {
      const r = { ...c };
      delete r.profilo_snapshot;
      delete r.soggetto_snapshot;
      return r;
    }),
  };
}
