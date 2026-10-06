/// <reference types="node" />
/**
 * Le date del preventivo (PDF, condizioni, email di invio) sono quelle ITALIANE.
 *
 * Il server delle edge function gira in UTC: fra mezzanotte e le due (d'estate;
 * l'una d'inverno) ora italiana `toLocaleDateString("it-IT")` dava il giorno
 * prima. Un preventivo salvato alle 00:30 del 6 ottobre usciva datato 5 ottobre,
 * e «valido fino al…» un giorno prima del dovuto.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { annoItaliano, dataItalianaBreve, dataItalianaLunga } from "../../../supabase/functions/_shared/dataItaliana";
import { buildMergeContext } from "../../../supabase/functions/_shared/quoteTemplateComposer";

afterEach(() => { vi.useRealTimers(); });

describe("dataItaliana", () => {
  it("00:30 italiane del 6 ottobre (22:30 UTC del 5, ora legale): il giorno è il 6", () => {
    expect(dataItalianaLunga("2026-10-05T22:30:00Z")).toBe("6 ottobre 2026");
    // Il formato numerico dipende dal motore (6/10/2026 o 06/10/2026): conta il giorno.
    expect(dataItalianaBreve("2026-10-05T22:30:00Z")).toMatch(/^0?6\/10\/2026$/);
  });

  it("d'inverno lo scarto è un'ora: 00:30 italiane del 5 novembre sono le 23:30 UTC del 4", () => {
    expect(dataItalianaBreve("2026-11-04T23:30:00Z")).toMatch(/^0?5\/11\/2026$/);
    // E alle 23:30 italiane (22:30 UTC) il giorno resta lo stesso.
    expect(dataItalianaBreve("2026-11-04T22:30:00Z")).toMatch(/^0?4\/11\/2026$/);
  });

  it("a Capodanno: un minuto dopo la mezzanotte italiana è già il nuovo anno", () => {
    expect(dataItalianaLunga("2026-12-31T23:01:00Z")).toBe("1 gennaio 2027");
    expect(annoItaliano("2026-12-31T23:01:00Z")).toBe("2027");
    expect(annoItaliano("2026-12-31T22:59:00Z")).toBe("2026");
  });

  it("a mezzogiorno non cambia niente; data mancante o non valida: vuoto, mai «Invalid Date»", () => {
    expect(dataItalianaLunga("2026-10-06T10:00:00Z")).toBe("6 ottobre 2026");
    for (const v of [null, undefined, "", "boh"]) {
      expect(dataItalianaLunga(v)).toBe("");
      expect(dataItalianaBreve(v)).toBe("");
      expect(annoItaliano(v)).toBe("");
    }
  });
});

describe("tag del preventivo nelle condizioni: {{preventivo.data}}, {{preventivo.scadenza}}, {{data.oggi}}", () => {
  it("data e scadenza sono i giorni italiani", () => {
    const ctx = buildMergeContext({ quote: { created_at: "2026-10-05T22:30:00Z", expires_at: "2026-11-04T23:30:00Z", quote_number: "OFF-2026-042" } });
    expect(ctx.preventivo?.data).toMatch(/^0?6\/10\/2026$/);
    expect(ctx.preventivo?.scadenza).toMatch(/^0?5\/11\/2026$/);
  });

  it("«oggi» e l'anno sono quelli italiani anche a Capodanno", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    const ctx = buildMergeContext({ quote: {} });
    expect(ctx.data?.oggi).toMatch(/^0?1\/0?1\/2027$/);
    expect(ctx.data?.anno).toBe("2027");
  });
});

describe("le funzioni dei preventivi non scrivono più date col giorno UTC", () => {
  it.each([
    "supabase/functions/generate-quote-pdf/index.ts",
    "supabase/functions/_shared/quoteTemplateComposer.ts",
    "supabase/functions/send-quote-signature/index.ts",
  ])("%s", (file) => {
    const testo = readFileSync(file, "utf8");
    // Solo le date col fuso esplicito passano da dataItaliana.ts.
    expect(testo).not.toMatch(/toLocaleDateString\(\s*"it-IT"/);
  });
});
