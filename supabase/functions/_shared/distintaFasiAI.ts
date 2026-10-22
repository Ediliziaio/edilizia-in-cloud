// Regole pure di distinta-proponi-fasi: in quale fase della commessa vanno i
// materiali di un capitolo del computo. Prompt e pulizia della risposta.
// Nessuna dipendenza: la suite vitest le importa.

export interface CapitoloDaAbbinare {
  /** Nome del capitolo (super-categoria o categoria del computo). */
  nome: string;
  /** Qualche descrizione di voce del capitolo, per capire di cosa parla. */
  esempi: string[];
}

export interface FaseEsistente {
  id: string;
  nome: string;
}

export interface ProposteFase {
  capitolo: string;
  /** Fase esistente scelta (null se ne serve una nuova o nessuna). */
  phase_id: string | null;
  /** Nome della fase da creare, se nessuna esistente va bene. */
  nuova_fase: string | null;
  motivo: string;
  /** 0-1. */
  confidenza: number;
}

export const MAX_CAPITOLI = 40;

export const PROMPT_FASI = `Sei un capocantiere italiano. Ricevi i capitoli di un computo metrico (con qualche voce di esempio) e le fasi di lavoro di una commessa.
Per OGNI capitolo scegli la fase in cui vanno i suoi materiali.

REGOLE
- Se una fase esistente è adatta, usa il suo id esatto in "phase_id" e lascia "nuova_fase" null.
- Se nessuna fase è adatta, "phase_id" null e in "nuova_fase" un nome breve da cantiere (es. "Impianto elettrico", "Rivelazione incendi", "Opere murarie").
- Capitoli di sicurezza, oneri o spese generali: "phase_id" null e "nuova_fase" null.
- "motivo": una frase semplice in italiano (massimo 20 parole) che spiega la scelta.
- "confidenza" da 0 a 1: bassa se il capitolo è generico o ambiguo.

Rispondi SOLO con JSON: {"proposte":[{"capitolo":"<nome esatto del capitolo>","phase_id":"<id o null>","nuova_fase":"<nome o null>","motivo":"…","confidenza":0.8}]}`;

export function messaggioFasi(capitoli: CapitoloDaAbbinare[], fasi: FaseEsistente[]): string {
  const elencoFasi = fasi.length
    ? fasi.map((f) => `- id: ${f.id} · nome: ${f.nome}`).join("\n")
    : "(la commessa non ha ancora fasi)";
  const elencoCapitoli = capitoli
    .map((c) => [`capitolo: ${c.nome}`, ...c.esempi.slice(0, 5).map((e) => `  voce: ${e.slice(0, 160)}`)].join("\n"))
    .join("\n---\n");
  return `FASI DELLA COMMESSA\n${elencoFasi}\n\nCAPITOLI DEL COMPUTO\n${elencoCapitoli}`;
}

function testo(v: unknown, max: number): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.toLowerCase() === "null") return null;
  return s.slice(0, max);
}

/**
 * Tiene solo i capitoli chiesti (confronto senza maiuscole), le fasi che
 * esistono davvero e una confidenza tra 0 e 1. Un id di fase inventato
 * diventa «nessuna proposta», non una fase sbagliata.
 */
export function pulisciProposteFasi(risposta: unknown, capitoli: string[], fasi: FaseEsistente[]): ProposteFase[] {
  const perNome = new Map(capitoli.map((c) => [c.trim().toLowerCase(), c]));
  const idFasi = new Set(fasi.map((f) => f.id));
  const elenco = (risposta as { proposte?: unknown })?.proposte;
  if (!Array.isArray(elenco)) return [];
  const viste = new Set<string>();
  const out: ProposteFase[] = [];
  for (const p of elenco as Record<string, unknown>[]) {
    const capitolo = perNome.get(String(p?.capitolo ?? "").trim().toLowerCase());
    if (!capitolo || viste.has(capitolo)) continue;
    viste.add(capitolo);
    const id = testo(p.phase_id, 64);
    const phaseId = id && idFasi.has(id) ? id : null;
    const nuova = phaseId ? null : testo(p.nuova_fase, 80);
    const c = Number(p.confidenza);
    let confidenza = Number.isFinite(c) ? Math.min(Math.max(c, 0), 1) : 0.5;
    // L'id inventato non è una scelta: la confidenza scende.
    if (id && !phaseId) confidenza = Math.min(confidenza, 0.3);
    out.push({
      capitolo,
      phase_id: phaseId,
      nuova_fase: nuova,
      motivo: testo(p.motivo, 240) ?? (phaseId || nuova ? "Proposta dell'AI" : "Nessuna fase adatta"),
      confidenza: Math.round(confidenza * 100) / 100,
    });
  }
  return out;
}
