import { z } from "zod";

export const categorieCosto = {
  materiale: "Materiali", manodopera: "Manodopera", nolo: "Mezzi e noli",
  subappalto: "Subappalto", logistica: "Trasporto e smaltimento", altro: "Altri costi",
  spese: "Spese generali", imprevisti: "Imprevisti",
} as const;

const valore = z.string().max(32);
const testo = z.string().max(500);
const pianoTrasfertaSchema = z.object({
  metodo: z.enum(["km", "forfait", "comuni", "compresi"]),
  distanza: valore, viaggi: valore, veicoli: valore, tariffaKm: valore, consegne: valore,
  minuti: valore, persone: valore, tariffaOra: valore,
});
export type PianoTrasferta = z.infer<typeof pianoTrasfertaSchema>;
const risorsaSchema = z.object({
  id: z.string().uuid(), tipo: z.enum(["materiale", "manodopera", "nolo", "subappalto", "logistica", "altro", "spese", "imprevisti"]),
  nome: testo, unita: z.string().max(32), quantita: valore, fattore: valore, prezzo: valore,
  base: z.enum(["totale", "unitaria", "percentuale"]), fonte: testo,
  stima: z.object({
    origine: z.enum(["storico", "trasferta"]), riferimenti: z.array(z.string().uuid()).max(8).optional(),
    calcolataIl: z.string().datetime().optional(), piano: pianoTrasfertaSchema.optional(),
  }).optional(),
});
export const modalitaEsecuzioneSchema = z.enum(["interna", "subappalto", "mista", "fornitura"]);
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pianoTempiSchema = z.object({
  esecuzione: modalitaEsecuzioneSchema, partenza: dataISO, operai: valore, oreGiorno: valore, oreInterne: valore,
  minutiViaggio: valore, attesaMateriali: valore, attesaDitta: valore, durataDitta: valore,
  coordinamento: z.enum(["sequenza", "ditta_prima", "parallelo"]), sabato: z.boolean(), riserva: valore,
});
const stimaTempiSalvataSchema = z.object({
  piano: pianoTempiSchema, quantita: z.number().finite().positive(), unita: z.string().max(32),
  inizio: dataISO, fine: dataISO, fineMin: dataISO, fineMax: dataISO,
  riferimentoVoce: z.string().optional(),
  materialiPronti: dataISO.optional(),
  squadra: z.object({ inizio: dataISO, fine: dataISO }).optional(),
  impresa: z.object({ inizio: dataISO, fine: dataISO }).optional(),
  giorni: z.number().int().nonnegative(), calcolataIl: z.string().datetime(),
  riferimenti: z.array(z.string().uuid()).max(8),
});
export type PianoTempi = z.infer<typeof pianoTempiSchema>;
export type StimaTempiSalvata = z.infer<typeof stimaTempiSalvataSchema>;

const costiScope = z.array(risorsaSchema).max(120);
export const analisiCostiSchema = z.object({
  versione: z.literal(1), voci: z.record(z.string(), costiScope), fasi: z.record(z.string(), costiScope),
  generali: costiScope, alternative: z.record(z.string(), z.string().max(120)),
  tempistiche: z.record(z.string(), stimaTempiSalvataSchema).optional(),
});
export type AnalisiCosti = z.infer<typeof analisiCostiSchema>;
export type RisorsaCosto = z.infer<typeof risorsaSchema>;
export type TipoRisorsaCosto = RisorsaCosto["tipo"];
export const analisiVuota = (): AnalisiCosti => ({ versione: 1, voci: {}, fasi: {}, generali: [], alternative: {} });
export const risorsaVuota = (tipo: TipoRisorsaCosto = "materiale"): RisorsaCosto => ({
  id: crypto.randomUUID(), tipo, nome: "", unita: tipo === "manodopera" ? "h" : "",
  quantita: "1", fattore: "1", prezzo: "", base: "totale", fonte: "",
});

export function numeroCosto(testo: string): number | null {
  const s = testo.trim().replace(/\s/g, "");
  const canonico = s.includes(",") ? s.replaceAll(".", "").replace(",", ".") : s;
  if (!/^\d+(?:\.\d+)?$/.test(canonico)) return null;
  const n = Number(canonico);
  return Number.isFinite(n) && n <= 999_999_999 ? n : null;
}

