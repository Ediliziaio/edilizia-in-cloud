/** Capture our write's version BEFORE attachment/network work can fail. */
export async function quoteWriteVersion(
  result: unknown,
  readLegacyVersion: () => Promise<string | null>,
): Promise<string> {
  const version = result && typeof result === "object" && "updated_at" in result
    ? result.updated_at : null;
  // Older installations return only {ok, inserted, map}. Read immediately after
  // the successful write, never in a catch/retry (which could accept a colleague's edit).
  const savedVersion = typeof version === "string" && version ? version : await readLegacyVersion();
  if (!savedVersion) throw new Error("Impossibile verificare la versione salvata. Ricarica il preventivo prima di modificarlo ancora.");
  return savedVersion;
}
