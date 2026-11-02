import { describe, expect, it } from "vitest";
import { applicaParti, caricoRapportini, erroriGiorni, giorniDaPeriodo, giornoVuoto } from "@/lib/campo/rapportiniUfficio";

/** Rapportini scritti dall'ufficio (31/10/2026): più giorni, fasi e sottofasi come dal cantiere. */
describe("rapportini dall'ufficio", () => {
  const oggi = "2026-10-31";

  it("un giorno nuovo è oggi; quello aggiunto dopo è il giorno successivo, mai nel futuro, con stessa persona e fasi", () => {
    const primo = { ...giornoVuoto(oggi, "a"), data: "2026-10-28", autore: "u1", fasi: ["f1"] };
    expect(giornoVuoto(oggi, "b", primo)).toMatchObject({ data: "2026-10-29", autore: "u1", fasi: ["f1"], descrizione: "" });
    expect(giornoVuoto(oggi, "c", { ...primo, data: oggi }).data).toBe(oggi);
  });

  it("dice cosa manca: data, descrizione, futuro, doppioni della stessa persona", () => {
    const g = (data: string, descrizione: string, autore = "") => ({ ...giornoVuoto(oggi, data + autore), data, descrizione, autore });
    expect(erroriGiorni([g("2026-10-30", "ok")], oggi)).toEqual([]);
    expect(erroriGiorni([g("2026-11-02", ""), g("2026-10-30", "x"), g("2026-10-30", "y")], oggi)).toEqual([
      "La data non può essere nel futuro (giorno 1).", "Scrivi cosa si è fatto (giorno 1).", "Due rapportini della stessa persona lo stesso giorno (giorno 3).",
    ]);
  });

  it("il carico ha le fasi come il rapportino del cantiere: sottofasi finite e lavorate, percentuale di anteprima", () => {
    const giorno = { ...giornoVuoto(oggi, "a"), data: "2026-10-30", descrizione: " Tracce ", fasi: ["f1", "f2"], sottofasi: { s1: "finita" as const, s2: "lavorata" as const } };
    const sottofasi = new Map([["f1", [{ id: "s1", peso: 1, fatta: false }, { id: "s2", peso: 1, fatta: false }]]]);
    expect(caricoRapportini([giorno], [{ id: "f1", percentuale: 0 }, { id: "f2", percentuale: 40 }], sottofasi)).toEqual([{
      data_lavoro: "2026-10-30", autore: null, descrizione: "Tracce", note: null,
      fasi_lavorate: [
        { phase_id: "f1", percentuale: 50, sottofasi_fatte: ["s1"], sottofasi_lavorate: ["s2"] },
        { phase_id: "f2", percentuale: 40 },
      ],
      presenze: [], mezzi_usati: [], materiali_usati: [], foto_urls: [], meteo: null,
    }]);
  });

  it("completo come in cantiere: chi ha lavorato con le ore, mezzi, materiali, foto, meteo, avanzamento", () => {
    const giorno = {
      ...giornoVuoto(oggi, "a"), data: "2026-10-30", descrizione: "Getto", fasi: ["f2"], percentuali: { f2: 70 },
      presenze: { "e:1": "7,5", "s:9": "8" }, mezzi: { m1: "3", m2: "" }, materiali: { i1: "2,5" },
      foto: ["https://x/campo-rapportini/c/o/a.jpg"], meteo: "pioggia",
    };
    const [r] = caricoRapportini([giorno], [{ id: "f2", percentuale: 40 }], new Map(), {
      persone: [{ chiave: "e:1", nome: "Mario Rossi", employee_id: "1" }, { chiave: "s:9", nome: "Edil Savoca", subappaltatore_id: "9" }],
      mezzi: [{ id: "m1", nome: "Betoniera" }, { id: "m2", nome: "Furgone" }],
      materiali: [{ id: "i1", nome: "Cemento", unita: "q" }],
    });
    expect(r.fasi_lavorate).toEqual([{ phase_id: "f2", percentuale: 70 }]);
    expect(r.presenze).toEqual([{ employee_id: "1", nome: "Mario Rossi", ore: 7.5 }, { subappaltatore_id: "9", nome: "Edil Savoca", ore: 8 }]);
    expect(r.mezzi_usati).toEqual([{ mezzo_id: "m1", nome: "Betoniera", ore: 3 }, { mezzo_id: "m2", nome: "Furgone" }]);
    expect(r.materiali_usati).toEqual([{ nome: "Cemento", quantita: 2.5, unita: "q", order_item_id: "i1" }]);
    expect(r).toMatchObject({ foto_urls: ["https://x/campo-rapportini/c/o/a.jpg"], meteo: "pioggia" });
  });

  it("il giorno dopo ricopia chi c'era e i mezzi, non le foto; ore e quantità vanno controllate", () => {
    const primo = { ...giornoVuoto(oggi, "a"), data: "2026-10-28", descrizione: "x", presenze: { "e:1": "8" }, mezzi: { m1: "" }, foto: ["u"], meteo: "vento" };
    expect(giornoVuoto(oggi, "b", primo)).toMatchObject({ presenze: { "e:1": "8" }, mezzi: { m1: "" }, foto: [], meteo: "vento" });
    expect(erroriGiorni([{ ...primo, presenze: { "e:1": "25" } }], oggi)).toEqual(["Ore da 0 a 24 per ognuno."]);
    expect(erroriGiorni([{ ...primo, materiali: { i1: "0" } }], oggi)).toEqual(["Quantità dei materiali maggiore di zero."]);
  });
});

