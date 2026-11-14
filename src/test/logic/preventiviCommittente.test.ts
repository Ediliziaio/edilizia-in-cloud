/**
 * Preventivi al committente (10/11/2026): collegamento e precompilazione, voci dal contratto col prezzo
 * modificabile, stati della scheda, rifiuto col motivo, scaduto da richiamare, lavoro extra dal preventivo.
 */
import { describe, expect, it } from "vitest";
import {
  bozzaLavoroExtra, clienteDaCollegare, daDecidere, datiClienteDaProfilo, datiRifiuto, etichettaRifiuto,
  numeroPreventivo, preventiviImportabili, preventivoDaRichiamare, righeDaContratto, sceltaIniziale, statoCommittente,
  type PreventivoCommittente, type TariffaContratto,
} from "@/lib/preventivi/preventiviCommittente";
import { costruisciCopiaQuote } from "@/lib/quotes/duplicaPreventivo";
import { emptyVariationDraft, prepareVariation } from "@/lib/orders/variationDraft";

const committente = {
  id: "k", first_name: "—", last_name: "—", business_name: "Edil Rossi S.r.l.", email: "k@no-email.ediliziaincloud.local",
  phone: "0212345678", address: "Via Roma 1", postal_code: "20100", city: "Milano", province: "MI", fiscal_code: null as string | null, vat_number: "00123456782",
};

describe("collegamento al committente e precompilazione", () => {
  it("intesta il preventivo all'impresa, senza «—» come nome e senza email segnaposto", () => {
    const d = datiClienteDaProfilo(committente);
    expect(d.clientName).toBe("Edil Rossi S.r.l.");
    expect(d.clientCompany).toBe("Edil Rossi S.r.l.");
    expect(d.clientEmail).toBe("");
    expect(d.clientVatNumber).toBe("00123456782");
    expect(d.clientAddress).toBe("Via Roma 1, 20100, Milano, MI");
  });

  it("col referente scritto, il preventivo va a lui e l'email vera resta", () => {
    const d = datiClienteDaProfilo({ ...committente, first_name: "Mario", last_name: "Bianchi", email: "ufficio@edilrossi.it" });
    expect(d.clientName).toBe("Mario Bianchi");
    expect(d.clientEmail).toBe("ufficio@edilrossi.it");
  });

  it("lega il preventivo nuovo al profilo arrivato dalla scheda; in modifica non tocca il legame", () => {
    expect(clienteDaCollegare(false, { id: "k" })).toEqual({ customer_id: "k" });
    expect(clienteDaCollegare(true, { id: "k" })).toEqual({});
    expect(clienteDaCollegare(false, null)).toEqual({});
  });

  it("copia e revisione restano del committente, ma non ereditano rifiuto e lavoro extra", () => {
    const copia = costruisciCopiaQuote(
      { id: "q", status: "rifiutata", customer_id: "k", refused_motivo: "prezzo", refused_reason: "troppo", variante_id: "v" },
      { comeRevisione: true, numeroRevisione: 1 },
    );
    expect(copia.customer_id).toBe("k");
    expect(copia).not.toHaveProperty("refused_motivo");
    expect(copia).not.toHaveProperty("variante_id");
    expect(copia.status).toBe("bozza");
    expect(copia.parent_quote_id).toBe("q");
  });
});

describe("voci dal contratto", () => {
  const giornata: TariffaContratto = {
    id: "t1", tipo: "manodopera", codice: "M1", descrizione: "Giornata uomo", unita_misura: "uomo_giorno",
    prezzo_unitario: 180, qualifica: "Specializzato", note: null, attivo: true,
  };
  const viaggio: TariffaContratto = { ...giornata, id: "t2", tipo: "trasporto", descrizione: "Viaggio", unita_misura: "viaggio", prezzo_unitario: 40, qualifica: null };
  const forfait: TariffaContratto = { ...giornata, id: "t3", tipo: "forfait", descrizione: "Allestimento", unita_misura: "corpo", prezzo_unitario: 500, qualifica: null };

  it("il prezzo proposto è quello del contratto", () => {
    expect(sceltaIniziale(giornata)).toMatchObject({ prezzo: 180, quantita: 1, nota: "" });
  });

  it("il prezzo scritto riga per riga vince su quello del contratto, la nota va nella descrizione", () => {
    const [r1, r2, r3] = righeDaContratto([
      { tariffa: giornata, quantita: 3, prezzo: 175.5, nota: "  sabato compreso " },
      { tariffa: viaggio, quantita: 2, prezzo: 40, nota: "" },
      { tariffa: forfait, quantita: 7, prezzo: 450, nota: "" },
    ], { iva: 22, ordine: 4 });
    expect(r1).toMatchObject({
      name: "Giornata uomo — Specializzato", description: "sabato compreso", quantity: 3, unit_price: 175.5,
      unit_of_measure: "uomo/giorno", item_category: "posa", item_type: "service", vat_rate: 22, sort_order: 4, tariffa_id: null,
    });
    expect(r2).toMatchObject({ item_category: "trasporto", unit_of_measure: "viaggio", sort_order: 5 });
    // A corpo la quantità è sempre 1.
    expect(r3).toMatchObject({ quantity: 1, unit_price: 450, unit_of_measure: "corpo" });
  });
});

