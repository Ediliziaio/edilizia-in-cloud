import { validaCodiceFiscale, validaPartitaIva } from "@/lib/fatturazione/validazioniAnagrafiche";
import { italianHolidays } from "@/lib/personale/calendarioLavorativo";

/**
 * Il file della Comunicazione delle liquidazioni periodiche IVA (LIPE, fornitura
 * IVP18), secondo le specifiche tecniche dell'Agenzia delle Entrate (provvedimento
 * 14/03/2024) e lo schema comunicazioneIvp_2018_v1.xsd.
 * Non calcola niente: scrive i righi già confermati, e controlla le regole che
 * farebbero scartare il file. Il controllo dell'Agenzia e la trasmissione avvengono dopo lo scaricamento.
 */
export const NS_IVP = "urn:www.agenziaentrate.gov.it:specificheTecniche:sco:ivp";

export interface RighiLipe {
  vp2: number; vp3: number; vp4: number; vp5: number;
  vp6_debito: number; vp6_credito: number;
  vp7: number; vp8: number; vp9: number; vp10: number; vp11: number; vp12: number;
  vp13: number; vp13_metodo?: number | null;
  vp14_debito: number; vp14_credito: number;
}

export interface ModuloLipe {
  mese?: number | null;
  /** 1-4, o 5 per il quarto dei trimestrali su opzione. */
  trimestre?: number | null;
  righi: RighiLipe;
}

export interface ComunicazioneLipe {
  anno: number;
  codiceFiscale: string;
  partitaIva: string;
  cfDichiarante?: string | null;
  codiceCarica?: string | null;
  cfIntermediario?: string | null;
  /** 1 predisposta dal contribuente, 2 da chi invia. */
  impegnoPresentazione?: 1 | 2;
  /** yyyy-mm-dd */
  dataImpegno?: string | null;
  moduli: ModuloLipe[];
}

const cifre = (n: number) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100);
const RIGHI_FIRMATI = ["vp2", "vp3", "vp4", "vp5", "vp9"] as const;
const RIGHI_POSITIVI = ["vp6_debito", "vp6_credito", "vp7", "vp8", "vp10", "vp11", "vp12", "vp13", "vp14_debito", "vp14_credito"] as const;
const RIGHI_IMPORTO = [...RIGHI_FIRMATI, ...RIGHI_POSITIVI] as const;
const codicePulito = (cf: string) => cf.replace(/\s/g, "").toUpperCase();

export function moduloLipeConDati(m: ModuloLipe): boolean {
  return RIGHI_IMPORTO.some((k) => !(m.trimestre === 5 && k.startsWith("vp14"))
    && Number.isFinite(m.righi?.[k]) && cifre(m.righi[k]) !== 0);
}

export function stessiRighiLipe(a: RighiLipe, b: RighiLipe): boolean {
  return RIGHI_IMPORTO.every((k) => cifre(a[k]) === cifre(b[k]))
    && (a.vp13 <= 0 || a.vp13_metodo === b.vp13_metodo);
}

