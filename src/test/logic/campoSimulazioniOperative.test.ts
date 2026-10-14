/** Deterministic fake workdays. Seed 20261013; no Supabase client or network. */
import { describe, expect, it } from "vitest";
import { campoDayWindow, summarizeCampoTime, type CampoPunch } from "@/lib/campo/timeSummary";
import { campoWorkDay, reportDayAllowed, shiftWorkDay, validWorkDay } from "@/lib/campo/workDay";
import { validateRapportinoHours, type CampoHoursDraft } from "@/lib/campo/rapportinoHours";
import { materialUsage, type MaterialMovement } from "@/lib/orders/materialUsage";
import { normalizeVoiceProposal } from "@/lib/campo/voiceProposal";

const seed = 20261013;
function randomFor(run: number) {
  let state = (seed + run) >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 2 ** 32; };
}

describe("64 giornate con due cantieri, pausa, tragitto e ritiro in magazzino", () => {
  it.each(Array.from({ length: 64 }, (_, run) => run))("giornata riproducibile %s", run => {
    const random = randomFor(run);
    const pause = 10 + Math.floor(random() * 30), travel = 10 + Math.floor(random() * 40), warehouse = 10 + Math.floor(random() * 30);
    const base = Date.parse("2026-10-13T06:00:00Z");
    const events: CampoPunch[] = [];
    const punch = (tipo: string, minute: number, order_id: string | null, in_sede = false, seconds = 0) => {
      events.push({ id: `run-${run}-${events.length}`, tipo, order_id, in_sede, timestamp_evento: new Date(base + minute * 60_000 + seconds * 1000).toISOString() });
    };
    punch("entrata", 0, "A"); punch("pausa_inizio", 60, "A"); punch("pausa_fine", 60 + pause, "A"); punch("uscita", 120, "A");
    punch("entrata", 120, null, false, 1); punch("uscita", 120 + travel, null, false, 1);
    punch("entrata", 120 + travel, "B", false, 2); punch("uscita", 240 + travel, "B", false, 2);
    punch("entrata", 240 + travel, null, true, 3); punch("uscita", 240 + travel + warehouse, null, true, 3);
    const { start, end } = campoDayWindow("2026-10-13");
    const options = { start, end, now: new Date("2026-10-13T18:00:00Z") };
    const result = summarizeCampoTime(events, options);
    expect(result.byOrder.get("A")?.workMinutes).toBe(120 - pause);
    expect(result.byOrder.get("B")?.workMinutes).toBe(120);
    expect(result.unassignedMinutes).toBe(travel);
    expect(result.pauseMinutes).toBe(pause);
    expect(result.workMinutes).toBe(240 - pause + travel + warehouse);
    expect(result.state).toBe("out"); expect(result.issues).toEqual([]);
    // Input order and retransmission of an identical ID cannot create more hours.
    const shuffled = [...events, ...events.map(event => ({ ...event }))];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const retry = summarizeCampoTime(shuffled, options);
    expect(retry.segments).toEqual(result.segments); expect(retry.workMinutes).toBe(result.workMinutes);
  });
});

const dayCases = [
  ["2026-03-28", 24], ["2026-03-29", 23], ["2026-03-30", 24],
  ["2026-10-24", 24], ["2026-10-25", 25], ["2026-10-26", 24],
  ["2028-02-29", 24], ["2026-12-31", 24], ["2027-01-01", 24],
] as const;
describe("Date italiane, cambio ora e scadenza del giornaliero", () => {
  it.each([
    { day: "2026-03-28", entry: "2026-03-28T21:00:00Z", exit: "2026-03-29T04:00:00Z", first: 120, second: 300 },
    { day: "2026-10-24", entry: "2026-10-24T20:00:00Z", exit: "2026-10-25T04:00:00Z", first: 120, second: 360 },
    { day: "2026-10-12", entry: "2026-10-12T20:00:00Z", exit: "2026-10-13T04:00:00Z", first: 120, second: 360 },
  ])("turno notturno $day ripartito fra due giornalieri senza raddoppiare", s => {
    const punches = [
      { id: "in", tipo: "entrata", timestamp_evento: s.entry, order_id: "A" },
      { id: "out", tipo: "uscita", timestamp_evento: s.exit, order_id: "A" },
    ];
    const now = new Date(s.exit);
    const first = summarizeCampoTime(punches, { ...campoDayWindow(s.day), now });
    const second = summarizeCampoTime(punches, { ...campoDayWindow(shiftWorkDay(s.day, 1)), now });
    expect(first.workMinutes).toBe(s.first); expect(second.workMinutes).toBe(s.second);
    expect(first.workMinutes + second.workMinutes).toBe((Date.parse(s.exit) - Date.parse(s.entry)) / 60_000);
  });
  it.each(dayCases)("%s ha %s ore civili", (day, length) => {
    const { start, end } = campoDayWindow(day);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(length);
    expect(campoWorkDay(start)).toBe(day);
    expect(campoWorkDay(new Date(end.getTime() - 1))).toBe(day);
    expect(campoWorkDay(end)).toBe(shiftWorkDay(day, 1));
    expect(reportDayAllowed(day, new Date(end.getTime() - 1))).toBe(true);
    const tomorrow = campoDayWindow(shiftWorkDay(day, 1));
    expect(reportDayAllowed(day, new Date(tomorrow.end.getTime() - 1))).toBe(true);
    expect(reportDayAllowed(day, tomorrow.end)).toBe(false);
  });
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-10-00", "13/10/2026", "", "2026-10-13T00:00:00Z"])("rifiuta data ambigua o inesistente %s", day => {
    expect(validWorkDay(day)).toBe(false); expect(reportDayAllowed(day)).toBe(false);
  });
});

