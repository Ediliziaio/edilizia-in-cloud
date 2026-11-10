import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { erroreFormatoOda, erroreProssimoOda, formattaNumeroOda, messaggioErroreNumeroOda, numeroManualeOda } from "@/lib/acquisti/numerazioneOda";
import { emptyForm, payloadFornitore, supplierToForm, type Supplier } from "@/lib/suppliers/anagraficaFornitore";

describe("formattaNumeroOda: stesso risultato di public.oda_formatta_numero", () => {
  // Valori presi dalla prova della migrazione sul database (transazione annullata).
  it.each([
    ["ODA-{anno}-{n:4}", 12, new Date(2026, 10, 10), "ODA-2026-0012"],
    ["{n}", 26130, new Date(2026, 10, 10), "26130"],
    ["{n:2}", 12345, new Date(2026, 10, 10), "12345"],
    ["{aa}{n:3}-{n}", 5, new Date(2027, 0, 1), "27005-5"],
    ["K-{aa}/{n:3}", 7, new Date(2026, 10, 10), "K-26/007"],
    ["", 9, new Date(2026, 10, 10), "9"],
  ])("%s con %d → %s", (formato, n, data, atteso) => {
    expect(formattaNumeroOda(formato, n, data)).toBe(atteso);
  });
});

describe("controlli del modulo", () => {
  it("il formato deve avere {n}", () => {
    expect(erroreFormatoOda("{n}")).toBeNull();
    expect(erroreFormatoOda("ODA-{anno}-{n:4}")).toBeNull();
    expect(erroreFormatoOda("ODA-{anno}")).toMatch(/serve \{n\}/);
    expect(erroreFormatoOda("")).not.toBeNull();
  });
  it("il prossimo numero è un intero da 1", () => {
    expect(erroreProssimoOda("26131")).toBeNull();
    expect(erroreProssimoOda("0")).not.toBeNull();
    expect(erroreProssimoOda("12a")).not.toBeNull();
    expect(erroreProssimoOda("")).not.toBeNull();
  });
  it("un doppione dice quale numero è già usato", () => {
    expect(messaggioErroreNumeroOda({ code: "23505", message: "duplicate key value violates unique constraint \"uq_oda_number_company\"" }, "26130"))
      .toBe("Il numero 26130 è già usato da un altro ordine");
  });
});

describe("numero del nuovo ordine", () => {
  it("lasciato com'è o vuoto lo assegna il database", () => {
    expect(numeroManualeOda(null, "26131")).toBeNull();
    expect(numeroManualeOda("26131", "26131")).toBeNull();
    expect(numeroManualeOda("  ", "26131")).toBeNull();
    expect(numeroManualeOda(" 900 ", "26131")).toBe("900");
  });
});

describe("numerazione propria del fornitore", () => {
  const base = { ...emptyForm, name: "Klasse" };
  it("chi non la tocca non manda le colonne", () => {
    const p = payloadFornitore(base);
    expect(p).not.toHaveProperty("oda_prossimo");
    expect(p).not.toHaveProperty("oda_formato");
  });
  it("accesa: formato e prossimo", () => {
    const p = payloadFornitore({ ...base, oda_numerazione_propria: true, oda_formato: "K-{n:3}", oda_prossimo: "7" });
    expect(p).toMatchObject({ oda_formato: "K-{n:3}", oda_prossimo: 7 });
  });
  it("spenta su un fornitore che l'aveva: torna alla numerazione dell'azienda", () => {
    const fornitore = { id: "f", name: "Klasse", oda_prossimo: 7, oda_formato: "{n}" } as unknown as Supplier;
    const form = supplierToForm(fornitore);
    expect(form.oda_numerazione_propria).toBe(true);
    const p = payloadFornitore({ ...form, oda_numerazione_propria: false });
    expect(p).toMatchObject({ oda_formato: null, oda_prossimo: null });
  });
  it("accesa senza {n}: errore prima di salvare", () => {
    expect(() => payloadFornitore({ ...base, oda_numerazione_propria: true, oda_formato: "ODA", oda_prossimo: "1" })).toThrow(/Numerazione degli ordini/);
  });
});

describe("la migrazione", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const sql = readFileSync(resolve(dir, readdirSync(dir).find((f) => f.endsWith("_numerazione_ordini_fornitore.sql"))!), "utf8");
  it("tiene chiuse ad anon le funzioni nuove e il vincolo di unicità resta", () => {
    expect(sql).toMatch(/revoke all on function public\.generate_oda_number\(uuid, uuid\) from public, anon/);
    expect(sql).toMatch(/revoke all on function public\.anteprima_numero_oda\(uuid, uuid\) from public, anon/);
    expect(sql).not.toMatch(/drop constraint if exists uq_oda_number_company/i);
  });
  it("Vulcano: rinomina solo la bozza ODA-2026-0007, se 26130 è libero", () => {
    expect(sql).toMatch(/oda_number = 'ODA-2026-0007'\s+and po\.status = 'bozza'/);
    expect(sql).toMatch(/'\{n\}', 26131/);
  });
});
