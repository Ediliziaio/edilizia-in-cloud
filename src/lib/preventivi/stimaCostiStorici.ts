import { z } from "zod";
import { normalizzaTesto, normalizzaUnita } from "@/lib/distinta/generaDistinta";
import {
  centesimiCosto, dettaglioRisorse, numeroCosto, soldi,
  type PianoTrasferta, type RisorsaCosto, type VoceAnalisi,
} from "./analisiCosti";

const positivo = z.number().finite().positive();
const nonNegativo = z.number().finite().nonnegative();
export const riferimentiStoriciSchema = z.array(z.object({
  id: z.string().uuid(), commessaId: z.string().uuid(), numero: z.string().nullable(),
  codice: z.string().nullable(), descrizione: z.string(), tipoLavoro: z.string().nullable(),
  unita: z.string().nullable(), quantita: positivo, completataIl: z.string(),
  stessoCodice: z.boolean(), ore: nonNegativo, kmAndata: nonNegativo.nullable(),
  giorniDitta: z.number().int().positive().nullish(), giorniConsegna: z.number().int().nonnegative().nullish(),
  kmRimborsati: nonNegativo.nullable(), tariffaKm: nonNegativo.nullable(), vendutoUnitario: positivo.nullable(),
  costi: z.object({
    acquisti: nonNegativo, operai: nonNegativo, ditte: nonNegativo, mezzi: nonNegativo,
    altri: nonNegativo, trasporti: nonNegativo,
  }),
}));
export type RiferimentoStorico = z.infer<typeof riferimentiStoriciSchema>[number];

export const modalitaEsecuzione = {
  interna: "Squadra interna", subappalto: "Subappalto", mista: "Interni e subappalto", fornitura: "Solo fornitura",
} as const;
export type ModalitaEsecuzione = keyof typeof modalitaEsecuzione;

function modalita(r: RiferimentoStorico): ModalitaEsecuzione {
  if (r.costi.ditte > 0) return r.costi.operai > 0 ? "mista" : "subappalto";
  return r.costi.operai > 0 ? "interna" : "fornitura";
}

export function unitaVerificata(value: string | null) {
  if (!value?.trim()) return null;
  const unita = normalizzaUnita(value);
  return ["pz", "cad"].includes(unita) ? "pz" : unita === "%" ? null : unita;
}

// I numeri e la distinzione tra sola posa / fornitura fanno parte della voce.
function perimetro(testo: string) {
  const fornitura = /\bfornitur\w*\b/.test(testo);
  const posa = /\b(posa|installazion\w*|montaggio)\b/.test(testo);
  return fornitura ? (posa ? "fornitura e posa" : "fornitura") : posa ? "posa" : "";
}

function somiglianza(a: string, b: string) {
  const token = (s: string) => new Set(s.split(" ").filter(x => x.length > 2));
  const primo = token(a);
  const secondo = token(b);
  return [...primo].filter(t => secondo.has(t)).length / new Set([...primo, ...secondo]).size;
}

