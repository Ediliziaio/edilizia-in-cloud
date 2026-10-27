/**
 * I dettagli di una voce del computo, uguali negli otto preventivatori edili (bagni, climatizzazione, elettrico,
 * termoidraulico, pavimenti, piscine, ristrutturazione, tetti).
 *
 *  - ambiente: dove si lavora. Per leggere il preventivo stanza per stanza.
 *  - misure: come si ricava la quantità (parti × lunghezza × larghezza × altezza). La quantità resta un numero salvato
 *    a parte: le misure servono a controllarla e a correggerla, non la sostituiscono dietro le quinte.
 *  - ore_previste: ore-persona scritte da chi conosce il lavoro; vincono sulla stima dal costo di manodopera.
 *  - note_interne: solo per l'impresa, mai nel PDF del cliente.
 *  - marca, modello: del materiale, per l'ordine al fornitore.
 *  - opzionale: proposta al cliente ma non inclusa nel totale.
 */
export interface MisuraRiga {
  descrizione: string;
  /** Parti uguali (es. 2 pareti uguali). */
  parti: number;
  lunghezza: number | null;
  larghezza: number | null;
  /** Altezza o spessore. */
  altezza: number | null;
}

export interface DettagliVoce {
  ambiente?: string | null;
  misure?: MisuraRiga[] | null;
  ore_previste?: number | null;
  note_interne?: string | null;
  marca?: string | null;
  modello?: string | null;
  opzionale?: boolean;
}

export const MAX_MISURE_PER_VOCE = 60;
const MAX_TESTO = 500;
const MAX_NOTA = 2000;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(x) ? x : null;
};
const testo = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};

/** Righe di misura valide: almeno una dimensione, parti positive. */
export function misureValide(misure: MisuraRiga[] | null | undefined): MisuraRiga[] {
  return (Array.isArray(misure) ? misure : []).slice(0, MAX_MISURE_PER_VOCE).flatMap((m) => {
    const parti = num(m?.parti) ?? 1;
    const dim = [num(m?.lunghezza), num(m?.larghezza), num(m?.altezza)];
    if (!(parti > 0) || dim.every((d) => d === null) || dim.some((d) => d !== null && d < 0)) return [];
    return [{ descrizione: testo(m?.descrizione, MAX_TESTO) ?? "", parti, lunghezza: dim[0], larghezza: dim[1], altezza: dim[2] }];
  });
}

/** Quantità di una riga di misura: le dimensioni non scritte non contano (una parete in mq non ha spessore). */
export function quantitaRigaMisura(m: MisuraRiga): number {
  const f = [m.lunghezza, m.larghezza, m.altezza].filter((d): d is number => d !== null);
  return f.reduce((p, d) => p * d, m.parti);
}

/** Somma delle misure, a 4 decimali; null se non c'è nessuna misura valida. */
export function quantitaDaMisure(misure: MisuraRiga[] | null | undefined): number | null {
  const valide = misureValide(misure);
  if (!valide.length) return null;
  const tot = valide.reduce((s, m) => s + quantitaRigaMisura(m), 0);
  return Math.round(tot * 10000) / 10000;
}

/** Cosa si scrive nel database: testi puliti, misure valide o null, ore non negative, opzionale sempre booleano. */
export function dettagliPerSalvataggio(v: DettagliVoce) {
  const ore = num(v.ore_previste);
  const misure = misureValide(v.misure);
  return {
    ambiente: testo(v.ambiente, MAX_TESTO),
    misure: misure.length ? misure : null,
    ore_previste: ore !== null && ore >= 0 && ore <= 100000 ? Math.round(ore * 100) / 100 : null,
    note_interne: testo(v.note_interne, MAX_NOTA),
    marca: testo(v.marca, MAX_TESTO),
    modello: testo(v.modello, MAX_TESTO),
    opzionale: v.opzionale === true,
  };
}

/** Voci incluse nel totale: le opzionali restano nel preventivo ma non si sommano. */
export const vocePesaNelTotale = (v: { opzionale?: boolean | null }): boolean => v.opzionale !== true;
