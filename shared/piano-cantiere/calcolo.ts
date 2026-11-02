/**
 * Quante ore e quanti operai per finire un cantiere entro una data (2/11/2026).
 * Vedi docs/superpowers/plans/2026-11-02-silvio-calcolo-cantiere.md.
 *
 * I numeri li fa questo codice, non l'AI, e ognuno dice da dove viene. L'ordine delle fonti:
 * ore scritte sulla voce → resa dell'azienda → costo di manodopera della voce → percentuale di
 * manodopera (del listino o del prezzario, che è una stima). Una voce senza nessuno di questi
 * dati non vale zero: si conta e si mostra.
 *
 * Funzioni pure, senza dipendenze esterne, compatibili con Deno.
 */
import { CALENDARIO_NAZIONALE, lavorativiTra, lavorativo, primoGiornoUtile, spostaLavorativi, type CalendarioCantiere } from "../silvio-commessa/calendario.ts";
import { somiglianzaFasi } from "../silvio-commessa/somiglianza.ts";

export type FonteOre = "scritte" | "azienda" | "costo_voce" | "prezzario" | "manca";

export const FONTE_A_PAROLE: Record<FonteOre, string> = {
  scritte: "ore scritte sulla voce",
  azienda: "resa della tua azienda",
  costo_voce: "costo di manodopera della voce",
  prezzario: "stima dal prezzario regionale",
  manca: "nessun dato",
};

export interface Incidenza {
  /** Quota di manodopera sull'importo, da 0 a 1 (nel prezzario la colonna «_pct» è già una frazione). */
  frazione: number;
  min?: number | null;
  max?: number | null;
}

export interface VoceCantiere {
  /** Il nome della fase, se la voce ne ha una. */
  fase: string | null;
  capitolo: string | null;
  descrizione: string;
  unita: string | null;
  quantita: number;
  /** Totale. */
  importo: number | null;
  /** Per unità. */
  costo_manodopera: number | null;
  /** Per unità. */
  costo_materiali: number | null;
  /** Ore-persona totali della voce, scritte da chi conosce il lavoro. */
  ore_previste: number | null;
  incidenza: Incidenza | null;
  origine: "fase" | "computo" | "preventivo";
}

export interface FaseCantiere {
  nome: string;
  dal: string | null;
  al: string | null;
  /** Da 0 a 100. */
  percentuale: number;
  completata: boolean;
  /** Il lavoro è di una ditta: le sue ore non chiedono operai dell'azienda. */
  ditta: string | null;
}

export interface ResaAzienda { chiave: string; ore_per_unita: number }

export interface Ipotesi {
  costoOrario: number;
  oreGiorno: number;
  /** Quota di ore davvero produttive, da 10 a 100. */
  resaPct: number;
  rese?: readonly ResaAzienda[];
  /** Quanto le ore vere si scostano dalla stima, per lavorazione (1 = uguali). */
  correzioni?: ReadonlyMap<string, number>;
}

/** Valori di partenza dichiarati a schermo e modificabili: gli stessi dei preventivatori. */
export const IPOTESI_PREDEFINITE: Ipotesi = { costoOrario: 30, oreGiorno: 8, resaPct: 85 };

export interface OreVoce { ore: number; min: number; max: number; fonte: FonteOre }

export interface FaseCalcolata {
  /** Id della fase nella commessa, quando c'è. */
  id?: string | null;
  nome: string;
  dal: string | null;
  al: string | null;
  ore: number;
  oreMin: number;
  oreMax: number;
  fonti: FonteOre[];
  giorni: number;
  operaiNecessari: number;
  ditta: string | null;
  percentuale: number;
  vociSenzaDato: number;
  /** Comprende ore di voci non collegate a nessuna fase, divise a stima. */
  conOreDivise: boolean;
}

export interface PianoCantiere {
  dal: string | null;
  al: string | null;
  giorniDisponibili: number;
  fasi: FaseCalcolata[];
  oreTotali: number;
  oreMin: number;
  oreMax: number;
  operaiMassimi: number;
  voci: number;
  vociSenzaDato: number;
  /** Quanta parte dell'importo ha un dato di manodopera, da 0 a 100. */
  coperturaPct: number;
  fonti: Partial<Record<FonteOre, number>>;
  fattibile: boolean;
  avvisi: string[];
}

const positivo = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const tondo = (n: number) => Math.round(n * 10) / 10;

/** La chiave con cui un'azienda salva la resa di una lavorazione. */
export function chiaveLavorazione(descrizione: string): string {
  return descrizione.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
}

