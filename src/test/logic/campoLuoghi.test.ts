import { describe, expect, it } from "vitest";
import {
  LUOGO_NESSUNO, chiaveCantiere, chiaveLuogoCorrente, chiaveSede, costruisciLuoghi, nomeLuogo, partenzaPredefinita, trovaLuogo,
  righeTimeline, type LuogoOrigine,
} from "@/lib/campo/luoghi";
import { summarizeCampoTime, type CampoPunch } from "@/lib/campo/timeSummary";

const ass = (id: string, code = id, description: string | null = `Lavoro ${id}`): LuogoOrigine["assegnazioni"][number] =>
  ({ order_id: id, order: { order_code: code, description, indirizzo_lavori: null as string | null } });
const origine = (over: Partial<LuogoOrigine> = {}): LuogoOrigine => ({
  assegnazioni: [ass("A"), ass("B")], sedi: [], oggiIds: new Set<string>(), ...over,
});

describe("Luoghi della giornata", () => {
  it("mette sedi e cantieri nello stesso elenco, con i cantieri di oggi in primo piano", () => {
    const l = costruisciLuoghi(origine({ sedi: [{ id: "S", nome: "Magazzino Verona" }], oggiIds: new Set(["B"]) }));
    expect(l.map(x => [x.key, x.oggi])).toEqual([[chiaveSede("S"), true], [chiaveCantiere("A"), false], [chiaveCantiere("B"), true]]);
  });
  it("se non sa quali cantieri sono di oggi li considera tutti di oggi", () => {
    expect(costruisciLuoghi(origine()).every(x => x.oggi)).toBe(true);
  });
  it("tiene un cantiere in corso anche se non è più fra gli assegnati", () => {
    const l = costruisciLuoghi(origine({ apertoOrderId: "Z" }));
    expect(l.at(-1)).toMatchObject({ key: chiaveCantiere("Z"), nome: "Cantiere in corso" });
    expect(costruisciLuoghi(origine({ apertoOrderId: "A" }))).toHaveLength(2);
  });
  it("dà un nome leggibile a ogni luogo", () => {
    const [sede, cantiere] = costruisciLuoghi(origine({ sedi: [{ id: "S", nome: null }], assegnazioni: [ass("A", "ORD-1", "Via Roma")] }));
    expect(nomeLuogo(sede)).toBe("Sede");
    expect(nomeLuogo(cantiere)).toBe("ORD-1 · Via Roma");
    expect(nomeLuogo(trovaLuogo([], LUOGO_NESSUNO)!)).toBe("Nessun posto indicato");
  });
});

describe("Da dove proporre la partenza (un tocco)", () => {
  const due = costruisciLuoghi(origine());
  const unoESede = costruisciLuoghi(origine({ assegnazioni: [ass("A")], sedi: [{ id: "S", nome: "Sede" }] }));
  const soloSede = costruisciLuoghi(origine({ assegnazioni: [], sedi: [{ id: "S", nome: "Sede" }] }));
  it("il cantiere del link vince su tutto", () => {
    expect(partenzaPredefinita(due, { preferOrderId: "B", ricordata: chiaveCantiere("A") })).toBe(chiaveCantiere("B"));
  });
  it("un link verso un cantiere non assegnato non vale", () => {
    expect(partenzaPredefinita(due, { preferOrderId: "X" })).toBeNull();
  });
  it("ricorda l'ultimo posto da cui si è partiti, se esiste ancora", () => {
    expect(partenzaPredefinita(unoESede, { ricordata: chiaveSede("S") })).toBe(chiaveSede("S"));
    expect(partenzaPredefinita(due, { ricordata: chiaveCantiere("Z") })).toBeNull();
    expect(partenzaPredefinita(due, { ricordata: LUOGO_NESSUNO })).toBe(LUOGO_NESSUNO);
  });
  it("con un solo cantiere di oggi parte da lì, anche se c'è una sede", () => {
    expect(partenzaPredefinita(unoESede)).toBe(chiaveCantiere("A"));
  });
  it("senza cantieri di oggi e con una sola sede parte dalla sede", () => {
    expect(partenzaPredefinita(soloSede)).toBe(chiaveSede("S"));
  });
  it("con più cantieri di oggi lascia scegliere alla persona", () => {
    expect(partenzaPredefinita(due)).toBeNull();
  });
});

