import { describe, expect, it, vi } from "vitest";
import {
  applyFvNativeTurn,
  applySrNativeTurn,
  fvNativeContext,
  type FvNativeCatalogue,
} from "@/lib/preventivi/verticalWizardDraft";
import {
  readNativeTurn,
  readNativeContext,
  mergeNativeTurns,
  validateNativeTurn,
  type NativeOperation,
  type NativeTurn,
} from "../../../supabase/functions/_shared/quoteNative";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import {
  fvConfigurationPayload,
  saveLocalFvConfiguration,
} from "@/lib/fotovoltaico/configurazioneAtomica";
import { fvConversationPreview } from "@/lib/fotovoltaico/conversationPreview";
import {
  srConversationPayload,
  saveLocalSrConversation,
} from "@/lib/serramenti/conversationSave";
import type { SrProgettoDetail } from "@/types/serramenti";
import { serramentiConversationPricing } from "@/lib/serramenti/conversationPricing";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
const company = "d2000000-0000-4000-a000-000000000002",
  project = "00000000-0000-4000-a000-000000000001";
const op = (
  id: string,
  kind: string,
  values: Record<string, string | number | boolean | null>,
  action: "upsert" | "remove" = "upsert",
): NativeOperation => ({
  id,
  kind,
  action,
  axes: [],
  fields: Object.entries(values).map(([key, value]) => ({ key, value })),
});
const turn = (
  module: NativeTurn["module"],
  ...operations: NativeOperation[]
): NativeTurn => ({ module, operations });
const fvCatalogue: FvNativeCatalogue = {
  pannelli: [
    {
      id: "panel",
      nome: "Modulo P500",
      potenza_w: 500,
      prezzo_vendita: 120,
      prezzo_acquisto: 70,
    },
  ],
  inverter: [
    {
      id: "inv",
      nome: "Inverter I6",
      prezzo_vendita: 1200,
      prezzo_acquisto: 600,
    },
  ],
  accumuli: [
    {
      id: "battery",
      nome: "Accumulo B10",
      capacita_kwh: 10,
      prezzo_vendita: 3000,
    },
  ],
  kits: [
    {
      id: "kit",
      nome: "Kit chiavi in mano",
      prezzo_offerta: 8500,
      fv_kwp: 6,
      fv_accumulo_kwh: 10,
    },
  ],
  products: [
    { id: "wallbox", nome: "Wallbox", prezzo: 700, prezzo_acquisto: 400 },
  ],
  labour: [
    {
      id: "worker",
      nome: "Installatore",
      prezzo_vendita: 50,
      prezzo_costo: 30,
    },
  ],
  services: [
    {
      id: "practice",
      nome: "Pratiche",
      tipo: "pratica_gse",
      prezzo_vendita: 250,
      prezzo_netto: 100,
    },
  ],
};
const fv = (): WizardData => ({
  ...structuredClone(INITIAL),
  pannello_id: "panel",
  inverter_id: "inv",
  numero_pannelli_scelti: 12,
  potenza_kwp: 6,
  con_accumulo: false,
  capacita_accumulo_kwh: 0,
  prodotti_extra: [],
  manodopera_righe: [],
  servizi_righe: [],
});
const sr = () =>
  ({
    progetto: {
      id: project,
      company_id: company,
      stato: "bozza",
      cliente_nome: "Cliente sintetico",
      iva_percentuale: 10,
    },
    serramenti: [
      {
        id: "window",
        progetto_id: project,
        company_id: company,
        position: 0,
        tipologia_label: "Finestra PVC",
        quantita: 2,
        larghezza_mm: 1200,
        altezza_mm: 1400,
        prezzo_unitario: 500,
        prezzo_totale: 1000,
        foto_storage_path: "foto-rilievo",
        supplier_product_line_id: "line",
        valori_assi: { vetro: "double" },
        scelte_assi: { vetro: "Trasparente" },
        disegno_config: { tipo: "finestra" },
      },
    ],
    accessori: [],
    servizi: [],
    media: [],
  }) as unknown as SrProgettoDetail;
