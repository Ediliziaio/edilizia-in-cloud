/**
 * Il cronoprogramma calcolato (2/11/2026): stesse voci, stesse durate, sempre, e nessun credito AI.
 * Nelle simulazioni l'AI dava allo stesso computo durate fino al doppio da una prova all'altra.
 *
 * Le voci si riconoscono dalle parole e vanno nella loro lavorazione; ogni lavorazione ha il suo
 * posto nella sequenza di cantiere. La durata è ore ÷ (persone × ore utili al giorno), con le ore
 * di calcolo.ts. Stagionature e asciugature sono attese fisse che non occupano squadre.
 *
 * Funzioni pure, compatibili con Deno.
 */
import { IPOTESI_PREDEFINITE, oreDellaVoce, type Incidenza, type Ipotesi, type VoceCantiere } from "./calcolo.ts";

export interface VoceCrono {
  capitolo?: string | null; descrizione: string; unita?: string | null; quantita?: number | null; importo?: number | null;
  costo_manodopera?: number | null; costo_materiali?: number | null; ore_previste?: number | null; incidenza?: Incidenza | null;
  /** Gli oneri della sicurezza del computo: nel totale, ma non sono una lavorazione. */
  sicurezza?: boolean | null;
}

export interface FaseCalcolataCrono {
  nome: string; inizio: number; durata: number;
  /** Va nel PDF del cliente: mai ore, stime o avvisi per l'impresa. */
  nota: string;
  ore: number; attesa: boolean;
}

export interface CronoCalcolato {
  fasi: FaseCalcolataCrono[];
  giorni: number;
  ore: number; oreMin: number; oreMax: number;
  voci: number; vociSenzaDati: number; vociNonRiconosciute: number;
  /** Quante voci hanno ore stimate dal prezzario. */
  vociStimate: number;
  /** Materiali senza lavoro: nessuna ora, per scelta. */
  vociSoloFornitura: number;
  /** Solo per chi prepara il preventivo: non va nel PDF. */
  avvisoInterno: string;
}

export interface SquadreCrono { squadre: number; personePerSquadra: number }
/** Gli stessi 2 operai del calcolo tempi dei preventivatori (stimaTempi): stesso lavoro, stessi numeri. */
export const SQUADRE_PREDEFINITE: SquadreCrono = { squadre: 1, personePerSquadra: 2 };

interface Lavorazione { nome: string; parole: RegExp; rango: number; attesa?: { nome: string; giorni: number } }

/**
 * In ordine di controllo: conta la prima che combacia, così «Demolizione massetti» è una demolizione.
 * Con lo stesso rango le lavorazioni possono stare insieme, se ci sono abbastanza squadre.
 */
const LAVORAZIONI: readonly Lavorazione[] = [
  { nome: "Ponteggi", parole: /ponteg|trabatt/i, rango: 1 },
  { nome: "Demolizioni e rimozioni", parole: /demoli|rimozion|smontagg|sgomber|dismission|discaric|macerie|smaltiment/i, rango: 2 },
  { nome: "Scavi e fondazioni", parole: /\bscav|sbanc|fondazion/i, rango: 3 },
  { nome: "Strutture", parole: /struttur|calcestruzz|cemento armato|\bsolai|\btravi|pilastr|carpenter/i, rango: 4 },
  { nome: "Copertura", parole: /copertur|\bmanto (?!erbos)|\btett|\bcopp[oi]\b|tegol|lattoner|grondai/i, rango: 5 },
  { nome: "Impianti", parole: /impiant|elettric|idraul|\bidric|riscaldament|condizionat|climatizzat|\bsplit\b|caldai|fotovolt|punti luce|\bquadro\b|\bscaric/i, rango: 5 },
  { nome: "Murature e tramezzi", parole: /tramezz|laterizi|muratur|murari|mattoni|cartongess|contropar|controsoff/i, rango: 5 },
  { nome: "Massetti e sottofondi", parole: /massett|sottofond/i, rango: 6, attesa: { nome: "Stagionatura massetto", giorni: 5 } },
  { nome: "Cappotto", parole: /cappott|isolament/i, rango: 6 },
  { nome: "Intonaci e rasature", parole: /intonac|rasatur/i, rango: 6, attesa: { nome: "Asciugatura intonaci", giorni: 5 } },
  { nome: "Serramenti e porte", parole: /serrament|infiss|finestr|\bport[ae]\b|persian|portoncin/i, rango: 7 },
  { nome: "Pavimenti e rivestimenti", parole: /paviment|\bgres\b|parquet|rivestiment|piastrell|battiscop/i, rango: 8 },
  { nome: "Sanitari e rubinetterie", parole: /sanitar|box doccia|rubinett|lavabo|\bwc\b|\bvaso\b/i, rango: 9 },
  { nome: "Tinteggiature", parole: /tinteggi|pittur|verniciat|\btinta/i, rango: 9 },
];
/** Apertura e chiusura ci sono sempre: una voce così allunga quelle fasi, non ne apre una seconda. */
const APERTURA = /allestiment|cantierizzaz|recinzion/i;
const CHIUSURA = /pulizi|collaud|consegn/i;
/** Non sono lavoro di cantiere: oneri, pratiche, spese tecniche. */
const NON_CANTIERE = /\boneri\b|spese tecniche|progettazion|direzione lavori|\bpratich|sicurezza\b.*\bcosti\b|\bcosti\b.*sicurezza\b/i;
/** «Fornitura di…» senza posa: il materiale arriva, il lavoro no. */
const SOLO_FORNITURA = /^\s*(sola\s+)?fornitura\b(?!.*\bpos[ae]\b)/i;
const RANGO_ALTRE = 7;
const POCHE_ORE = 80;

