import { describe, expect, it } from "vitest";
import { finestraSalamander, COLORI_STANDARD, COLORI_FUORI_STANDARD, idColore } from "../fixtures/finestraSalamander";
import { cambiaLato, leggiColori, scriviLato, snapshotColori, stessoColore, testiColori } from "@/lib/serramenti/coloriDentroFuori";
import { CHIAVE_CATALOGO_COLORI, catalogoColoriSchema, catalogoVuoto, chiaveColore, coloreDisponibile, elencoColori, guidaPrezzoColori, leggiCatalogoColori, rimappaCatalogoColori, testiColoriCatalogo, valoriPerLato, verificaColori } from "@/lib/serramenti/catalogoColori";
import { configDaFamiglia, disegnoDaConfig } from "@/lib/serramenti/disegnoDaFamiglia";
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";
import { calcolaCostoPosizione, applyMaggiorazioniAssi } from "@/lib/serramenti/pricing";

const family = finestraSalamander("colori", { prezzo_base_acquisto: 300 });
const asse = family.axes[0];
const ids = idColore("colori");
const interno = chiaveColore(ids.bianco, null);
const esterno = chiaveColore(ids.standard, COLORI_STANDARD[0]);
const dueColori = cambiaLato(stessoColore(ids.bianco, null), "esterno", ids.standard, COLORI_STANDARD[0]);
const catalogo = () => ({ ...catalogoVuoto(), modalita: "combinazioni" as const,
  combinazioni: [{ interno, esterno, fasciaId: ids.unLato }],
  campioni: [interno, esterno].map(chiave => ({ chiave, codice: "", finitura: "", hex: "", lati: ["interno", "esterno"] as ("interno" | "esterno")[], attivo: true, confermato: true })),
});

