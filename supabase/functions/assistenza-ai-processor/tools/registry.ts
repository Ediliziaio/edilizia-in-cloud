// MP03 — Tool registry per assistenza (6 tool MVP).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AssistenzaCtx {
  supabase: SupabaseClient;
  company_id: string;
  contact_id: string;
  contact: {
    nome: string | null;
    cognome: string | null;
    stato: string | null;
    tipo: string | null;
  };
  phone: string;
  wa_number_id: string;
  wa_message_id: string | null;
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T; user_message?: string }
  | { ok: false; error: string; user_message: string };

export interface AssistenzaTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (ctx: AssistenzaCtx, args: Record<string, unknown>) => Promise<ToolResult>;
}

// ── apri_ticket ──────────────────────────────────────────────────────────────

const apriTicketDef: Omit<AssistenzaTool, "handler"> = {
  name: "apri_ticket",
  description:
    "Apre un ticket di assistenza per il cliente. Usa quando il cliente segnala un problema o fa una richiesta non risolvibile subito.",
  parameters: {
    type: "object",
    properties: {
      titolo: { type: "string", description: "Max 80 caratteri" },
      descrizione: { type: "string" },
      urgenza: { type: "string", enum: ["alta", "media", "bassa"] },
      categoria: {
        type: "string",
        enum: ["problema_tecnico", "richiesta_info", "lamentela", "modifica_ordine", "sollecito_pagamento", "altro"],
      },
    },
    required: ["titolo", "descrizione"],
    additionalProperties: false,
  },
};

async function apriTicket(
  ctx: AssistenzaCtx,
  args: { titolo?: string; descrizione?: string; urgenza?: string; categoria?: string },
): Promise<ToolResult> {
  if (!args.titolo || !args.descrizione) {
    return { ok: false, error: "missing_fields", user_message: "Servono titolo e descrizione." };
  }

  // Dedup fuzzy 30min
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: recent } = await ctx.supabase
    .from("support_tickets")
    .select("id, titolo, numero_progressivo")
    .eq("company_id", ctx.company_id)
    .eq("contact_id", ctx.contact_id)
    .gte("created_at", since);

  const titolo = args.titolo.substring(0, 80);
  const sim = (a: string, b: string): number => {
    const wa = new Set(a.toLowerCase().split(/\s+/));
    const wb = new Set(b.toLowerCase().split(/\s+/));
    const inter = [...wa].filter((w) => wb.has(w)).length;
    return inter / Math.max(wa.size, wb.size);
  };

  const dup = (recent ?? []).find((r) => sim(r.titolo ?? "", titolo) > 0.7);
  if (dup) {
    return {
      ok: true,
      data: { ticket_id: dup.id, duplicate: true },
      user_message: "Ha già aperto un ticket simile poco fa. Il nostro team sta già lavorando.",
    };
  }

  // Numero progressivo per company
  const { data: lastT } = await ctx.supabase
    .from("support_tickets")
    .select("numero_progressivo")
    .eq("company_id", ctx.company_id)
    .order("numero_progressivo", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const next = (lastT?.numero_progressivo ?? 0) + 1;

  const { data: ticket, error } = await ctx.supabase
    .from("support_tickets")
    .insert({
      company_id: ctx.company_id,
      contact_id: ctx.contact_id,
      numero_progressivo: next,
      titolo,
      descrizione: args.descrizione,
      urgenza: args.urgenza ?? "media",
      categoria: args.categoria ?? "altro",
      stato: "aperto",
      source: "whatsapp",
      channel_msg_id: ctx.wa_message_id,
    })
    .select("id, numero_progressivo")
    .single();

  if (error) return { ok: false, error: error.message, user_message: "Non sono riuscito ad aprire il ticket." };

  return {
    ok: true,
    data: { ticket_id: ticket.id, numero: next },
    user_message: `✅ Ticket #${next} aperto. ${
      args.urgenza === "alta"
        ? "Il titolare è stato avvisato, la contatterà a breve."
        : "La ricontattiamo appena possibile."
    }`,
  };
}

