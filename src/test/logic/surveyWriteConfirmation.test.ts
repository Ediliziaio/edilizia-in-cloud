import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateSurvey,
  updateArea,
  updateElement,
  deleteArea,
  deleteElement,
  deleteMedia,
} from "@/lib/api/surveys";
const mock = vi.hoisted(() => ({
  from: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mock.from },
}));
beforeEach(() => {
  const chain = {
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: mock.single,
    maybeSingle: mock.maybeSingle,
  };
  for (const method of [chain.update, chain.delete, chain.eq, chain.select])
    method.mockReturnValue(chain);
  mock.from.mockReturnValue(chain);
  mock.single.mockResolvedValue({
    data: null,
    error: { message: "No writable row" },
  });
  mock.maybeSingle.mockResolvedValue({ data: null, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("Nessun falso salvataggio quando RLS non modifica righe", () => {
  it.each([
    () => updateSurvey("survey", { notes: "Note" }),
    () => updateArea("area", { name: "Stanza" }),
    () => updateElement("element", { notes: "Nota" }),
    () => deleteArea("area"),
    () => deleteElement("element"),
    () => deleteMedia("media"),
  ])(
    "segnala il fallimento dopo revoca o consegna, non un successo",
    async (action) => {
      await expect(action()).rejects.toThrow();
      expect(mock.single).toHaveBeenCalled();
    },
  );
  it("accetta un salvataggio soltanto dopo conferma della riga", async () => {
    mock.single.mockResolvedValue({ data: { id: "survey" }, error: null });
    await expect(
      updateSurvey("survey", { notes: "Note" }),
    ).resolves.toBeUndefined();
  });
});
