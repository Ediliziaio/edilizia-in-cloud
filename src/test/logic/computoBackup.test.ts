import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { creaBackupComputo, ripristinaBackupComputo } from "@/lib/computo/backupComputo";
import { caricaAllegatoLocale, leggiAllegatoLocale } from "@/lib/computo/allegatiLocali";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";
import { applicaVarianteComputo } from "@/lib/computo/variantiPdf";

beforeAll(() => vi.stubGlobal("Blob", NodeBlob));
afterAll(() => vi.unstubAllGlobals());
const bozza = () => ({ ...bozzaVuota(), committente: "Cliente locale", voci: [{ ...voceVuota(), descrizione: "Intonaco", quantita: "4", prezzo: "12" }] });
const allegato = async (scope: string) => caricaAllegatoLocale(scope, new NodeFile(["%PDF-prova"], "planimetria.pdf", { type: "application/pdf" }) as unknown as File, "planimetria");

describe("copia completa del computo", () => {
  it.each(["cliente", "tecnico", "senza-prezzi", "riepilogo"] as const)("conserva IVA e allegati nella copia della versione %s", async formato => {
    const origine = crypto.randomUUID(), destinazione = crypto.randomUUID();
    const meta = await allegato(origine);
    const originale = applicaVarianteComputo({ ...bozza(), ivaModalita: "applicata", ivaAliquota: "22", ivaNota: "Nota di prova", allegati: [meta] }, formato);
    const copia = await creaBackupComputo(origine, originale);
    const ripristinata = await ripristinaBackupComputo(destinazione, await copia.text());
    expect(ripristinata).toMatchObject({ ivaModalita: "applicata", ivaAliquota: "22", ivaNota: "Nota di prova", formatoPdf: formato });
    expect(ripristinata.voci).toEqual(originale.voci);
    expect(ripristinata.allegati[0]).toMatchObject({ nome: meta.nome, includi: true, mime: "application/pdf" });
    expect(await (await leggiAllegatoLocale(destinazione, ripristinata.allegati[0].id))?.text()).toBe("%PDF-prova");
  });
  it("trasporta dati, file e selezioni in un altro ambito senza sovrascrivere gli originali", async () => {
    const origine = crypto.randomUUID(), destinazione = crypto.randomUUID();
    const meta = { ...await allegato(origine), includi: false };
    const originale = { ...bozza(), allegati: [meta] };
    const copia = await creaBackupComputo(origine, originale);
    const ripristinata = await ripristinaBackupComputo(destinazione, await copia.text());
    expect(ripristinata.voci).toEqual(originale.voci);
    expect(ripristinata.allegati[0]).toMatchObject({ nome: meta.nome, includi: false, dimensione: meta.dimensione });
    expect(ripristinata.allegati[0].id).not.toBe(meta.id);
    expect(await (await leggiAllegatoLocale(destinazione, ripristinata.allegati[0].id))?.text()).toBe("%PDF-prova");
    expect(await leggiAllegatoLocale(destinazione, meta.id)).toBeNull();
    expect(await (await leggiAllegatoLocale(origine, meta.id))?.text()).toBe("%PDF-prova");
    expect(originale.allegati[0].id).toBe(meta.id);
  });
  it("mantiene compatibilità con copie JSON senza allegati", async () => {
    const originale = bozza();
    expect(await ripristinaBackupComputo("legacy", JSON.stringify(originale))).toEqual(originale);
    expect(await ripristinaBackupComputo("nuova", await (await creaBackupComputo("legacy", originale)).text())).toEqual(originale);
  });
  it("non dichiara completa una copia con file mancanti, anche se esclusi dal PDF", async () => {
    const scope = crypto.randomUUID(), meta = await allegato(scope);
    await expect(creaBackupComputo("inesistente", { ...bozza(), allegati: [{ ...meta, includi: false }] })).rejects.toThrow(/manca planimetria/);
    await expect(ripristinaBackupComputo("inesistente", JSON.stringify({ ...bozza(), allegati: [meta] }))).rejects.toThrow(/non contiene i file/);
  });
  it("apre una vecchia copia con allegati solo dove i file esistono ancora", async () => {
    const scope = crypto.randomUUID(), meta = await allegato(scope);
    const originale = { ...bozza(), allegati: [meta] };
    expect(await ripristinaBackupComputo(scope, JSON.stringify(originale))).toEqual(originale);
  });
  it.each(["versione", "numero", "duplicati", "base64", "dimensione", "id"]) ("rifiuta una copia corrotta: %s", async caso => {
    const scope = crypto.randomUUID(), meta = await allegato(scope);
    const dati = JSON.parse(await (await creaBackupComputo(scope, { ...bozza(), allegati: [meta] })).text());
    if (caso === "versione") dati.versione = 99;
    if (caso === "numero") dati.allegati = [];
    if (caso === "duplicati") { dati.allegati.push(dati.allegati[0]); dati.bozza.allegati.push({ ...meta, id: crypto.randomUUID() }); }
    if (caso === "base64") dati.allegati[0].dati = "!!!!";
    if (caso === "dimensione") dati.bozza.allegati[0].dimensione += 1;
    if (caso === "id") dati.allegati[0].id = crypto.randomUUID();
    await expect(ripristinaBackupComputo(crypto.randomUUID(), JSON.stringify(dati))).rejects.toThrow();
    expect(await (await leggiAllegatoLocale(scope, meta.id))?.text()).toBe("%PDF-prova");
  });
});
