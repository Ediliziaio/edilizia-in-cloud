import { describe, it, expect } from "vitest";
import { saldoIvaFirmato } from "@/hooks/useFiscoPrevisto";

/**
 * Il piano di cassa a tredici settimane leggeva `saldo` dall'edge
 * `calcola-liquidazione-iva`, che lo restituisce in VALORE ASSOLUTO e mette il
 * segno altrove (`credito` / `dovuto` / `saldo_firmato`).
 *
 * Conseguenza: un trimestre a credito veniva iscritto fra le uscite, cioè un
 * F24 da pagare che non esiste. L'audit di settembre lo aveva visto su un
 * trimestre da 7.189,87 €; oggi quel caso non è riproducibile (nessuna azienda
 * ha una liquidazione diversa da zero fra 2024 e 2026), quindi il numero resta
 * qui come esempio e non come misura.
 */
describe("saldo IVA per il piano di cassa", () => {
  it("un trimestre a DEBITO resta positivo: è un'uscita", () => {
    expect(saldoIvaFirmato({ saldo: 1890, saldo_firmato: 1890, dovuto: true, credito: false }))
      .toBe(1890);
  });

  it("un trimestre a CREDITO diventa negativo: non è un'uscita", () => {
    expect(saldoIvaFirmato({ saldo: 7189.87, saldo_firmato: -7189.87, credito: true, dovuto: false }))
      .toBe(-7189.87);
  });

  it("l'esempio dell'audit: 7.189,87 € a credito non finiscono fra le uscite", () => {
    const saldo = saldoIvaFirmato({ saldo: 7189.87, saldo_firmato: -7189.87, credito: true });
    expect(saldo > 0).toBe(false);
  });

  it("senza saldo_firmato usa i flag: credito → negativo", () => {
    expect(saldoIvaFirmato({ saldo: 500, credito: true, dovuto: false })).toBe(-500);
  });

  it("senza saldo_firmato usa i flag: dovuto → positivo", () => {
    expect(saldoIvaFirmato({ saldo: 500, credito: false, dovuto: true })).toBe(500);
  });

  it("senza segno né flag legge «da versare», che è la lettura prudente", () => {
    expect(saldoIvaFirmato({ saldo: 500 })).toBe(500);
  });

  it("una risposta assente vale zero invece di rompere il piano", () => {
    expect(saldoIvaFirmato(null)).toBe(0);
    expect(saldoIvaFirmato(undefined)).toBe(0);
    expect(saldoIvaFirmato({})).toBe(0);
  });

  it("un saldo_firmato non numerico non passa: si torna ai flag", () => {
    expect(saldoIvaFirmato({ saldo: 300, saldo_firmato: NaN, credito: true })).toBe(-300);
  });
});
