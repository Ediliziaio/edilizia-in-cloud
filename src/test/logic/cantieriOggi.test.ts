import { describe, expect, it } from "vitest";
import {
  giorniLavorativiDa,
  statoCantiere,
  parseCantieriOggi,
  presenzeLabel,
  pendingCount,
  makeOggiItems,
  filterOggiItems,
  nextOggiAction,
  phaseToday,
} from "@/lib/orders/cantieriOggi";
import {
  oggiRow as row,
  oggiOrder as order,
  oggiPhase as phase,
  oggiTask as task,
  oggiOverview as overview,
  oggiNow as now,
} from "@/test/fixtures/cantieriOggi";

describe("Cantieri oggi: dati leggibili senza falsi zeri", () => {
  it("does not declare an old signal to be a stopped site without planned people", () => {
    expect(
      statoCantiere(
        row({
          ultimo_segnale: "2026-01-01T12:00:00Z",
          giorni_senza_segnale: 299,
        }),
        now,
      ),
    ).toEqual({ testo: "Non pianificato oggi", tono: "neutro" });
  });
  it("requests verification, not a conclusion of absence or stoppage", () => {
    expect(statoCantiere(row({ previste: 2 }), now)).toMatchObject({
      testo: "Rilevazioni da verificare",
      tono: "attenzione",
    });
    expect(
      statoCantiere(
        row({ previste: 2, ultimo_segnale: "2026-10-20T12:00:00Z" }),
        now,
      ).testo,
    ).toMatch(/Nessun segnale da/);
  });
  it("weekends do not automatically create absence warnings even with old signals", () => {
    expect(
      statoCantiere(
        row({ previste: 2, ultimo_segnale: "2026-10-01T12:00:00Z" }),
        new Date("2026-10-25T10:00:00+01:00"),
      ).tono,
    ).toBe("neutro");
  });
  it("uses Italian dates and weekdays across midnight and DST", () => {
    expect(
      giorniLavorativiDa(
        "2026-10-16T16:00:00+02:00",
        new Date("2026-10-19T08:00:00+02:00"),
      ),
    ).toBe(1);
    expect(giorniLavorativiDa("2026-10-25T23:30:00Z", now)).toBe(1);
    expect(giorniLavorativiDa("invalid", now)).toBe(0);
    expect(giorniLavorativiDa("2027-01-01", now)).toBe(0);
  });
  it("labels zero planned workers separately from missing or observed data", () => {
    expect(presenzeLabel(row())).toBe("Nessuna squadra prevista");
    expect(presenzeLabel(row({ previste: 2, timbrate: 1 }))).toBe(
      "1 rilevato oggi · 2 previsti",
    );
    expect(presenzeLabel(row({ previste: null }))).toBe(
      "Dati presenze non disponibili",
    );
  });
  it("reports count evidence without claiming people are currently on site", () => {
    expect(statoCantiere(row({ timbrate: 2 }), now).testo).toBe(
      "Rilevazioni ricevute",
    );
    expect(statoCantiere(row({ rapportini_oggi: 1 }), now).testo).toBe(
      "Rapportino ricevuto",
    );
  });
  it("keeps missing, malformed and negative counts unknown", () => {
    const result = parseCantieriOggi([
      {
        id: "x",
        previste: undefined,
        timbrate: "3",
        bolle: -1,
        correzioni: 0,
        rapportini_da_approvare: 1,
      },
    ])[0];
    expect(result.previste).toBeNull();
    expect(result.timbrate).toBeNull();
    expect(pendingCount(result)).toBeNull();
    expect(statoCantiere(result, now).tono).toBe("neutro");
  });
  it("rejects malformed or duplicate source rows instead of duplicating KPI", () => {
    expect(() => parseCantieriOggi({})).toThrow();
    expect(() => parseCantieriOggi([row(), row()])).toThrow(/duplicati/);
  });
});
describe("daily priorities and planning", () => {
  it("distinguishes open from operational today", () => {
    const items = makeOggiItems([row({ stato: "in_corso" })], overview(), now);
    expect(items[0].operational).toBe(false);
    expect(filterOggiItems(items, "oggi", "", "")).toHaveLength(0);
  });
  it.each([{ previste: 2 }, { timbrate: 1 }, { rapportini_oggi: 1 }])(
    "recognizes actual operational evidence %j",
    (evidence) => {
      expect(
        makeOggiItems([row(evidence)], overview(), now)[0].operational,
      ).toBe(true);
    },
  );
  it("uses phase dates, excludes finished/future work and does not invent a start", () => {
    expect(phaseToday(phase(), "2026-10-27")).toBe(true);
    expect(phaseToday(phase({ status: "completata" }), "2026-10-27")).toBe(
      false,
    );
    expect(phaseToday(phase({ start_date: "2026-11-01" }), "2026-10-27")).toBe(
      false,
    );
    expect(phaseToday(phase({ start_date: null }), "2026-10-27")).toBe(false);
    expect(phaseToday(phase({ end_date: null }), "2026-10-27")).toBe(true);
  });
  it("flags scheduled work without a crew, but not an idle historical job", () => {
    const i = makeOggiItems([row()], overview({ phases: [phase()] }), now)[0];
    expect(i.attention).toBe(true);
    expect(nextOggiAction(i).detail).toMatch(/nessuna squadra/);
    expect(makeOggiItems([row()], overview(), now)[0].attention).toBe(false);
  });
  it("does not call a missing owner unassigned until the order metadata is known", () => {
    const missing = makeOggiItems(
      [row({ responsabile: null })],
      undefined,
      now,
    )[0];
    expect(missing.incomplete).toBe(true);
    expect(missing.owner).toBe("Responsabile da verificare");
    expect(
      makeOggiItems([row({ responsabile: null })], overview(), now)[0].owner,
    ).toBe("Responsabile non disponibile");
  });
  it("excludes waiting/completed tasks from overdue, but includes released successors", () => {
    const tasks = [
      task({ id: "waiting", status: "in_attesa" }),
      task({ id: "done", status: "completata" }),
      task({ id: "released", bloccata_da_task_id: "old-done-parent" }),
    ];
    const i = makeOggiItems([row()], overview({ tasks }), now)[0];
    expect(i.lateTasks.map((t) => t.id)).toEqual(["released"]);
    expect(nextOggiAction(i).view).toBe("ufficio");
  });
  it("keeps pending counts and critical sites ahead of quiet sites", () => {
    const rows = [row(), row({ id: "o2", descrizione: "Zeta", bolle: 2 })];
    const items = makeOggiItems(
      rows,
      overview({ orders: [order(), order({ id: "o2" })] }),
      now,
    );
    expect(
      filterOggiItems(items, "priorita", "", "").map((i) => i.row.id),
    ).toEqual(["o2"]);
    expect(nextOggiAction(items[1])).toMatchObject({ view: "approvazioni" });
  });
  it("combines accent-insensitive search and stable owner IDs without mutating source", () => {
    const rows = [row({ descrizione: "Caffè Centrale", responsabile: "Anna" })];
    const items = makeOggiItems(rows, overview(), now);
    expect(filterOggiItems(items, "tutti", "caffe", "u1")).toHaveLength(1);
    expect(filterOggiItems(items, "tutti", "caffe", "other")).toHaveLength(0);
    expect(rows[0].descrizione).toBe("Caffè Centrale");
  });
  it("avoids repeating an address already in the job title", () => {
    expect(
      makeOggiItems(
        [
          row({
            descrizione: "Bagno Via Roma 12 — Milano",
            indirizzo: "Via Roma 12, 20100 Milano",
          }),
        ],
        overview(),
        now,
      )[0].address,
    ).toBeNull();
  });
});
