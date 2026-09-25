/**
 * I conti del preventivo Casa Full Electric: dal prezzo e dalle stime scritte a
 * mano a quello che il cliente ottiene — energia, bollette prima e dopo,
 * incentivi, rientro negli anni, CO2. Da qui escono i numeri che il PDF e il
 * preventivatore mostrano, sempre gli stessi.
 */
import type { ModalitaContributo } from "@/lib/contoTermico/regole";
import { CONSUMO_MENSILE, FULL_ELECTRIC, MESI, PRODUZIONE_MENSILE } from "./regole";

export interface FullElectricEconomia {
  /** Prezzo chiavi in mano, IVA inclusa. */
  prezzoIvaInclusa: number;
  ivaPct: number;
  /** Un anno di oggi: quello che si spende e si consuma. */
  oggi: { spesaGas: number; spesaLuce: number; gasSmc: number; luceKwh: number };
  /** Un anno di domani, stimato da chi vende. */
  domani: {
    produzioneKwh: number;
    consumoKwh: number;
    /** Quanto della produzione si consuma in casa, subito o dalla batteria (percento). */
    autoconsumoPct: number;
    /** €/kWh della luce presa dalla rete, tutto compreso. */
    prezzoLuce: number;
    /** €/kWh pagato per l'energia immessa in rete. */
    prezzoImmissione: number;
    /** Le quote fisse della bolletta della luce, in un anno. */
    quotaFissa: number;
  };
  incentivi: {
    /** Detrazione per la casa (50 o 36); null = nessuna. */
    detrazionePct: number | null;
    /** La spesa su cui vale la detrazione (IVA inclusa); null = tutto il prezzo. */
    importoDetraibile: number | null;
    /** Conto Termico sulla pompa di calore, stimato; 0 = nessuno. */
    contributoCt: number;
    modalitaCt: ModalitaContributo;
  };
  /** Aumento annuo del prezzo dell'energia, in percento. */
  aumentoEnergiaPct: number;
  /** Per quanti anni si racconta il beneficio. */
  anni: number;
}

export interface AnnoFullElectric { anno: number; risparmio: number; incentivi: number; flusso: number; cumulato: number }

export interface FullElectricRisultato {
  prezzo: number;
  imponibile: number;
  iva: number;
  energia: {
    produzione: number;
    consumo: number;
    /** kWh del tetto consumati in casa. */
    autoconsumo: number;
    dallaRete: number;
    immessa: number;
    /** Quota dei consumi coperta dal tetto, in percento. */
    coperturaPct: number;
  };
  /** L'anno tipico, mese per mese (kWh). */
  mesi: { mese: string; produzione: number; consumo: number }[];
  bollette: {
    oggi: { gas: number; luce: number; totale: number };
    domani: { luce: number; ricavo: number; totale: number };
  };
  risparmioAnnuo: number;
  risparmioMensile: number;
  incentivi: {
    detrazione: { pct: number; base: number; totale: number; perAnno: number } | null;
    contributoCt: number;
    scontoInFattura: boolean;
    totale: number;
  };
  /** Quanto paga il cliente al momento dei lavori. */
  pagaOggi: number;
  /** Il costo dopo gli incentivi. */
  costoNetto: number;
  anniBeneficio: AnnoFullElectric[];
  risparmiTotali: number;
  beneficioFinale: number;
  anniDiRientro: number | null;
  ambiente: {
    gasSmcEvitati: number;
    co2OggiKg: number;
    co2DomaniKg: number;
    co2EvitataKg: number;
    co2EvitataTotaleKg: number;
    alberi: number;
  };
}

const tondo = (n: number) => Math.round(n * 100) / 100;
const numero = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
const positivo = (n: unknown) => Math.max(0, numero(n));

