import { addDays, format, isValid, parseISO } from "date-fns";
import { normalizzaTesto } from "@/lib/distinta/generaDistinta";
import { fineLavorativa, primoLavorativo, type GiornoLavorativo } from "@/lib/orders/sottofasi";
import { giorniPrevisti } from "@/lib/orders/previsionaleLavoro";
import { numeroCosto, type AnalisiCosti, type PianoTempi, type StimaTempiSalvata, type VoceAnalisi } from "./analisiCosti";
import { mediana, type RiferimentoStorico } from "./stimaCostiStorici";

type Fascia = { minimo: number; tipico: number; massimo: number };
type Osservazione = { valore: number; commessaId: string };
type Durata = Fascia & { fonti: string[] };

function riassumi(valori: Osservazione[]): Durata | null {
  if (!valori.length) return null;
  const numeri = valori.map(v => v.valore);
  return { minimo: Math.min(...numeri), tipico: mediana(numeri)!, massimo: Math.max(...numeri), fonti: valori.map(v => v.commessaId) };
}

export function riferimentiTempi(campione: readonly RiferimentoStorico[], quantita: number | null) {
  const osserva = (chiave: "ore" | "giorniDitta" | "giorniConsegna") => riassumi(campione.flatMap(r => {
    const dato = r[chiave];
    if (dato == null || (chiave !== "giorniConsegna" && (dato <= 0 || quantita == null || quantita <= 0))) return [];
    return [{ valore: chiave === "giorniConsegna" ? dato : dato * (quantita ?? 0) / r.quantita, commessaId: r.commessaId }];
  }));
  return { ore: osserva("ore"), ditta: osserva("giorniDitta"), materiali: osserva("giorniConsegna") };
}

export const conOperai = (esecuzione: PianoTempi["esecuzione"]) => esecuzione === "interna" || esecuzione === "mista";
export const conDitta = (esecuzione: PianoTempi["esecuzione"]) => esecuzione === "subappalto" || esecuzione === "mista";
const fissa = (n: number): Durata => ({ minimo: n, tipico: n, massimo: n, fonti: [] });
const giorniInteri = (n: number) => n > 0 ? Math.max(1, Math.ceil(n - 1e-9)) : 0;
const dataKPI = (d: Date) => format(d, "yyyy-MM-dd");
const traGiorni = (dal: string, giorni: number) => dataKPI(addDays(parseISO(dal), giorni));
const maxData = (a: string, b: string) => a > b ? a : b;
const minData = (a: string, b: string) => a < b ? a : b;

function ingresso(testo: string, massimo: number, interi: boolean) {
  const n = numeroCosto(testo);
  return n !== null && n <= massimo && (!interi || Number.isInteger(n)) ? n : null;
}

