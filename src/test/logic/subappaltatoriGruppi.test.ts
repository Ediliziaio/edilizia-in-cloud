import { describe, expect, it } from "vitest";
import {
  SENZA_CATEGORIA,
  categoriaLavori,
  durcDaGuardare,
  mancanzeDitta,
  numeroWhatsApp,
  raggruppa,
  richiestaDocumenti,
  statoDurc,
  vistaPredefinita,
  zonaDa,
} from "@/lib/subappaltatori/gruppi";

/**
 * Subappaltatori raggruppati (06/10/2026): per lavoro, per zona, DURC, e la
 * vista con cui aprire la pagina.
 */

describe("categoria di lavoro dal testo libero della scheda", () => {
  it("le varianti finiscono nella stessa categoria", () => {
    expect(categoriaLavori("Impianto elettrico").etichetta).toBe("Impianti elettrici");
    expect(categoriaLavori("Impianti elettrici").chiave).toBe("elettrico");
    expect(categoriaLavori("Idraulica e riscaldamento").chiave).toBe("idraulica");
    expect(categoriaLavori("Impianti termoidraulici").chiave).toBe("idraulica");
    expect(categoriaLavori("Impermeabilizzazione").chiave).toBe("impermeabilizzazioni");
    expect(categoriaLavori("Isolamento termico").chiave).toBe("isolamento");
    expect(categoriaLavori("Strutture metalliche").chiave).toBe("strutture");
    expect(categoriaLavori("Lavori di muratura").chiave).toBe("murature");
  });

  it("la prima che combacia vince: rilievi e posa di serramenti sono serramenti, l'autoscala è un noleggio", () => {
    expect(categoriaLavori("Rilievi misure e installazione serramenti").chiave).toBe("serramenti");
    expect(categoriaLavori("Noleggio autoscala o trasporti con furgone").chiave).toBe("noleggi");
    expect(categoriaLavori("Progettazione architettonica").chiave).not.toBe("coperture");
    expect(categoriaLavori("Rifacimento tetto").chiave).toBe("coperture");
  });

  it("quello che non riconosce resta com'è scritto, una volta sola per le maiuscole; vuoto è «senza»", () => {
    expect(categoriaLavori("posa  marmi")).toEqual({ chiave: "libera:posa marmi", etichetta: "Posa marmi" });
    expect(categoriaLavori("Posa Marmi").chiave).toBe("libera:posa marmi");
    expect(categoriaLavori("  ")).toEqual(SENZA_CATEGORIA);
    expect(categoriaLavori(null)).toEqual(SENZA_CATEGORIA);
  });
});

describe("zona dall'indirizzo", () => {
  it("la sigla tra parentesi dà provincia e regione", () => {
    expect(zonaDa("Via Roma 1, 35100 Padova (PD)")).toEqual({ provincia: "PD", nomeProvincia: "Padova", regione: "Veneto" });
    expect(zonaDa("Viale Europa 3 - Pordenone ( pn )")).toEqual({ provincia: "PN", nomeProvincia: "Pordenone", regione: "Friuli-Venezia Giulia" });
  });

  it("senza sigla, o con una sigla che non è una provincia, nessuna zona", () => {
    expect(zonaDa("Via Roma 1, Padova")).toBeNull();
    expect(zonaDa("Capannone (XX)")).toBeNull();
    expect(zonaDa(null)).toBeNull();
  });
});

describe("DURC", () => {
  const oggi = "2026-10-06";
  it("scaduto, in scadenza entro 30 giorni, in regola, mancante", () => {
    expect(statoDurc("2026-10-01", oggi)).toEqual({ stato: "scaduto", giorni: -5 });
    expect(statoDurc("2026-10-14", oggi)).toEqual({ stato: "in_scadenza", giorni: 8 });
    expect(statoDurc("2026-12-31", oggi)).toEqual({ stato: "ok", giorni: 86 });
    expect(statoDurc(null, oggi)).toEqual({ stato: "mancante", giorni: null });
  });

  it("una data impossibile (anno 60930) non è «ok» né «mancante»: va corretta", () => {
    expect(statoDurc("60930-02-20", oggi)).toEqual({ stato: "errata", giorni: null });
    expect(durcDaGuardare("60930-02-20", oggi)).toBe(true);
  });

  it("da guardare anche quando manca: senza DURC il subappalto non si affida", () => {
    expect(durcDaGuardare(null, oggi)).toBe(true);
    expect(durcDaGuardare("2026-10-14", oggi)).toBe(true);
    expect(durcDaGuardare("2026-12-31", oggi)).toBe(false);
  });
});

