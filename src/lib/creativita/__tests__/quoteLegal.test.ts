/**
 * Test delle tutele legali sulla firma del preventivo.
 *
 * Prima di questo modulo la firma avveniva col solo nome digitato: nessuna
 * accettazione delle condizioni, nessuna informativa sul ripensamento, nessuna
 * approvazione delle clausole vessatorie. Qui si blinda che i consensi
 * obbligatori non possano essere saltati e che la prova conservata sia completa.
 */
import { describe, it, expect } from "vitest";
import {
  CLAUSOLE_VESSATORIE_TIPO,
  CONSENSO,
  GIORNI_RECESSO,
  consensiObbligatori,
  contenutoCanonico,
  costruisciProvaFirma,
  improntaDocumento,
  riepilogoPerEmail,
  testoInizioAnticipato,
  testoRecesso,
  validaConsensi,
  type ContestoFirma,
} from "../../../../supabase/functions/_shared/quoteLegal";

const consumatore: ContestoFirma = {
  tipoFirmatario: "consumatore",
  haCondizioni: true,
  clausoleVessatorie: [],
};

const ok = (chiavi: string[]) => chiavi.map((chiave) => ({ chiave, accettato: true }));

describe("consensiObbligatori", () => {
  it("al consumatore chiede sempre l'informativa sul ripensamento", () => {
    expect(consensiObbligatori(consumatore)).toContain(CONSENSO.RECESSO);
  });

  it("tra imprese il recesso non si applica e non viene chiesto", () => {
    const b2b = consensiObbligatori({ ...consumatore, tipoFirmatario: "professionista" });
    expect(b2b).not.toContain(CONSENSO.RECESSO);
    expect(b2b).toContain(CONSENSO.CONDIZIONI);
  });

  it("chiede l'approvazione specifica solo se ci sono clausole vessatorie", () => {
    expect(consensiObbligatori(consumatore)).not.toContain(CONSENSO.VESSATORIE);
    expect(
      consensiObbligatori({ ...consumatore, clausoleVessatorie: CLAUSOLE_VESSATORIE_TIPO }),
    ).toContain(CONSENSO.VESSATORIE);
  });

  it("senza condizioni contrattuali non ne chiede l'accettazione", () => {
    expect(consensiObbligatori({ ...consumatore, haCondizioni: false })).not.toContain(CONSENSO.CONDIZIONI);
  });

  it("la privacy è sempre richiesta", () => {
    expect(consensiObbligatori(consumatore)).toContain(CONSENSO.PRIVACY);
    expect(consensiObbligatori({ ...consumatore, haCondizioni: false, tipoFirmatario: "professionista" }))
      .toContain(CONSENSO.PRIVACY);
  });
});

describe("validaConsensi", () => {
  it("blocca la firma se manca anche un solo consenso obbligatorio", () => {
    const esito = validaConsensi(consumatore, ok([CONSENSO.CONDIZIONI, CONSENSO.PRIVACY]));
    expect(esito.valido).toBe(false);
    expect(esito.mancanti).toEqual([CONSENSO.RECESSO]);
  });

  it("il messaggio dice in italiano cosa manca", () => {
    const esito = validaConsensi(consumatore, []);
    expect(esito.messaggio).toMatch(/^Per firmare mancano:/);
    expect(esito.messaggio).toContain("ripensamento");
  });

  it("una spunta non accettata non vale come consenso", () => {
    const esito = validaConsensi(consumatore, [
      { chiave: CONSENSO.CONDIZIONI, accettato: true },
      { chiave: CONSENSO.PRIVACY, accettato: true },
      { chiave: CONSENSO.RECESSO, accettato: false },
    ]);
    expect(esito.valido).toBe(false);
  });

  it("passa quando ci sono tutti", () => {
    expect(validaConsensi(consumatore, ok(consensiObbligatori(consumatore))).valido).toBe(true);
  });

  it("l'inizio lavori anticipato è una facoltà, mai un obbligo", () => {
    const esito = validaConsensi(consumatore, ok(consensiObbligatori(consumatore)));
    expect(esito.valido).toBe(true);
    expect(consensiObbligatori(consumatore)).not.toContain(CONSENSO.INIZIO_ANTICIPATO);
  });
});

describe("testi informativi", () => {
  it("il recesso dichiara i 14 giorni di legge", () => {
    expect(testoRecesso()).toContain(String(GIORNI_RECESSO));
    expect(GIORNI_RECESSO).toBe(14);
  });

  it("sui lavori su misura avvisa che il ripensamento non si applica", () => {
    const t = testoRecesso({ lavoriSuMisura: true });
    expect(t.toLowerCase()).toMatch(/misura|personalizzat/);
    expect(t.toLowerCase()).toContain("non si applica");
    expect(t).not.toBe(testoRecesso());
  });

  it("usa il nome dell'azienda quando disponibile", () => {
    expect(testoRecesso({ nomeAzienda: "Best Infissi" })).toContain("Best Infissi");
  });

  it("l'inizio anticipato spiega la conseguenza economica", () => {
    expect(testoInizioAnticipato().toLowerCase()).toContain("pagare");
  });
});

