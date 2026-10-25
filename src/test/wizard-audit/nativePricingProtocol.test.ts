import { describe, expect, it, vi } from "vitest";
import { serramentiConversationPricing } from "@/lib/serramenti/conversationPricing";
import { servizioDaCatalogo } from "@/lib/fotovoltaico/servizioDaCatalogo";
import { prodottoExtraConversazioneFv } from "@/lib/fotovoltaico/catalogoConversazione";
import {
  nativeCatalogueCandidates,
  type NativeOperation,
  type NativeContext,
} from "../../../supabase/functions/_shared/quoteNative";
import {
  runQuoteChat,
  quoteChatResponseFormat,
  type QuoteChatRequest,
  type QuoteChatServices,
  type QuoteChatTurn,
} from "../../../supabase/functions/_shared/quoteConversation";
import type { FamilyWithAxes } from "@/types/articleFamily";
const op: NativeOperation = {
  id: "new",
  kind: "serramento",
  action: "upsert",
  fields: [],
  axes: [],
};
const family = (extra: object = {}) =>
  ({
    id: "family",
    nome: "Finestra",
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 500,
    prezzo_base_acquisto: 200,
    prezzo_base_mode: "vendita",
    manodopera_modalita: "nessuna",
    axes: [],
    ...extra,
  }) as FamilyWithAxes;
