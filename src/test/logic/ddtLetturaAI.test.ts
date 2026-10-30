import { describe, expect, it } from "vitest";
import {
  leggiDDTdaAI,
  quantitaTotale,
  importoTotale,
  importoRiga,
} from "@/lib/ddt/letturaAI";
import {
  abbinaFornitore,
  normalizzaNome,
  normalizzaPiva,
} from "@/lib/ddt/abbinaFornitore";
import { messaggioBolla } from "@/hooks/useDDTRicezione";

// Lo schema vero di `ddt-ai-extract`, ridotto all'osso. Tipato come il JSON che
// è: `leggiDDTdaAI` prende `unknown`, ed è apposta — la risposta di un modello
// non ha garanzie di forma.
const BOLLA: Record<string, unknown> = {
  intestazione: {
    numero_ddt: "2026/4471",
    data_ddt: "2026-10-27",
    ora_inizio_trasporto: "08:30:00",
    causale: "Vendita",
  },
  mittente: {
    ragione_sociale: "Edilmix S.r.l.",
    partita_iva: "IT01234567890",
    codice_fiscale: null,
    indirizzo: "Via Roma 1",
    comune: "Torino",
  },
  destinatario: { ragione_sociale: "Dimora Torino" },
  luogo_destinazione: { indirizzo: "Cantiere Via Po 12", comune: "Torino" },
  vettore: { ragione_sociale: "GLS", tipo: "terzi", note: "AB123CD" },
  trasporto: { n_colli: 12, peso_lordo_kg: "1.240,5" },
  righe_merce: [
    {
      codice_articolo: "CEM325",
      descrizione: "Cemento 32.5 R sacco 25 kg",
      unita_misura: "PZ",
      quantita: 40,
      prezzo_unitario_eur: 7.5,
      importo_eur: 290,
      iva_percentuale: 22,
    },
    {
      codice_articolo: null,
      descrizione: "Rete elettrosaldata",
      unita_misura: "mq",
      quantita: "12,5",
      prezzo_unitario_eur: "4,20",
      importo_eur: null,
      iva_percentuale: 22,
    },
    { descrizione: "   ", quantita: null },
  ],
  totali: { imponibile_eur: 342.5, totale_documento_eur: "417,85" },
  riferimenti: { note_libere: "Consegna al piano" },
  confidence: 0.91,
  warnings: ["Targa poco leggibile", null],
};

