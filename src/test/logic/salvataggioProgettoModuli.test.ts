/**
 * Salvataggio dei progetti degli otto moduli di preventivo.
 *
 * Il wizard rimandava la riga intera del progetto: un `totale: 0` rimasto in
 * memoria cancellava i totali del computo. E due salvataggi del computo
 * sovrapposti (autosave + uscita dallo step) duplicavano le righe.
 */
import { describe, it, expect } from "vitest";
import {
  aLotti, cambiaITotali, inFila, soloCampiDelForm,
} from "@/lib/moduli/salvataggioProgetto";

const giro = () => new Promise((r) => setTimeout(r, 0));

describe("il form non scrive le colonne del server", () => {
  it("toglie totali, stato, commessa, codice e date, e tiene il resto", () => {
    const riga = {
      cliente_nome: "Mario",
      sconto_pct: 5,
      note: null,
      totale: 0,
      totale_imponibile: 0,
      totale_iva: 0,
      stato: "bozza",
      ordine_id: null,
      code: "RST-2026-001",
      company_id: "azienda",
      created_at: "2026-09-01",
      created_by: "utente",
      updated_at: "2026-09-02",
      deleted_at: null,
    };
    expect(soloCampiDelForm(riga)).toEqual({ cliente_nome: "Mario", sconto_pct: 5, note: null });
  });

  it("sconto o IVA nel patch vogliono i totali ricalcolati, il resto no", () => {
    expect(cambiaITotali({ sconto_pct: 10 })).toBe(true);
    expect(cambiaITotali({ iva_pct: 0 })).toBe(true);
    expect(cambiaITotali({ sconto_pct: undefined, iva_pct: undefined })).toBe(false);
    expect(cambiaITotali({})).toBe(false);
  });
});

describe("i salvataggi dello stesso progetto passano uno alla volta", () => {
  it("il secondo parte solo quando il primo è finito", async () => {
    const eventi: string[] = [];
    let chiudiPrimo!: () => void;
    const primo = inFila("progetto-1", () => new Promise<string>((resolve) => {
      eventi.push("parte il primo");
      chiudiPrimo = () => {
        eventi.push("finisce il primo");
        resolve("primo");
      };
    }));
    const secondo = inFila("progetto-1", async () => {
      eventi.push("parte il secondo");
      return "secondo";
    });

    await giro();
    expect(eventi).toEqual(["parte il primo"]);

    chiudiPrimo();
    await expect(primo).resolves.toBe("primo");
    await expect(secondo).resolves.toBe("secondo");
    expect(eventi).toEqual(["parte il primo", "finisce il primo", "parte il secondo"]);
  });

  it("un salvataggio fallito non blocca quello dopo", async () => {
    const primo = inFila("progetto-2", async () => {
      throw new Error("rete assente");
    });
    const secondo = inFila("progetto-2", async () => "salvato");
    await expect(primo).rejects.toThrow("rete assente");
    await expect(secondo).resolves.toBe("salvato");
  });

  it("progetti diversi non si aspettano", async () => {
    let chiudiLento!: () => void;
    const lento = inFila("progetto-a", () => new Promise<void>((resolve) => {
      chiudiLento = resolve;
    }));
    await expect(inFila("progetto-b", async () => "b")).resolves.toBe("b");
    chiudiLento();
    await lento;
  });
});

describe("id da cancellare a lotti", () => {
  it("divide senza perdere né ripetere nulla", () => {
    expect(aLotti([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(aLotti(["a"], 100)).toEqual([["a"]]);
    expect(aLotti([], 100)).toEqual([]);
  });
});
