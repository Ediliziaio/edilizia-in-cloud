import { describe, expect, it } from "vitest";
import { calcolaContoTermico, euro, anniTesto, type ContoTermicoEconomia } from "@/lib/contoTermico/calcoli";
import { numeroRate } from "@/lib/contoTermico/regole";
import { DATI_CONTO_TERMICO_INIZIALI, economiaContoTermico, leggiDatiContoTermico } from "@/lib/contoTermico/dati";
import { DATI_CONTO_TERMICO_DIMOSTRATIVI } from "@/lib/contoTermico/anteprima";
import { datiPdfContoTermico, eContoTermico, fotoDelPreventivo, MODELLO_CONTO_TERMICO } from "@/lib/contoTermico/pdfDelPreventivo";
import { buildIdrModulePreview, createFullIdrTemplate } from "@/lib/moduli-vendita/fullIdrModules";
import type { IdrPdfEnriched } from "@/hooks/useTermoidraulicoPDF";
import type { IdrTemplatePdf } from "@/types/termoidraulico";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const base: ContoTermicoEconomia = {
  prezzoIvaInclusa: 12900,
  ivaPct: 10,
  contributo: 4800,
  modalita: "sconto_in_fattura",
  potenzaKw: 8,
  spesaAnnuaAttuale: 2100,
  spesaAnnuaNuova: 1000,
  aumentoEnergiaPct: 0,
  anni: 15,
  detrazionePct: 50,
};

describe("Conto Termico: i conti del preventivo", () => {
  it("sconto in fattura: il cliente paga subito solo quello che resta", () => {
    const r = calcolaContoTermico(base);
    expect(r.restaATe).toBe(8100);
    expect(r.pagaOggi).toBe(8100);
    expect(r.coperturaPct).toBe(37);
    expect(r.imponibile).toBeCloseTo(11727.27, 2);
    expect(r.imponibile + r.iva).toBeCloseTo(12900, 2);
    // Il contributo è già nel prezzo: negli anni arrivano solo i risparmi.
    expect(r.anniBeneficio.slice(1).every((a) => a.contributo === 0)).toBe(true);
    expect(r.anniBeneficio[0].cumulato).toBe(-8100);
    // 1.100 € l'anno, energia ferma: 8.100 / 1.100 = 7,36 anni.
    expect(r.anniDiRientro).toBe(7.4);
    expect(r.risparmiTotali).toBe(16500);
    expect(r.beneficioFinale).toBe(16500 - 8100);
  });

  it("rimborso: il cliente anticipa tutto e il contributo arriva dopo", () => {
    const r = calcolaContoTermico({ ...base, modalita: "rimborso" });
    expect(r.pagaOggi).toBe(12900);
    expect(r.restaATe).toBe(8100);
    expect(r.rate).toEqual([{ numero: 1, anno: 1, importo: 4800 }]);
    expect(r.anniBeneficio[1].contributo).toBe(4800);
    // Stesso punto d'arrivo dello sconto in fattura: cambia solo quando arrivano i soldi.
    expect(r.beneficioFinale).toBe(calcolaContoTermico(base).beneficioFinale);
  });

  it("le rate seguono il GSE: una fino a 15.000 €, poi 2 annualità o 5 sopra i 35 kW", () => {
    expect(numeroRate(0, 8)).toBe(0);
    expect(numeroRate(15000, 8)).toBe(1);
    expect(numeroRate(15000.01, 8)).toBe(2);
    expect(numeroRate(20000, null)).toBe(2);
    expect(numeroRate(20000, 35)).toBe(2);
    expect(numeroRate(20000, 36)).toBe(5);
    const r = calcolaContoTermico({ ...base, prezzoIvaInclusa: 60000, contributo: 20000.01, potenzaKw: 50, modalita: "rimborso" });
    expect(r.rate).toHaveLength(5);
    expect(r.rate.reduce((s, x) => s + x.importo, 0)).toBeCloseTo(20000.01, 2);
  });

  it("un contributo scritto più alto del prezzo non fa guadagnare il cliente sulla carta", () => {
    const r = calcolaContoTermico({ ...base, contributo: 50000 });
    expect(r.contributo).toBe(12900);
    expect(r.restaATe).toBe(0);
    expect(r.coperturaPct).toBe(100);
    expect(r.anniDiRientro).toBe(0);
  });

  it("senza risparmio la spesa non rientra, e lo dice", () => {
    const r = calcolaContoTermico({ ...base, spesaAnnuaAttuale: 0, spesaAnnuaNuova: 0 });
    expect(r.risparmioAnnuo).toBe(0);
    expect(r.anniDiRientro).toBeNull();
  });

  it("il confronto con la detrazione usa il massimale di 96.000 € in 10 anni", () => {
    expect(calcolaContoTermico(base).detrazione).toEqual({ pct: 50, totale: 6450, perAnno: 645 });
    expect(calcolaContoTermico({ ...base, prezzoIvaInclusa: 120000 }).detrazione?.totale).toBe(48000);
    expect(calcolaContoTermico({ ...base, detrazionePct: null }).detrazione).toBeNull();
  });

  it("euro e anni si scrivono all'italiana, col trattino al posto del meno", () => {
    expect(euro(4800)).toBe("4.800 €");
    expect(euro(-8100)).toBe("-8.100 €");
    expect(euro(91.67, 2)).toBe("91,67 €");
    expect(anniTesto(1)).toBe("1 anno");
    expect(anniTesto(7.4)).toBe("7,4 anni");
  });
});

