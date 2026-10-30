import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { VOCI_DI_PARTENZA, vociDelModello, type AllegatoCommessa, type SegnoDocumento } from "@/lib/orders/generali/documenti";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";
import {
  componiListino, componiSchedaVendita, fileVenditaUnita, nomeFileListino, nomeFileScheda, righeCapitolato,
  statoListino, tipoAnteprima, voceMateriale, type AziendaVendita,
} from "@/lib/orders/generali/vendita";
import { creaExcelListino } from "@/lib/orders/generali/venditaExcel";

/**
 * Il modulo unità come strumento di vendita (30/10/2026): il materiale dell'unità si trova con
 * le voci della checklist, e quello che esce verso chi compra non porta mai costi, margini,
 * acquirenti o incassi.
 */

const unita = (sigla: string, over: Partial<UnitaGenerale> = {}): UnitaGenerale => ({
  orderId: `o-${sigla}`, codice: `O-${sigla}`, nome: sigla, scheda: true, id: `u-${sigla}`, sigla, edificio: null, piano: "1", tipologia: "Appartamento",
  mq: 95.5, millesimi: 250, listino: 300000, trattato: null, rogito: null, provvigione: 9000, stato: "libera",
  dataPrenotazione: null, dataCompromesso: null, rogitoPrevisto: null, dataRogito: null, acquirenteId: null, acquirente: null,
  agenzia: "Casa Facile", note: "Nota interna: sconto massimo 5%", origineId: null, divisaIl: null, movimenti: [], importoCommessa: 300000, costoDiretto: 180000, ...over,
});

const azienda: AziendaVendita = { nome: "Edil Srl", indirizzo: "Via Po 1, 10100 Torino (TO)", telefono: "011 123456", email: "vendite@edil.it", partitaIva: "01234567890", logo: null };

const allegato = (id: string, orderId: string, file_name: string, over: Partial<AllegatoCommessa> = {}): AllegatoCommessa => ({
  id, order_id: orderId, file_name, file_url: `orders/${orderId}/${file_name}`, file_type: null, created_at: `2026-10-${id.padStart(2, "0")}T10:00:00Z`, ...over,
});

describe("voci documento per la vendita", () => {
  it("sviluppo e compravendita hanno planimetria, capitolato e foto su ogni unità, facoltative", () => {
    for (const modello of ["sviluppo", "compravendita"] as const) {
      const voci = VOCI_DI_PARTENZA[modello].filter((v) => ["planimetria", "capitolato_unita", "foto_render"].includes(v.chiave));
      expect(voci.map((v) => v.nome)).toEqual(["Planimetria", "Capitolato e finiture", "Foto o render"]);
      expect(voci.every((v) => v.ambito === "figlia" && !v.obbligatoria && !v.conScadenza)).toBe(true);
    }
    expect(VOCI_DI_PARTENZA.appalto.some((v) => v.chiave === "planimetria")).toBe(false);
  });

  it("chi ha già la checklist le trova senza fare nulla, anche con voci sue", () => {
    const voci = vociDelModello("sviluppo", [
      { id: "r1", modello: "sviluppo", chiave: "az-xyz", nome: "Visto del condominio", ambito: "generale", obbligatoria: true, con_scadenza: false, tolta: false, posizione: 1 },
    ]);
    expect(voci.map((v) => v.id)).toEqual(expect.arrayContaining(["planimetria", "capitolato_unita", "foto_render", "az-xyz"]));
  });
});