const tondo = (n: number) => Math.round(n * 10) / 10;
const senzaAccenti = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

const inCantiere = (v: VoceCrono): VoceCantiere => ({
  fase: null, capitolo: v.capitolo ?? null, descrizione: v.descrizione, unita: v.unita ?? null, quantita: Number(v.quantita) || 0,
  importo: v.importo ?? null, costo_manodopera: v.costo_manodopera ?? null, costo_materiali: null, ore_previste: v.ore_previste ?? null,
  incidenza: v.incidenza ?? null, origine: "computo",
});

/** Conta la parola che viene prima: «Intonaco a calce idraulica» è un intonaco, non un impianto. */
function primaLavorazione(testo: string): Lavorazione | null {
  let scelta: Lavorazione | null = null;
  let posto = Infinity;
  for (const l of LAVORAZIONI) {
    const i = testo.search(l.parole);
    if (i >= 0 && i < posto) { posto = i; scelta = l; }
  }
  return scelta;
}

/** La lavorazione di una voce: prima dalla descrizione, poi dal capitolo. */
export function lavorazioneDellaVoce(v: Pick<VoceCrono, "descrizione" | "capitolo">): Lavorazione | null {
  return primaLavorazione(senzaAccenti(v.descrizione)) ?? primaLavorazione(senzaAccenti(v.capitolo ?? ""));
}

/** Oneri, percentuali e detrazioni: restano nel totale, ma non sono giorni di cantiere. */
export const eLavoroDiCantiere = (v: VoceCrono) =>
  !v.sicurezza && !(Number(v.importo) < 0) && !(Number(v.quantita) < 0) && (v.unita ?? "").trim() !== "%" && !NON_CANTIERE.test(v.descrizione);

const soloFornitura = (v: VoceCrono) =>
  SOLO_FORNITURA.test(v.descrizione) || (v.costo_manodopera != null && Number(v.costo_manodopera) === 0 && Number(v.costo_materiali) > 0 && !(Number(v.ore_previste) > 0));

