import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCommessaCampoEvent, isCommessaCampoQueryKey, refreshCampoAcquistoQueries, refreshCommessaCampoQueries } from "@/lib/orders/refreshCommessaCampoQueries";
import { createCommessaRefresh } from "@/lib/orders/createCommessaRefresh";

const keys = [
  ["order-campo-rapportini", "o", "c"], ["order-diary-audit", "o", "c"], ["order-events", "c", "o"],
  ["cronoprogramma-rapportini", "o", "c"], ["order-material-usage", "o", "c"], ["order-economics-canonical", "o"],
  ["order-economics-vehicles", "o"], ["oes-employees", "o"], ["order-conteggi-viste", "o", "c"],
  ["orders", "detail", "o"], ["orders", "diary-header", "o"], ["foto-cantiere", "order", "c", "o"],
  ["mezzi", "commessa", "o"], ["mezzi", "commessa-montaggi", "o"], ["campo-sottofasi", "commessa", "o"],
  ["campo-lavoro", "o", "c", "u"], ["campo-squadra", "o", "2026-10-13"], ["campo-chi-lavora", "o"],
  ["campo-rapportini-ordine", "o", "u"], ["campo-rapportino-gia-oggi", "c", "o", "u", "2026-10-13"],
  ["timeline-rapportini", "o", "c"], ["linked-purchase-orders", "o", "c"], ["order-messages", "c", "o"],
  ["order-labor-economics", "o", "c", true], ["order-subcontract-economics", "o", "c"],
];
describe("Allineamento Campo e commessa: letture canoniche, nessuna scrittura economica", () => {
  it.each(keys)("riconosce la chiave %j", (...key) => {
    expect(isCommessaCampoQueryKey(key, "o", "c")).toBe(true);
  });
  it.each([
    ["order-economics-canonical", "altro"], ["order-conteggi-viste", "o", "altra"], ["orders", "list", "c"],
    ["orders", "detail", "altro"], ["foto-cantiere", "order", "altra", "o"], ["foto-cantiere", "company", "c"],
    ["mezzi", "elenco", "c"], ["mezzi", "scheda", "o"], ["campo-sottofasi", "phase-id"],
    ["campo-lavoro", "o", "altra", "u"], ["campo-rapportino-gia-oggi", "altra", "o", "u"],
    ["linked-purchase-orders", "o", "altra"], ["company-costs", "c"], ["acquisti-campo-ufficio", "c"],
    ["order-labor-economics", "o", "altra", true], ["order-subcontract-economics", "o", "altra"],
  ])("non aggiorna una chiave estranea %j", (...key) => {
    expect(isCommessaCampoQueryKey(key, "o", "c")).toBe(false);
  });
  it("marca le viste chiuse senza richieste e non altera i loro valori", async () => {
    const qc = new QueryClient(); const load = vi.fn();
    for (const key of keys) { qc.setQueryDefaults(key, { queryFn: load }); qc.setQueryData(key, { originale: true }); }
    await refreshCommessaCampoQueries(qc, "o", "c");
    for (const key of keys) { expect(qc.getQueryState(key)?.isInvalidated).toBe(true); expect(qc.getQueryData(key)).toEqual({ originale: true }); }
    expect(load).not.toHaveBeenCalled(); qc.clear();
  });
  it("nella seconda cache simulata rilegge la vista attiva e attende la conferma", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["order-campo-rapportini", "o", "c"];
    qc.setQueryData(key, [{ stato: "inviato", ore: 4 }]);
    const read = vi.fn().mockResolvedValue([{ stato: "approvato", ore: 4 }]);
    const observer = new QueryObserver(qc, { queryKey: key, queryFn: read, staleTime: Infinity });
    const release = observer.subscribe(() => undefined);
    try {
      await refreshCommessaCampoQueries(qc, "o", "c");
      expect(qc.getQueryData(key)).toEqual([{ stato: "approvato", ore: 4 }]); expect(read).toHaveBeenCalledTimes(1);
    } finally { release(); qc.clear(); }
  });
  it("un acquisto riallinea commessa e code della sola azienda catturata", async () => {
    const qc = new QueryClient();
    const own = [["acquisti-campo-ufficio", "c"], ["campo-acquisti-miei", "c", "u"], ["order-economics-canonical", "o"]];
    const other = [["acquisti-campo-ufficio", "altra"], ["campo-acquisti-miei", "altra", "u"], ["order-economics-canonical", "altro"]];
    [...own, ...other].forEach(key => qc.setQueryData(key, []));
    await refreshCampoAcquistoQueries(qc, "o", "c");
    own.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(true));
    other.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(false)); qc.clear();
  });
  it("senza azienda o commessa non fa un'invalidazione globale di recupero", async () => {
    const qc = new QueryClient(); const spy = vi.spyOn(qc, "invalidateQueries");
    await refreshCommessaCampoQueries(qc, null, "c"); await refreshCommessaCampoQueries(qc, "o", null);
    await refreshCampoAcquistoQueries(qc, "o", null); expect(spy).not.toHaveBeenCalled(); qc.clear();
  });
  it.each([{ order_id: "o", company_id: "altra" }, { order_id: "altro", company_id: "c" }, { order_id: "o" }, {}])("scarta un evento non verificabile %j", row => {
    expect(isCommessaCampoEvent(row, "o", "c")).toBe(false);
  });
});

