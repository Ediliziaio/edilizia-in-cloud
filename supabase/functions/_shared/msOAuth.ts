// Credenziali dell'app Microsoft (Azure AD) — UN solo punto di risoluzione.
//
// Email e calendario Outlook usano la STESSA app Azure, ma finora la cercavano
// con nomi diversi (MS_OAUTH_* da una parte, outlook_client_* / OUTLOOK_*
// dall'altra). Due configurazioni per la stessa cosa: prima o poi se ne
// compila una sola e meta' integrazione resta muta. Qui si accettano tutte le
// forme gia' in uso, cosi' una configurazione qualunque accende entrambe.
//
// Ordine: secret store (MS_OAUTH_*, poi OUTLOOK_*) → platform_settings
// (outlook_client_id / outlook_client_secret).

import { getPlatformSetting } from "./getPlatformSetting.ts";

export interface MsOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export async function getMsOAuthCredentials(): Promise<MsOAuthCredentials> {
  const idEnv = Deno.env.get("MS_OAUTH_CLIENT_ID") || "";
  const secretEnv = Deno.env.get("MS_OAUTH_CLIENT_SECRET") || "";
  if (idEnv && secretEnv) return { clientId: idEnv, clientSecret: secretEnv };

  // getPlatformSetting copre sia la env OUTLOOK_* sia la riga in platform_settings.
  const [clientId, clientSecret] = await Promise.all([
    idEnv || getPlatformSetting("outlook_client_id", "OUTLOOK_CLIENT_ID"),
    secretEnv || getPlatformSetting("outlook_client_secret", "OUTLOOK_CLIENT_SECRET"),
  ]);
  return { clientId: clientId || "", clientSecret: clientSecret || "" };
}

/** Nomi accettati, per i messaggi di diagnostica. */
export const MS_OAUTH_NOMI_ACCETTATI =
  "MS_OAUTH_CLIENT_ID/SECRET, OUTLOOK_CLIENT_ID/SECRET (secret store) oppure outlook_client_id/secret (platform_settings)";