export function confrontaStorico(
  voce: VoceAnalisi, riferimenti: readonly RiferimentoStorico[],
  opzioni: { esecuzione?: ModalitaEsecuzione; tipoLavoro?: string; simili?: boolean; al?: string } = {},
) {
  const q = voce.quantita;
  const unita = unitaVerificata(voce.unita);
  const descrizione = normalizzaTesto(voce.descrizione);
  if (q === null || q <= 0 || !unita || !descrizione) return [];
  const tipo = normalizzaTesto(opzioni.tipoLavoro);
  const confrontabili = riferimenti.flatMap(r => {
    if (unitaVerificata(r.unita) !== unita || r.quantita < q / 2 || r.quantita > q * 2 ||
      (opzioni.al && Date.parse(r.completataIl) >= Date.parse(opzioni.al))) return [];
    const testo = normalizzaTesto(r.descrizione);
    const opera = perimetro(descrizione);
    const storico = perimetro(testo);
    if (opera && storico && opera !== storico) return [];
    const cifre = (t: string) => t.match(/\b\d+(?:\.\d+)?\b/g)?.join(" ") ?? "";
    if (cifre(descrizione) !== cifre(testo)) return [];
    const altroTipo = normalizzaTesto(r.tipoLavoro);
    if (tipo && altroTipo && tipo !== altroTipo) return [];
    const esecuzione = modalita(r);
    if (opzioni.esecuzione && esecuzione !== opzioni.esecuzione) return [];
    const motivo = r.stessoCodice ? "Codice o tariffa" : testo === descrizione ? "Stessa descrizione"
      : opzioni.simili && unita !== "a corpo" && somiglianza(descrizione, testo) >= 0.55 ? "Descrizione simile" : null;
    if (!motivo) return [];
    return [{ ...r, esecuzione, motivo, scala: Math.abs(Math.log(r.quantita / q)) }];
  }).sort((a, b) => Number(b.stessoCodice) - Number(a.stessoCodice) ||
    Number(b.motivo === "Stessa descrizione") - Number(a.motivo === "Stessa descrizione") ||
    Date.parse(b.completataIl) - Date.parse(a.completataIl) || a.scala - b.scala);
  const ricorrenze = new Map<ModalitaEsecuzione, Set<string>>();
  for (const r of confrontabili) {
    const commesse = ricorrenze.get(r.esecuzione) ?? new Set<string>();
    commesse.add(r.commessaId);
    ricorrenze.set(r.esecuzione, commesse);
  }
  const prevalente = opzioni.esecuzione ?? [...ricorrenze.entries()].sort((a, b) => b[1].size - a[1].size)[0]?.[0];
  const visti = new Set<string>();
  return confrontabili.filter(r => {
    if (r.esecuzione !== prevalente || visti.has(r.commessaId)) return false;
    visti.add(r.commessaId);
    return true;
  }).slice(0, 8);
}

export function mediana(valori: number[]): number | null {
  if (!valori.length) return null;
  const ordinati = valori.sort((a, b) => a - b);
  const meta = Math.floor(ordinati.length / 2);
  return ordinati.length % 2 ? ordinati[meta] : (ordinati[meta - 1] + ordinati[meta]) / 2;
}
const decimale = (n: number, posti = 6) => String(Number(n.toFixed(posti)));
type Campione = ReturnType<typeof confrontaStorico>;
type BaseRisorsa = Pick<RisorsaCosto, "tipo" | "nome" | "unita" | "quantita" | "fattore" | "prezzo" | "base" | "fonte">;

