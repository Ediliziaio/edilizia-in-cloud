import { describe, expect, it } from "vitest";
import { campoDayWindow, campoPunchOrderId, campoReportHours, canRecordCampoPunch, summarizeCampoTime, type CampoPunch } from "@/lib/campo/timeSummary";

const punch = (tipo: string, hour: string, order_id: string | null = "A"): CampoPunch =>
  ({ tipo, timestamp_evento: `2026-09-24T${hour}:00Z`, order_id });
const window = { start: new Date("2026-09-24T00:00:00Z"), end: new Date("2026-09-25T00:00:00Z"), now: new Date("2026-09-24T18:00:00Z"), includeOpen: true };
const summary = (p: CampoPunch[]) => summarizeCampoTime(p, window);
const minutes = (p: CampoPunch[], id: string | null = "A") => summary(p).byOrder.get(id)?.workMinutes ?? 0;

describe("Registro tempi Campo condiviso", () => {
  it("attribuisce 4h ad A e 4h a B, non l'intera giornata al rapporto di A", () => {
    const s = summary([punch("entrata", "08:00"), punch("uscita", "12:00"), punch("entrata", "13:00", "B"), punch("uscita", "17:00", "B")]);
    expect(s.byOrder.get("A")?.workMinutes).toBe(240);
    expect(s.byOrder.get("B")?.workMinutes).toBe(240);
    expect(s.workMinutes).toBe(480);
  });
  it("sottrae pause anche quando non hanno order_id", () => {
    const s = summary([punch("entrata", "08:00"), punch("pausa_inizio", "12:00", null), punch("pausa_fine", "13:00", null), punch("uscita", "17:00", null)]);
    expect(s.workMinutes).toBe(480); expect(s.pauseMinutes).toBe(60);
    expect(s.byOrder.get("A")?.workMinutes).toBe(480);
  });
  it("riordina i dati e somma un ritorno sullo stesso cantiere", () => {
    expect(minutes([punch("uscita", "17:00"), punch("entrata", "15:00"), punch("uscita", "12:00"), punch("entrata", "08:00")])).toBe(360);
  });
  it("non perde la prima parte del lavoro con una doppia entrata", () => {
    const s = summary([punch("entrata", "08:00"), punch("entrata", "09:00"), punch("uscita", "12:00")]);
    expect(s.workMinutes).toBe(240); expect(s.issues[0].kind).toBe("duplicate_entry");
  });
  it("taglia al cambio cantiere senza sovrapporre ore e segnala la sequenza", () => {
    const s = summary([punch("entrata", "08:00"), punch("entrata", "12:00", "B"), punch("uscita", "17:00", "B")]);
    expect(s.byOrder.get("A")?.workMinutes).toBe(240);
    expect(s.byOrder.get("B")?.workMinutes).toBe(300);
    expect(s.issues[0].kind).toBe("site_change");
  });
  it("gestisce cambio in pausa e uscita durante pausa", () => {
    const s = summary([punch("entrata", "08:00"), punch("pausa_inizio", "10:00"), punch("pausa_fine", "11:00", "B"), punch("pausa_inizio", "12:00", "B"), punch("uscita", "13:00", "B")]);
    expect(s.byOrder.get("A")?.workMinutes).toBe(120);
    expect(s.byOrder.get("B")?.workMinutes).toBe(60);
    expect(s.pauseMinutes).toBe(120); expect(s.state).toBe("out");
  });
  it("non attribuisce un ingresso generico al cantiere indicato solo in uscita", () => {
    const s = summary([punch("entrata", "08:00", null), punch("uscita", "12:00", "B")]);
    expect(s.byOrder.get(null)?.workMinutes).toBe(240); expect(s.byOrder.has("B")).toBe(false);
    expect(s.issues[0].kind).toBe("context_mismatch");
  });
  it("non inventa ore da un'uscita o fine pausa senza ingresso", () => {
    const s = summary([punch("uscita", "08:00"), punch("pausa_fine", "09:00"), punch("uscita", "12:00")]);
    expect(s.workMinutes).toBe(0); expect(s.issues).toHaveLength(3);
  });
  it("conta la sessione aperta fino ad adesso come provvisoria", () => {
    const s = summary([punch("entrata", "16:00")]);
    expect(s.workMinutes).toBe(120); expect(s.byOrder.get("A")?.provisional).toBe(true);
    expect(s.activeOrderId).toBe("A"); expect(s.state).toBe("working");
  });
  it("non prolunga una sessione storica dimenticata fino a fine giornata", () => {
    const s = summarizeCampoTime([punch("entrata", "16:00")], { ...window, now: new Date("2026-09-25T18:00:00Z") });
    expect(s.workMinutes).toBe(0); expect(s.issues[0].kind).toBe("open_session");
  });
  it("ripartisce un turno notturno sul giorno richiesto", () => {
    const s = summary([{ ...punch("entrata", "22:00"), timestamp_evento: "2026-09-23T22:00:00Z" }, punch("uscita", "06:00")]);
    expect(s.workMinutes).toBe(360);
  });
  it("conserva anche la porzione precedente a mezzanotte quando l'uscita successiva è nota", () => {
    const rows = [punch("entrata", "22:00"), { ...punch("uscita", "02:00"), timestamp_evento: "2026-09-25T02:00:00Z" }];
    const now = new Date("2026-09-25T08:00:00Z");
    const firstDay = summarizeCampoTime(rows, { ...window, now });
    const secondDay = summarizeCampoTime(rows, { start: window.end, end: new Date("2026-09-26T00:00:00Z"), now });
    expect(firstDay.workMinutes).toBe(120);
    expect(secondDay.workMinutes).toBe(120);
    expect(firstDay.workMinutes + secondDay.workMinutes).toBe(240);
  });
  it("misura il tempo reale al cambio ora, non la differenza fra etichette locali", () => {
    const s = summarizeCampoTime([
      { ...punch("entrata", "00:00"), timestamp_evento: "2026-10-25T02:30:00+02:00" },
      { ...punch("uscita", "00:00"), timestamp_evento: "2026-10-25T02:30:00+01:00" },
    ], { start: new Date("2026-10-25T00:00:00+02:00"), end: new Date("2026-10-26T00:00:00+01:00"), now: new Date("2026-10-26T12:00:00Z") });
    expect(s.workMinutes).toBe(60);
  });
  it("ignora righe ripetute, future o invalide senza NaN", () => {
    const entry = { ...punch("entrata", "08:00"), id: "same" };
    const s = summary([entry, entry, punch("uscita", "12:00"), punch("entrata", "23:00"), { ...entry, timestamp_evento: "bad" }]);
    expect(s.workMinutes).toBe(240); expect(s.state).toBe("out"); expect(s.issues[0].kind).toBe("invalid_event");
  });
  it("separa le ore non attribuite e non arrotonda ogni segmento", () => {
    const s = summary([punch("entrata", "08:00"), punch("uscita", "08:07"), punch("entrata", "09:00"), punch("uscita", "09:07"), punch("entrata", "10:00", null), punch("uscita", "11:00", null)]);
    expect(s.byOrder.get("A")?.workMinutes).toBe(14);
    expect(campoReportHours(14)).toBe(0.2); expect(s.byOrder.get(null)?.workMinutes).toBe(60);
  });
  it("giornata vuota: nessuna presenza implicita", () => expect(summary([]).workMinutes).toBe(0));
  it("non muta input o date", () => {
    const rows = [punch("uscita", "12:00"), punch("entrata", "08:00")];
    const copy = structuredClone(rows); summary(rows); expect(rows).toEqual(copy);
    const date = new Date(2026, 8, 24, 12); campoDayWindow(date); expect(date.getHours()).toBe(12);
  });
  it("mantiene il cantiere aperto per pausa/ripresa/uscita", () => {
    for (const type of ["pausa_inizio", "pausa_fine", "uscita"]) expect(campoPunchOrderId(type, "A", "B")).toBe("A");
    expect(campoPunchOrderId("entrata", null, "B")).toBe("B");
    expect(campoPunchOrderId("uscita", null, "B")).toBeNull();
  });
  it("accetta solo transizioni coerenti", () => {
    expect(canRecordCampoPunch("out", "entrata")).toBe(true);
    expect(canRecordCampoPunch("working", "entrata")).toBe(false);
    expect(canRecordCampoPunch("paused", "uscita")).toBe(true);
    expect(canRecordCampoPunch("out", "pausa_fine")).toBe(false);
  });
});
