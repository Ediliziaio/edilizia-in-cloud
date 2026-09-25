/**
 * La configurazione dell'agente WhatsApp dei lead (25/09/2026): sta in
 * ai_agents_v2.tools_config.lead_whatsapp e la scrive il pannello dell'agente.
 */
import { describe, expect, it } from "vitest";
import { leggiConfigAgenteLead } from "../../../supabase/functions/_shared/agenteLeadConfig";

const CAL = "4cb55125-788e-44a1-a5b9-932005f8796d";
const PIPE = "11111111-1111-4111-8111-111111111111";
const FASE = "22222222-2222-4222-8222-222222222222";
const UTENTE = "c0a1f079-3fb6-42c3-ab40-76c522cef1e2";

describe("leggiConfigAgenteLead", () => {
  it("senza calendario l'agente non può prenotare: dice cosa manca", () => {
    expect(leggiConfigAgenteLead({})).toEqual({ ok: false, mancano: ["calendario"] });
    expect(leggiConfigAgenteLead(null)).toEqual({ ok: false, mancano: ["calendario"] });
    expect(leggiConfigAgenteLead({ lead_whatsapp: { calendario_id: "non-un-uuid" } })).toEqual({ ok: false, mancano: ["calendario"] });
  });

  it("legge la configurazione completa", () => {
    const r = leggiConfigAgenteLead({
      lead_whatsapp: {
        calendario_id: CAL,
        pipeline_id: PIPE,
        fase_prenotato_id: FASE,
        fase_fuori_zona_id: FASE,
        fase_operatore_id: FASE,
        utenti_da_avvisare: [UTENTE, "x"],
        giorni_proposta: 10,
        tag_prenotato: "  appuntamento fissato  ",
      },
    });
    expect(r).toEqual({
      ok: true,
      config: {
        calendarioId: CAL,
        pipelineId: PIPE,
        fasePrenotatoId: FASE,
        faseFuoriZonaId: FASE,
        faseOperatoreId: FASE,
        utentiDaAvvisare: [UTENTE],
        giorniProposta: 10,
        tagPrenotato: "appuntamento fissato",
      },
    });
  });

  it("valori sbagliati diventano quelli predefiniti", () => {
    const r = leggiConfigAgenteLead({
      lead_whatsapp: { calendario_id: CAL, pipeline_id: "", utenti_da_avvisare: "tutti", giorni_proposta: 99, tag_prenotato: "" },
    });
    expect(r.ok && r.config).toEqual({
      calendarioId: CAL,
      pipelineId: null,
      fasePrenotatoId: null,
      faseFuoriZonaId: null,
      faseOperatoreId: null,
      utentiDaAvvisare: [],
      giorniProposta: 7,
      tagPrenotato: null,
    });
  });
});