// ── stato_mio_ordine ─────────────────────────────────────────────────────────

const statoOrdineDef: Omit<AssistenzaTool, "handler"> = {
  name: "stato_mio_ordine",
  description: "Cerca l'ordine/cantiere del cliente e ritorna lo stato attuale.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

async function statoMioOrdine(ctx: AssistenzaCtx): Promise<ToolResult> {
  // Match orders per client_phone o client_email del contatto
  const { data: orders } = await ctx.supabase
    .from("orders")
    .select("id, description, status, percentuale_avanzamento, work_start_date, work_end_date")
    .eq("company_id", ctx.company_id)
    .or(`client_phone.eq.${ctx.phone},client_phone.eq.+${ctx.phone}`)
    .order("created_at", { ascending: false })
    .limit(3);

  if (!orders || orders.length === 0) {
    return {
      ok: true,
      data: { orders: [] },
      user_message:
        "Non trovo un ordine associato al suo numero. Se pensa sia un errore ci segnali il suo numero ordine.",
    };
  }

  const lines = orders.map((o) => {
    const sal = o.percentuale_avanzamento ?? 0;
    return `• ${o.description || "Ordine"} — SAL ${sal}%, stato: ${o.status ?? "n/d"}`;
  }).join("\n");

  return {
    ok: true,
    data: { orders },
    user_message: `Ecco lo stato del suo lavoro:\n${lines}`,
  };
}

// ── miei_pagamenti ───────────────────────────────────────────────────────────

const mieiPagamentiDef: Omit<AssistenzaTool, "handler"> = {
  name: "miei_pagamenti",
  description: "Elenca le fatture emesse al cliente (scadenze, pagato/non pagato).",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

async function mieiPagamenti(ctx: AssistenzaCtx): Promise<ToolResult> {
  const { data: fatture } = await ctx.supabase
    .from("invoices")
    .select("invoice_number, due_date, total_amount, paid_amount, payment_status")
    .eq("company_id", ctx.company_id)
    .or(`client_email.eq.${ctx.contact.nome ?? ""},client_company_name.ilike.%${ctx.contact.cognome ?? ""}%`)
    .order("issue_date", { ascending: false })
    .limit(5);

  if (!fatture || fatture.length === 0) {
    return { ok: true, data: { fatture: [] }, user_message: "Non ho fatture collegate al suo profilo al momento." };
  }

  const fmt = (n: number) => "€ " + n.toLocaleString("it-IT");
  const lines = fatture.map((f) => {
    const paid = Number(f.paid_amount ?? 0);
    const total = Number(f.total_amount ?? 0);
    const residuo = total - paid;
    const icon = residuo === 0 ? "✅" : "⏳";
    return `${icon} N.${f.invoice_number} — ${fmt(total)} (scade ${f.due_date ?? "n/d"})`;
  }).join("\n");

  return { ok: true, data: { fatture }, user_message: `Le sue fatture:\n${lines}` };
}

// ── richiedi_callback ────────────────────────────────────────────────────────

const richiediCallbackDef: Omit<AssistenzaTool, "handler"> = {
  name: "richiedi_callback",
  description: "Crea un task 'richiama cliente' per il titolare.",
  parameters: {
    type: "object",
    properties: {
      motivo: { type: "string" },
      preferenza_oraria: { type: "string" },
    },
    required: ["motivo"],
    additionalProperties: false,
  },
};

async function richiediCallback(
  ctx: AssistenzaCtx,
  args: { motivo?: string; preferenza_oraria?: string },
): Promise<ToolResult> {
  const { data: ticket, error } = await ctx.supabase
    .from("support_tickets")
    .insert({
      company_id: ctx.company_id,
      contact_id: ctx.contact_id,
      titolo: "Richiesta callback",
      descrizione: `${args.motivo ?? "Cliente richiede di essere richiamato"}${args.preferenza_oraria ? " — Preferenza: " + args.preferenza_oraria : ""}`,
      urgenza: "media",
      categoria: "richiesta_info",
      source: "whatsapp",
    })
    .select("id, numero_progressivo")
    .single();

  if (error) return { ok: false, error: error.message, user_message: "Non sono riuscito a registrare la richiesta." };

  return {
    ok: true,
    data: { ticket_id: ticket.id },
    user_message: "✅ Richiamata registrata. La contatteremo appena possibile.",
  };
}

// ── segnala_urgente ──────────────────────────────────────────────────────────

const segnalaUrgenteDef: Omit<AssistenzaTool, "handler"> = {
  name: "segnala_urgente",
  description:
    "Escalation al titolare di una situazione urgente (pericolo, danno, emergenza).",
  parameters: {
    type: "object",
    properties: {
      descrizione: { type: "string" },
    },
    required: ["descrizione"],
    additionalProperties: false,
  },
};

async function segnalaUrgente(
  ctx: AssistenzaCtx,
  args: { descrizione?: string },
): Promise<ToolResult> {
  if (!args.descrizione) {
    return { ok: false, error: "no_desc", user_message: "Mi descriva meglio cosa sta succedendo." };
  }
  const { data: ticket, error } = await ctx.supabase
    .from("support_tickets")
    .insert({
      company_id: ctx.company_id,
      contact_id: ctx.contact_id,
      titolo: "URGENTE: " + args.descrizione.substring(0, 60),
      descrizione: args.descrizione,
      urgenza: "alta",
      categoria: "problema_tecnico",
      source: "whatsapp",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message, user_message: "Non sono riuscito a segnalare. Chiami direttamente." };

  return {
    ok: true,
    data: { ticket_id: ticket.id },
    user_message: "🔴 Segnalazione urgente registrata, il titolare è stato avvisato.",
  };
}

// ── lista_documenti ──────────────────────────────────────────────────────────

const listaDocumentiDef: Omit<AssistenzaTool, "handler"> = {
  name: "lista_documenti",
  description: "Elenca documenti associati al cliente (fatture, preventivi).",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

async function listaDocumenti(ctx: AssistenzaCtx): Promise<ToolResult> {
  const results: Array<{ tipo: string; numero: string | null; data: string | null }> = [];

  const { data: fatture } = await ctx.supabase
    .from("invoices")
    .select("invoice_number, issue_date")
    .eq("company_id", ctx.company_id)
    .eq("client_company_name", ctx.contact.cognome ?? "_none_")
    .limit(10);

  for (const f of fatture ?? []) {
    results.push({ tipo: "Fattura", numero: f.invoice_number ?? null, data: f.issue_date ?? null });
  }

  const { data: quotes } = await ctx.supabase
    .from("quotes")
    .select("quote_number, issue_date")
    .eq("company_id", ctx.company_id)
    .limit(5);

  for (const q of quotes ?? []) {
    results.push({ tipo: "Preventivo", numero: q.quote_number ?? null, data: q.issue_date ?? null });
  }

  if (results.length === 0) {
    return { ok: true, data: { documents: [] }, user_message: "Non ho documenti associati al suo profilo." };
  }

  const lines = results.map((r) => `• ${r.tipo} n.${r.numero ?? "—"} del ${r.data ?? "n/d"}`).join("\n");
  return { ok: true, data: { documents: results }, user_message: `Documenti disponibili:\n${lines}` };
}

export const TOOLS_ASSISTENZA: AssistenzaTool[] = [
  { ...apriTicketDef, handler: apriTicket as AssistenzaTool["handler"] },
  { ...statoOrdineDef, handler: statoMioOrdine as AssistenzaTool["handler"] },
  { ...mieiPagamentiDef, handler: mieiPagamenti as AssistenzaTool["handler"] },
  { ...richiediCallbackDef, handler: richiediCallback as AssistenzaTool["handler"] },
  { ...segnalaUrgenteDef, handler: segnalaUrgente as AssistenzaTool["handler"] },
  { ...listaDocumentiDef, handler: listaDocumenti as AssistenzaTool["handler"] },
];

export function toOpenAISpec(tools: AssistenzaTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function findTool(name: string): AssistenzaTool | undefined {
  return TOOLS_ASSISTENZA.find((t) => t.name === name);
}
