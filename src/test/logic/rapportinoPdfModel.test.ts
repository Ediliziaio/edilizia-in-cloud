import { describe, expect, it } from "vitest";
import { bloccoFasi, dayBounds, hours, inchiostroSu, number, oraBreve, oreBrevi, percentage, reportAsset, reportSummary } from "../../../supabase/functions/genera-pdf-rapportino/model";

describe("PDF rapportino - dati non ambigui", () => {
  it("squadra sostituisce ore autore, non le duplica", () => {
    const s = reportSummary({ ore_lavorate: 8, ore_straordinario: 2, presenze: [{ nome: "A", ore: 7.5 }, { nome: "B", ore: 4 }] });
    expect(s.total).toBe(11.5);
    expect(hours(s.total)).toBe("11 h 30 min");
  });
  it("individuale mantiene ordinario più straordinario", () => expect(reportSummary({ ore_lavorate: 7.5, ore_straordinario: 1 }).total).toBe(8.5));
  it("presenza senza ore rende totale non disponibile", () => expect(reportSummary({ presenze: [{ nome: "A" }] }).total).toBeNull());
  it.each([undefined, null, "", "   ", {}, [], NaN, Infinity, -1, true])("non inventa zero da %s", value => expect(number(value)).toBeNull());
  it("zero esplicito è diverso da mancante", () => { expect(hours(0)).toBe("0 h"); expect(percentage(null)).toBe("Non rilevato"); expect(percentage(0)).toBe("0%"); });
  it("non inventa capocantiere dal tipo employee", () => expect(reportSummary({ role_type: "employee" }).authorRole).toBe("Personale interno"));
  it("riconosce subappaltatore e stato", () => { const s = reportSummary({ role_type: "subcontractor", stato: "rifiutato" }); expect(s.authorRole).toBe("Subappaltatore"); expect(s.statusLabel).toBe("RIFIUTATO"); });
  it("stato esplicito prevale sul flag legacy", () => expect(reportSummary({ stato: "rifiutato", approvato: true }).statusLabel).toBe("RIFIUTATO"));
});
describe("giornata italiana delle timbrature PDF", () => {
  it.each([["2026-09-24", 24], ["2026-03-29", 23], ["2026-10-25", 25]])("%s dura %s ore", (day, duration) => { const b = dayBounds(String(day))!; expect((Date.parse(b.end) - Date.parse(b.start)) / 3600000).toBe(duration); });
  it("non usa la timezone del server", () => expect(dayBounds("2026-09-24")).toEqual({ start: "2026-09-23T22:00:00.000Z", end: "2026-09-24T22:00:00.000Z" }));
  it.each(["2026-02-31", "bad", "", "2026-13-01"])("rifiuta data %s", d => expect(dayBounds(d)).toBeNull());
});
describe("allegati privati tenant-scoped", () => {
  const base = "https://project.supabase.co";
  it.each(["campo-rapportini/tenant/order/a.jpg", `${base}/storage/v1/object/public/campo-rapportini/tenant/order/a.jpg`, `${base}/storage/v1/object/sign/campo-rapportini/tenant/order/a.jpg?token=old`])("legge il riferimento storico %s", ref => expect(reportAsset(ref, "tenant", base)).toEqual({ bucket: "campo-rapportini", path: "tenant/order/a.jpg" }));
  it.each(["https://evil.invalid/storage/v1/object/public/campo-rapportini/tenant/x.jpg", "campo-rapportini/other/x.jpg", "campo-rapportini/tenant/../x.jpg", "campo-rapportini/tenant//x.jpg", "http://127.0.0.1/private", "campo-rapportini/tenant", "other-bucket/tenant/x.jpg"])("blocca %s", ref => expect(reportAsset(ref, "tenant", base)).toBeNull());
});

