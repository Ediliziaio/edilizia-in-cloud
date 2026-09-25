/**
 * La configurazione dell'agente WhatsApp dei lead (25/09/2026).
 *
 * Sta in ai_agents_v2.tools_config.lead_whatsapp, la scrive il pannello
 * dell'agente (src/components/agenti/AgenteWhatsAppLeadPanel.tsx) e la legge
 * la edge function lead-agente-whatsapp. Senza calendario l'agente non parte:
 * meglio nessuna risposta che un orario inventato.
 *
 * Nessun import: lo leggono sia Deno sia i test.
 */

export interface ConfigAgenteLead {
  calendarioId: string;
  pipelineId: string | null;
  fasePrenotatoId: string | null;
  faseFuoriZonaId: string | null;
  faseOperatoreId: string | null;
  utentiDaAvvisare: string[];
  /** Quanti giorni avanti cercare orari liberi (1-21). */
  giorniProposta: number;
  tagPrenotato: string | null;
  /** Proporre solo orari dal lunedì al venerdì, anche se il calendario apre il sabato. */
  soloFeriali: boolean;
}

export type EsitoConfig =
  | { ok: true; config: ConfigAgenteLead }
  | { ok: false; mancano: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOppureNull(v: unknown): string | null {
  return typeof v === "string" && UUID.test(v.trim()) ? v.trim() : null;
}

export function leggiConfigAgenteLead(toolsConfig: unknown): EsitoConfig {
  const radice = toolsConfig && typeof toolsConfig === "object" ? (toolsConfig as Record<string, unknown>) : {};
  const c = radice.lead_whatsapp && typeof radice.lead_whatsapp === "object"
    ? (radice.lead_whatsapp as Record<string, unknown>)
    : {};

  const calendarioId = uuidOppureNull(c.calendario_id);
  if (!calendarioId) return { ok: false, mancano: ["calendario"] };

  const giorni = Number(c.giorni_proposta);
  const tag = typeof c.tag_prenotato === "string" ? c.tag_prenotato.trim() : "";

  return {
    ok: true,
    config: {
      calendarioId,
      pipelineId: uuidOppureNull(c.pipeline_id),
      fasePrenotatoId: uuidOppureNull(c.fase_prenotato_id),
      faseFuoriZonaId: uuidOppureNull(c.fase_fuori_zona_id),
      faseOperatoreId: uuidOppureNull(c.fase_operatore_id),
      utentiDaAvvisare: Array.isArray(c.utenti_da_avvisare)
        ? c.utenti_da_avvisare.map(uuidOppureNull).filter((x): x is string => Boolean(x))
        : [],
      giorniProposta: Number.isInteger(giorni) && giorni >= 1 && giorni <= 21 ? giorni : 7,
      tagPrenotato: tag || null,
      soloFeriali: c.solo_feriali === true,
    },
  };
}