/** «1234,50»: virgola e due decimali, come vuole lo schema. */
export function importoLipe(n: number): string {
  const c = cifre(n);
  const a = Math.abs(c);
  return `${c < 0 ? "-" : ""}${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
}

const dataLipe = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;

/** Le regole bloccanti delle specifiche. Vuoto = il file si può generare. */
export function controlliLipe(c: ComunicazioneLipe, ora = new Date()): string[] {
  const e: string[] = [];
  const oggi = ora.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const annoInvio = Number(oggi.slice(0, 4));
  const cf = codicePulito(c.codiceFiscale);
  const dichiarante = c.cfDichiarante ? codicePulito(c.cfDichiarante) : null;
  if (!validaCodiceFiscale(cf).valida || cf === "00000000000") e.push("Codice fiscale del contribuente non valido.");
  const partitaIva = codicePulito(c.partitaIva);
  if (!/^[0-7]\d{10}$/.test(partitaIva) || !validaPartitaIva(partitaIva).valida || partitaIva === "00000000000")
    e.push("Partita IVA non valida.");
  if (!Number.isInteger(c.anno) || c.anno < annoInvio - 1 || c.anno > annoInvio) e.push("Anno d'imposta non ammesso per la trasmissione LIPE.");
  if (cf.length !== 16 && !dichiarante) e.push("Manca il codice fiscale di chi firma (dichiarante).");
  if (dichiarante && (dichiarante.length !== 16 || !validaCodiceFiscale(dichiarante).valida))
    e.push("Indica il codice fiscale di 16 caratteri della persona fisica dichiarante.");
  if (dichiarante && dichiarante === cf) e.push("Compila il dichiarante solo quando è diverso dal contribuente.");
  if (dichiarante && !/^([1-9]|1[1-5])$/.test(c.codiceCarica ?? "")) e.push("Indica un codice carica da 1 a 9 o da 11 a 15.");
  if (c.cfIntermediario) {
    if (!validaCodiceFiscale(c.cfIntermediario).valida || codicePulito(c.cfIntermediario) === "00000000000")
      e.push("Codice fiscale dell'intermediario non valido.");
    if (c.impegnoPresentazione !== 1 && c.impegnoPresentazione !== 2) e.push("Indica chi ha predisposto la comunicazione.");
    const data = c.dataImpegno ?? "";
    const giorno = new Date(`${data}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(giorno.getTime())
      || giorno.toISOString().slice(0, 10) !== data || data > oggi || data < `${annoInvio - 4}-01-01`)
      e.push("Indica la data effettiva dell'impegno dell'intermediario.");
  } else if (c.impegnoPresentazione || c.dataImpegno) {
    e.push("Indica il codice fiscale dell'intermediario per usare i dati dell'impegno.");
  }
  if (c.moduli.length === 0 || c.moduli.length > 3) e.push("Servono fino a tre moduli mensili oppure un modulo trimestrale.");

  const visti = new Set<string>();
  const mesi = new Map<number, RighiLipe>();
  const trimestri = new Set<number>();
  c.moduli.forEach((m, i) => {
    const nome = m.mese ? `mese ${m.mese}` : `trimestre ${m.trimestre}`;
    const r = m.righi;
    if (m.mese == null && m.trimestre == null) e.push(`Modulo ${i + 1} senza mese o trimestre.`);
    if (m.mese != null && m.trimestre != null) e.push(`Modulo ${i + 1} con mese e trimestre insieme. Verifica la periodicità.`);
    if (m.mese != null && (!Number.isInteger(m.mese) || m.mese < 1 || m.mese > 12)) e.push("Il mese deve essere compreso fra 1 e 12.");
    if (m.trimestre != null && (!Number.isInteger(m.trimestre) || m.trimestre < 1 || m.trimestre > 5)) e.push("Il trimestre deve essere compreso fra 1 e 5.");
    if (visti.has(nome)) e.push(`Due moduli per lo stesso periodo: ${nome}.`);
    visti.add(nome);
    if (m.mese) mesi.set(m.mese, r);
    if (m.trimestre) trimestri.add(m.trimestre);
    if (!r || RIGHI_IMPORTO.some((k) => !Number.isSafeInteger(cifre(r[k])) || importoLipe(r[k]).length > 16)
      || RIGHI_POSITIVI.some((k) => r[k] < 0)) {
      e.push(`Righi VP incompleti o importi fuori tracciato per ${nome}.`);
      return;
    }

    const a = cifre(r.vp4) - cifre(r.vp5);
    if (cifre(r.vp6_debito) !== Math.max(a, 0) || cifre(r.vp6_credito) !== Math.max(-a, 0))
      e.push(`${nome}: VP6 non torna con VP4 e VP5.`);
    const soglia = c.anno < 2024 ? 25.82 : 100;
    if (r.vp7 > soglia) e.push(`${nome}: VP7 non può superare ${importoLipe(soglia)} €.`);
    if (r.vp7 > 0 && (m.mese === 1 || m.mese === 12 || m.trimestre === 1 || m.trimestre === 4 || m.trimestre === 5))
      e.push(`${nome}: VP7 non ammesso in questo periodo.`);
    if (r.vp8 > 0 && (m.mese === 1 || m.trimestre === 1)) e.push(`${nome}: VP8 non ammesso nel primo periodo.`);
    if (r.vp9 < 0 && (m.mese === 1 || m.trimestre === 1)) e.push(`${nome}: VP9 negativo non ammesso nel primo periodo.`);

    const dovutoPrima = cifre(r.vp6_debito) + cifre(r.vp7) - cifre(r.vp8) - cifre(r.vp9) - cifre(r.vp10);
    if (r.vp11 > 0 && (dovutoPrima <= 0 || cifre(r.vp11) > dovutoPrima || m.trimestre === 5))
      e.push(`${nome}: VP11 oltre il dovuto.`);
    if (r.vp12 > 0 && (!m.trimestre || m.trimestre >= 4)) e.push(`${nome}: VP12 ammesso solo nei trimestri 1-3.`);
    if (r.vp13 > 0) {
      if (r.vp13 < 103.29) e.push(`${nome}: l'acconto non può essere sotto 103,29 €.`);
      if (!(m.mese === 12 || m.trimestre === 4 || m.trimestre === 5)) e.push(`${nome}: acconto ammesso solo a dicembre o nel 4° trimestre.`);
      if (![1, 2, 3, 4].some((metodo) => metodo === r.vp13_metodo)) e.push(`${nome}: indica il metodo dell'acconto da 1 a 4.`);
    }
    if (m.trimestre !== 5) {
      const fin = cifre(r.vp6_debito) - cifre(r.vp6_credito) + cifre(r.vp7) + cifre(r.vp12) - cifre(r.vp11)
        - cifre(r.vp8) - cifre(r.vp9) - cifre(r.vp10) - cifre(r.vp13);
      if (cifre(r.vp14_debito) !== Math.max(fin, 0) || cifre(r.vp14_credito) !== Math.max(-fin, 0))
        e.push(`${nome}: VP14 non torna con gli altri righi.`);
    }
  });

  if (trimestri.size > 1 || (trimestri.size && mesi.size))
    e.push("La comunicazione deve contenere i mesi di un trimestre oppure un solo modulo trimestrale.");
  if (new Set([...mesi.keys()].map((m) => Math.ceil(m / 3))).size > 1)
    e.push("I mesi devono stare nello stesso trimestre.");
  for (const [mese, righi] of mesi) {
    if (mese % 3 !== 1 && righi?.vp8 > (mesi.get(mese - 1)?.vp14_credito ?? 0))
      e.push(`Il VP8 del mese ${mese} supera il credito del mese precedente.`);
  }
  if (c.moduli.length && !c.moduli.some(moduloLipeConDati))
    e.push("Non ci sono dati da comunicare nel quadro VP del trimestre.");
  return e;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tag = (nome: string, valore: string) => `<iv:${nome}>${esc(valore)}</iv:${nome}>`;

