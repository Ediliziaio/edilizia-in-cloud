/**
 * Colore interno ed esterno come due scelte sulla variabile «Colore» del listino.
 *
 * Si prova con le fasce e le voci dei listini veri («Colore Standard», «Colore Fuori Standard», «pellicola solo
 * un lato» che ripete i colori di «Colore Standard»): le righe già salvate si rileggono come le scrive il PDF,
 * i testi dei due lati sono quelli che il PDF stampa, e il prezzo segue la fascia più cara.
 */
import { describe, expect, it } from "vitest";
import {
  cambiaLato,
  fasceDeiLati,
  leggiColori,
  scriviLato,
  sceltaPerIlPrezzo,
  stessoColore,
  testiColori,
  testoColore,
  type RigaColori,
  type ValoreColore,
} from "@/lib/serramenti/coloriDentroFuori";
import { schedaPosizione, scelteDaAssi } from "@/lib/serramenti/schedaPosizione";

const STANDARD = ["21 - Nussbaum (noce)", "51 - Golden Oak (rovere dorato)", "55 - Anthrazitgrau (grigio antracite)"];
const FUORI_STANDARD = ["97 - mattGrey_cleanCOOL (grigio opaco)", "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)"];

/** La variabile «Colore» di un serramento Salamander: Bianco di serie, due fasce a elenco, la pellicola su un lato. */
const asse: { codice: string; nome: string; values: Array<ValoreColore & { descrizione: string | null }> } = {
  codice: "colore",
  nome: "Colore",
  values: [
    { id: "bianco", valore: "bianco", label: "Bianco", descrizione: null, is_default: true, attivo: true },
    { id: "standard", valore: "colore_standard", label: "Colore Standard", descrizione: null, attivo: true, opzioni: STANDARD },
    { id: "fuori", valore: "colore_fuori_standard", label: "Colore Fuori Standard", descrizione: null, attivo: true, opzioni: FUORI_STANDARD },
    { id: "unlato", valore: "pellicola_solo_un_lato", label: "pellicola solo un lato", descrizione: null, attivo: true, opzioni: STANDARD },
    { id: "vecchio", valore: "ral_vecchio", label: "RAL vecchio", descrizione: null, attivo: false },
  ],
};

const riga = (extra: RigaColori): RigaColori => extra;

/** Quello che il PDF scrive di una riga, con la scheda della posizione (la stessa funzione del PDF). */
const comeIlPdf = (r: RigaColori) => {
  const scheda = schedaPosizione(scelteDaAssi([asse], r.valori_assi, r.scelte_assi), { coloreInterno: r.colore_interno, coloreEsterno: r.colore_esterno });
  return { interno: scheda.coloreInterno, esterno: scheda.coloreEsterno };
};