export function stimaLavorazione(
  campione: Campione, q: number, unita: string, tariffe: { costoOra?: number; offertaDitta?: number; oreTotali?: number } = {},
) {
  if (campione.length === 0 || q <= 0) return null;
  const fonte = `Storico · ${campione.map(r => r.numero || r.commessaId).join(", ")}`.slice(0, 500);
  const perUnita = (chiave: keyof RiferimentoStorico["costi"]) =>
    mediana(campione.map(r => r.costi[chiave] / r.quantita)) ?? 0;
  const oreDaPiano = tariffe.oreTotali != null && tariffe.oreTotali > 0;
  const oreUnitarie = oreDaPiano ? tariffe.oreTotali! / q : mediana(campione.flatMap(r => r.ore > 0 ? [r.ore / r.quantita] : []));
  const oreNote = oreDaPiano || campione.every(r => r.costi.operai === 0 || r.ore > 0);
  const costoOraStorico = mediana(campione.flatMap(r => r.ore > 0 && r.costi.operai > 0 ? [r.costi.operai / r.ore] : []));
  const prezzoOra = tariffe.costoOra ?? costoOraStorico;
  function voce(tipo: RisorsaCosto["tipo"], nome: string, prezzo: number, ore?: number): BaseRisorsa {
    return { tipo, nome, unita: ore === undefined ? unita : "h", quantita: decimale(ore ?? 1),
      fattore: "1", prezzo: decimale(prezzo, ore === undefined ? 6 : 4), base: "unitaria", fonte };
  }
  const costoSquadra = perUnita("operai");
  const costoDitta = perUnita("ditte");
  const risorse = [
    voce("materiale", "Acquisti e magazzino", perUnita("acquisti")),
    prezzoOra !== null && oreUnitarie !== null && oreNote ? {
      ...voce("manodopera", "Ore operai e squadre interne", prezzoOra, oreUnitarie),
      fonte: oreDaPiano
        ? (tariffe.costoOra === undefined ? "Ore dal piano · tariffa dallo storico" : "Ore dal piano · tariffa indicata")
        : tariffe.costoOra === undefined ? fonte : "Ore dallo storico · tariffa oraria indicata nel preventivo",
    } : voce("manodopera", "Costo squadre interne", costoSquadra),
    tariffe.offertaDitta !== undefined ? {
      ...voce("subappalto", "Offerta ditta a corpo", tariffe.offertaDitta),
      unita: "a corpo", base: "totale" as const, fonte: "Offerta ditta indicata nel preventivo",
    } : voce("subappalto", "Costo ditte e subappalti", costoDitta),
    voce("nolo", "Mezzi, attrezzature e noli", perUnita("mezzi")),
    voce("altro", "Altri costi di lavorazione", perUnita("altri")),
  ].filter(r => Number(r.prezzo) > 0 || (r.tipo === "subappalto" && tariffe.offertaDitta === 0) ||
    (r.tipo === "manodopera" && oreUnitarie !== null && oreNote && tariffe.costoOra === 0));
  const stima = { origine: "storico" as const, riferimenti: campione.map(r => r.commessaId) };
  const importi = risorse.map(r => ({ ...r, stima, id: r.tipo }));
  const costo = dettaglioRisorse(importi, q).costo;
  const confronti = campione.map(r => {
    const operai = oreDaPiano && prezzoOra !== null ? tariffe.oreTotali! * prezzoOra
      : (!oreNote || tariffe.costoOra === undefined || r.ore <= 0 ? r.costi.operai : r.ore * tariffe.costoOra) * q / r.quantita;
    return centesimiCosto((r.costi.acquisti + r.costi.mezzi + r.costi.altri) * q / r.quantita +
      operai + (tariffe.offertaDitta ?? r.costi.ditte * q / r.quantita));
  });
  const vendutoStorico = mediana(campione.flatMap(r => r.vendutoUnitario === null ? [] : [r.vendutoUnitario * q]));
  return {
    costo, risorse: importi, ore: oreNote ? (oreUnitarie ?? 0) * q : null, vendutoStorico, prezzoOraStorico: costoOraStorico,
    tariffaOraUsata: prezzoOra,
    minimo: Math.min(...confronti), massimo: Math.max(...confronti),
    tariffaKmStorica: mediana(campione.flatMap(r => r.tariffaKm === null ? [] : [r.tariffaKm])),
  };
}

/** Ri-stima ogni consuntivo con lavori chiusi prima di quello esaminato. */
export function verificaStimeDaiConsuntivi(campione: readonly RiferimentoStorico[]) {
  const erroriCosto: number[] = [];
  const erroriOre: number[] = [];
  for (const consuntivo of campione) {
    const unita = unitaVerificata(consuntivo.unita);
    if (!unita || !Number.isFinite(Date.parse(consuntivo.completataIl))) continue;
    const v: VoceAnalisi = {
      id: consuntivo.id, codice: consuntivo.codice ?? undefined, descrizione: consuntivo.descrizione, unita, fase: "",
      quantita: consuntivo.quantita, prezzo: null, vendita: null, venditaLorda: null, costoUnitario: null, inclusa: true,
    };
    const precedenti = confrontaStorico(v, campione.filter(r => r.commessaId !== consuntivo.commessaId && Number.isFinite(Date.parse(r.completataIl))).map(r => ({
      ...r, stessoCodice: !!consuntivo.codice && r.codice === consuntivo.codice,
    })), { tipoLavoro: consuntivo.tipoLavoro ?? undefined, esecuzione: modalita(consuntivo), al: consuntivo.completataIl });
    if (precedenti.length < 2) continue;
    const stima = stimaLavorazione(precedenti, consuntivo.quantita, unita);
    if (!stima) continue;
    const { acquisti, operai, ditte, mezzi, altri } = consuntivo.costi;
    const diretto = acquisti + operai + ditte + mezzi + altri;
    if (diretto > 0 && stima.costo > 0) erroriCosto.push(Math.abs(soldi(stima.costo) - diretto) / diretto);
    if (consuntivo.ore > 0 && stima.ore !== null && stima.ore > 0) erroriOre.push(Math.abs(stima.ore - consuntivo.ore) / consuntivo.ore);
  }
  return { costo: mediana(erroriCosto), casiCosto: erroriCosto.length, ore: mediana(erroriOre), casiOre: erroriOre.length };
}

