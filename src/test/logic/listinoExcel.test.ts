import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpretaListino, leggiFoglio, vociGiaPresenti, type VoceEsistente } from "@/lib/appalto/listinoExcel";

const testa = ["Descrizione", "U.M.", "Prezzo unitario", "Tipo", "Codice"];

describe("il listino letto da un foglio", () => {
  it("capisce le colonne e i modi di scrivere unità e prezzo", () => {
    const { righe } = interpretaListino([testa, ["Operaio", "ore", "32,50", "", ""], ["Posa", "m2", 22, "posa", "P1"], ["Viaggio", "viaggi", "€ 1.500", "", ""]]);
    expect(righe.map((r) => [r.unita_misura, r.prezzo_unitario, r.tipo, r.problema])).toEqual([
      ["ora", 32.5, "lavorazione", null],
      ["mq", 22, "lavorazione", null],
      ["viaggio", 1500, "lavorazione", null],
    ]);
  });

  it("trova l'intestazione anche sotto un titolo", () => {
    const { righe, senzaIntestazione } = interpretaListino([["Listino 2026"], [], testa, ["Operaio", "ora", 30]]);
    expect(senzaIntestazione).toBe(false);
    expect(righe[0].riga).toBe(4);
  });

  it("senza Descrizione e Prezzo non legge niente", () => {
    expect(interpretaListino([["Nome", "Costo"], ["a", 1]]).senzaIntestazione).toBe(true);
  });

  it("una riga dubbia si scarta e dice perché, non si indovina", () => {
    const { righe } = interpretaListino([testa, ["", "ora", 30], ["A", "ora", "boh"], ["B", "ora", ""], ["C", "scatole", 3], ["D", "", 3], ["E", "ora", -1], ["F", "ora", 1, "", "X"], ["G", "ora", 2, "", "X"]]);
    expect(righe.map((r) => r.problema)).toEqual([
      "Manca la descrizione", "Prezzo non leggibile: «boh»", "Manca il prezzo", "Unità non riconosciuta: «scatole»",
      "Manca l'unità di misura", "Il prezzo non può essere negativo", null, "Codice ripetuto: X",
    ]);
  });

  it("zero euro scritto è un prezzo, le righe vuote si saltano", () => {
    const { righe } = interpretaListino([testa, ["Omaggio", "cad", 0], ["", "", ""]]);
    expect(righe).toHaveLength(1);
    expect(righe[0].problema).toBeNull();
  });
});

describe("quello che non si deve indovinare", () => {
  const prezzo = (v: unknown) => interpretaListino([["Descrizione", "Unità", "Prezzo"], ["Voce", "ora", v]]).righe[0];

  it.each(["-", "€ -", "0x10", "1e5", "12 34", "circa 5"])("«%s» non è un prezzo", (v) => {
    expect(prezzo(v).problema).toMatch(/Prezzo non leggibile/);
  });

  it("un prezzo scritto bene resta com'è", () => {
    expect(prezzo("€ 1.234,56").prezzo_unitario).toBe(1234.56);
    expect(prezzo("32,50 €").prezzo_unitario).toBe(32.5);
    expect(prezzo(1234.5).prezzo_unitario).toBe(1234.5);
  });

  it("due colonne per lo stesso dato si fermano e lo dicono", () => {
    expect(interpretaListino([["Descrizione", "Importo", "Prezzo", "Unità"], ["V", 100, 5, "ora"]]).colonneDoppie).toBe("Importo, Prezzo");
    expect(interpretaListino([["Articolo", "Descrizione", "Prezzo", "Unità"], ["A1", "V", 5, "ora"]]).colonneDoppie).toBe("Articolo, Descrizione");
  });

  it("una riga con più campi dell'intestazione si scarta", () => {
    expect(interpretaListino([["Descrizione", "Unità", "Prezzo"], ["Posa", "mq", "22", "50"]]).righe[0].problema).toMatch(/Più colonne/);
  });

  it("senza tipo non diventa manodopera da sola, e si chiede di sceglierlo", () => {
    const r = prezzo(80);
    expect(r.tipo).toBe("lavorazione");
    expect(r.tipoDaScegliere).toBe(true);
    const scritto = interpretaListino([["Descrizione", "Unità", "Prezzo", "Tipo"], ["Operaio", "ora", 30, "Manodopera"]]).righe[0];
    expect([scritto.tipo, scritto.tipoDaScegliere]).toEqual(["manodopera", false]);
  });

  it("un tipo scritto e sconosciuto non si sostituisce in silenzio", () => {
    expect(interpretaListino([["Descrizione", "Unità", "Prezzo", "Tipo"], ["V", "ora", 30, "Boh"]]).righe[0].problema).toBe("Tipo non riconosciuto: «Boh»");
  });

  it("la stessa voce due volte nel foglio entra una volta", () => {
    expect(interpretaListino([["Descrizione", "Unità", "Prezzo"], ["V", "ora", 1], ["v ", "ore", 2]]).righe[1].problema).toBe("Voce ripetuta nel foglio");
  });

  it("un CSV separato da virgole si rifiuta invece di spezzare i prezzi", async () => {
    const f = new File(["Descrizione,Unità,Prezzo\nPosa,mq,22,50\n"], "l.csv");
    Object.defineProperty(f, "arrayBuffer", { value: async () => new TextEncoder().encode("Descrizione,Unità,Prezzo\nPosa,mq,22,50\n").buffer });
    await expect(leggiFoglio(f)).rejects.toThrow(/virgola/);
  });

  it("un CSV di Excel in Windows-1252 tiene gli accenti", async () => {
    const byte = Uint8Array.from([...("Descrizione;Unit"), "\xe0", ...(";Prezzo")].map((c) => c.charCodeAt(0)));
    const f = new File([byte], "l.csv");
    Object.defineProperty(f, "arrayBuffer", { value: async () => byte.buffer });
    expect((await leggiFoglio(f))[0]).toEqual(["Descrizione", "Unità", "Prezzo"]);
  });
});

describe("aggiungere o sostituire", () => {
  const { righe } = interpretaListino([testa, ["Operaio", "ora", 30, "", ""], ["Nuova", "ora", 31, "", "K1"], ["Altra", "mq", 5, "", ""]]);
  const esistenti: VoceEsistente[] = [
    { codice: null, descrizione: "operaio ", unita_misura: "ora", attivo: true },
    { codice: "K1", descrizione: "Vecchia", unita_misura: "ora", attivo: true },
    { codice: null, descrizione: "Altra", unita_misura: "mq", attivo: false },
  ];

  it("aggiungendo non raddoppia per nome o per codice, e non conta le voci spente", () => {
    expect([...vociGiaPresenti(righe, esistenti, false)]).toEqual([righe[0].riga, righe[1].riga]);
  });

  it("sostituendo conta solo il foglio", () => {
    expect(vociGiaPresenti(righe, esistenti, true).size).toBe(0);
  });
});

describe("la scrittura nel database", () => {
  const sql = readFileSync("supabase/migrations/20290131110000_appalto_listino_carica_e_documenti_contratto.sql", "utf8");
  it("sostituire spegne, non cancella: i rendiconti restano attaccati alle loro voci", () => {
    expect(sql).toMatch(/set attivo = false/);
    expect(sql).not.toMatch(/delete from public\.appalto_tariffe/i);
  });
  it("gira coi permessi di chi carica", () => {
    expect(sql).toMatch(/security invoker/);
    expect(sql).toMatch(/revoke all on function public\.appalto_listino_carica\(uuid, boolean, jsonb\) from public, anon/);
  });
});
