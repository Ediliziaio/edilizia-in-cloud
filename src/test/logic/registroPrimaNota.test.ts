/**
 * La prima nota da stampare (09/11/2026): in pagina i movimenti vanno dal più
 * recente e il «progressivo» riparte a ogni pagina. Su carta un registro si
 * legge dal primo giorno, col saldo che cammina dal saldo iniziale a quello
 * finale.
 */
import { describe, expect, it } from "vitest";
import {
  costruisciRegistro,
  htmlRegistroPrimaNota,
  periodoInLettere,
  righeExcelPrimaNota,
  type MovimentoPrimaNota,
} from "@/lib/contabilita/registroPrimaNota";
import { AVVERTENZA_DOCUMENTO, identificativiAzienda, indirizzoDiUnaRiga } from "@/lib/contabilita/documentoContabile";

const m = (over: Partial<MovimentoPrimaNota> = {}): MovimentoPrimaNota => ({
  entry_date: "2026-03-10",
  direction: "entrata",
  category: "incassi",
  description: "Acconto cliente",
  amount: 1000,
  ...over,
});

const azienda = {
  ragione_sociale: "Edil Prova S.r.l.",
  partita_iva: "01234567890",
  codice_fiscale: "01234567890",
  indirizzo_via: "Via Roma",
  indirizzo_numero_civico: "12",
  indirizzo_cap: "20100",
  indirizzo_comune: "Milano",
  indirizzo_provincia: "MI",
};

describe("Il registro si legge dal primo giorno", () => {
  it("ordina per data e numera dall'uno", () => {
    const r = costruisciRegistro([
      m({ entry_date: "2026-03-20", description: "Terzo" }),
      m({ entry_date: "2026-03-01", description: "Primo" }),
      m({ entry_date: "2026-03-10", description: "Secondo" }),
    ]);
    expect(r.righe.map((x) => [x.numero, x.description])).toEqual([
      [1, "Primo"],
      [2, "Secondo"],
      [3, "Terzo"],
    ]);
  });

  it("il saldo parte da quello che c'era prima e arriva a quello che resta", () => {
    const r = costruisciRegistro(
      [
        m({ entry_date: "2026-03-01", amount: 1000 }),
        m({ entry_date: "2026-03-02", direction: "uscita", amount: 400 }),
        m({ entry_date: "2026-03-03", direction: "uscita", amount: 250.5 }),
      ],
      500,
    );
    expect(r.saldoIniziale).toBe(500);
    expect(r.righe.map((x) => x.saldo)).toEqual([1500, 1100, 849.5]);
    expect(r.totaleEntrate).toBe(1000);
    expect(r.totaleUscite).toBe(650.5);
    expect(r.saldoFinale).toBe(849.5);
  });

  it("i centesimi non scappano sommando tante righe", () => {
    const righe = Array.from({ length: 3 }, () => m({ amount: 0.1 }));
    expect(costruisciRegistro(righe).saldoFinale).toBe(0.3);
  });

  it("entrate e uscite stanno in colonne diverse, non col segno meno", () => {
    const r = costruisciRegistro([m(), m({ direction: "uscita", amount: 40 })]);
    expect(r.righe[0]).toMatchObject({ entrata: 1000, uscita: null });
    expect(r.righe[1]).toMatchObject({ entrata: null, uscita: 40 });
  });

  it("senza movimenti il saldo finale è quello iniziale", () => {
    expect(costruisciRegistro([], 250).saldoFinale).toBe(250);
  });
});

describe("Il periodo scritto in italiano", () => {
  it("dice le due date, o quella che c'è", () => {
    expect(periodoInLettere("2026-01-01", "2026-03-31")).toBe("Dal 01/01/2026 al 31/03/2026");
    expect(periodoInLettere("", "2026-03-31")).toBe("Fino al 31/03/2026");
    expect(periodoInLettere("2026-01-01", "")).toBe("Dal 01/01/2026");
    expect(periodoInLettere("", "")).toBe("Tutto lo storico");
  });
});