describe("improntaDocumento", () => {
  it("stessa offerta → stessa impronta", async () => {
    const q = { quote_number: "P-1", total: 1000, items: [{ name: "Finestra", quantity: 2, unit_price: 500, line_total: 1000 }] };
    expect(await improntaDocumento(contenutoCanonico(q))).toBe(await improntaDocumento(contenutoCanonico(q)));
  });

  it("cambia il totale → cambia l'impronta (la modifica è dimostrabile)", async () => {
    const a = contenutoCanonico({ quote_number: "P-1", total: 1000 });
    const b = contenutoCanonico({ quote_number: "P-1", total: 1200 });
    expect(await improntaDocumento(a)).not.toBe(await improntaDocumento(b));
  });

  it("cambia una riga → cambia l'impronta", async () => {
    const a = contenutoCanonico({ total: 1000, items: [{ name: "Finestra", quantity: 2, unit_price: 500, line_total: 1000 }] });
    const b = contenutoCanonico({ total: 1000, items: [{ name: "Finestra", quantity: 3, unit_price: 500, line_total: 1000 }] });
    expect(await improntaDocumento(a)).not.toBe(await improntaDocumento(b));
  });

  it("cambiano le condizioni contrattuali → cambia l'impronta", async () => {
    const a = contenutoCanonico({ total: 100, terms_and_conditions: "Pagamento 30gg" });
    const b = contenutoCanonico({ total: 100, terms_and_conditions: "Pagamento immediato" });
    expect(await improntaDocumento(a)).not.toBe(await improntaDocumento(b));
  });

  it("è uno SHA-256 esadecimale di 64 caratteri", async () => {
    expect(await improntaDocumento("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("costruisciProvaFirma", () => {
  const base = {
    firmatoDa: "Mario Rossi",
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
    improntaDocumento: "abc123",
    clausoleVessatorie: CLAUSOLE_VESSATORIE_TIPO,
    quando: new Date("2026-08-01T10:00:00Z"),
  };

  it("al consumatore calcola la scadenza del ripensamento a 14 giorni", () => {
    const p = costruisciProvaFirma({ ...base, tipoFirmatario: "consumatore", consensi: ok([CONSENSO.RECESSO]) });
    expect(p.recesso.applicabile).toBe(true);
    expect(p.recesso.scade_il?.slice(0, 10)).toBe("2026-08-15");
  });

  it("tra imprese non calcola scadenze di recesso", () => {
    const p = costruisciProvaFirma({ ...base, tipoFirmatario: "professionista", consensi: [] });
    expect(p.recesso.applicabile).toBe(false);
    expect(p.recesso.scade_il).toBeNull();
  });

  it("registra le clausole approvate solo se l'approvazione c'è stata", () => {
    const senza = costruisciProvaFirma({ ...base, tipoFirmatario: "consumatore", consensi: [] });
    expect(senza.clausole_approvate).toEqual([]);
    const con = costruisciProvaFirma({ ...base, tipoFirmatario: "consumatore", consensi: ok([CONSENSO.VESSATORIE]) });
    expect(con.clausole_approvate).toEqual(CLAUSOLE_VESSATORIE_TIPO.map((c) => c.codice));
  });

  it("segna la richiesta di inizio anticipato quando data", () => {
    const p = costruisciProvaFirma({ ...base, tipoFirmatario: "consumatore", consensi: ok([CONSENSO.INIZIO_ANTICIPATO]) });
    expect(p.recesso.inizio_anticipato_richiesto).toBe(true);
  });

  it("tronca lo user agent per non gonfiare il record", () => {
    const p = costruisciProvaFirma({ ...base, userAgent: "A".repeat(900), tipoFirmatario: "consumatore", consensi: [] });
    expect(p.user_agent.length).toBeLessThanOrEqual(400);
  });

  it("conserva chi, quando e da dove", () => {
    const p = costruisciProvaFirma({ ...base, tipoFirmatario: "consumatore", consensi: [] });
    expect(p).toMatchObject({ versione: 1, firmato_da: "Mario Rossi", ip: "1.2.3.4", impronta_documento: "abc123" });
    expect(p.firmato_il).toBe("2026-08-01T10:00:00.000Z");
  });
});

describe("riepilogoPerEmail", () => {
  it("dice al cliente entro quando può ripensarci", () => {
    const p = costruisciProvaFirma({
      firmatoDa: "Mario Rossi", tipoFirmatario: "consumatore", ip: "1.2.3.4", userAgent: "UA",
      improntaDocumento: "f".repeat(64), consensi: ok([CONSENSO.RECESSO]),
      clausoleVessatorie: [], quando: new Date("2026-08-01T10:00:00Z"),
    });
    const testo = riepilogoPerEmail(p);
    expect(testo).toContain("Mario Rossi");
    expect(testo).toContain("15/08/2026");
  });
});
