/** Reading is independent from bookkeeping. Null preserves the legacy read state. */
export function ricevutaDaLeggere(f: {
  stato?: string | null;
  da_leggere?: boolean | null;
}) {
  return f.da_leggere ?? f.stato === "non_letta";
}
