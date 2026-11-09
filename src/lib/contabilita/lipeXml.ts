/**
 * Il file della Comunicazione delle liquidazioni periodiche IVA (LIPE, fornitura
 * IVP18), secondo le specifiche tecniche dell'Agenzia delle Entrate (provvedimento
 * 14/03/2024) e lo schema comunicazioneIvp_2018_v1.xsd.
 * Non calcola niente: scrive i righi già confermati, e controlla le regole che
 * farebbero scartare il file. Il file poi va firmato e inviato da Entratel.
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

const CF_16 = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
const NUM_11 = /^[0-9]{11}$/;
const cifre = (n: number) => Math.round(n * 100);
const cfValido = (cf: string) => CF_16.test(cf) || NUM_11.test(cf);

/** «1234,50»: virgola e due decimali, come vuole lo schema. */
export function importoLipe(n: number): string {
  const c = cifre(n);
  const a = Math.abs(c);
  return `${c < 0 ? "-" : ""}${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
}

const dataLipe = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;

/** Le regole bloccanti delle specifiche. Vuoto = il file si può generare. */
export function controlliLipe(c: ComunicazioneLipe): string[] {
  const e: string[] = [];
  if (!cfValido(c.codiceFiscale)) e.push("Codice fiscale dell'azienda non valido.");
  if (!NUM_11.test(c.partitaIva)) e.push("Partita IVA non valida: servono 11 cifre.");
  const personaFisica = c.codiceFiscale.length === 16;
  if (!personaFisica && !c.cfDichiarante) e.push("Manca il codice fiscale di chi firma (dichiarante).");
  if (c.cfDichiarante && !cfValido(c.cfDichiarante)) e.push("Codice fiscale del dichiarante non valido.");
  if (c.cfDichiarante && !c.codiceCarica) e.push("Manca il codice carica del dichiarante.");
  if (c.codiceCarica && !/^([1-9]|1[1-5])$/.test(c.codiceCarica)) e.push("Codice carica non valido: da 1 a 9 o da 11 a 15.");
  if (c.cfIntermediario && !cfValido(c.cfIntermediario)) e.push("Codice fiscale dell'intermediario non valido.");
  if (c.moduli.length === 0 || c.moduli.length > 5) e.push("Il file deve avere da 1 a 5 moduli.");

  const visti = new Set<string>();
  c.moduli.forEach((m, i) => {
    const nome = m.mese ? `mese ${m.mese}` : `trimestre ${m.trimestre}`;
    const r = m.righi;
    if (!m.mese && !m.trimestre) e.push(`Modulo ${i + 1}: manca mese o trimestre.`);
    if (m.mese && m.trimestre) e.push(`Modulo ${i + 1}: mese e trimestre sono alternativi.`);
    if (visti.has(nome)) e.push(`Due moduli per lo stesso periodo: ${nome}.`);
    visti.add(nome);

    const a = cifre(r.vp4) - cifre(r.vp5);
    if (cifre(r.vp6_debito) !== Math.max(a, 0) || cifre(r.vp6_credito) !== Math.max(-a, 0))
      e.push(`${nome}: VP6 non torna con VP4 e VP5.`);
    if (r.vp7 > 100) e.push(`${nome}: VP7 non può superare 100,00 €.`);
    if (r.vp7 > 0 && (m.mese === 1 || m.mese === 12 || m.trimestre === 1 || m.trimestre === 4 || m.trimestre === 5))
      e.push(`${nome}: VP7 non ammesso in questo periodo.`);
    if (r.vp8 > 0 && (m.mese === 1 || m.trimestre === 1)) e.push(`${nome}: VP8 non ammesso nel primo periodo.`);

    const dovutoPrima = cifre(r.vp6_debito) + cifre(r.vp7) - cifre(r.vp8) - cifre(r.vp9) - cifre(r.vp10);
    if (r.vp11 > 0 && (dovutoPrima <= 0 || cifre(r.vp11) > dovutoPrima || m.trimestre === 5))
      e.push(`${nome}: VP11 oltre il dovuto.`);
    if (r.vp12 > 0 && (!m.trimestre || m.trimestre >= 4)) e.push(`${nome}: VP12 ammesso solo nei trimestri 1-3.`);
    if (r.vp13 > 0) {
      if (r.vp13 < 103.29) e.push(`${nome}: l'acconto non può essere sotto 103,29 €.`);
      if (!(m.mese === 12 || m.trimestre === 4 || m.trimestre === 5)) e.push(`${nome}: acconto ammesso solo a dicembre o nel 4° trimestre.`);
      if (!r.vp13_metodo) e.push(`${nome}: manca il metodo dell'acconto.`);
    }
    if (m.trimestre !== 5) {
      const fin = cifre(r.vp6_debito) - cifre(r.vp6_credito) + cifre(r.vp7) + cifre(r.vp12) - cifre(r.vp11)
        - cifre(r.vp8) - cifre(r.vp9) - cifre(r.vp10) - cifre(r.vp13);
      if (cifre(r.vp14_debito) !== Math.max(fin, 0) || cifre(r.vp14_credito) !== Math.max(-fin, 0))
        e.push(`${nome}: VP14 non torna con gli altri righi.`);
    }
  });

  const mesi = c.moduli.map((m) => m.mese).filter((m): m is number => !!m);
  if (mesi.length && new Set(mesi.map((m) => Math.ceil(m / 3))).size > 1)
    e.push("I mesi devono stare nello stesso trimestre.");
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
export function xmlLipe(c: ComunicazioneLipe): string {
  const errori = controlliLipe(c);
  if (errori.length) throw new Error(errori.join(" "));
  const dichiarante = c.cfDichiarante || c.codiceFiscale;
  const fronte = [
    tag("CodiceFiscale", c.codiceFiscale),
    tag("AnnoImposta", String(c.anno)),
    tag("PartitaIVA", c.partitaIva),
    ...(c.cfDichiarante ? [tag("CFDichiarante", c.cfDichiarante), tag("CodiceCaricaDichiarante", String(c.codiceCarica))] : []),
    tag("FirmaDichiarazione", "1"),
    ...(c.cfIntermediario
      ? [
          tag("CFIntermediario", c.cfIntermediario),
          tag("ImpegnoPresentazione", String(c.impegnoPresentazione ?? 1)),
          tag("DataImpegno", dataLipe(c.dataImpegno ?? new Date().toLocaleDateString("en-CA"))),
          tag("FirmaIntermediario", "1"),
        ]
      : []),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<iv:Fornitura xmlns:iv="${NS_IVP}">`
    + `<iv:Intestazione>${tag("CodiceFornitura", "IVP18")}${tag("CodiceFiscaleDichiarante", dichiarante)}${tag("CodiceCarica", String(c.codiceCarica ?? "1"))}</iv:Intestazione>`
    + `<iv:Comunicazione identificativo="00001"><iv:Frontespizio>${fronte.join("")}</iv:Frontespizio>`
    + `<iv:DatiContabili>${c.moduli.map((m, i) => moduloXml(m, i + 1)).join("")}</iv:DatiContabili></iv:Comunicazione></iv:Fornitura>\n`;
}

export function nomeFileLipe(partitaIva: string, anno: number, trimestre: number): string {
  return `LIPE_${partitaIva}_${anno}_T${trimestre}.xml`;
}

/** Scadenza dell'invio per ogni trimestre solare. */
export function scadenzaLipe(anno: number, trimestre: number): string {
  if (trimestre === 1) return `${anno}-05-31`;
  if (trimestre === 2) return `${anno}-09-30`;
  if (trimestre === 3) return `${anno}-11-30`;
  return new Date(Date.UTC(anno + 1, 2, 0)).toISOString().slice(0, 10);
}