describe("La lettura AI di una bolla", () => {
  it("prende intestazione, mittente, vettore e trasporto", () => {
    const l = leggiDDTdaAI(BOLLA);
    expect(l.numero).toBe("2026/4471");
    expect(l.data).toBe("2026-10-27");
    expect(l.fornitoreNome).toBe("Edilmix S.r.l.");
    expect(l.fornitorePiva).toBe("IT01234567890");
    expect(l.corriere).toBe("GLS");
    // La targa sta in vettore.note, come dice il prompt del modello.
    expect(l.targaMezzo).toBe("AB123CD");
    expect(l.oraInizioTrasporto).toBe("08:30");
    expect(l.colli).toBe(12);
    expect(l.pesoKg).toBe(1240.5);
    expect(l.luogoDestinazione).toBe("Cantiere Via Po 12");
    expect(l.confidenza).toBe(0.91);
    expect(l.avvisi).toEqual(["Targa poco leggibile"]);
  });

  it("dice chi ha portato la merce, e «destinatario» vuol dire che l'abbiamo ritirata noi", () => {
    const con = (tipo: unknown, porto?: unknown) =>
      leggiDDTdaAI({ vettore: { tipo }, trasporto: { porto } });
    expect(con("mittente").trasportoACuraDi).toBe("fornitore");
    expect(con("destinatario").trasportoACuraDi).toBe("noi");
    expect(con("terzi").trasportoACuraDi).toBe("terzi");
    expect(con("Terzi").trasportoACuraDi).toBe("terzi");
    // Quello che non si capisce resta NULL: non diventa «fornitore» per finta.
    expect(con(null).trasportoACuraDi).toBeNull();
    expect(con("pasticcio").trasportoACuraDi).toBeNull();
    expect(con("terzi", "franco").porto).toBe("franco");
    expect(con("terzi", "ASSEGNATO").porto).toBe("assegnato");
    expect(con("terzi", "altro").porto).toBeNull();
    expect(con("terzi").porto).toBeNull();
  });

  it("su una bolla portata da un corriere la lettura lo dice", () => {
    const l = leggiDDTdaAI(BOLLA);
    expect(l.trasportoACuraDi).toBe("terzi");
    expect(l.corriere).toBe("GLS");
  });

  it("tiene TUTTE le righe col loro prezzo, anche quelle illeggibili", () => {
    const { righe } = leggiDDTdaAI(BOLLA);
    // Tre righe sulla carta, tre righe salvate: è il punto di tutta la fase 2.
    expect(righe).toHaveLength(3);
    expect(righe[0]).toMatchObject({
      posizione: 1,
      codice_articolo: "CEM325",
      unita_misura: "pz",
      quantita: 40,
      prezzo_unitario: 7.5,
      importo: 290,
      origine: "ai",
    });
    // Numeri all'italiana
    expect(righe[1].quantita).toBe(12.5);
    expect(righe[1].prezzo_unitario).toBe(4.2);
    // Niente importo sul documento: lo calcolerà il database (o importoRiga)
    expect(righe[1].importo).toBeNull();
    // La riga illeggibile non si butta: resta col suo testo grezzo
    expect(righe[2].descrizione).toBe("");
    expect(righe[2].testo_grezzo).toContain("descrizione");
    expect(righe[2].quantita).toBeNull();
  });

  it("l'abbinamento alla riga di commessa è un passo dopo, mai automatico", () => {
    const { righe } = leggiDDTdaAI(BOLLA);
    expect(righe.every((r) => r.order_item_id === null)).toBe(true);
  });

  it("non inventa niente se la lettura è vuota o spazzatura", () => {
    for (const grezzo of [null, undefined, {}, "pasticcio", 42, []]) {
      const l = leggiDDTdaAI(grezzo);
      expect(l.numero).toBeNull();
      expect(l.fornitoreNome).toBeNull();
      expect(l.righe).toEqual([]);
      expect(l.avvisi).toEqual([]);
    }
  });

  it("«null» e «non leggibile» scritti dal modello valgono NULL", () => {
    const l = leggiDDTdaAI({
      intestazione: { numero_ddt: "non leggibile", data_ddt: "null" },
      mittente: { ragione_sociale: "  " },
    });
    expect(l.numero).toBeNull();
    expect(l.data).toBeNull();
    expect(l.fornitoreNome).toBeNull();
  });

  it("una data che non è una data resta NULL invece di diventare oggi", () => {
    expect(leggiDDTdaAI({ intestazione: { data_ddt: "qualcosa" } }).data).toBeNull();
  });
});

describe("I totali della merce", () => {
  it("somma le quantità per proporre la quantità ricevuta", () => {
    expect(quantitaTotale(leggiDDTdaAI(BOLLA).righe)).toBe(52.5);
  });

  it("l'importo di riga: quello del documento, o quantità × prezzo", () => {
    // 40 × 7,50 farebbe 300, ma sul documento c'è 290 (sconto): vince la carta.
    expect(importoRiga({ importo: 290, quantita: 40, prezzo_unitario: 7.5 })).toBe(290);
    expect(importoRiga({ importo: null, quantita: 12.5, prezzo_unitario: 4.2 })).toBe(52.5);
    expect(importoRiga({ importo: null, quantita: null, prezzo_unitario: 4.2 })).toBeNull();
    expect(importoRiga({ importo: null, quantita: 3, prezzo_unitario: null })).toBeNull();
  });

  it("il totale della merce usa la stessa regola, riga per riga", () => {
    expect(importoTotale(leggiDDTdaAI(BOLLA).righe)).toBe(342.5);
  });

  it("senza nessuna riga valorizzata il totale è NULL, non zero", () => {
    const l = leggiDDTdaAI({ righe_merce: [{ descrizione: "Sabbia", quantita: 2 }] });
    expect(importoTotale(l.righe)).toBeNull();
  });
});

