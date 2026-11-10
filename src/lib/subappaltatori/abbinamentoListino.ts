/**
 * Voci del computo ↔ voci del listino (10/11/2026, lotto 3 di docs/piano-subappalto-computo-listino.md).
 *
 * Il prezzo della ditta sta sulla voce del listino aziendale; la commessa ha le voci del computo.
 * Senza il ponte fra le due (order_work_phase_voci.tariffa_id) il contratto non trova il prezzo:
 * Bonarrigo ha 1.109 voci, nessuna collegata. Qui le proposte, in ordine di sicurezza:
 *   1. stesso codice (codice della voce = codice della voce di listino, unico per azienda);
 *   2. come l'ultima volta: un abbinamento già fatto a mano, ricordato in `product_aliases`
 *      (`learned_from = 'voce_computo'`) con la descrizione normalizzata;
 *   3. stessa descrizione: una sola voce di listino con lo stesso nome (normalizzato);
 *   4. niente: si sceglie a mano. (La proposta per significato con l'AI verrà dopo: il listino
 *      di Bonarrigo non ha gli embedding, 10/11/2026.)
 * Una proposta con unità diverse (mq contro pezzo) non è mai sicura: si chiede conferma.
 * Una descrizione ricordata per due voci di listino diverse non propone niente: si sceglie.
 * Tutto puro: niente rete, verificabile dai test.
 */
import { normalizzaUnita, unitaCompatibili } from "@/lib/prezzario/confronto";

export interface VoceDaAbbinare {
  id: string;
  descrizione: string;
  unita: string | null;
  origine_codice: string | null;
  tariffa_id: string | null;
}
export interface VoceListinoAbbinabile {
  id: string;
  nome: string;
  codice: string | null;
  unita: string;
  external_team_id?: string | null;
  subappaltatore_id?: string | null;
}
export interface AbbinamentoRicordato { alias_normalized: string; tariffa_id: string | null }

export type MotivoProposta = "codice" | "ricordato" | "descrizione";
export interface Proposta {
  voceId: string;
  tariffaId: string | null;
  motivo: MotivoProposta | null;
  /** Si può applicare senza guardare: motivo sicuro e unità uguali. */
  sicura: boolean;
  /** Unità della voce e della voce di listino diverse. */
  unitaDiverse: boolean;
}

/**
 * La descrizione come chiave per ricordare l'abbinamento: minuscole, senza accenti, punteggiatura
 * e spazi doppi, al massimo 300 caratteri (le descrizioni dei computi sono lunghissime, ma
 * l'inizio basta a riconoscerle e tiene corta la chiave).
 */
export function chiaveDescrizione(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 300)
    .trim();
}

/** Il listino scrive le unità di fatturazione col trattino basso («a_corpo»): per il confronto valgono come scritte a parole. */
export const unitaDelListino = (u: string | null | undefined) => (u ?? "").replace(/_/g, " ");

const codiceUguale = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Le proposte per le voci ancora senza voce di listino. Le voci proprie delle ditte non si
 * propongono: il ponte va sempre su una voce dell'azienda, che poi ogni ditta prezza a modo suo.
 */
export function proponiAbbinamenti(
  voci: ReadonlyArray<VoceDaAbbinare>,
  listino: ReadonlyArray<VoceListinoAbbinabile>,
  ricordati: ReadonlyArray<AbbinamentoRicordato>,
): Proposta[] {
  const aziendali = listino.filter((t) => !t.external_team_id && !t.subappaltatore_id);
  const perId = new Map(aziendali.map((t) => [t.id, t]));
  const perCodice = new Map<string, VoceListinoAbbinabile[]>();
  for (const t of aziendali) {
    if (!t.codice?.trim()) continue;
    const k = t.codice.trim().toLowerCase();
    perCodice.set(k, [...(perCodice.get(k) ?? []), t]);
  }
  const perNome = new Map<string, VoceListinoAbbinabile[]>();
  for (const t of aziendali) {
    const k = chiaveDescrizione(t.nome);
    if (k) perNome.set(k, [...(perNome.get(k) ?? []), t]);
  }
  const memoria = new Map<string, Set<string>>();
  for (const r of ricordati) {
    if (!r.tariffa_id || !perId.has(r.tariffa_id)) continue;
    memoria.set(r.alias_normalized, (memoria.get(r.alias_normalized) ?? new Set()).add(r.tariffa_id));
  }

  return voci.filter((v) => !v.tariffa_id).map((v) => {
    const perCod = v.origine_codice?.trim() ? perCodice.get(v.origine_codice.trim().toLowerCase()) ?? [] : [];
    let scelta: VoceListinoAbbinabile | null = null;
    let motivo: MotivoProposta | null = null;
    if (perCod.length === 1 && codiceUguale(perCod[0].codice, v.origine_codice)) {
      scelta = perCod[0]; motivo = "codice";
    } else {
      const chiave = chiaveDescrizione(v.descrizione);
      const ricordata = memoria.get(chiave);
      const stessoNome = perNome.get(chiave) ?? [];
      if (ricordata?.size === 1) { scelta = perId.get([...ricordata][0]) ?? null; motivo = scelta ? "ricordato" : null; }
      else if (!ricordata && stessoNome.length === 1) { scelta = stessoNome[0]; motivo = "descrizione"; }
    }
    const unitaDiverse = !!scelta && !unitaCompatibili(v.unita, unitaDelListino(scelta.unita));
    return { voceId: v.id, tariffaId: scelta?.id ?? null, motivo, sicura: !!scelta && !unitaDiverse, unitaDiverse };
  });
}

/** Quante voci si abbinano da sole, quante chiedono uno sguardo, quante restano da scegliere. */
export function riepilogoProposte(proposte: ReadonlyArray<Proposta>) {
  return {
    sicure: proposte.filter((p) => p.sicura).length,
    daGuardare: proposte.filter((p) => p.tariffaId && !p.sicura).length,
    daScegliere: proposte.filter((p) => !p.tariffaId).length,
  };
}

/** L'unità della voce come la vuole il listino (le due colonne), o null se il listino non la conosce. */
export function unitaPerListino(u: string | null): { unita: string; unita_fatturazione: string } | null {
  const n = normalizzaUnita(u);
  const mappa: Record<string, [string, string]> = {
    m2: ["mq", "mq"], m3: ["mc", "mc"], m: ["ml", "ml"], cad: ["pz", "pz"], h: ["h", "h"],
    "a corpo": ["fisso", "a_corpo"], kg: ["pz", "kg"], gg: ["pz", "gg"], mese: ["fisso", "mese"], km: ["km", "km"], piano: ["piano", "piano"],
  };
  const m = mappa[n];
  return m ? { unita: m[0], unita_fatturazione: m[1] } : null;
}
