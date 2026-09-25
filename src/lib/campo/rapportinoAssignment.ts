import { loadCampoAssignments } from "./assignments";

/** Client preflight only: actual read/write authorization remains enforced by RLS. */
export async function hasRapportinoAssignment(orderId: string, userId: string, companyId: string): Promise<boolean> {
  const assignments = await loadCampoAssignments(userId, companyId, { orderId, includeClosed: true });
  return assignments.some(a => a.order_id === orderId);
}
