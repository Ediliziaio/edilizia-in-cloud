import { describe, expect, it } from "vitest";
import { consentiSimulazionePreventivoAi } from "@/lib/preventivi/localSimulation";
const id = "d2000000-0000-4000-a000-000000000002";
describe("laboratorio locale Demo Azienda 2", () => {
  it.each(["localhost", "127.0.0.1", "[::1]", "::1"])("abilitato solo sul loopback %s", host => {
    expect(consentiSimulazionePreventivoAi(true, host, id)).toBe(true);
  });
  it("non si abilita in produzione, su altre aziende o su un server remoto", () => {
    expect(consentiSimulazionePreventivoAi(false, "localhost", id)).toBe(false);
    expect(consentiSimulazionePreventivoAi(true, "app.example.com", id)).toBe(false);
    expect(consentiSimulazionePreventivoAi(true, "127.0.0.1", "altra-azienda")).toBe(false);
    expect(consentiSimulazionePreventivoAi(true, "127.0.0.1", null)).toBe(false);
  });
});
