import { decryptMaybeEncrypted, encrypt, getEncryptionKey } from "./encryption.ts";
import { ItalaClient } from "./italaClient.ts";

export const ITALA_PLATFORM_REFERENCE = "platform:itala";
export function italaPlatformReady(): boolean {
  return !!Deno.env.get("ITALA_CLIENT_ID") && !!Deno.env.get("ITALA_CLIENT_SECRET");
}
export function platformItalaClient(): ItalaClient {
  if (!italaPlatformReady()) throw new Error("Il collegamento centrale ITALA non è ancora configurato. Contatta l'assistenza.");
  return new ItalaClient(JSON.stringify({ client_id: Deno.env.get("ITALA_CLIENT_ID"), client_secret: Deno.env.get("ITALA_CLIENT_SECRET"), environment: Deno.env.get("ITALA_ENVIRONMENT") === "test" ? "test" : "prod" }));
}

/** Only the server can decrypt stored API credentials; legacy Bearers still work. */
export async function italaClientFromStored(stored: string): Promise<ItalaClient> {
  if (stored === ITALA_PLATFORM_REFERENCE) return platformItalaClient();
  return new ItalaClient(stored.startsWith("aes:") ? await decryptMaybeEncrypted(stored, getEncryptionKey()) : stored);
}
export async function sealItalaCredentials(credentials: string): Promise<string> {
  return encrypt(credentials, getEncryptionKey());
}
