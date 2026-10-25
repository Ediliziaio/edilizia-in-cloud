import { describe, expect, it, vi } from "vitest";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import {
  computoChatDocument,
  reconcileComputoDraft,
  type NativeComputoModule,
  type NativeComputoRow,
} from "@/lib/preventivi/wizardAiDraft";
import {
  emptyChatDocument,
  patchChatLine,
  type ChatDocument,
  type ChatLine,
} from "@/lib/preventivi/quoteChatDocument";
import { wizardAiCommercial } from "@/lib/preventivi/wizardAiCommercial";
import {
  classicChatDocument,
  reconcileClassicWizardDraft,
} from "@/lib/preventivi/classicWizardAiDraft";
import {
  applyFvNativeTurn,
  applySrNativeTurn,
  type FvNativeCatalogue,
} from "@/lib/preventivi/verticalWizardDraft";
import { serramentiConversationPricing } from "@/lib/serramenti/conversationPricing";
import { fvConfigurationPayload } from "@/lib/fotovoltaico/configurazioneAtomica";
import { fvConversationPreview } from "@/lib/fotovoltaico/conversationPreview";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import type { FamilyWithAxes } from "@/types/articleFamily";
import type { TariffaMinimal } from "@/lib/serramenti/api";
import type { SrProgettoDetail } from "@/types/serramenti";
import type { QuoteDraft } from "@/lib/preventivi/quoteDraft";
import type {
  NativeOperation,
  NativeTurn,
} from "../../../supabase/functions/_shared/quoteNative";

// All amounts below are deliberately synthetic fixtures, NOT a regional price
// list or an AI estimate. These simulations exercise the real local adapters and
// calculators with explicit human confirmations and no network or database I/O.
type Work = [
  chapter: string,
  title: string,
  quantity: number,
  unit: NativeComputoRow["unita_misura"],
  price: number,
];
const cases: Array<{ area: string; works: Work[] }> = [
  {
    area: "bagni",
    works: [
      ["Demolizioni", "Rimozione pavimento bagno", 12, "mq", 18],
      ["Impianti", "Nuovi punti idrici bagno", 6, "cad", 180],
      ["Sottofondi", "Impermeabilizzazione zona doccia", 4, "mq", 35],
      ["Finiture", "Posa gres pavimento bagno", 12, "mq", 60],
      ["Sanitari", "Fornitura sanitari e rubinetterie", 1, "corpo", 2200],
      ["Consegna", "Collaudo impianto bagno", 1, "corpo", 150],
    ],
  },
  {
    area: "tetti",
    works: [
      ["Sicurezza", "Ponteggio copertura", 120, "mq", 20],
      ["Demolizioni", "Rimozione manto copertura", 100, "mq", 18],
      ["Copertura", "Nuovo manto in tegole", 100, "mq", 65],
    ],
  },
  {
    area: "ristrutturazioni",
    works: [
      ["Demolizioni", "Rimozione pavimento appartamento", 80, "mq", 18],
      ["Impianti", "Rifacimento elettrico appartamento", 40, "cad", 60],
      ["Finiture", "Rasatura pareti appartamento", 180, "mq", 12],
    ],
  },
  {
    area: "pareti-soffitti",
    works: [
      ["Protezioni", "Protezione arredi soggiorno", 1, "corpo", 120],
      ["Preparazione", "Stuccatura pareti soggiorno", 45, "mq", 8],
      ["Finiture", "Tinteggiatura pareti soggiorno", 45, "mq", 12],
    ],
  },
  {
    area: "pergole",
    works: [
      ["Struttura", "Fornitura pergola bioclimatica", 1, "corpo", 5000],
      ["Posa", "Montaggio pergola", 16, "h", 45],
      ["Consegna", "Collaudo motori pergola", 1, "cad", 120],
    ],
  },
  {
    area: "climatizzazione",
    works: [
      ["Macchine", "Fornitura climatizzatore monosplit", 2, "cad", 800],
      ["Linee", "Linee frigorifere climatizzazione", 12, "ml", 30],
      ["Avviamento", "Messa in servizio climatizzatori", 2, "cad", 150],
    ],
  },
  {
    area: "termoidraulica",
    works: [
      ["Generatore", "Fornitura pompa di calore", 1, "cad", 4500],
      ["Distribuzione", "Tubazioni riscaldamento", 30, "ml", 25],
      ["Avviamento", "Prima accensione generatore", 1, "cad", 180],
    ],
  },
  {
    area: "elettrico",
    works: [
      ["Impianto", "Nuovi punti luce soggiorno", 8, "cad", 60],
      ["Quadro", "Quadro elettrico abitazione", 1, "cad", 650],
      ["Verifiche", "Verifiche strumentali impianto", 1, "corpo", 180],
    ],
  },
  {
    area: "pavimenti",
    works: [
      ["Demolizioni", "Rimozione pavimento cucina", 22, "mq", 18],
      ["Preparazione", "Livellamento sottofondo cucina", 22, "mq", 15],
      ["Posa", "Posa parquet cucina", 22, "mq", 55],
    ],
  },
  {
    area: "giardini",
    works: [
      ["Preparazione", "Preparazione terreno giardino", 100, "mq", 8],
      ["Verde", "Posa prato a rotoli giardino", 100, "mq", 12],
      ["Irrigazione", "Linee irrigazione giardino", 30, "ml", 18],
    ],
  },
  {
    area: "piscine",
    works: [
      ["Preparazione", "Allestimento area piscina", 1, "corpo", 300],
      ["Rivestimento", "Rinnovo rivestimento piscina", 40, "mq", 65],
      ["Filtrazione", "Sostituzione filtro piscina", 1, "cad", 800],
    ],
  },
  {
    area: "facciate",
    works: [
      ["Sicurezza", "Ponteggio facciata", 150, "mq", 20],
      ["Preparazione", "Ripristino intonaco facciata", 30, "mq", 25],
      ["Isolamento", "Posa cappotto termico facciata", 120, "mq", 90],
    ],
  },
];
const identity = {
  companyId: "d2000000-0000-4000-a000-000000000002",
  projectId: "00000000-0000-4000-a000-000000000001",
};
const line = (work: Work, id: string): ChatLine => {
  const [chapter, title, quantity, unit, price] = work;
  const original: ChatLine["original"] = {
    id,
    title,
    description: `Dati sintetici di prova · ${chapter} · ${title}`,
    quantity,
    unit,
    referenceId: null,
    quantityBasis:
      "Quantità esplicitamente dichiarata nella simulazione locale.",
  };
  return {
    ...original,
    original: structuredClone(original),
    price,
    included: false,
    manual: true,
    reference: null,
  };
};
const operation = (
  id: string,
  kind: string,
  data: Record<string, string | number | boolean | null>,
): NativeOperation => ({
  id,
  kind,
  action: "upsert",
  axes: [],
  fields: Object.entries(data).map(([key, value]) => ({ key, value })),
});

