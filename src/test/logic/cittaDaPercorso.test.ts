import { describe, expect, it } from "vitest";
import { cittaDaPercorso } from "@/pages/city/cittaDaPercorso";

describe("città di una landing locale", () => {
  it("vale con e senza barra finale", () => {
    expect(cittaDaPercorso("/software-gestionale-edilizia-milano/")).toBe("milano");
    expect(cittaDaPercorso("/software-gestionale-edilizia-milano")).toBe("milano");
    expect(cittaDaPercorso("/software-gestionale-edilizia-reggio-emilia/")).toBe("reggio-emilia");
  });

  it("niente città per indirizzi che non sono una landing", () => {
    expect(cittaDaPercorso("/software-gestionale-edilizia-")).toBeUndefined();
    expect(cittaDaPercorso("/software-gestionale-edilizia/")).toBeUndefined();
    expect(cittaDaPercorso("/software-gestionale-edilizia-milano/prezzi")).toBeUndefined();
  });
});
