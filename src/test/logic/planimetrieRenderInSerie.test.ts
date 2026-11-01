import { describe, expect, it } from "vitest";
import { configPerStanza, lavoriDaFare } from "@/lib/planimetrie/render/renderInSerie";
import { IDEE_PRONTE } from "@/modules/render-stanza/lib/ideePronte";
import { buildRoomPrompt } from "../../../shared/render-room/stanzaPromptBuilder.ts";

describe("render in serie dalla pianta", () => {
  const stanze = [{ id: "a", nome: "Cucina" }, { id: "b", nome: "Camera" }];

  it("stanze × stili, un lavoro per coppia con una chiave unica", () => {
    const l = lavoriDaFare(stanze, IDEE_PRONTE.slice(0, 3));
    expect(l).toHaveLength(6);
    expect(new Set(l.map((x) => x.chiave)).size).toBe(6);
    expect(l.slice(0, 2).every((x) => x.idea.id === IDEE_PRONTE[0].id)).toBe(true);
  });

  it("la configurazione prende il tipo di stanza dalla destinazione, l'idea e la nota comune", () => {
    const c = configPerStanza("camera", IDEE_PRONTE[1], "  nessuna persona ");
    expect(c.tipo_stanza).toBe("camera_da_letto");
    expect(c.stile_target).toBe("giapponese");
    expect(c.note_libere).toBe(`${IDEE_PRONTE[1].richiesta}\nnessuna persona`);
    const p = buildRoomPrompt(c);
    expect(p.validation.isValid).toBe(true);
    expect(p.userPrompt).toContain("nessuna persona");
  });
});
