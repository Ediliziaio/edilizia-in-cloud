import { describe, expect, it } from "vitest";
import { campoReportUrl, isClientReport } from "@/lib/campo/reportKind";

describe("Tipo di rapporto del campo", () => {
  it("un giornaliero non dipende dalla firma dell'autore", () => {
    expect(isClientReport({})).toBe(false);
    expect(isClientReport({ lavoro_completato: false, firma_cliente_url: null })).toBe(false);
  });
  it("mantiene i vecchi fine lavori anche senza immagine di firma", () => {
    expect(isClientReport({ lavoro_completato: true })).toBe(true);
  });
  it("non perde una firma cliente storica se il flag di fine lavori manca", () => {
    expect(isClientReport({ firma_cliente_url: "cliente.png" })).toBe(true);
    expect(isClientReport({ firma_cliente_url: " " })).toBe(false);
  });
  it("correzioni e ingressi hanno URL distinti e conservano il giorno", () => {
    expect(campoReportUrl("site", "daily", "2026-10-12")).toBe("/campo/lavoro/site/rapportino?data=2026-10-12");
    expect(campoReportUrl("site", "client", "2026-10-12")).toBe("/campo/lavoro/site/rapporto-fine-lavori?data=2026-10-12");
    expect(campoReportUrl("site", "client")).toBe("/campo/lavoro/site/rapporto-fine-lavori");
  });
});
