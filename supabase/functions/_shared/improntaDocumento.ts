/** SHA-256 of the original bytes, shared by POS emissions and signature requests. */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
