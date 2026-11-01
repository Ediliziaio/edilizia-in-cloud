/**
 * Ditte, listino e contratti di una commessa (31/10/2026, Dimora Torino).
 *
 * Dimora affida sempre lo stesso tipo di lavoro alla stessa ditta: gli impianti
 * idraulici al termotecnico, l'elettrico all'elettricista, la decorazione al
 * decoratore. Il listino manodopera non dice chi fa cosa (nessuna tariffa ha la
 * sua ditta), le commesse passate sì. Qui:
 *   · la ditta proposta per una fase, da come si chiamavano le fasi date a
 *     quella ditta nelle altre commesse («IMPIANTO IDRAULICO» = «Impianto idraulico»,
 *     «CARTONGESSI» = «Cartongesso»);
 *   · il prezzo di una voce per una ditta (la sua variante di listino, se c'è,
 *     altrimenti il costo della voce);
 *   · l'elenco dei lavori di una ditta, da mettere nel contratto (Allegato A).
 * Tutto puro: niente rete, verificabile dai test.
 */
import type { RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import { varianteDellaSquadra, type VarianteCostoDitta } from "@/lib/orders/costoDitta";

export type { RigaElencoLavori };

// Le parole delle fasi e la ditta proposta stanno in shared/: le usa anche Silvio quando
// prepara la commessa (fase 4 di docs/piano-silvio-commessa-ai.md).
export {
  paroleFase, somiglianzaFasi, dittaProposta, type FaseStorica, type DittaProposta,
} from "../../../shared/silvio-commessa/somiglianza.ts";

export interface VoceLavoro {
  id: string;
  phase_id: string;
  position?: number;
  descrizione: string;
  unita: string | null;
  quantita: number;
  costo_manodopera: number;
  tariffa_id: string | null;
  origine_codice?: string | null;
}

const centesimi = (n: number) => Math.round(n * 100) / 100;

/** Il prezzo unitario di una voce per quella ditta: la sua variante di listino, se c'è; altrimenti il costo della voce. */
export function prezzoVoceDitta(v: VoceLavoro, dittaId: string | null, varianti: ReadonlyArray<VarianteCostoDitta>): number {
  if (dittaId && v.tariffa_id) {
    const variante = varianteDellaSquadra(varianti, v.tariffa_id, dittaId);
    if (variante?.costo != null) return Number(variante.costo) || 0;
  }
  return Number(v.costo_manodopera) || 0;
}

/** Il costo del lavoro di una fase per una ditta: Σ quantità × prezzo, senza IVA. */
export function costoFaseDitta(phaseId: string, voci: VoceLavoro[], dittaId: string | null, varianti: ReadonlyArray<VarianteCostoDitta>): number {
  return centesimi(voci.filter((v) => v.phase_id === phaseId).reduce((t, v) => t + v.quantita * prezzoVoceDitta(v, dittaId, varianti), 0));
}

/**
 * L'elenco dei lavori di una ditta per il contratto: le voci delle fasi che
 * le sono affidate, nell'ordine delle fasi, col suo prezzo. Le voci a
 * costo zero restano (si vede cosa deve fare anche se è compreso).
 */
export function elencoLavoriDitta(
  fasi: Array<{ id: string; name: string; position?: number | null }>,
  voci: VoceLavoro[],
  faseIds: string[],
  dittaId: string,
  varianti: ReadonlyArray<VarianteCostoDitta>,
): RigaElencoLavori[] {
  return fasi
    .filter((f) => faseIds.includes(f.id))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .flatMap((f) =>
      voci
        .filter((v) => v.phase_id === f.id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((v) => {
          const prezzo = prezzoVoceDitta(v, dittaId, varianti);
          return {
            fase: f.name,
            descrizione: v.descrizione,
            unita: v.unita,
            quantita: v.quantita,
            prezzo,
            importo: centesimi(v.quantita * prezzo),
            codice: v.origine_codice ?? null,
          };
        }),
    );
}

/** Dal primo inizio all'ultima fine delle fasi affidate: le date del contratto. */
export function periodoFasi(fasi: Array<{ id: string; start_date?: string | null; end_date?: string | null }>, faseIds: string[]) {
  const scelte = fasi.filter((f) => faseIds.includes(f.id));
  const inizi = scelte.map((f) => f.start_date).filter((d): d is string => !!d).sort();
  const fini = scelte.map((f) => f.end_date).filter((d): d is string => !!d).sort();
  return { dal: inizi[0] ?? null, al: fini.at(-1) ?? null };
}
