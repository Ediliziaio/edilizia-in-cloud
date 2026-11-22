import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fishAssistanceTool } from "../../../supabase/functions/_shared/fishAssistance";
import { fishCalendarTool } from "../../../supabase/functions/_shared/fishCalendarTools";
import {
  FISH_ASSISTANCE_POLICY,
  FISH_ASSISTANCE_TOOLS,
} from "../../../shared/fish/assistance";
import { fishAgentConfig } from "../../../supabase/functions/_shared/fishAgentConfig";
import { fishOnboardingInput } from "@/lib/fishOnboarding";
vi.mock("../../../supabase/functions/_shared/fishCalendarTools", () => ({
  fishCalendarTool: vi.fn(),
}));
const customer = {
  id: "customer-a",
  first_name: "Cliente",
  last_name: "Esempio",
  address: "Via Esempio 7",
  updated_at: "2026-11-17T10:00:00Z",
};
const identity = {
  nome: "Cliente Esempio",
  indirizzo: "Via Esempio 7",
  descrizione: "La finestra non si chiude bene",
  urgenza: "normale",
};
function database(
  options: {
    ticket?: boolean;
    verified?: boolean;
    matchCount?: number;
    stale?: boolean;
  } = {},
) {
  const current = {
    id: "case-a",
    company_id: "company-a",
    agent_id: "agent-a",
    session_id: "phone-a",
    calendar_id: "calendar-a",
    customer_id: options.verified ? customer.id : null,
    identity_verified_at: options.verified ? "2026-11-17T10:00:00Z" : null,
    customer_updated_at: options.stale
      ? "2026-11-16T10:00:00Z"
      : customer.updated_at,
    ticket_id: options.ticket ? "ticket-a" : null,
  };
  const call = vi.fn(async (name: string, params: Record<string, unknown>) => {
    if (name === "fish_assistance_start") return { data: current, error: null };
    if (name === "fish_match_customer")
      return {
        data: {
          count: options.matchCount ?? 1,
          customer: options.matchCount === 2 ? null : customer,
        },
        error: null,
      };
    if (name === "fish_assistance_identity")
      return {
        data: {
          ...current,
          customer_id: params.p_customer,
          identity_verified_at: "2026-11-17T10:00:00Z",
        },
        error: null,
      };
    if (name === "fish_assistance_ticket")
      return {
        data: {
          creato: true,
          ticket_id: "ticket-a",
          customer_id: customer.id,
          conversation_linked: true,
        },
        error: null,
      };
    return { data: { tickets: [], verificato: true }, error: null };
  });
  return { db: { rpc: call } as unknown as SupabaseClient, call };
}
const turns = (question: string, answer: string) => [
  { type: "message", role: "assistant", content: question },
  { type: "message", role: "user", content: answer },
];
beforeEach(() => vi.mocked(fishCalendarTool).mockReset());
describe("complete support journey boundary", () => {
  it("requires a selected calendar and enables the complete CRM tool set", () => {
    const values = {
      name: "Assistenza",
      flowId: "support_appointment",
      calendarId: "calendar-a",
      operatorNumber: "",
      greeting: "Buongiorno",
      expressive: true,
    };
    expect(() => fishOnboardingInput({ ...values, calendarId: "" })).toThrow(
      "calendario",
    );
    const input = fishOnboardingInput(values);
    const config = input.tools_config as {
      edilizia_tools: Record<string, { enabled: boolean }>;
    };
    expect(
      FISH_ASSISTANCE_TOOLS.every(
        (tool) => config.edilizia_tools[tool].enabled,
      ),
    ).toBe(true);
    expect(input.system_prompt).toContain(FISH_ASSISTANCE_POLICY);
    expect(
      fishAgentConfig(
        { ...input, system_prompt: "Personalizzazione aziendale." },
        { voice_id: "voice" },
        "https://example.com/functions/v1",
        "secret",
        [],
      ).prompt.system_prompt,
    ).toContain(FISH_ASSISTANCE_POLICY);
  });
  it.each(["Altro Cliente", ""])(
    "does not create or consult a ticket for a mismatching declared name: %s",
    async (nome) => {
      const { db, call } = database();
      expect(
        await fishAssistanceTool(
          db,
          "company-a",
          "agent-a",
          "phone-a",
          "+390302345678",
          "crea_ticket",
          { ...identity, nome },
          turns("Apro la segnalazione?", "Sì"),
        ),
      ).toMatchObject({ creato: false });
      expect(
        call.mock.calls.some((c) => c[0] === "fish_assistance_ticket"),
      ).toBe(false);
      expect(call).toHaveBeenCalledWith(
        "fish_assistance_office",
        expect.objectContaining({ p_reason: "identity" }),
      );
    },
  );
  it("does not disclose customer details when the number is ambiguous", async () => {
    const { db } = database({ matchCount: 2 });
    const result = await fishAssistanceTool(
      db,
      "company-a",
      "agent-a",
      "phone-a",
      "+390302345678",
      "info_cliente",
      {},
      [],
    );
    expect(result).toMatchObject({ trovato: false, verificato: false });
    expect(JSON.stringify(result)).not.toContain(customer.address);
  });
  it("requires a separate ticket consent from the actual conversation, then uses only the verified customer", async () => {
    const { db, call } = database();
    const run = (messages: ReturnType<typeof turns>) =>
      fishAssistanceTool(
        db,
        "company-a",
        "agent-a",
        "phone-a",
        "+390302345678",
        "crea_ticket",
        {
          ...identity,
          company_id: "foreign",
          customer_id: "foreign",
          confermato: "si",
        },
        messages,
      );
    expect(
      await run(turns("È un momento adatto?", "Sì, posso parlare")),
    ).toMatchObject({ creato: false });
    expect(
      await run(
        turns(
          "Apro la segnalazione con questi dati, va bene?",
          "Sì, ma l’indirizzo è diverso",
        ),
      ),
    ).toMatchObject({ creato: false });
    expect(
      await run(
        turns(
          "Apro la segnalazione con questi dati, va bene?",
          "Sì, non apra il ticket",
        ),
      ),
    ).toMatchObject({ creato: false });
    expect(call.mock.calls.some((c) => c[0] === "fish_assistance_ticket")).toBe(
      false,
    );
    expect(
      await run(
        turns("Apro la segnalazione con questi dati, va bene?", "Sì, confermo"),
      ),
    ).toMatchObject({ creato: true, ticket_id: "ticket-a" });
    expect(call).toHaveBeenCalledWith(
      "fish_assistance_identity",
      expect.objectContaining({
        p_customer: "customer-a",
        p_company: "company-a",
      }),
    );
    expect(call).toHaveBeenCalledWith(
      "fish_assistance_ticket",
      expect.objectContaining({
        p_case: "case-a",
        p_company: "company-a",
        p_phone: "+390302345678",
        p_existing: null,
      }),
    );
  });
  it("cannot book before a saved ticket or reuse the ticket consent for booking", async () => {
    const first = database({ verified: true });
    expect(
      await fishAssistanceTool(
        first.db,
        "company-a",
        "agent-a",
        "phone-a",
        "+390302345678",
        "fissa_appuntamento",
        identity,
        turns("Apro la segnalazione?", "Sì"),
      ),
    ).toMatchObject({ creato: false });
    const second = database({ verified: true, ticket: true });
    expect(
      await fishAssistanceTool(
        second.db,
        "company-a",
        "agent-a",
        "phone-a",
        "+390302345678",
        "fissa_appuntamento",
        identity,
        turns("Apro la segnalazione?", "Sì"),
      ),
    ).toMatchObject({ creato: false });
    expect(fishCalendarTool).not.toHaveBeenCalled();
  });
  it("checks the customer revision and sends the authoritative case/calendar to atomic booking", async () => {
    const stale = database({ verified: true, ticket: true, stale: true });
    expect(
      await fishAssistanceTool(
        stale.db,
        "company-a",
        "agent-a",
        "phone-a",
        "+390302345678",
        "disponibilita",
        { data: "2026-11-25" },
        [],
      ),
    ).toMatchObject({ verificato: false });
    expect(fishCalendarTool).not.toHaveBeenCalled();
    const { db } = database({ verified: true, ticket: true });
    vi.mocked(fishCalendarTool).mockResolvedValue({
      creato: true,
      appointment_id: "appointment-a",
      giorno_pronuncia: "25 novembre",
      ora_pronuncia: "dieci",
      risposta: "Appuntamento confermato",
    });
    const params = {
      ...identity,
      data: "2026-11-25",
      ora: "10:00",
      motivo: "Assistenza",
      calendar_id: "foreign",
      ticket_id: "foreign",
    };
    expect(
      await fishAssistanceTool(
        db,
        "company-a",
        "agent-a",
        "phone-a",
        "+390302345678",
        "fissa_appuntamento",
        params,
        turns("Posso fissare l’appuntamento alle dieci?", "Sì, confermo"),
      ),
    ).toMatchObject({ creato: true });
    expect(fishCalendarTool).toHaveBeenCalledWith(
      db,
      "company-a",
      "calendar-a",
      "+390302345678",
      "fissa_appuntamento",
      params,
      { caseId: "case-a", phone: "+390302345678" },
      undefined,
    );
  });
});