describe("catalogo colori della famiglia", () => {
  it("duplicare il prodotto rimappa tutti i riferimenti senza alterare l'originale", () => {
    const c = catalogo();
    const copia = rimappaCatalogoColori(c, new Map([[ids.bianco, "b2"], [ids.standard, "s2"], [ids.unLato, "u2"]]));
    expect(copia.combinazioni[0]).toEqual({ interno: chiaveColore("b2", null), esterno: chiaveColore("s2", COLORI_STANDARD[0]), fasciaId: "u2" });
    expect(copia.campioni[0].chiave).toBe(chiaveColore("b2", null));
    expect(c.combinazioni[0].fasciaId).toBe(ids.unLato);
    expect(() => rimappaCatalogoColori(c, new Map())).toThrow(/variante/);
  });
  it("congela codice, finitura e campione del documento senza dipendere da modifiche future", () => {
    const c = catalogo();
    c.campioni[1] = { ...c.campioni[1], codice: "NOCE21", finitura: "Spazzolato", hex: "#705432" };
    const f = { ...family, custom_field_values: { [CHIAVE_CATALOGO_COLORI]: c } };
    const testi = testiColoriCatalogo(asse, dueColori, c);
    const selections = { colore: ids.unLato, ...snapshotColori(dueColori, testi) };
    expect(leggiColori(asse, { valori_assi: selections, colore_esterno: testi.esterno })).toEqual(dueColori);
    const config = configDaFamiglia(f, selections);
    expect(config?.coloreEsterno).toContain("cod. NOCE21 · Spazzolato");
    expect(config?.coloreEsternoHex).toBe("#705432");
    const disegno = disegnoDaConfig(config!, 1000, 1000);
    c.campioni[1].hex = "#ffffff";
    expect(disegnoDaConfig(config!, 1000, 1000)).toEqual(disegno);
  });
  it("legge un catalogo versionato senza assumere disponibilità universali", () => {
    expect(leggiCatalogoColori({ altro: true })).toBeNull();
    expect(leggiCatalogoColori({ [CHIAVE_CATALOGO_COLORI]: catalogo() })).toEqual(catalogo());
    expect(leggiCatalogoColori({ [CHIAVE_CATALOGO_COLORI]: { versione: 999 } })).toBeNull();
  });
  it("non confonde lo stesso colore in due fasce", () => {
    expect(chiaveColore(ids.standard, COLORI_STANDARD[0])).not.toBe(chiaveColore(ids.unLato, COLORI_STANDARD[0]));
    expect(new Set(elencoColori(asse).map(v => v.chiave)).size).toBe(elencoColori(asse).length);
  });
  it("rifiuta combinazioni doppie e codici HEX non validi", () => {
    const c = catalogo();
    expect(catalogoColoriSchema.safeParse({ ...c, combinazioni: [...c.combinazioni, ...c.combinazioni] }).success).toBe(false);
    expect(catalogoColoriSchema.safeParse({ ...c, campioni: [{ chiave: interno, codice: "", finitura: "", hex: "red", lati: ["interno"], attivo: true, confermato: true }] }).success).toBe(false);
  });
  it("mantiene la regola legacy della fascia più cara", () => {
    expect(guidaPrezzoColori(asse, dueColori, null, id => id === ids.standard ? 110 : 100)?.valueId).toBe(ids.standard);
  });
  it("applica la fascia della combinazione, non la somma né il massimo dei lati", () => {
    expect(guidaPrezzoColori(asse, dueColori, catalogo(), () => 999)?.valueId).toBe(ids.unLato);
    expect(verificaColori(asse, dueColori, catalogo()).blocca).toBe(false);
  });
  it("la combinazione invertita non è autorizzata implicitamente", () => {
    expect(verificaColori(asse, { interno: dueColori.esterno, esterno: dueColori.interno }, catalogo()).blocca).toBe(true);
    expect(guidaPrezzoColori(asse, { interno: dueColori.esterno, esterno: dueColori.interno }, catalogo(), () => 100)).toBeNull();
  });
  it("una fascia prezzo disattivata non rende quotabile la combinazione", () => {
    const axis = { ...asse, values: asse.values.map(v => ({ ...v, attivo: v.id !== ids.unLato })) };
    expect(verificaColori(axis, dueColori, catalogo()).blocca).toBe(true);
  });
  it("filtra per lato e conserva le voci storiche come non disponibili", () => {
    const c = { ...catalogoVuoto(), campioni: [{ chiave: esterno, codice: "21", finitura: "Legno", hex: "", lati: ["esterno"] as ("interno" | "esterno")[], attivo: true, confermato: true }] };
    expect(coloreDisponibile(c, esterno, "interno")).toBe(false);
    expect(valoriPerLato(asse.values, c, "interno").find(v => v.id === ids.standard)?.opzioni).not.toContain(COLORI_STANDARD[0]);
    expect(verificaColori(asse, { interno: dueColori.esterno, esterno: dueColori.esterno }, c).blocca).toBe(true);
  });
  it("lo scritto a mano conserva la fascia ma segnala prezzo e disponibilità da verificare", () => {
    const colori = scriviLato(dueColori, "esterno", "RAL speciale", { valueId: ids.standard, voce: COLORI_STANDARD[0] });
    expect(colori.esterno.valueId).toBe(ids.standard);
    expect(verificaColori(asse, colori, null).avvisi.join(" ")).toContain("prezzo da verificare");
    expect(verificaColori(asse, colori, catalogo()).blocca).toBe(true);
  });
  it("una fascia con elenco ma senza colore è da scegliere", () => {
    expect(verificaColori(asse, stessoColore(ids.standard, null), null).avvisi).toHaveLength(2);
  });
  it("lo snapshot conserva i due ID anche quando il prezzo segue una terza fascia", () => {
    const testi = testiColori(asse, dueColori);
    const letto = leggiColori(asse, { valori_assi: { colore: ids.unLato, ...snapshotColori(dueColori) }, colore_interno: testi.interno, colore_esterno: testi.esterno });
    expect(letto).toEqual(dueColori);
  });
  it("un testo aggiornato da un editor legacy prevale sullo snapshot vecchio", () => {
    const letto = leggiColori(asse, { valori_assi: { colore: ids.standard, ...snapshotColori(dueColori) }, colore_esterno: "RAL fuori catalogo" });
    expect(letto.esterno.scritto).toBe("RAL fuori catalogo");
  });
  it("acquisto e vendita seguono le tariffe distinte della fascia bicolore", () => {
    const f = { ...family, custom_field_values: { [CHIAVE_CATALOGO_COLORI]: catalogo() }, axes: family.axes.map(a => ({ ...a, values: a.values.map(v => ({ ...v, maggiorazione_acquisto: v.id === ids.unLato ? 8 : 0 })) })) };
    const selections = { colore: ids.unLato, ...snapshotColori(dueColori) };
    const result = calcolaPrezzoFamiglia({ family: f, selections, larghezza_mm: 1000, altezza_mm: 1000, quantita: 2 });
    expect(result.totale_vendita).toBe(1344);
    expect(result.totale_acquisto).toBe(648);
    expect(applyMaggiorazioniAssi(1200, selections, f.axes, 1000, 1000, 2, "mq")).toBeCloseTo(1344, 2);
    expect(calcolaCostoPosizione({ family: f, selections, axes: f.axes, larghezza: 1000, altezza: 1000, quantita: 2 }).prodotto).toBe(648);
  });
  it("non certifica un prezzo o margine con una combinazione mancante", () => {
    const f = { ...family, custom_field_values: { [CHIAVE_CATALOGO_COLORI]: catalogo() } };
    const colori = cambiaLato(dueColori, "esterno", ids.fuori, COLORI_FUORI_STANDARD[0]);
    const selections = { colore: ids.fuori, ...snapshotColori(colori) };
    expect(calcolaPrezzoFamiglia({ family: f, selections, larghezza_mm: 1000, altezza_mm: 1000, quantita: 1 }).calcolo_disponibile).toBe(false);
    expect(calcolaCostoPosizione({ family: f, selections, axes: f.axes, larghezza: 1000, altezza: 1000, quantita: 1 }).prodotto).toBeNull();
  });
  it("rifiuta un catalogo malformato invece di ripiegare su un prezzo confermato", () => {
    const f = { ...family, custom_field_values: { [CHIAVE_CATALOGO_COLORI]: { versione: 99 } } };
    const r = calcolaPrezzoFamiglia({ family: f, selections: { colore: ids.bianco }, quantita: 1, larghezza_mm: 1000, altezza_mm: 1000 });
    expect(r.calcolo_disponibile).toBe(false);
    expect(r.warnings.join(" ")).toContain("non valido");
  });
});
