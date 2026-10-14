import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { refreshRapportinoQueries, refreshRapportinoFromOrderEvent } from "@/lib/orders/refreshRapportinoQueries";

it("approvazione/rifiuto riallineano diario, cronoprogramma, materiali e indicatori personali", () => {
  const qc = new QueryClient();
  const keys = [
    ["order-campo-rapportini", "o", "c"], ["order-diary-audit", "o", "c"],
    ["order-events", "c", "o"], ["cronoprogramma-rapportini", "o", "c"],
    ["costi-materiali-fasi", "c", "o"], ["order-material-usage", "o", "c"],
    ["campo-rapportino-gia-oggi", "c", "o", "u", "2026-10-13", "daily", true],
    ["campo-ore-gia-registrate", "o", "2026-10-13", "u"],
  ];
  const other = [
    ["order-diary-audit", "altro", "c"], ["order-events", "c", "altro"],
    ["costi-materiali-fasi", "c", "altro"], ["cronoprogramma-rapportini", "altro", "c"],
    ["campo-rapportino-gia-oggi", "c", "altro", "u", "2026-10-13", "daily", true],
  ];
  [...keys, ...other].forEach(key => qc.setQueryData(key, []));
  refreshWorkQueries(qc, "o");
  keys.forEach(key => expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true));
  other.forEach(key => expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false));
  qc.clear();
});

it("non esegue richieste per le viste chiuse, le marca solo da aggiornare", () => {
  const qc = new QueryClient();
  const load = vi.fn();
  qc.setQueryDefaults(["cronoprogramma-rapportini", "o"], { queryFn: load });
  qc.setQueryData(["cronoprogramma-rapportini", "o", "c"], []);
  refreshWorkQueries(qc, "o");
  expect(load).not.toHaveBeenCalled();
  qc.clear();
});

it("la funzione mirata rispetta l'azienda e non ricarica riepiloghi globali", () => {
  const qc = new QueryClient();
  const own = [["cronoprogramma-rapportini", "o", "c"], ["order-events", "c", "o"], ["order-diary-audit", "o", "c"]];
  const others = [["cronoprogramma-rapportini", "o", "altra"], ["order-events", "altra", "o"],
    ["order-diary-audit", "o", "altra"], ["company-costs", "c"], ["campo-rapportino-gia-oggi", "c", "altro", "u"]];
  [...own, ...others].forEach(key => qc.setQueryData(key, []));
  const spy = vi.spyOn(qc, "invalidateQueries");
  refreshRapportinoQueries(qc, "o", "c");
  own.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(true));
  others.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(false));
  expect(spy).toHaveBeenCalledOnce();
  qc.clear();
});

it("senza commessa la funzione mirata non invalida nulla", () => {
  const qc = new QueryClient(); const spy = vi.spyOn(qc, "invalidateQueries");
  refreshRapportinoQueries(qc, null, "c");
  expect(spy).not.toHaveBeenCalled(); qc.clear();
});

it("un evento rapportino della commessa riallinea le viste nella seconda sessione simulata", () => {
  const office = new QueryClient();
  const keys = [["order-campo-rapportini", "o", "c"], ["order-diary-audit", "o", "c"],
    ["cronoprogramma-rapportini", "o", "c"], ["order-material-usage", "o", "c"]];
  keys.forEach(key => office.setQueryData(key, []));
  expect(refreshRapportinoFromOrderEvent(office, "c", "o", { company_id: "c", order_id: "o", event_type: "reportino_cantiere" })).toBe(true);
  keys.forEach(key => expect(office.getQueryState(key)?.isInvalidated).toBe(true));
  office.clear();
});

it.each([
  { company_id: "altra", order_id: "o", event_type: "reportino_cantiere" },
  { company_id: "c", order_id: "altro", event_type: "reportino_cantiere" },
  { company_id: "c", order_id: "o", event_type: "documento_caricato" },
  { order_id: "o", event_type: "reportino_cantiere" },
])("non scambia un evento estraneo o incompleto per un rapportino: %j", row => {
  const qc = new QueryClient(); const spy = vi.spyOn(qc, "invalidateQueries");
  expect(refreshRapportinoFromOrderEvent(qc, "c", "o", row)).toBe(false);
  expect(spy).not.toHaveBeenCalled(); qc.clear();
});