describe("gruppi", () => {
  it("i più numerosi prima, a parità in ordine alfabetico, «senza» in fondo; dentro, l'ordine chiesto", () => {
    const righe = [
      { n: "Zeta", g: "b" }, { n: "Alfa", g: "b" }, { n: "Beta", g: "_senza" }, { n: "Gamma", g: "a" }, { n: "Delta", g: "c" },
    ];
    const gruppi = raggruppa(righe, (r) => ({ chiave: r.g, etichetta: r.g.toUpperCase() }), (x, y) => x.n.localeCompare(y.n));
    expect(gruppi.map((g) => g.chiave)).toEqual(["b", "a", "c", "_senza"]);
    expect(gruppi[0].righe.map((r) => r.n)).toEqual(["Alfa", "Zeta"]);
  });
});

describe("vista con cui aprire la pagina", () => {
  it("per lavoro se almeno metà delle ditte ha il tipo; per zona se ha la provincia; altrimenti l'elenco", () => {
    expect(vistaPredefinita([{ tipo_lavori: "Elettrico", indirizzo: null }, { tipo_lavori: null, indirizzo: null }])).toBe("lavoro");
    expect(vistaPredefinita([
      { tipo_lavori: null, indirizzo: "Via A (PD)" }, { tipo_lavori: null, indirizzo: "Via B (VE)" }, { tipo_lavori: "Edile", indirizzo: null },
    ])).toBe("zona");
    expect(vistaPredefinita([{ tipo_lavori: null, indirizzo: "Via A" }, { tipo_lavori: null, indirizzo: null }])).toBe("elenco");
    expect(vistaPredefinita([])).toBe("lavoro");
  });
});

describe("cosa manca a una ditta", () => {
  const oggi = "2026-10-06";
  const vuoto = { n: 0, tipi: new Set<string>() };

  it("senza niente: DURC, visura, DVR, polizza RC e P.IVA; il POS solo se è su un cantiere", () => {
    const m = mancanzeDitta({ durc_scadenza: null, piva: null }, vuoto, 0, oggi);
    expect(m.map((x) => x.chiave)).toEqual(["durc", "visura", "dvr", "polizza_rc", "piva"]);
    expect(mancanzeDitta({ durc_scadenza: null, piva: null }, vuoto, 1, oggi).map((x) => x.chiave)).toContain("pos");
  });

  it("con il fascicolo in regola e il DURC valido non manca niente; DURC in scadenza va rinnovato", () => {
    const pieno = { n: 5, tipi: new Set(["visura", "dvr", "pos", "polizza_rc", "durc"]) };
    expect(mancanzeDitta({ durc_scadenza: "2026-12-31", piva: "01234567890" }, pieno, 1, oggi)).toEqual([]);
    expect(mancanzeDitta({ durc_scadenza: "2026-10-20", piva: "01234567890" }, pieno, 1, oggi).map((x) => x.etichetta)).toEqual(["DURC da rinnovare"]);
  });

  it("il messaggio per chiederli: saluto col nome, l'elenco, chi lo chiede", () => {
    const m = mancanzeDitta({ durc_scadenza: null, piva: "x" }, { n: 1, tipi: new Set(["dvr", "polizza_rc"]) }, 0, oggi);
    const r = richiestaDocumenti({ ragione_sociale: "Rossi Idraulica S.r.l.", responsabile: "Mario Rossi" }, m, "Demo Azienda S.r.l.");
    expect(r.oggetto).toBe("Documenti per il subappalto — Rossi Idraulica S.r.l.");
    expect(r.testo).toBe("Buongiorno Mario Rossi,\nper i lavori in subappalto con Demo Azienda S.r.l. ci servono:\n- DURC in corso di validità\n- visura camerale aggiornata\n\nPotete mandarceli rispondendo a questo messaggio? Grazie.\nDemo Azienda S.r.l.");
  });

  it("WhatsApp solo per i cellulari: col prefisso o senza; i fissi no", () => {
    expect(numeroWhatsApp("+39 333 4455667")).toBe("393334455667");
    expect(numeroWhatsApp("333 4455667")).toBe("393334455667");
    expect(numeroWhatsApp("0039 347 1234567")).toBe("393471234567");
    expect(numeroWhatsApp("+39 06 5551234")).toBeNull();
    expect(numeroWhatsApp("06 5551234")).toBeNull();
    expect(numeroWhatsApp("+40 712 345 678")).toBe("40712345678");
    expect(numeroWhatsApp(null)).toBeNull();
  });
});
