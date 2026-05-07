// MP03 — Tool registry per lead (4 tool).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface LeadCtx {
  supabase: SupabaseClient;
  company_id: string;
  contact_id: string;
  telefono: string;
  wa_number_id: string;
  qualificazione: Record<string, unknown>;
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T; user_message?: string }
  | { ok: false; error: string; user_message: string };

export interface LeadTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (ctx: LeadCtx, args: Record<string, unknown>) => Promise<ToolResult>;
}

// ── salva_dato_qualificazione ────────────────────────────────────────────────

const salvaDatoDef: Omit<LeadTool, "handler"> = {
  name: "salva_dato_qualificazione",
  description:
    "Salva UN campo di qualificazione (nome, cognome, servizio, budget, tempistica, zona) in marketing_contacts.qualificazione_json.",
  parameters: {
    type: "object",
    properties: {
      campo: {
        type: "string",
        enum: [
          "nome",
          "cognome",
          "servizio",
          "budget",
          "tempistica",
          "zona",
          "email",
        ],
      },
      valore: { type: "string" },
    },
    required: ["campo", "valore"],
    additionalProperties: false,
  },
};

async function salvaDato(
  ctx: LeadCtx,
  args: { campo?: string; valore?: string },
): Promise<ToolResult> {
  if (!args.campo || !args.valore) {
    return { ok: false, error: "missing", user_message: "Dato mancante." };
  }

  const patch: Record<string, unknown> = {
    ...ctx.qualificazione,
    [args.campo]: args.valore,
  };

  const updatePayload: Record<string, unknown> = { qualificazione_json: patch };
  if (args.campo === "nome") updatePayload.nome = args.valore;
  if (args.campo === "cognome") updatePayload.cognome = args.valore;

  const { error } = await ctx.supabase
    .from("marketing_contacts")
    .update(updatePayload)
    .eq("id", ctx.contact_id);

  if (error) {
    return {
      ok: false,
      error: error.message,
      user_message: "Errore salvando.",
    };
  }

  ctx.qualificazione = patch;
  return {
    ok: true,
    data: { campo: args.campo, valore: args.valore },
    user_message: undefined,
  };
}

// ── verifica_qualificazione_completa ─────────────────────────────────────────

