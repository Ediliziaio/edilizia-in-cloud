import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { siRiportaDaIncassare } from "@/components/fatturazione/RiportaDaIncassare";

const base = { origine: "importata", stato: "pagata", tipo: "fattura" };

describe("«Riporta da incassare»: su quali fatture compare", () => {
  it("le importate da XML pagate o pagate in parte", () => {
    expect(siRiportaDaIncassare({ ...base, external_provider: "xml_import" })).toBe(true);
    expect(siRiportaDaIncassare({ ...base, external_provider: "xml_import", stato: "parzialmente_pagata" })).toBe(true);
  });

  // 27/11/2026: un'impresa cliente ha 273 fatture del 2025 importate una volta dal gestionale di prima,
  // tutte «pagate» senza incasso. Se una non lo è davvero, si riporta da incassare.
  it("le storiche primanota", () => {
    expect(siRiportaDaIncassare({ ...base, external_provider: "primanota" })).toBe(true);
  });

  it("non quelle di un gestionale collegato, non le note di credito, non le aperte", () => {
    expect(siRiportaDaIncassare({ ...base, external_provider: "fatture_in_cloud" })).toBe(false);
    expect(siRiportaDaIncassare({ ...base, external_provider: null })).toBe(false);
    expect(siRiportaDaIncassare({ ...base, external_provider: "xml_import", tipo: "nota_credito" })).toBe(false);
    expect(siRiportaDaIncassare({ ...base, external_provider: "xml_import", stato: "emessa" })).toBe(false);
    expect(siRiportaDaIncassare({ ...base, origine: "interna", external_provider: "xml_import" })).toBe(false);
  });
});
