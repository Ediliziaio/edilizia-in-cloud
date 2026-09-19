import { describe, it, expect } from "vitest";
import {
  avanzamento, chiudiSeFinito, dataFic, dopoErrore, dopoPagina, leggiStato, nuovoGiro,
  parametriPagina, prossimoFlusso, ERRORI_PRIMA_DELLA_PAUSA, type StatoImport,
} from "../../../supabase/functions/_shared/importFicStato";

const T0 = new Date("2026-09-19T10:00:00Z");

describe("dataFic", () => {
  it("ora di Roma nel formato di FIC, anche col cambio d'ora", () => {
    expect(dataFic(new Date("2026-09-19T10:00:00Z"))).toBe("2026-09-19 12:00:00");
    expect(dataFic(new Date("2026-01-10T23:30:05Z"))).toBe("2026-01-11 00:30:05");
  });
});

describe("nuovoGiro", () => {
  it("la prima volta scarica tutto lo storico", () => {
    const s = nuovoGiro(null, T0);
    expect(s.tipo).toBe("completo");
    expect(s.da).toBeNull();
    expect(prossimoFlusso(s)).toBe("invoice");
  });
  it("dopo un giro finito chiede solo i cambiati, con un giorno di margine", () => {
    const finito = chiudiSeFinito({
      ...nuovoGiro(null, T0),
      flussi: {
        invoice: { pagina: 21, ultima_pagina: 21, totale: 2079, elaborati: 2079, fatto: true },
        credit_note: { pagina: 2, ultima_pagina: 2, totale: 124, elaborati: 124, fatto: true },
        received: { pagina: 70, ultima_pagina: 70, totale: 6980, elaborati: 6980, fatto: true },
      },
    }, new Date("2026-09-19T11:05:00Z"));
    expect(finito.in_corso).toBe(false);
    expect(finito.aggiornato_fino_a).toBe(T0.toISOString());

    const dopo = nuovoGiro(finito, new Date("2026-09-20T05:14:00Z"));
    expect(dopo.tipo).toBe("aggiornamento");
    expect(dopo.da).toBe("2026-09-18 12:00:00");
    expect(dopo.flussi.invoice.pagina).toBe(1);
  });
});

describe("dopoPagina", () => {
  const f0 = nuovoGiro(null, T0).flussi.invoice;
  it("pagina piena che non è l'ultima: avanti", () => {
    const f = dopoPagina(f0, { ricevuti: 100, ultimaPagina: 21, totale: 2079 });
    expect(f).toMatchObject({ pagina: 2, fatto: false, elaborati: 100, totale: 2079 });
  });
  it("pagina non piena: flusso finito, il cursore resta", () => {
    expect(dopoPagina({ ...f0, pagina: 21 }, { ricevuti: 79, ultimaPagina: 21 })).toMatchObject({ pagina: 21, fatto: true });
  });
  it("ultima pagina piena: finito lo stesso", () => {
    expect(dopoPagina({ ...f0, pagina: 3 }, { ricevuti: 100, ultimaPagina: 3 }).fatto).toBe(true);
  });
  it("nessun documento: finito", () => {
    expect(dopoPagina(f0, { ricevuti: 0, ultimaPagina: 1, totale: 0 }).fatto).toBe(true);
  });
});

describe("giro a blocchi", () => {
  it("fatture, poi note di credito, poi ricevute; chiude solo alla fine", () => {
    let s: StatoImport = nuovoGiro(null, T0);
    s = { ...s, flussi: { ...s.flussi, invoice: { ...s.flussi.invoice, fatto: true } } };
    expect(prossimoFlusso(s)).toBe("credit_note");
    s = { ...s, flussi: { ...s.flussi, credit_note: { ...s.flussi.credit_note, fatto: true } } };
    expect(prossimoFlusso(s)).toBe("received");
    expect(chiudiSeFinito(s, T0).in_corso).toBe(true);
  });
});

describe("dopoErrore", () => {
  it("si ferma un'ora solo dopo errori ripetuti", () => {
    let s = nuovoGiro(null, T0);
    for (let i = 1; i < ERRORI_PRIMA_DELLA_PAUSA; i++) s = dopoErrore(s, `e${i}`, T0);
    expect(s.sospeso_fino_a).toBeNull();
    s = dopoErrore(s, "ultimo", T0);
    expect(s.sospeso_fino_a).toBe("2026-09-19T11:00:00.000Z");
  });
});

describe("avanzamento e parametri", () => {
  it("totale noto solo quando ogni flusso ancora aperto lo ha dichiarato", () => {
    const s = nuovoGiro(null, T0);
    s.flussi.invoice = { pagina: 3, ultima_pagina: 21, totale: 2079, elaborati: 200, fatto: false };
    expect(avanzamento(s)).toEqual({ elaborati: 200, totale: null });
    s.flussi.credit_note.totale = 124;
    s.flussi.received.totale = 6980;
    expect(avanzamento(s)).toEqual({ elaborati: 200, totale: 9183 });
  });
  it("ordinati per id; tipo solo sulle emesse; filtro solo negli aggiornamenti", () => {
    const s = nuovoGiro(null, T0);
    expect(parametriPagina(s, "invoice")).toMatchObject({ type: "invoice", sort: "id", page: "1", per_page: "100" });
    expect(parametriPagina(s, "received").type).toBeUndefined();
    expect(parametriPagina(s, "invoice").q).toBeUndefined();
    expect(parametriPagina({ ...s, da: "2026-09-18 12:00:00" }, "received").q).toBe("updated_at >= '2026-09-18 12:00:00'");
  });
  it("uno stato salvato illeggibile vale «mai importato»", () => {
    expect(leggiStato(null)).toBeNull();
    expect(leggiStato({ foo: 1 })).toBeNull();
    expect(leggiStato(nuovoGiro(null, T0))?.versione).toBe(1);
  });
});
