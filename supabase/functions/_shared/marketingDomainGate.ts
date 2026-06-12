// Gate anti-spam "dominio proprio obbligatorio" per l'email marketing.
//
// Policy piattaforma: un'azienda può inviare campagne marketing SOLO se ha
// almeno un dominio email proprio verificato (Elastic Email SPF+DKIM) e
// attivo. Ogni tenant invia così con la reputazione del SUO dominio — uno
// spammer brucia il proprio dominio, non quello condiviso della piattaforma.
//
// Off-switch d'emergenza: platform_settings.email_marketing_require_custom_domain
// = 'false' disattiva il gate (default: attivo).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "./getPlatformSetting.ts";

export const MARKETING_DOMAIN_REQUIRED_MESSAGE =
  "Per inviare campagne di email marketing devi prima collegare e verificare " +
  "il dominio email della tua azienda: Impostazioni → Dominio Email.";

export interface MarketingDomainGateResult {
  allowed: boolean;
  reason: string | null;
}

export async function checkMarketingDomainGate(
  admin: SupabaseClient,
  companyId: string,
): Promise<MarketingDomainGateResult> {
  const setting = await getPlatformSetting("email_marketing_require_custom_domain");
  if (setting === "false") return { allowed: true, reason: null };

  // Stessa condizione "marketingOK" di resolveSender: EE SPF+DKIM + attivo.
  const { data, error } = await admin
    .from("company_email_domains")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .eq("ee_spf_verified", true)
    .eq("ee_dkim_verified", true)
    .limit(1);

  if (error) {
    // Fail-closed: è un gate anti-abuso, in dubbio si blocca con messaggio chiaro.
    return {
      allowed: false,
      reason: `Controllo del dominio email non riuscito: ${error.message}. Riprova tra qualche istante.`,
    };
  }
  if ((data ?? []).length > 0) return { allowed: true, reason: null };
  return { allowed: false, reason: MARKETING_DOMAIN_REQUIRED_MESSAGE };
}
