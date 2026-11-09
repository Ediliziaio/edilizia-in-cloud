/**
 * Le scadenze della sicurezza di una commessa (09/11/2026).
 *
 * Prima vivevano in tre posti che non si parlavano: gli adempimenti nati alla
 * partenza stavano solo nella pagina azienda, i documenti del cantiere solo
 * nell'elenco, il DURC di una ditta solo nella sua scheda. Chi apriva la
 * commessa non sapeva che la CILA andava depositata la settimana scorsa.
 *
 * La vista `sicurezza_scadenze` le mette insieme nel database; qui si decide
 * solo come leggerle: prima il ritardo, poi l'urgenza, e una frase in italiano.
 */

/** Una riga della vista `sicurezza_scadenze`, per questa commessa. */
export interface ScadenzaSicurezza {
  origine: "documento" | "fascicolo" | "adempimento" | "durc_ditta";
  riferimento_id: string;
  tipo: string | null;
  titolo: string | null;
  subappaltatore: string | null;
  data_scadenza: string;
  giorni_mancanti: number | null;
  stato: "scaduto" | "in_scadenza";
}

/** I nomi che si usano in cantiere, non le sigle della tabella. */
export const NOME_TIPO_SICUREZZA: Record<string, string> = {
  psc: "PSC",
  pss: "PSS",
  pos: "POS",
  pos_impresa: "POS dell'impresa",
  notifica_preliminare: "Notifica preliminare",
  fascicolo_opera: "Fascicolo dell'opera",
  pimus: "PiMUS",
  verbale_coordinamento: "Verbale di coordinamento",
  nomina_coordinatori: "Nomina dei coordinatori",
  pos_ditte: "POS delle ditte",
  nomina: "Nomina",
  durc: "DURC",
  idoneita_tecnica: "Idoneità tecnico-professionale",
  idoneita_mansione: "Idoneità alla mansione",
  dvr: "DVR",
  patente_crediti: "Patente a crediti",
  piano_emergenza: "Piano di emergenza",
  schede_sicurezza: "Schede di sicurezza",
  sds: "Scheda di sicurezza",
  valutazione_rumore: "Valutazione del rumore",
  libretti_macchine: "Libretti delle macchine",
  verifiche_attrezzature: "Verifica di attrezzature",
  attrezzatura: "Attrezzatura",
  formazione: "Formazione",
  consegna_dpi: "Consegna DPI",
  dpi: "DPI",
  visura: "Visura",
  qualificazione: "Qualificazione",
  verbale: "Verbale",
  autorizzazione: "Autorizzazione",
  corso_formazione: "Corso di formazione",
  visita_medica: "Visita medica",
  manutenzione_dpi: "Manutenzione DPI",
  rinnovo_certificato: "Rinnovo di certificato",
  cila_scia: "Titolo edilizio",
  cartello_cantiere: "Cartello di cantiere",
  suolo_pubblico: "Occupazione di suolo pubblico",
  altro: "Documento",
};

/** «DURC · Edil Rossi», «Notifica preliminare all'ASL…». */
export function cosaScade(s: ScadenzaSicurezza): string {
  const base = s.titolo?.trim() || NOME_TIPO_SICUREZZA[s.tipo ?? ""] ||
    "Documento";
  return s.subappaltatore ? `${base} · ${s.subappaltatore}` : base;
}

function dataIT(iso: string): string {
  const [a, m, g] = iso.split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
}

/** «era da fare 4 giorni fa», «scade oggi», «fra 12 giorni». */
export function quandoScade(s: ScadenzaSicurezza): string {
  const g = s.giorni_mancanti ?? 0;
  if (s.stato === "scaduto") {
    const r = Math.abs(g);
    if (r <= 1) return `era da fare ieri, il ${dataIT(s.data_scadenza)}`;
    return `era da fare ${r} giorni fa, il ${dataIT(s.data_scadenza)}`;
  }
  if (g <= 0) return `scade oggi, ${dataIT(s.data_scadenza)}`;
  if (g === 1) return `scade domani, il ${dataIT(s.data_scadenza)}`;
  return `scade fra ${g} giorni, il ${dataIT(s.data_scadenza)}`;
}

/**
 * In ordine di quanto urge: prima i ritardi (il più vecchio in cima), poi
 * quelle che stanno per scadere. A parità, un nome stabile, così la lista non
 * si rimescola a ogni ricaricamento.
 */
export function ordinaScadenze(
  righe: readonly ScadenzaSicurezza[],
): ScadenzaSicurezza[] {
  return [...righe].sort((a, b) =>
    a.data_scadenza.localeCompare(b.data_scadenza) ||
    cosaScade(a).localeCompare(cosaScade(b), "it")
  );
}

/** «3 in ritardo, 2 in scadenza» — la riga che si legge senza aprire nulla. */
export function riepilogoScadenze(
  righe: readonly ScadenzaSicurezza[],
): { inRitardo: number; inScadenza: number; testo: string } {
  const inRitardo = righe.filter((r) => r.stato === "scaduto").length;
  const inScadenza = righe.length - inRitardo;
  const parti: string[] = [];
  if (inRitardo) parti.push(`${inRitardo} in ritardo`);
  if (inScadenza) parti.push(`${inScadenza} in scadenza`);
  return { inRitardo, inScadenza, testo: parti.join(", ") };
}