const verificaDef: Omit<LeadTool, "handler"> = {
  name: "verifica_qualificazione_completa",
  description:
    "Verifica se il lead ha fornito tutti i 5 campi (nome, servizio, budget, tempistica, zona). Se sì, marca status=lead_qualificato e calcola score.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

async function verifica(ctx: LeadCtx): Promise<ToolResult> {
  const q = ctx.qualificazione;
  const required = ["nome", "servizio", "budget", "tempistica", "zona"];
  const presenti = required.filter((k) =>
    typeof q[k] === "string" && (q[k] as string).length > 0
  );
  const completezza = (presenti.length / required.length) * 100;

  if (completezza < 100) {
    return {
      ok: true,
      data: {
        completa: false,
        mancanti: required.filter((k) => !presenti.includes(k)),
      },
      user_message: undefined,
    };
  }

  // Score: 100% completezza + bonus budget >10k, urgenza alta = tempistica <3 mesi
  let score = 60;
  const budget = String(q.budget ?? "").toLowerCase();
  if (
    /1[0-9]k|20k|30k|40k|50k|60k|70k|80k|90k|100k|10000|20000|30000|50000/.test(
      budget,
    )
  ) {
    score += 15;
  }
  const temp = String(q.tempistica ?? "").toLowerCase();
  if (/subito|urgente|mese|30 giorni|2 mesi/.test(temp)) score += 15;

  await ctx.supabase
    .from("marketing_contacts")
    .update({
      stato: "lead_qualificato",
      qualificazione_json: { ...q, score },
    })
    .eq("id", ctx.contact_id);

  return {
    ok: true,
    data: { completa: true, score },
    user_message: undefined,
  };
}

// ── handoff_commerciale ──────────────────────────────────────────────────────

const handoffDef: Omit<LeadTool, "handler"> = {
  name: "handoff_commerciale",
  description:
    "Passa il lead qualificato al commerciale: crea ticket con tutti i dati raccolti. Usa dopo verifica_qualificazione_completa positiva.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

async function handoff(ctx: LeadCtx): Promise<ToolResult> {
  const q = ctx.qualificazione;
  const leadScore = Number(q.score ?? 0);
  const descrizione = [
    `Nuovo lead qualificato da WhatsApp.`,
    `Nome: ${q.nome ?? "—"} ${q.cognome ?? ""}`,
    `Servizio: ${q.servizio ?? "—"}`,
    `Budget: ${q.budget ?? "—"}`,
    `Tempistica: ${q.tempistica ?? "—"}`,
    `Zona: ${q.zona ?? "—"}`,
    `Telefono: ${ctx.telefono}`,
    `Score: ${Number.isFinite(leadScore) ? leadScore : "—"}`,
  ].join("\n");

  const { data: t, error } = await ctx.supabase
    .from("support_tickets")
    .insert({
      company_id: ctx.company_id,
      contact_id: ctx.contact_id,
      titolo: `Lead qualificato: ${q.servizio ?? "generico"}`,
      descrizione,
      urgenza: leadScore >= 75 ? "alta" : "media",
      categoria: "richiesta_info",
      source: "whatsapp_lead",
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message,
      user_message: "Errore nel passaggio al commerciale.",
    };
  }

  await ctx.supabase
    .from("marketing_contacts")
    .update({ stato: "lead_handoff_fatto" })
    .eq("id", ctx.contact_id);

  return {
    ok: true,
    data: { ticket_id: t.id },
    user_message:
      "Perfetto, il titolare la richiamerà entro 24h per organizzare un sopralluogo. A presto!",
  };
}

// ── proponi_appuntamento ─────────────────────────────────────────────────────

const proponiAppuntamentoDef: Omit<LeadTool, "handler"> = {
  name: "proponi_appuntamento",
  description:
    "Propone al lead un sopralluogo. Crea ticket 'Richiesta sopralluogo' con le info fornite.",
  parameters: {
    type: "object",
    properties: {
      data_proposta: {
        type: "string",
        description: "Data YYYY-MM-DD o 'settimana prossima'",
      },
      ora_proposta: {
        type: "string",
        description: "HH:MM o 'mattina/pomeriggio'",
      },
    },
    additionalProperties: false,
  },
};

async function proponiAppuntamento(
  ctx: LeadCtx,
  args: { data_proposta?: string; ora_proposta?: string },
): Promise<ToolResult> {
  const q = ctx.qualificazione;
  const descrizione = [
    `Lead richiede sopralluogo.`,
    `Data proposta: ${args.data_proposta ?? "da concordare"}`,
    `Ora: ${args.ora_proposta ?? "da concordare"}`,
    `Servizio: ${q.servizio ?? "—"}`,
    `Zona: ${q.zona ?? "—"}`,
    `Telefono: ${ctx.telefono}`,
  ].join("\n");

  const { data: t, error } = await ctx.supabase
    .from("support_tickets")
    .insert({
      company_id: ctx.company_id,
      contact_id: ctx.contact_id,
      titolo: "Richiesta sopralluogo",
      descrizione,
      urgenza: "media",
      categoria: "richiesta_info",
      source: "whatsapp_lead",
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message, user_message: "Errore." };
  }

  return {
    ok: true,
    data: { ticket_id: t.id },
    user_message:
      "Ok, abbiamo segnato. Il titolare le conferma a breve il sopralluogo.",
  };
}

export const TOOLS_LEAD: LeadTool[] = [
  { ...salvaDatoDef, handler: salvaDato as LeadTool["handler"] },
  { ...verificaDef, handler: verifica as LeadTool["handler"] },
  { ...handoffDef, handler: handoff as LeadTool["handler"] },
  {
    ...proponiAppuntamentoDef,
    handler: proponiAppuntamento as LeadTool["handler"],
  },
];

export function toOpenAISpec(tools: LeadTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function findTool(name: string): LeadTool | undefined {
  return TOOLS_LEAD.find((t) => t.name === name);
}
