import type { ProfiloOrarioFv } from "./fvBollette.ts";
export type MeseEnergiaFv = {
  consumo: number;
  produzione: number;
  autoconsumo: number;
  immessa: number;
  acquistata: number;
};
export type FlussiEnergiaFv = {
  consumo: number;
  produzione: number;
  autoconsumo: number;
  diretto: number;
  daBatteria: number;
  immessa: number;
  acquistata: number;
  perditeAccumulo: number;
  energiaFinaleBatteria: number;
  coperturaConsumi: number;
  quotaProduzioneUsata: number;
  risparmioAcquisti: number;
  ricaviImmissione: number;
  mensili: MeseEnergiaFv[];
};
const finito = (v: number, max = 1e10) =>
  Number.isFinite(v) && v >= 0 && v <= max;
const cacheProfili = new Map<
  string,
  Array<{ c: number; s: number; mese: number }>
>();
export const PESI_SOLARI_FV = [
  .045,
  .055,
  .08,
  .1,
  .12,
  .125,
  .13,
  .115,
  .09,
  .065,
  .04,
  .035,
];
/** Un anno orario convenzionale: nessun ciclo della batteria inventato dai totali annui. */
export function simulaEnergiaFv(
  input: {
    consumoAnnuo: number;
    produzioneAnnua: number;
    batteriaKwh: number;
    costoEvitabileKwh: number;
    prezzoImmissione: number;
    profilo: ProfiloOrarioFv;
    pesiProduzioneMensili?: number[];
    azimut?: number;
    latitudine?: number;
  },
): FlussiEnergiaFv {
  const { profilo: p } = input;
  if (
    ![
      input.consumoAnnuo,
      input.produzioneAnnua,
      input.batteriaKwh,
      input.costoEvitabileKwh,
      input.prezzoImmissione,
    ].every((x) => finito(x)) || !p.pesiMensili.some((x) => x > 0) ||
    p.pesiMensili.length !== 12 ||
    !p.pesiMensili.every((x) => finito(x, 100)) || !finito(p.oraInizio, 23) ||
    !finito(p.oraFine, 24) ||
    p.oraFine <= p.oraInizio || !finito(p.quotaFuoriOrario, 1) ||
    !finito(p.aumentoConsumiPct, 500) ||
    !p.giorni.every((x) => Number.isInteger(x) && x >= 0 && x <= 6)
  ) throw Error("Completa i consumi e le ipotesi del profilo energetico.");
  const consumo = input.consumoAnnuo * (1 + p.aumentoConsumiPct / 100),
    produzione = input.produzioneAnnua;
  const solare = input.pesiProduzioneMensili?.length === 12
    ? input.pesiProduzioneMensili
    : PESI_SOLARI_FV;
  if (!solare.every((x) => finito(x, 100)) || !solare.some((x) => x > 0)) {
    throw Error("Distribuzione mensile della produzione non valida.");
  }
  const key = JSON.stringify([p, input.azimut, input.latitudine, solare]);
  let ore = cacheProfili.get(key);
  if (!ore) {
    ore = [];
    const totaliConsumo = Array(12).fill(0) as number[],
      totaliSole = Array(12).fill(0) as number[];
    const anticipo = ((input.azimut ?? 180) - 180) / 90;
    for (let giorno = 0; giorno < 365; giorno++) {
      const data = new Date(Date.UTC(2025, 0, 1 + giorno)),
        mese = data.getUTCMonth(),
        lavorativo = p.giorni.includes(data.getUTCDay());
      const durata = 12 +
        3.3 * Math.sin((giorno - 80) * 2 * Math.PI / 365) *
          Math.min(1.25, Math.max(.65, (input.latitudine ?? 42) / 42));
      for (let ora = 0; ora < 24; ora++) {
        const inOrario = lavorativo && ora >= p.oraInizio && ora < p.oraFine;
        const c = p.tipo === "azienda"
          ? (inOrario ? 1 : p.quotaFuoriOrario)
          : ((ora >= 18 && ora < 23)
            ? 1
            : (inOrario ? .45 : p.quotaFuoriOrario));
        const t = (ora + .5 - (12 + anticipo - durata / 2)) / durata,
          s = t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
        ore.push({ c, s, mese });
        totaliConsumo[mese] += c;
        totaliSole[mese] += s;
      }
    }
    const pesoC = p.pesiMensili.reduce((a, b) => a + b, 0),
      pesoS = solare.reduce((a, b) => a + b, 0);
    if (totaliConsumo.some((v, m) => p.pesiMensili[m] > 0 && v === 0)) {
      throw Error("Il profilo deve prevedere consumi nei mesi selezionati.");
    }
    ore = ore.map((o) => ({
      mese: o.mese,
      c: totaliConsumo[o.mese]
        ? p.pesiMensili[o.mese] / pesoC * o.c / totaliConsumo[o.mese]
        : 0,
      s: totaliSole[o.mese]
        ? solare[o.mese] / pesoS * o.s / totaliSole[o.mese]
        : 0,
    }));
    cacheProfili.set(key, ore);
    if (cacheProfili.size > 8) {
      cacheProfili.delete(cacheProfili.keys().next().value!);
    }
  }
  const eff = Math.sqrt(.9),
    capacita = input.batteriaKwh * .9,
    mensili: MeseEnergiaFv[] = Array.from(
      { length: 12 },
      () => ({
        consumo: 0,
        produzione: 0,
        autoconsumo: 0,
        immessa: 0,
        acquistata: 0,
      }),
    );
  let soc = 0,
    diretto = 0,
    daBatteria = 0,
    immessa = 0,
    acquistata = 0,
    perdite = 0;
  for (let i = 0; i < ore.length; i++) {
    const mese = ore[i].mese,
      c = consumo * ore[i].c,
      s = produzione * ore[i].s,
      m = mensili[mese];
    m.consumo += c;
    m.produzione += s;
    const uso = Math.min(c, s);
    diretto += uso;
    m.autoconsumo += uso;
    if (s > c) {
      const carica = Math.min(s - c, Math.max(0, capacita - soc) / eff),
        exportata = s - c - carica;
      soc += carica * eff;
      perdite += carica * (1 - eff);
      immessa += exportata;
      m.immessa += exportata;
    } else {
      const scarica = Math.min(c - s, Math.max(0, soc) * eff),
        importata = c - s - scarica;
      soc -= scarica / eff;
      daBatteria += scarica;
      perdite += scarica / eff - scarica;
      acquistata += importata;
      m.acquistata += importata;
      m.autoconsumo += scarica;
    }
  }
  const autoconsumo = diretto + daBatteria;
  return {
    consumo,
    produzione,
    autoconsumo,
    diretto,
    daBatteria,
    immessa,
    acquistata,
    perditeAccumulo: perdite,
    energiaFinaleBatteria: soc,
    coperturaConsumi: consumo ? autoconsumo / consumo : 0,
    quotaProduzioneUsata: produzione ? autoconsumo / produzione : 0,
    risparmioAcquisti: autoconsumo * input.costoEvitabileKwh,
    ricaviImmissione: immessa * input.prezzoImmissione,
    mensili,
  };
}
export type BilancioOrarioFv = {
  profilo: ProfiloOrarioFv;
  capacitaAccumulo: number;
  pesiProduzioneMensili?: number[];
};
export function flussiAnnoOrarioFv(
  produzione: number,
  consumo: number,
  bilancio: BilancioOrarioFv,
) {
  return simulaEnergiaFv({
    produzioneAnnua: produzione,
    consumoAnnuo: consumo,
    batteriaKwh: bilancio.capacitaAccumulo,
    costoEvitabileKwh: 0,
    prezzoImmissione: 0,
    profilo: bilancio.profilo,
    pesiProduzioneMensili: bilancio.pesiProduzioneMensili,
  });
}
export function consigliaModuliFv(
  input: {
    massimo: number;
    watt: number;
    consumoAnnuo: number;
    resaKwhKwp: number;
    profilo: ProfiloOrarioFv;
    obiettivo: "spesa" | "autoconsumo" | "copertura";
    copertura: number;
    pesiProduzioneMensili?: number[];
  },
) {
  if (
    !Number.isInteger(input.massimo) || input.massimo < 0 ||
    input.massimo > 2000 || !(input.watt > 0) || !(input.resaKwhKwp > 0) ||
    !(input.consumoAnnuo > 0)
  ) return null;
  const consumo = input.consumoAnnuo *
    (1 + input.profilo.aumentoConsumiPct / 100);
  const flussi = (n: number) =>
    simulaEnergiaFv({
      consumoAnnuo: input.consumoAnnuo,
      produzioneAnnua: n * input.watt / 1000 * input.resaKwhKwp,
      batteriaKwh: 0,
      costoEvitabileKwh: 1,
      prezzoImmissione: 0,
      profilo: input.profilo,
      pesiProduzioneMensili: input.pesiProduzioneMensili,
    });
  try {
    const massimo = flussi(input.massimo),
      target = input.obiettivo === "copertura"
        ? consumo * input.copertura
        : massimo.autoconsumo * .98;
    let basso = input.massimo ? 1 : 0, alto = input.massimo;
    while (basso < alto) {
      const meta = input.obiettivo === "autoconsumo"
          ? Math.ceil((basso + alto) / 2)
          : Math.floor((basso + alto) / 2),
        f = flussi(meta);
      if (input.obiettivo === "autoconsumo") {
        if (f.quotaProduzioneUsata >= .7) {
          basso = meta;
        } else alto = meta - 1;
      } else {if (f.autoconsumo >= target) alto = meta;
        else basso = meta + 1;}
    }
    const finale = flussi(basso),
      desiderati = Math.max(
        1,
        Math.ceil(
          consumo * input.copertura / (input.watt / 1000 * input.resaKwhKwp),
        ),
      );
    return {
      consigliati: basso,
      desiderati,
      limiteSpazio: input.obiettivo === "copertura" &&
        desiderati > input.massimo,
      coperturaRaggiunta: finale.coperturaConsumi,
      obiettivoRaggiungibile: input.obiettivo === "copertura"
        ? massimo.coperturaConsumi >= input.copertura
        : input.obiettivo === "autoconsumo"
        ? finale.quotaProduzioneUsata >= .7
        : true,
      criterio: input.obiettivo === "spesa"
        ? "Taglia minima che raggiunge il 98% del minor costo degli acquisti ottenibile con la massima posa e lo stesso profilo orario, senza accumulo."
        : input.obiettivo === "autoconsumo"
        ? "Taglia massima che mantiene almeno il 70% della produzione utilizzata sul posto, senza accumulo."
        : "Taglia minima che raggiunge la copertura oraria scelta, nei limiti del tetto disegnato.",
    };
  } catch {
    return null;
  }
}
