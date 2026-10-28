import { beforeEach, describe, expect, it } from "vitest";
import { bozzaVuota, calcolaVoce, chiaveBozzaComputo, leggiBozzaComputo, misuraVuota, numeroEditor, quantitaMisura, salvaBozzaComputo, voceVuota, vociDaBozza, vociPerAnteprima } from "@/lib/computo/editorNativo";
import { controllaTotali } from "@/lib/computo/computoStrutturato";

const voce = () => ({ ...voceVuota(), descrizione: "Intonaco", prezzo: "12,35", quantita: "10" });
describe("editor nativo del computo", () => {
  it("l'anteprima live mostra le righe incomplete senza inventare importi", () => {
    const b = { ...bozzaVuota(), voci: [voce(), voceVuota()] };
    const preview = vociPerAnteprima(b);
    expect(preview.incomplete).toBe(1); expect(preview.voci).toHaveLength(2);
    expect(preview.voci[1].importo_computo).toBeNull();
    expect(b.voci).toHaveLength(2); expect(() => vociDaBozza(b)).toThrow();
    expect(vociPerAnteprima(bozzaVuota())).toEqual({ voci: [], incomplete: 0 });
  });
  beforeEach(() => localStorage.clear());
  it("accetta decimali italiani e punto decimale senza interpretare separatori ambigui", () => {
    expect(numeroEditor("1,25")).toBe(1.25); expect(numeroEditor("1.25")).toBe(1.25);
    for (const s of ["", "abc", "1.000,20", "1e5", "Infinity", "--1"]) expect(numeroEditor(s)).toBeNull();
  });
  it("non scambia la quantità mancante per zero, ma permette prezzo zero", () => {
    expect(calcolaVoce({ ...voce(), quantita: "" }).errori.length).toBeGreaterThan(0);
    expect(calcolaVoce({ ...voce(), prezzo: "0" })).toMatchObject({ errori: [], importo: 0 });
    expect(calcolaVoce({ ...voce(), prezzo: "-1" }).errori.length).toBeGreaterThan(0);
  });
  it("permette un computo senza prezzi, ma richiede il prezzo per l'estimativo", () => {
    const b = { ...bozzaVuota(), voci: [{ ...voce(), prezzo: "" }] };
    expect(() => vociDaBozza(b)).toThrow(/prezzo/);
    expect(vociDaBozza(b, true)[0]).toMatchObject({ quantita: 10, prezzo_unitario_computo: null, importo_computo: null });
  });
  it("somma dimensioni e detrazioni senza cambiare il prezzo", () => {
    const v = { ...voce(), misure: [
      { ...misuraVuota(), parti: "2", lunghezza: "4", altezza: "2,7" },
      { ...misuraVuota(), parti: "-1", lunghezza: "1", altezza: "2" },
    ] };
    expect(calcolaVoce(v)).toMatchObject({ quantita: 19.6, importo: 242.06, errori: [] });
  });
  it("zero dimensionale resta zero e i fattori vuoti non diventano zero", () => {
    expect(quantitaMisura({ ...misuraVuota(), lunghezza: "4", larghezza: "0" })).toBe(0);
    expect(quantitaMisura({ ...misuraVuota(), lunghezza: "4" })).toBe(4);
    expect(quantitaMisura(misuraVuota())).toBeNull();
  });
  it("la formula sicura ha precedenza sulle dimensioni", () => {
    expect(quantitaMisura({ ...misuraVuota(), lunghezza: "99", formula: "(4+3)*2,7-2" })).toBe(16.9);
    for (const formula of ["1/0", "alert(1)", "4+", "process.exit()"])
      expect(quantitaMisura({ ...misuraVuota(), formula })).toBeNull();
  });
  it("formule patologiche e dimensioni fuori limite non bloccano l'editor", () => {
    expect(quantitaMisura({ ...misuraVuota(), formula: "(".repeat(1000) + "1" + ")".repeat(1000) })).toBeNull();
    expect(quantitaMisura({ ...misuraVuota(), lunghezza: "1000000000000", larghezza: "1000000000000" })).toBeNull();
  });
  it("blocca l'export se una misura è incompleta anche se esiste quantità manuale", () => {
    expect(() => vociDaBozza({ ...bozzaVuota(), voci: [{ ...voce(), misure: [misuraVuota()] }] })).toThrow(/Voce 1/);
  });
  it("converte la detrazione in segno negativo senza doppia negazione", () => {
    for (const quantita of ["5", "-5"])
      expect(calcolaVoce({ ...voce(), detrazione: true, quantita })).toMatchObject({ quantita: -5, importo: -61.75 });
    const [v] = vociDaBozza({ ...bozzaVuota(), voci: [{ ...voce(), detrazione: true, misure: [{ ...misuraVuota(), formula: "2*5" }] }] });
    expect(v.quantita).toBe(-10); expect(v.misure[0].formula).toBe("-(2*5)"); expect(v.misure[0].quantita).toBe(-10);
    const controllo = controllaTotali({ totale_dichiarato: null, riepiloghi: [], voci: [{
      numero_ordine: "1", codici: [], codice_tariffa: "", descrizione: v.descrizione_breve, descrizione_troncata: false,
      unita_misura: "mq", quantita: v.quantita, prezzo_unitario: v.prezzo_unitario_computo, importo: v.importo_computo,
      sezione: null, super_categoria: null, categoria: null, sotto_categoria: null,
      is_sicurezza: false, is_detrazione: true, a_corpo: false, misure: v.misure.map(m => ({ ...m, descrizione: m.descrizione ?? "" })), pagina: null, avvisi: [],
    }] });
    expect(controllo.voci.filter(c => c.tipo === "formula" || c.tipo === "misure")).toHaveLength(0);
  });
  it("conserva capitoli, descrizioni integrali, unità composte e flag", () => {
    const v = { ...voce(), descrizione: "Testo integrale ".repeat(500), unita: "mc/50m", corpo: true, sicurezza: true, categoria: "Posa", sottocategoria: "Piano 1" };
    const [r] = vociDaBozza({ ...bozzaVuota(), voci: [v] });
    expect(r.descrizione_estesa).toBe(v.descrizione.trim()); expect(r.unita_misura).toBe("mc/50m");
    expect(r).toMatchObject({ a_corpo: true, is_sicurezza: true, categoria: "Posa", sotto_categoria: "Piano 1" });
  });
  it("salva e rilegge anche una bozza ancora incompleta", () => {
    const b = { ...bozzaVuota(), voci: [voceVuota()] };
    const raw = salvaBozzaComputo(localStorage, "test", b, null);
    expect(leggiBozzaComputo(raw)).toEqual(b);
  });
  it("rifiuta dati corrotti e versioni sconosciute", () => {
    for (const raw of ["null", "{}", "no json", '{"versione":2}']) expect(() => leggiBozzaComputo(raw)).toThrow();
  });
  it("apre le bozze precedenti senza perdere voci quando mancano i nuovi campi commerciali", () => {
    const old = { versione: 1, titolo: "Computo precedente", committente: "Cliente", oggetto: "Lavori", voci: [voce()] };
    expect(leggiBozzaComputo(JSON.stringify(old))).toMatchObject({ ...old, numero: "", indirizzo: "", condizioni: "" });
  });
  it("isola la chiave per azienda, utente e commessa", () => {
    const base = chiaveBozzaComputo("a", "u", "o");
    expect(new Set([base, chiaveBozzaComputo("b", "u", "o"), chiaveBozzaComputo("a", "v", "o"), chiaveBozzaComputo("a", "u", "p")]).size).toBe(4);
  });
  it("non sovrascrive una versione salvata da un'altra scheda", () => {
    localStorage.setItem("test", "altra versione");
    expect(() => salvaBozzaComputo(localStorage, "test", bozzaVuota(), null)).toThrow(/altra scheda/);
    expect(localStorage.getItem("test")).toBe("altra versione");
  });
});