export function oreDellaVoce(v: VoceCantiere, ip: Ipotesi): OreVoce | null {
  const scritte = positivo(v.ore_previste);
  if (scritte) return { ore: scritte, min: scritte, max: scritte, fonte: "scritte" };
  const q = positivo(v.quantita);
  const resa = ip.rese?.find((r) => r.chiave === chiaveLavorazione(v.descrizione));
  if (resa && q && positivo(resa.ore_per_unita)) {
    const h = resa.ore_per_unita * q;
    return { ore: h, min: h, max: h, fonte: "azienda" };
  }
  const manodopera = positivo(v.costo_manodopera) * q;
  if (manodopera) {
    const h = manodopera / ip.costoOrario;
    return { ore: h, min: h, max: h, fonte: "costo_voce" };
  }
  const importo = positivo(v.importo);
  const f = positivo(v.incidenza?.frazione);
  if (importo && f) {
    const ore = (x: number) => importo * x / ip.costoOrario;
    return { ore: ore(f), min: ore(positivo(v.incidenza?.min) || f), max: ore(positivo(v.incidenza?.max) || f), fonte: "prezzario" };
  }
  return null;
}

const SENZA_LAVORO_DIVISO = /collaud|consegn|allestiment|sicurezz|pulizi/i;
const CON_LAVORO = /demoli|scav|mur|impiant|posa|finitur|serrament|massett|intonac|copertur/i;
/** «Allestimento e demolizioni» è lavoro vero, «Collaudo e consegna» no. */
const faseDiLavoro = (nome: string) => !SENZA_LAVORO_DIVISO.test(nome) || CON_LAVORO.test(nome);

function faseDellaVoce(v: VoceCantiere, fasi: readonly FaseCantiere[]): FaseCantiere | null {
  const nome = v.fase ?? v.capitolo ?? v.descrizione;
  const esatta = fasi.find((f) => f.nome.trim().toLowerCase() === (v.fase ?? "").trim().toLowerCase());
  if (esatta) return esatta;
  let migliore: FaseCantiere | null = null;
  let punti = 0;
  for (const f of fasi) {
    const s = Math.max(somiglianzaFasi(nome, f.nome), v.capitolo ? somiglianzaFasi(v.capitolo, f.nome) : 0);
    if (s > punti) { punti = s; migliore = f; }
  }
  return punti >= 0.34 ? migliore : null;
}

/** I giorni di ogni fase in proporzione alle ore, senza sforare la data: si toglie dalle più lunghe. */
function giorniDelleFasi(ore: readonly number[], tot: number): number[] {
  const oreTot = ore.reduce((t, o) => t + o, 0);
  const giorni = ore.map((o) => (oreTot > 0 ? Math.max(1, Math.round(tot * o / oreTot)) : 1));
  for (let somma = giorni.reduce((t, g) => t + g, 0); somma > tot; somma--) {
    const piuLunga = giorni.indexOf(Math.max(...giorni));
    if (giorni[piuLunga] <= 1) break;
    giorni[piuLunga]--;
  }
  return giorni;
}

