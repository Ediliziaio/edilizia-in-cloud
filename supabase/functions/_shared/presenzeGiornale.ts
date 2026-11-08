/**
 * Chi ha lavorato su un cantiere in un giorno, letto dai rapportini: per la
 * testata della pagina del giornale. Stessa regola di `orePersoneRapportino`:
 * se il rapportino ha le presenze contano quelle (con un dipendente), se no
 * conta l'autore con le sue ore (straordinario compreso).
 */
export interface RapportinoPresenze {
  id: string;
  user_id?: string | null;
  stato?: string | null;
  ore_lavorate?: unknown;
  ore_straordinario?: unknown;
  presenze?: unknown;
}

export interface PersonaDelGiorno {
  /** `dip:<employee_id>` oppure `utente:<user_id>`: la stessa persona in due rapportini si somma. */
  chiave: string;
  nome: string;
  ore: number;
  rapportiniIds: string[];
}

const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** I rapportini rifiutati non dicono chi c'era. */
const contaRapportino = (r: RapportinoPresenze) => r.stato !== "rifiutato";

export function personeDelGiorno(
  rapportini: RapportinoPresenze[],
  nomiAutori: Record<string, string> = {},
): PersonaDelGiorno[] {
  const persone = new Map<string, PersonaDelGiorno>();
  const aggiungi = (chiave: string, nome: string, ore: number, rapportinoId: string) => {
    const p = persone.get(chiave) ?? { chiave, nome, ore: 0, rapportiniIds: [] };
    p.ore += ore;
    if (!p.rapportiniIds.includes(rapportinoId)) p.rapportiniIds.push(rapportinoId);
    if (p.nome === "Senza nome" && nome !== "Senza nome") p.nome = nome;
    persone.set(chiave, p);
  };

  for (const r of rapportini) {
    if (!contaRapportino(r)) continue;
    const presenze = Array.isArray(r.presenze) ? (r.presenze as Array<Record<string, unknown>>) : [];
    if (presenze.length > 0) {
      for (const p of presenze) {
        if (!p || typeof p.employee_id !== "string" || !p.employee_id) continue;
        const nome = typeof p.nome === "string" && p.nome.trim() ? p.nome.trim() : "Senza nome";
        aggiungi(`dip:${p.employee_id}`, nome, numero(p.ore), r.id);
      }
      continue;
    }
    if (!r.user_id) continue;
    aggiungi(`utente:${r.user_id}`, nomiAutori[r.user_id]?.trim() || "Senza nome",
      numero(r.ore_lavorate) + numero(r.ore_straordinario), r.id);
  }

  return [...persone.values()]
    .map((p) => ({ ...p, ore: Math.round(p.ore * 100) / 100 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

/** «8 h», «2,5 h». */
export function oreLeggibili(ore: number): string {
  return `${ore.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;
}