export function calcolaCrono(
  tutte: readonly VoceCrono[], ipotesi: Partial<Ipotesi> = {}, squadre: Partial<SquadreCrono> = {},
): CronoCalcolato {
  const diCantiere = tutte.filter(eLavoroDiCantiere);
  const voci = diCantiere.filter((v) => !soloFornitura(v));
  const vociSoloFornitura = diCantiere.length - voci.length;
  const ip: Ipotesi = { ...IPOTESI_PREDEFINITE, ...ipotesi };
  const nSquadre = Math.max(1, Math.round(squadre.squadre ?? SQUADRE_PREDEFINITE.squadre));
  const persone = Math.max(1, Math.round(squadre.personePerSquadra ?? SQUADRE_PREDEFINITE.personePerSquadra));
  const oreUtili = ip.oreGiorno * (ip.resaPct / 100);

  interface Gruppo { nome: string; rango: number; ordine: number; attesa?: Lavorazione["attesa"]; ore: number; min: number; max: number; voci: number; senza: number; stimate: number }
  const gruppi = new Map<string, Gruppo>();
  let senzaDati = 0, nonRiconosciute = 0, stimate = 0, oreApertura = 0, oreChiusura = 0;
  voci.forEach((v, i) => {
    // Prima le lavorazioni vere: «Pulizia e consegna» è un capitolo, «Demolizione» in quel capitolo resta demolizione.
    const l = lavorazioneDellaVoce(v);
    const testo = `${v.descrizione} ${l ? "" : v.capitolo ?? ""}`;
    if (!primaLavorazione(senzaAccenti(v.descrizione)) && (APERTURA.test(testo) || CHIUSURA.test(testo))) {
      const o = oreDellaVoce(inCantiere(v), ip);
      if (APERTURA.test(testo)) oreApertura += o?.ore ?? 0; else oreChiusura += o?.ore ?? 0;
      if (o?.fonte === "prezzario") stimate++;
      return;
    }
    if (!l) nonRiconosciute++;
    const nome = l?.nome ?? ((v.capitolo ?? "").trim() || "Altre lavorazioni");
    const g = gruppi.get(nome) ?? { nome, rango: l?.rango ?? RANGO_ALTRE, ordine: i, attesa: l?.attesa, ore: 0, min: 0, max: 0, voci: 0, senza: 0, stimate: 0 };
    const o = oreDellaVoce(inCantiere(v), ip);
    g.voci++;
    if (o) {
      g.ore += o.ore; g.min += o.min; g.max += o.max;
      if (o.fonte === "prezzario") { g.stimate++; stimate++; }
    } else { g.senza++; senzaDati++; }
    gruppi.set(nome, g);
  });

  const oreTot = [...gruppi.values()].reduce((t, g) => t + g.ore, 0);
  const servizio = oreTot < POCHE_ORE ? 1 : 2;
  const giorniDa = (ore: number) => Math.max(servizio, Math.ceil(ore / (persone * oreUtili) - 1e-9));
  const conPonteggi = gruppi.has("Ponteggi");
  const fasi: FaseCalcolataCrono[] = [];
  const senzaOre: string[] = [];
  if (!voci.length) return { fasi, giorni: 0, ore: 0, oreMin: 0, oreMax: 0, voci: 0, vociSenzaDati: 0, vociNonRiconosciute: 0, vociStimate: 0, vociSoloFornitura, avvisoInterno: "" };

  const apertura = giorniDa(oreApertura);
  fasi.push({ nome: "Allestimento cantiere", inizio: 1, durata: apertura, nota: "", ore: tondo(oreApertura), attesa: false });
  let pronto = 1 + apertura;
  const ordinati = [...gruppi.values()].sort((a, b) => a.rango - b.rango || a.ordine - b.ordine);
  for (let i = 0; i < ordinati.length;) {
    const rango = ordinati[i].rango;
    const stessi = ordinati.filter((g) => g.rango === rango);
    i += stessi.length;
    const libere = new Array<number>(nSquadre).fill(pronto);
    let fineRango = pronto;
    for (const g of stessi) {
      const durata = g.ore > 0 ? Math.max(1, Math.ceil(g.ore / (persone * oreUtili) - 1e-9)) : 1;
      const squadra = libere.indexOf(Math.min(...libere));
      const inizio = libere[squadra];
      libere[squadra] = inizio + durata;
      fasi.push({ nome: g.nome, inizio, durata, nota: "", ore: tondo(g.ore), attesa: false });
      if (!(g.ore > 0)) senzaOre.push(g.nome);
      let fine = inizio + durata;
      if (g.attesa) {
        fasi.push({ nome: g.attesa.nome, inizio: fine, durata: g.attesa.giorni, nota: "Tempo tecnico di attesa.", ore: 0, attesa: true });
        fine += g.attesa.giorni;
      }
      fineRango = Math.max(fineRango, fine);
    }
    pronto = fineRango;
  }
  fasi.push({
    nome: conPonteggi ? "Smontaggio ponteggi, pulizia e consegna" : "Pulizia e consegna", inizio: pronto,
    durata: giorniDa(oreChiusura) + (conPonteggi ? 1 : 0), nota: "", ore: tondo(oreChiusura), attesa: false,
  });

  const somma = (k: "ore" | "min" | "max") => tondo([...gruppi.values()].reduce((t, g) => t + g[k], 0) + oreApertura + oreChiusura);
  const intervallo = somma("min") !== somma("max") ? ` (da ${Math.round(somma("min"))} a ${Math.round(somma("max"))})` : "";
  const parti = [`Circa ${Math.round(somma("ore"))} ore di lavoro${intervallo}, con ${nSquadre} ${nSquadre === 1 ? "squadra" : "squadre"} da ${persone} ${persone === 1 ? "persona" : "persone"} e ${ip.oreGiorno} ore al giorno.`];
  const conOre = fasi.filter((f) => f.ore > 0);
  if (conOre.length) parti.push(`Ore: ${conOre.map((f) => `${f.nome} ${Math.round(f.ore)}`).join(", ")}.`);
  if (senzaOre.length) parti.push(`Da controllare, senza dati di manodopera: ${senzaOre.join(", ")}.`);
  if (vociSoloFornitura) parti.push(`${vociSoloFornitura} ${vociSoloFornitura === 1 ? "voce è" : "voci sono"} di sola fornitura: nessuna ora.`);
  if (stimate) parti.push("Le ore di alcune voci sono stimate dal prezzario regionale: correggi le durate con i tempi reali delle tue squadre.");
  if (senzaDati) parti.push(`${senzaDati} ${senzaDati === 1 ? "voce non ha" : "voci non hanno"} dati di manodopera e ${senzaDati === 1 ? "non è contata" : "non sono contate"}.`);
  if (nonRiconosciute) parti.push(`${nonRiconosciute} ${nonRiconosciute === 1 ? "voce non è stata riconosciuta" : "voci non sono state riconosciute"}: controlla dove stanno nella sequenza.`);
  return {
    fasi, giorni: Math.max(...fasi.map((f) => f.inizio + f.durata - 1)),
    ore: somma("ore"), oreMin: somma("min"), oreMax: somma("max"),
    voci: voci.length, vociSenzaDati: senzaDati, vociNonRiconosciute: nonRiconosciute, vociStimate: stimate, vociSoloFornitura,
    avvisoInterno: parti.join(" "),
  };
}