it("covers all 14 actual sales areas, with dedicated technical scenarios for Serramenti and FV", () => {
  expect(
    [...cases.map((c) => c.area), "serramenti", "fotovoltaico"].sort(),
  ).toEqual(SALES_AREAS.map((a) => a.id).sort());
});

describe.each(cases)("$area: scenario multi-fase locale", ({ area, works }) => {
  const module = SALES_AREAS.find((a) => a.id === area)!
    .sourceModule as NativeComputoModule;
  const initial = (): ChatDocument => ({
    revision: 0,
    title: `SIMULAZIONE ${area}`,
    lines: works.map((work, i) => line(work, `${area}-${i}`)),
  });
  const chapters = Object.fromEntries(
    works.map(([chapter], i) => [`${area}-${i}`, chapter]),
  );
  const confirmed = () => {
    let draft = initial();
    for (const entry of draft.lines)
      draft = patchChatLine(draft, entry.id, { included: true });
    return draft;
  };
  it("includes nothing until confirmation, then maps each work to its chosen native phase", () => {
    const proposed = initial();
    expect(
      reconcileComputoDraft(
        [],
        emptyChatDocument(),
        proposed,
        identity,
        chapters,
      ),
    ).toMatchObject({ rows: [], pending: works.length });
    const doc = confirmed();
    expect(doc.lines.every((l) => l.included)).toBe(true);
    const result = reconcileComputoDraft(
      [],
      emptyChatDocument(),
      doc,
      identity,
      chapters,
    );
    expect(result.pending).toBe(0);
    expect(
      result.rows.map((r) => [
        r.capitolo_nome,
        r.descrizione,
        r.quantita,
        r.unita_misura,
        r.prezzo_unitario,
      ]),
    ).toEqual(works);
    const net = works.reduce((n, [, , q, , price]) => n + q * price, 0);
    const economy = wizardAiCommercial(
      doc,
      { items: [], discountPercent: 5 },
      10,
      module,
    );
    expect(economy.taxTotal.net).toBeCloseTo(net * 0.95, 2);
    expect(economy.taxTotal.gross).toBeCloseTo(net * 0.95 * 1.1, 2);
  });
  it("round-trips edits and exclusions without losing costs, photos, long descriptions or identity", () => {
    const base = reconcileComputoDraft(
      [],
      emptyChatDocument(),
      confirmed(),
      identity,
      chapters,
    ).rows.map((r, i) => ({
      ...r,
      costo_materiali: 17 + i,
      costo_manodopera: 11,
      sconto_pct: 7,
      immagine_url: `/fixture-${area}-${i}.jpg`,
      fonte: "Fixture locale, non prezzario regionale",
      descrizione_estesa: `${r.descrizione} · specifiche `.repeat(500),
    }));
    const snapshot = structuredClone(base);
    const reopened: NativeComputoRow[] = JSON.parse(JSON.stringify(base));
    const seed = computoChatDocument(reopened, `SIMULAZIONE ${area}`);
    let edited = patchChatLine(seed, seed.lines[0].id, {
      title: `${works[0][1]} · revisione`,
      price: works[0][4] + 5,
    });
    edited = patchChatLine(edited, seed.lines.at(-1)!.id, { included: false });
    const result = reconcileComputoDraft(reopened, seed, edited, identity);
    expect(result.rows).toHaveLength(works.length - 1);
    expect(result.rows[0]).toMatchObject({
      id: base[0].id,
      costo_materiali: 17,
      costo_manodopera: 11,
      sconto_pct: 7,
      immagine_url: base[0].immagine_url,
      fonte: base[0].fonte,
      descrizione_estesa: base[0].descrizione_estesa,
    });
    expect(result.changes.map((c) => c.kind)).toEqual([
      "modifica",
      "esclusione",
    ]);
    expect(base).toEqual(snapshot);
    const again = computoChatDocument(
      JSON.parse(JSON.stringify(result.rows)),
      "Riaperto",
    );
    expect(
      reconcileComputoDraft(result.rows, again, again, identity).rows,
    ).toEqual(result.rows);
  });
  it("keeps unpriced work outside the total and refuses a forced incomplete import atomically", () => {
    const doc = confirmed();
    const pending = line(
      ["Da completare", `Lavorazione aggiuntiva ${area}`, 1, "corpo", 100],
      `${area}-pending`,
    );
    pending.price = null;
    doc.lines.push(pending);
    const result = reconcileComputoDraft(
      [],
      emptyChatDocument(),
      doc,
      identity,
      chapters,
    );
    expect(result.pending).toBe(1);
    expect(result.rows).toHaveLength(works.length);
    pending.included = true;
    const original = structuredClone(doc);
    expect(() =>
      reconcileComputoDraft([], emptyChatDocument(), doc, identity, chapters),
    ).toThrow(/completa/i);
    expect(doc).toEqual(original);
  });
});

