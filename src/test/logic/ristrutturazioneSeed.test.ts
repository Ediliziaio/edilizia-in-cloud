import { describe, it, expect } from "vitest";
import { SEED_LISTINO, buildSeedRows } from "@/lib/ristrutturazione/seedListino";
describe("seed listino", () => {
  it("ha capitoli edili standard con voci valide", () => {
    expect(SEED_LISTINO.length).toBeGreaterThanOrEqual(8);
    for (const cap of SEED_LISTINO) { expect(cap.nome).toBeTruthy(); expect(cap.voci.length).toBeGreaterThan(0);
      for (const v of cap.voci) { expect(v.descrizione).toBeTruthy(); expect(["mq","ml","cad","corpo","kg","h","a corpo"]).toContain(v.unita_misura); } }
  });
  it("buildSeedRows imposta company_id", () => {
    const { capitoli, voci } = buildSeedRows("c-1");
    expect(capitoli.every((c) => c.company_id === "c-1")).toBe(true);
    expect(voci.every((v) => v.company_id === "c-1")).toBe(true);
  });
});
