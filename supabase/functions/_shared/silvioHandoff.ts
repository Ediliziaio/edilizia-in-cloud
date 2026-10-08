/** Unknown acknowledgements must not cause the caller to run a second agent. */
export function orchestratorCounts(value: unknown): { ok: boolean; inviati: number; inCoda: number } {
  if (!value || typeof value !== "object") throw new Error("silvio_handoff_not_confirmed");
  const result = value as Record<string, unknown>;
  if (result.ok === false && typeof result.motivo === "string") return { ok: false, inviati: 0, inCoda: 0 };
  if (result.ok !== true || ![result.inviati, result.in_coda].every(n => typeof n === "number" && Number.isInteger(n) && n >= 0)
    || (result.errori !== undefined && result.errori !== 0)) throw new Error("silvio_handoff_not_confirmed");
  return { ok: true, inviati: result.inviati as number, inCoda: result.in_coda as number };
}

export function handoffAccepted(value: unknown): boolean {
  if (!value || typeof value !== "object") throw new Error("silvio_handoff_not_confirmed");
  const result = value as Record<string, unknown>;
  if (result.ok !== true) throw new Error("silvio_handoff_not_confirmed");
  if (["verifica_identita", "riformula", "ignora"].includes(String(result.azione))) return false;
  if (!["in_coda", "fatto"].includes(String(result.azione))) throw new Error("silvio_handoff_not_confirmed");
  const counts = orchestratorCounts({ ...(result.dettaglio as object), ok: true });
  return counts.inviati + counts.inCoda > 0;
}