const base: PreventivoCommittente = {
  id: "q1", quote_number: "PRV/2026/10", title: "Cappotto", total: 12200, status: "inviata", created_at: "2026-10-01T09:00:00Z",
  sent_at: "2026-10-01T09:00:00Z", expires_at: "2026-10-31", signed_at: null, revision_number: null, parent_quote_id: null,
  refused_motivo: null, refused_reason: null, variante_id: null, version: 3,
};

describe("elenco e stati", () => {
  it("mappa i sei stati del preventivo nei cinque della scheda", () => {
    const oggi = "2026-10-15";
    expect(statoCommittente({ ...base, status: "bozza" }, oggi)).toBe("bozza");
    expect(statoCommittente(base, oggi)).toBe("inviato");
    expect(statoCommittente({ ...base, status: "accettata" }, oggi)).toBe("accettato");
    expect(statoCommittente({ ...base, status: "convertita" }, oggi)).toBe("accettato");
    expect(statoCommittente({ ...base, status: "rifiutata" }, oggi)).toBe("rifiutato");
    expect(statoCommittente({ ...base, status: "scaduta" }, oggi)).toBe("scaduto");
    // Un inviato oltre la validità è scaduto anche se il cron non è ancora passato.
    expect(statoCommittente(base, "2026-11-10")).toBe("scaduto");
  });

  it("il numero dice la revisione", () => {
    expect(numeroPreventivo(base)).toBe("PRV/2026/10");
    expect(numeroPreventivo({ ...base, revision_number: 2 })).toBe("PRV/2026/10 · Rev. 2");
  });
});

describe("le due strade dell'accettato", () => {
  it("si sceglie solo per un accettato non ancora diventato commessa o lavoro extra", () => {
    expect(daDecidere({ status: "accettata", variante_id: null }, false)).toBe(true);
    expect(daDecidere({ status: "accettata", variante_id: null }, true)).toBe(false);
    expect(daDecidere({ status: "convertita", variante_id: "v" }, false)).toBe(false);
    expect(daDecidere({ status: "inviata", variante_id: null }, false)).toBe(false);
  });

  const testata = {
    quote_number: "PRV/2026/12", title: "Bagno secondo piano", description: null as string | null, signed_at: "2026-11-03T10:00:00Z",
    signed_by_name: "Mario Bianchi", subtotal: 900, discount_amount: 0, total: 1098, vat_amount: 198,
  };
  const righe = [
    { name: "Giornata uomo", description: "sabato", quantity: 4, unit_price: 180, unit_of_measure: "uomo/giorno", item_category: "posa", is_optional: false, discount_percent: 0 },
    { name: "Viaggio", description: null as string | null, quantity: 4, unit_price: 45, unit_of_measure: "viaggio", item_category: "trasporto", is_optional: false, discount_percent: 0 },
    { name: "Nota", description: null, quantity: 1, unit_price: 0, unit_of_measure: "", item_category: "nota", is_optional: false, discount_percent: 0 },
    { name: "Opzione", description: null, quantity: 1, unit_price: 999, unit_of_measure: "corpo", item_category: "posa", is_optional: true, discount_percent: 0 },
  ];

  it("lavoro extra: le voci passano una per una se fanno l'imponibile, e la bozza è valida", () => {
    const b = bozzaLavoroExtra(testata, righe, emptyVariationDraft());
    expect(b.pricing).toBe("voci");
    expect(b.lines).toHaveLength(2);
    expect(b.lines[0]).toMatchObject({ description: "Giornata uomo — sabato", quantity: "4", price: "180", unit: "uomo/giorno" });
    expect(b.title).toBe("Bagno secondo piano");
    expect(b.contractReference).toBe("Preventivo PRV/2026/12 accettato il 03/11/2026");
    expect(b.requester).toBe("Mario Bianchi");
    expect(b.destinazione).toBe("nuova");
    expect(prepareVariation(b).impatto_economico).toBe(900);
  });

  it("lavoro extra: con uno sconto l'importo è quello accettato, a corpo, con le voci nella descrizione", () => {
    const b = bozzaLavoroExtra({ ...testata, discount_amount: 100 }, righe, emptyVariationDraft());
    expect(b.pricing).toBe("corpo");
    expect(b.amount).toBe("800");
    expect(b.description).toContain("- Giornata uomo: 4 uomo/giorno");
    expect(prepareVariation(b).impatto_economico).toBe(800);
  });
});

