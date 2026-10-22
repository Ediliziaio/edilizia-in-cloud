/**
 * Fase proposta per i capitoli del computo: prima il confronto per parole
 * (propostaFasi), poi l'AI per i capitoli senza abbinamento sicuro. Qui le
 * regole pure: quali capitoli chiedere all'AI, come leggere la risposta e come
 * fondere i suggerimenti con le scelte dell'anteprima.
 */
import type { VoceComputo } from "./generaDistinta";
import { capitoloVoce } from "./fasiMateriali";

export const VALORE_NUOVA = "nuova:";
export const VALORE_SENZA = "senza";

export interface SuggerimentoFase {
  capitolo: string;
  phase_id: string | null;
  nuova_fase: string | null;
  motivo: string;
  confidenza: number;
}

/** I capitoli che il confronto per parole lascia senza fase, con qualche voce d'esempio. */
export function capitoliIncerti(voci: VoceComputo[], proposta: Map<string, string | null>, maxEsempi = 4): { nome: string; esempi: string[] }[] {
  const out = new Map<string, string[]>();
  for (const v of voci) {
    const c = capitoloVoce(v);
    if (c === "Senza capitolo" || proposta.get(c)) continue;
    const esempi = out.get(c) ?? [];
    if (esempi.length < maxEsempi && v.descrizione_breve?.trim()) esempi.push(v.descrizione_breve.trim());
    out.set(c, esempi);
  }
  return [...out.entries()].map(([nome, esempi]) => ({ nome, esempi }));
}

/** La risposta della funzione, letta con prudenza: quello che non torna si scarta. */
export function leggiSuggerimentiFase(data: unknown, capitoli: string[], fasi: { id: string }[]): SuggerimentoFase[] {
  const elenco = (data as { proposte?: unknown })?.proposte;
  if (!Array.isArray(elenco)) return [];
  const ammessi = new Set(capitoli);
  const idFasi = new Set(fasi.map((f) => f.id));
  const out: SuggerimentoFase[] = [];
  for (const p of elenco as Record<string, unknown>[]) {
    const capitolo = typeof p?.capitolo === "string" ? p.capitolo : "";
    if (!ammessi.has(capitolo) || out.some((x) => x.capitolo === capitolo)) continue;
    const id = typeof p.phase_id === "string" && idFasi.has(p.phase_id) ? p.phase_id : null;
    const nuova = !id && typeof p.nuova_fase === "string" && p.nuova_fase.trim() ? p.nuova_fase.trim().slice(0, 80) : null;
    const c = Number(p.confidenza);
    out.push({
      capitolo,
      phase_id: id,
      nuova_fase: nuova,
      motivo: typeof p.motivo === "string" && p.motivo.trim() ? p.motivo.trim() : "Proposta dell'AI",
      confidenza: Number.isFinite(c) ? Math.min(Math.max(c, 0), 1) : 0.5,
    });
  }
  return out;
}

/** Valore della tendina per un suggerimento: fase esistente, fase nuova o senza fase. */
export function valoreSuggerimento(s: SuggerimentoFase): string {
  if (s.phase_id) return s.phase_id;
  if (s.nuova_fase) return VALORE_NUOVA + s.nuova_fase;
  return VALORE_SENZA;
}

/**
 * La mappa capitolo → fase dell'anteprima: proposta per parole, poi i
 * suggerimenti dell'AI (solo dove le parole non bastavano), poi le scelte
 * dell'utente, che vincono sempre.
 */
export function fondiProposte(
  perParole: Record<string, string>,
  suggerimenti: SuggerimentoFase[],
  sicuri: Set<string>,
  scelte: Record<string, string>,
): Record<string, string> {
  const out = { ...perParole };
  for (const s of suggerimenti) {
    if (sicuri.has(s.capitolo)) continue;
    out[s.capitolo] = valoreSuggerimento(s);
  }
  return { ...out, ...scelte };
}
