import { describe, expect, it } from "vitest";
import { colonneConCampi, excelOpportunita, nomeFoglio, rigaOpportunita, scegliOpportunita, type OpportunitaDaEsportare } from "@/lib/opportunita/esportaOpportunita";
import { MOTIVI_PERDITA_DEFAULT } from "@/lib/opportunita/motiviPerdita";

const ctx = {
  fasi: { f1: "Nuovo contatto", f2: "Sopralluogo", f3: "Perso" },
  venditori: { u1: "Mario" },
  motivi: MOTIVI_PERDITA_DEFAULT,
  campi: [{ id: "c1", name: "Pratica" }],
  valoriCampi: { o3: { c1: "Ecobonus" } },
};
const motivo = MOTIVI_PERDITA_DEFAULT[0];
const opp: OpportunitaDaEsportare[] = [
  { id: "o1", name: "Rossi", status: "open", stage_id: "f1", value: 1000, probability: 40, assigned_to: "u1" },
  { id: "o2", name: "Bianchi", status: "won", stage_id: "f2", value: 5000, won_at: "2026-10-30T10:00:00Z" },
  { id: "o3", name: "Verdi", status: "lost", stage_id: "f3", value: 3000, lost_reason_category: motivo.value, lost_reason: "ha scelto il vicino", competitor_won: "Ditta X", loss_notes: "richiamare a marzo", lost_at: "2026-11-01T10:00:00Z", marketing_contacts: { first_name: "Anna", last_name: "Verdi", phone: "333" } },
  { id: "o4", name: "Neri", status: "lost", stage_id: "f3", loss_reason: "prezzo alto" },
  { id: "o5", name: "Gialli", status: "lost", stage_id: "f3", lost_reason_category: motivo.value, lost_reason: "." },
];

describe("esportazione delle opportunità", () => {
  it("i persi hanno motivo, dettaglio, concorrente e note; lo stato è in italiano", () => {
    const r = rigaOpportunita(opp[2], ctx);
    expect(r).toMatchObject({ stage: "Perso", status: "Persa", lost_cause: motivo.label, lost_detail: "ha scelto il vicino", competitor: "Ditta X", loss_notes: "richiamare a marzo", contact: "Anna Verdi", cf_c1: "Ecobonus", weighted_value: "0" });
    expect(r.closed_at).toBe(new Date("2026-11-01T10:00:00Z").toLocaleDateString("it-IT"));
    // perdita vecchia senza categoria: il testo libero diventa il motivo
    expect(rigaOpportunita(opp[3], ctx).lost_cause).toBe("prezzo alto");
    // un dettaglio fatto di punteggiatura non è un dettaglio
    expect(rigaOpportunita(opp[4], ctx).lost_detail).toBe("");
    // le aperte non hanno colonne di perdita; il ponderato pesa la probabilità
    expect(rigaOpportunita(opp[0], ctx)).toMatchObject({ status: "Aperta", lost_cause: "", weighted_value: "400", assigned_to: "Mario" });
    expect(colonneConCampi(ctx.campi).map((c) => c.label)).toEqual(expect.arrayContaining(["Fase", "Stato", "Motivo della perdita", "Pratica"]));
  });

  it("si scelgono fasi e stati; vuoto vuol dire tutte", () => {
    expect(scegliOpportunita(opp, {}).length).toBe(5);
    expect(scegliOpportunita(opp, { stati: new Set(["lost"]) }).map((o) => o.id)).toEqual(["o3", "o4", "o5"]);
    expect(scegliOpportunita(opp, { fasi: new Set(["f1", "f2"]) }).map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(scegliOpportunita(opp, { fasi: new Set(["f3"]), stati: new Set(["won"]) })).toEqual([]);
  });

  it("Excel: un foglio con tutte, uno per fase, il riepilogo dei motivi", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const righe = opp.map((o) => ({ faseId: o.stage_id ?? null, riga: rigaOpportunita(o, ctx) }));
    const blob = await excelOpportunita(righe, colonneConCampi(ctx.campi), Object.entries(ctx.fasi).map(([id, nome]) => ({ id, nome })));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Tutte", "Nuovo contatto", "Sopralluogo", "Perso", "Motivi di perdita"]);
    expect(wb.getWorksheet("Perso")!.rowCount).toBe(4);
    expect(wb.getWorksheet("Tutte")!.getRow(1).values).toContain("Motivo della perdita");
    const motivi = wb.getWorksheet("Motivi di perdita")!;
    expect(motivi.getRow(2).values).toEqual(expect.arrayContaining([motivo.label, 2]));
  });

  it("nomi dei fogli validi e unici", () => {
    const usati = new Set<string>();
    expect(nomeFoglio("Fase: 1/2 [prova]", usati)).toBe("Fase 1 2 prova");
    expect(nomeFoglio("Fase: 1/2 [prova]", usati)).toBe("Fase 1 2 prova (2)");
    expect(nomeFoglio("x".repeat(40), usati)).toHaveLength(31);
  });
});

