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
  subphase_id?: string | null;
}
export interface SottofaseLavoro { id: string; phase_id: string; name: string; position?: number | null }

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
 * L'elenco dei lavori di una ditta per il contratto: tutto quello che deve fare nelle fasi che le
 * sono affidate, nell'ordine delle fasi, col suo prezzo. Le voci a costo zero restano (si vede cosa
 * deve fare anche se è compreso). Una sottofase senza voce entra a corpo, compresa nel prezzo; una
 * fase senza voci né sottofasi entra a corpo col costo previsto della ditta su quella fase.
 */
export function elencoLavoriDitta(
  fasi: Array<{ id: string; name: string; position?: number | null }>,
  voci: VoceLavoro[],
  faseIds: string[],
  dittaId: string,
  varianti: ReadonlyArray<VarianteCostoDitta>,
  altro: { sottofasi?: ReadonlyArray<SottofaseLavoro>; previstoFase?: ReadonlyMap<string, number> } = {},
): RigaElencoLavori[] {
  return fasi
    .filter((f) => faseIds.includes(f.id))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .flatMap((f) => {
      const delle = voci.filter((v) => v.phase_id === f.id);
      const righe: RigaElencoLavori[] = [...delle]
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
            fase_id: f.id,
            sottofase_id: v.subphase_id ?? null,
          };
        });
      // Una fase senza voci ha il prezzo nel previsto della ditta: va in testa, a corpo; le sottofasi seguono, comprese.
      const previsto = centesimi(Number(altro.previstoFase?.get(f.id)) || 0);
      if (delle.length === 0 && previsto > 0) {
        righe.push({ fase: f.name, descrizione: f.name, unita: "a corpo", quantita: 1, prezzo: previsto, importo: previsto, codice: null, fase_id: f.id, sottofase_id: null });
      }
      const conVoce = new Set(delle.map((v) => v.subphase_id).filter(Boolean));
      const sole = (altro.sottofasi ?? []).filter((s) => s.phase_id === f.id && !conVoce.has(s.id))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      for (const s of sole) {
        righe.push({ fase: f.name, descrizione: s.name, unita: "a corpo", quantita: 1, prezzo: 0, importo: 0, codice: null, fase_id: f.id, sottofase_id: s.id });
      }
      if (righe.length === 0) {
        righe.push({ fase: f.name, descrizione: f.name, unita: "a corpo", quantita: 1, prezzo: 0, importo: 0, codice: null, fase_id: f.id, sottofase_id: null });
      }
      return righe;
    });
}

/** Un affidamento di una voce a una ditta (subappalto_affidamenti), quanto serve al contratto. */
export interface AffidamentoPerContratto {
  id: string;
  voce_id: string;
  subappaltatore_id: string;
  quantita: number;
  prezzo_unitario: number | null;
  origine_prezzo: "listino_ditta" | "costo_aziendale" | "manuale";
  comprende: "posa" | "fornitura_e_posa";
  stato: "bozza" | "a_contratto";
  contratto_id?: string | null;
}

/**
 * Lotto 5 (10/11/2026): l'elenco del contratto dalle voci affidate alla ditta, non da tutte le voci delle
 * sue fasi. Entrano le quote libere (in bozza) e quelle già di questo contratto; quantità e prezzo sono
 * quelli della quota. Il venduto non c'è: non esce mai dall'impresa. Vuoto se la ditta non ha affidamenti.
 */
export function elencoDaAffidamenti(
  fasi: Array<{ id: string; name: string; position?: number | null }>,
  voci: VoceLavoro[],
  affidamenti: ReadonlyArray<AffidamentoPerContratto>,
  anagraficaId: string | null,
  contrattoId: string | null,
): RigaElencoLavori[] {
  if (!anagraficaId) return [];
  const voce = new Map(voci.map((v) => [v.id, v]));
  const fase = new Map(fasi.map((f) => [f.id, f]));
  return affidamenti
    .filter((a) => a.subappaltatore_id === anagraficaId && (a.stato === "bozza" || (!!contrattoId && a.contratto_id === contrattoId)))
    .flatMap((a) => {
      const v = voce.get(a.voce_id);
      return v ? [{ a, v, f: fase.get(v.phase_id) }] : [];
    })
    .sort((x, y) => (x.f?.position ?? 0) - (y.f?.position ?? 0) || (x.v.position ?? 0) - (y.v.position ?? 0))
    .map(({ a, v, f }) => {
      // Nel contratto il prezzo va al centesimo (il quadro lavori e le varianti lo vogliono così): 12,345 → 12,35.
      const prezzo = centesimi(Number(a.prezzo_unitario) || 0);
      return {
        fase: f?.name ?? "Altri lavori",
        descrizione: v.descrizione,
        unita: v.unita,
        quantita: Number(a.quantita) || 0,
        prezzo,
        importo: centesimi((Number(a.quantita) || 0) * prezzo),
        codice: v.origine_codice ?? null,
        fase_id: v.phase_id,
        sottofase_id: v.subphase_id ?? null,
        voce_id: v.id,
        affidamento_id: a.id,
        comprende: a.comprende,
        origine: a.origine_prezzo,
      };
    });
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
export function contrattoDellaDitta<C extends { subappaltatore_id: string; stato?: string | null }>(campoId: string | null, contratti: C[], schede: SchedaSicurezza[]): C | null {
  if (!campoId) return null;
  const ids = new Set([campoId, ...schede.filter((s) => s.campo_subappaltatore_id === campoId).map((s) => s.id)]);
  // Un contratto risolto è chiuso: non deve impedire di farne uno nuovo con la stessa ditta sulla commessa.
  return contratti.find((c) => ids.has(c.subappaltatore_id) && c.stato !== "risolto") ?? null;
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
      ...(r.fase_id ? { fase_id: r.fase_id } : {}),
      ...(r.sottofase_id ? { sottofase_id: r.sottofase_id } : {}),
      ...(r.voce_id ? { voce_id: r.voce_id } : {}),
      ...(r.affidamento_id ? { affidamento_id: r.affidamento_id } : {}),
      ...(r.comprende ? { comprende: r.comprende } : {}),
    }))
    .filter((r) => r.descrizione && r.quantita > 0);
}

/**
 * Il contratto diviso per fase: quanto vale ogni fase nell'elenco pattuito (senza IVA). La fase si riconosce
 * dall'id scritto sulla riga o, nei contratti vecchi, dal nome. Le righe che non trovano una fase restano fuori
 * e si contano: il previsto non le può mettere da nessuna parte.
 */
export function contrattoPerFase(
  elenco: ReadonlyArray<Pick<RigaElencoLavori, "fase" | "importo" | "fase_id">>,
  fasi: ReadonlyArray<{ id: string; name: string }>,
): { perFase: Map<string, number>; senzaFase: number } {
  const esistenti = new Set(fasi.map((f) => f.id));
  const perNome = new Map(fasi.map((f) => [f.name.trim().toLocaleLowerCase("it-IT"), f.id]));
  const perFase = new Map<string, number>();
  let senzaFase = 0;
  for (const r of elenco) {
    const id = r.fase_id && esistenti.has(r.fase_id) ? r.fase_id : perNome.get(String(r.fase ?? "").trim().toLocaleLowerCase("it-IT"));
    const importo = Number(r.importo) || 0;
    if (id) perFase.set(id, centesimi((perFase.get(id) ?? 0) + importo));
    else senzaFase = centesimi(senzaFase + importo);
  }
  return { perFase, senzaFase };
}