describe("Serramenti: configurazione tecnica con prezzi del motore originale", () => {
  const families = [
    { id: "window", nome: "Finestra PVC", prezzo_base_vendita: 500 },
    { id: "mesh", nome: "Zanzariera", prezzo_base_vendita: 80 },
  ].map(
    (f) =>
      ({
        ...f,
        modalita_prezzo_base: "pz",
        prezzo_base_acquisto: 100,
        prezzo_base_mode: "vendita",
        manodopera_modalita: "nessuna",
        axes: [],
      }) as FamilyWithAxes,
  );
  const rate: TariffaMinimal = {
    id: "hour",
    nome: "Posa oraria",
    descrizione: null,
    unita: "h",
    prezzo_costo: 30,
    prezzo_vendita: 45,
    categoria_prodotto: null,
    vertical_associato: null,
    tipo: null,
  };
  const catalogue = families.map((f) => ({
    id: f.id,
    kind: "famiglia",
    label: f.nome,
    specs: "",
  }));
  const base = () =>
    ({
      progetto: {
        id: identity.projectId,
        company_id: identity.companyId,
        stato: "bozza",
        iva_percentuale: 10,
      },
      serramenti: [],
      accessori: [],
      servizi: [],
      media: [],
    }) as unknown as SrProgettoDetail;
  const proposal: NativeTurn = {
    module: "serramenti",
    operations: [
      operation("window-new", "serramento", {
        title: "Finestra soggiorno",
        catalogueId: "window",
        quantity: 2,
        width: 1200,
        height: 1400,
        room: "Soggiorno",
      }),
      operation("mesh-new", "accessorio", {
        title: "Zanzariera soggiorno",
        catalogueId: "mesh",
        quantity: 2,
        width: 1200,
        height: 1400,
        parentId: "window-new",
      }),
      operation("labour-new", "servizio", {
        title: "Posa oraria",
        quantity: 4,
        unit: "h",
      }),
    ],
  };
  it("builds three linked phases and preserves them through local serialization and a coordinated quantity edit", async () => {
    const load = vi.fn(async () => []);
    const resolve = serramentiConversationPricing(families, [rate], [], load);
    const source = base();
    // The labour price is an explicit manual confirmation in this fixture.
    const draft = await applySrNativeTurn(
      source,
      proposal,
      catalogue,
      resolve,
      { "labour-new": 45 },
    );
    expect(draft.serramenti[0].prezzo_totale).toBe(1000);
    expect(draft.accessori[0]).toMatchObject({
      serramento_id: draft.serramenti[0].id,
      prezzo_totale: 160,
    });
    expect(draft.servizi[0].prezzo_totale_vendita).toBe(180);
    expect(source.serramenti).toEqual([]);
    const reopened: SrProgettoDetail = JSON.parse(JSON.stringify(draft));
    const edit: NativeTurn = {
      module: "serramenti",
      operations: [
        operation(draft.serramenti[0].id, "serramento", { quantity: 3 }),
        operation(draft.accessori[0].id, "accessorio", { quantity: 3 }),
      ],
    };
    const next = await applySrNativeTurn(reopened, edit, catalogue, resolve);
    expect(next.serramenti[0].prezzo_totale).toBe(1500);
    expect(next.accessori[0].prezzo_totale).toBe(240);
    expect(next.servizi).toEqual(reopened.servizi);
    expect(next.progetto).toEqual(source.progetto);
    expect(load).not.toHaveBeenCalled();
  });
  it("rejects a parent-only change with stale linked accessories", async () => {
    const resolve = serramentiConversationPricing(
      families,
      [rate],
      [],
      vi.fn(),
    );
    const draft = await applySrNativeTurn(
      base(),
      proposal,
      catalogue,
      resolve,
      { "labour-new": 45 },
    );
    await expect(
      applySrNativeTurn(
        draft,
        {
          module: "serramenti",
          operations: [
            operation(draft.serramenti[0].id, "serramento", { quantity: 3 }),
          ],
        },
        catalogue,
        resolve,
      ),
    ).rejects.toThrow(/accessori/);
    expect(draft.serramenti[0].quantita).toBe(2);
  });
});