describe("Conto Termico: i dati salvati sul preventivo", () => {
  it("un preventivo senza dati parte dai valori iniziali", () => {
    expect(leggiDatiContoTermico(null)).toEqual(DATI_CONTO_TERMICO_INIZIALI);
    expect(leggiDatiContoTermico("rotto")).toEqual(DATI_CONTO_TERMICO_INIZIALI);
  });

  it("ripulisce quello che arriva dal database", () => {
    const d = leggiDatiContoTermico({
      tipo: "inventato", titolo: "  ", contributo: "4800,5", potenza_kw: "0", anni: 99, aumento_energia_pct: -3,
      modalita: "boh", detrazione_confronto: null, spesa_annua_attuale: -10,
      caratteristiche: [{ etichetta: "SCOP", valore: "4,6" }, { etichetta: "vuota", valore: "" }, null],
    });
    expect(d.tipo).toBe("pompa_calore");
    expect(d.titolo).toBe("Pompa di calore aria-acqua");
    expect(leggiDatiContoTermico({ tipo: "solare_termico" }).titolo).toBe("Solare termico");
    expect(d.contributo).toBe(4800.5);
    expect(d.potenza_kw).toBeNull();
    expect(d.anni).toBe(30);
    expect(d.aumento_energia_pct).toBe(0);
    expect(d.modalita).toBe("sconto_in_fattura");
    expect(d.detrazione_confronto).toBeNull();
    expect(d.spesa_annua_attuale).toBe(0);
    expect(d.caratteristiche).toEqual([{ etichetta: "SCOP", valore: "4,6" }]);
  });

  it("dal preventivo ai numeri dei conti", () => {
    const e = economiaContoTermico(DATI_CONTO_TERMICO_DIMOSTRATIVI, 13750, 10);
    expect(e).toMatchObject({ prezzoIvaInclusa: 13750, ivaPct: 10, contributo: 4800, potenzaKw: 8, detrazionePct: 50, modalita: "sconto_in_fattura" });
  });
});