describe("Recupero leggero: eventi, ritorno all'app e rete", () => {
  let hidden = false, online = true;
  const controllers: ReturnType<typeof createCommessaRefresh>[] = [];
  beforeEach(() => {
    hidden = false; online = true; vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  });
  afterEach(() => { controllers.splice(0).forEach(c => c.dispose()); vi.useRealTimers(); vi.restoreAllMocks(); });
  const create = (refresh: () => Promise<unknown>) => { const c = createCommessaRefresh(refresh); controllers.push(c); return c; };
  it("accorpa una raffica di cento eventi in una sola rilettura", async () => {
    const read = vi.fn().mockResolvedValue(undefined); const c = create(read);
    for (let i = 0; i < 100; i++) c.request();
    await vi.advanceTimersByTimeAsync(350); expect(read).toHaveBeenCalledTimes(1);
  });
  it("non sovrappone i refresh e conserva un evento arrivato durante la lettura", async () => {
    let resolve!: () => void; const read = vi.fn().mockImplementationOnce(() => new Promise<void>(done => { resolve = done; })).mockResolvedValue(undefined);
    const c = create(read); c.request(); await vi.advanceTimersByTimeAsync(350); c.request();
    await vi.advanceTimersByTimeAsync(10_000); expect(read).toHaveBeenCalledTimes(1);
    resolve(); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(2_000);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("resta silenzioso offline e in background, poi recupera una sola volta", async () => {
    const read = vi.fn().mockResolvedValue(undefined); const c = create(read); hidden = true; online = false; c.request();
    await vi.advanceTimersByTimeAsync(240_000); expect(read).not.toHaveBeenCalled();
    hidden = false; online = true;
    document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(350); expect(read).toHaveBeenCalledTimes(1);
  });
  it("recupera un evento mancante con un controllo ogni due minuti solo in primo piano", async () => {
    const read = vi.fn().mockResolvedValue(undefined); create(read);
    await vi.advanceTimersByTimeAsync(119_999); expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(351); expect(read).toHaveBeenCalledTimes(1);
  });
  it("un errore non produce un loop stretto di tentativi", async () => {
    const read = vi.fn().mockRejectedValue(new Error("Offline")); const c = create(read); c.request();
    await vi.advanceTimersByTimeAsync(350); c.request(); await vi.advanceTimersByTimeAsync(3_999);
    expect(read).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledTimes(2);
  });
  it("chiudere la pagina rilascia eventi e timer", async () => {
    const read = vi.fn().mockResolvedValue(undefined); const c = create(read); c.request(); c.dispose(); c.dispose();
    window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(300_000);
    expect(read).not.toHaveBeenCalled();
  });
});
