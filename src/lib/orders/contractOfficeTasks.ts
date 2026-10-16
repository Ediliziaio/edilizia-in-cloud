import { supabase } from "@/integrations/supabase/client";
import type { OfficeStep } from "./contractPreparation";

export const CONTRACT_OFFICE_PREFIX = "Ufficio contratto · ";
/** Id stabili per ordine e adempimento: riprendere il completamento non duplica attività o azzera quelle concluse. */
export async function contractOfficeTaskId(orderId: string, nome: string): Promise<string> {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`contract-office-v1:${orderId}:${nome}`))).slice(0,16);
  b[6] = (b[6] & 15) | 128; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, x => x.toString(16).padStart(2,"0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export async function saveContractOfficeTasks(companyId: string, orderId: string, userId: string, steps: OfficeStep[]): Promise<void> {
  if (!steps.length) return;
  const rows = await Promise.all(steps.map(async s => ({
    id: await contractOfficeTaskId(orderId, s.nome), company_id: companyId, order_id: orderId,
    title: CONTRACT_OFFICE_PREFIX+s.nome, notes: `Adempimento di ufficio proposto dal contratto, da verificare e assegnare. Non concorre all’avanzamento delle lavorazioni.\n${s.controlli.map(c => `- ${c}`).join("\n")}`,
    status: "da_fare", priority: "normale", category: "ordini", created_by: userId,
    assigned_to: null as string | null, due_date: null as string | null,
  })));
  const ids = rows.map(r => r.id);
  const { data, error } = await supabase.from("tasks").select("id").eq("company_id",companyId).eq("order_id",orderId).in("id",ids);
  if (error) throw error;
  const existing = new Set((data ?? []).map(r => r.id));
  const missing = rows.filter(r => !existing.has(r.id));
  if (!missing.length) return;
  const inserted = await supabase.from("tasks").insert(missing);
  if (!inserted.error) return;
  if (inserted.error.code === "23505") {
    const check = await supabase.from("tasks").select("id").eq("company_id",companyId).eq("order_id",orderId).in("id",ids);
    if (!check.error && check.data?.length === ids.length) return;
  }
  throw inserted.error;
}