describe("L'intestazione dell'azienda", () => {
  it("mette insieme indirizzo e identificativi, saltando i buchi", () => {
    expect(indirizzoDiUnaRiga(azienda)).toBe("Via Roma 12 · 20100 Milano (MI)");
    expect(indirizzoDiUnaRiga({ indirizzo_comune: "Torino" })).toBe("Torino");
    // Partita IVA e codice fiscale uguali: si scrive una volta sola.
    expect(identificativiAzienda(azienda)).toBe("P.IVA 01234567890");
    expect(identificativiAzienda({ partita_iva: "1", codice_fiscale: "ABC" }))
      .toBe("P.IVA 1 · C.F. ABC");
  });
});

describe("Il foglio da stampare", () => {
  const html = htmlRegistroPrimaNota({
    azienda,
    movimenti: [m({ entry_date: "2026-03-01" }), m({ entry_date: "2026-03-02", direction: "uscita", amount: 400 })],
    dal: "2026-03-01",
    al: "2026-03-31",
  });

  it("porta chi è, che periodo è e quando è stato fatto", () => {
    expect(html).toContain("Edil Prova S.r.l.");
    expect(html).toContain("P.IVA 01234567890");
    expect(html).toContain("Dal 01/03/2026 al 31/03/2026");
    expect(html).toContain("Generato il");
  });

  it("è un A4 con l'intestazione della tabella ripetuta a ogni pagina", () => {
    expect(html).toContain("@page{size:A4");
    expect(html).toContain("thead{display:table-header-group;}");
    expect(html).toContain("break-inside:avoid");
  });

  it("dice chiaro che non è un registro bollato", () => {
    expect(html).toContain(AVVERTENZA_DOCUMENTO);
    expect(AVVERTENZA_DOCUMENTO).toMatch(/Non è un registro bollato/);
  });

  it("chiude col saldo finale, non con una somma qualsiasi", () => {
    expect(html).toContain("Saldo finale");
    expect(html).toContain("Saldo iniziale");
  });

  it("le migliaia hanno il punto anche sotto le diecimila", () => {
    // Il browser di serie raggruppa solo da cinque cifre: in una colonna
    // incolonnata «1500,00 €» accanto a «12.200,00 €» si vede subito.
    const mille = htmlRegistroPrimaNota({
      azienda,
      movimenti: [m({ amount: 1500 })],
      dal: "2026-03-01",
      al: "2026-03-31",
    });
    expect(mille).toContain("1.500,00");
    expect(mille).not.toMatch(/>1500,00/);
  });

  it("senza movimenti lo dice invece di lasciare il foglio bianco", () => {
    const vuoto = htmlRegistroPrimaNota({ azienda, movimenti: [], dal: "2026-03-01", al: "2026-03-31" });
    expect(vuoto).toContain("Nessun movimento in questo periodo.");
  });

  it("i caratteri speciali di una descrizione non rompono la pagina", () => {
    const cattivo = htmlRegistroPrimaNota({
      azienda,
      movimenti: [m({ description: '<script>"Rossi & Figli"</script>' })],
      dal: "2026-03-01",
      al: "2026-03-31",
    });
    expect(cattivo).not.toContain("<script>");
    expect(cattivo).toContain("&lt;script&gt;");
    expect(cattivo).toContain("Rossi &amp; Figli");
  });
});

describe("Il foglio Excel", () => {
  it("porta i numeri veri, non il testo, e dice da dove nasce la riga", () => {
    const r = costruisciRegistro([m({ is_auto: true, account_label: "banca" }), m({ direction: "uscita", amount: 40 })]);
    const righe = righeExcelPrimaNota(r);
    expect(righe[0]).toMatchObject({ entrate: 1000, uscite: 0, saldo: 1000, origine: "Automatica", conto: "Banca" });
    expect(righe[1]).toMatchObject({ entrate: 0, uscite: 40, saldo: 960, origine: "A mano" });
    expect(typeof righe[0].saldo).toBe("number");
  });
});