describe("leggere i colori di una riga già salvata", () => {
  it("monocolore (nessun testo): i due lati sono la variante della riga, e i testi sono quelli che il PDF scrive oggi", () => {
    const r = riga({ valori_assi: { colore: "standard" }, scelte_assi: { colore: "21 - Nussbaum (noce)" } });
    const c = leggiColori(asse, r);
    expect(c.interno).toEqual({ valueId: "standard", voce: "21 - Nussbaum (noce)", scritto: null });
    expect(c.esterno).toEqual(c.interno);
    expect(testiColori(asse, c)).toEqual(comeIlPdf(r));
  });

  it("fascia senza il colore scelto («Da decidere»): si legge che è da scegliere, come nel PDF", () => {
    const r = riga({ valori_assi: { colore: "standard" } });
    const c = leggiColori(asse, r);
    expect(c.esterno).toEqual({ valueId: "standard", voce: null, scritto: null });
    expect(testiColori(asse, c)).toEqual({ interno: "Colore Standard (da scegliere)", esterno: "Colore Standard (da scegliere)" });
    expect(testiColori(asse, c)).toEqual(comeIlPdf(r));
  });

  it("bianco di serie: «Bianco» da tutte e due le parti", () => {
    const r = riga({ valori_assi: { colore: "bianco" } });
    expect(testiColori(asse, leggiColori(asse, r))).toEqual({ interno: "Bianco", esterno: "Bianco" });
    expect(testiColori(asse, leggiColori(asse, r))).toEqual(comeIlPdf(r));
  });

  it("pellicola solo su un lato: dentro resta il colore di serie, fuori il colore scelto (come il PDF)", () => {
    const r = riga({ valori_assi: { colore: "unlato" }, scelte_assi: { colore: "51 - Golden Oak (rovere dorato)" } });
    const c = leggiColori(asse, r);
    expect(c.interno).toEqual({ valueId: "bianco", voce: null, scritto: null });
    expect(c.esterno).toEqual({ valueId: "unlato", voce: "51 - Golden Oak (rovere dorato)", scritto: null });
    expect(testiColori(asse, c)).toEqual(comeIlPdf(r));
    expect(testiColori(asse, c)).toEqual({ interno: "Bianco", esterno: "51 - Golden Oak (rovere dorato)" });
  });

  it("bicolore scritto con i colori del listino: ogni lato ritrova la sua fascia e il suo colore", () => {
    const r = riga({
      valori_assi: { colore: "fuori" },
      scelte_assi: { colore: "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)" },
      colore_interno: "Bianco",
      colore_esterno: "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)",
    });
    const c = leggiColori(asse, r);
    expect(c.interno).toEqual({ valueId: "bianco", voce: null, scritto: null });
    expect(c.esterno).toEqual({ valueId: "fuori", voce: "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)", scritto: null });
    expect(testiColori(asse, c)).toEqual(comeIlPdf(r));
  });

  it("un colore scritto a mano resta com'è e tiene la fascia e il colore della riga per il prezzo", () => {
    const r = riga({ valori_assi: { colore: "fuori" }, scelte_assi: { colore: "97 - mattGrey_cleanCOOL (grigio opaco)" }, colore_interno: "Verde RAL 6005" });
    const c = leggiColori(asse, r);
    expect(c.interno).toEqual({ valueId: "fuori", voce: "97 - mattGrey_cleanCOOL (grigio opaco)", scritto: "Verde RAL 6005" });
    expect(c.esterno).toEqual({ valueId: "fuori", voce: "97 - mattGrey_cleanCOOL (grigio opaco)", scritto: null });
    expect(testiColori(asse, c)).toEqual(comeIlPdf(r));
    // Il prezzo non scende: con un lato scritto a mano vale la fascia della riga.
    expect(sceltaPerIlPrezzo(c, (id) => ({ bianco: 1000, standard: 1100, fuori: 1150, unlato: 1120 })[id as "bianco"])).toEqual({
      valueId: "fuori",
      voce: "97 - mattGrey_cleanCOOL (grigio opaco)",
    });
  });

  it("lo stesso colore in due fasce: vince la fascia che la riga ha già scelto", () => {
    const voce = "21 - Nussbaum (noce)";
    const inStandard = leggiColori(asse, riga({ valori_assi: { colore: "standard" }, scelte_assi: { colore: voce }, colore_interno: voce, colore_esterno: voce }));
    expect(inStandard.interno.valueId).toBe("standard");
    const inUnLato = leggiColori(asse, riga({ valori_assi: { colore: "unlato" }, scelte_assi: { colore: voce }, colore_interno: voce, colore_esterno: voce }));
    expect(inUnLato.interno.valueId).toBe("unlato");
    expect(inUnLato.esterno.valueId).toBe("unlato");
  });

  it("senza niente scelto i lati restano da scegliere; i testi, vuoti", () => {
    const c = leggiColori(asse, riga({}));
    expect(c.interno).toEqual({ valueId: null, voce: null, scritto: null });
    expect(testiColori(asse, c)).toEqual({ interno: null, esterno: null });
  });

  it("una voce tolta dal listino resta sulla riga (la tendina la mostra «non più a listino»)", () => {
    const c = leggiColori(asse, riga({ valori_assi: { colore: "standard" }, scelte_assi: { colore: "99 - Colore sparito" } }));
    expect(c.esterno).toEqual({ valueId: "standard", voce: "99 - Colore sparito", scritto: null });
  });

  it("una variante tolta dal listino resta com'era: la tendina scrive «Scelta tolta dal listino», non «da scegliere»", () => {
    const c = leggiColori(asse, riga({ valori_assi: { colore: "sparita" }, scelte_assi: { colore: "99 - Colore sparito" } }));
    expect(c.interno).toEqual({ valueId: "sparita", voce: "99 - Colore sparito", scritto: null });
    expect(c.esterno).toEqual(c.interno);
    // Non c'è niente da scrivere come testo (la riga resta com'è) e non ci sono due fasce da confrontare.
    expect(testiColori(asse, c)).toEqual({ interno: null, esterno: null });
    expect(fasceDeiLati(asse, c)).toBeNull();
  });

  it("una riga con un colore scritto e la variante tolta dal listino tiene il testo e non inventa una fascia", () => {
    const c = leggiColori(asse, riga({ valori_assi: { colore: "sparita" }, colore_esterno: "Verde RAL 6005" }));
    expect(c.esterno).toEqual({ valueId: null, voce: null, scritto: "Verde RAL 6005" });
    expect(c.interno).toEqual({ valueId: "sparita", voce: null, scritto: null });
  });
});