function moduloXml(m: ModuloLipe, n: number): string {
  const r = m.righi;
  const pos = (nome: string, v: number) => (cifre(v) > 0 ? [tag(nome, importoLipe(v))] : []);
  const parti = [
    tag("NumeroModulo", String(n)),
    ...(m.mese ? [tag("Mese", String(m.mese))] : []),
    ...(m.trimestre ? [tag("Trimestre", String(m.trimestre))] : []),
    tag("TotaleOperazioniAttive", importoLipe(r.vp2)),
    tag("TotaleOperazioniPassive", importoLipe(r.vp3)),
    tag("IvaEsigibile", importoLipe(r.vp4)),
    tag("IvaDetratta", importoLipe(r.vp5)),
    ...pos("IvaDovuta", r.vp6_debito),
    ...pos("IvaCredito", r.vp6_credito),
    ...pos("DebitoPrecedente", r.vp7),
    ...pos("CreditoPeriodoPrecedente", r.vp8),
    ...(cifre(r.vp9) !== 0 ? [tag("CreditoAnnoPrecedente", importoLipe(r.vp9))] : []),
    ...pos("VersamentiAutoUE", r.vp10),
    ...pos("CreditiImposta", r.vp11),
    ...pos("InteressiDovuti", r.vp12),
    ...(cifre(r.vp13) > 0 ? [tag("Metodo", String(r.vp13_metodo)), tag("Acconto", importoLipe(r.vp13))] : []),
    // Col trimestre 5 il saldo sta nella dichiarazione annuale: VP14 non si scrive.
    ...(m.trimestre === 5 ? [] : [...pos("ImportoDaVersare", r.vp14_debito), ...pos("ImportoACredito", r.vp14_credito)]),
  ];
  return `<iv:Modulo>${parti.join("")}</iv:Modulo>`;
}

