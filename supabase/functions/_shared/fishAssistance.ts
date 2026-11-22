import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { FishAssistanceCase } from "../../../shared/fish/assistance.ts";
import { verifiedFishCustomer, fishCaseMemoryTool } from "./fishCaseMemory.ts";
import { fishMatchedCustomer } from "./fishCustomerTools.ts";
import { fishActionConsent } from "./fishActionConsent.ts";
import { fishCalendarTool } from "./fishCalendarTools.ts";

export const ASSISTANCE_RUNTIME_TOOLS = [
  "info_cliente",
  "memoria_pratica",
  "crea_ticket",
  "aggiorna_ticket",
  "disponibilita",
  "fissa_appuntamento",
];
type Turns = Parameters<typeof fishActionConsent>[0];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const identityRequired = {
  verificato: false,
  creato: false,
  aggiornato: false,
  risposta:
    "Nome e indirizzo devono essere dichiarati e verificati prima di leggere la pratica o salvarla. Proponi una verifica con l’ufficio se non coincidono.",
};
async function rpc(
  db: SupabaseClient,
  name: string,
  params: Record<string, unknown>,
) {
  const { data, error } = await db.rpc(name, params);
  if (error)
    throw new Error(
      "Il percorso di assistenza non è stato aggiornato. Verificare l’esito prima di ripetere.",
    );
  return data;
}
export async function fishAssistanceTool(
  db: SupabaseClient,
  company: string,
  agent: string,
  session: string,
  phone: string,
  tool: string,
  params: Record<string, string>,
  turns: Turns,
  calendarEffects?: Parameters<typeof fishCalendarTool>[7],
) {
  let current = (await rpc(db, "fish_assistance_start", {
    p_company: company,
    p_agent: agent,
    p_session: session,
  })) as FishAssistanceCase;
  const office = (reason: string) =>
    rpc(db, "fish_assistance_office", {
      p_case: current.id,
      p_company: company,
      p_reason: reason,
    });
  if (tool === "info_cliente") {
    const matched = await fishMatchedCustomer(db, company, phone);
    if (matched.count !== 1 || !matched.customer) {
      await office("identity");
      return { trovato: false, ...identityRequired };
    }
    return {
      trovato: true,
      risposta:
        "Il numero identifica una sola scheda. Fai dichiarare nome completo e indirizzo, poi verifica con memoria_pratica. Non suggerire i dati della scheda.",
    };
  }
  if (["memoria_pratica", "crea_ticket", "aggiorna_ticket"].includes(tool)) {
    const customer = await verifiedFishCustomer(db, company, phone, params);
    if (!customer) {
      await office("identity");
      return identityRequired;
    }
    current = (await rpc(db, "fish_assistance_identity", {
      p_case: current.id,
      p_company: company,
      p_customer: customer.id,
      p_revision: customer.updated_at,
      p_phone: phone,
    })) as FishAssistanceCase;
    if (tool === "memoria_pratica")
      return fishCaseMemoryTool(
        db,
        company,
        agent,
        session,
        phone,
        tool,
        params,
      );
    const consent = fishActionConsent(turns, tool, params);
    if (!consent.ok) return { creato: false, aggiornato: false, ...consent };
    if (
      tool === "aggiorna_ticket" &&
      !/^[a-f0-9-]{36}$/i.test(params.ticket_id || "")
    )
      return {
        aggiornato: false,
        risposta:
          "Scegli con il cliente una segnalazione restituita dalla memoria della pratica.",
      };
    // Urgent situations go to an operator; a routine booking is never emergency dispatch.
    if (/urgent|emergenz|pericolo/i.test(params.urgenza || "")) {
      await office("operator");
      return {
        creato: false,
        risposta:
          "La richiesta richiede una persona. Proponi il passaggio all’operatore senza promettere un intervento d’emergenza.",
      };
    }
    return record(
      await rpc(db, "fish_assistance_ticket", {
        p_case: current.id,
        p_company: company,
        p_phone: phone,
        p_description: params.descrizione,
        p_urgent: false,
        p_existing: tool === "aggiorna_ticket" ? params.ticket_id : null,
      }),
    );
  }
  if (
    !current.identity_verified_at ||
    !current.customer_id ||
    !current.ticket_id
  )
    return {
      creato: false,
      risposta:
        "Prima verifica il cliente e salva la segnalazione dopo il suo consenso. Poi proponi l’appuntamento.",
    };
  const matched = await fishMatchedCustomer(db, company, phone);
  if (
    matched.count !== 1 ||
    matched.customer?.id !== current.customer_id ||
    new Date(matched.customer.updated_at).getTime() !==
      new Date(current.customer_updated_at || "").getTime()
  ) {
    await office("identity");
    return identityRequired;
  }
  if (!current.calendar_id) {
    await office("calendar");
    return {
      creato: false,
      risposta:
        "Il ticket è salvato. Il calendario non è disponibile: concorda una richiesta di richiamo con l’ufficio.",
    };
  }
  if (tool === "fissa_appuntamento") {
    if (!(await verifiedFishCustomer(db, company, phone, params))) {
      await office("identity");
      return identityRequired;
    }
    const consent = fishActionConsent(turns, tool, params);
    if (!consent.ok) return { creato: false, ...consent };
  }
  const result = await fishCalendarTool(
    db,
    company,
    current.calendar_id,
    phone,
    tool,
    params,
    { caseId: current.id, phone },
    calendarEffects,
  );
  if (tool === "fissa_appuntamento" && result.creato !== true)
    await office("booking");
  if (
    tool === "disponibilita" &&
    "slot" in result &&
    Array.isArray(result.slot) &&
    !result.slot.length
  )
    await office("no_slots");
  return result;
}
