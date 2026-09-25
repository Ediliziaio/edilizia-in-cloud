/**
 * Il modello della libreria dentro il preventivo, per i preventivatori edili
 * (25/09/2026): Bagni, Climatizzazione, Elettrico, Termoidraulico, Pavimenti,
 * Piscine, Ristrutturazione.
 *
 * Quando un preventivo nasce da un intervento della libreria (Bagni «Da vasca a
 * doccia», Elettrico «Quadro elettrico»…), il modello dell'azienda per quell'intervento
 * si congela nella colonna modello_snapshot del progetto e il PDF usa quello, anche
 * se poi il modello cambia (migrazione modelli_preventivo_moduli_edili). È lo stesso
 * meccanismo di Tetti (lib/tetti/quoteModel.ts), scritto una volta per tutti.
 *
 * Un modello rovinato o di un'altra azienda ferma il preventivo: mai un PDF generico
 * al suo posto, senza dirlo.
 */
import { SALES_AREAS, type SalesIntervention } from "@/lib/moduli-vendita/areas";

export const MODULI_CON_MODELLI = [
  "bagni", "climatizzazione", "elettrico", "termoidraulico", "pavimenti", "piscine", "ristrutturazione",
] as const;
export type ModuloConModelli = typeof MODULI_CON_MODELLI[number];

export const eModuloConModelli = (slug: string): slug is ModuloConModelli =>
  (MODULI_CON_MODELLI as readonly string[]).includes(slug);

/** La tabella dei preventivi di ogni preventivatore. */
export const TABELLA_PREVENTIVI: Record<ModuloConModelli, string> = {
  bagni: "bgn_progetti",
  climatizzazione: "clm_progetti",
  elettrico: "ele_progetti",
  termoidraulico: "idr_progetti",
  pavimenti: "pav_progetti",
  piscine: "pis_progetti",
  ristrutturazione: "rst_progetti",
};

const NOME: Record<ModuloConModelli, string> = {
  bagni: "Bagni", climatizzazione: "Climatizzazione", elettrico: "Elettrico", termoidraulico: "Termoidraulico",
  pavimenti: "Pavimenti", piscine: "Piscine", ristrutturazione: "Ristrutturazione",
};

/**
 * Il «Tipo di intervento» del preventivatore che corrisponde a ogni modello: lo
 * step Immobile non chiede più di sceglierlo, perché l'intervento è già scelto.
 * I valori sono quelli dei menu TIPI_INTERVENTO degli step Immobile.
 */
export const TIPO_INTERVENTO_DEL_MODELLO: Record<ModuloConModelli, Readonly<Record<string, string>>> = {
  bagni: {
    completo: "rifacimento_completo", "vasca-doccia": "vasca_in_doccia", doccia: "rifacimento_parziale",
    sanitari: "sostituzione_sanitari", accessibilita: "abbattimento_barriere", rinnovo: "rifacimento_parziale",
  },
  climatizzazione: {
    monosplit: "nuovo_impianto", multisplit: "nuovo_impianto", canalizzato: "nuovo_impianto",
    sostituzione: "sostituzione", manutenzione: "manutenzione_ordinaria", vmc: "nuovo_impianto",
  },
  elettrico: {
    completo: "nuovo_impianto", adeguamento: "adeguamento_norma", punti: "ampliamento", quadro: "adeguamento_norma",
    domotica: "domotica", videocitofonia: "ampliamento", ricarica: "ampliamento",
  },
  termoidraulico: {
    caldaia: "sostituzione_generatore", "pompa-calore": "sostituzione_generatore", ibrido: "sostituzione_generatore",
    radiante: "nuovo_impianto", terminali: "ampliamento", idrico: "rifacimento",
    "acqua-calda": "sostituzione_generatore", manutenzione: "manutenzione_straordinaria",
  },
  pavimenti: {
    sovrapposizione: "sovrapposizione", rifacimento: "rifacimento", resina: "resina_microcemento",
    parquet: "levigatura_lucidatura", pareti: "nuova_posa", esterni: "nuova_posa",
  },
  piscine: {
    nuova: "nuova_costruzione", ristrutturazione: "ristrutturazione", rivestimento: "ristrutturazione",
    impianti: "impianto_trattamento", accessori: "copertura", manutenzione: "manutenzione",
  },
  ristrutturazione: {
    completa: "ristrutturazione_completa", parziale: "ristrutturazione_parziale", commerciale: "ristrutturazione_completa",
    spazi: "ristrutturazione_parziale", computo: "altro",
  },
};

