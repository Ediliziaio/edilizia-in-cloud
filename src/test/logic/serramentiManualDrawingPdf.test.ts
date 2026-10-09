import { describe, expect, it, vi } from "vitest";
import { chiaveDisegno, disegniDelPreventivo } from "@/lib/serramenti/disegniPerPdf";

vi.mock("@/lib/serramenti/rasterizzaDisegno", () => ({ rasterizzaDisegno: async () => ({ dataUrl: "data:image/png;base64,example", width: 100, height: 100 }) }));
vi.mock("@/components/serramenti/DisegnoSerramentoSvg", () => ({ DisegnoSerramentoSvg: (): null => null }));

describe("manual line frozen PDF drawing", () => {
  it("renders a saved design without requiring a live catalogue family", async () => {
    const row = { family_id: null as string | null, larghezza_mm: 900, altezza_mm: 2200, valori_assi: null as Record<string, string> | null, disegno_config: { v: 1 as const, tipologia: "porta_finestra_1_anta" } };
    const output = await disegniDelPreventivo([row], {}, {});
    expect(output[chiaveDisegno(null, 900, 2200, null, row.disegno_config)]?.viste).toHaveLength(2);
  });
  it("does not invent a design for a manual line without a snapshot", async () => {
    expect(await disegniDelPreventivo([{ family_id: null, larghezza_mm: 900, altezza_mm: 2200, valori_assi: null }], {}, {})).toEqual({});
  });
});