describe("Fotovoltaico: componenti, manodopera, servizi e modello originale", () => {
  const catalogue: FvNativeCatalogue = {
    pannelli: [
      {
        id: "panel",
        descrizione: "Pannello DEMO 500 W",
        potenza_w: 500,
        prezzo_vendita: 150,
        prezzo_acquisto: 70,
      },
    ],
    inverter: [
      {
        id: "inv",
        descrizione: "Inverter DEMO",
        prezzo_vendita: 900,
        prezzo_acquisto: 500,
      },
    ],
    accumuli: [
      {
        id: "battery",
        descrizione: "Batteria DEMO",
        capacita_kwh: 10,
        prezzo_vendita: 3000,
      },
    ],
    kits: [],
    products: [
      {
        id: "wallbox",
        nome: "Wallbox DEMO",
        prezzo: 700,
        prezzo_acquisto: 400,
      },
    ],
    labour: [
      {
        id: "hours",
        nome: "Posa FV",
        prezzo_vendita: 45,
        prezzo_costo: 30,
        unita: "h",
      },
    ],
    services: [
      {
        id: "gse",
        nome: "Pratica DEMO",
        tipo: "pratica_gse",
        prezzo_vendita: 250,
        prezzo_netto: 100,
      },
    ],
  };
  const base = () => ({
    ...structuredClone(INITIAL),
    pannello_id: "panel",
    inverter_id: "inv",
    numero_pannelli_scelti: 12,
    potenza_kwp: 6,
    iva_aliquota: 0.1,
    cliente_nome: "Cliente sintetico",
  });
  const proposal: NativeTurn = {
    module: "fotovoltaico",
    operations: [
      operation("configurazione", "configurazione", {
        panelCount: 12,
        batteryId: "battery",
        withBattery: true,
        withWallbox: true,
      }),
      operation("charger", "prodotto", { catalogueId: "wallbox", quantity: 1 }),
      operation("installation", "manodopera", {
        catalogueId: "hours",
        quantity: 8,
      }),
      operation("practice", "servizio", { catalogueId: "gse", quantity: 1 }),
    ],
  };
  it("matches the local save payload and native preview total before and after re-opening", () => {
    const source = base();
    const draft = applyFvNativeTurn(source, proposal, catalogue);
    const payload = fvConfigurationPayload(draft, catalogue, {
      ...identity,
      updatedAt: "2026-10-24T08:00:00Z",
    });
    const net =
      payload.p_components.reduce(
        (n, r) => n + r.quantita * r.prezzo_unitario_vendita,
        0,
      ) +
      payload.p_labour.reduce(
        (n, r) => n + r.ore * r.tariffa_oraria_vendita,
        0,
      ) +
      payload.p_services.reduce((n, r) => n + r.quantita * r.prezzo_vendita, 0);
    expect(net).toBe(7010);
    const preview = fvConversationPreview(
      draft,
      catalogue,
      {},
      "Azienda sintetica",
      [],
    );
    expect(preview.total).toBe(7711);
    expect(preview.html).toContain("Cliente sintetico");
    const reopened = JSON.parse(JSON.stringify(draft));
    expect(
      fvConversationPreview(reopened, catalogue, {}, "Azienda sintetica", [])
        .total,
    ).toBe(preview.total);
    expect(
      fvConfigurationPayload(reopened, catalogue, {
        ...identity,
        updatedAt: "2026-10-24T08:00:00Z",
      }),
    ).toEqual(payload);
    expect(source.con_accumulo).toBe(false);
  });
  it("removes a declined battery without removing unrelated extras or changing VAT", () => {
    const draft = applyFvNativeTurn(base(), proposal, catalogue);
    const next = applyFvNativeTurn(
      draft,
      {
        module: "fotovoltaico",
        operations: [
          operation("configurazione", "configurazione", { withBattery: false }),
        ],
      },
      catalogue,
    );
    expect(next.accumulo_id).toBeNull();
    expect(next.capacita_accumulo_kwh).toBe(0);
    expect(next.prodotti_extra).toEqual(draft.prodotti_extra);
    expect(next.iva_aliquota).toBe(0.1);
    expect(
      fvConversationPreview(next, catalogue, {}, "Azienda sintetica", []).total,
    ).toBe(4411);
  });
});