export function calcolaFullElectric(e: FullElectricEconomia): FullElectricRisultato {
  const prezzo = positivo(e.prezzoIvaInclusa);
  const ivaPct = positivo(e.ivaPct);
  const imponibile = tondo(prezzo / (1 + ivaPct / 100));

  // L'energia di un anno: quella del tetto usata in casa non si compra.
  const produzione = positivo(e.domani.produzioneKwh);
  const consumo = positivo(e.domani.consumoKwh);
  const autoconsumoPct = Math.min(100, positivo(e.domani.autoconsumoPct));
  const autoconsumo = tondo(Math.min(produzione * (autoconsumoPct / 100), consumo));
  const dallaRete = tondo(consumo - autoconsumo);
  const immessa = tondo(produzione - autoconsumo);
  const coperturaPct = consumo > 0 ? Math.round((autoconsumo / consumo) * 100) : 0;
  const mesi = MESI.map((mese, i) => ({
    mese,
    produzione: tondo((produzione * PRODUZIONE_MENSILE[i]) / 100),
    consumo: tondo((consumo * CONSUMO_MENSILE[i]) / 100),
  }));

  // Le bollette: oggi gas e luce, domani solo la luce presa dalla rete, meno quello che si vende.
  const oggi = { gas: positivo(e.oggi.spesaGas), luce: positivo(e.oggi.spesaLuce), totale: 0 };
  oggi.totale = tondo(oggi.gas + oggi.luce);
  const luceDomani = tondo(dallaRete * positivo(e.domani.prezzoLuce) + positivo(e.domani.quotaFissa));
  const ricavo = tondo(immessa * positivo(e.domani.prezzoImmissione));
  const domani = { luce: luceDomani, ricavo, totale: tondo(luceDomani - ricavo) };
  const risparmioAnnuo = tondo(oggi.totale - domani.totale);

  // Gli incentivi valgono su componenti diversi: la detrazione sulla sua spesa,
  // il Conto Termico sulla pompa di calore. Nessuno supera il prezzo.
  const contributoCt = Math.min(positivo(e.incentivi.contributoCt), prezzo);
  const scontoInFattura = e.incentivi.modalitaCt === "sconto_in_fattura";
  const pct = e.incentivi.detrazionePct && e.incentivi.detrazionePct > 0 ? e.incentivi.detrazionePct : 0;
  const detrazione = pct > 0
    ? (() => {
        const scritta = e.incentivi.importoDetraibile;
        const base = tondo(Math.min(scritta != null && scritta > 0 ? scritta : prezzo, prezzo, FULL_ELECTRIC.massimaleDetrazione));
        const totale = tondo(Math.min(base * (pct / 100), prezzo - contributoCt));
        return { pct, base, totale, perAnno: tondo(totale / FULL_ELECTRIC.anniDetrazione) };
      })()
    : null;
  const pagaOggi = tondo(scontoInFattura ? prezzo - contributoCt : prezzo);
  const costoNetto = tondo(prezzo - contributoCt - (detrazione?.totale ?? 0));

  const crescita = 1 + positivo(e.aumentoEnergiaPct) / 100;
  const anni = Math.min(30, Math.max(1, Math.round(numero(e.anni) || 20)));
  const anniBeneficio: AnnoFullElectric[] = [{ anno: 0, risparmio: 0, incentivi: 0, flusso: -pagaOggi, cumulato: -pagaOggi }];
  let cumulato = -pagaOggi;
  let risparmiTotali = 0;
  for (let anno = 1; anno <= anni; anno++) {
    const risparmio = tondo(risparmioAnnuo * crescita ** (anno - 1));
    const incentivi = tondo((anno <= FULL_ELECTRIC.anniDetrazione ? detrazione?.perAnno ?? 0 : 0) + (!scontoInFattura && anno === 1 ? contributoCt : 0));
    const flusso = tondo(risparmio + incentivi);
    cumulato = tondo(cumulato + flusso);
    risparmiTotali = tondo(risparmiTotali + risparmio);
    anniBeneficio.push({ anno, risparmio, incentivi, flusso, cumulato });
  }

  // La CO2: oggi gas e luce dalla rete, domani solo la luce dalla rete.
  const gasSmc = positivo(e.oggi.gasSmc);
  const co2OggiKg = Math.round(gasSmc * FULL_ELECTRIC.co2PerSmcGas + positivo(e.oggi.luceKwh) * FULL_ELECTRIC.co2PerKwhRete);
  const co2DomaniKg = Math.round(dallaRete * FULL_ELECTRIC.co2PerKwhRete);
  const co2EvitataKg = Math.max(0, co2OggiKg - co2DomaniKg);

  return {
    prezzo,
    imponibile,
    iva: tondo(prezzo - imponibile),
    energia: { produzione, consumo, autoconsumo, dallaRete, immessa, coperturaPct },
    mesi,
    bollette: { oggi, domani },
    risparmioAnnuo,
    risparmioMensile: tondo(risparmioAnnuo / 12),
    incentivi: { detrazione, contributoCt, scontoInFattura, totale: tondo(contributoCt + (detrazione?.totale ?? 0)) },
    pagaOggi,
    costoNetto,
    anniBeneficio,
    risparmiTotali,
    beneficioFinale: cumulato,
    anniDiRientro: anniDiRientro(anniBeneficio),
    ambiente: {
      gasSmcEvitati: gasSmc,
      co2OggiKg,
      co2DomaniKg,
      co2EvitataKg,
      co2EvitataTotaleKg: co2EvitataKg * anni,
      alberi: Math.round(co2EvitataKg / FULL_ELECTRIC.co2PerAlbero),
    },
  };
}

/** Il primo momento in cui il cumulato torna sopra lo zero, interpolato fra due anni. */
function anniDiRientro(anni: AnnoFullElectric[]): number | null {
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

/** Un numero intero col punto delle migliaia sempre, anche a quattro cifre: «1.400». */
export function intero(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? "-" : ""}${Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** kWh con il punto delle migliaia: «7.500 kWh». */
export function kwh(n: number): string {
  return `${intero(n)} kWh`;
}

/** Tonnellate con la virgola: «2,8 t». Sotto la tonnellata, i chili. */
export function co2Testo(kg: number): string {
  if (kg < 1000) return `${Math.round(kg)} kg`;
  return `${(kg / 1000).toFixed(1).replace(".", ",")} t`;
}