/** Gli interventi della libreria per un preventivatore (Impostazioni → Moduli vendita). */
export function interventiDelModulo(modulo: ModuloConModelli): readonly SalesIntervention[] {
  return SALES_AREAS.find((area) => area.sourceModule === modulo)?.interventions ?? [];
}

/** L'intervento richiesto (?modello=…) o salvato nel preventivo; undefined se non esiste. */
export function interventoDelModulo(modulo: ModuloConModelli, id: string | null | undefined): SalesIntervention | undefined {
  return id ? interventiDelModulo(modulo).find((intervento) => intervento.id === id) : undefined;
}

export interface ModelloPreventivo<T> {
  version: 1;
  modelId: string;
  companyId: string;
  capturedAt: string;
  template: T;
}

type TemplateConBlocchi = { company_id?: string | null; pdf_blocchi?: Record<string, unknown> | null };

/** Il modello salvato nel preventivo, controllato. Null per i preventivi senza modello. */
export function leggiModelloPreventivo<T extends object>(
  modulo: ModuloConModelli, value: unknown, companyId: string,
): ModelloPreventivo<T> | null {
  if (value == null) return null;
  const s = value as ModelloPreventivo<T>;
  const t = s?.template as TemplateConBlocchi | undefined;
  if (s.version !== 1 || !interventoDelModulo(modulo, s.modelId) || s.companyId !== companyId ||
      !Number.isFinite(Date.parse(s.capturedAt)) || !t || typeof t !== "object" || t.company_id !== companyId ||
      t.pdf_blocchi?.modulo_intervento !== s.modelId) {
    throw new Error(`Il modello ${NOME[modulo]} salvato nel preventivo non è valido o è di un'altra azienda. Nessun PDF generico verrà usato al suo posto.`);
  }
  return s;
}

/**
 * Congela il modello dell'azienda per l'intervento. Via le parti che servono solo
 * all'editor (i testi di serie per «ripristina», l'archivio delle foto).
 */
export function creaModelloPreventivo<T extends object>(
  modulo: ModuloConModelli, companyId: string, modelId: string, source: T,
): ModelloPreventivo<T> {
  const template = structuredClone(source) as T & TemplateConBlocchi;
  const blocchi = { ...(template.pdf_blocchi ?? {}) };
  delete blocchi.modulo_defaults;
  delete blocchi.modulo_foto;
  template.pdf_blocchi = { ...blocchi, modulo_intervento: modelId };
  template.company_id = companyId;
  const snapshot: ModelloPreventivo<T> = { version: 1, modelId, companyId, capturedAt: new Date().toISOString(), template };
  leggiModelloPreventivo(modulo, snapshot, companyId);
  return snapshot;
}

/**
 * Il modello del PDF: quello congelato nel preventivo, se c'è; altrimenti la bozza
 * dell'editor o il modello aziendale, come prima.
 */
export async function templateDelPreventivo<T extends object>(
  modulo: ModuloConModelli,
  progetto: { company_id: string; modello_snapshot?: unknown },
  bozza: T | null | undefined,
  carica: (companyId: string) => Promise<T>,
): Promise<T> {
  return leggiModelloPreventivo<T>(modulo, progetto.modello_snapshot, progetto.company_id)?.template
    ?? bozza ?? carica(progetto.company_id);
}
