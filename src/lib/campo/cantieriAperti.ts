import type { CampoResolvedAssignment } from "@/lib/campo/assignments";

/** I cantieri su cui si può ancora fare un rapportino: né chiusi né annullati, ognuno una volta sola. */
export function cantieriAperti(assegnazioni: CampoResolvedAssignment[]): CampoResolvedAssignment[] {
  const visti = new Set<string>();
  return assegnazioni.filter(a => {
    const stato = String(a.order?.status ?? "").toLowerCase();
    if (!a.order_id || stato === "annullato" || stato === "chiuso" || visti.has(a.order_id)) return false;
    visti.add(a.order_id);
    return true;
  });
}
