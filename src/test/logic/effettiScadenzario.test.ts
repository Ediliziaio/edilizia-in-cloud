import { describe, expect, it } from "vitest";
import {
  copertoPerDirezione, copertoRiga, eCoperta, effettiPerRiga, statoConEffetti, testoBadgeEffetti, testoEffettiExport, type Effetto,
} from "@/lib/finance/effettiScadenzario";
import { calcolaRiepilogo } from "@/lib/finance/riepilogoPeriodoScadenzario";
import { colonneDiSerie, costruisciRighe } from "@/lib/scadenzario/esportaScadenzario";
import { filtraEffetti, righeCsvEffetti } from "@/components/scadenzario/EffettiPanel";
import type { Scadenza } from "@/hooks/useScadenzario";

const OGGI = "2026-11-28";
const e = (o: Partial<Effetto> = {}): Effetto => ({
  id: "e1", tipo: "assegno", direzione: "emesso", numero: "12", banca: "BPER", importo: 1000, data_scadenza: "2026-12-15",
  stato: "in_attesa", riga_scadenzario_id: "r1", ...o,
});

describe("badge e copertura della riga", () => {
  it("un effetto: «Assegno al 15/12»; più effetti: «2 effetti · 4.500 €»", () => {
    expect(testoBadgeEffetti([e()])).toBe("Assegno al 15/12");
    expect(testoBadgeEffetti([e({ tipo: "riba" })])).toBe("Ri.Ba. al 15/12");
    expect(testoBadgeEffetti([e({ importo: 3000 }), e({ id: "e2", importo: 1500 })])?.replace(/\s/g, " ")).toMatch(/^2 effetti · 4\.500\s?€$/);
    expect(testoBadgeEffetti([])).toBeNull();
    expect(testoBadgeEffetti([e({ stato: "pagato" })])).toBeNull();
  });
  it("si aggancia per riga_scadenzario_id, solo gli effetti in attesa", () => {
    const m = effettiPerRiga([e(), e({ id: "e2", riga_scadenzario_id: "r2" }), e({ id: "e3", stato: "insoluto" })]);
    expect(m.get("r1")).toHaveLength(1);
    expect(m.get("r2")).toHaveLength(1);
    expect(m.size).toBe(2);
  });
  it("coperto al residuo: «Coperta da assegno» e non «Scaduta»", () => {
    const riga = { direction: "uscita" as const, status: "da_pagare" as const, due_date: "2026-11-10", amount: 1000, paid_amount: 0 };
    expect(statoConEffetti(riga, undefined, OGGI).label).toBe("Scaduta");
    const s = statoConEffetti(riga, [e()], OGGI);
    expect(s.label).toBe("Coperta da assegno");
    expect(s.tono).toBe("attesa");
    expect(statoConEffetti(riga, [e({ importo: 400 })], OGGI).label).toBe("Scaduta");
    // assegno già scaduto e non confermato: non copre più
    expect(statoConEffetti(riga, [e({ data_scadenza: "2026-11-20" })], OGGI).label).toBe("Scaduta");
    expect(eCoperta([e()], 1000, OGGI)).toBe(true);
    expect(copertoRiga([e({ importo: 5000 })], 1000, OGGI)).toBe(1000);
  });
});

describe("riquadri del periodo", () => {
  const righe = [
    { id: "r1", direction: "uscita", amount: 1000, paid_amount: 0, status: "da_pagare", due_date: "2026-11-10" },
    { id: "r2", direction: "uscita", amount: 500, paid_amount: 0, status: "da_pagare", due_date: "2026-11-10" },
  ];
  it("il coperto resta aperto, non è pagato e non è scaduto", () => {
    const x = calcolaRiepilogo(righe, { oggi: OGGI, effetti: [e()] });
    expect(x.uscite.aperto.importo).toBe(1500);
    expect(x.uscite.saldato.importo).toBe(0);
    expect(x.uscite.scaduto).toEqual({ n: 1, importo: 500 });
    expect(x.uscite.coperto).toEqual({ n: 1, importo: 1000 });
    expect(copertoPerDirezione(righe, [e()], OGGI).uscite.importo).toBe(1000);
  });
  it("senza effetti i numeri sono quelli di prima", () => {
    const x = calcolaRiepilogo(righe, { oggi: OGGI });
    expect(x.uscite.scaduto.importo).toBe(1500);
    expect(x.uscite.coperto).toBeUndefined();
  });
});