export function stimaTrasferta(dati: PianoTrasferta): { costo: number; righe: BaseRisorsa[] } | null {
  if (dati.metodo === "comuni" || dati.metodo === "compresi") return { costo: 0, righe: [] };
  const consegne = dati.consegne.trim() ? numeroCosto(dati.consegne) : null;
  const righe: BaseRisorsa[] = [];
  if (dati.metodo === "km") {
    const km = numeroCosto(dati.distanza);
    const viaggi = numeroCosto(dati.viaggi);
    const veicoli = numeroCosto(dati.veicoli);
    const tariffa = numeroCosto(dati.tariffaKm);
    if (km === null || tariffa === null || !viaggi || !veicoli ||
      !Number.isInteger(viaggi) || !Number.isInteger(veicoli)) return null;
    const kmTotali = 2 * km * viaggi * veicoli;
    if (numeroCosto(decimale(kmTotali)) === null) return null;
    const fonte = `${dati.distanza} km di andata × 2 × ${viaggi} viaggi × ${veicoli} mezzi`;
    righe.push({ tipo: "logistica", nome: "Trasferta sede–cantiere", unita: "km", quantita: decimale(kmTotali),
      fattore: "1", prezzo: dati.tariffaKm, base: "totale", fonte });
    if (dati.minuti || dati.persone || dati.tariffaOra) {
      const minuti = numeroCosto(dati.minuti);
      const persone = numeroCosto(dati.persone);
      const tariffaOra = numeroCosto(dati.tariffaOra);
      if (minuti === null || persone === null || tariffaOra === null || persone <= 0 || !Number.isInteger(persone)) return null;
      const ore = minuti * 2 * viaggi * persone / 60;
      if (numeroCosto(decimale(ore)) === null) return null;
      righe.push({ tipo: "manodopera", nome: "Tempo di trasferta degli operai", unita: "h", quantita: decimale(ore),
        fattore: "1", prezzo: dati.tariffaOra, base: "totale",
        fonte: `${dati.minuti} min di andata × 2 × ${viaggi} viaggi × ${persone} persone ÷ 60` });
    }
  }
  if ((dati.metodo === "forfait" || dati.consegne.trim()) && consegne === null) return null;
  if (consegne !== null) righe.push({
    tipo: "logistica", nome: dati.metodo === "forfait" ? "Trasporti a forfait" : "Consegne e altri trasporti",
    unita: "a corpo", quantita: "1", fattore: "1", prezzo: dati.consegne, base: "totale", fonte: "Piano trasporti del preventivo",
  });
  const costo = dettaglioRisorse(righe.map(r => ({ ...r, id: r.nome })), null).costo;
  return { costo, righe };
}

export function risorseTrasfertaEsistenti(righe: readonly RisorsaCosto[]) {
  return righe.some(r => r.stima?.origine === "trasferta" || r.tipo === "logistica");
}

export function aggiornaTrasferta(righe: readonly RisorsaCosto[], dati: PianoTrasferta, anteprima = false) {
  const piano = stimaTrasferta(dati);
  if (!piano || dati.metodo === "comuni") return [...righe];
  return [
    ...righe.filter(r => r.stima?.origine !== "trasferta"),
    ...piano.righe.map((r, i) => ({
      ...r, id: anteprima ? `anteprima-trasferta-${i}` : crypto.randomUUID(), stima: { origine: "trasferta" as const, piano: i === 0 ? dati : undefined },
    })),
  ];
}