describe("il rifiuto con motivo", () => {
  it("chiede il motivo, e il testo se è «altro»", () => {
    expect(() => datiRifiuto(null, "")).toThrow("Scegli il motivo");
    expect(() => datiRifiuto("altro", "  ")).toThrow("Scrivi il motivo");
    const adesso = new Date("2026-11-10T10:00:00Z");
    expect(datiRifiuto("prezzo", " troppo caro ", adesso)).toEqual({
      status: "rifiutata", refused_motivo: "prezzo", refused_reason: "troppo caro", refused_at: "2026-11-10T10:00:00.000Z",
    });
    expect(datiRifiuto("tempi", "", adesso).refused_reason).toBeNull();
  });

  it("nello storico si legge motivo e testo", () => {
    expect(etichettaRifiuto("prezzo", "troppo caro")).toBe("Prezzo · troppo caro");
    expect(etichettaRifiuto("tempi", null)).toBe("Tempi");
  });
});

describe("lo scaduto nel «Cosa fare adesso»", () => {
  it("propone da richiamare il preventivo scaduto più recente, con l'importo solo a chi può vederlo", () => {
    const lista = [
      { ...base, id: "a", expires_at: "2026-10-20", created_at: "2026-09-20T09:00:00Z" },
      { ...base, id: "b", status: "scaduta", expires_at: "2026-11-01", created_at: "2026-10-02T09:00:00Z", total: 5000 },
      { ...base, id: "c", status: "accettata", expires_at: "2026-10-01" },
    ];
    expect(preventivoDaRichiamare(lista, "2026-11-10", true)).toEqual({
      tipo: "preventivo", id: "b", numero: "PRV/2026/10", giorni: 9, totale: 5000, scadutoIl: "2026-11-01",
    });
    expect(preventivoDaRichiamare(lista, "2026-11-10", false)?.totale).toBeNull();
  });

  it("non richiama un preventivo già sostituito da una revisione, né se non c'è niente di scaduto", () => {
    const vecchio = { ...base, id: "a", status: "scaduta", expires_at: "2026-10-20" };
    const revisione = { ...base, id: "r", parent_quote_id: "a", revision_number: 1, status: "bozza", created_at: "2026-11-02T09:00:00Z" };
    expect(preventivoDaRichiamare([vecchio, revisione], "2026-11-10", true)).toBeNull();
    expect(preventivoDaRichiamare([base], "2026-10-15", true)).toBeNull();
  });
});

describe("preventiviImportabili (14/11/2026)", () => {
  const q = (id: string, status: string, variante_id: string | null = null) => ({ id, status, variante_id });
  it("solo accettati, mai diventati lavoro extra né commessa", () => {
    const lista = [q("a", "accettata"), q("b", "accettata", "var-1"), q("c", "convertita", "var-2"), q("d", "accettata"), q("e", "inviata")];
    expect(preventiviImportabili(lista, ["d", null]).map((x) => x.id)).toEqual(["a"]);
  });
  it("senza commesse collegate restano tutti gli accettati liberi", () => {
    expect(preventiviImportabili([q("a", "accettata"), q("d", "accettata")], []).map((x) => x.id)).toEqual(["a", "d"]);
  });
});

describe("bozzaLavoroExtra: voci con id valido (14/11/2026)", () => {
  it("ogni voce ha un uuid, come chiede variante-commessa", async () => {
    const { isVariationUuid } = await import("@/lib/orders/variationWorkspace");
    const bozza = bozzaLavoroExtra(
      { quote_number: "P/1", title: "T", description: null, signed_at: null, signed_by_name: null, subtotal: 300, discount_amount: 0, total: 366, vat_amount: 66 },
      [
        { name: "A", description: null, quantity: 1, unit_price: 100, unit_of_measure: "corpo", item_category: "posa", is_optional: false, discount_percent: 0 },
        { name: "B", description: null, quantity: 2, unit_price: 100, unit_of_measure: "mq", item_category: "posa", is_optional: false, discount_percent: 0 },
      ],
      emptyVariationDraft(),
    );
    expect(bozza.pricing).toBe("voci");
    expect(bozza.lines).toHaveLength(2);
    expect(bozza.lines.every((l) => isVariationUuid(l.id))).toBe(true);
  });
});
