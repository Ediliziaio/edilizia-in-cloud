/// <reference types="node" />
/**
 * Preventivo generico e creazione rapida dall'opportunità: i gestori veri
 * (05/10/2026), presi dal sorgente ed eseguiti con servizi finti, come in
 * quoteSaveHandlers.test.ts. Così si prova il codice della pagina senza
 * montare l'editor.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { calcolaPrezzoFamiglia, type GridPoint } from "@/hooks/useFamilyPricing";
import { calcolaTotaliPreventivo, ivaVoceNuova, normalizzaRigaSconto } from "@/hooks/usePreventivoCosti";
import { costoArticolo, unitaTariffa } from "@/lib/listino/costoTariffa";
import { quantitaInizialeTariffa } from "@/lib/listino/tariffaAlKm";
import { conAssiVisibili } from "@/lib/serramenti/assiCondizionati";
import { quoteWriteVersion } from "@/lib/preventivi/quoteWriteVersion";
import { esitoUpdateConGuardia, isConflittoModifica } from "@/lib/concorrenza";
import { assertSavedQuoteAmounts } from "@/lib/preventivi/quoteSaveValidation";
import type { ArticleTemplateData } from "@/components/orders/ArticleCombobox";

const BUILDER = "src/pages/azienda/marketing/QuoteBuilder.tsx";
const OPPORTUNITA = "src/components/opportunities/OpportunityQuotesTab.tsx";

/** Carica nel contesto i gestori nominati, nell'ordine dato: quelli dopo possono usare quelli prima. */
function gestoriVeri(file: string, nomi: string[], contesto: Record<string, unknown>) {
  const sorgente = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const trovati = new Map<string, ts.Expression>();
  const visita = (nodo: ts.Node) => {
    if (ts.isVariableDeclaration(nodo) && nodo.initializer && nomi.includes(nodo.name.getText(sorgente))) {
      trovati.set(nodo.name.getText(sorgente), nodo.initializer);
    }
    ts.forEachChild(nodo, visita);
  };
  visita(sorgente);
  vm.createContext(contesto);
  for (const nome of nomi) {
    const inizializzatore = trovati.get(nome);
    if (!inizializzatore) throw new Error(`Gestore mancante: ${nome}`);
    const codice = ts.transpileModule(`globalThis[${JSON.stringify(nome)}] = ${inizializzatore.getText(sorgente)}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInContext(codice, contesto);
  }
  return contesto as Record<string, (...args: unknown[]) => unknown>;
}

type Riga = Record<string, unknown> & { vat_rate: number; unit_price: number; prezzo_acquisto: number; item_category: string };

const prodotto = (extra: Record<string, unknown> = {}) => ({
  item_type: "product", item_category: "prodotto", name: "Prodotto", description: "", quantity: 1, unit_price: 100,
  discount_percent: 0, vat_rate: 22, unit_of_measure: "pz", sort_order: 0, prezzo_acquisto: 60, mostra_nel_pdf: true, is_optional: false,
  ...extra,
});
const tariffaPosa = { id: "tar-posa", nome: "Posa finestra", tipo: "posa", prezzo_vendita: 90, prezzo_costo: 40, costo_interno: 40, unita: "pz" };
const tariffaTrasporto = { id: "tar-tra", nome: "Trasporto", tipo: "trasporto", prezzo_vendita: 120, prezzo_costo: 70, costo_interno: 70, unita: "a_corpo" };
const tariffaSmaltimento = { id: "tar-sma", nome: "Smaltimento", tipo: "smaltimento", prezzo_vendita: 50, prezzo_costo: 20, costo_interno: 20, unita: "pz" };
const tariffaKm = { id: "tar-km", nome: "Trasporto al km", tipo: "trasporto", prezzo_vendita: 0.8, prezzo_costo: 0.5, costo_interno: 0.5, unita: "km" };
const calcolaTariffaAutomatica = (t: typeof tariffaPosa, qty: number) => ({
  prezzo_vendita: t.prezzo_vendita * qty,
  prezzo_acquisto: t.costo_interno * qty,
});

describe("Righe generate dall'AI: famiglie e voci di servizio", () => {
  // Famiglia a griglia «acquisto + ricarico», al 10%: la finestra del cliente.
  const famiglia = {
    id: "fam-1", nome: "Finestra PVC", modalita_prezzo_base: "griglia", prezzo_base_mode: "acquisto_markup",
    prezzo_base_vendita: 0, prezzo_base_acquisto: 0, markup_tipo: "percentuale", markup_valore: 100,
    sconto_fornitore_1: 50, sconto_fornitore_2: 0, vat_rate: 10, axes: [] as unknown[],
  };
  const griglia: GridPoint[] = [
    { valore_x: 1000, valore_y: 1200, prezzo_vendita: 400, prezzo_acquisto_netto: 300 },
    { valore_x: 1500, valore_y: 1500, prezzo_vendita: 600, prezzo_acquisto_netto: 450 },
  ];
  const riga = (extra: Record<string, unknown>) => ({
    item_category: "prodotto", nome: "", descrizione: "", quantita: 1, unita_misura: "pz",
    article_template_id: null as string | null, tariffa_id: null as string | null,
    misure_x_mm: null as number | null, misure_y_mm: null as number | null, ...extra,
  });

  function preparaAi(items: unknown[], kmCantiere = 0) {
    let aggiunte: Riga[] = [];
    const toast = { warning: vi.fn() };
    const caricaGriglieFamiglie = vi.fn(async () => ({ "fam-1": griglia }));
    const g = gestoriVeri(BUILDER, ["ivaPredefinita", "aggiungiSezione"], {
      console, items, prezzoManualeIvaPct: null, ivaVoceNuova, calcolaPrezzoFamiglia, caricaGriglieFamiglie,
      articleFamilies: [famiglia], articoli: [], calcolaPrezzoProdotto: vi.fn(),
      tariffe: [tariffaPosa, tariffaTrasporto, tariffaKm], calcolaTariffaAutomatica, unitaTariffa, quantitaInizialeTariffa,
      conAssiVisibili, pianoInstallazione: 0, kmCantiere,
      setItems: (fn: (prev: Riga[]) => Riga[]) => { aggiunte = fn([]); }, toast,
    });
    return { aggiungi: (righe: unknown[]) => g.aggiungiSezione("Serramenti", righe) as Promise<void>, righe: () => aggiunte, toast, caricaGriglieFamiglie };
  }

  it("la famiglia porta la sua IVA e il costo del listino (netto degli sconti fornitore), la sua posa la stessa IVA", async () => {
    // Il preventivo ha già due prodotti al 22%: prima la finestra prendeva il 22% e costo 0.
    const ai = preparaAi([prodotto(), prodotto()]);
    await ai.aggiungi([
      riga({ nome: "Finestra PVC", quantita: 2, family_id: "fam-1", axis_selections: {}, misure_x_mm: 1200, misure_y_mm: 1300, unit_price: 350 }),
      riga({ item_category: "posa", nome: "Posa", quantita: 2, tariffa_id: "tar-posa", is_posa_di: "Finestra PVC" }),
      riga({ item_category: "trasporto", nome: "Trasporto", tariffa_id: "tar-tra" }),
    ]);
    const atteso = calcolaPrezzoFamiglia(
      { family: famiglia as never, selections: {}, larghezza_mm: 1200, altezza_mm: 1300, quantita: 2 },
      griglia,
    );
    const [finestra, posa, trasporto] = ai.righe();
    expect(ai.caricaGriglieFamiglie).toHaveBeenCalledWith(["fam-1"]);
    expect(finestra).toMatchObject({ vat_rate: 10, family_id: "fam-1", article_template_id: null });
    expect(finestra.prezzo_acquisto).toBe(atteso.unit_price_acquisto);
    expect(finestra.prezzo_acquisto).toBeGreaterThan(0);
    // A griglia vale il calcolo del listino di oggi, non il prezzo mandato dall'AI.
    expect(finestra.unit_price).toBe(atteso.unit_price_vendita);
    expect(posa.vat_rate).toBe(10);
    expect(posa.prezzo_acquisto).toBe(40);
    // Il trasporto non è di nessun prodotto: l'IVA più usata tra i prodotti (22, 22, 10).
    expect(trasporto.vat_rate).toBe(22);
  });

  it("a preventivo vuoto anche le voci sciolte seguono i prodotti appena arrivati", async () => {
    const ai = preparaAi([]);
    await ai.aggiungi([
      riga({ nome: "Finestra PVC", family_id: "fam-1", axis_selections: {}, misure_x_mm: 1000, misure_y_mm: 1200 }),
      riga({ item_category: "trasporto", nome: "Trasporto", tariffa_id: "tar-tra" }),
    ]);
    expect(ai.righe().map((r) => r.vat_rate)).toEqual([10, 10]);
  });

  it("trasporto al km: l'unità è quella della tariffa, e senza km dall'AI vale la distanza del cantiere", async () => {
    const ai = preparaAi([], 30);
    await ai.aggiungi([
      riga({ item_category: "trasporto", nome: "Trasporto", tariffa_id: "tar-km", unita_misura: "cad" }),
      riga({ item_category: "trasporto", nome: "Trasporto A/R", tariffa_id: "tar-km", quantita: 60 }),
    ]);
    const [andata, andataRitorno] = ai.righe();
    expect(andata).toMatchObject({ quantity: 30, unit_of_measure: "km", unit_price: 0.8, prezzo_acquisto: 0.5 });
    // I km scritti dall'AI restano i suoi.
    expect(andataRitorno).toMatchObject({ quantity: 60, unit_of_measure: "km", unit_price: 0.8 });
  });

  it("misura oltre la griglia: niente prezzo di una finestra più piccola, e lo dice", async () => {
    const ai = preparaAi([]);
    await ai.aggiungi([riga({ nome: "Finestra PVC", family_id: "fam-1", axis_selections: {}, misure_x_mm: 2000, misure_y_mm: 2000, unit_price: 600 })]);
    expect(ai.righe()[0].unit_price).toBe(0);
    expect(ai.toast.warning).toHaveBeenCalledWith("Misura fuori listino, prezzo da scrivere: Finestra PVC");
  });
});

describe("Voci legate a un prodotto: stessa IVA del prodotto", () => {
  it("la posa automatica di un prodotto al 10% nasce al 10%, anche a preventivo vuoto", async () => {
    let righe: Riga[] = [];
    const g = gestoriVeri(BUILDER, ["addProductFromCatalog"], {
      items: [], impostazioni: { aggiungi_posa_automatica: true, chiedi_smaltimento: false },
      tariffe: [tariffaPosa], calcolaTariffaAutomatica, unitaTariffa, pianoInstallazione: 0, kmCantiere: 0,
      calcolaPrezzoProdotto: async (p: { prezzo_vendita: number; prezzo_acquisto_netto: number }, qty: number) => ({
        prezzo_vendita: p.prezzo_vendita * qty, prezzo_acquisto: p.prezzo_acquisto_netto * qty,
      }),
      setItems: (nuove: Riga[]) => { righe = nuove; }, setSmaltimentoAsk: vi.fn(), setSearchOpen: vi.fn(),
    });
    await g.addProductFromCatalog({
      id: "art-1", name: "Finestra", prezzo_vendita: 500, prezzo_acquisto_netto: 300, vat_rate: 10, unit_of_measure: "pz",
      modalita_prezzo: "pz", ha_montaggio: true, montaggio_tipo: "separato", montaggio_tariffa_id: "tar-posa",
    }, 2);
    expect(righe.map((r) => [r.item_category, r.vat_rate])).toEqual([["prodotto", 10], ["posa", 10]]);
  });

  it("lo smaltimento chiesto dopo un prodotto prende l'IVA di quel prodotto, non della maggioranza", () => {
    const items = [prodotto(), prodotto(), prodotto({ vat_rate: 10 })];
    let righe: Riga[] = [];
    const g = gestoriVeri(BUILDER, ["ivaPredefinita", "ivaDelProdotto", "prezziRigaTariffa", "addSmaltimento"], {
      items, prezzoManualeIvaPct: null, ivaVoceNuova, tariffe: [tariffaSmaltimento], calcolaTariffaAutomatica, unitaTariffa,
      quantitaInizialeTariffa, toast: { info: vi.fn() }, pianoInstallazione: 0, kmCantiere: 0, setSmaltimentoAsk: vi.fn(),
      setItems: (fn: (prev: Riga[]) => Riga[]) => { righe = fn(items as Riga[]); },
    });
    g.addSmaltimento(2);
    expect(righe.at(-1)).toMatchObject({ item_category: "smaltimento", vat_rate: 10 });
    // Una tariffa sciolta invece segue i prodotti: due al 22%, uno al 10%.
    expect(g.ivaPredefinita()).toBe(22);
  });
});

describe("Tariffa al km: la quantità sono i km", () => {
  function prepara(kmCantiere: number) {
    let righe: Riga[] = [];
    const toast = { info: vi.fn() };
    const g = gestoriVeri(BUILDER, ["ivaPredefinita", "prezziRigaTariffa", "addTariffa"], {
      items: [], prezzoManualeIvaPct: null, ivaVoceNuova, calcolaTariffaAutomatica, unitaTariffa, quantitaInizialeTariffa,
      toast, pianoInstallazione: 0, kmCantiere,
      setItems: (fn: (prev: Riga[]) => Riga[]) => { righe = fn([]); },
    });
    return { aggiungi: (t: unknown) => g.addTariffa(t, "trasporto"), righe: () => righe, toast };
  }

  it("con la distanza del cantiere la riga nasce «45 km × 0,80 €», non «1 × 36 €»", () => {
    const p = prepara(45);
    p.aggiungi(tariffaKm);
    expect(p.righe()[0]).toMatchObject({ quantity: 45, unit_price: 0.8, prezzo_acquisto: 0.5, unit_of_measure: "km", tariffa_id: "tar-km" });
    expect(p.toast.info).not.toHaveBeenCalled();
  });

  it("senza distanza nasce a 1 km e lo dice, invece di andare a 0 € in silenzio", () => {
    const p = prepara(0);
    p.aggiungi(tariffaKm);
    expect(p.righe()[0]).toMatchObject({ quantity: 1, unit_price: 0.8 });
    expect(p.toast.info).toHaveBeenCalledTimes(1);
    expect(String(p.toast.info.mock.calls[0][0])).toContain("al km");
  });

  it("le altre tariffe nascono a 1 come prima, senza avvisi", () => {
    const p = prepara(45);
    p.aggiungi(tariffaTrasporto);
    expect(p.righe()[0]).toMatchObject({ quantity: 1, unit_price: 120, prezzo_acquisto: 70 });
    expect(p.toast.info).not.toHaveBeenCalled();
  });
});

describe("Salvataggio: riga di sconto in negativo, margine vuoto se mancano costi", () => {
  function salva(items: Riga[]) {
    const totaliPro = calcolaTotaliPreventivo(items as never, 0, 0);
    const subtotal = totaliPro.subtotale;
    const discountAmt = Math.round((subtotal - totaliPro.subtotale_netto) * 100) / 100;
    const total = totaliPro.totale;
    const vatAmount = Math.round((total - totaliPro.subtotale_netto) * 100) / 100;
    const scritto = { testata: null as Record<string, unknown> | null, righe: null as Array<Record<string, unknown>> | null };
    const supabase = {
      rpc: vi.fn(async (nome: string, args: { p_items: Array<Record<string, unknown>> }) => {
        if (nome === "save_quote_items_atomic") scritto.righe = args.p_items;
        return { data: { ok: true, updated_at: "v-righe" }, error: null };
      }),
      from(tabella: string) {
        let azione = "read";
        const q = {
          update(dati: Record<string, unknown>) { azione = "update"; if (tabella === "quotes") scritto.testata = dati; return q; },
          eq() { return q; }, select() { return q; }, single() { return q; },
          then(ok: (r: unknown) => unknown) {
            if (tabella === "quotes" && azione === "update") return Promise.resolve({ data: [{ updated_at: "v-testata" }], error: null }).then(ok);
            if (tabella === "quotes") {
              return Promise.resolve({ data: { subtotal, discount_amount: discountAmt, vat_amount: vatAmount, total, updated_at: "v-righe" }, error: null }).then(ok);
            }
            return Promise.resolve({ data: [], error: null }).then(ok);
          },
        };
        return q;
      },
    };
    const toast = { error: vi.fn(), success: vi.fn() };
    const contesto: Record<string, unknown> = {
      Error, console, JSON, companyId: "company-a", user: { id: "user-a" }, id: "quote-a", isEdit: true,
      existingQuote: { status: "bozza" }, existingItemsLoaded: true, existingAttachmentsLoaded: true,
      partialQuoteId: null, pendingEditNavId: null, paymentPhases: [], paymentPlanError: (): string | null => null,
      persistLocalDraft: () => {}, saveInFlightRef: { current: false }, versioneCaricataRef: { current: "v0" },
      setSaving: () => {}, setAutosaveFailed: () => {}, setLastSavedHash: () => {}, draftSerialized: "bozza",
      setPartialQuoteId: () => {}, setPendingEditNavId: () => {}, newQuoteCompletedRef: { current: false },
      searchParams: new URLSearchParams(), items, selectedMaterials: [], bonusLines: [], totaliPro,
      subtotal, discountAmt, vatAmount, total, financingProposal: null, validityDays: 30, discountPercent: 0,
      normalizzaRigaSconto, clearQuoteDraft: () => {}, assertSavedQuoteAmounts, quoteWriteVersion, esitoUpdateConGuardia,
      isConflittoModifica, queryClient: { invalidateQueries: () => {} },
      queryKeys: { quotes: { all: [], detail: (): string[] => [], items: (): string[] => [] } }, navigate: () => {}, toast, supabase,
    };
    for (const k of ["contactId", "clientName", "clientEmail", "clientPhone", "clientCompany", "clientAddress", "clientFiscalCode", "clientVatNumber", "title", "description", "notes", "internalNotes", "paymentMethod", "prezzoManuale", "prezzoManualeIvaPct", "effectiveSelectedTemplateId", "tipoLavoro", "indirizzoLavori", "pianoInstallazione", "kmCantiere", "salespersonId", "sedeId", "renderUrl", "renderSessionId", "pdfFirma", "layoutOverride", "pdfPrezziRiga", "pdfSoloTotale", "pdfSconti", "pdfImmagini", "pdfSchedeTecniche", "pdfMisure", "pdfAttributi", "pdfNoteCliente", "pdfCondizioni", "pdfWatermarkText", "pdfCopiaDestinatario"]) contesto[k] = null;
    const g = gestoriVeri(BUILDER, ["handleSave"], contesto);
    return { esegui: () => g.handleSave() as Promise<void>, scritto, toast, totale: total };
  }

  it("una riga di sconto scritta in positivo parte in negativo, e il totale è quello dello schermo", async () => {
    const s = salva([prodotto({ unit_price: 1000, prezzo_acquisto: 600 }) as Riga, prodotto({ item_category: "sconto", item_type: "service", unit_price: 100, prezzo_acquisto: 0 }) as Riga]);
    await s.esegui();
    expect(s.toast.success).toHaveBeenCalledWith("Preventivo aggiornato");
    expect(s.scritto.righe?.[1]).toMatchObject({ item_category: "sconto", unit_price: -100, discount_percent: 0 });
    expect(s.scritto.testata).toMatchObject({ subtotal: 900, total: 1098 });
    expect(s.scritto.testata?.margine_pct_snapshot).toBeCloseTo(33.33, 2);
    expect(s.scritto.testata?.totale_costo_interno).toBe(600);
  });

  it("un prodotto venduto senza costo: costo e margine non si salvano (niente 100%)", async () => {
    const s = salva([prodotto({ unit_price: 1000, prezzo_acquisto: 600 }) as Riga, prodotto({ unit_price: 500, prezzo_acquisto: 0 }) as Riga]);
    await s.esegui();
    expect(s.toast.success).toHaveBeenCalled();
    expect(s.scritto.testata).toMatchObject({
      margine_totale_percentuale: null, margine_pct_snapshot: null, totale_costo_interno: null, totale_overhead: null,
    });
  });
});

describe("Opportunità → preventivo rapido: prezzo, IVA e costo dell'articolo", () => {
  const vuota = { name: "", description: "", quantity: 1, unit_price: 0, discount_percent: 0, vat_rate: 22, unit_of_measure: "pz", article_template_id: null as string | null, prezzo_acquisto: 0 };
  const template: ArticleTemplateData = {
    id: "art-1", name: "Box doccia", sku: null, category: null, unit_price: 100, standard_cost: 0, unit_of_measure: "pz",
    vat_rate: 22, supplier_id: null, description: "Cristallo 8 mm", immagine_url: null, pdf_scheda_url: null,
  };

  function scegli(articoli: Array<Record<string, unknown>>, nome: string, tpl?: typeof template) {
    let righe: Array<Record<string, unknown>> = [];
    const g = gestoriVeri(OPPORTUNITA, ["handleArticleSelect"], {
      articoliPerId: new Map(articoli.map((a) => [a.id, a])), costoArticolo,
      setItems: (fn: (prev: unknown[]) => Array<Record<string, unknown>>) => { righe = fn([{ ...vuota, prezzo_acquisto: 33 }]); },
    });
    g.handleArticleSelect(0, nome, tpl);
    return righe[0];
  }

  it("usa le colonne di oggi: prezzo di vendita, IVA e costo netto dell'articolo", () => {
    const riga = scegli([{ id: "art-1", prezzo_vendita: 120, unit_price: 100, prezzo_acquisto_netto: 65, standard_cost: 0, vat_rate: 10 }], "Box doccia", template);
    expect(riga).toMatchObject({ unit_price: 120, vat_rate: 10, prezzo_acquisto: 65, article_template_id: "art-1" });
  });

  it("articoli non ancora caricati: i dati del selettore, costo compreso", () => {
    expect(scegli([], "Box doccia", { ...template, standard_cost: 50 })).toMatchObject({ unit_price: 100, prezzo_acquisto: 50 });
  });

  it("nome scritto a mano: il costo dell'articolo di prima non vale più", () => {
    expect(scegli([], "Box su misura")).toMatchObject({ name: "Box su misura", article_template_id: null, prezzo_acquisto: 0 });
  });

  it("il costo arriva nelle righe salvate", async () => {
    const righe: Array<Record<string, unknown>> = [];
    const supabase = {
      rpc: async () => ({ data: "OFF-2026-001", error: null as unknown }),
      from(tabella: string) {
        let dati: unknown = null;
        const q = {
          insert(d: unknown) { dati = d; return q; }, select() { return q; }, single() { return q; },
          then(ok: (r: unknown) => unknown) {
            if (tabella === "quote_items") righe.push(...(dati as Array<Record<string, unknown>>));
            return Promise.resolve({ data: tabella === "quotes" ? { id: "q-1" } : null, error: null }).then(ok);
          },
        };
        return q;
      },
    };
    const g = gestoriVeri(OPPORTUNITA, ["handleSave"], {
      companyId: "az-1", user: { id: "u-1" }, contactId: "mc-1", opportunityId: "op-1", contact: { first_name: "Mario", last_name: "Bianchi" },
      title: "Preventivo", notes: "", validityDays: 30, discountPercent: 0, selectedMaterials: [], materials: [],
      items: [{ ...vuota, name: "Box doccia", unit_price: 120, vat_rate: 10, article_template_id: "art-1", prezzo_acquisto: 65 }],
      supabase, allegaSchedeTecniche: async (): Promise<unknown[]> => [], avvisoSchedeNonAllegate: (): null => null,
      toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, resetForm: vi.fn(), navigate: vi.fn(),
      routePrefix: "/azienda/marketing", setSaving: () => {}, queryClient: { invalidateQueries: () => {} },
    });
    await g.handleSave();
    expect(righe).toEqual([expect.objectContaining({ unit_price: 120, vat_rate: 10, prezzo_acquisto: 65 })]);
  });

  it("una riga nuova prende l'IVA delle righe già scritte", () => {
    expect(ivaVoceNuova([{ vat_rate: 10 }, { vat_rate: 10 }, { vat_rate: 22 }])).toBe(10);
  });
});