describe("Il fornitore riconosciuto dalla bolla", () => {
  const rubrica = [
    { id: "a", name: "Edilmix Srl", vat_number: "01234567890", fiscal_code: null },
    { id: "b", name: "Ferramenta Bianchi S.p.A.", vat_number: "09876543210", fiscal_code: "RSSMRA80A01H501U" },
    { id: "c", name: "Edil Rossi snc", vat_number: null, fiscal_code: null },
    { id: "d", name: "Edil Rossi S.r.l.", vat_number: null, fiscal_code: null },
  ];

  it("la partita IVA vince, anche scritta col prefisso di stato", () => {
    expect(abbinaFornitore(leggiDDTdaAI(BOLLA), rubrica)).toEqual({
      id: "a",
      motivo: "partita IVA",
    });
  });

  it("col codice fiscale quando la partita IVA non si legge", () => {
    expect(
      abbinaFornitore({ fornitoreCodiceFiscale: "rssmra80a01h501u" }, rubrica),
    ).toEqual({ id: "b", motivo: "codice fiscale" });
  });

  it("col nome, ma solo quando è l'unico che corrisponde", () => {
    expect(abbinaFornitore({ fornitoreNome: "Ferramenta Bianchi" }, rubrica)).toEqual({
      id: "b",
      motivo: "ragione sociale",
    });
    // «Edil Rossi snc» e «Edil Rossi S.r.l.» si riducono allo stesso nome:
    // due candidati non si tirano a sorte, si chiedono.
    expect(abbinaFornitore({ fornitoreNome: "EDIL ROSSI" }, rubrica)).toBeNull();
  });

  it("nel dubbio non abbina: meglio una tendina che un fornitore sbagliato", () => {
    expect(abbinaFornitore({ fornitoreNome: "Tizio" }, rubrica)).toBeNull();
    expect(abbinaFornitore({}, rubrica)).toBeNull();
    expect(abbinaFornitore(leggiDDTdaAI(BOLLA), [])).toBeNull();
  });

  it("un pezzo di partita IVA letto male non abbina nessuno", () => {
    expect(normalizzaPiva("IT0123")).toBeNull();
    expect(normalizzaPiva("IT 01234567890")).toBe("01234567890");
    expect(normalizzaPiva(null)).toBeNull();
  });

  it("il nome si riduce all'osso: via forma sociale e punteggiatura", () => {
    expect(normalizzaNome("Edilmix S.r.l.")).toBe("edilmix");
    expect(normalizzaNome("EDIL ROSSI snc")).toBe("edil rossi");
    expect(normalizzaNome(null)).toBe("");
  });
});

describe("I vincoli del database detti in italiano", () => {
  it("la bolla già caricata non è «duplicate key value violates…»", () => {
    const m = messaggioBolla(
      { code: "23505", message: 'duplicate key value violates unique constraint "ddt_ricezione_una_bolla_per_fornitore"' },
      "fallback",
    );
    expect(m).toContain("già stata caricata");
    expect(m).not.toContain("duplicate key");
  });

  it("gli altri tre vincoli dicono che cosa fare", () => {
    expect(
      messaggioBolla({ message: 'violates check constraint "ddt_ricezione_cantiere_ha_commessa"' }, "x"),
    ).toContain("scegli il cantiere");
    expect(
      messaggioBolla({ message: 'violates check constraint "ddt_ricezione_costo_una_volta_sola"' }, "x"),
    ).toContain("già sull'ordine");
    expect(
      messaggioBolla({ message: 'violates check constraint "ddt_ricezione_cantiere_non_carica_magazzino"' }, "x"),
    ).toContain("non entra in giacenza");
  });

  it("un errore che non conosce lo lascia passare com'è", () => {
    expect(messaggioBolla({ message: "rete assente" }, "fallback")).toBe("rete assente");
    expect(messaggioBolla(null, "fallback")).toBe("fallback");
    expect(messaggioBolla({}, "fallback")).toBe("fallback");
  });
});
