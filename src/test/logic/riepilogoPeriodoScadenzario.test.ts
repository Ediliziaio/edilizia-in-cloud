import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
import { calcolaRiepilogo, caricaRiepilogoPeriodo, giornoPrima, type RigaRiepilogo } from "@/lib/finance/riepilogoPeriodoScadenzario";

const r = (o: Partial<RigaRiepilogo>): RigaRiepilogo => ({ direction: "uscita", amount: 100, paid_amount: 0, status: "da_pagare", due_date: "2026-11-20", ...o });
const OGGI = "2026-11-15";

describe("calcolaRiepilogo", () => {
  const righe = [
    r({ id: "1", direction: "entrata", amount: 1000, status: "da_pagare", due_date: "2026-11-10" }), // scaduta
    r({ id: "2", direction: "entrata", amount: 500, paid_amount: 200, status: "parziale", due_date: "2026-11-30" }),
    r({ id: "3", direction: "entrata", amount: 300, paid_amount: 300, status: "pagata" }),
    r({ id: "4", direction: "uscita", amount: 400, status: "da_pagare", due_date: "2026-11-01" }), // scaduta
    r({ id: "5", direction: "uscita", amount: 250, paid_amount: 250, status: "pagata" }),
    r({ id: "6", direction: "uscita", amount: 999, status: "annullata" }),
  ];
  const x = calcolaRiepilogo(righe, { oggi: OGGI });

  it("le annullate non contano", () => {
    expect(x.uscite.totale).toEqual({ n: 2, importo: 650 });
    expect(x.linguette.tutte).toBe(5);
  });
  it("parziale: residuo in aperto, pagato in saldato", () => {
    expect(x.entrate.aperto).toEqual({ n: 2, importo: 1300 });
    expect(x.entrate.saldato).toEqual({ n: 1, importo: 500 });
    expect(x.entrate.totale).toEqual({ n: 3, importo: 1800 });
  });
  it("scaduto = aperto con data passata", () => {
    expect(x.entrate.scaduto).toEqual({ n: 1, importo: 1000 });
    expect(x.uscite.scaduto).toEqual({ n: 1, importo: 400 });
  });
  it("le linguette sono coerenti fra loro", () => {
    const l = x.linguette;
    expect(l.aperte).toBe(l.da_incassare + l.da_pagare);
    expect(l.tutte).toBe(l.aperte + l.pagate);
    expect(l.scadute).toBe(2);
    expect(l).toMatchObject({ aperte: 3, da_incassare: 2, da_pagare: 1, pagate: 2 });
  });
  it("arretrato null senza inizio periodo, calcolato con l'inizio", () => {
    expect(x.arretrato).toBeNull();
    const y = calcolaRiepilogo([], { oggi: OGGI, inizioPeriodo: "2026-11-01", righeArretrato: [
      r({ direction: "entrata", amount: 100, paid_amount: 40, status: "parziale" }), r({ amount: 70 }), r({ status: "annullata" }),
    ] });
    expect(y.arretrato).toEqual({ entrate: { n: 1, importo: 60 }, uscite: { n: 1, importo: 70 } });
  });
  it("senza righe tutto a zero", () => {
    expect(calcolaRiepilogo([], { oggi: OGGI }).entrate.totale).toEqual({ n: 0, importo: 0 });
  });
});

describe("caricaRiepilogoPeriodo", () => {
  function finto(righe: RigaRiepilogo[]) {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "is", "lt", "ilike", "or", "order"]) q[m] = () => q;
    q.range = () => Promise.resolve({ data: righe, error: null });
    return q;
  }
  it("fa 2 letture con l'inizio, 1 senza", async () => {
    rpc.mockReset(); rpc.mockImplementation(() => finto([r({})]));
    await caricaRiepilogoPeriodo("c1", { dateFrom: "2026-11-01", dateTo: "2026-11-30", direction: "entrata", status: "pagata", soloScadute: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockClear();
    const x = await caricaRiepilogoPeriodo("c1", {});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(x.arretrato).toBeNull();
  });
  it("oltre il tetto segna troncato", async () => {
    rpc.mockReset(); rpc.mockImplementation(() => finto(Array.from({ length: 1000 }, (_, i) => r({ id: String(i) }))));
    const x = await caricaRiepilogoPeriodo("c1", {});
    expect(x.troncato).toBe(true);
    expect(x.uscite.totale.n).toBe(5000);
  });
  it("giornoPrima", () => { expect(giornoPrima("2026-12-01")).toBe("2026-11-30"); expect(giornoPrima("2026-01-01")).toBe("2025-12-31"); });
});
