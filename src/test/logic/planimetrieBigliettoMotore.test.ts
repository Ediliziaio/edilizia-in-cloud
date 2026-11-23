import { describe, expect, it } from "vitest";
import { emettiBiglietto, firma, firmaValida, leggiBiglietto, testoEsito, type Biglietto } from "../../../shared/planimetrie/bigliettoMotore";

const SEGRETO = "s".repeat(40);
const ADESSO = 1_800_000_000_000;
const base: Biglietto = {
  id: "0b6f2f3e-8c1a-4d55-9a0e-1f2a3b4c5d6e",
  azienda: "d2000000-0000-4000-a000-000000000002",
  utente: "11111111-2222-4333-8444-555555555555",
  operazione: "render",
  scade: ADESSO + 60_000,
  addebitato: true,
};

describe("biglietto del motore planimetrie", () => {
  it("un biglietto emesso si rilegge identico, per la sua operazione", async () => {
    const t = await emettiBiglietto(SEGRETO, base);
    expect(await leggiBiglietto(SEGRETO, t, { adesso: ADESSO, operazione: "render" })).toEqual({ ok: true, biglietto: base });
  });

  it("rifiuta segreto sbagliato, corpo alterato, scadenza passata e operazione diversa", async () => {
    const t = await emettiBiglietto(SEGRETO, base);
    expect(await leggiBiglietto("x".repeat(40), t, { adesso: ADESSO })).toEqual({ ok: false, motivo: "firma" });
    const [corpo, sig] = t.split(".");
    const alterato = btoa(JSON.stringify({ ...base, azienda: "e2000000-0000-4000-a000-000000000002" })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    expect((await leggiBiglietto(SEGRETO, `${alterato}.${sig}`, { adesso: ADESSO })).ok).toBe(false);
    expect(corpo).not.toBe(alterato);
    expect(await leggiBiglietto(SEGRETO, t, { adesso: base.scade + 1 })).toEqual({ ok: false, motivo: "scaduto" });
    expect(await leggiBiglietto(SEGRETO, t, { adesso: ADESSO, operazione: "dwg" })).toEqual({ ok: false, motivo: "operazione" });
    expect(await leggiBiglietto(SEGRETO, "spazzatura", { adesso: ADESSO })).toEqual({ ok: false, motivo: "formato" });
  });

  it("l'esito firmato dal container vale solo per quel biglietto e quell'esito", async () => {
    const t = await emettiBiglietto(SEGRETO, base);
    const s = await firma(SEGRETO, testoEsito(t, "fallito"));
    expect(await firmaValida(SEGRETO, testoEsito(t, "fallito"), s)).toBe(true);
    expect(await firmaValida(SEGRETO, testoEsito(t, "riuscito"), s)).toBe(false);
  });

  it("non accetta segreti corti", async () => {
    await expect(emettiBiglietto("corto", base)).rejects.toThrow(/troppo corto/);
  });
});