export function stimaTempistiche(
  piano: PianoTempi, storico: ReturnType<typeof riferimentiTempi>, lavorativo: GiornoLavorativo,
) {
  const operai = conOperai(piano.esecuzione);
  const ditta = conDitta(piano.esecuzione);
  const persone = ingresso(piano.operai, 1000, true);
  const oreGiorno = ingresso(piano.oreGiorno, 24, false);
  const minuti = ingresso(piano.minutiViaggio || "0", 720, false);
  const oreProduttive = oreGiorno !== null && minuti !== null ? oreGiorno - 2 * minuti / 60 : null;
  const oreManuali = ingresso(piano.oreInterne, 9_999_999, false);
  const ore = !operai ? fissa(0) : piano.oreInterne.trim() ? oreManuali !== null && oreManuali > 0 ? fissa(oreManuali) : null : storico.ore;
  const durataManuale = ingresso(piano.durataDitta, 730, true);
  const durataDitta = !ditta ? fissa(0) : piano.durataDitta.trim()
    ? durataManuale !== null && durataManuale > 0 ? fissa(durataManuale) : null : storico.ditta;
  const materialiManuali = ingresso(piano.attesaMateriali, 730, true);
  const materiali = piano.attesaMateriali.trim() ? materialiManuali !== null ? fissa(materialiManuali) : null : storico.materiali;
  const attesaDitta = ditta ? ingresso(piano.attesaDitta, 730, true) : 0;
  const riserva = ingresso(piano.riserva || "0", 730, true);
  const capacita = operai && persone && oreProduttive !== null ? persone * oreProduttive : null;
  const dataPartenza = parseISO(piano.partenza);
  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(piano.partenza) && isValid(dataPartenza);
  const problemi = [
    !dataValida && { campo: "partenza", testo: "data di partenza" },
    operai && (!capacita || capacita <= 0) && { campo: !persone ? "operai" : !oreGiorno ? "oreGiorno" : "minutiViaggio", testo: "capacità della squadra" },
    !ore && { campo: "oreInterne", testo: "ore totali degli operai" },
    !durataDitta && { campo: "durataDitta", testo: "durata del subappalto" },
    !materiali && { campo: "attesaMateriali", testo: "attesa dei materiali" },
    attesaDitta === null && { campo: "attesaDitta", testo: "disponibilità della ditta" },
    riserva === null && { campo: "riserva", testo: "giorni di riserva" },
  ].filter((v): v is { campo: string; testo: string } => Boolean(v));
  const mancanti = problemi.map(p => p.testo);
  const giorniInterni = ore && capacita && capacita > 0 ? giorniInteri(ore.tipico / capacita) : null;
  const base = { problemi, mancanti, oreProduttive, ore, giorniInterni, durataDitta, materiali, attesaDitta };
  if (mancanti.length || !ore || !durataDitta || !materiali || attesaDitta === null || riserva === null) return { ...base, previsione: null };
  if ((operai && ore.massimo / (capacita ?? 1) > 730) || durataDitta.massimo > 730 || materiali.massimo > 730)
    return { ...base, mancanti: ["durate entro 730 giorni per attività"], previsione: null };

  const esecuzione = (pronti: string, giorni: number) => {
    if (!giorni) return null;
    const inizio = primoLavorativo(pronti, lavorativo);
    return { inizio, fine: fineLavorativa(inizio, giorni, lavorativo) };
  };
  function scenario(k: keyof Fascia) {
    const giorniSquadra = operai ? giorniInteri(ore[k] / (capacita ?? 1)) : 0;
    const giorniDitta = giorniInteri(durataDitta[k]);
    const materialiPronti = primoLavorativo(traGiorni(piano.partenza, giorniInteri(materiali[k])), lavorativo);
    const disponibilita = maxData(materialiPronti, traGiorni(piano.partenza, attesaDitta));
    let squadra = esecuzione(materialiPronti, giorniSquadra);
    let impresa = esecuzione(disponibilita, giorniDitta);
    if (squadra && impresa) {
      if (piano.coordinamento === "sequenza") impresa = esecuzione(maxData(disponibilita, traGiorni(squadra.fine, 1)), giorniDitta);
      if (piano.coordinamento === "ditta_prima") squadra = esecuzione(traGiorni(impresa.fine, 1), giorniSquadra);
    }
    const inizio = squadra ? minData(squadra.inizio, impresa?.inizio ?? squadra.inizio) : impresa?.inizio ?? materialiPronti;
    const fine = maxData(squadra?.fine ?? materialiPronti, impresa?.fine ?? materialiPronti);
    const fineConRiserva = riserva ? fineLavorativa(traGiorni(fine, 1), riserva, lavorativo) : fine;
    return { inizio, fine: fineConRiserva, squadra, impresa, materialiPronti };
  }

  const tipico = scenario("tipico");
  const giorniDitta = giorniInteri(durataDitta.tipico);
  // Se le due squadre si sovrappongono si computa l'unione dei relativi giorni operativi.
  const { squadra, impresa } = tipico;
  const contemporanei = squadra && impresa
    ? giorniPrevisti(maxData(squadra.inizio, impresa.inizio), minData(squadra.fine, impresa.fine), lavorativo) ?? 0 : 0;
  return { ...base, previsione: {
    ...tipico, fineMin: scenario("minimo").fine, fineMax: scenario("massimo").fine,
    giorni: (giorniInterni ?? 0) + giorniDitta - contemporanei,
    riferimenti: [...new Set([...ore.fonti, ...durataDitta.fonti, ...materiali.fonti])],
  } };
}

