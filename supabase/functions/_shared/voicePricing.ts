/**
 * voicePricing — il prezzo al minuto delle chiamate AI, in UN posto solo.
 *
 * Il superadmin lo imposta in "Costi & Margini" (platform_pricing, per coppia
 * LLM + TTS). Tre funzioni lo leggevano ognuna a modo suo, tutte con lo stesso
 * difetto: cercavano il TTS "eleven_multilingual_v2" mentre gli agenti creati
 * dalla UI parlano con eleven_flash_v2_5 — riga che in tabella non esisteva.
 * Risultato: nessuna corrispondenza, ripiego su 0,04/0,02 hardcodati, e le
 * tariffe impostate dal superadmin ignorate su ogni chiamata.
 *
 * Qui: il TTS in uso e' una costante condivisa (la stessa che il proxy imposta
 * su ElevenLabs), la ricerca ha una catena di ripieghi esplicita e l'override
 * per azienda (company_billing_overrides, servizio ai_agents) si applica una
 * volta sola.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCompanyBillingConfig } from "./billingConfig.ts";

/** Il TTS con cui nascono gli agenti vocali (vedi elevenlabs-proxy). */
export const TTS_MODEL_VOCE = "eleven_flash_v2_5";
export const LLM_VOCE_DEFAULT = "gemini-2.5-flash";

/** Ripiego finale, usato SOLO se la tabella e' vuota: va sempre loggato. */
const RIPIEGO = { costoReale: 0.02, prezzo: 0.04 };

export interface PrezzoMinuto {
  costoRealePerMin: number;
  prezzoPerMin: number;
  ttsModel: string;
  llmModel: string;
  fonte: "esatto" | "stesso_llm" | "default_voce" | "ripiego";
  override: "gratis" | "prezzo_fisso" | "markup" | null;
}

export async function prezzoMinutoVoce(
  admin: SupabaseClient,
  companyId: string,
  llmModel: string | null | undefined,
  ttsModel: string | null | undefined,
): Promise<PrezzoMinuto> {
  const llm = (llmModel || LLM_VOCE_DEFAULT).trim();
  const tts = (ttsModel || TTS_MODEL_VOCE).trim();

  let fonte: PrezzoMinuto["fonte"] = "ripiego";
  let riga: { cost_real_per_min: number; cost_billed_per_min: number } | null = null;

  const esatta = await admin.from("platform_pricing")
    .select("cost_real_per_min, cost_billed_per_min").eq("llm_model", llm).eq("tts_model", tts).eq("is_active", true).maybeSingle();
  if (esatta.data) { riga = esatta.data; fonte = "esatto"; }

  if (!riga) {
    // Stesso LLM, qualunque TTS attivo: il costo lo fa soprattutto l'LLM.
    const stessoLlm = await admin.from("platform_pricing")
      .select("cost_real_per_min, cost_billed_per_min").eq("llm_model", llm).eq("is_active", true)
      .order("cost_billed_per_min", { ascending: true }).limit(1).maybeSingle();
    if (stessoLlm.data) { riga = stessoLlm.data; fonte = "stesso_llm"; }
  }
  if (!riga) {
    const dflt = await admin.from("platform_pricing")
      .select("cost_real_per_min, cost_billed_per_min").eq("llm_model", LLM_VOCE_DEFAULT).eq("tts_model", TTS_MODEL_VOCE).maybeSingle();
    if (dflt.data) { riga = dflt.data; fonte = "default_voce"; }
  }
  if (!riga) {
    console.error(`[voicePricing] nessuna tariffa per ${llm}+${tts}: ripiego hardcodato — controllare Costi & Margini`);
  }

  const costoReale = Number(riga?.cost_real_per_min ?? RIPIEGO.costoReale);
  let prezzo = Number(riga?.cost_billed_per_min ?? RIPIEGO.prezzo);

  let override: PrezzoMinuto["override"] = null;
  const cfg = await getCompanyBillingConfig(admin, companyId, "ai_agents");
  if (cfg.isFree) { prezzo = 0; override = "gratis"; }
  else if (cfg.pricePerUnitEur != null) { prezzo = Number(cfg.pricePerUnitEur); override = "prezzo_fisso"; }
  else if (cfg.markupMultiplier != null) { prezzo = Number((costoReale * Number(cfg.markupMultiplier)).toFixed(6)); override = "markup"; }

  return { costoRealePerMin: costoReale, prezzoPerMin: prezzo, ttsModel: tts, llmModel: llm, fonte, override };
}