/** Lancia un errore con l'elenco dei controlli falliti: un file sbagliato non esce. */
export function xmlLipe(c: ComunicazioneLipe, ora?: Date): string {
  const errori = controlliLipe(c, ora);
  if (errori.length) throw new Error(errori.join(" "));
  const dichiarante = c.cfDichiarante ? codicePulito(c.cfDichiarante) : null;
  const contribuente = codicePulito(c.codiceFiscale);
  const fronte = [
    tag("CodiceFiscale", contribuente),
    tag("AnnoImposta", String(c.anno)),
    tag("PartitaIVA", c.partitaIva.replace(/\s/g, "")),
    ...(dichiarante ? [tag("CFDichiarante", dichiarante), tag("CodiceCaricaDichiarante", c.codiceCarica!)] : []),
    tag("FirmaDichiarazione", "1"),
    ...(c.cfIntermediario
      ? [
          tag("CFIntermediario", codicePulito(c.cfIntermediario)),
          tag("ImpegnoPresentazione", String(c.impegnoPresentazione)),
          tag("DataImpegno", dataLipe(c.dataImpegno!)),
          tag("FirmaIntermediario", "1"),
        ]
      : []),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<iv:Fornitura xmlns:iv="${NS_IVP}">`
    + `<iv:Intestazione>${tag("CodiceFornitura", "IVP18")}${dichiarante ? tag("CodiceFiscaleDichiarante", dichiarante) + tag("CodiceCarica", c.codiceCarica!) : ""}</iv:Intestazione>`
    + `<iv:Comunicazione identificativo="00001"><iv:Frontespizio>${fronte.join("")}</iv:Frontespizio>`
    + `<iv:DatiContabili>${c.moduli.map((m, i) => moduloXml(m, i + 1)).join("")}</iv:DatiContabili></iv:Comunicazione></iv:Fornitura>\n`;
}

export function nomeFileLipe(codiceFiscaleTrasmittente: string, progressivo?: string): string {
  const cf = codicePulito(codiceFiscaleTrasmittente);
  const alfanumerico = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const id = progressivo ?? Array.from(crypto.getRandomValues(new Uint32Array(5)), (n) => alfanumerico[n % alfanumerico.length]).join("");
  if (!validaCodiceFiscale(cf).valida || cf === "00000000000" || !/^[A-Za-z0-9]{1,5}$/.test(id))
    throw new Error("Codice fiscale del trasmittente o progressivo del file non valido.");
  return `IT${cf}_LI_${id}.xml`;
}

/** Scadenza dell'invio per ogni trimestre solare. */
export function scadenzaLipe(anno: number, trimestre: number): string {
  const giorno = trimestre === 4 ? new Date(Date.UTC(anno + 1, 2, 0))
    : new Date(Date.UTC(anno, [5, 9, 11][trimestre - 1], 0));
  const festivita = new Set(italianHolidays(giorno.getUTCFullYear()).map((f) => f.data));
  const iso = () => giorno.toISOString().slice(0, 10);
  while (giorno.getUTCDay() === 0 || giorno.getUTCDay() === 6 || festivita.has(iso()))
    giorno.setUTCDate(giorno.getUTCDate() + 1);
  return iso();
}
