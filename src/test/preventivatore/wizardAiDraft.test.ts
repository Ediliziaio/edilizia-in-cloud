import { describe, expect, it } from "vitest";
import {
  computoChatDocument,
  reconcileComputoDraft,
  cloneWizardDraft,
  type NativeComputoRow,
} from "@/lib/preventivi/wizardAiDraft";
import {
  classicChatDocument,
  reconcileClassicWizardDraft,
} from "@/lib/preventivi/classicWizardAiDraft";
import {
  emptyChatDocument,
  patchChatLine,
  type ChatDocument,
} from "@/lib/preventivi/quoteChatDocument";
import type { QuoteDraft } from "@/lib/preventivi/quoteDraft";
const identity = { companyId: "demo", projectId: "project" };
const row: NativeComputoRow = {
  id: "existing",
  company_id: "demo",
  progetto_id: "project",
  capitolo_nome: "Impianti",
  descrizione: "Impianto bagno",
  descrizione_estesa: "Impianto bagno con collettore",
  unita_misura: "cad",
  quantita: 2,
  prezzo_unitario: 150,
  costo_materiali: 31,
  costo_manodopera: 25,
  sconto_pct: 10,
  importo: 270,
  margine_eur: 158,
  margine_pct: 58,
  listino_voce_id: "listino",
  famiglia_id: "famiglia",
  immagine_url: "/bath.jpg",
  ambiente: "Bagno",
  fonte: "Fonte originale",
  ordine: 0,
};
const seed = () => computoChatDocument([row], "Bagno completo");
const newDocument = (): ChatDocument => {
  const line = cloneWizardDraft(seed().lines[0]);
  return {
    ...emptyChatDocument(),
    lines: [
      {
        ...line,
        id: "new",
        title: "Demolizione pavimento",
        description: "Rimozione pavimento",
        unit: "m²",
        quantity: 12,
        price: 18,
        manual: true,
        reference: null,
      },
    ],
  };
};
describe("native computo isolated AI reconciliation", () => {
  it("keeps the original object graph unchanged on open and unchanged apply", () => {
    const original = cloneWizardDraft(row),
      doc = seed();
    doc.lines[0].original.title = "changed evidence";
    expect(row).toEqual(original);
    const unchanged = seed();
    const result = reconcileComputoDraft([row], unchanged, unchanged, identity);
    expect(result.rows).toEqual([row]);
    expect(result.rows[0]).not.toBe(row);
    expect(result.changes).toEqual([]);
  });
  it("preserves cost, identity, photo, catalogue, discount, room and source on price edits", () => {
    const doc = seed(),
      next = patchChatLine(doc, "existing", { price: 175 });
    const result = reconcileComputoDraft([row], doc, next, identity);
    expect(result.rows[0]).toMatchObject({
      ...row,
      prezzo_unitario: 175,
      importo: 0,
      margine_eur: 0,
      margine_pct: 0,
    });
    expect(result.changes[0].kind).toBe("modifica");
    expect(row.prezzo_unitario).toBe(150);
  });
  it("does not rewrite long native text because the AI protocol uses excerpts", () => {
    const long = {
      ...row,
      descrizione: "A".repeat(500),
      descrizione_estesa: "B".repeat(9000),
    };
    const doc = computoChatDocument([long], "Long");
    expect(
      reconcileComputoDraft(
        [long],
        doc,
        patchChatLine(doc, "existing", { price: 175 }),
        identity,
      ).rows[0],
    ).toMatchObject({
      descrizione: long.descrizione,
      descrizione_estesa: long.descrizione_estesa,
    });
  });
  it("preserves the complete native description when only renaming a long row", () => {
    const long = {
      ...row,
      descrizione_estesa: "Specifiche complete ".repeat(500),
    };
    const doc = computoChatDocument([long], "Bagno");
    const result = reconcileComputoDraft(
      [long],
      doc,
      patchChatLine(doc, "existing", { title: "Collettore bagno principale" }),
      identity,
    );
    expect(result.rows[0].descrizione).toBe("Collettore bagno principale");
    expect(result.rows[0].descrizione_estesa).toBe(long.descrizione_estesa);
  });
  it("imports only complete explicitly included new rows into chosen chapters", () => {
    const draft = newDocument();
    const result = reconcileComputoDraft(
      [],
      emptyChatDocument(),
      draft,
      identity,
      { new: "Demolizioni" },
    );
    expect(result.rows[0]).toMatchObject({
      id: "new",
      unita_misura: "mq",
      capitolo_nome: "Demolizioni",
      quantita: 12,
      prezzo_unitario: 18,
    });
    draft.lines[0].price = null;
    draft.lines[0].included = false;
    expect(
      reconcileComputoDraft([], emptyChatDocument(), draft, identity),
    ).toMatchObject({ rows: [], pending: 1 });
  });
  it.each(["m³", "litri", "set", "giorni"])(
    "rejects unsupported unit %s instead of silently coercing it",
    (unit) => {
      const draft = newDocument();
      draft.lines[0].unit = unit;
      expect(() =>
        reconcileComputoDraft([], emptyChatDocument(), draft, identity),
      ).toThrow("Unità");
    },
  );
  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, -5, 0])(
    "rejects unconfirmed or invalid price %s",
    (price) => {
      const draft = newDocument();
      draft.lines[0].price = price;
      expect(() =>
        reconcileComputoDraft([], emptyChatDocument(), draft, identity),
      ).toThrow();
    },
  );
  it("retains an untouched unfinished native row, never removes it as a new unpriced proposal", () => {
    const unfinished = { ...row, prezzo_unitario: 0 };
    const doc = computoChatDocument([unfinished], "Incomplete");
    expect(
      reconcileComputoDraft([unfinished], doc, doc, identity).rows,
    ).toEqual([unfinished]);
  });
  it("lists a deliberate exclusion and never silently drops a missing original row", () => {
    const doc = seed();
    const result = reconcileComputoDraft(
      [row],
      doc,
      patchChatLine(doc, "existing", { included: false }),
      identity,
    );
    expect(result.rows).toEqual([]);
    expect(result.changes[0].kind).toBe("esclusione");
    expect(() =>
      reconcileComputoDraft([row], doc, emptyChatDocument(), identity),
    ).toThrow("originale manca");
  });
  it("does not delete an existing row when clearing its price makes the chat exclude it", () => {
    const doc = seed(),
      next = patchChatLine(doc, "existing", { price: null });
    expect(() => reconcileComputoDraft([row], doc, next, identity)).toThrow(
      "incompleta",
    );
  });
  it("blocks cross-company and cross-project rows", () => {
    expect(() =>
      reconcileComputoDraft([row], seed(), seed(), {
        ...identity,
        companyId: "other",
      }),
    ).toThrow("azienda");
    expect(() =>
      reconcileComputoDraft([row], seed(), seed(), {
        ...identity,
        projectId: "other",
      }),
    ).toThrow("preventivo");
  });
  it("rejects duplicate identities atomically", () => {
    const draft = newDocument();
    draft.lines.push(cloneWizardDraft(draft.lines[0]));
    expect(() =>
      reconcileComputoDraft([], emptyChatDocument(), draft, identity),
    ).toThrow("duplicate");
  });
  it("blocks a unit change that would reinterpret existing internal costs or catalogue links", () => {
    const doc = seed(),
      next = patchChatLine(doc, "existing", { unit: "mq" });
    next.lines[0] = {
      ...next.lines[0],
      quantity: 2,
      price: 175,
      included: true,
    };
    expect(() => reconcileComputoDraft([row], doc, next, identity)).toThrow(
      "costi",
    );
  });
  it("does not reinterpret repeated existing native rows from separate rooms", () => {
    const rows = [
      row,
      { ...row, id: "other-room", ambiente: "Cucina", ordine: 1 },
    ];
    const doc = computoChatDocument(rows, "Due ambienti");
    expect(reconcileComputoDraft(rows, doc, doc, identity).rows).toEqual(rows);
    expect(
      reconcileComputoDraft(
        rows,
        doc,
        patchChatLine(doc, "existing", { price: 175 }),
        identity,
      ).rows[1].ambiente,
    ).toBe("Cucina");
  });
  it("rejects new duplicate work but accepts an explicitly excluded alternative", () => {
    const doc = newDocument();
    doc.lines.push({ ...cloneWizardDraft(doc.lines[0]), id: "alternative" });
    expect(() =>
      reconcileComputoDraft([], emptyChatDocument(), doc, identity),
    ).toThrow("doppioni");
    doc.lines[1].included = false;
    expect(
      reconcileComputoDraft([], emptyChatDocument(), doc, identity).rows,
    ).toHaveLength(1);
  });
  it("keeps row ordering stable when native orders contain gaps and AI adds rows", () => {
    const rows = [{ ...row, ordine: 40 }],
      doc = computoChatDocument(rows, "Ordine");
    const next = { ...doc, lines: [...doc.lines, ...newDocument().lines] };
    expect(
      reconcileComputoDraft(rows, doc, next, identity).rows.map(
        (row) => row.ordine,
      ),
    ).toEqual([0, 1]);
    expect(rows[0].ordine).toBe(40);
  });
});