// Corregge i confini a mezzo centesimo prima di arrotondare i valori monetari.
export const centesimiCosto = (euro: number) => Math.sign(euro) * Math.round((Math.abs(euro) + Number.EPSILON * Math.max(1, Math.abs(euro))) * 100);
export const soldi = (centesimi: number) => centesimi / 100;

export interface VoceAnalisi {
  id: string;
  codice?: string;
  tariffaId?: string | null;
  descrizione: string;
  descrizioneEstesa?: string;
  fase: string;
  quantita: number | null;
  unita: string;
  prezzo: number | null;
  venditaLorda?: number | null;
  vendita: number | null;
  costoUnitario: number | null;
  inclusa: boolean;
}

export function dettaglioRisorse(risorse: readonly RisorsaCosto[], quantita: number | null, baseDiretta = 0) {
  const misurate = risorse.map(risorsa => {
    const prezzo = numeroCosto(risorsa.prezzo);
    if (risorsa.base === "percentuale") return { risorsa, prezzo, importo: null as number | null };
    const q = numeroCosto(risorsa.quantita);
    const fattore = numeroCosto(risorsa.fattore);
    const scala = risorsa.base === "unitaria" ? quantita : 1;
    const importo = prezzo === null || q === null || fattore === null || scala === null
      ? null : centesimiCosto(prezzo * q * fattore * scala);
    return { risorsa, prezzo, importo };
  });
  const diretto = misurate.reduce((sum, r) => sum + (r.importo ?? 0), 0);
  const righe = misurate.map(r => r.risorsa.base !== "percentuale" || r.prezzo === null
    ? r : { ...r, importo: centesimiCosto(soldi(baseDiretta + diretto) * r.prezzo / 100) });
  return {
    righe, diretto, baseEsterna: baseDiretta, costo: righe.reduce((sum, r) => sum + (r.importo ?? 0), 0),
    incompleto: righe.some(r => r.importo === null || !r.risorsa.nome.trim()),
  };
}

export function analizzaPreventivo(analisi: AnalisiCosti, voci: readonly VoceAnalisi[], imponibile: number) {
  const righe = voci.map(voce => {
    const risorse = analisi.voci[voce.id] ?? [];
    const dettaglio = dettaglioRisorse(risorse, voce.quantita);
    const costoLegacy = voce.costoUnitario === null || voce.quantita === null
      ? null : centesimiCosto(voce.costoUnitario * voce.quantita);
    const costo = risorse.length ? dettaglio.costo : costoLegacy;
    const diretto = risorse.length ? dettaglio.diretto : costoLegacy ?? 0;
    const margine = costo === null || voce.vendita === null ? null : centesimiCosto(voce.vendita) - costo;
    return { voce, dettaglio, costo, diretto, margine, incompleto: costo === null || dettaglio.incompleto };
  });
  const incluse = righe.filter(r => r.voce.inclusa);
  const fasi = [...new Set(voci.map(voce => voce.fase).filter(Boolean))];
  const fasiConCosti = fasi.map(fase => {
    const righeFase = incluse.filter(r => r.voce.fase === fase);
    return { fase, inclusa: righeFase.length > 0, ...dettaglioRisorse(analisi.fasi[fase] ?? [], null,
      righeFase.reduce((sum, r) => sum + r.diretto, 0)) };
  });
  const fasiIncluse = fasiConCosti.filter(f => f.inclusa);
  const generali = dettaglioRisorse(analisi.generali, null, incluse.reduce((sum, r) => sum + r.diretto, 0) +
    fasiIncluse.reduce((sum, f) => sum + f.diretto, 0));
  const comuni = fasiIncluse.reduce((sum, f) => sum + f.costo, generali.costo);
  const costo = incluse.reduce((sum, r) => sum + (r.costo ?? 0), comuni);
  const mancanti = incluse.filter(r => r.incompleto).length;
  const margine = centesimiCosto(imponibile) - costo;
  return {
    righe, fasi: fasiConCosti, generali, costo, comuni, imponibile, mancanti, margine,
    incompleto: mancanti > 0 || generali.incompleto || fasiIncluse.some(f => f.incompleto),
    percentuale: imponibile > 0 ? soldi(margine) / imponibile * 100 : null,
    ricarico: costo > 0 ? margine / costo * 100 : null,
  };
}

