import { describe, expect, it } from "vitest";
import {
  accessoDettagli, celleAppuntamenti, celleNote, nomePersona, perOpportunita, righeFoglioAppuntamenti, righeFoglioNote, statoAppuntamento,
  type AppuntamentoEsportato, type NotaEsportata,
} from "@/lib/opportunita/dettagliEsportazione";

const nota = (n: Partial<NotaEsportata>): NotaEsportata => ({ opportunity_id: "o1", contact_id: "c1", content: "Testo", created_by: "u1", created_at: "2026-11-04T09:30:00Z", ...n });
const app = (a: Partial<AppuntamentoEsportato>): AppuntamentoEsportato => ({
  opportunity_id: "o1", contact_id: "c1", title: "Sopralluogo", appointment_type: "sopralluogo_preventivo", appointment_date: "2026-11-10",
  appointment_time: "10:30:00", appointment_end_time: "11:00:00", status: "confermato", is_completed: false, assigned_to: "u1",
  address_line: "Via Roma 1", address_city: "Padova", internal_notes: null, ...a,
});

describe("note e appuntamenti alla loro opportunità", () => {
  const opp = [{ id: "o1", contact_id: "c1" }, { id: "o2", contact_id: "c1" }, { id: "o3", contact_id: "c3" }];
  it("con l'opportunità vanno lì; col solo contatto, a tutte le sue", () => {
    const out = perOpportunita([nota({ content: "a" }), nota({ opportunity_id: null, content: "b" }), nota({ opportunity_id: "altra", content: "c" })], opp);
    expect(out.o1.map((n) => n.content)).toEqual(["a", "b"]);
    expect(out.o2.map((n) => n.content)).toEqual(["b"]);
    expect(out.o3).toBeUndefined();
  });
});

describe("le colonne delle note", () => {
  it("dalla più recente, con data in ora italiana e autore", () => {
    const c = celleNote([nota({ content: "Vecchia", created_at: "2026-10-01T08:00:00Z" }), nota({ content: " Nuova " })], { u1: "Noemi" });
    expect(c.note_numero).toBe("2");
    expect(c.note_ultima).toBe("04/11/2026 10:30");
    expect(c.note_testo).toBe("[04/11/2026 10:30 · Noemi] Nuova\n[01/10/2026 10:00 · Noemi] Vecchia");
  });
  it("senza note: zero e celle vuote", () => {
    expect(celleNote(undefined, {})).toEqual({ note_numero: "0", note_ultima: "", note_testo: "" });
  });
  it("una cella non supera il limite di Excel e dice quante ne mancano", () => {
    const lunghe = Array.from({ length: 5 }, (_, i) => nota({ content: "x".repeat(10000), created_at: `2026-11-0${i + 1}T09:00:00Z` }));
    const testo = celleNote(lunghe, {}).note_testo;
    expect(testo.length).toBeLessThan(32767);
    expect(testo).toContain("altre 2 nel foglio dedicato");
  });
});

describe("le colonne degli appuntamenti", () => {
  const oggi = "2026-11-05";
  it("il prossimo, l'ultimo e l'elenco; gli annullati non sono né prossimo né ultimo", () => {
    const c = celleAppuntamenti([
      app({ appointment_date: "2026-11-10" }),
      app({ appointment_date: "2026-11-20", title: "Secondo" }),
      app({ appointment_date: "2026-11-06", status: "annullato", title: "Annullato" }),
      app({ appointment_date: "2026-10-01", is_completed: true, title: "Fatto" }),
    ], oggi);
    expect(c.app_numero).toBe("4");
    expect(c.app_prossimo).toBe("10/11/2026 10:30 Sopralluogo (Confermato)");
    expect(c.app_ultimo).toBe("01/10/2026 10:30 Fatto (Completato)");
    expect(c.app_elenco.split("\n")[0]).toContain("Secondo");
  });
  it("uno di oggi già completato è passato, non prossimo", () => {
    const c = celleAppuntamenti([app({ appointment_date: oggi, is_completed: true })], oggi);
    expect(c.app_prossimo).toBe("");
    expect(c.app_ultimo).toContain("05/11/2026");
  });
  it("senza titolo usa il tipo, e lo stato è leggibile", () => {
    expect(celleAppuntamenti([app({ title: null })], oggi).app_prossimo).toContain("Sopralluogo preventivo");
    expect(statoAppuntamento({ status: "da_preventivare", is_completed: false })).toBe("Da preventivare");
    expect(statoAppuntamento({ status: "annullato", is_completed: true })).toBe("Annullato");
  });
});