describe("esportazione: periodo, colonne, pipeline", () => {
  it("periodo sulla data vinta o persa, in ora italiana; le aperte restano fuori", async () => {
    const { scegliOpportunita: sc } = await import("@/lib/opportunita/esportaOpportunita");
    const lista: OpportunitaDaEsportare[] = [
      { id: "a", status: "lost", lost_at: "2026-10-31T23:30:00Z" }, // 00:30 del 1° novembre in Italia
      { id: "b", status: "lost", lost_at: "2026-10-15T10:00:00Z" },
      { id: "c", status: "open", created_at: "2026-10-15T10:00:00Z" },
    ];
    expect(sc(lista, { periodo: { da: "2026-10-01", a: "2026-10-31", data: "chiusura" } }).map((o) => o.id)).toEqual(["b"]);
    expect(sc(lista, { periodo: { da: "2026-11-01", a: null, data: "chiusura" } }).map((o) => o.id)).toEqual(["a"]);
    expect(sc(lista, { periodo: { da: "2026-10-01", a: "2026-10-31", data: "creazione" } }).map((o) => o.id)).toEqual(["c"]);
  });
  it("solo le colonne scelte, nell'ordine del file; la pipeline nella riga", async () => {
    const { soloColonne } = await import("@/lib/opportunita/esportaOpportunita");
    const col = soloColonne(colonneConCampi([]), new Set(["lost_cause", "stage", "name"]));
    expect(col.map((c) => c.key)).toEqual(["name", "stage", "lost_cause"]);
    expect(soloColonne(colonneConCampi([]), new Set(["boh"])).length).toBeGreaterThan(10);
    expect(rigaOpportunita(opp[0], { ...ctx, pipelineDellaFase: { f1: "Fotovoltaico" } }).pipeline).toBe("Fotovoltaico");
  });
  it("esportazioni salvate: «mese scorso» e «settimana scorsa» calcolati oggi", async () => {
    const { periodoRelativo } = await import("@/components/opportunities/EsportaOpportunitaDialog");
    expect(periodoRelativo("mese_scorso", new Date(2026, 10, 2))).toEqual({ da: "2026-10-01", a: "2026-10-31" });
    expect(periodoRelativo("settimana_scorsa", new Date(2026, 10, 4))).toEqual({ da: "2026-10-26", a: "2026-11-01" });
    expect(periodoRelativo("nessuno")).toBeNull();
  });
});

describe("guardiano: l'esportazione porta le informazioni che contano", () => {
  // Il motivo della perdita mancava dal file per mesi e se n'è accorto un cliente (Ener
  // Italia, novembre 2026). Se una di queste informazioni sparisce dal file, il test è rosso.
  it("fase, stato, motivo, dettaglio, concorrente, note, date di chiusura, venditore, valore", () => {
    const chiavi = colonneConCampi([]).map((c) => c.key);
    for (const k of ["stage", "status", "lost_cause", "lost_detail", "competitor", "loss_notes", "closed_at", "assigned_to", "value", "contact", "phone", "email"]) expect(chiavi).toContain(k);
    const r = rigaOpportunita(opp[2], ctx);
    for (const k of chiavi) expect(r, k).toHaveProperty(k);
  });
});