const price = vi.fn(async () => ({ price: 650, sourceId: "verified-grid" }));
describe("native conversation contract and pending memory", () => {
  it("cancels an unaccepted new position and its pending accessories instead of deleting a nonexistent saved row", () => {
    const pending = turn(
      "serramenti",
      op("new", "serramento", { title: "Finestra", quantity: 1 }),
      op("mesh", "accessorio", {
        title: "Zanzariera",
        quantity: 1,
        parentId: "new",
      }),
    );
    expect(
      mergeNativeTurns(
        pending,
        turn("serramenti", op("new", "serramento", {}, "remove")),
        new Set(),
      )?.operations,
    ).toEqual([]);
  });
  it("merges partial answers without dropping earlier geometry or other rows", () => {
    const a = turn(
      "serramenti",
      op("new", "serramento", { width: 1200, quantity: 3 }),
      op("service", "servizio", { title: "Posa" }),
    );
    const b = mergeNativeTurns(
      a,
      turn(
        "serramenti",
        op("new", "serramento", { height: 1400, material: "pvc" }),
      ),
    )!;
    expect(
      Object.fromEntries(b.operations[0].fields.map((f) => [f.key, f.value])),
    ).toEqual({ width: 1200, height: 1400, quantity: 3, material: "pvc" });
    expect(b.operations).toHaveLength(2);
    expect(mergeNativeTurns(b, null)).toBe(b);
  });
  it("rejects prices, duplicate fields, cross-module operations and invented references", () => {
    expect(() =>
      readNativeTurn(turn("serramenti", op("new", "serramento", { price: 1 }))),
    ).toThrow();
    expect(() =>
      readNativeTurn(turn("fotovoltaico", op("new", "serramento", {}))),
    ).toThrow();
    const ctx = readNativeContext({
      module: "serramenti",
      modelTitle: "Modello",
      current: [],
      catalogue: [],
    });
    expect(() =>
      validateNativeTurn(
        turn(
          "serramenti",
          op("new", "serramento", { catalogueId: "invented" }),
        ),
        ctx,
        false,
      ),
    ).toThrow();
    expect(() =>
      validateNativeTurn(
        turn("serramenti", op("new", "serramento", { quantity: 2 })),
        ctx,
        true,
      ),
    ).toThrow();
  });
});
describe("Serramenti full technical adapter", () => {
  it("clears supplier provenance when the native pricing engine explicitly unlinks it", async () => {
    const base = sr();
    base.serramenti[0].supplier_catalog_id = "old-supplier";
    const next = await applySrNativeTurn(
      base,
      turn("serramenti", op("window", "serramento", { supplierLineId: null })),
      [],
      async () => ({ price: 500, supplierId: null, supplierLineId: null }),
    );
    expect(next.serramenti[0].supplier_product_line_id).toBeNull();
    expect(next.serramenti[0].supplier_catalog_id).toBeNull();
    expect(base.serramenti[0].supplier_catalog_id).toBe("old-supplier");
  });
  it("does not reuse an hourly service price when changing its billing unit", async () => {
    const base = sr();
    base.servizi = [
      {
        id: "labour",
        progetto_id: project,
        company_id: company,
        descrizione: "Posa oraria",
        quantita: 8,
        unita: "h",
        tariffa_id: "hour",
        prezzo_unitario_vendita: 50,
        prezzo_totale_vendita: 400,
        prezzo_unitario_costo: 30,
        prezzo_totale_costo: 240,
        position: 1,
      },
    ] as SrProgettoDetail["servizi"];
    const resolve = serramentiConversationPricing(
      [],
      [
        {
          id: "hour",
          nome: "Posa",
          prezzo_vendita: 50,
          unita: "h",
          descrizione: null,
          prezzo_costo: 30,
          categoria_prodotto: null,
          vertical_associato: null,
          tipo: null,
        },
      ],
      [],
      vi.fn(),
    );
    await expect(
      applySrNativeTurn(
        base,
        turn("serramenti", op("labour", "servizio", { unit: "gg" })),
        [],
        resolve,
      ),
    ).rejects.toThrow(/unità/i);
    expect(base.servizi[0].unita).toBe("h");
  });
  it("allows an explicit unlinked service unit change only with a new confirmed price and clears the old cost", async () => {
    const base = sr();
    base.servizi = [
      {
        id: "labour",
        progetto_id: project,
        company_id: company,
        descrizione: "Posa manuale",
        quantita: 1,
        unita: "h",
        tariffa_id: null,
        prezzo_unitario_vendita: 50,
        prezzo_totale_vendita: 50,
        prezzo_unitario_costo: 30,
        prezzo_totale_costo: 30,
        position: 1,
      },
    ] as SrProgettoDetail["servizi"];
    const change = turn("serramenti", op("labour", "servizio", { unit: "gg" }));
    await expect(
      applySrNativeTurn(base, change, [], async () => null),
    ).rejects.toThrow(/prezzo/i);
    const next = await applySrNativeTurn(base, change, [], async () => null, {
      labour: 350,
    });
    expect(next.servizi[0]).toMatchObject({
      unita: "gg",
      prezzo_unitario_vendita: 350,
      prezzo_unitario_costo: null,
      prezzo_totale_costo: null,
    });
  });
  it("keeps photos, supplier lines, variants, stable identities and recomputes totals", async () => {
    const base = sr(),
      next = await applySrNativeTurn(
        base,
        turn("serramenti", op("window", "serramento", { quantity: 3 })),
        [],
        price,
      );
    expect(next.serramenti[0]).toMatchObject({
      id: "window",
      quantita: 3,
      prezzo_totale: 1950,
      metri_quadri: 5.04,
      foto_storage_path: "foto-rilievo",
      supplier_product_line_id: "line",
      valori_assi: { vetro: "double" },
    });
    expect(base.serramenti[0].quantita).toBe(2);
    expect(next.progetto).toEqual(base.progetto);
  });
  it("does not reprice a room/title-only edit", async () => {
    const resolver = vi.fn();
    const next = await applySrNativeTurn(
      sr(),
      turn(
        "serramenti",
        op("window", "serramento", {
          room: "Camera",
          title: "Finestra camera",
        }),
      ),
      [],
      resolver,
    );
    expect(resolver).not.toHaveBeenCalled();
    expect(next.serramenti[0].prezzo_unitario).toBe(500);
  });
  it("resolves new parent links and assigns distinct row positions", async () => {
    const next = await applySrNativeTurn(
      sr(),
      turn(
        "serramenti",
        op("new", "serramento", {
          title: "Finestra cucina",
          quantity: 1,
          width: 1000,
          height: 1000,
        }),
        op("mesh", "accessorio", {
          title: "Zanzariera",
          quantity: 1,
          width: 1000,
          height: 1000,
          parentId: "new",
        }),
      ),
      [],
      price,
    );
    expect(next.accessori[0].serramento_id).toBe(next.serramenti[1].id);
    expect(next.accessori[0].position).not.toBe(next.serramenti[1].position);
  });
  it("blocks incomplete quantities, unsupported units and missing verified prices", async () => {
    for (const values of [
      { title: "Finestra", width: 1000, height: 1000 },
      { title: "Finestra", width: 1000, height: 1000, quantity: 1.5 },
      { title: "Finestra", width: 1000, height: 1000, quantity: 1, unit: "mq" },
    ])
      await expect(
        applySrNativeTurn(
          sr(),
          turn("serramenti", op("new", "serramento", values)),
          [],
          price,
        ),
      ).rejects.toThrow();
    await expect(
      applySrNativeTurn(
        sr(),
        turn("serramenti", op("window", "serramento", { width: 1300 })),
        [],
        async () => null,
      ),
    ).rejects.toThrow(/Prezzo/);
    const next = await applySrNativeTurn(
      sr(),
      turn("serramenti", op("window", "serramento", { width: 1300 })),
      [],
      async () => null,
      { window: 720 },
    );
    expect(next.serramenti[0].prezzo_unitario).toBe(720);
  });
  it("requires linked accessories to be reviewed after resizing; explicit deletion removes them together", async () => {
    const base = sr();
    base.accessori = [
      {
        ...base.serramenti[0],
        id: "mesh",
        serramento_id: "window",
        descrizione: "Zanzariera",
      },
    ] as unknown as SrProgettoDetail["accessori"];
    await expect(
      applySrNativeTurn(
        base,
        turn("serramenti", op("window", "serramento", { width: 1300 })),
        [],
        price,
      ),
    ).rejects.toThrow(/accessori/);
    const next = await applySrNativeTurn(
      base,
      turn("serramenti", op("window", "serramento", {}, "remove")),
      [],
      price,
    );
    expect(next.serramenti).toEqual([]);
    expect(next.accessori).toEqual([]);
    expect(base.accessori).toHaveLength(1);
  });
});
describe("FV full technical adapter", () => {
  it("replaces catalogue description and clears the previous purchase cost when switching product", () => {
    const base = applyFvNativeTurn(
      fv(),
      turn(
        "fotovoltaico",
        op("extra", "prodotto", { catalogueId: "wallbox", quantity: 1 }),
      ),
      fvCatalogue,
    );
    const id = base.prodotti_extra[0].uid!;
    const next = applyFvNativeTurn(
      base,
      turn("fotovoltaico", op(id, "prodotto", { catalogueId: "other" })),
      {
        ...fvCatalogue,
        products: [
          ...fvCatalogue.products!,
          { id: "other", nome: "Altro prodotto", prezzo: 900 },
        ],
      },
    );
    expect(next.prodotti_extra[0]).toMatchObject({
      uid: id,
      listino_id: "other",
      descrizione: "Altro prodotto",
      prezzo_vendita: 900,
      prezzo_acquisto: null,
    });
    expect(base.prodotti_extra[0].prezzo_acquisto).toBe(400);
  });
  it("requires an explicit manual price on unlink and does not reuse the previous catalogue cost", () => {
    const base = applyFvNativeTurn(
      fv(),
      turn(
        "fotovoltaico",
        op("extra", "prodotto", { catalogueId: "wallbox", quantity: 1 }),
      ),
      fvCatalogue,
    );
    const id = base.prodotti_extra[0].uid!;
    const unlinked = turn(
      "fotovoltaico",
      op(id, "prodotto", { catalogueId: null }),
    );
    expect(() => applyFvNativeTurn(base, unlinked, fvCatalogue)).toThrow(
      /prezzo/i,
    );
    expect(
      applyFvNativeTurn(base, unlinked, fvCatalogue, { [id]: 800 })
        .prodotti_extra[0],
    ).toMatchObject({
      listino_id: null,
      prezzo_vendita: 800,
      prezzo_acquisto: null,
    });
  });
  it("uses native legacy tariff cost precedence and does not inherit a different worker's cost", () => {
    const base = applyFvNativeTurn(
      fv(),
      turn(
        "fotovoltaico",
        op("hours", "manodopera", { catalogueId: "worker", quantity: 8 }),
      ),
      fvCatalogue,
    );
    const id = base.manodopera_righe[0].uid!;
    const catalogue = {
      ...fvCatalogue,
      labour: [
        {
          id: "other",
          nome: "Tecnico",
          prezzo_vendita: 80,
          costo_interno: 0,
          prezzo_costo: 45,
        },
        { id: "unknown", nome: "Costo da definire", prezzo_vendita: 75 },
      ],
    };
    expect(
      applyFvNativeTurn(
        base,
        turn("fotovoltaico", op(id, "manodopera", { catalogueId: "other" })),
        catalogue,
      ).manodopera_righe[0],
    ).toMatchObject({ descrizione: "Tecnico", tariffa_oraria_netta: 45 });
    expect(
      applyFvNativeTurn(
        base,
        turn("fotovoltaico", op(id, "manodopera", { catalogueId: "unknown" })),
        catalogue,
      ).manodopera_righe[0].tariffa_oraria_netta,
    ).toBe(0);
  });
  it("rejects source units that cannot be mapped to pieces or hours even when AI claims a compatible unit", () => {
    expect(() =>
      applyFvNativeTurn(
        fv(),
        turn(
          "fotovoltaico",
          op("extra", "prodotto", {
            catalogueId: "surface",
            quantity: 1,
            unit: "pz",
          }),
        ),
        {
          ...fvCatalogue,
          products: [
            { id: "surface", nome: "Rivestimento", prezzo: 20, unita: "mq" },
          ],
        },
      ),
    ).toThrow();
    expect(() =>
      applyFvNativeTurn(
        fv(),
        turn(
          "fotovoltaico",
          op("hours", "manodopera", {
            catalogueId: "day",
            quantity: 8,
            unit: "h",
          }),
        ),
        {
          ...fvCatalogue,
          labour: [
            {
              id: "day",
              nome: "Giornata",
              prezzo_vendita: 400,
              unita_fatturazione: "gg",
              unita: "h",
            },
          ],
        },
      ),
    ).toThrow();
  });
  it("blocks required product configurations and ignored variant choices even with a manual price", () => {
    const operation = op("extra", "prodotto", {
      catalogueId: "wallbox",
      quantity: 1,
    });
    expect(() =>
      applyFvNativeTurn(
        fv(),
        turn("fotovoltaico", operation),
        {
          ...fvCatalogue,
          products: [
            {
              ...fvCatalogue.products![0],
              configurazione_richiesta: "Completa le varianti",
            },
          ],
        },
        { extra: 900 },
      ),
    ).toThrow(/varianti/);
    expect(() =>
      applyFvNativeTurn(
        fv(),
        turn("fotovoltaico", {
          ...operation,
          axes: [{ axis: "colore", value: "blu", choice: null }],
        }),
        fvCatalogue,
      ),
    ).toThrow();
  });
  it("calculates kWp and battery from verified catalogue, preserves customer, roof, VAT and discount", () => {
    const base = {
      ...fv(),
      cliente_nome: "Cliente",
      cointestatario_nome: "Lea",
      cointestatario_cognome: "Esempio",
      cointestatario_codice_fiscale: "CF-sintetico",
      sconto_valore: 5,
      iva_aliquota: 0.22,
      numero_pannelli_max: 20,
    };
    const next = applyFvNativeTurn(
      base,
      turn(
        "fotovoltaico",
        op("configurazione", "configurazione", {
          panelCount: 16,
          batteryId: "battery",
          withBattery: true,
        }),
      ),
      fvCatalogue,
    );
    expect(next).toMatchObject({
      potenza_kwp: 8,
      capacita_accumulo_kwh: 10,
      cliente_nome: "Cliente",
      cointestatario_nome: "Lea",
      cointestatario_cognome: "Esempio",
      cointestatario_codice_fiscale: "CF-sintetico",
      sconto_valore: 5,
      iva_aliquota: 0.22,
      numero_pannelli_max: 20,
    });
    expect(base.potenza_kwp).toBe(6);
  });
  it("adds catalogue products, hours, costs, services and stable identities", () => {
    const next = applyFvNativeTurn(
      fv(),
      turn(
        "fotovoltaico",
        op("extra", "prodotto", { catalogueId: "wallbox", quantity: 1 }),
        op("labour", "manodopera", { catalogueId: "worker", quantity: 8 }),
        op("service", "servizio", { catalogueId: "practice", quantity: 1 }),
      ),
      fvCatalogue,
    );
    expect(next.prodotti_extra[0]).toMatchObject({
      prezzo_vendita: 700,
      prezzo_acquisto: 400,
    });
    expect(next.manodopera_righe[0]).toMatchObject({
      ore: 8,
      tariffa_oraria_netta: 30,
      tariffa_oraria_vendita: 50,
    });
    const id = next.servizi_righe[0].uid!;
    expect(fvNativeContext(next, "", []).current.some((r) => r.id === id)).toBe(
      true,
    );
    const edited = applyFvNativeTurn(
      next,
      turn("fotovoltaico", op(id, "servizio", { quantity: 2 })),
      fvCatalogue,
    );
    expect(edited.servizi_righe[0]).toMatchObject({
      prezzo_vendita: 250,
      quantita: 2,
      catalogue_id: "practice",
      uid: id,
    });
    const p = fvConfigurationPayload(edited, fvCatalogue, {
      projectId: project,
      companyId: company,
      updatedAt: "2026-10-24T08:00:00Z",
    });
    expect(p.p_labour[0]).not.toHaveProperty("uid");
    expect(p.p_services[0]).not.toHaveProperty("catalogue_id");
  });
  it("keeps row IDs after deleting an earlier service, so follow-up edits hit the right row", () => {
    const base: WizardData = {
      ...fv(),
      servizi_righe: [
        {
          tipo: "altro",
          descrizione: "A",
          quantita: 1,
          prezzo_netto: 10,
          prezzo_vendita: 20,
          note_operative: null,
        },
        {
          tipo: "altro",
          descrizione: "B",
          quantita: 1,
          prezzo_netto: 10,
          prezzo_vendita: 20,
          note_operative: null,
        },
      ],
    };
    const next = applyFvNativeTurn(
      base,
      turn("fotovoltaico", op("service-0", "servizio", {}, "remove")),
      fvCatalogue,
    );
    expect(next.servizi_righe[0].uid).toBe("service-1");
    expect(
      applyFvNativeTurn(
        next,
        turn("fotovoltaico", op("service-1", "servizio", { quantity: 3 })),
        fvCatalogue,
      ).servizi_righe[0],
    ).toMatchObject({ descrizione: "B", quantita: 3 });
  });
  it("does not silently erase labour when selecting a kit, but accepts explicit review/removal in the same turn", () => {
    const base: WizardData = {
      ...fv(),
      manodopera_righe: [
        {
          tariffa_id: null,
          descrizione: "Posa",
          ore: 8,
          tariffa_oraria_netta: 30,
          tariffa_oraria_vendita: 50,
        },
      ],
    };
    const configuration = op("configurazione", "configurazione", {
      kitId: "kit",
    });
    expect(() =>
      applyFvNativeTurn(base, turn("fotovoltaico", configuration), fvCatalogue),
    ).toThrow(/doppioni/);
    const next = applyFvNativeTurn(
      base,
      turn(
        "fotovoltaico",
        configuration,
        op("labour-0", "manodopera", {}, "remove"),
      ),
      fvCatalogue,
    );
    expect(next).toMatchObject({
      kit_prezzo: 8500,
      potenza_kwp: 6,
      capacita_accumulo_kwh: 10,
      manodopera_righe: [],
    });
    expect(() =>
      applyFvNativeTurn(
        next,
        turn(
          "fotovoltaico",
          op("configurazione", "configurazione", { panelCount: 30 }),
        ),
        fvCatalogue,
      ),
    ).toThrow(/alternative/);
  });
  it("blocks invented references, missing rated power, roof overflow and missing prices", () => {
    expect(() =>
      applyFvNativeTurn(
        fv(),
        turn(
          "fotovoltaico",
          op("configurazione", "configurazione", { panelId: "fake" }),
        ),
        fvCatalogue,
      ),
    ).toThrow();
    expect(() =>
      applyFvNativeTurn(
        fv(),
        turn(
          "fotovoltaico",
          op("configurazione", "configurazione", { panelCount: 15 }),
        ),
        { ...fvCatalogue, pannelli: [{ id: "panel", prezzo_vendita: 120 }] },
      ),
    ).toThrow(/540/);
    expect(() =>
      applyFvNativeTurn(
        { ...fv(), numero_pannelli_max: 10 },
        turn(
          "fotovoltaico",
          op("configurazione", "configurazione", { panelCount: 15 }),
        ),
        fvCatalogue,
      ),
    ).toThrow(/tetto/);
    expect(() =>
      applyFvNativeTurn(
        fv(),
        turn(
          "fotovoltaico",
          op("extra", "prodotto", { title: "Extra senza prezzo", quantity: 1 }),
        ),
        fvCatalogue,
      ),
    ).toThrow(/prezzo/);
  });
  it("uses the actual template renderer and native total, without demo customer or fictitious financial pages", () => {
    const view = fvConversationPreview(
      {
        ...fv(),
        cliente_nome: "Ada",
        cliente_cognome: "Test",
        cointestatario_nome: "Lea",
        cointestatario_cognome: "Esempio",
        iva_aliquota: 0.22,
      },
      fvCatalogue,
      {
        pdf_cover_hero: "Il mio modello",
        pdf_pages_order: [
          { id: "investimento", visible: true },
          { id: "risparmio", visible: true },
          { id: "flussi", visible: true },
        ],
      } as never,
      "Azienda sintetica",
      [],
    );
    expect(view.html).toContain("Il mio modello");
    expect(view.html).toContain("Ada Test");
    expect(view.html).toContain("Lea Esempio");
    expect(view.html).not.toContain("Mario Rossi");
    expect(view.html).not.toContain('data-fv-section="risparmio"');
    expect(view.html).not.toContain('data-fv-section="flussi"');
    expect(view.total).toBe(3220.8);
  });
});
describe("atomic save clients use the configured backend and fail closed", () => {
  it("rejects insecure backends and never falls back to per-table writes", async () => {
    const rpc = vi.fn();
    const payload = fvConfigurationPayload(fv(), fvCatalogue, {
      projectId: project,
      companyId: company,
      updatedAt: "2026-10-24T08:00:00Z",
    });
    await expect(
      saveLocalFvConfiguration(rpc, payload, "http://example.supabase.co"),
    ).rejects.toThrow(/Configurazione/);
    await expect(
      saveLocalSrConversation(
        rpc,
        srConversationPayload(sr(), sr()),
        "http://example.supabase.co",
      ),
    ).rejects.toThrow(/Configurazione/);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "missing" },
    });
    await expect(
      saveLocalFvConfiguration(rpc, payload, "http://127.0.0.1:54321"),
    ).rejects.toThrow(/non installata/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("checks success identity and rejects project mutations", async () => {
    const next = sr();
    next.progetto.cliente_nome = "Alterato";
    expect(() => srConversationPayload(sr(), next)).toThrow(/cliente/);
    const payload = fvConfigurationPayload(fv(), fvCatalogue, {
      projectId: project,
      companyId: company,
      updatedAt: "2026-10-24T08:00:00Z",
    });
    await expect(
      saveLocalFvConfiguration(
        vi.fn().mockResolvedValue({
          data: { projectId: "other", updatedAt: "today", replayed: false },
          error: null,
        }),
        payload,
        "http://localhost:54321",
      ),
    ).rejects.toThrow(/verificabile/);
  });
  it('uses the atomic RPC on a configured HTTPS backend', async () => {
    const payload = fvConfigurationPayload(fv(), fvCatalogue, {projectId:project,companyId:company,updatedAt:'2026-10-24T08:00:00Z'});
    const rpc = vi.fn().mockResolvedValue({data:{projectId:project,updatedAt:'2026-10-25T08:00:00Z',replayed:false},error:null});
    await saveLocalFvConfiguration(rpc,payload,'https://configured.supabase.co');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('fv_save_configuration_atomic',payload);
    const srPayload = srConversationPayload(sr(),sr()); rpc.mockResolvedValue({data:{projectId:srPayload.p_project_id,replayed:true},error:null});
    await saveLocalSrConversation(rpc,srPayload,'https://configured.supabase.co');
    expect(rpc.mock.calls.at(-1)).toEqual(['sr_apply_ai_bom_atomic',srPayload]);
  });
});
