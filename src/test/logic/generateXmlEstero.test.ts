import { describe, it, expect } from "vitest";
import { capSdi } from "../../../supabase/functions/_shared/generateXML";

describe("CAP nell'XML della fattura", () => {
  it("italiano a cinque cifre passa così com'è", () => {
    expect(capSdi("20121", "IT")).toBe("20121");
  });
  it("estero diventa 00000: lo schema vuole cinque cifre", () => {
    expect(capSdi("SW1A 1AA", "GB")).toBe("00000");
    expect(capSdi("10115", "DE")).toBe("00000");
  });
  it("italiano scritto male non fa scartare la fattura", () => {
    expect(capSdi("2012", "IT")).toBe("00000");
    expect(capSdi(null, null)).toBe("00000");
  });
  it("dal CAP sporco recupera le cinque cifre", () => {
    expect(capSdi("20121 MI", "IT")).toBe("20121");
    expect(capSdi("20-121", "IT")).toBe("20121");
  });
});
