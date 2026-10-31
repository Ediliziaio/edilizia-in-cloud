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

const PAROLE_VUOTE = new Set([
  "di", "e", "ed", "in", "a", "da", "del", "della", "dello", "dei", "delle", "degli", "la", "il", "lo", "le", "gli", "i",
  "per", "con", "su", "opera", "opere", "lavori", "lavoro", "impianto", "impianti", "varie", "vari",
]);

/** Le parole che contano nel nome di una fase, senza accenti, plurali e articoli. */
export function paroleFase(nome: string): string[] {
  const parole = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((p) => p.length >= 2 && !PAROLE_VUOTE.has(p))
    // «demolizioni» e «demolizione», «cartongessi» e «cartongesso»: stessa radice.
    .map((p) => (p.length > 4 ? p.replace(/[aeiou]+$/, "") : p))
    .filter((p) => p.length >= 2);
  return [...new Set(parole)];
}

/** Quanto si somigliano due nomi di fase: 0 niente, 1 uguali. */
export function somiglianzaFasi(a: string, b: string): number {
  const x = paroleFase(a);
  const y = new Set(paroleFase(b));
  if (!x.length || !y.size) return 0;
  const comuni = x.filter((p) => y.has(p)).length;
  return comuni / new Set([...x, ...y]).size;
}

export interface FaseStorica {
  /** Nome della fase in un'altra commessa. */
  fase: string;
  external_team_id: string;
}

export interface DittaProposta {
  external_team_id: string;
  /** Quante fasi simili, nelle altre commesse, ha fatto questa ditta. */
  volte: number;
  /** La fase più simile, per dire perché. */
  come: string;
}

/**
 * La ditta da proporre per una fase: quella che nelle altre commesse ha fatto
 * più fasi con un nome simile (almeno metà delle parole in comune). Nessuna = null.
 */
export function dittaProposta(nomeFase: string, storico: FaseStorica[]): DittaProposta | null {
  const perDitta = new Map<string, { punti: number; volte: number; migliore: number; come: string }>();
  for (const s of storico) {
    const sim = somiglianzaFasi(nomeFase, s.fase);
    if (sim < 0.5) continue;
    const d = perDitta.get(s.external_team_id) ?? { punti: 0, volte: 0, migliore: 0, come: s.fase };
    d.punti += sim;
    d.volte += 1;
    if (sim > d.migliore) Object.assign(d, { migliore: sim, come: s.fase });
    perDitta.set(s.external_team_id, d);
  }
  const [migliore] = [...perDitta.entries()].sort((a, b) => b[1].migliore - a[1].migliore || b[1].punti - a[1].punti);
  return migliore ? { external_team_id: migliore[0], volte: migliore[1].volte, come: migliore[1].come } : null;
}

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

/**
 * La stessa ditta ha due schede: quella del campo (`subappaltatori`, a cui punta la ditta della commessa) e
 * quella della sicurezza (`subappaltatori_sicurezza`, a cui punta il contratto), legate da
 * `campo_subappaltatore_id`. Gli id sono diversi: confrontarli direttamente non trova mai il contratto
 * (Dimora Torino, 31/10/2026). Una ditta può avere più schede sicurezza: prima quella della commessa,
 * poi quella generale, poi la più vecchia.
 */
export interface SchedaSicurezza { id: string; campo_subappaltatore_id: string | null; order_id: string | null; created_at?: string | null }

export function schedeSicurezzaDitta<T extends SchedaSicurezza>(campoId: string | null, schede: T[], orderId: string): T[] {
  if (!campoId) return [];
  const rango = (s: T) => (s.order_id === orderId ? 0 : s.order_id == null ? 1 : 2);
  return schede
    .filter((s) => s.campo_subappaltatore_id === campoId && rango(s) < 2)
    .sort((a, b) => rango(a) - rango(b) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
}

/** Il contratto della ditta in questa commessa: punta a una delle sue schede sicurezza (o, in dati vecchi, alla scheda del campo). */
export function contrattoDellaDitta<C extends { subappaltatore_id: string }>(campoId: string | null, contratti: C[], schede: SchedaSicurezza[]): C | null {
  if (!campoId) return null;
  const ids = new Set([campoId, ...schede.filter((s) => s.campo_subappaltatore_id === campoId).map((s) => s.id)]);
  return contratti.find((c) => ids.has(c.subappaltatore_id)) ?? null;
}

/**
 * L'elenco dei lavori del contratto si rivede prima di firmarlo (Dimora Torino, 31/10/2026): righe da
 * togliere o aggiungere, quantità e prezzi da correggere. Per una voce presa dal listino si propone il
 * prezzo concordato con quella ditta (la sua variante di listino), altrimenti il costo del listino:
 * è un suggerimento, chi scrive il contratto lo può cambiare.
 */
export function prezzoListinoPerDitta(
  tariffa: { id: string; costo: number },
  dittaId: string | null,
  varianti: ReadonlyArray<VarianteCostoDitta>,
): { prezzo: number; concordato: boolean } {
  const variante = dittaId ? varianteDellaSquadra(varianti, tariffa.id, dittaId) : null;
  return variante?.costo != null
    ? { prezzo: Number(variante.costo) || 0, concordato: true }
    : { prezzo: Number(tariffa.costo) || 0, concordato: false };
}

/** Una riga dell'elenco con l'importo rifatto da quantità × prezzo, al centesimo. */
export function rigaElencoRicalcolata(r: RigaElencoLavori): RigaElencoLavori {
  const quantita = Number(r.quantita) || 0;
  const prezzo = Number(r.prezzo) || 0;
  return { ...r, quantita, prezzo, importo: centesimi(quantita * prezzo) };
}

/** Le righe pronte da salvare: senza descrizione o a quantità zero non entrano nel contratto. */
export function elencoDaSalvare(righe: RigaElencoLavori[]): RigaElencoLavori[] {
  // Solo i campi del contratto: niente chiavi o altro che la finestra di modifica attacca alle righe.
  return righe
    .map((r) => rigaElencoRicalcolata({
      fase: r.fase.trim() || "Altri lavori", descrizione: r.descrizione.trim(), unita: r.unita, quantita: r.quantita, prezzo: r.prezzo, importo: r.importo,
      ...(r.codice != null ? { codice: r.codice } : {}),
    }))
    .filter((r) => r.descrizione && r.quantita > 0);
}
