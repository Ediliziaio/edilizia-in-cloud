/**
 * preambolo.ts — loader per il Preambolo Costituzionale (Track 1 Cervello Supremo)
 *
 * Carica da `ai_constitutional_preamble` la versione attiva (active=true)
 * e la antepone al system_prompt persona-specifico.
 *
 * Cache in-memory di 60 secondi per zero latency aggiunta su edge function.
 *
 * USO:
 *   import { buildSystemPrompt } from "../_shared/preambolo.ts";
 *   const fullPrompt = await buildSystemPrompt(supabaseAdmin, persona.system_prompt);
 *
 * COSA FA:
 *   1. Legge preambolo costituzionale attivo da DB (cache 60s)
 *   2. Concatena: preambolo + "\n\n" + persona_prompt
 *   3. Ritorna stringa pronta per essere passata come system role al LLM
 *
 * FALLBACK:
 *   Se DB unreachable o nessun preambolo attivo, ritorna SOLO il persona_prompt
 *   con un warning in console. NON blocca la chat.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

interface PreamboloCache {
  content: string;
  version: number;
  fetchedAt: number;
}

let _cache: PreamboloCache | null = null;
const CACHE_TTL_MS = 60_000;

/**
 * Carica preambolo attivo da DB con cache 60s.
 * Ritorna null se nessun preambolo configurato o errore DB.
 */
export async function loadActivePreambolo(
  supabase: SupabaseClient,
): Promise<{ content: string; version: number } | null> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return { content: _cache.content, version: _cache.version };
  }

  try {
    const { data, error } = await supabase
      .from("ai_constitutional_preamble")
      .select("content, version")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[preambolo] load error:", error.message);
      return null;
    }
    if (!data) {
      console.warn("[preambolo] nessun preambolo attivo trovato");
      return null;
    }

    _cache = {
      content: data.content,
      version: data.version,
      fetchedAt: now,
    };
    return { content: data.content, version: data.version };
  } catch (e) {
    console.warn("[preambolo] exception:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Costruisce il system prompt completo: preambolo + sezione persona-specifica.
 * Se il preambolo non è caricabile, ritorna solo persona_prompt (graceful degradation).
 */
export async function buildSystemPrompt(
  supabase: SupabaseClient,
  personaPrompt: string,
): Promise<{ prompt: string; preamboloVersion: number | null }> {
  const preambolo = await loadActivePreambolo(supabase);
  if (!preambolo) {
    return { prompt: personaPrompt, preamboloVersion: null };
  }
  return {
    prompt: `${preambolo.content}\n\n${personaPrompt}`,
    preamboloVersion: preambolo.version,
  };
}

/**
 * Per testing / debugging: invalida la cache forzando reload alla prossima chiamata.
 */
export function invalidatePreamboloCache(): void {
  _cache = null;
}
