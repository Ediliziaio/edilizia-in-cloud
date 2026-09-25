export type CampoHoursDraft = number | "";

/** Current DB contract: ordinary hours + extra; presenze replaces author hours
 * for crew costing. Do not reinterpret historical payloads during UI cleanup. */
export function validateRapportinoHours(own: CampoHoursDraft, extra: number, presenze: Record<string, CampoHoursDraft>) {
  if (own === "" && Object.keys(presenze).length === 0) {
    throw new Error("Indica le ore lavorate su questo cantiere. Per sole foto o note, indica 0.");
  }
  const hours = own === "" ? 0 : own;
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(extra) || extra < 0 || hours + extra > 24) {
    throw new Error("Controlla le ore: ordinarie e straordinario insieme devono essere tra 0 e 24.");
  }
  if (own === "" && extra > 0) throw new Error("Indica anche le ore ordinarie prima dello straordinario.");
  for (const value of Object.values(presenze)) {
    if (value === "" || !Number.isFinite(value) || value <= 0 || value > 24) {
      throw new Error("Indica le ore effettive di ogni persona selezionata, oppure rimuovila dalle presenze.");
    }
  }
  return hours;
}
