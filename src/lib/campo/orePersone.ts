/** Le ore di un rapportino, condivise fra la scheda della commessa e la pagina Rapportini. */
type RigaOre = { presenze?: unknown; ore_lavorate?: unknown; ore_straordinario?: unknown };

const presenzeDi = (r: RigaOre) => (Array.isArray(r.presenze) ? (r.presenze as Array<{ ore?: unknown; employee_id?: unknown }>) : []);

/** Ore delle persone: le presenze con un dipendente, altrimenti quelle dell'autore, straordinario compreso. */
export function orePersoneRapportino(r: RigaOre): number {
  const presenze = presenzeDi(r);
  if (presenze.length > 0) return presenze.reduce((somma, p) => somma + (p.employee_id ? Number(p.ore) || 0 : 0), 0);
  return (Number(r.ore_lavorate) || 0) + (Number(r.ore_straordinario) || 0);
}