export function prezzoDaCosto(costo: number, percentuale: number | null, metodo: "margine" | "ricarico"): number | null {
  if (percentuale === null || percentuale < 0 || (metodo === "margine" && percentuale >= 100)) return null;
  const prezzo = metodo === "margine" ? costo / (1 - percentuale / 100) : costo * (1 + percentuale / 100);
  return soldi(centesimiCosto(prezzo));
}

export function ripartisciCosto(totale: number, pesi: readonly number[]): number[] {
  const somma = pesi.reduce((s, peso) => s + Math.max(0, peso), 0);
  let cumulato = 0;
  let assegnato = 0;
  return pesi.map(peso => {
    cumulato += Math.max(0, peso);
    const finoQui = somma > 0 ? Math.round(totale * cumulato / somma) : 0;
    const quota = finoQui - assegnato;
    assegnato = finoQui;
    return quota;
  });
}

export type QuotaCostiComuni = { fase: number; preventivo: number; parziale: boolean };

export function costoCompletoVoce(riga: Pick<ReturnType<typeof analizzaPreventivo>["righe"][number], "costo" | "incompleto">, quota?: QuotaCostiComuni | null) {
  return riga.costo === null || riga.incompleto || quota?.parziale ? null
    : riga.costo + (quota?.fase ?? 0) + (quota?.preventivo ?? 0);
}

export function quoteCostiComuni(calcolo: ReturnType<typeof analizzaPreventivo>, vociProiettate?: readonly VoceAnalisi[]): Map<string, QuotaCostiComuni> {
  const incluse = calcolo.righe.filter(r => r.voce.inclusa);
  const vendite = vociProiettate && new Map(vociProiettate.map(v => [v.id, v.vendita]));
  const pesi = incluse.map(({ voce }) => Math.max(0, (vendite ? vendite.get(voce.id) : voce.vendita) ?? 0) || 1);
  const generali = ripartisciCosto(calcolo.generali.costo, pesi);
  const percentualeSuCosti = (righe: typeof calcolo.generali.righe) => righe.some(r => r.risorsa.base === "percentuale");
  const fasi = new Map(calcolo.fasi.filter(f => f.inclusa).map(f => {
    const proprie = incluse.map((r, i) => r.voce.fase === f.fase ? pesi[i] : 0);
    const parziale = f.incompleto || (percentualeSuCosti(f.righe) && incluse.some(r => r.voce.fase === f.fase && r.incompleto));
    return [f.fase, { quote: ripartisciCosto(f.costo, proprie), parziale }];
  }));
  const generaliParziali = calcolo.generali.incompleto || (percentualeSuCosti(calcolo.generali.righe) &&
    (incluse.some(r => r.incompleto) || [...fasi.values()].some(f => f.parziale)));
  return new Map(incluse.map((r, i) => {
    const fase = fasi.get(r.voce.fase);
    return [r.voce.id, { fase: fase?.quote[i] ?? 0, preventivo: generali[i], parziale: generaliParziali || !!fase?.parziale }];
  }));
}

/** Proietta i costi completi sulle sole lavorazioni vendute per il budget esistente. */
export function budgetAnalisi(calcolo: ReturnType<typeof analizzaPreventivo>) {
  if (calcolo.incompleto) return {};
  const quote = quoteCostiComuni(calcolo);
  return Object.fromEntries(calcolo.righe.flatMap(r => {
    const q = r.voce.quantita;
    const quota = quote.get(r.voce.id);
    if (!quota || r.costo === null || q === null || q <= 0) return [];
    const costo = r.costo + quota.preventivo + quota.fase;
    return [[r.voce.id, soldi(costo) / q]];
  }));
}

export const euroAnalisi = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true });