describe("classic wizard preserves native data and structural rows", () => {
  const base: QuoteDraft = {
    title: "Offerta",
    selectedTemplateId: "template",
    indirizzoLavori: "Cantiere",
    clientAddress: "Fatturazione",
    notes: "Esclusioni",
    items: [
      {
        client_temp_id: "existing",
        id: "saved-row",
        item_type: "product",
        item_category: "prodotto",
        name: "Impianto bagno",
        description: "Impianto bagno con collettore",
        quantity: 2,
        unit_of_measure: "cad",
        unit_price: 150,
        vat_rate: 10,
        discount_percent: 10,
        prezzo_acquisto: 56,
        image_url: "/original.jpg",
        article_template_id: "product",
        mostra_nel_pdf: true,
        is_optional: false,
        sort_order: 0,
      },
      {
        client_temp_id: "note",
        item_type: "service",
        item_category: "nota",
        name: "Nota",
        description: "Non eliminare",
        quantity: 0,
        unit_of_measure: "",
        unit_price: 0,
        vat_rate: 22,
        discount_percent: 0,
        prezzo_acquisto: 0,
        mostra_nel_pdf: true,
        is_optional: false,
        sort_order: 1,
      },
    ],
  };
  it("keeps saved IDs, products, mixed VAT, costs, images and notes after a price change", () => {
    const doc = classicChatDocument(base);
    const draft = patchChatLine(doc, "existing", { price: 175 });
    const result = reconcileClassicWizardDraft(base, doc, draft, 22);
    expect(result.items[0]).toEqual({ ...base.items![0], unit_price: 175 });
    expect(result.items[1]).toEqual(base.items![1]);
    expect(base.items![0].unit_price).toBe(150);
  });
  it("keeps exclusions as optional lines, not lost product configurations", () => {
    const doc = classicChatDocument(base);
    const result = reconcileClassicWizardDraft(
      base,
      doc,
      patchChatLine(doc, "existing", { included: false }),
      22,
    );
    expect(result.items[0]).toEqual({ ...base.items![0], is_optional: true });
    expect(result.changes[0].kind).toBe("esclusione");
  });
  it("does not silently turn a cleared price into an optional excluded native product", () => {
    const doc = classicChatDocument(base),
      next = patchChatLine(doc, "existing", { price: null });
    expect(() => reconcileClassicWizardDraft(base, doc, next, 22)).toThrow(
      "incompleta",
    );
  });
  it("new rows use the wizard VAT and never overwrite the chosen template or client", () => {
    const doc = classicChatDocument(base);
    const next = { ...doc, lines: [...doc.lines, ...newDocument().lines] };
    const result = reconcileClassicWizardDraft(base, doc, next, 10);
    expect(result.items.at(-1)).toMatchObject({
      name: "Demolizione pavimento",
      vat_rate: 10,
    });
    expect(base).toMatchObject({
      selectedTemplateId: "template",
      clientAddress: "Fatturazione",
      indirizzoLavori: "Cantiere",
    });
  });
  it("does not truncate native descriptions when editing only a price", () => {
    const native = {
      ...base,
      items: [
        {
          ...base.items![0],
          name: "N".repeat(400),
          description: "D".repeat(8000),
        },
      ],
    };
    const doc = classicChatDocument(native);
    const result = reconcileClassicWizardDraft(
      native,
      doc,
      patchChatLine(doc, "existing", { price: 175 }),
      22,
    );
    expect(result.items[0]).toMatchObject({
      name: native.items[0].name,
      description: native.items[0].description,
      unit_price: 175,
    });
  });
  it("blocks a parent-only quantity or exclusion change with an included linked installation", () => {
    const native: QuoteDraft = {
      ...base,
      items: [
        base.items![0],
        {
          ...base.items![0],
          client_temp_id: "installation",
          id: "saved-install",
          parent_temp_id: "existing",
          item_type: "service",
          item_category: "posa",
          name: "Posa infissi",
          description: "Installazione",
          quantity: 4,
        },
      ],
    };
    const doc = classicChatDocument(native);
    expect(() =>
      reconcileClassicWizardDraft(
        native,
        doc,
        patchChatLine(doc, "existing", { quantity: 3 }),
        22,
      ),
    ).toThrow("posa collegata");
    expect(() =>
      reconcileClassicWizardDraft(
        native,
        doc,
        patchChatLine(doc, "existing", { included: false }),
        22,
      ),
    ).toThrow("posa collegata");
  });
});
