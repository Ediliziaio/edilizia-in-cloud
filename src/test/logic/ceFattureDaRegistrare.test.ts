import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", (): { supabase: Record<string, unknown> } => ({ supabase: {} }));
import { buildQualityChecks } from "@/components/controllo-gestione/tabs/TabCERiclassificato";

const base = { hasCedolini: true, periodoLabel: "Anno completo", ebitdaPctPil: 12, costoMaterie: 100, costoPersonale: 100 };

describe("CE: fatture ricevute da registrare", () => {
  it("le dice per prime, con quante sono e quanto valgono, e porta all'elenco filtrato", () => {
    const checks = buildQualityChecks({ ...base, costiNonClassificati: 50, daRegistrare: { righe: 1512, imponibile: 1246766 } });
    expect(checks[0].id).toBe("da-registrare");
    expect(checks[0].label).toMatch(/^1512 fatture ricevute da registrare \(1\.246\.766/);
    expect(checks[0].href).toBe("/azienda/documenti/fatture-ricevute?filtro=da_contabilizzare");
  });

  it("senza fatture da registrare non c'è la riga", () => {
    expect(buildQualityChecks({ ...base, daRegistrare: null }).map((c) => c.id)).not.toContain("da-registrare");
    expect(buildQualityChecks({ ...base, daRegistrare: { righe: 0, imponibile: 0 } })).toHaveLength(0);
  });
});

describe("CE: fatture emesse senza imponibile", () => {
  it("le segnala con quante sono e quanto valgono", () => {
    const checks = buildQualityChecks({ ...base, senzaImponibile: { righe: 273, totale: 3289028 } });
    const c = checks.find((x) => x.id === "senza-imponibile");
    expect(c?.label).toMatch(/^273 fatture emesse senza imponibile \(3\.289\.028/);
    expect(c?.href).toBe("/azienda/documenti");
  });
});