describe("rapportino a blocchi: materiali e foto per fase", () => {
  const nomi = new Map([["ph-1", "Demolizioni"], ["ph-2", "Posa serramenti"]]);
  const report = {
    fasi_lavorate: [
      { phase_id: "ph-1", percentuale: 100, nome: "Demolizioni e allestimento", foto: ["f0", "f1"] },
      { phase_id: "ph-2", percentuale: 60, foto: ["f2", "fantasma"] },
    ],
    materiali_usati: [
      { nome: "Schiuma", quantita: 6, unita: "pz", da_furgone: true, fase_id: "ph-2" },
      { nome: "Sacchi", quantita: 12, unita: "pz", fase_id: "ph-1" },
      { nome: "Viti", quantita: 150, unita: "pz" },
      { nome: "Nastro", quantita: 4.5, unita: "m", order_item_id: "oi-1", fase_id: "ph-cancellata" },
    ],
    foto_urls: ["f0", "f1", "f2", "f3"],
  };

  it("una scheda per fase, con i suoi materiali e le sue foto", () => {
    const b = bloccoFasi(report, nomi);
    expect(b.fasi.map(f => f.nome)).toEqual(["Demolizioni e allestimento", "Posa serramenti"]);
    expect(b.fasi[0].materiali.map(m => m.nome)).toEqual(["Sacchi"]);
    expect(b.fasi[1].materiali.map(m => m.nome)).toEqual(["Schiuma"]);
    expect(b.fasi[0].foto).toEqual(["f0", "f1"]);
  });

  it("una foto elencata nella fase ma non nel rapportino non entra: le foto vere sono quelle di foto_urls", () => {
    expect(bloccoFasi(report, nomi).fasi[1].foto).toEqual(["f2"]);
  });

  it("quello che non è di una fase resta tra gli altri, compreso il materiale di una fase che non c'è più", () => {
    const b = bloccoFasi(report, nomi);
    expect(b.altriMateriali.map(m => m.nome)).toEqual(["Viti", "Nastro"]);
    expect(b.altreFoto).toEqual(["f3"]);
  });

  it("i totali contano tutto il rapportino, una volta", () => {
    const b = bloccoFasi(report, nomi);
    expect(b.totaleMateriali).toBe(4);
    expect(b.totaleFoto).toBe(4);
    expect(b.fasi.flatMap(f => f.materiali).length + b.altriMateriali.length).toBe(4);
    expect(b.fasi.flatMap(f => f.foto).length + b.altreFoto.length).toBe(4);
  });

  it("una foto indicata in due fasi si mostra una volta sola", () => {
    const b = bloccoFasi({ fasi_lavorate: [{ phase_id: "a", foto: ["x"] }, { phase_id: "b", foto: ["x"] }], foto_urls: ["x"] }, new Map());
    expect(b.fasi[0].foto).toEqual(["x"]);
    expect(b.fasi[1].foto).toEqual([]);
  });

  it("un rapportino di sempre (vocale, WhatsApp, storico): fasi senza materiali né foto, tutto il resto nelle liste generali", () => {
    const b = bloccoFasi({
      fasi_lavorate: [{ phase_id: "ph-1", percentuale: 40 }],
      materiali_usati: [{ nome: "Colla", quantita: 2, unita: "kg" }],
      foto_urls: ["f0"],
    }, nomi);
    expect(b.fasi).toEqual([{ id: "ph-1", nome: "Demolizioni", percentuale: 40, ore: null, materiali: [], foto: [] }]);
    expect(b.altriMateriali.map(m => m.nome)).toEqual(["Colla"]);
    expect(b.altreFoto).toEqual(["f0"]);
  });

  it("il nome della fase: quello del rapportino, poi quello della fase, poi una dicitura chiara", () => {
    const b = bloccoFasi({ fasi_lavorate: [{ phase_id: "ph-1", nome: "Nome scritto" }, { phase_id: "ph-2" }, { phase_id: "ph-9" }, {}] }, nomi);
    expect(b.fasi.map(f => f.nome)).toEqual(["Nome scritto", "Posa serramenti", "Lavorazione non identificata", "Lavorazione non identificata"]);
  });

  it("l'avanzamento fuori scala o mancante non si inventa", () => {
    const b = bloccoFasi({ fasi_lavorate: [{ phase_id: "a", percentuale: 140 }, { phase_id: "b" }, { phase_id: "c", percentuale: 0 }] }, new Map());
    expect(b.fasi.map(f => f.percentuale)).toEqual([null, null, 0]);
  });

  it("l'origine di un materiale si legge dal dato: furgone, articolo della commessa o dichiarato", () => {
    const b = bloccoFasi({ materiali_usati: [{ nome: "A", da_furgone: true }, { nome: "B", order_item_id: "x" }, { nome: "C" }] }, new Map());
    expect(b.altriMateriali.map(m => m.origine)).toEqual(["Dal furgone", "Articolo commessa", "Dichiarato"]);
  });

  it("quantità mancante o testo vuoto non rompono nulla", () => {
    const b = bloccoFasi({ materiali_usati: [{}, { nome: "  ", quantita: "boh" }], foto_urls: [null, "", 3, "ok"] }, new Map());
    expect(b.altriMateriali).toEqual([
      { nome: "Non specificato", quantita: "-", unita: "-", origine: "Dichiarato" },
      { nome: "Non specificato", quantita: "-", unita: "-", origine: "Dichiarato" },
    ]);
    expect(b.totaleFoto).toBe(1);
  });
});

describe("rapportino a blocchi: colore e tempi", () => {
  it("scrive in bianco sui colori scuri e in scuro su quelli chiari", () => {
    expect(inchiostroSu(0x1e5aa8)).toBe("white"); // blu
    expect(inchiostroSu(0x000000)).toBe("white");
    expect(inchiostroSu(0xc0392b)).toBe("white"); // rosso mattone
    // L'arancione della piattaforma: il bianco avrebbe un contrasto di 2,8 a 1, lo scuro di 5,2 a 1.
    expect(inchiostroSu(0xf97415)).toBe("ink");
    expect(inchiostroSu(0xffd700)).toBe("ink"); // giallo
    expect(inchiostroSu(0xffffff)).toBe("ink");
    expect(inchiostroSu(0x9be7a6)).toBe("ink"); // verde chiaro
  });

  it("l'ora è quella italiana, anche d'estate", () => {
    expect(oraBreve("2026-09-24T06:00:00Z")).toBe("08:00");
    expect(oraBreve("2026-12-01T06:00:00Z")).toBe("07:00");
    expect(oraBreve("non è una data")).toBe("--:--");
    expect(oraBreve(undefined)).toBe("--:--");
  });

  it("le ore si dicono come in cantiere", () => {
    expect(oreBrevi(8)).toBe("8 h");
    expect(oreBrevi(7.5)).toBe("7 h 30");
    expect(oreBrevi(0.25)).toBe("0 h 15");
    expect(oreBrevi(0)).toBe("0 h");
    expect(oreBrevi(null)).toBe("-");
    expect(oreBrevi("")).toBe("-");
    expect(oreBrevi(-3)).toBe("-");
  });
});
