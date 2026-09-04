import { describe, it, expect } from "vitest";
import {
  csvDaRighe,
  cellaCsv,
  nomeArchivio,
  riepilogoTestuale,
  TABELLE_EXPORT,
} from "@/lib/export/esportaDatiAzienda";

/**
 * L'export completo è la cosa che un imprenditore usa quando vuole portarsi via
 * i suoi dati. Se il CSV sfalsa le colonne o il riepilogo tace su una tabella
 * mancante, se ne accorge quando è troppo tardi per rimediare.
 */

describe("csvDaRighe", () => {
  it("nessuna riga = nessun file", () => {
    expect(csvDaRighe([])).toBe("");
  });

  it("intestazioni dall'unione delle chiavi: una riga incompleta non sfalsa le colonne", () => {
    const csv = csvDaRighe([
      { id: "1", nome: "Rossi" },
      { id: "2", citta: "Milano" },
    ]);
    const [testa, r1, r2] = csv.split("\r\n");
    expect(testa).toBe("id;nome;citta");
    expect(r1).toBe("1;Rossi;");
    expect(r2).toBe("2;;Milano");
  });

  it("protegge il punto e virgola, le virgolette e gli a capo dentro una cella", () => {
    const csv = csvDaRighe([{ note: 'ha detto "sì"; poi\nè uscito' }]);
    expect(csv.split("\r\n")[1]).toBe('"ha detto ""sì""; poi\nè uscito"');
  });

  it("neutralizza le formule: una cella non deve eseguirsi all'apertura", () => {
    const csv = csvDaRighe([{ nome: "=cmd|' /C calc'!A0" }]);
    expect(csv.split("\r\n")[1].startsWith("'=")).toBe(true);
  });

  it("un numero negativo resta un numero, non diventa testo", () => {
    const csv = csvDaRighe([{ saldo: "-1.234,56" }]);
    expect(csv.split("\r\n")[1]).toBe("-1.234,56");
  });

  it("gli oggetti finiscono in JSON, non in [object Object]", () => {
    expect(cellaCsv({ a: 1 })).toBe('{"a":1}');
    expect(cellaCsv([1, 2])).toBe("[1,2]");
  });

  it("null e undefined diventano celle vuote", () => {
    expect(cellaCsv(null)).toBe("");
    expect(cellaCsv(undefined)).toBe("");
    expect(cellaCsv(0)).toBe("0");
    expect(cellaCsv(false)).toBe("false");
  });
});

describe("nomeArchivio", () => {
  it("nome azienda e data, così due export non si confondono", () => {
    expect(nomeArchivio("Demo Azienda S.r.l.", new Date("2026-09-03T10:00:00Z")))
      .toBe("dati-demo-azienda-s-r-l-2026-09-03.zip");
  });

  it("regge accenti, simboli e nome mancante", () => {
    expect(nomeArchivio("Città & Ponteggi", new Date("2026-01-05T00:00:00Z")))
      .toBe("dati-citta-ponteggi-2026-01-05.zip");
    expect(nomeArchivio(null, new Date("2026-01-05T00:00:00Z")))
      .toBe("dati-azienda-2026-01-05.zip");
    expect(nomeArchivio("***", new Date("2026-01-05T00:00:00Z")))
      .toBe("dati-azienda-2026-01-05.zip");
  });
});

describe("riepilogoTestuale", () => {
  it("elenca cosa c'è dentro con i conteggi", () => {
    const t = riepilogoTestuale(
      [{ tabella: "orders", etichetta: "Commesse", righe: 12 }],
      "Demo",
    );
    expect(t).toContain("Commesse: 12 righe");
    expect(t).not.toContain("NON ESPORTATO");
  });

  it("dichiara a voce alta quello che NON è entrato", () => {
    // È il punto: un backup che tace su ciò che gli manca è peggio di nessuno.
    const t = riepilogoTestuale(
      [
        { tabella: "orders", etichetta: "Commesse", righe: 3 },
        { tabella: "tickets", etichetta: "Ticket di assistenza", righe: 0, errore: "permesso negato" },
      ],
      "Demo",
    );
    expect(t).toContain("NON ESPORTATO");
    expect(t).toContain("Ticket di assistenza: permesso negato");
  });
});

describe("elenco delle tabelle", () => {
  it("nomi di file unici: due tabelle non si sovrascrivono nello zip", () => {
    const file = TABELLE_EXPORT.map((t) => t.file);
    expect(new Set(file).size).toBe(file.length);
  });

  it("ogni voce ha tabella, file ed etichetta", () => {
    for (const t of TABELLE_EXPORT) {
      expect(t.tabella.length, t.tabella).toBeGreaterThan(0);
      expect(t.file.length, t.tabella).toBeGreaterThan(0);
      expect(t.etichetta.length, t.tabella).toBeGreaterThan(0);
    }
  });
});
