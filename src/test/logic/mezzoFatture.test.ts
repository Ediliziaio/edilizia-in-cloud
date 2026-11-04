import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { totaleConfermato } from "@/components/mezzi/MezzoFattureSection";

describe("costo del mezzo dalle fatture", () => {
  it("contano solo le confermate", () => {
    expect(totaleConfermato([{ importo: 100, confermata: true }, { importo: 50, confermata: false }])).toBe(100);
  });
  it("una nota di credito toglie", () => {
    expect(totaleConfermato([{ importo: 100.1, confermata: true }, { importo: -20.05, confermata: true }])).toBe(80.05);
  });
  it("un importo mancante conta zero", () => {
    expect(totaleConfermato([{ importo: null, confermata: true }])).toBe(0);
  });
});
