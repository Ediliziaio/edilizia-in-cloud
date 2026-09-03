import { describe, it, expect } from "vitest";

/**
 * I validatori fiscali ora bloccano davvero il salvataggio (scheda cliente e
 * creazione cliente): se sbagliano, un cliente legittimo non riesce più a
 * entrare in anagrafica. Da qui in poi sono coperti.
 */
import {
  validatePartitaIva,
  validateCodiceFiscale,
  carattereControlloCF,
  validateCAP,
  validateProvincia,
} from "@/lib/italianFiscalValidation";

describe("validatePartitaIva", () => {
  it("accetta partite IVA reali col checksum giusto", () => {
    // Checksum verificato a mano con l'algoritmo MEF.
    for (const piva of ["12345678903", "00743110157", "00159560366"]) {
      expect(validatePartitaIva(piva).ok, piva).toBe(true);
    }
  });

  it("rifiuta il checksum sbagliato", () => {
    // 12345678903 è valida: cambiando l'ultima cifra non lo è più.
    expect(validatePartitaIva("12345678901").ok).toBe(false);
    expect(validatePartitaIva("12345678901").hint).toMatch(/checksum/i);
  });

  it("rifiuta lunghezze diverse da 11 cifre", () => {
    expect(validatePartitaIva("1234567890").ok).toBe(false);
    expect(validatePartitaIva("123456789012").ok).toBe(false);
    expect(validatePartitaIva("1234567890A").ok).toBe(false);
  });

  it("tollera spazi e prefisso IT, che l'utente scrive sempre", () => {
    expect(validatePartitaIva("IT12345678903").ok).toBe(true);
    expect(validatePartitaIva(" 123 456 789 03 ").ok).toBe(true);
  });

  it("non blocca una partita IVA estera, che non sa verificare", () => {
    // Bloccarla significherebbe non poter censire un cliente tedesco.
    expect(validatePartitaIva("DE123456789").ok).toBe(true);
    expect(validatePartitaIva("SM12345").ok).toBe(true);
    // Ma "IT" resta il prefisso italiano e il checksum si applica lo stesso.
    expect(validatePartitaIva("IT12345678901").ok).toBe(false);
  });

  it("campo vuoto = nessun errore: la P.IVA resta facoltativa", () => {
    expect(validatePartitaIva("").ok).toBe(true);
    expect(validatePartitaIva(null).ok).toBe(true);
    expect(validatePartitaIva(undefined).ok).toBe(true);
  });
});

describe("carattereControlloCF", () => {
  it("calcola il 16° carattere secondo il DM 23/12/1976", () => {
    expect(carattereControlloCF("RSSMRA80A01H50")).toBeDefined();
    expect(carattereControlloCF("RSSMRA80A01H501")).toBe("U");
    expect(carattereControlloCF("BNCLCU85M42F205")).toBe("Y");
  });
});

describe("validateCodiceFiscale", () => {
  it("accetta un CF con carattere di controllo giusto", () => {
    expect(validateCodiceFiscale("RSSMRA80A01H501U").ok).toBe(true);
    expect(validateCodiceFiscale("BNCLCU85M42F205Y").ok).toBe(true);
  });

  it("rifiuta un CF plausibile ma inventato", () => {
    // Formato perfetto, ultimo carattere sbagliato: prima passava.
    const esito = validateCodiceFiscale("RSSMRA80A01H501Z");
    expect(esito.ok).toBe(false);
    expect(esito.hint).toMatch(/controllo/i);
  });

  it("accetta l'omocodia: le cifre diventano lettere e resta valido", () => {
    // Stesso CF con l'ultima cifra del comune resa omocodica (1 → M),
    // ricalcolando il carattere di controllo.
    const primi15 = "RSSMRA80A01H50M";
    const cf = primi15 + carattereControlloCF(primi15);
    expect(validateCodiceFiscale(cf).ok).toBe(true);
  });

  it("rifiuta un mese fuori dalle lettere ammesse", () => {
    // 'G' non è un mese valido (le lettere sono A-E, H, L, M, P, R, S, T).
    expect(validateCodiceFiscale("RSSMRA80G01H501U").ok).toBe(false);
  });

  it("una società usa la P.IVA: 11 cifre passano dal controllo P.IVA", () => {
    expect(validateCodiceFiscale("12345678903").ok).toBe(true);
    expect(validateCodiceFiscale("12345678901").ok).toBe(false);
  });

  it("normalizza minuscole e spazi", () => {
    expect(validateCodiceFiscale(" rssmra80a01h501u ").ok).toBe(true);
  });

  it("campo vuoto = nessun errore", () => {
    expect(validateCodiceFiscale("").ok).toBe(true);
    expect(validateCodiceFiscale(null).ok).toBe(true);
  });
});

describe("CAP e provincia", () => {
  it("il CAP sono 5 cifre", () => {
    expect(validateCAP("20121").ok).toBe(true);
    expect(validateCAP("2012").ok).toBe(false);
  });

  it("la provincia sono 2 lettere", () => {
    expect(validateProvincia("MI").ok).toBe(true);
    expect(validateProvincia("MIL").ok).toBe(false);
  });
});
