import { describe, expect, it } from "vitest";
import { giorniDallaFattura } from "@/pages/azienda/fatturazione/FattureRicevutePage";

describe("fatture ricevute: arrivata il", () => {
  it("conta i giorni fra la data della fattura e la consegna dello SDI", () => {
    expect(giorniDallaFattura({ data_fattura: "2026-10-07", data_ricezione_sdi: "2026-10-19T23:35:06Z" })).toBe(13);
    expect(giorniDallaFattura({ data_fattura: "2026-10-16", data_ricezione_sdi: "2026-10-16T11:42:05Z" })).toBe(0);
  });

  it("usa il giorno italiano: le 23:30 UTC sono già il giorno dopo", () => {
    expect(giorniDallaFattura({ data_fattura: "2026-10-14", data_ricezione_sdi: "2026-10-14T22:30:00Z" })).toBe(1);
  });

  it("senza data di arrivo non inventa niente", () => {
    expect(giorniDallaFattura({ data_fattura: "2026-09-09", data_ricezione_sdi: null })).toBeNull();
  });
});

describe("fatture ricevute: le due date a vista (12/11/2026)", () => {
  // Una fattura emessa a settembre può arrivare oggi dallo SDI: servono tutte e due, ognuna col suo nome.
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const pagina = readFileSync(join(__dirname, "../../..", "src/pages/azienda/fatturazione/FattureRicevutePage.tsx"), "utf8");
  const riepilogo = readFileSync(join(__dirname, "../../..", "src/components/fatturazione/RiepilogoFatturaRicevuta.tsx"), "utf8");

  it("in tabella due colonne: «Emessa il» e «Arrivata il»", () => {
    expect(pagina).toContain(">Emessa il</IntestazioneOrdinabile>");
    expect(pagina).toContain("<TableHead>Arrivata il</TableHead>");
    expect(pagina).toContain("<DataEmissione f={f} />");
    expect(pagina).toContain("<DataArrivo f={f} />");
  });

  it("nella finestra e sul telefono le date hanno il loro nome", () => {
    expect(riepilogo).toContain("· emessa il {formatDateShort(");
    expect(pagina).toContain("· emessa il {formatDateShort(dettaglioMobile.data_fattura)}");
    expect(pagina).toContain("arrivata dallo SDI il");
  });
});