describe("Conto Termico: il modello nel preventivatore Termoidraulico", () => {
  const template = createFullIdrTemplate({ id: "online", company_id: "demo", ragione_sociale: "Azienda", default_detrazione_pct: 50 } as IdrTemplatePdf, "conto-termico");

  it("si riconosce dal modello congelato e dal modello di libreria", () => {
    const preview = buildIdrModulePreview("demo", template, "conto-termico");
    expect(eContoTermico(preview)).toBe(true);
    expect(eContoTermico({ progetto: { ...preview.progetto, modello_snapshot: { modelId: MODELLO_CONTO_TERMICO } } as never, template: {} as IdrTemplatePdf })).toBe(true);
    const caldaia = createFullIdrTemplate({ id: "online", company_id: "demo" } as IdrTemplatePdf, "caldaia");
    expect(eContoTermico(buildIdrModulePreview("demo", caldaia, "caldaia"))).toBe(false);
  });

  it("l'anteprima della libreria ha numeri d'esempio, non un contributo di 0 €", () => {
    const preview = buildIdrModulePreview("demo", template, "conto-termico");
    expect(preview.progetto.iva_pct).toBe(10);
    expect(leggiDatiContoTermico(preview.progetto.conto_termico).contributo).toBe(4800);
    expect(template.default_detrazione_pct).toBe(0);
  });

  it("i dati del PDF vengono dal preventivo: cliente, voci, prezzo finale e testi del modello", () => {
    const preview = buildIdrModulePreview("demo", template, "conto-termico");
    const enriched = {
      ...preview,
      progetto: { ...preview.progetto, cliente_nome: "Anna", cliente_cognome: "Bianchi", cantiere_indirizzo: "Via Verdi 3", cantiere_cap: "20100", cantiere_citta: "Milano", cantiere_provincia: "MI" },
      company: { ragione_sociale: "Impresa Demo", colore_marca: "#0f766e", website: "https://impresa.it" },
      capitoli: [{ nome: "Sistema", voci: preview.computo, subtotale: 12500, costo: 0 }],
      totali: { totale: 13750, ivaPct: 10 },
      images: {},
    } as unknown as IdrPdfEnriched;
    const d = datiPdfContoTermico(enriched, fotoDelPreventivo("pompa_calore"));
    expect(d.cliente).toEqual({ nome: "Anna Bianchi", indirizzo: "Via Verdi 3, 20100 Milano (MI)" });
    expect(d.azienda).toMatchObject({ nome: "Impresa Demo", sito: "impresa.it" });
    expect(d.colorePrimario).toBe("#0f766e");
    expect(d.economia).toMatchObject({ prezzoIvaInclusa: 13750, ivaPct: 10, contributo: 4800 });
    expect(d.intervento.voci).toHaveLength(3);
    expect(d.testi.faq).toHaveLength(8);
    expect(d.testi.passaggi).toHaveLength(4);
    expect(d.foto.domani).toContain("pompa-calore");
    // Le pagine di ogni preventivo: gli stessi dati del documento degli altri interventi.
    expect(d.standard?.capitoli.map((c) => c.nome)).toEqual(["Sistema"]);
    expect(d.standard?.modello.usp[0]?.titolo).toBe("Il contributo, messo in chiaro");
    expect(d.standard?.modello.garanzie.map((g) => g.titolo)).toContain("Garanzia del produttore");
    // I modelli nascono senza condizioni: le accende l'azienda nell'editor.
    expect(d.standard?.modello.condizioniLegali).toEqual([]);
  });

  it("il modello Conto Termico ha garanzie e «perché sceglierci» scritti per lui", () => {
    const testi = [...(template.usp ?? []), ...(template.garanzie ?? [])].map((x) => `${x.titolo} ${x.descrizione}`).join(" ");
    // Composti dai testi degli altri modelli uscivano frasi fuori posto.
    expect(testi).not.toContain("Compatibilità prima dell'ordine");
    expect(template.garanzie).toHaveLength(4);
    expect(template.usp).toHaveLength(3);
  });

  it("per solare termico e biomassa la scheda «domani» resta senza una foto sbagliata", () => {
    expect(fotoDelPreventivo("solare_termico").domani).toBeUndefined();
    expect(fotoDelPreventivo("biomassa").domani).toBeUndefined();
  });
});

describe("Conto Termico: il documento si genera anche da solo", () => {
  it("nel browser prepara Buffer prima delle foto e non spezza le parole", () => {
    // Il documento degli altri preventivi lo fa al caricamento; il Conto Termico
    // si genera senza caricarlo, e senza Buffer le foto perdevano la chiave di cache.
    // Lo fa il tema del racconto, che il documento importa.
    const tema = readFileSync(resolve("src/components/preventivi/pdf/racconto/temaRacconto.ts"), "utf8");
    expect(tema).toContain('import { ensurePdfBufferCompatibility } from "@/lib/pdf/ensurePdfBufferCompatibility"');
    expect(tema).toContain("\nensurePdfBufferCompatibility();");
    expect(tema).toContain("Font.registerHyphenationCallback((word) => [word]);");
    const documento = readFileSync(resolve("src/components/termoidraulico/contoTermico/ContoTermicoPDF.tsx"), "utf8");
    expect(documento).toContain('from "@/components/preventivi/pdf/racconto/temaRacconto"');
  });
});
