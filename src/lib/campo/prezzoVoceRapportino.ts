/**
 * Prezzo di una voce del rapportino e completezza dei costi (piano rapportini/listini, Fasi 2 e 3).
 *
 * La regola vera sta nel database (`prezzo_voce_commessa`, `rapportino_listino_cerca`): eccezione di
 * cantiere, poi listino del committente collegato per voce, poi listino generale, altrimenti «prezzo da
 * definire». Qui ci sono solo le parole che l'interfaccia mostra e i totali del quadro, che non devono
 * mai trasformare un costo mancante in 0 €.
 */

export type FontePrezzo = "cantiere" | "committente" | "generale" | "mancante";

/** Una voce del listino generale, col prezzo già scelto dalla regola per quella commessa. */
export interface VoceListino {
  tariffa_id: string;
  codice: string | null;
  descrizione: string;
  dettaglio?: string | null;
  categoria?: string | null;
  unita: string;
  /** Assente se chi guarda non vede gli importi; null se nessun listino ha un prezzo. */
  prezzo?: number | null;
  prezzo_generale?: number | null;
  fonte: FontePrezzo;
  /** Assente se chi guarda non vede i costi. */
  costo_unitario?: number | null;
}

const ETICHETTE: Record<FontePrezzo, string> = {
  cantiere: "eccezione di cantiere",
  committente: "listino committente",
  generale: "listino generale",
  mancante: "prezzo da definire",
};

/** «Prezzo applicato: listino committente», oppure «Prezzo da definire». */
export function etichettaPrezzo(fonte: FontePrezzo | null | undefined): string {
  if (!fonte) return "Voce scritta a mano";
  if (fonte === "mancante") return "Prezzo da definire";
  return `Prezzo applicato: ${ETICHETTE[fonte]}`;
}

/** La regola, scritta come nel database: serve ai test e a spiegarla, non a decidere i prezzi. */
export function scegliPrezzo(input: { generale: number | null | undefined; committente?: number | null; cantiere?: number | null }): { prezzo: number | null; fonte: FontePrezzo } {
  if (input.committente != null && input.cantiere != null) return { prezzo: input.cantiere, fonte: "cantiere" };
  if (input.committente != null) return { prezzo: input.committente, fonte: "committente" };
  const generale = input.generale != null && Number(input.generale) > 0 ? Number(input.generale) : null;
  if (generale != null) return { prezzo: generale, fonte: "generale" };
  return { prezzo: null, fonte: "mancante" };
}

/** Vero se chi scrive ha cambiato il prezzo proposto dal listino. Coincide con `prezzo_a_mano` del DB. */
export function prezzoModificatoAMano(vendita: number | null | undefined, proposta: number | null | undefined): boolean {
  const a = vendita == null ? null : Number(vendita);
  const b = proposta == null ? null : Number(proposta);
  return a !== b;
}

export interface MancanzaCosto { tipo: "persona" | "mezzo"; nome: string; motivo: string }

interface RigaPersona { costo: number | null; ditta: boolean; ricavo?: number | null }
interface RigaMezzo { importo: number | null; noleggio: boolean }
interface RigaVoce { quantita: number; costo_unitario: number | null; vendita_unitaria: number | null }

export interface TotaliQuadro {
  costo: number;
  ricavo: number;
  /** Null quando il costo è incompleto: un margine su un costo a metà non è un margine. */
  margine: number | null;
  completo: boolean;
  mancano: number;
}

/**
 * Totali del rapportino. Le persone senza costo orario e i mezzi di proprietà senza costo non valgono 0:
 * il costo resta la somma di quello che si conosce, ma è dichiarato incompleto e il margine non c'è.
 */
export function totaliQuadro(q: { persone: RigaPersona[]; mezzi?: RigaMezzo[]; voci?: RigaVoce[]; personaleAggregato?: number | null; costoDaCompletare?: MancanzaCosto[] | null }): TotaliQuadro {
  const voci = q.voci ?? [];
  const mezzi = q.mezzi ?? [];
  const costo = Number(q.personaleAggregato ?? 0)
    + q.persone.reduce((s, r) => s + Number(r.costo ?? 0), 0)
    + mezzi.reduce((s, m) => s + (m.noleggio ? 0 : Number(m.importo ?? 0)), 0)
    + voci.reduce((s, v) => s + Number(v.quantita) * Number(v.costo_unitario ?? 0), 0);
  const ricavo = q.persone.reduce((s, r) => s + Number(r.ricavo ?? 0), 0)
    + voci.reduce((s, v) => s + Number(v.quantita) * Number(v.vendita_unitaria ?? 0), 0);
  const mancanoLocali = q.persone.filter((r) => !r.ditta && r.costo == null).length + mezzi.filter((m) => !m.noleggio && m.importo == null).length;
  const mancano = Math.max(mancanoLocali, q.costoDaCompletare?.length ?? 0);
  const completo = mancano === 0;
  return { costo: arrotonda(costo), ricavo: arrotonda(ricavo), margine: completo ? arrotonda(ricavo - costo) : null, completo, mancano };
}

const arrotonda = (n: number): number => Math.round(n * 100) / 100;
