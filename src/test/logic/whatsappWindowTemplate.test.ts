import { describe, it, expect } from "vitest";
import {
  buildTemplatePayload,
  getWhatsAppWindowStatus,
} from "../../../supabase/functions/_shared/whatsappWindow";

// ── buildTemplatePayload — payload Meta type:"template" (compliance cold) ─────
describe("buildTemplatePayload", () => {
  it("compone messaging_product/to/type e template name+language", () => {
    const p = buildTemplatePayload("+39 333 1234567", { name: "promo", language: "it", variables: [] }) as {
      messaging_product: string; to: string; type: string;
      template: { name: string; language: { code: string }; components?: unknown };
    };
    expect(p.messaging_product).toBe("whatsapp");
    expect(p.to).toBe("393331234567"); // normalizzato a sole cifre
    expect(p.type).toBe("template");
    expect(p.template.name).toBe("promo");
    expect(p.template.language.code).toBe("it");
    // senza variabili → niente components (Meta non li vuole vuoti)
    expect(p.template.components).toBeUndefined();
  });

  it("con variabili → un component body con parametri text in ordine", () => {
    const p = buildTemplatePayload("393331234567", {
      name: "promo",
      language: "it",
      variables: ["Mario", "Edilizia in Cloud"],
    }) as { template: { components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> } };
    const body = p.template.components[0];
    expect(body.type).toBe("body");
    expect(body.parameters).toEqual([
      { type: "text", text: "Mario" },
      { type: "text", text: "Edilizia in Cloud" },
    ]);
  });

  it("lingua mancante → default 'it'", () => {
    const p = buildTemplatePayload("393331234567", { name: "x", language: "" }) as {
      template: { language: { code: string } };
    };
    expect(p.template.language.code).toBe("it");
  });
});

// ── getWhatsAppWindowStatus — finestra 24h (testo libero ammesso solo se aperta) ─
// Fake client: ritorna gli inbound predefiniti per (table, filtri) della query.
function fakeClient(rows: Array<{ from_phone: string | null; created_at: string }> | { error: true }) {
  return {
    from() {
      const chain = {
        _err: false,
        select() { return chain; },
        eq() { return chain; },
        gte() { return chain; },
        order() { return chain; },
        async limit() {
          if ("error" in (rows as { error?: true })) return { data: null, error: { message: "no col" } };
          return { data: rows, error: null };
        },
      };
      return chain;
    },
  };
}

describe("getWhatsAppWindowStatus", () => {
  const PLATFORM = "00000000-0000-0000-0000-000000000001";
  const recent = new Date().toISOString();

  it("inbound recente dello STESSO numero → finestra APERTA (testo libero ok)", async () => {
    const client = fakeClient([{ from_phone: "+39 333 1234567", created_at: recent }]);
    const st = await getWhatsAppWindowStatus(client, PLATFORM, "393331234567");
    expect(st.open).toBe(true);
    expect(st.lastInboundAt).toBe(recent);
  });

  it("nessun inbound → finestra CHIUSA (serve template)", async () => {
    const client = fakeClient([]);
    const st = await getWhatsAppWindowStatus(client, PLATFORM, "393331234567");
    expect(st.open).toBe(false);
    expect(st.lastInboundAt).toBeNull();
  });

  it("inbound di un ALTRO numero → CHIUSA (match per sole cifre, non sul contatto sbagliato)", async () => {
    const client = fakeClient([{ from_phone: "390000000000", created_at: recent }]);
    const st = await getWhatsAppWindowStatus(client, PLATFORM, "393331234567");
    expect(st.open).toBe(false);
  });

  it("telefono vuoto → CHIUSA senza query", async () => {
    const client = fakeClient([{ from_phone: "393331234567", created_at: recent }]);
    const st = await getWhatsAppWindowStatus(client, PLATFORM, "");
    expect(st.open).toBe(false);
  });

  it("errore del client (colonna assente) → fail-safe CHIUSA", async () => {
    const client = fakeClient({ error: true });
    const st = await getWhatsAppWindowStatus(client, PLATFORM, "393331234567");
    expect(st.open).toBe(false);
    expect(st.lastInboundAt).toBeNull();
  });
});
