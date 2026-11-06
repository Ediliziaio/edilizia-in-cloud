/** La parte di calcolo della scelta delle voci dal listino: quantità, totale, voci già presenti. */
export interface VoceScelta {
  descrizione: string; unita_misura: string; unita_originale?: string | null; prezzo_unitario: number;
  costo_materiali: number; costo_manodopera: number; capitolo_nome?: string; listino_voce_id?: string | null;
  fonte?: string | null; codice_tariffa?: string | null; famiglia_id?: string | null; immagine_url?: string | null;
  descrizione_estesa?: string | null; quantita?: number;
  /** L'unità della fonte, prima di adattarla al modulo: la revisione dei Bagni la controlla. */
  sourceUnit?: string | null;
}

export interface RigaScelta {
  chiave: string; descrizione: string; meta?: string;
  /** Il titolo sopra le voci nell'elenco: capitolo o gruppo. */
  sezione?: string; immagine?: string | null; prezzo: number; unitaLabel: string;
  /** Prodotto al metro quadro: la quantità va scritta, non vale 1. */
  chiedeQuantita?: boolean;
  /**
   * La fonte non dice l'unità (16 prezzari regionali su 19, 06/11/2026): va scelta prima
   * di aggiungere la voce. Prima diventava «cad» in silenzio, e una demolizione solai a
   * 3,18 € «al m² per ogni cm» entrava come 3,18 € cadauno.
   */
  unitaDaScegliere?: boolean;
  /** La frase della descrizione che dice come si misura la voce: solo da leggere. */
  comeSiMisura?: string;
  voce: VoceScelta;
}

/** Le unità che si possono indicare a mano per una voce che non ne ha. */
export const UNITA_A_MANO = ["mq", "mc", "ml", "m", "kg", "t", "cad", "h", "a corpo"] as const;

/** «2,5» e «2.5» sono lo stesso numero, «1.500» e «1.500,5» hanno il punto delle migliaia, «0.500» no. */
function leggiNumero(testo: string): number | null {
  const t = testo.trim();
  const conMigliaia = /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t);
  const n = Number((conMigliaia ? t.replace(/\./g, "") : t).replace(",", "."));
  return !t || !Number.isFinite(n) ? null : n;
}

/** Null se non è un numero positivo. */
export function leggiQuantita(testo: string): number | null {
  const n = leggiNumero(testo);
  if (n === null) return null;
  const tonda = Math.round(n * 100) / 100;
  return tonda > 0 ? tonda : null;
}

/** Il prezzo scritto sulla riga, fino a 4 decimali: «0,125» al pezzo non è 0,13. Zero è ammesso (voce da completare dopo), vuoto o negativo no. */
export function leggiPrezzo(testo: string): number | null {
  const n = leggiNumero(testo);
  return n === null || n < 0 ? null : Math.round(n * 10000) / 10000;
}

/** Come si mostra nel campo il prezzo del listino. */
export const prezzoInCampo = (prezzo: number) => String(Math.round(prezzo * 10000) / 10000).replace(".", ",");

/**
 * Le voci pronte da aggiungere, il totale, e quante aspettano ancora una quantità, un prezzo
 * valido o l'unità. `mappaUnita` adatta l'unità scelta a mano all'elenco del modulo.
 */
export function totaleScelte(
  scelte: readonly { riga: RigaScelta; quantita: string; prezzo?: string; unita?: string }[],
  mappaUnita: (unita: string) => string = (u) => u,
) {
  const voci: VoceScelta[] = [];
  let totale = 0;
  let mancanti = 0;
  let prezziDaCorreggere = 0;
  let unitaDaScegliere = 0;
  for (const s of scelte) {
    const q = leggiQuantita(s.quantita);
    const scritto = s.prezzo === undefined ? null : leggiPrezzo(s.prezzo);
    const prezzoValido = s.prezzo === undefined || scritto !== null;
    const unita = s.unita?.trim() ?? "";
    const senzaUnita = !!s.riga.unitaDaScegliere && !unita;
    if (!prezzoValido) prezziDaCorreggere++;
    if (senzaUnita) unitaDaScegliere++;
    if (q === null || !prezzoValido || senzaUnita) { mancanti++; continue; }
    // Se il campo dice ancora il prezzo del listino la voce resta quella, con tutti i suoi decimali.
    const cambiato = scritto !== null && s.prezzo !== prezzoInCampo(s.riga.prezzo);
    const prezzo = cambiato ? scritto : s.riga.prezzo;
    const conUnita = s.riga.unitaDaScegliere ? { unita_misura: mappaUnita(unita), unita_originale: unita, sourceUnit: unita } : {};
    voci.push({ ...s.riga.voce, ...conUnita, quantita: q, ...(cambiato ? { prezzo_unitario: prezzo } : {}) });
    totale += prezzo * q;
  }
  return { voci, totale: Math.round(totale * 100) / 100, mancanti, prezziDaCorreggere, unitaDaScegliere };
}

const normalizza = (t: string) => t.split("\n")[0].trim().toLowerCase();

/** Le voci già nel computo, pronte per il confronto: un computo può averne 5000. */
export const insiemeVoci = (voci: readonly string[]): ReadonlySet<string> => new Set(voci.map(normalizza));

export function voceGiaPresente(descrizione: string, presenti: ReadonlySet<string>): boolean {
  const d = normalizza(descrizione);
  return !!d && presenti.has(d);
}

export function rigaVoceLibera(testo: string, capitolo?: string): VoceScelta {
  return { descrizione: testo.trim() || "Nuova voce", unita_misura: "cad", prezzo_unitario: 0, costo_materiali: 0, costo_manodopera: 0, capitolo_nome: capitolo, quantita: 1 };
}