const hoursCases = (["", 0, 0.01, 1.5, 7.62, 24, 24.01, -1, NaN, Infinity] as CampoHoursDraft[])
  .flatMap(own => [0, 0.01, 1, 24, -1, Infinity].flatMap(extra =>
    [null, "", 0, 8, 24, 25].map(presence => ({ own, extra, presence }))));
describe("Ore personali, straordinario e presenze (360 combinazioni)", () => {
  it.each(hoursCases)("ordinarie=$own · extra=$extra · presenza=$presence", ({ own, extra, presence }) => {
    const presences = presence === null ? {} : { selected: presence as CampoHoursDraft };
    const ordinary = own === "" ? 0 : own;
    const allowed = !(own === "" && presence === null) && Number.isFinite(ordinary) && ordinary >= 0 &&
      Number.isFinite(extra) && extra >= 0 && ordinary + extra <= 24 && !(own === "" && extra > 0) &&
      (presence === null || typeof presence === "number" && presence > 0 && presence <= 24);
    if (allowed) expect(validateRapportinoHours(own, extra, presences)).toBe(ordinary);
    else expect(() => validateRapportinoHours(own, extra, presences)).toThrow();
  });
});

const materialCases = [1, 10, 25].flatMap(delivered => [0, 1, 12].flatMap(used =>
  [0, 1, 5].flatMap(returned => ["inviato", "approvato"].flatMap(status =>
    [null, 12.5].map(price => ({ delivered, used, returned, status, price }))))));
describe("Materiali: consegnato non significa consumato (108 combinazioni)", () => {
  it.each([true, false, [], [2], { value: 2 }, "0x10", "", null, "Infinity", "NaN", "1,5"])("una quantità corrotta %j non diventa un consumo inventato", quantita => {
    const movement: MaterialMovement = { id: "delivery", stock_item_id: "sku-A", movement_type: "scarico", quantity: 10, unit_cost: 12.5 };
    const result = materialUsage([movement], [{ id: "r", stato: "approvato", materiali_usati: [{ stock_item_id: "sku-A", quantita, unita: "pz" }] }], { "sku-A": "Articolo" }).rows[0];
    expect(result.used).toBe(0); expect(result.remaining).toBe(10); expect(result.review).toBe(true);
    expect(result.estimatedUsedValue).toBeNull();
  });
  it.each([true, "", "0x10", [2]])("un prezzo corrotto %j non diventa una stima monetaria", value => {
    const movement = { id: "delivery", stock_item_id: "sku-A", movement_type: "scarico", quantity: 10, unit_cost: value as unknown as number };
    const result = materialUsage([movement], [{ id: "r", stato: "approvato", materiali_usati: [{ stock_item_id: "sku-A", quantita: 2, unita: "pz" }] }], { "sku-A": "Articolo" }).rows[0];
    expect(result.estimatedUsedValue).toBeNull(); expect(result.review).toBe(true);
  });
  it.each(["2", "2.5", "2e0", " 2 ", ".5", "+2"])("mantiene la compatibilità con quantità numeriche %s", quantita => {
    const movement: MaterialMovement = { id: "delivery", stock_item_id: "sku-A", movement_type: "scarico", quantity: 10, unit_cost: 12.5 };
    const result = materialUsage([movement], [{ id: "r", stato: "approvato", materiali_usati: [{ stock_item_id: "sku-A", quantita, unita: "pz" }] }], { "sku-A": "Articolo" }).rows[0];
    expect(result.used).toBe(Number(quantita)); expect(result.estimatedUsedValue).toBe(Number(quantita) * 12.5); expect(result.review).toBe(false);
  });
  it.each(materialCases)("consegna=$delivered · uso=$used · reso=$returned · $status · prezzo=$price", s => {
    const movements: MaterialMovement[] = [{ id: "delivery", stock_item_id: "sku-A", movement_type: "scarico", quantity: s.delivered, unit_cost: s.price }];
    if (s.returned) movements.push({ id: "return", stock_item_id: "sku-A", movement_type: "carico", quantity: s.returned, unit_cost: s.price });
    const report = { id: "daily", stato: s.status, materiali_usati: s.used ? [{ stock_item_id: "sku-A", quantita: s.used, unita: "pz" }] : [] };
    const result = materialUsage([...movements, ...movements], [report, report], { "sku-A": "Articolo" }).rows[0];
    const used = s.status === "approvato" ? s.used : 0;
    const remaining = s.delivered - used - s.returned;
    expect(result.delivered).toBe(s.delivered); expect(result.used).toBe(used); expect(result.returned).toBe(s.returned);
    expect(result.remaining).toBe(remaining); expect(result.review).toBe(remaining < 0);
    expect(result.estimatedUsedValue).toBe(s.price === null || remaining < 0 ? null : used * s.price);
  });
});

describe("AI vocale: nessun campo estratto può diventare autorizzazione", () => {
  it.each(["approvato", "admin", "service_role", null, true, {}, [], "inviato"])("ignora il valore decisionale %j", value => {
    const proposal = normalizeVoiceProposal({ trascrizione: "Posa completata", dati_estratti: {
      lavorazione: "Posa", ore_lavorate: 4, stato: value, approvato: value, company_id: value,
      order_id: value, presenze: [{ employee_id: value, ore: 8 }], firma_cliente_url: value,
    } });
    for (const field of ["stato", "approvato", "company_id", "order_id", "presenze", "firma_cliente_url"])
      expect(proposal.dati_estratti).not.toHaveProperty(field);
  });
});