export interface ClientCrono {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const MASSIMO_TESTI = 40;
const chiaveTesto = (d: string) => d.trim().slice(0, 120).toLowerCase();

/**
 * Chiede al prezzario la manodopera delle voci che non hanno altri dati: le più grandi, una per una;
 * le altre prendono la media pesata della loro lavorazione, o in mancanza di tutto il computo. Se il prezzario non risponde si va avanti senza.
 */
export async function preparaCrono(db: ClientCrono, companyId: string, voci: readonly VoceCrono[], squadre: Partial<SquadreCrono> = {}, regioneDa: (provincia: string | null) => string | null): Promise<CronoCalcolato> {
  const avvisi: string[] = [];
  const { data: ctx, error: errCtx } = await db.rpc("piano_cantiere_contesto", { p_company_id: companyId });
  if (errCtx) avvisi.push("Non ho letto i dati della tua azienda: uso i valori di partenza.");
  const contesto = (ctx ?? {}) as { provincia?: string | null; costo_orario?: number | null; rese?: { chiave: string; ore_per_unita: number }[] };
  const senzaDati = voci.filter((v) => eLavoroDiCantiere(v) && !soloFornitura(v) && !v.incidenza && !(Number(v.ore_previste) > 0) && !(Number(v.costo_manodopera) > 0) && Number(v.importo) > 0);
  const testi = [...new Set([...senzaDati].sort((a, b) => Number(b.importo) - Number(a.importo)).map((v) => chiaveTesto(v.descrizione)))].slice(0, MASSIMO_TESTI);
  const stime = new Map<string, Incidenza>();
  const regione = regioneDa(contesto.provincia ?? null);
  if (!regione && testi.length) avvisi.push("Non so in che regione lavori: per le stime uso il prezzario della Lombardia.");
  for (let i = 0; i < testi.length; i += 10) {
    const r = await db.rpc("piano_cantiere_incidenze", { p_company_id: companyId, p_testi: testi.slice(i, i + 10), p_regione: regione });
    if (r.error) { avvisi.push("Il prezzario non ha risposto: alcune voci sono senza stima, riprova tra poco."); break; }
    for (const s of (r.data ?? []) as ({ testo: string } & Incidenza)[]) stime.set(s.testo, { frazione: Number(s.frazione), min: s.min, max: s.max });
  }
  const conStima = voci.map((v) => (senzaDati.includes(v) && stime.has(chiaveTesto(v.descrizione)) ? { ...v, incidenza: stime.get(chiaveTesto(v.descrizione))! } : v));
  // Per le voci rimaste: la media della loro lavorazione, pesata sugli importi.
  const medie = new Map<string, { peso: number; somma: number }>();
  for (const v of conStima) {
    if (!v.incidenza || !(Number(v.importo) > 0)) continue;
    const k = lavorazioneDellaVoce(v)?.nome ?? "";
    const m = medie.get(k) ?? { peso: 0, somma: 0 };
    m.peso += Number(v.importo); m.somma += Number(v.importo) * v.incidenza.frazione;
    medie.set(k, m);
  }
  // Se la lavorazione non ha nessuna stima, la media di tutto il computo: meglio di un giorno su 400 m².
  const tutte = [...medie.values()].reduce((t, m) => ({ peso: t.peso + m.peso, somma: t.somma + m.somma }), { peso: 0, somma: 0 });
  const completate = conStima.map((v, i) => {
    if (v.incidenza || !senzaDati.includes(voci[i])) return v;
    const m = medie.get(lavorazioneDellaVoce(v)?.nome ?? "") ?? (tutte.peso > 0 ? tutte : null);
    return m ? { ...v, incidenza: { frazione: m.somma / m.peso } } : v;
  });
  const esito = calcolaCrono(completate, { costoOrario: Number(contesto.costo_orario) > 0 ? Number(contesto.costo_orario) : IPOTESI_PREDEFINITE.costoOrario, rese: contesto.rese ?? [] }, squadre);
  return avvisi.length ? { ...esito, avvisoInterno: [esito.avvisoInterno, ...avvisi].filter(Boolean).join(" ") } : esito;
}
