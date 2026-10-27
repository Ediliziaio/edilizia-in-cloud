import { decryptMaybeEncrypted, encrypt, getEncryptionKey } from "./encryption.ts";
import { ItalaClient } from "./italaClient.ts";

/** Only the server can decrypt stored API credentials; legacy Bearers still work. */
export async function italaClientFromStored(stored: string): Promise<ItalaClient> {
  return new ItalaClient(stored.startsWith("aes:") ? await decryptMaybeEncrypted(stored, getEncryptionKey()) : stored);
}
export async function sealItalaCredentials(credentials: string): Promise<string> {
  return encrypt(credentials, getEncryptionKey());
}
