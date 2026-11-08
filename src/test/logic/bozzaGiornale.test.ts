/** La bozza del giornale composta dai dati del giorno: niente AI, niente doppioni, niente pagine vuote. */
import { describe, expect, it } from "vitest";
import {
  applicaBozza, commessaDelDdt, componiBozzaGiornale, intervalloGiornoRoma, meteoGiornale, testoGiaScritto,
  unisciFonti, unisciTesto, type ModuloBozza, type RapportinoPerBozza,
} from "../../../supabase/functions/_shared/bozzaGiornale";
import { chiFaCosa } from "@/lib/campo/chiFaCosa";
import { REGOLE_COME_OGGI } from "@/lib/campo/regoleCampo";

const rap = (id: string, parte: Partial<RapportinoPerBozza> = {}): RapportinoPerBozza => ({ id, stato: "approvato", user_id: `u-${id}`, ...parte });
const nomiAutori = { "u-a": "Mario Rossi", "u-b": "Luca Bianchi" };

describe("componiBozzaGiornale", () => {
  it("una riga per rapportino col nome di chi l'ha scritta, senza doppioni", () => {
    const b = componiBozzaGiornale({
      nomiAutori,
      rapportini: [
        rap("a", { descrizione_lavori: "Posa   guaina\nsul tetto." }),
        rap("b", { descrizione_lavori: "posa guaina sul tetto" }),
        rap("c", { descrizione_lavori: "Tracce impianto" }),
      ],
    });
    expect(b.campi.lavorazioni_eseguite).toBe("Mario Rossi, Luca Bianchi: Posa guaina sul tetto.\nTracce impianto");
  });

  it("con una riga sola non serve dire di chi è", () => {
    const b = componiBozzaGiornale({ nomiAutori, rapportini: [rap("a", { descrizione_lavori: "Getto" })] });
    expect(b.campi.lavorazioni_eseguite).toBe("Getto");
  });

  it("restano fuori rifiutati e bozze, anche dalle fonti e dai presenti", () => {
    const b = componiBozzaGiornale({
      rapportini: [
        rap("a", { stato: "inviato", descrizione_lavori: "Buono" }),
        rap("r", { stato: "rifiutato", descrizione_lavori: "Rifiutato" }),
        rap("z", { stato: "bozza", descrizione_lavori: "Bozza" }),
      ],
    });
    expect(b.campi.lavorazioni_eseguite).toBe("Buono");
    expect(b.fonti.source_rapportini_ids).toEqual(["a"]);
    expect(b.campi.personale_presente).toBe(1);
  });

  it("somma i materiali per voce e unità, senza mescolare le unità", () => {
    const b = componiBozzaGiornale({
      rapportini: [
        rap("a", { materiali_usati: [{ nome: "Cemento", quantita: 2.5, unita: "sacchi" }, { descrizione: "Ferro", quantita: 10, unita_misura: "kg" }] }),
        rap("b", { materiali_usati: [{ nome: "cemento ", quantita: 1, unita: "sacchi" }, { nome: "Cemento", quantita: 3, unita: "pz" }, "Silicone", { quantita: 4 }] }),
      ],
    });
    expect(b.campi.materiali_utilizzati.split("\n")).toEqual(["Cemento: 3,5 sacchi", "Ferro: 10 kg", "Cemento: 3 pz", "Silicone"]);
  });

  it("giornata vuota: nessun testo da scrivere, anche se ci sono foto o solo le ore", () => {
    expect(componiBozzaGiornale({ rapportini: [] }).vuota).toBe(true);
    const b = componiBozzaGiornale({ rapportini: [rap("a", { ore_lavorate: 8 })], fotoIds: ["f1"] });
    expect(b.vuota).toBe(true);
    expect(b.fonti.source_foto_ids).toEqual(["f1"]);
  });

  it("consegne e segnalazioni diventano eventi, non note, e una bolla attesa non è una consegna", () => {
    const b = componiBozzaGiornale({
      rapportini: [],
      ddt: [
        { id: "d1", numero_ddt: "12", stato: "ricevuto", destinazione: "cantiere", fornitore: { name: "Edilmat" } },
        { id: "d2", numero_ddt: "13", stato: "verificato", destinazione: "magazzino", has_damages: true },
        { id: "d3", numero_ddt: "14", stato: "atteso" },
      ],
      segnalazioni: [
        { id: "s1", titolo: "Perdita", descrizione: "Al piano 2" },
        { id: "s2", subject: "perdita", titolo: null },
      ],
    });
    expect(b.vuota).toBe(false);
    expect(b.campi.lavorazioni_eseguite).toBe("");
    expect(b.campi.note).toBe("");
    expect(b.eventi).toEqual([
      { tipo: "consegna", ddt_id: "d1", testo: "DDT 12 di Edilmat" },
      { tipo: "consegna", ddt_id: "d2", testo: "DDT 13 (a magazzino, danni segnalati)" },
      { tipo: "problema", ticket_id: "s1", testo: "Perdita (Al piano 2)" },
      { tipo: "problema", ticket_id: "s2", testo: "perdita" },
    ]);
    expect(b.fonti.source_ddt_ids).toEqual(["d1", "d2"]);
    expect(b.fonti.source_segnalazioni_ids).toEqual(["s1", "s2"]);
  });

  it("meteo, presenti e la percentuale più alta dichiarata (lo 0 non conta)", () => {
    const b = componiBozzaGiornale({
      rapportini: [
        rap("a", { meteo: null, percentuale_avanzamento: 0, descrizione_lavori: "x", presenze: [{ employee_id: "e1", nome: "A", ore: 8 }, { employee_id: "e2", nome: "B", ore: 8 }] }),
        rap("b", { meteo: "Pioggia", percentuale_avanzamento: 40, presenze: [{ employee_id: "e1", nome: "A", ore: 2 }] }),
      ],
    });
    expect(b.campi).toMatchObject({ condizioni_meteo: "pioggia", personale_presente: 2, avanzamento_percentuale: 40 });
    expect(componiBozzaGiornale({ rapportini: [rap("a", { percentuale_avanzamento: 0 })] }).campi.avanzamento_percentuale).toBeNull();
  });

  it("il meteo che non si riconosce non si inventa", () => {
    expect(meteoGiornale("Sereno")).toBe("soleggiato");
    expect(meteoGiornale("boh")).toBeNull();
    expect(meteoGiornale(null)).toBeNull();
  });

  it("la commessa della bolla: quella scritta, altrimenti quella dell'ordine d'acquisto", () => {
    expect(commessaDelDdt({ id: "d", order_id: "o1", oda: { order_id: "o2" } })).toBe("o1");
    expect(commessaDelDdt({ id: "d", order_id: null, oda: { order_id: "o2" } })).toBe("o2");
    expect(commessaDelDdt({ id: "d" })).toBeNull();
  });
});