describe("Dove sei adesso", () => {
  const punch = (tipo: string, hour: string, extra: Partial<CampoPunch> = {}): CampoPunch =>
    ({ tipo, timestamp_evento: `2026-09-24T${hour}:00Z`, order_id: null, ...extra });
  const window = { start: new Date("2026-09-24T00:00:00Z"), end: new Date("2026-09-25T00:00:00Z"), now: new Date("2026-09-24T18:00:00Z"), includeOpen: true };
  const corrente = (p: CampoPunch[]) => chiaveLuogoCorrente(summarizeCampoTime(p, window));

  it("non è in nessun posto se è fuori servizio", () => {
    expect(corrente([])).toBeNull();
    expect(corrente([punch("entrata", "08:00"), punch("uscita", "12:00")])).toBeNull();
  });
  it("riconosce cantiere, sede e nessun posto", () => {
    expect(corrente([punch("entrata", "08:00", { order_id: "A" })])).toBe(chiaveCantiere("A"));
    expect(corrente([punch("entrata", "08:00", { in_sede: true, sede_id: "S" })])).toBe(chiaveSede("S"));
    expect(corrente([punch("entrata", "08:00")])).toBe(LUOGO_NESSUNO);
  });
  it("un cambio di posto (uscita + entrata a un millisecondo) porta nel posto nuovo", () => {
    const p = [
      punch("entrata", "08:00", { in_sede: true, sede_id: "S" }),
      { tipo: "uscita", timestamp_evento: "2026-09-24T09:00:00.000Z", order_id: null, in_sede: true, sede_id: "S" },
      { tipo: "entrata", timestamp_evento: "2026-09-24T09:00:00.001Z", order_id: "A" },
    ];
    expect(corrente(p)).toBe(chiaveCantiere("A"));
  });
});

describe("Ore senza posto: la sede dichiarata non è «da attribuire»", () => {
  const punch = (tipo: string, hour: string, extra: Partial<CampoPunch> = {}): CampoPunch =>
    ({ tipo, timestamp_evento: `2026-09-24T${hour}:00Z`, order_id: null, ...extra });
  const window = { start: new Date("2026-09-24T00:00:00Z"), end: new Date("2026-09-25T00:00:00Z"), now: new Date("2026-09-24T18:00:00Z"), includeOpen: true };

  it("magazzino 1h poi cantiere 7h: nessuna ora da attribuire, 8h in totale", () => {
    const s = summarizeCampoTime([
      punch("entrata", "07:00", { in_sede: true, sede_id: "S" }),
      punch("uscita", "08:00", { in_sede: true, sede_id: "S" }),
      punch("entrata", "08:00", { order_id: "A" }),
      punch("uscita", "15:00", { order_id: "A" }),
    ], window);
    expect(s.unassignedMinutes).toBe(0);
    expect(s.workMinutes).toBe(480);
    expect(s.byOrder.get("A")?.workMinutes).toBe(420);
  });
  it("senza sede dichiarata e senza cantiere restano ore da attribuire", () => {
    const s = summarizeCampoTime([punch("entrata", "08:00"), punch("uscita", "10:00")], window);
    expect(s.unassignedMinutes).toBe(120);
  });
  it("una sede segnata ma con un cantiere accanto non conta come sede", () => {
    const s = summarizeCampoTime([punch("entrata", "08:00", { in_sede: true, order_id: "A" }), punch("uscita", "10:00", { order_id: "A" })], window);
    expect(s.activeInSede).toBe(false);
    expect(s.unassignedMinutes).toBe(0);
  });
  it("dice da che ora dura il tratto aperto", () => {
    const s = summarizeCampoTime([punch("entrata", "08:00", { order_id: "A" }), punch("pausa_inizio", "10:00", { order_id: "A" }), punch("pausa_fine", "10:30", { order_id: "A" })], window);
    expect(s.legStartedAt).toBe(Date.parse("2026-09-24T08:00:00Z"));
  });
});

describe("Cronologia della giornata", () => {
  const luoghi = costruisciLuoghi(origine({ sedi: [{ id: "S", nome: "Magazzino" }], assegnazioni: [ass("A", "ORD-1")] }));
  const ev = (tipo: string, at: string, extra: Record<string, unknown> = {}) =>
    ({ tipo, timestamp_evento: `2026-09-24T${at}Z`, order_id: null as string | null, ...extra });

  it("un cambio di posto (uscita + entrata a un millisecondo) è una sola riga", () => {
    const righe = righeTimeline([
      ev("entrata", "07:00:00.000", { in_sede: true, sede_id: "S" }),
      ev("uscita", "08:00:00.000", { in_sede: true, sede_id: "S" }),
      ev("entrata", "08:00:00.001", { order_id: "A" }),
      ev("pausa_inizio", "12:00:00.000", { order_id: "A" }),
      ev("pausa_fine", "12:30:00.000", { order_id: "A" }),
      ev("uscita", "16:00:00.000", { order_id: "A" }),
    ], luoghi).map(r => [r.tipo, r.luogo]);
    expect(righe).toEqual([["inizio", "Magazzino"], ["cambio", "ORD-1"], ["pausa_inizio", null], ["pausa_fine", null], ["fine", null]]);
  });
  it("un'uscita seguita da una nuova entrata ore dopo non è un cambio", () => {
    const righe = righeTimeline([ev("entrata", "08:00:00", { order_id: "A" }), ev("uscita", "12:00:00", { order_id: "A" }), ev("entrata", "13:00:00", { order_id: "A" })], luoghi).map(r => r.tipo);
    expect(righe).toEqual(["inizio", "fine", "inizio"]);
  });
  it("ordina le timbrature anche se arrivano in disordine", () => {
    const righe = righeTimeline([ev("uscita", "16:00:00"), ev("entrata", "08:00:00")], luoghi).map(r => r.tipo);
    expect(righe).toEqual(["inizio", "fine"]);
  });
});
