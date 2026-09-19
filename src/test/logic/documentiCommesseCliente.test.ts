import { describe, expect, it } from "vitest";
import {
  NOME_SENZA_CARTELLA,
  aBlocchi,
  raggruppaDocumentiCommesse,
  type CommessaDelCliente,
  type DocumentoCommessaRiga,
} from "@/lib/clienti/documentiCommesseCliente";
import type { CartellaDocumenti } from "@/lib/commesse/documentiCommessa";

const cartella = (id: string, nome: string, posizione: number, extra: Partial<CartellaDocumenti> = {}): CartellaDocumenti => ({
  id, nome, posizione, company_id: "az", visibile_cliente: false, obbligatoria: false, archiviata_at: null, ...extra,
});

const commessa = (id: string, order_code: string | null = id.toUpperCase()): CommessaDelCliente => ({
  id, order_code, description: null, fase: null,
});

let n = 0;
const doc = (order_id: string, folder_id: string | null, created_at: string, file_name = `f${++n}.pdf`): DocumentoCommessaRiga => ({
  id: `d${++n}`, order_id, folder_id, created_at, file_name,
  file_url: `orders/${order_id}/${file_name}`, file_type: "application/pdf", file_size: 1000,
});

const cartelle = [
  cartella("contratti", "Contratti", 1),
  cartella("dico", "DiCo", 2),
  cartella("foto", "Foto", 3, { archiviata_at: "2026-01-01T00:00:00Z" }),
];

describe("raggruppaDocumentiCommesse", () => {
  it("raggruppa per commessa nell'ordine delle commesse e salta quelle senza file", () => {
    const docs = [
      doc("b", "dico", "2026-09-01T10:00:00Z"),
      doc("a", "contratti", "2026-09-02T10:00:00Z"),
    ];
    const gruppi = raggruppaDocumentiCommesse(docs, [commessa("a"), commessa("vuota"), commessa("b")], cartelle);
    expect(gruppi.map((g) => g.commessa.id)).toEqual(["a", "b"]);
    expect(gruppi.map((g) => g.totale)).toEqual([1, 1]);
  });

  it("ordina le cartelle per posizione, «Senza cartella» in fondo, file più recenti prima", () => {
    const vecchio = doc("a", "dico", "2026-08-01T10:00:00Z", "vecchio.pdf");
    const nuovo = doc("a", "dico", "2026-09-10T10:00:00Z", "nuovo.pdf");
    const docs = [doc("a", null, "2026-09-05T10:00:00Z"), vecchio, doc("a", "contratti", "2026-09-03T10:00:00Z"), nuovo];
    const [g] = raggruppaDocumentiCommesse(docs, [commessa("a")], cartelle);
    expect(g.totale).toBe(4);
    expect(g.cartelle.map((c) => c.nome)).toEqual(["Contratti", "DiCo", NOME_SENZA_CARTELLA]);
    expect(g.cartelle[1].documenti.map((d) => d.file_name)).toEqual(["nuovo.pdf", "vecchio.pdf"]);
  });

  it("mostra il nome vero delle cartelle archiviate e manda le sconosciute in «Senza cartella»", () => {
    const docs = [doc("a", "foto", "2026-09-01T10:00:00Z"), doc("a", "cancellata", "2026-09-02T10:00:00Z"), doc("a", null, "2026-09-03T10:00:00Z")];
    const [g] = raggruppaDocumentiCommesse(docs, [commessa("a")], cartelle);
    expect(g.cartelle.map((c) => [c.folderId, c.nome, c.documenti.length])).toEqual([
      ["foto", "Foto", 1],
      [null, NOME_SENZA_CARTELLA, 2],
    ]);
  });

  it("ignora i file di commesse che non sono del cliente", () => {
    const gruppi = raggruppaDocumentiCommesse([doc("altra", null, "2026-09-01T10:00:00Z")], [commessa("a")], cartelle);
    expect(gruppi).toEqual([]);
  });
});

describe("aBlocchi", () => {
  it("divide senza perdere elementi", () => {
    expect(aBlocchi([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(aBlocchi([], 100)).toEqual([]);
  });
});