describe("la proposta dentro una pagina già scritta", () => {
  const form: ModuloBozza = { lavorazioni_eseguite: "", materiali_utilizzati: "", note: "", condizioni_meteo: "soleggiato", personale_presente: 1, avanzamento_percentuale: 0 };
  const bozza = componiBozzaGiornale({
    rapportini: [rap("a", { descrizione_lavori: "Getto", meteo: "pioggia", percentuale_avanzamento: 30, presenze: [{ employee_id: "e1", nome: "A", ore: 8 }, { employee_id: "e2", nome: "B", ore: 8 }] })],
  });

  it("aggiunge in fondo, senza ripetere le righe che ci sono già", () => {
    expect(unisciTesto("Scritto a mano", "Getto", "aggiungi")).toBe("Scritto a mano\nGetto");
    expect(unisciTesto("Getto.", "getto", "aggiungi")).toBe("Getto.");
  });

  it("dove non c'è proposta tiene il testo, anche scegliendo di sostituire", () => {
    expect(unisciTesto("Scritto a mano", "", "sostituisci")).toBe("Scritto a mano");
    expect(unisciTesto("Scritto a mano", "Getto", "sostituisci")).toBe("Getto");
  });

  it("su una pagina nuova riempie meteo e numeri ancora al valore di partenza", () => {
    expect(applicaBozza(form, bozza, "aggiungi", { paginaNuova: true })).toMatchObject({
      lavorazioni_eseguite: "Getto", condizioni_meteo: "pioggia", personale_presente: 2, avanzamento_percentuale: 30,
    });
  });

  it("aggiungendo non cambia i valori scelti a mano; sostituendo sì", () => {
    const scritta = { ...form, lavorazioni_eseguite: "Mio", condizioni_meteo: "neve", personale_presente: 7, avanzamento_percentuale: 55 };
    expect(applicaBozza(scritta, bozza, "aggiungi", { paginaNuova: false })).toMatchObject({
      lavorazioni_eseguite: "Mio\nGetto", condizioni_meteo: "neve", personale_presente: 7, avanzamento_percentuale: 55,
    });
    expect(applicaBozza(scritta, bozza, "sostituisci", { paginaNuova: false })).toMatchObject({
      lavorazioni_eseguite: "Getto", condizioni_meteo: "pioggia", personale_presente: 2, avanzamento_percentuale: 30,
    });
  });

  it("riconosce il testo già scritto", () => {
    expect(testoGiaScritto(form)).toBe(false);
    expect(testoGiaScritto({ ...form, note: " x " })).toBe(true);
  });

  it("unisce le fonti senza doppioni", () => {
    const f = unisciFonti({ source_rapportini_ids: ["a", "b"], source_ddt_ids: null }, bozza.fonti);
    expect(f.source_rapportini_ids).toEqual(["a", "b"]);
    expect(f.source_ddt_ids).toEqual([]);
  });
});

describe("altro", () => {
  it("la giornata a Roma, ora solare e legale", () => {
    expect(intervalloGiornoRoma("2026-01-15")).toEqual({ inizio: "2026-01-14T23:00:00.000Z", fine: "2026-01-15T22:59:59.000Z" });
    expect(intervalloGiornoRoma("2026-07-15").inizio).toBe("2026-07-14T22:00:00.000Z");
  });

  it("«chi fa cosa» dice se la bozza serale è accesa, e tace finché non si sa", () => {
    const riga = (v?: boolean) => chiFaCosa(REGOLE_COME_OGGI, { bozzaSerale: v }).find((b) => b.ruolo === "giornale")!.righe.join(" | ");
    expect(riga(true)).toContain("Ogni sera si prepara da sola una bozza");
    expect(riga(false)).toContain("La bozza serale è spenta");
    expect(riga(undefined)).not.toContain("bozza serale");
  });
});
