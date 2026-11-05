import { describe, expect, it } from "vitest";
import {
  articoloCerto, articoloSimile, bollaDaFile, chiaveBolla, conLettura, doppioni, dubbi, motivoScartoFile, perAttenzione, problemiBloccanti, pronte,
  quantitaAPezzi, scelteCerte, type BollaLetta, type RigaDaCaricare,
} from "@/lib/ddt/importBolle";
import { leggiDDTdaAI } from "@/lib/ddt/letturaAI";

const file = (nome = "a.pdf") => new File(["x"], nome, { type: "application/pdf" });
const bolla = (patch: Partial<BollaLetta> = {}): BollaLetta => ({
  ...bollaDaFile(file(), patch.id ?? "1", { destinazione: "magazzino" }),
  stato: "letta", numero: "12", data: "2026-11-01", supplierId: "s1", righe: [{ descrizione: "Sacchi" } as BollaLetta["righe"][number]], ...patch,
});

describe("cosa si può caricare", () => {
  it("PDF e foto sì, il resto no, e non oltre il limite della lettura", () => {
    expect(motivoScartoFile({ name: "a.pdf", type: "application/pdf", size: 10 })).toBeNull();
    expect(motivoScartoFile({ name: "a.HEIC", type: "", size: 10 })).toBeNull();
    expect(motivoScartoFile({ name: "a.docx", type: "application/msword", size: 10 })).toMatch(/PDF/);
    expect(motivoScartoFile({ name: "a.pdf", type: "application/pdf", size: 0 })).toMatch(/vuoto/);
    expect(motivoScartoFile({ name: "a.pdf", type: "application/pdf", size: 19 * 1024 * 1024 })).toMatch(/18 MB/);
  });
});

describe("i doppioni", () => {
  it("stesso fornitore, numero e data: il numero non cambia per spazi, barre e maiuscole", () => {
    expect(chiaveBolla("s", "ddt 12/A", "2026-11-01")).toBe(chiaveBolla("s", "DDT12A", "2026-11-01T10:00:00"));
    expect(chiaveBolla("s", "12", "2026-11-01")).not.toBe(chiaveBolla("t", "12", "2026-11-01"));
    expect(chiaveBolla("s", "", "2026-11-01")).toBeNull();
    expect(chiaveBolla("s", "12", "")).toBeNull();
  });

  it("riconosce quelle già presenti e quelle ripetute nel mucchio: vale la prima", () => {
    const a = bolla({ id: "a" });
    const b = bolla({ id: "b" });
    const c = bolla({ id: "c", numero: "99" });
    const d = doppioni([a, b, c], new Set([chiaveBolla("s1", "99", "2026-11-01")!]));
    expect([d.get("a"), d.get("b"), d.get("c")]).toEqual([null, "nel_mucchio", "gia_presente"]);
  });

  it("un doppione non parte, a meno che la persona lo dica", () => {
    const a = bolla({ id: "a" });
    const k = new Set([chiaveBolla("s1", "12", "2026-11-01")!]);
    expect(pronte([a], doppioni([a], k))).toEqual([]);
    const si = { ...a, caricaComunque: true };
    expect(pronte([si], doppioni([si], k))).toEqual([si]);
  });
});

describe("cosa va guardato", () => {
  it("senza numero, senza data o in cantiere senza commessa non si salva", () => {
    expect(problemiBloccanti(bolla())).toEqual([]);
    expect(problemiBloccanti(bolla({ numero: " " }))).toEqual(["manca il numero"]);
    expect(problemiBloccanti(bolla({ data: "" }))).toEqual(["manca la data"]);
    expect(problemiBloccanti(bolla({ destinazione: "cantiere" }))).toEqual(["in cantiere serve la commessa"]);
    expect(pronte([bolla({ data: "" })], new Map())).toEqual([]);
  });

  it("fornitore ignoto, nessuna riga e lettura incerta sono dubbi, non blocchi", () => {
    const b = bolla({ supplierId: null, fornitoreLetto: "Rossi", righe: [], confidenza: 0.4, avvisi: ["timbro illeggibile"] });
    expect(dubbi(b)).toEqual(["fornitore «Rossi» non riconosciuto", "nessuna riga merce letta", "lettura poco sicura"]);
    expect(pronte([b], new Map())).toEqual([b]);
  });

  it("gli avvisi della lettura non rendono dubbia una bolla: ci sono quasi sempre", () => {
    expect(dubbi(bolla({ avvisi: ["Manca il CAP del destinatario"] }))).toEqual([]);
  });

  it("in cima chi non si può salvare, poi i dubbi, poi i doppioni", () => {
    const ok = bolla({ id: "ok", numero: "1" });
    const dubbio = bolla({ id: "dubbio", numero: "2", supplierId: null });
    const rotta = bolla({ id: "rotta", numero: "" });
    const doppio = bolla({ id: "doppio", numero: "3" });
    expect(perAttenzione([ok, doppio, dubbio, rotta], new Map([["doppio", "gia_presente" as const]])).map((b) => b.id)).toEqual(["rotta", "dubbio", "doppio", "ok"]);
  });

  it("una bolla già salvata non riparte, se si conferma di nuovo dopo un errore", () => {
    expect(pronte([bolla({ esito: "salvata" })], new Map())).toEqual([]);
    const fallita = bolla({ esito: "errore" });
    expect(pronte([fallita], new Map())).toEqual([fallita]);
  });
});

