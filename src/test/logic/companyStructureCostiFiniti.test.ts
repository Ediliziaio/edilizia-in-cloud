import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("struttura aziendale: costi fissi già finiti", () => {
  it("lascia fuori i costi con recurrence_end_date passata, con lo stesso filtro di useMarginData", () => {
    const filtro = 'recurrence_end_date.is.null,recurrence_end_date.gte.${new Date().toLocaleDateString("en-CA")}';
    const struttura = readFileSync(resolve(process.cwd(), "src/hooks/controlloGestione/useCompanyStructure.ts"), "utf8");
    const margini = readFileSync(resolve(process.cwd(), "src/hooks/useMarginData.ts"), "utf8");
    expect(margini).toContain(filtro);
    expect(struttura).toContain(filtro);
    expect(struttura).toContain('.select("amount, recurrence, recurrence_end_date, allocations")');
  });
});
