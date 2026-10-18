import type { CampoResolvedAssignment } from "@/lib/campo/assignments";

/** Stati in cui la commessa non è più un cantiere aperto (i valori reali in orders.status). */
const STATI_CHIUSI = new Set(["completato", "chiuso", "annullato", "completed", "cancelled"]);

/** true se la commessa è completata, chiusa o annullata: nell'app cantiere non compare più. */
export function commessaChiusa(stato: string | null | undefined): boolean {
  return STATI_CHIUSI.has(String(stato ?? "").trim().toLowerCase());
}

/** I cantieri su cui si può ancora fare un rapportino: né chiusi né annullati, ognuno una volta sola. */
export function cantieriAperti(assegnazioni: CampoResolvedAssignment[]): CampoResolvedAssignment[] {
  const visti = new Set<string>();
  return assegnazioni.filter(a => {
    if (!a.order_id || commessaChiusa(a.order?.status) || visti.has(a.order_id)) return false;
    visti.add(a.order_id);
    return true;
  });
}