describe("i difetti della revisione", () => {
  const oggi = "2026-11-05";
  it("completato nello stato, anche con lo spunta spenta, non è il prossimo", () => {
    const c = celleAppuntamenti([app({ appointment_date: "2026-12-01", status: "completato", is_completed: false })], oggi);
    expect(c.app_prossimo).toBe("");
    expect(c.app_ultimo).toContain("(Completato)");
  });
  it("il CSV non taglia e non rimanda a un foglio che non ha", () => {
    const lunghe = Array.from({ length: 5 }, (_, i) => nota({ content: "x".repeat(10000), created_at: `2026-11-0${i + 1}T09:00:00Z` }));
    const testo = celleNote(lunghe, {}, false).note_testo;
    expect(testo).not.toContain("foglio dedicato");
    expect(testo.match(/x{10000}/g)).toHaveLength(5);
  });
  it("chi non si trova nello staff non resta senza nome", () => {
    expect(nomePersona("u9", { u1: "Noemi" })).toBe("Nome non disponibile");
    expect(nomePersona("u1", { u1: "Noemi" })).toBe("Noemi");
    expect(nomePersona(null, {})).toBe("");
    expect(celleNote([nota({ created_by: "u9" })], {}).note_testo).toContain("Nome non disponibile");
  });
  it("l'accesso segue le regole del database", () => {
    expect(accessoDettagli({ isAdmin: true, onlyAssigned: true })).toEqual({ note: true, appuntamenti: true, parzialeNote: false, parzialeAppuntamenti: false });
    expect(accessoDettagli({ canViewOrders: true, onlyAssigned: true })).toMatchObject({ note: true, appuntamenti: false, parzialeNote: true });
    expect(accessoDettagli({ canViewMarketingAppointments: true })).toEqual({ note: false, appuntamenti: true, parzialeNote: false, parzialeAppuntamenti: false });
    // dal solo calendario non si vedono gli appuntamenti CRM creati da altri
    expect(accessoDettagli({ canViewCalendar: true })).toMatchObject({ appuntamenti: true, parzialeAppuntamenti: true });
  });
});

describe("i fogli dell'Excel", () => {
  const opp = [{ id: "o1", name: "Tetto", contatto: "Anna Blu", telefono: "+39333" }];
  it("una riga per nota, senza quelle vuote", () => {
    const righe = righeFoglioNote({ o1: [nota({}), nota({ content: "  " })] }, opp, { u1: "Noemi" });
    expect(righe).toEqual([{ opportunita: "Tetto", contatto: "Anna Blu", telefono: "+39333", quando: "04/11/2026 10:30", autore: "Noemi", testo: "Testo" }]);
  });
  it("una riga per appuntamento, col luogo e chi lo segue", () => {
    expect(righeFoglioAppuntamenti({ o1: [app({})] }, opp, { u1: "Noemi" })[0]).toMatchObject({
      data: "10/11/2026", ora: "10:30", fine: "11:00", tipo: "Sopralluogo preventivo", stato: "Confermato", assegnato: "Noemi", luogo: "Via Roma 1, Padova",
    });
  });
});

describe("l'Excel con note e appuntamenti", () => {
  it("ha i fogli dedicati, le date come date e la testata colorata", async () => {
    const { excelOpportunita } = await import("@/lib/opportunita/esportaOpportunita");
    const { default: ExcelJS } = await import("exceljs");
    const blob = await excelOpportunita(
      [{ faseId: "f1", riga: { name: "Tetto", created_at: "04/11/2026", note_testo: "[04/11/2026] =SOMMA(A1)" } }],
      [{ key: "name", label: "Nome" }, { key: "created_at", label: "Creata" }, { key: "note_testo", label: "Note" }],
      [{ id: "f1", nome: "Nuovo" }],
      { note: [{ opportunita: "Tetto", testo: "=SOMMA(A1)" }], appuntamenti: [{ opportunita: "Tetto", data: "10/11/2026" }] },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Tutte", "Nuovo", "Note", "Appuntamenti"]);
    const tutte = wb.getWorksheet("Tutte")!;
    expect(tutte.getRow(2).getCell(2).value).toBeInstanceOf(Date);
    expect(tutte.getRow(2).getCell(3).alignment?.wrapText).toBe(true);
    expect(wb.getWorksheet("Appuntamenti")!.getRow(2).getCell(4).value).toBeInstanceOf(Date);
    // una formula scritta in una nota non diventa formula
    expect(String(wb.getWorksheet("Note")!.getRow(2).getCell(6).value)).toBe("'=SOMMA(A1)");
  });
});