describe("native prices are calculated by the original engines", () => {
  it("does not reuse old geometry after a measurement is explicitly cleared", async () => {
    const resolve = serramentiConversationPricing(
      [family({ modalita_prezzo_base: "griglia" })],
      [],
      [],
      vi.fn(async () => [
        {
          id: "grid",
          family_id: "family",
          valore_x: 1200,
          valore_y: 1400,
          prezzo_vendita: 500,
          prezzo_acquisto: 200,
          supplier_catalog_id: null,
          supplier_product_line_id: null,
          note: null,
        },
      ]),
    );
    const previous = {
      family_id: "family",
      larghezza_mm: 1200,
      altezza_mm: 1400,
      valori_assi: {},
      scelte_assi: {},
    } as Parameters<typeof resolve>[2];
    expect(
      await resolve(op, { width: null, height: 1400, quantity: 1 }, previous),
    ).toBeNull();
  });
  it("prices FV extras with native supplier discounts and markup, retaining stored sale precedence", () => {
    const source = family({
      prezzo_base_mode: "acquisto_markup",
      prezzo_base_vendita: 0,
      prezzo_base_acquisto: 1000,
      sconto_fornitore_1: 20,
      sconto_fornitore_2: 10,
      markup_tipo: "percentuale",
      markup_valore: 25,
    });
    expect(prodottoExtraConversazioneFv(source)).toMatchObject({
      prezzo: 900,
      prezzo_acquisto: 720,
    });
    expect(
      prodottoExtraConversazioneFv({ ...source, prezzo_base_vendita: 950 }),
    ).toMatchObject({ prezzo: 950, prezzo_acquisto: 720 });
  });
  it.each([
    { modalita_prezzo_base: "mq" },
    { modalita_prezzo_base: "griglia" },
    { axes: [{ codice: "vetro", values: [] }] },
    { manodopera_modalita: "fissa" },
  ])(
    "does not silently treat an unconfigured FV extra as a piece price: %j",
    (extra) => {
      expect(prodottoExtraConversazioneFv(family(extra))).toMatchObject({
        prezzo: null,
        prezzo_acquisto: null,
        configurazione_richiesta: expect.any(String),
      });
    },
  );
  it("rejects missing service costs rather than converting null or empty values to zero", () => {
    for (const cost of [null, "", undefined]) {
      expect(() =>
        servizioDaCatalogo(
          { descrizione: "Servizio", prezzo_netto_default: cost },
          1,
        ),
      ).toThrow();
    }
    expect(
      servizioDaCatalogo(
        { descrizione: "Omaggio", prezzo_netto_default: 0, prezzo_vendita: 0 },
        1,
      ),
    ).toMatchObject({ prezzo_netto: 0, prezzo_vendita: 0 });
  });
  it("uses family price and avoids even querying a grid for fixed-price articles", async () => {
    const load = vi.fn(async () => []),
      resolve = serramentiConversationPricing([family()], [], [], load);
    expect(
      await resolve(op, {
        catalogueId: "family",
        quantity: 2,
        installationExcluded: false,
      }),
    ).toMatchObject({ price: 500 });
    expect(load).not.toHaveBeenCalled();
  });
  it("requires mandatory variants and does not replace an unpriced item with an LLM amount", async () => {
    const resolve = serramentiConversationPricing(
      [
        family({
          axes: [
            {
              codice: "vetro",
              nome: "Vetro",
              obbligatorio: true,
              values: [{ id: "double", attivo: true }],
            },
          ],
        }),
      ],
      [],
      [],
      vi.fn(),
    );
    await expect(
      resolve(op, { catalogueId: "family", quantity: 1 }),
    ).rejects.toThrow(/variante/);
    expect(
      await serramentiConversationPricing(
        [],
        [],
        [],
        vi.fn(),
      )(op, { catalogueId: "absent", quantity: 1 }),
    ).toBeNull();
  });
  it("shares one grid read across positions and retains the exact matched grid ID", async () => {
    const load = vi.fn(async () => [
      {
        id: "grid",
        family_id: "family",
        valore_x: 1200,
        valore_y: 1400,
        prezzo_vendita: 500,
        prezzo_acquisto: 200,
        supplier_catalog_id: null,
        supplier_product_line_id: null,
        note: null,
      },
    ]);
    const resolve = serramentiConversationPricing(
      [family({ modalita_prezzo_base: "griglia" })],
      [],
      [],
      load,
    );
    for (let i = 0; i < 3; i++)
      expect(
        await resolve(op, {
          catalogueId: "family",
          quantity: 2,
          width: 1200,
          height: 1400,
        }),
      ).toMatchObject({ price: 500, sourceId: "grid" });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("uses catalogue service cost and margin, not an invented sale price", () => {
    expect(
      servizioDaCatalogo(
        {
          id: "s",
          codice: "pratica_gse",
          descrizione: "Pratica",
          prezzo_netto_default: 200,
          margine_pct_default: 0.2,
        },
        2,
      ),
    ).toMatchObject({
      prezzo_netto: 200,
      prezzo_vendita: 250,
      quantita: 2,
      tipo: "pratica_gse",
    });
    expect(() =>
      servizioDaCatalogo({ descrizione: "Manca il costo" }, 1),
    ).toThrow();
  });
  it("ranks matching candidates beyond the first 80 while retaining already used catalogue IDs", () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      id: `item-${i}`,
      kind: "famiglia",
      label: i === 119 ? "Zanzariera plissettata" : "Finestra PVC",
      specs: "",
    }));
    const found = nativeCatalogueCandidates(
      rows,
      ["item-100"],
      "Voglio una zanzariera plissettata",
    );
    expect(found[0].id).toBe("item-100");
    expect(found[1].id).toBe("item-119");
    expect(found).toHaveLength(80);
  });
});
describe("backend contract for technical conversations", () => {
  const context: NativeContext = {
    module: "fotovoltaico",
    modelTitle: "Modello selezionato",
    current: [{ id: "configurazione", kind: "configurazione", fields: [] }],
    catalogue: [],
  };
  const request = (): QuoteChatRequest => ({
    version: 1,
    companyId: "d2000000-0000-4000-a000-000000000002",
    sessionId: crypto.randomUUID(),
    turnId: crypto.randomUUID(),
    revision: 0,
    sourceId: null,
    messages: [{ role: "user", text: "Porta il numero di moduli a 16" }],
    lines: [],
    nativeContext: context,
  });
  const response = (): QuoteChatTurn => ({
    version: 1,
    message: "Conferma la proposta tecnica.",
    title: "Impianto",
    questions: [],
    warnings: [],
    proposals: [],
    searches: [],
    brief: "Sedici moduli",
    excludeIds: [],
    choices: [],
    nativeTurn: {
      module: "fotovoltaico",
      operations: [
        {
          id: "configurazione",
          kind: "configurazione",
          action: "upsert",
          fields: [{ key: "panelCount", value: 16 }],
          axes: [],
        },
      ],
    },
  });
  const services = (output: unknown): QuoteChatServices => ({
    complete: vi.fn(async () => ({
      content: JSON.stringify(output),
      model: "fixture",
    })),
    search: vi.fn(async () => []),
    decode: JSON.parse,
  });
  it("passes the technical context and forbids generic billable proposals/searches in the schema", async () => {
    const req = request(),
      svc = services(response()),
      format = quoteChatResponseFormat(req);
    expect(format.json_schema.schema.required).toContain("nativeTurn");
    expect(format.json_schema.schema.properties.proposals.maxItems).toBe(0);
    expect(format.json_schema.schema.properties.searches.maxItems).toBe(0);
    const result = await runQuoteChat(req, svc);
    expect(result.turn.nativeTurn?.operations[0].fields[0]).toEqual({
      key: "panelCount",
      value: 16,
    });
    expect(svc.search).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(svc.complete)
        .mock.calls[0][0].some((m) =>
          m.content.includes("Modello selezionato"),
        ),
    ).toBe(true);
  });
  it("rejects missing contracts and technical mutations on explanation-only turns", async () => {
    await expect(
      runQuoteChat(
        request(),
        services({ ...response(), nativeTurn: undefined }),
      ),
    ).rejects.toThrow(/contratto tecnico/);
    await expect(
      runQuoteChat(
        {
          ...request(),
          messages: [
            { role: "user", text: "Spiegami senza modificare il preventivo" },
          ],
        },
        services(response()),
      ),
    ).rejects.toThrow(/incoerente/);
  });
});