describe("scrivere i colori scelti", () => {
  it("un lato cambia, l'altro no; il colore scritto a mano di quel lato non c'è più", () => {
    const prima = leggiColori(asse, riga({ valori_assi: { colore: "standard" }, scelte_assi: { colore: "21 - Nussbaum (noce)" }, colore_interno: "Verde RAL 6005" }));
    const dopo = cambiaLato(prima, "interno", "bianco", null);
    expect(dopo.interno).toEqual({ valueId: "bianco", voce: null, scritto: null });
    expect(dopo.esterno).toEqual(prima.esterno);
    expect(testiColori(asse, dopo)).toEqual({ interno: "Bianco", esterno: "21 - Nussbaum (noce)" });
  });

  it("i testi dei due lati: la voce, il valore, o «(da scegliere)» per una fascia senza il suo colore", () => {
    expect(testoColore(asse.values[0], null)).toBe("Bianco");
    expect(testoColore(asse.values[1], "21 - Nussbaum (noce)")).toBe("21 - Nussbaum (noce)");
    expect(testoColore(asse.values[1], null)).toBe("Colore Standard (da scegliere)");
    expect(testoColore(asse.values[1], "  ")).toBe("Colore Standard (da scegliere)");
  });

  it("i testi di una riga scritta dai due lati si rileggono uguali (nessuna perdita)", () => {
    const scelte = cambiaLato(cambiaLato(stessoColore("bianco", null), "interno", "standard", "55 - Anthrazitgrau (grigio antracite)"), "esterno", "fuori", null);
    const testi = testiColori(asse, scelte);
    expect(testi).toEqual({ interno: "55 - Anthrazitgrau (grigio antracite)", esterno: "Colore Fuori Standard (da scegliere)" });
    const guida = sceltaPerIlPrezzo(scelte, () => 0);
    const riletti = leggiColori(asse, { valori_assi: { colore: guida?.valueId ?? "" }, scelte_assi: guida?.voce ? { colore: guida.voce } : {}, colore_interno: testi.interno, colore_esterno: testi.esterno });
    expect(riletti).toEqual(scelte);
  });
});

describe("«Altro colore (scrivi)…»: il testo resta su un lato e tiene la fascia del prezzo", () => {
  const prezzi: Record<string, number> = { bianco: 1000, standard: 1100, fuori: 1150, unlato: 1120 };
  const prezzo = (id: string) => prezzi[id];

  it("il lato scritto riceve il testo e la fascia e il colore che decidono il prezzo; l'altro lato non si tocca", () => {
    const prima = cambiaLato(cambiaLato(stessoColore("bianco", null), "interno", "standard", "21 - Nussbaum (noce)"), "esterno", "fuori", "97 - mattGrey_cleanCOOL (grigio opaco)");
    const guida = sceltaPerIlPrezzo(prima, prezzo);
    const dopo = scriviLato(prima, "esterno", "RAL 7016 goffrato", guida);
    expect(dopo.esterno).toEqual({ valueId: "fuori", voce: "97 - mattGrey_cleanCOOL (grigio opaco)", scritto: "RAL 7016 goffrato" });
    expect(dopo.interno).toEqual(prima.interno);
    expect(testiColori(asse, dopo)).toEqual({ interno: "21 - Nussbaum (noce)", esterno: "RAL 7016 goffrato" });
  });

  it("scrivere non cambia mai la scelta del prezzo, su qualunque lato e con qualunque coppia di fasce", () => {
    const fasce = ["bianco", "standard", "fuori", "unlato"];
    for (const i of fasce) {
      for (const e of fasce) {
        const prima = cambiaLato(cambiaLato(stessoColore("bianco", null), "interno", i, null), "esterno", e, null);
        const guida = sceltaPerIlPrezzo(prima, prezzo);
        for (const lato of ["interno", "esterno"] as const) {
          const dopo = scriviLato(prima, lato, "RAL 7016", guida);
          expect(sceltaPerIlPrezzo(dopo, prezzo)).toEqual(guida);
        }
      }
    }
  });

  it("un testo vuoto non scrive niente", () => {
    const prima = cambiaLato(stessoColore("bianco", null), "esterno", "fuori", null);
    expect(scriviLato(prima, "esterno", "   ", sceltaPerIlPrezzo(prima, prezzo))).toBe(prima);
  });

  it("scritta sulla riga e riletta, il lato è lo stesso: nessuna perdita", () => {
    const prima = cambiaLato(stessoColore("fuori", "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)"), "interno", "bianco", null);
    const guida = sceltaPerIlPrezzo(prima, prezzo);
    const dopo = scriviLato(prima, "esterno", "RAL 7016 goffrato", guida);
    const testi = testiColori(asse, dopo);
    const letti = leggiColori(asse, { valori_assi: { colore: guida?.valueId ?? "" }, scelte_assi: guida?.voce ? { colore: guida.voce } : {}, colore_interno: testi.interno, colore_esterno: testi.esterno });
    expect(letti.esterno).toEqual(dopo.esterno);
    expect(letti.interno).toEqual(dopo.interno);
  });
});

