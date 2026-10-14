/**
 * «Popola con memorie demo»: le memorie si scrivono a blocchi (12/10/2026).
 *
 * Prima ogni memoria era una record_persona_memory seguita da un
 * aggiornamento di hits_count. Il 12/10 alle 8:01, in poco più di un minuto e
 * mezzo: 201 RPC, 201 aggiornamenti (ognuno col suo preflight) e 84 ricariche
 * del grafo, che il tempo reale faceva ripartire a ogni riga.
 *
 * Ora si leggono una volta le memorie già presenti e le nuove partono in un
 * insert solo (a lotti oltre le 500 righe), con hits_count già al valore della
 * demo. Chi può farlo è chi poteva chiamare la RPC per le memorie aziendali:
 * la policy di insert su ai_persona_memory le consente all'amministratore
 * dell'azienda e al super admin.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { aLotti, LOTTO_RIGHE } from "@/lib/lottiDiId";
import { DEMO_MEMORIES, resolveDemoPersonaKey, type DemoMemory } from "./brainGraphDemoMemories";

export interface EsitoMemorieDemo {
  inserite: number;
  /** Già nel cervello dell'azienda (un secondo clic): restano come sono. */
  giaPresenti: number;
  /** La persona della demo non ha un corrispondente tra quelle attive. */
  senzaPersona: number;
}

/** La stessa chiave con cui record_persona_memory riconosce una memoria già scritta. */
function chiaveMemoria(personaKey: string, content: string): string {
  return `${personaKey.trim()}\n${content.trim().toLowerCase()}`;
}

export async function scriviMemorieDemo(opzioni: {
  companyId: string;
  userId: string | null;
  personeDisponibili: Set<string>;
  memorie?: readonly DemoMemory[];
}): Promise<EsitoMemorieDemo> {
  const { companyId, userId, personeDisponibili, memorie = DEMO_MEMORIES } = opzioni;

  const { data: presenti, error: erroreLettura } = await supabase
    .from("ai_persona_memory")
    .select("persona_key, content")
    .eq("company_id", companyId)
    .is("user_id", null)
    .eq("enabled", true);
  if (erroreLettura) throw erroreLettura;
  const scritte = new Set((presenti ?? []).map((m) => chiaveMemoria(m.persona_key, m.content)));

  const adesso = new Date().toISOString();
  const righe: TablesInsert<"ai_persona_memory">[] = [];
  let giaPresenti = 0;
  let senzaPersona = 0;
  for (const memoria of memorie) {
    const personaKey = resolveDemoPersonaKey(memoria.persona_key, personeDisponibili);
    if (!personaKey) { senzaPersona++; continue; }
    const chiave = chiaveMemoria(personaKey, memoria.content);
    if (scritte.has(chiave)) { giaPresenti++; continue; }
    scritte.add(chiave);
    righe.push({
      company_id: companyId,
      user_id: null,
      persona_key: personaKey,
      memory_type: memoria.memory_type,
      content: memoria.content.trim(),
      source: "demo_seed",
      confidence: Math.min(1, Math.max(0, memoria.confidence)),
      hits_count: Math.max(1, memoria.hits_count),
      last_used_at: adesso,
      created_by: userId,
    });
  }

  for (const lotto of aLotti(righe, LOTTO_RIGHE)) {
    const { error } = await supabase.from("ai_persona_memory").insert(lotto);
    if (error) throw error;
  }
  return { inserite: righe.length, giaPresenti, senzaPersona };
}
