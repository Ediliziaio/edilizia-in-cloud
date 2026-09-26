/**
 * I conti del preventivo Conto Termico: dal prezzo scritto a mano a quello che
 * il cliente ottiene. Nessun calcolo dell'incentivo: il contributo lo scrive
 * chi vende. Da qui escono i numeri che il PDF e il preventivatore mostrano,
 * sempre gli stessi, così una pagina non contraddice l'altra.
 */
import { numeroRate, type ModalitaContributo } from "./regole";

export interface ContoTermicoEconomia {
  /** Prezzo chiavi in mano, IVA inclusa, scritto a mano. */
  prezzoIvaInclusa: number;
  ivaPct: number;
  /** Contributo GSE stimato, scritto a mano. */
  contributo: number;
  modalita: ModalitaContributo;
  /** Potenza del generatore: decide 2 o 5 annualità sopra i 15.000 €. */
  potenzaKw: number | null;
  /** Quanto spende oggi il cliente in un anno per riscaldamento e acqua calda. */
  spesaAnnuaAttuale: number;
  /** Quanto spenderà in un anno col nuovo impianto (stima). */
  spesaAnnuaNuova: number;
  /** Aumento annuo del prezzo dell'energia, in percento. */
  aumentoEnergiaPct: number;
  /** Per quanti anni si racconta il beneficio. */
  anni: number;
  /** Per il confronto con la detrazione (50 o 36); null = pagina senza confronto. */
  detrazionePct: number | null;
}

export interface RataContributo { numero: number; anno: number; importo: number }
export interface AnnoBeneficio { anno: number; risparmio: number; contributo: number; flusso: number; cumulato: number }

export interface ContoTermicoRisultato {
  prezzo: number;
  imponibile: number;
  iva: number;
  contributo: number;
  /** Quanto resta a carico del cliente alla fine. */
  restaATe: number;
  /** Quanto paga il cliente al momento dei lavori. */
  pagaOggi: number;
  /** Quota del prezzo coperta dal contributo, in percento. */
  coperturaPct: number;
  rate: RataContributo[];
  risparmioAnnuo: number;
  risparmioMensile: number;
  /** Anno per anno, dall'anno 0 (i lavori) all'ultimo. */
  anniBeneficio: AnnoBeneficio[];
  /** Risparmi sommati sull'orizzonte. */
  risparmiTotali: number;
  /** Cosa resta in tasca alla fine dell'orizzonte: contributo + risparmi − prezzo. */
  beneficioFinale: number;
  /** Quando la spesa è ripagata, in anni con un decimale; null se non succede. */
  anniDiRientro: number | null;
  /** Il confronto con la detrazione, se richiesto. */
  detrazione: { pct: number; totale: number; perAnno: number } | null;
}

/** Il massimale di spesa per la detrazione sulla casa. */
const MASSIMALE_DETRAZIONE = 96000;

const tondo = (n: number) => Math.round(n * 100) / 100;
const numero = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export function calcolaContoTermico(e: ContoTermicoEconomia): ContoTermicoRisultato {
  const prezzo = Math.max(0, numero(e.prezzoIvaInclusa));
  const ivaPct = Math.max(0, numero(e.ivaPct));
  const imponibile = tondo(prezzo / (1 + ivaPct / 100));
  // Il contributo non supera mai il prezzo: un numero scritto male non deve
  // far «guadagnare» il cliente sulla carta.
  const contributo = Math.min(Math.max(0, numero(e.contributo)), prezzo);
  const restaATe = tondo(prezzo - contributo);
  const scontoInFattura = e.modalita === "sconto_in_fattura";
  const pagaOggi = scontoInFattura ? restaATe : prezzo;

  const nRate = numeroRate(contributo, e.potenzaKw);
  const rate: RataContributo[] = Array.from({ length: nRate }, (_, i) => ({
    numero: i + 1,
    anno: i + 1,
    importo: i < nRate - 1 ? tondo(contributo / nRate) : tondo(contributo - tondo(contributo / nRate) * (nRate - 1)),
  }));

  const risparmioAnnuo = tondo(numero(e.spesaAnnuaAttuale) - numero(e.spesaAnnuaNuova));
  const crescita = 1 + Math.max(0, numero(e.aumentoEnergiaPct)) / 100;
  const anni = Math.min(30, Math.max(1, Math.round(numero(e.anni) || 15)));

  const anniBeneficio: AnnoBeneficio[] = [{ anno: 0, risparmio: 0, contributo: 0, flusso: -pagaOggi, cumulato: -pagaOggi }];
  let cumulato = -pagaOggi;
  let risparmiTotali = 0;
  for (let anno = 1; anno <= anni; anno++) {
    const risparmio = tondo(risparmioAnnuo * crescita ** (anno - 1));
    const quota = scontoInFattura ? 0 : rate.find((r) => r.anno === anno)?.importo ?? 0;
    const flusso = tondo(risparmio + quota);
    cumulato = tondo(cumulato + flusso);
    risparmiTotali = tondo(risparmiTotali + risparmio);
    anniBeneficio.push({ anno, risparmio, contributo: quota, flusso, cumulato });
  }

  const detrazione = e.detrazionePct && e.detrazionePct > 0
    ? (() => {
        const totale = tondo(Math.min(prezzo, MASSIMALE_DETRAZIONE) * (e.detrazionePct / 100));
        return { pct: e.detrazionePct, totale, perAnno: tondo(totale / 10) };
      })()
    : null;

  return {
    prezzo,
    imponibile,
    iva: tondo(prezzo - imponibile),
    contributo,
    restaATe,
    pagaOggi,
    coperturaPct: prezzo > 0 ? Math.round((contributo / prezzo) * 100) : 0,
    rate,
    risparmioAnnuo,
    risparmioMensile: tondo(risparmioAnnuo / 12),
    anniBeneficio,
    risparmiTotali,
    beneficioFinale: cumulato,
    anniDiRientro: anniDiRientro(anniBeneficio),
    detrazione,
  };
}

/** Il primo momento in cui il cumulato torna sopra lo zero, interpolato fra due anni. */
function anniDiRientro(anni: AnnoBeneficio[]): number | null {
  if (anni[0] && anni[0].cumulato >= 0) return 0;
  for (let i = 1; i < anni.length; i++) {
    const prima = anni[i - 1].cumulato;
    const dopo = anni[i].cumulato;
    if (dopo >= 0 && prima < 0) {
      const frazione = dopo === prima ? 1 : -prima / (dopo - prima);
      return Math.round((anni[i - 1].anno + frazione) * 10) / 10;
    }
  }
  return null;
}

/**
 * Euro all'italiana, con il punto delle migliaia sempre (anche a 4 cifre).
 * Il segno meno è il trattino: il carattere «−» sparisce nei PDF, che usano
 * i caratteri incorporati (Helvetica).
 */
export function euro(n: number, decimali = 0): string {
  const segno = n < 0 ? "-" : "";
  const [intera, dec] = Math.abs(n).toFixed(decimali).split(".");
  const conPunti = intera.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${segno}${conPunti}${dec ? `,${dec}` : ""} €`;
}

/** Anni con la virgola: «6,5 anni», «1 anno». */
export function anniTesto(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${s} ${n === 1 ? "anno" : "anni"}`;
}