it("classic mixed-VAT quote keeps both fiscal rates and original template", () => {
  const base: QuoteDraft = {
    selectedTemplateId: "chosen-template",
    clientName: "Cliente sintetico",
    items: [
      {
        client_temp_id: "goods",
        name: "Fornitura DEMO",
        description: "Fornitura",
        quantity: 1,
        unit_price: 1000,
        unit_of_measure: "cad",
        vat_rate: 22,
        discount_percent: 0,
        item_type: "product",
        item_category: "prodotto",
        prezzo_acquisto: 500,
        mostra_nel_pdf: true,
        is_optional: false,
        sort_order: 0,
      },
      {
        client_temp_id: "work",
        name: "Posa DEMO",
        description: "Posa",
        quantity: 4,
        unit_price: 45,
        unit_of_measure: "h",
        vat_rate: 10,
        discount_percent: 0,
        item_type: "service",
        item_category: "posa",
        prezzo_acquisto: 30,
        mostra_nel_pdf: true,
        is_optional: false,
        sort_order: 1,
      },
    ],
  };
  const seed = classicChatDocument(base);
  const draft = patchChatLine(seed, "work", { quantity: 8 });
  const result = reconcileClassicWizardDraft(base, seed, draft, 22);
  expect(result.items.map((r) => r.vat_rate)).toEqual([22, 10]);
  expect(wizardAiCommercial(draft, base, 22).taxTotal).toMatchObject({
    net: 1360,
    gross: 1616,
  });
  expect(base.selectedTemplateId).toBe("chosen-template");
});