describe("il prezzo segue la fascia più cara", () => {
  // Come costano le fasce su una finestra: Bianco 1000, Standard +10%, Fuori Standard +15%, pellicola +12%.
  const prezzi: Record<string, number> = { bianco: 1000, standard: 1100, fuori: 1150, unlato: 1120 };
  const prezzo = (id: string) => prezzi[id];

  it("fra bianco dentro e fuori standard fuori vale la fascia fuori standard, in qualunque ordine", () => {
    const a = cambiaLato(cambiaLato(stessoColore("bianco", null), "esterno", "fuori", "97 - mattGrey_cleanCOOL (grigio opaco)"), "interno", "bianco", null);
    expect(sceltaPerIlPrezzo(a, prezzo)).toEqual({ valueId: "fuori", voce: "97 - mattGrey_cleanCOOL (grigio opaco)" });
    const b = cambiaLato(cambiaLato(stessoColore("bianco", null), "interno", "fuori", "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)"), "esterno", "standard", "21 - Nussbaum (noce)");
    expect(sceltaPerIlPrezzo(b, prezzo)).toEqual({ valueId: "fuori", voce: "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)" });
  });

  it("a parità di prezzo vale l'esterno", () => {
    const c = cambiaLato(cambiaLato(stessoColore("bianco", null), "interno", "standard", "21 - Nussbaum (noce)"), "esterno", "unlato", "55 - Anthrazitgrau (grigio antracite)");
    expect(sceltaPerIlPrezzo(c, () => 1000)).toEqual({ valueId: "unlato", voce: "55 - Anthrazitgrau (grigio antracite)" });
    // Senza un prezzo calcolabile (misure ancora da scrivere) i valori pari restano pari: vale l'esterno.
    expect(sceltaPerIlPrezzo(c, () => null)).toEqual({ valueId: "unlato", voce: "55 - Anthrazitgrau (grigio antracite)" });
  });

  it("stessa fascia da tutte e due le parti: una scelta sola, quella dell'esterno", () => {
    const c = cambiaLato(cambiaLato(stessoColore("standard", null), "interno", "standard", "21 - Nussbaum (noce)"), "esterno", "standard", "55 - Anthrazitgrau (grigio antracite)");
    expect(sceltaPerIlPrezzo(c, prezzo)).toEqual({ valueId: "standard", voce: "55 - Anthrazitgrau (grigio antracite)" });
  });

  it("nessun lato scelto: nessuna fascia da pagare", () => {
    expect(sceltaPerIlPrezzo(leggiColori(asse, riga({})), prezzo)).toBeNull();
  });

  it("dice quando i due lati sono in fasce diverse (per scrivere «il prezzo segue il più caro»)", () => {
    expect(fasceDeiLati(asse, stessoColore("standard", null))).toBeNull();
    const diverse = fasceDeiLati(asse, cambiaLato(stessoColore("bianco", null), "esterno", "fuori", null));
    expect(diverse?.interno.id).toBe("bianco");
    expect(diverse?.esterno.id).toBe("fuori");
  });
});
