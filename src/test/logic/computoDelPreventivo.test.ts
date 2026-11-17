import { describe, expect, it } from "vitest";
import { bozzaDaSorgente, vociDaBozza } from "@/lib/distinta/computoDelPreventivo";
import { bozzaVuota, type VoceEditor } from "@/lib/computo/editorNativo";

const voce = (id: string, opzionale = false) => ({ ...bozzaVuota().voci[0], id, opzionale } as unknown as VoceEditor);

describe("il computo del preventivo per «Genera dal computo»", () => {
  it("riconosce la bozza solo dai preventivi con computo", () => {
    expect(bozzaDaSorgente("modulo:computo:8ba14219-ae65-429e-bb25-3d29edd49a4a")).toBe("8ba14219-ae65-429e-bb25-3d29edd49a4a");
    expect(bozzaDaSorgente("modulo:bagni:8ba14219-ae65-429e-bb25-3d29edd49a4a")).toBeNull();
    expect(bozzaDaSorgente(null)).toBeNull();
  });

  it("porta le voci del contratto, non le opzionali", () => {
    const voci = vociDaBozza({ voci: [voce("a"), voce("b", true), voce("c")] }, "Computo del preventivo OFF-1");
    expect(voci.map((v) => v.id)).toEqual(["a", "c"]);
    expect(voci[0]).toMatchObject({ avvisi: [], origine: "Computo del preventivo OFF-1" });
  });
});