describe("elenco, CSV ed esportazione", () => {
  it("filtra per verso e stato, ordina per data", () => {
    const l = [e({ id: "a", data_scadenza: "2027-01-01" }), e({ id: "b", direzione: "ricevuto", data_scadenza: "2026-12-01" }), e({ id: "c", stato: "pagato" })];
    expect(filtraEffetti(l, "tutti", "in_attesa").map((x) => x.id)).toEqual(["b", "a"]);
    expect(filtraEffetti(l, "emesso", "tutti").map((x) => x.id)).toEqual(["c", "a"].sort((x, y) => (l.find((q) => q.id === x)!.data_scadenza! < l.find((q) => q.id === y)!.data_scadenza! ? -1 : 1)));
  });
  it("il CSV segna «da confermare» gli effetti con data passata", () => {
    const [r] = righeCsvEffetti([e({ data_scadenza: "2026-11-20", importo: 1234.5 })], OGGI);
    expect(r.da_confermare).toBe("Sì");
    expect(r.importo).toBe("1234,50");
    expect(r.data).toBe("20/11/2026");
  });
  it("la colonna «Effetti» dell'esportazione c'è ed è spenta di serie", () => {
    expect(colonneDiSerie("xlsx")).not.toContain("effetti");
    const s = { id: "s1", direction: "uscita", amount: 100, paid_amount: 0, status: "da_pagare", due_date: "2026-12-01", effetti_export: testoEffettiExport([e()]) } as unknown as Scadenza;
    expect(costruisciRighe([s], OGGI)[0].effetti).toBe("Assegno n. 12 15/12/2026 1.000,00 €");
  });
});

import { idCoperti } from "@/lib/finance/effettiScadenzario";
import { filtraScadenzario, MAX_ID_ESCLUSI } from "@/lib/finance/fontiScadenzario";
import { filtriPeriodo } from "@/lib/finance/riepilogoPeriodoScadenzario";

describe("«Scadute» senza le righe coperte da assegni", () => {
  const righe = [{ id: "r1", amount: 1000, paid_amount: 0 }, { id: "r2", amount: 1000, paid_amount: 0 }];
  it("idCoperti: solo quelle coperte per intero da effetti non scaduti", () => {
    expect(idCoperti(righe, [e(), e({ id: "e2", riga_scadenzario_id: "r2", importo: 300 })], OGGI)).toEqual(["r1"]);
  });
  const registra = () => {
    const chiamate: unknown[][] = [];
    const q: Record<string, (...a: unknown[]) => unknown> = new Proxy({}, { get: (_t, nome: string) => (...a: unknown[]) => { chiamate.push([nome, ...a]); return q; } });
    return { q, chiamate };
  };
  it("filtraScadenzario applica .not(id, in, (...)) con gli id fra virgolette", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { soloScadute: true, escludiIds: ["fonte:c1:r1", "x"] });
    expect(chiamate).toContainEqual(["not", "id", "in", '("fonte:c1:r1","x")']);
  });
  it("oltre il tetto o senza id non filtra", () => {
    const a = registra();
    filtraScadenzario(a.q, { escludiIds: Array.from({ length: MAX_ID_ESCLUSI + 1 }, (_, i) => `i${i}`) });
    const b = registra();
    filtraScadenzario(b.q, { escludiIds: [] });
    expect(a.chiamate.some((c) => c[0] === "not")).toBe(false);
    expect(b.chiamate.some((c) => c[0] === "not")).toBe(false);
  });
  it("i riquadri non ereditano l'esclusione; la linguetta «Scadute» non conta le coperte", () => {
    expect(filtriPeriodo({ soloScadute: true, escludiIds: ["r1"] }).escludiIds).toBeNull();
    const r = [{ id: "r1", direction: "uscita", amount: 1000, paid_amount: 0, status: "da_pagare", due_date: "2026-11-10" },
      { id: "r2", direction: "uscita", amount: 500, paid_amount: 0, status: "da_pagare", due_date: "2026-11-10" }];
    expect(calcolaRiepilogo(r, { oggi: OGGI, effetti: [e()] }).linguette.scadute).toBe(1);
    expect(calcolaRiepilogo(r, { oggi: OGGI }).linguette.scadute).toBe(2);
  });
});