describe("il materiale di un'unità", () => {
  const voci = vociDelModello("sviluppo");
  const oggi = "2026-11-05";

  it("riconosce dal nome planimetria, capitolato e foto; il preliminare resta preliminare", () => {
    const allegati = [
      allegato("1", "o-A1", "Planimetria A1.pdf", { file_type: "application/pdf" }),
      allegato("2", "o-A1", "Capitolato finiture 2026.pdf"),
      allegato("3", "o-A1", "Render soggiorno.jpg", { file_type: "image/jpeg" }),
      allegato("4", "o-A1", "Preliminare Rossi.pdf"),
      allegato("5", "o-A1", "Fotocopia documento identita.jpg"),
      allegato("6", "o-A2", "Planimetria A2.pdf"),
    ];
    const f = fileVenditaUnita({ voci, orderId: "o-A1", allegati, segni: [], oggi });
    expect(f.planimetria.map((a) => a.id)).toEqual(["1"]);
    expect(f.capitolato.map((a) => a.id)).toEqual(["2"]);
    expect(f.foto.map((a) => a.id)).toEqual(["3"]);
  });

  it("un file segnato per la voce vale anche se il nome non dice niente", () => {
    const allegati = [allegato("1", "o-A1", "IMG_2041.jpg", { file_type: "image/jpeg" }), allegato("2", "o-A1", "scan001.pdf")];
    const segni: SegnoDocumento[] = [
      { id: "s1", order_id: "o-A1", voce: "foto_render", tipo: "documento", attachment_id: "1", scadenza: null },
      { id: "s2", order_id: "o-A1", voce: "planimetria", tipo: "documento", attachment_id: "2", scadenza: null },
    ];
    const f = fileVenditaUnita({ voci, orderId: "o-A1", allegati, segni, oggi });
    expect(f.foto.map((a) => a.id)).toEqual(["1"]);
    expect(f.planimetria.map((a) => a.id)).toEqual(["2"]);
  });

  it("vale anche se l'azienda ha tolto la voce dalla checklist o l'ha spostata sull'operazione", () => {
    const tolte = vociDelModello("sviluppo", [
      { id: "r1", modello: "sviluppo", chiave: "planimetria", nome: "Pianta di vendita", ambito: "generale", obbligatoria: null, con_scadenza: null, tolta: true, posizione: 0 },
    ]);
    const f = fileVenditaUnita({ voci: tolte, orderId: "o-A1", allegati: [allegato("1", "o-A1", "planimetria.png")], segni: [], oggi });
    expect(f.planimetria).toHaveLength(1);
    expect(voceMateriale(tolte, "planimetria")).toEqual({ id: "planimetria", nome: "Pianta di vendita" });
  });

  it("si vedono in anteprima immagini e PDF, non HEIC né fogli", () => {
    expect(tipoAnteprima({ file_name: "pianta.PDF", file_type: null })).toBe("pdf");
    expect(tipoAnteprima({ file_name: "a.webp", file_type: "image/webp" })).toBe("immagine");
    expect(tipoAnteprima({ file_name: "a.heic", file_type: "image/heic" })).toBeNull();
    expect(tipoAnteprima({ file_name: "listino.xlsx", file_type: null })).toBeNull();
  });
});

describe("scheda vendita", () => {
  const base = { azienda, operazione: "Residenza Via Roma", planimetria: null as string | null, foto: [] as string[], capitolato: "", data: "2026-11-05" };

  it("porta solo i dati dell'unità: niente costi, provvigioni, note, acquirente o incassi", () => {
    const u = unita("A2", {
      stato: "compromesso", trattato: 290000, acquirente: "Mario Rossi", acquirenteId: "cli-1",
      movimenti: [{ id: "m1", tipo: "caparra", importo: 27500, data: "2026-10-01", descrizione: null }],
    });
    const d = componiSchedaVendita({ ...base, unita: u, conPrezzo: true });
    const testo = JSON.stringify(d);
    for (const vietato of ["Mario Rossi", "cli-1", "180000", "9000", "290000", "27500", "Casa Facile", "sconto", "caparra"]) {
      expect(testo).not.toContain(vietato);
    }
    expect(d.unita).toEqual({ sigla: "A2", tipologia: "Appartamento", edificio: null, piano: "1° piano", mq: 95.5, stato: "venduta" });
    // Il prezzo, se si mette, è quello di listino, non il trattato con un altro acquirente.
    expect(d.prezzo).toBe(300000);
  });

  it("il prezzo c'è solo se si sceglie e se c'è un listino", () => {
    expect(componiSchedaVendita({ ...base, unita: unita("A1"), conPrezzo: false }).prezzo).toBeNull();
    expect(componiSchedaVendita({ ...base, unita: unita("A1", { listino: null }), conPrezzo: true }).prezzo).toBeNull();
  });

  it("al massimo sei foto e il capitolato pulito, una voce per riga", () => {
    const d = componiSchedaVendita({ ...base, unita: unita("A1"), conPrezzo: false, foto: Array.from({ length: 9 }, (_, i) => `f${i}`), capitolato: "- Pavimenti in gres\n\n• Infissi in PVC\n3) Classe A4  " });
    expect(d.foto).toHaveLength(6);
    expect(d.capitolato).toEqual(["Pavimenti in gres", "Infissi in PVC", "Classe A4"]);
    expect(righeCapitolato("")).toEqual([]);
  });

  it("nomi dei file senza accenti né spazi", () => {
    expect(nomeFileScheda({ operazione: "Residenza Città Alta", unita: { sigla: "A 1" } as never, data: "2026-11-05" })).toBe("Scheda-A-1-Residenza-Citta-Alta-2026-11-05.pdf");
    expect(nomeFileListino({ operazione: "Residenza Città Alta", data: "2026-11-05" }, "xlsx")).toBe("Listino-Residenza-Citta-Alta-2026-11-05.xlsx");
  });
});

