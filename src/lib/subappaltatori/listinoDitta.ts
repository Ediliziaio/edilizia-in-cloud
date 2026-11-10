/**
 * Il listino di un subappaltatore (10/11/2026, lotto 2 di docs/piano-subappalto-computo-listino.md).
 *
 * Il listino della ditta non è un listino a parte: sono le voci di manodopera e servizi
 * dell'azienda con accanto il prezzo che QUELLA ditta chiede (tariffa_costi_varianti con
 * subappaltatore_id), più le voci che ha solo lei (tariffe_aziendali con subappaltatore_id).
 * Qui la parte pura: quale prezzo vale oggi per ogni voce, quali sono chiusi, e cosa mandare a
 * `listino_ditta_salva` dopo le modifiche. Nessuna rete: verificabile dai test.
 */
import { parseAssignmentAmount } from "@/lib/orders/assignmentAmounts";
import { prezzoValidoIl } from "@/lib/orders/costoDitta";

export interface PrezzoDitta {
  id: string;
  tariffa_id: string;
  nome: string;
  costo: number;
  is_default: boolean | null;
  attivo: boolean | null;
  sort_order: number | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at?: string | null;
}

export interface PrezziVoce {
  /** Il prezzo che si propone: lo stesso che sceglie `listino_ditta_salva`. */
  principale: PrezzoDitta | null;
  /** Gli altri prezzi con nome validi oggi («con smontaggio»). */
  altri: PrezzoDitta[];
  /** I prezzi chiusi o non ancora cominciati: la storia del listino. */
  storia: PrezzoDitta[];
}

/** Lo stesso ordine della funzione del database: predefinito, poi ordine, poi il più vecchio. */
const ordine = (a: PrezzoDitta, b: PrezzoDitta) =>
  Number(b.is_default ?? false) - Number(a.is_default ?? false)
  || (a.sort_order ?? 0) - (b.sort_order ?? 0)
  || String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));

/** Per ogni voce del listino, il prezzo della ditta che vale quel giorno, gli altri e la storia. */
export function prezziPerVoce(prezzi: ReadonlyArray<PrezzoDitta>, giorno: string): Map<string, PrezziVoce> {
  const out = new Map<string, PrezziVoce>();
  for (const p of [...prezzi].sort(ordine)) {
    const voce = out.get(p.tariffa_id) ?? { principale: null, altri: [], storia: [] };
    if (p.attivo !== false && prezzoValidoIl(p, giorno)) {
      if (!voce.principale) voce.principale = p;
      else voce.altri.push(p);
    } else {
      voce.storia.push(p);
    }
    out.set(p.tariffa_id, voce);
  }
  for (const v of out.values()) v.storia.sort((a, b) => String(b.valid_from ?? "").localeCompare(String(a.valid_from ?? "")));
  return out;
}

export interface RigaListinoDitta { tariffa_id: string; costo: number | null }

/**
 * Le righe da mandare al database dopo le modifiche a schermo. Si mandano solo le voci toccate,
 * e solo se il valore cambia davvero: «14» su un prezzo di 14,00 non apre un listino nuovo.
 * Casella svuotata = la ditta non ha più un prezzo per quella voce. Un numero che non si legge
 * («14,5,3», «abc») non si manda: finisce fra gli errori, per segnalarlo nella riga.
 */
export function righeDaSalvare(
  modifiche: Readonly<Record<string, string>>,
  attuali: ReadonlyMap<string, PrezziVoce>,
): { righe: RigaListinoDitta[]; errori: string[] } {
  const righe: RigaListinoDitta[] = [];
  const errori: string[] = [];
  for (const [tariffaId, testo] of Object.entries(modifiche)) {
    const prima = attuali.get(tariffaId)?.principale?.costo ?? null;
    if (!testo.trim()) {
      if (prima != null) righe.push({ tariffa_id: tariffaId, costo: null });
      continue;
    }
    const costo = parseAssignmentAmount(testo, 4);
    if (costo == null) { errori.push(tariffaId); continue; }
    if (prima != null && Math.abs(prima - costo) < 0.00005) continue;
    righe.push({ tariffa_id: tariffaId, costo });
  }
  return { righe, errori };
}

/** Quanto la ditta chiede in meno (o in più) del costo che l'azienda ha sulla voce, in %. */
export function scartoDalCosto(prezzoDitta: number | null | undefined, costoNostro: number | null | undefined): number | null {
  if (prezzoDitta == null || !costoNostro) return null;
  return Math.round(((prezzoDitta - costoNostro) / costoNostro) * 1000) / 10;
}