describe("più giorni insieme", () => {
  const oggi = "2026-10-31";
  it("un rapportino per giorno feriale, mai nel futuro, senza ripetere quelli già scritti", async () => {
    const { giorniDaPeriodo, giornoVuoto } = await import("@/lib/campo/rapportiniUfficio");
    const base = { ...giornoVuoto(oggi, "a"), descrizione: "Posa cartongesso", fasi: ["f1"], presenze: { "e:1": "8" }, foto: ["u"], materiali: { i1: "2" } };
    // 26/10 lunedì → 2/11 lunedì (oltre oggi): feriali fino al 30/10, il 28 c'è già.
    const giorni = giorniDaPeriodo(base, "2026-10-26", "2026-11-02", oggi, true, ["2026-10-28"]);
    expect(giorni.map((g) => g.data)).toEqual(["2026-10-26", "2026-10-27", "2026-10-29", "2026-10-30"]);
    expect(giorni[0]).toMatchObject({ descrizione: "Posa cartongesso", fasi: ["f1"], presenze: { "e:1": "8" }, foto: [], materiali: {} });
    expect(giorniDaPeriodo(base, "2026-10-24", "2026-10-25", oggi, false).map((g) => g.data)).toEqual(["2026-10-24", "2026-10-25"]);
    expect(giorniDaPeriodo(base, "2026-10-30", "2026-10-20", oggi, true)).toEqual([]);
  });
});

describe("campi propri dall'ufficio", () => {
  const campo = { chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", obbligatorio: true, chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "cliente" } as const;
  const giorno = { ...giornoVuoto("2026-10-30", "a"), descrizione: "Posa", campi: { pezzi: "12" } };

  it("il carico contiene etichetta, tipo e stampa dei campi", () => {
    const [c] = caricoRapportini([giorno], [], new Map(), { campi: [campo] });
    expect(c.campi_extra).toEqual([{ chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 12, stampa: "cliente" }]);
  });
  it("senza modello il carico non ha valori", () => {
    expect(caricoRapportini([giorno], [], new Map())[0]).not.toHaveProperty("campi_extra");
  });
  it("un obbligatorio vuoto si segnala con il giorno", () => {
    const vuoto = { ...giorno, campi: {} };
    expect(erroriGiorni([vuoto], "2026-10-30", [campo])).toEqual(["Compila Pezzi posati."]);
    expect(erroriGiorni([giorno, { ...vuoto, data: "2026-10-29" }], "2026-10-30", [campo])).toEqual(["Compila Pezzi posati (giorno 2)."]);
    expect(erroriGiorni([vuoto], "2026-10-30")).toEqual([]);
  });
  it("più giorni insieme non copiano i campi: sarebbero numeri doppi", () => {
    const fatti = giorniDaPeriodo(giorno, "2026-10-28", "2026-10-29", "2026-10-30", false, []);
    expect(fatti).toHaveLength(2);
    expect(fatti.every(g => Object.keys(g.campi ?? {}).length === 0)).toBe(true);
  });
  it("il giorno aggiunto dopo non copia i campi: sarebbero numeri doppi", () => {
    expect(giornoVuoto("2026-10-30", "b", giorno).campi).toBeUndefined();
  });
});

describe("parti spente e lettura AI", () => {
  const pieno = { ...giornoVuoto("2026-10-30", "a"), descrizione: "Posa", fasi: ["f1"], sottofasi: { s1: "finita" as const }, percentuali: { f1: 50 }, mezzi: { m1: "2" }, materiali: { i1: "3" }, foto: ["x"] };
  const tutte = { fasi: true, materiali: true, mezzi: true, foto: true, straordinario: true, avanzamento: true };
  it("con tutto acceso non cambia nulla", () => {
    expect(applicaParti(pieno, tutte)).toEqual(pieno);
  });
  it("una parte spenta non parte, anche se l'AI l'aveva letta", () => {
    const g = applicaParti(pieno, { ...tutte, fasi: false, materiali: false, mezzi: false, foto: false });
    expect(g).toMatchObject({ fasi: [], sottofasi: {}, percentuali: {}, mezzi: {}, materiali: {}, foto: [] });
    expect(g.descrizione).toBe("Posa");
  });
});
