import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Checks CMS cryptographic integrity AND binds it to the exact original request.
 * AdE remains responsible for qualified status, revocation and fiscal delegation.
 */
export async function verifySignedRequest(base64: string, expected: string): Promise<void> {
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64) || base64.length > 2_800_000) throw new Error("File firmato non valido (massimo 2 MB).");
  const temp = mkdtempSync(join(tmpdir(), "eic-smts-"));
  try {
    writeFileSync(join(temp, "request.p7m"), Buffer.from(base64, "base64"), { mode: 0o600 });
    try {
      await promisify(execFile)("openssl", ["cms", "-verify", "-binary", "-inform", "DER", "-noverify", "-in", join(temp, "request.p7m"), "-out", join(temp, "request.xml")], { timeout: 10_000 });
    } catch { throw new Error("Firma CAdES non verificabile o file non leggibile."); }
    if (!readFileSync(join(temp, "request.xml")).equals(Buffer.from(expected))) throw new Error("Il file firmato non corrisponde alla richiesta originale.");
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