describe("listino disponibilità", () => {
  const elenco = [
    unita("B2", { edificio: "B", piano: "2", stato: "rogitata", trattato: 310000, rogito: 310000, acquirente: "Anna Bianchi" }),
    unita("A1", { edificio: "A", piano: "T", mq: 80 }),
    unita("A3", { edificio: "A", piano: "1", stato: "prenotata", acquirente: "Luca Verdi", trattato: 295000 }),
    unita("A2", { edificio: "A", piano: "1", listino: 320000, mq: 100 }),
    unita("A4", { edificio: "A", piano: "2", stato: "compromesso", acquirente: "Mario Rossi" }),
    // Divisa: non si vende più, si vendono le parti.
    unita("A9", { edificio: "A", piano: "3", divisaIl: "2026-10-01" }),
  ];

  it("per edificio, dal piano terra in su, con gli stati che capisce chi compra", () => {
    const d = componiListino({ azienda, operazione: "Residenza", unita: elenco, conPrezzi: true, data: "2026-11-05" });
    expect(d.righe.map((r) => r.sigla)).toEqual(["A1", "A2", "A3", "A4", "B2"]);
    expect(d.righe.map((r) => r.stato)).toEqual(["libera", "libera", "prenotata", "venduta", "venduta"]);
    expect(d.conteggi).toEqual({ libera: 2, prenotata: 1, venduta: 2 });
    expect(d.mqLiberi).toBe(180);
    expect(d.conEdifici).toBe(true);
    expect(statoListino("compromesso")).toBe("venduta");
  });

  it("il prezzo solo sulle libere e solo se si mettono i prezzi; mai acquirenti né trattati", () => {
    const con = componiListino({ azienda, operazione: "Residenza", unita: elenco, conPrezzi: true, data: "2026-11-05" });
    expect(con.righe.map((r) => r.prezzo)).toEqual([300000, 320000, null, null, null]);
    const testo = JSON.stringify(con);
    for (const vietato of ["Anna Bianchi", "Luca Verdi", "Mario Rossi", "310000", "295000", "180000", "Casa Facile"]) expect(testo).not.toContain(vietato);
    const senza = componiListino({ azienda, operazione: "Residenza", unita: elenco, conPrezzi: false, data: "2026-11-05" });
    expect(senza.righe.every((r) => r.prezzo === null)).toBe(true);
  });

  it("Excel: una riga per unità, m² e prezzi come numeri, nessun acquirente", async () => {
    const d = componiListino({ azienda, operazione: "Residenza", unita: elenco, conPrezzi: true, data: "2026-11-05" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await creaExcelListino(d));
    const ws = wb.getWorksheet("Listino")!;
    const intestazione = ws.getRow(5).values as unknown[];
    expect(intestazione.slice(1)).toEqual(["Edificio", "Piano", "Unità", "Tipologia", "m² commerciali", "Prezzo di listino", "Stato"]);
    const a2 = ws.getRow(7);
    expect(a2.getCell(3).value).toBe("A2");
    expect(a2.getCell(5).value).toBe(100);
    expect(a2.getCell(6).value).toBe(320000);
    expect(a2.getCell(6).numFmt).toContain("€");
    expect(ws.getRow(8).getCell(6).value).toBeNull();
    expect(ws.getRow(8).getCell(7).value).toBe("Prenotata");
    const tutto: string[] = [];
    ws.eachRow((r) => r.eachCell((c) => tutto.push(String(c.value))));
    for (const vietato of ["Anna Bianchi", "Luca Verdi", "Mario Rossi", "310000", "295000"]) expect(tutto.join(" ")).not.toContain(vietato);
  });

  it("Excel senza prezzi: la colonna del prezzo non c'è", async () => {
    const d = componiListino({ azienda, operazione: "Residenza", unita: elenco.filter((u) => u.edificio === "A"), conPrezzi: false, data: "2026-11-05" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await creaExcelListino(d));
    expect((wb.getWorksheet("Listino")!.getRow(5).values as unknown[]).slice(1)).toEqual(["Edificio", "Piano", "Unità", "Tipologia", "m² commerciali", "Stato"]);
  });
});
