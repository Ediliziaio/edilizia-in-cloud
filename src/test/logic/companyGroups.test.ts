import { describe, expect, it } from "vitest";
import { collectCompanyGroups } from "@/hooks/superadmin/useCompanyGroups";

describe("Classificazione delle aziende in gruppi", () => {
  it("deduplica le società e separa i tag generici dai gruppi", () => {
    expect(collectCompanyGroups([
      { company_id: "b", tag: "Gruppo: Scavolo" },
      { company_id: "a", tag: "Gruppo: Scavolo" },
      { company_id: "a", tag: "Gruppo: Scavolo" },
      { company_id: "c", tag: "Cliente importante" },
      { company_id: "d", tag: "Gruppo: Altro" },
      { company_id: "e", tag: "Gruppo: " },
    ])).toEqual([
      { name: "Altro", companyIds: ["d"] },
      { name: "Scavolo", companyIds: ["a", "b"] },
    ]);
  });
});
