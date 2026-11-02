/**
 * Il costo vero della manodopera su una commessa, dal cedolino (02/11/2026).
 *
 * Il costo registrato è una stima fatta all'approvazione del rapportino: ore × tariffa della scheda.
 * Il cedolino dice quanto è costata davvero la persona quel mese. Quindi, mese per mese:
 *   costo orario = (lordo + contributi del datore) / ore lavorate sul cedolino
 *   costo in commessa = ore fatte in commessa quel mese × costo orario
 * Le ore senza cedolino, o senza data perché inserite a mano, restano al costo registrato.
 * È una lettura di confronto: non scrive niente e non cambia il margine della commessa.
 */
import { laborAmount } from "./laborEconomics";

type Valore = number | string | null | undefined;
export interface PresenzaRegistrata { employee_id?: string | null; ore?: Valore; costo?: Valore }
export interface RapportinoOre { data_lavoro: string; presenze_registrate: unknown }
export interface CedolinoMese { employee_id: string; anno: number; mese: number; lordo: Valore; contributi_datore: Valore; ore_lavorate: Valore }
export interface PersonaCosto { id: string; ore: number | null; costo: number | null }

export interface MeseCosto {
  /** AAAA-MM */
  mese: string;
  oreCommessa: number;
  costoRegistrato: number;
  oreMese: number | null;
  costoMese: number | null;
  orario: number | null;
  costo: number | null;
  coperto: boolean;
  motivo: string | null;
  oltreIlCedolino: boolean;
}
export interface PersonaDaCedolino {
  id: string;
  mesi: MeseCosto[];
  oreCoperte: number;
  oreScoperte: number;
  costoCedolino: number;
  /** Cedolino dove c'è, costo registrato per il resto. */
  costoTotale: number;
  costoRegistrato: number;
  /** Solo per le ore coperte: positivo = il cedolino costa più della stima. */
  differenza: number | null;
  orarioMedio: number | null;
}

const cent = (n: number) => Math.round(n * 100) / 100;

function personaDaCedolino(p: PersonaCosto, rapportini: RapportinoOre[], cedolini: CedolinoMese[]): PersonaDaCedolino {
  const perMese = new Map<string, { ore: number; costo: number }>();
  for (const r of rapportini) {
    if (!Array.isArray(r.presenze_registrate)) continue;
    for (const raw of r.presenze_registrate as (PresenzaRegistrata | null)[]) {
      if (!raw || raw.employee_id !== p.id) continue;
      const ore = laborAmount(raw.ore);
      const costo = laborAmount(raw.costo);
      if (ore == null || ore <= 0 || costo == null) continue;
      const mese = r.data_lavoro.slice(0, 7);
      const voce = perMese.get(mese) ?? { ore: 0, costo: 0 };
      voce.ore += ore;
      voce.costo += costo;
      perMese.set(mese, voce);
    }
  }
  const mesi = [...perMese.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mese, v]): MeseCosto => {
    const base: Omit<MeseCosto, "coperto" | "motivo"> = { mese, oreCommessa: cent(v.ore), costoRegistrato: cent(v.costo), oreMese: null, costoMese: null, orario: null, costo: null, oltreIlCedolino: false };
    const trovati = cedolini.filter((c) => c.employee_id === p.id && `${c.anno}-${String(c.mese).padStart(2, "0")}` === mese);
    if (trovati.length !== 1) return { ...base, coperto: false, motivo: trovati.length ? "Più cedolini nello stesso mese" : "Manca il cedolino" };
    const oreMese = laborAmount(trovati[0].ore_lavorate);
    const lordo = laborAmount(trovati[0].lordo);
    if (oreMese == null || oreMese <= 0) return { ...base, coperto: false, motivo: "Il cedolino non ha le ore" };
    if (lordo == null || lordo <= 0) return { ...base, coperto: false, motivo: "Il cedolino non ha il lordo" };
    const costoMese = cent(lordo + (laborAmount(trovati[0].contributi_datore) ?? 0));
    const orario = costoMese / oreMese;
    return { ...base, oreMese, costoMese, orario: cent(orario), costo: cent(v.ore * orario), coperto: true, motivo: null, oltreIlCedolino: v.ore > oreMese };
  });
  const coperti = mesi.filter((m) => m.coperto);
  const oreCoperte = cent(coperti.reduce((s, m) => s + m.oreCommessa, 0));
  const costoCedolino = cent(coperti.reduce((s, m) => s + (m.costo ?? 0), 0));
  const registratoCoperto = cent(coperti.reduce((s, m) => s + m.costoRegistrato, 0));
  const costoRegistrato = p.costo ?? cent(mesi.reduce((s, m) => s + m.costoRegistrato, 0));
  return {
    id: p.id, mesi, oreCoperte, costoCedolino, costoRegistrato,
    oreScoperte: cent(Math.max(0, (p.ore ?? 0) - oreCoperte)),
    costoTotale: cent(costoCedolino + Math.max(0, costoRegistrato - registratoCoperto)),
    differenza: oreCoperte > 0 ? cent(costoCedolino - registratoCoperto) : null,
    orarioMedio: oreCoperte > 0 ? cent(costoCedolino / oreCoperte) : null,
  };
}

export function costoDaCedolini(input: { persone: PersonaCosto[]; rapportini: RapportinoOre[]; cedolini: CedolinoMese[] }) {
  const persone = input.persone.map((p) => personaDaCedolino(p, input.rapportini, input.cedolini));
  const somma = (f: (p: PersonaDaCedolino) => number) => cent(persone.reduce((s, p) => s + f(p), 0));
  const oreCoperte = somma((p) => p.oreCoperte);
  return {
    persone, oreCoperte,
    oreScoperte: somma((p) => p.oreScoperte),
    costoCedolino: somma((p) => p.costoCedolino),
    costoTotale: somma((p) => p.costoTotale),
    costoRegistrato: somma((p) => p.costoRegistrato),
    differenza: oreCoperte > 0 ? somma((p) => p.differenza ?? 0) : null,
  };
}