type PrevisioneTempi = NonNullable<ReturnType<typeof stimaTempistiche>["previsione"]>;
const riferimentoVoce = (voce: VoceAnalisi) => JSON.stringify([
  normalizzaTesto(voce.descrizione), voce.codice?.trim().toLowerCase() ?? "", voce.tariffaId ?? "",
]);
export function tempisticheDaSalvare(voce: VoceAnalisi, piano: PianoTempi, previsione: PrevisioneTempi): StimaTempiSalvata | null {
  if (voce.quantita === null || voce.quantita <= 0) return null;
  const { inizio, fine, fineMin, fineMax, giorni, riferimenti, materialiPronti, squadra, impresa } = previsione;
  return {
    piano, quantita: voce.quantita, unita: voce.unita, riferimentoVoce: riferimentoVoce(voce),
    inizio, fine, fineMin, fineMax, giorni, riferimenti, materialiPronti,
    squadra: squadra ?? undefined, impresa: impresa ?? undefined, calcolataIl: new Date().toISOString(),
  };
}

const giornoBreve = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const formatoDataStima = (data: string) => {
  const giorno = new Date(data + "T00:00:00Z");
  return isValid(giorno) ? giornoBreve.format(giorno) : "—";
};
export const stimaTempiAggiornata = (stima: Pick<StimaTempiSalvata, "quantita" | "unita" | "riferimentoVoce">, voce: VoceAnalisi) =>
  stima.quantita === voce.quantita && stima.unita === voce.unita &&
  (stima.riferimentoVoce === undefined || stima.riferimentoVoce === riferimentoVoce(voce));

export function stessaPrevisione(salvata: StimaTempiSalvata | undefined, voce: VoceAnalisi, piano: PianoTempi, previsione: PrevisioneTempi | null) {
  return !!salvata && !!previsione && stimaTempiAggiornata(salvata, voce) &&
    (Object.keys(piano) as (keyof PianoTempi)[]).every(k => piano[k] === salvata.piano[k]) &&
    previsione.inizio === salvata.inizio && previsione.fine === salvata.fine && previsione.giorni === salvata.giorni &&
    previsione.fineMin === salvata.fineMin && previsione.fineMax === salvata.fineMax &&
    (!salvata.materialiPronti || (previsione.materialiPronti === salvata.materialiPronti &&
      previsione.squadra?.inizio === salvata.squadra?.inizio && previsione.squadra?.fine === salvata.squadra?.fine &&
      previsione.impresa?.inizio === salvata.impresa?.inizio && previsione.impresa?.fine === salvata.impresa?.fine)) &&
    previsione.riferimenti.join() === salvata.riferimenti.join();
}

export function riepilogoTempistiche(voci: readonly VoceAnalisi[], tempistiche: AnalisiCosti["tempistiche"]) {
  const fasi = new Map<string, { voce: VoceAnalisi; stima: StimaTempiSalvata | undefined; daRicalcolare: boolean }[]>();
  for (const voce of voci) {
    if (!voce.inclusa) continue;
    const salvata = tempistiche?.[voce.id];
    const daRicalcolare = !!salvata && !stimaTempiAggiornata(salvata, voce);
    const fase = voce.fase || "Lavorazioni";
    const righe = fasi.get(fase) ?? [];
    righe.push({ voce, stima: daRicalcolare ? undefined : salvata, daRicalcolare });
    fasi.set(fase, righe);
  }
  const gruppi = [...fasi].map(([fase, righe]) => {
    const date = righe.flatMap(r => r.stima ? [r.stima] : []);
    const inizio = date.map(d => d.inizio).sort().at(0);
    const fine = date.map(d => d.fine).sort().at(-1);
    return { fase, righe, inizio, fine, pronte: date.length };
  });
  const inOrdine = gruppi.flatMap(g => g.inizio && g.fine ? [{ fase: g.fase, inizio: g.inizio, fine: g.fine }] : [])
    .sort((a, b) => a.inizio.localeCompare(b.inizio));
  const sovrapposte = new Set<string>();
  let precedente: (typeof inOrdine)[number] | undefined;
  for (const fase of inOrdine) {
    if (precedente?.fine && precedente.fine >= fase.inizio) {
      sovrapposte.add(precedente.fase);
      sovrapposte.add(fase.fase);
    }
    if (!precedente || fase.fine > precedente.fine) precedente = fase;
  }
  return {
    gruppi, inizio: inOrdine[0]?.inizio, fine: precedente?.fine, sovrapposte, totali: gruppi.reduce((n, g) => n + g.righe.length, 0),
    pronte: gruppi.reduce((n, g) => n + g.pronte, 0),
  };
}
