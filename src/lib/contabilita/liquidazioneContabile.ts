/**
 * La liquidazione IVA registrata in contabilità generale, da stampare e scaricare (23/11/2026).
 *
 * La vista IVA della Contabilità generale mostrava la tabella periodo per periodo ma non la
 * faceva uscire dalla pagina: «in contabilità generale non fa scaricare l'IVA». Qui il foglio
 * A4 (stessa testata degli altri documenti contabili) e il CSV all'italiana per lo studio.
 */
import { htmlDocumentoContabile, type AziendaIntestazione } from "./documentoContabile";
import { PIEDE_LIBRO } from "./libroGiornale";
import { avvisoPeriodo, type IncompletiPeriodo } from "./controlloIva";

/** L'esito di `contabilita_liquida_iva` per un periodo (in anteprima o registrato). */
export interface EsitoLiquidazione {
  iva_vendite: number; iva_acquisti: number; saldo: number; credito_precedente: number; compensato: number;
  da_versare: number; a_credito: number; gia_liquidato: boolean; sotto_minimo?: boolean;
  /** Trimestrale: l'1% di interessi che si aggiunge al versamento. */
  interessi?: number;
}

export interface PeriodoLiquidazione { dal: string; al: string; nome: string }

export interface RigaLiquidazione extends EsitoLiquidazione {
  periodo: string;
  /** «6 emesse e 94 ricevute senza importi»: documenti col solo totale che questa liquidazione non vede. */
  avviso?: string;
}

const euro = (n: number): string =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions).format(n);
const cent = (n: number) => Math.round((Number(n) || 0) * 100);

/** Lo stato del periodo in parole: registrata, sotto il minimo, da registrare, senza movimenti. */
export function statoLiquidazione(r: EsitoLiquidazione): string {
  if (r.gia_liquidato) return "Registrata";
  if (r.iva_vendite === 0 && r.iva_acquisti === 0) return "Senza movimenti";
  if (r.sotto_minimo) return "Sotto 25,82 €: passa al periodo dopo";
  return "Da registrare";
}

/** Le righe da stampare: i periodi con l'esito accanto, senza quelli che non hanno esito. */
export function righeLiquidazione(
  periodi: readonly PeriodoLiquidazione[],
  esiti: readonly (EsitoLiquidazione | undefined)[],
  incompleti: readonly (IncompletiPeriodo | undefined)[] = [],
): RigaLiquidazione[] {
  return periodi.flatMap((p, i) => (esiti[i] ? [{ ...esiti[i]!, periodo: p.nome, avviso: avvisoPeriodo(incompleti[i]) || undefined }] : []));
}

/** Lo stato più l'avviso dei documenti incompleti: sul foglio e nel file va detto, non solo a video. */
const statoConAvviso = (r: RigaLiquidazione) => (r.avviso ? `${statoLiquidazione(r)} · ${r.avviso}: importi parziali` : statoLiquidazione(r));

export function totaliLiquidazione(righe: readonly EsitoLiquidazione[]) {
  const somma = (f: (r: EsitoLiquidazione) => number) => righe.reduce((t, r) => t + cent(f(r)), 0) / 100;
  return {
    ivaVendite: somma((r) => r.iva_vendite),
    ivaAcquisti: somma((r) => r.iva_acquisti),
    daVersare: somma((r) => r.da_versare + (r.interessi ?? 0)),
    aCredito: somma((r) => r.a_credito),
  };
}

export function htmlLiquidazioneContabile(d: {
  azienda: AziendaIntestazione;
  anno: number;
  trimestrale: boolean;
  righe: readonly RigaLiquidazione[];
}): string {
  const t = totaliLiquidazione(d.righe);
  return htmlDocumentoContabile<RigaLiquidazione>({
    titolo: `Liquidazioni IVA ${d.trimestrale ? "trimestrali" : "mensili"}`,
    periodo: `Esercizio ${d.anno}`,
    sottotitolo: "IVA sulle vendite (a debito) e sugli acquisti (a credito) dalle scritture della contabilità generale, periodo per periodo, col credito dei periodi precedenti.",
    azienda: d.azienda,
    piede: PIEDE_LIBRO,
    riepilogo: [
      { etichetta: "IVA sulle vendite", valore: euro(t.ivaVendite) },
      { etichetta: "IVA sugli acquisti", valore: euro(t.ivaAcquisti) },
      { etichetta: "Da versare", valore: euro(t.daVersare) },
      { etichetta: "A credito", valore: euro(t.aCredito) },
    ],
    colonne: [
      { intestazione: "Periodo", valore: (r) => r.periodo, larghezza: "18%" },
      { intestazione: "IVA vendite", valore: (r) => euro(r.iva_vendite), allinea: "destra", compatta: true, larghezza: "12%" },
      { intestazione: "IVA acquisti", valore: (r) => euro(r.iva_acquisti), allinea: "destra", compatta: true, larghezza: "12%" },
      { intestazione: "Credito prec. usato", valore: (r) => (r.compensato ? euro(r.compensato) : ""), allinea: "destra", compatta: true, larghezza: "12%" },
      { intestazione: "Interessi 1%", valore: (r) => (r.interessi ? euro(r.interessi) : ""), allinea: "destra", compatta: true, larghezza: "9%" },
      { intestazione: "Da versare", valore: (r) => (r.da_versare ? euro(r.da_versare + (r.interessi ?? 0)) : ""), allinea: "destra", compatta: true, larghezza: "12%" },
      { intestazione: "A credito", valore: (r) => (r.a_credito ? euro(r.a_credito) : ""), allinea: "destra", compatta: true, larghezza: "11%" },
      { intestazione: "Stato", valore: statoConAvviso, larghezza: "14%" },
    ],
    righe: d.righe,
    totali: [
      { etichetta: "IVA sulle vendite", valore: euro(t.ivaVendite) },
      { etichetta: "IVA sugli acquisti", valore: euro(t.ivaAcquisti) },
      { etichetta: "Totale da versare", valore: euro(t.daVersare), forte: true },
    ],
    vuoto: "Nessun periodo con movimenti IVA in questo esercizio.",
  });
}

/** Una cella CSV: separatore «;», decimali con la virgola, testo fra virgolette se serve. */
const cella = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "";
  const t = typeof v === "number" ? v.toFixed(2).replace(".", ",") : String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function csvLiquidazioneContabile(righe: readonly RigaLiquidazione[]): string {
  return [
    ["Periodo", "IVA vendite", "IVA acquisti", "Credito precedente usato", "Interessi", "Da versare", "A credito", "Stato"].join(";"),
    ...righe.map((r) => [r.periodo, r.iva_vendite, r.iva_acquisti, r.compensato, r.interessi ?? 0, r.da_versare + (r.interessi ?? 0), r.a_credito, statoConAvviso(r)]
      .map(cella).join(";")),
  ].join("\r\n");
}