export function calcolaPiano(
  voci: readonly VoceCantiere[],
  fasiIn: readonly FaseCantiere[],
  ip: Ipotesi,
  periodo: { oggi: string; al?: string | null; calendario?: CalendarioCantiere },
): PianoCantiere {
  const cal = periodo.calendario ?? CALENDARIO_NAZIONALE;
  const avvisi: string[] = [];
  const fasi = fasiIn.length ? fasiIn : [{ nome: "Lavori", dal: null, al: periodo.al ?? null, percentuale: 0, completata: false, ditta: null }];
  const conti = new Map(fasi.map((f) => [f.nome, { ore: 0, min: 0, max: 0, fonti: new Set<FonteOre>(), senza: 0, divise: false }]));
  const daDividere: OreVoce[] = [];
  const fonti: Partial<Record<FonteOre, number>> = {};
  let senzaDato = 0, importoTot = 0, importoCoperto = 0;

  for (const v of voci) {
    const o = oreDellaVoce(v, ip);
    const importo = positivo(v.importo);
    importoTot += importo;
    const fase = faseDellaVoce(v, fasi);
    if (!o) {
      senzaDato++;
      fonti.manca = (fonti.manca ?? 0) + 1;
      if (fase) conti.get(fase.nome)!.senza++;
      continue;
    }
    importoCoperto += importo;
    fonti[o.fonte] = (fonti[o.fonte] ?? 0) + 1;
    if (!fase) { daDividere.push(o); continue; }
    const c = conti.get(fase.nome)!;
    const correzione = ip.correzioni?.get(chiaveLavorazione(fase.nome)) ?? 1;
    c.ore += o.ore * correzione; c.min += o.min * correzione; c.max += o.max * correzione; c.fonti.add(o.fonte);
  }

  // Voci non collegate a una fase: si dividono sulle fasi di lavoro in base a quanto durano.
  const dividere = (() => {
    const aperte = fasi.filter((f) => !f.completata);
    const lavoro = aperte.filter((f) => faseDiLavoro(f.nome));
    return lavoro.length ? lavoro : aperte.length ? aperte : [...fasi];
  })();
  if (daDividere.length) {
    const peso = (f: FaseCantiere) => (f.dal && f.al ? Math.max(1, lavorativiTra(f.dal, f.al, cal) + 1) : 1);
    const pesoTot = dividere.reduce((t, f) => t + peso(f), 0);
    for (const f of dividere) {
      const c = conti.get(f.nome)!;
      const q = peso(f) / pesoTot;
      for (const o of daDividere) { c.ore += o.ore * q; c.min += o.min * q; c.max += o.max * q; c.fonti.add(o.fonte); }
      c.divise = true;
    }
    avvisi.push(`${daDividere.length} ${daDividere.length === 1 ? "voce non è collegata" : "voci non sono collegate"} a una fase: le ore sono divise fra le fasi in base alla durata.`);
  }

  const residuo = (f: FaseCantiere, ore: number) => (f.completata ? 0 : ore * (1 - Math.min(100, Math.max(0, f.percentuale)) / 100));
  const aperte = fasi.filter((f) => !f.completata);
  const oreProduttive = ip.oreGiorno * (ip.resaPct / 100);

  // Il periodo: dal primo giorno utile, mai prima di oggi, fino alla data chiesta o all'ultima fase.
  const ultima = aperte.map((f) => f.al).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const al = periodo.al ?? ultima;
  const primaFase = aperte.map((f) => f.dal).filter((d): d is string => !!d).sort()[0] ?? null;
  const dal = primoGiornoUtile(primaFase && primaFase > periodo.oggi ? primaFase : periodo.oggi, cal);
  const giorniDisponibili = al && al >= dal ? lavorativiTra(dal, al, cal) + (lavorativo(dal, cal) ? 1 : 0) : 0;
  let fattibile = true;
  if (al && al < periodo.oggi) {
    fattibile = false;
    avvisi.push("La data di fine è già passata: scegline una nuova.");
  } else if (al && !giorniDisponibili) {
    fattibile = false;
    avvisi.push("Fra oggi e la data di fine non c'è nessun giorno lavorativo.");
  } else if (!al) {
    avvisi.push("Manca la data di fine: indica entro quando vuoi finire per sapere quanti operai servono.");
  }

  // Le fasi una dopo l'altra (l'ipotesi prudente), con i giorni in proporzione alle ore.
  let inizio = dal;
  let giorniUsati = 0;
  const giorniAperte = al && giorniDisponibili ? giorniDelleFasi(aperte.map((f) => residuo(f, conti.get(f.nome)!.ore)), giorniDisponibili) : null;
  const calcolate: FaseCalcolata[] = fasi.map((f) => {
    const c = conti.get(f.nome)!;
    const ore = residuo(f, c.ore);
    const base = {
      nome: f.nome, ore: tondo(ore), oreMin: tondo(residuo(f, c.min)), oreMax: tondo(residuo(f, c.max)), fonti: [...c.fonti],
      ditta: f.ditta, percentuale: f.percentuale, vociSenzaDato: c.senza, conOreDivise: c.divise,
    };
    if (f.completata) return { ...base, dal: f.dal, al: f.al, giorni: 0, operaiNecessari: 0 };
    const giorni = giorniAperte ? giorniAperte[aperte.indexOf(f)] : (f.dal && f.al ? Math.max(1, lavorativiTra(f.dal, f.al, cal) + 1) : 1);
    giorniUsati += giorni;
    const faseDal = inizio;
    const faseAl = spostaLavorativi(faseDal, giorni - 1, cal);
    inizio = spostaLavorativi(faseAl, 1, cal);
    return {
      ...base, dal: faseDal, al: faseAl, giorni,
      operaiNecessari: f.ditta || !ore ? 0 : Math.ceil(ore / (giorni * oreProduttive) - 1e-9),
    };
  });
  if (al && giorniDisponibili && giorniUsati > giorniDisponibili) {
    avvisi.push(`Le fasi una dopo l'altra chiedono ${giorniUsati} giorni e ne hai ${giorniDisponibili}: alcune vanno fatte in parallelo.`);
  }
  if (!voci.length) {
    fattibile = false;
    avvisi.push("Questa commessa non ha voci di lavoro: collega un preventivo o un computo, o aggiungile alle fasi.");
  } else if (senzaDato) {
    avvisi.push(`${senzaDato} ${senzaDato === 1 ? "voce non ha" : "voci non hanno"} dati di manodopera: le loro ore non sono contate.`);
  }
  if (fonti.prezzario) avvisi.push("Una parte delle ore è stimata dal prezzario regionale: correggi le rese per renderla tua.");

  const somma = (k: "ore" | "oreMin" | "oreMax") => tondo(calcolate.reduce((t, f) => t + f[k], 0));
  return {
    dal, al, giorniDisponibili, fasi: calcolate,
    oreTotali: somma("ore"), oreMin: somma("oreMin"), oreMax: somma("oreMax"),
    operaiMassimi: calcolate.reduce((m, f) => Math.max(m, f.operaiNecessari), 0),
    voci: voci.length, vociSenzaDato: senzaDato,
    coperturaPct: importoTot > 0 ? Math.round(importoCoperto / importoTot * 100) : 0,
    fonti, fattibile, avvisi,
  };
}