describe("dalla lettura alla riga", () => {
  it("il fornitore si abbina solo se è certo, e la commessa di partenza resta", () => {
    const partenza = bollaDaFile(file(), "x", { orderId: "o1", destinazione: "cantiere" });
    const grezzo = { intestazione: { numero: "7", data: "2026-10-30" }, mittente: { denominazione: "Rossi Srl", partita_iva: "IT01234567890" }, righe: [] as unknown[] };
    const letta = leggiDDTdaAI(grezzo);
    const conP = conLettura(partenza, { ...letta, fornitorePiva: "01234567890" }, grezzo, [{ id: "s", name: "Altro", vat_number: "01234567890", fiscal_code: null }]);
    expect(conP).toMatchObject({ stato: "letta", supplierId: "s", orderId: "o1", destinazione: "cantiere" });
    const senza = conLettura(partenza, { ...letta, fornitorePiva: null, fornitoreNome: "Ignoto" }, grezzo, []);
    expect(senza.supplierId).toBeNull();
  });
});

describe("dalla riga della bolla all'articolo", () => {
  const art = (id: string, name: string, internal_code: string | null = null, barcode: string | null = null) => ({ id, name, internal_code, barcode });
  const riga = (patch: Partial<RigaDaCaricare> = {}): RigaDaCaricare => ({ id: "r", codice_articolo: null, descrizione: "Cemento 32.5", unita_misura: "pz", quantita: 10, ...patch });

  it("è certo con lo stesso codice o barcode, o lo stesso nome, e uno solo", () => {
    const a = art("a", "Altro nome", "CEM32");
    expect(articoloCerto(riga({ codice_articolo: "cem32" }), [a])?.id).toBe("a");
    expect(articoloCerto(riga({ codice_articolo: "800" }), [art("b", "X", null, "800")])?.id).toBe("b");
    expect(articoloCerto(riga(), [art("c", "cemento  32.5")])?.id).toBe("c");
    expect(articoloCerto(riga(), [art("c", "Cemento 32.5"), art("d", "Cemento 32.5")])).toBeNull();
    expect(articoloCerto(riga({ descrizione: "Cemento" }), [art("c", "Cemento 32.5")])).toBeNull();
  });

  it("il simile si propone, non entra da solo", () => {
    const articoli = [art("c", "Cemento 32.5 sacco 25kg")];
    expect(articoloSimile(riga({ descrizione: "Cemento sacco 25kg" }), articoli)?.id).toBe("c");
    expect(articoloSimile(riga({ descrizione: "Mattoni forati" }), articoli)).toBeNull();
    expect(scelteCerte([riga({ descrizione: "Cemento sacco 25kg" })], articoli)).toEqual([]);
  });

  it("solo pezzi interi entrano senza chiedere", () => {
    const articoli = [art("c", "Cemento 32.5")];
    expect(scelteCerte([riga()], articoli)).toEqual([{ riga_id: "r", stock_item_id: "c" }]);
    expect(scelteCerte([riga({ quantita: 12.5 })], articoli)).toEqual([]);
    expect(scelteCerte([riga({ unita_misura: "kg" })], articoli)).toEqual([]);
    expect(scelteCerte([riga({ quantita: null })], articoli)).toEqual([]);
    expect(quantitaAPezzi({ quantita: 3, unita_misura: null })).toBe(true);
  });
});
