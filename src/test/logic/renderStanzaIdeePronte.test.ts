import { describe, expect, it } from "vitest";
import { DEFAULT_STANZA_CONFIG } from "@/components/render-stanza/StanzaConfigForm";
import { applicaIdea, ideaAttiva, ideePerStanza, IDEE_PRONTE } from "@/modules/render-stanza/lib/ideePronte";
import { buildRoomPrompt } from "../../../shared/render-room/stanzaPromptBuilder.ts";
import { normalizeRoomFloorConfig } from "../../../shared/render-room/roomRenderConfig.ts";

const base = () => structuredClone(DEFAULT_STANZA_CONFIG);

describe("idee pronte del render stanza", () => {
  it.each(IDEE_PRONTE.map((i) => [i.nome, i] as const))("%s: il prompt è valido e contiene la richiesta", (_n, idea) => {
    const cfg = applicaIdea({ ...base(), tipo_stanza: idea.stanze?.[0] ?? "soggiorno" }, idea);
    const p = buildRoomPrompt(cfg);
    expect(p.validation.isValid).toBe(true);
    expect(p.userPrompt).toContain(idea.richiesta);
  });

  it("i pavimenti scelti sono tipi che il motore conosce (non ricadono sul gres di ripiego)", () => {
    for (const idea of IDEE_PRONTE) {
      const cfg = applicaIdea(base(), idea);
      if (!cfg.pavimento.attivo || cfg.pavimento.tipo === "gres_porcellanato") continue;
      expect(normalizeRoomFloorConfig(cfg.pavimento as unknown as Record<string, unknown>).tipo, idea.nome).not.toBe("gres_porcellanato");
    }
  });

  it("tiene tipo di stanza, foto del catalogo e quello che l'utente aveva scritto; cambiare idea sostituisce la richiesta", () => {
    const cfg = { ...base(), tipo_stanza: "cucina" as const, catalogo_reference_ids: ["x"], note_libere: "tieni il frigo a sinistra" };
    const a = applicaIdea(cfg, IDEE_PRONTE[0]);
    expect(a.tipo_stanza).toBe("cucina");
    expect(a.catalogo_reference_ids).toEqual(["x"]);
    expect(a.note_libere).toBe(`${IDEE_PRONTE[0].richiesta}\ntieni il frigo a sinistra`);
    expect(ideaAttiva(a)).toBe(IDEE_PRONTE[0].id);
    const b = applicaIdea(a, IDEE_PRONTE[1]);
    expect(b.note_libere).toBe(`${IDEE_PRONTE[1].richiesta}\ntieni il frigo a sinistra`);
    expect(ideaAttiva(b)).toBe(IDEE_PRONTE[1].id);
  });

  it("le idee solo per il bagno non escono nelle altre stanze", () => {
    expect(ideePerStanza("cucina").some((i) => i.id === "bagno_spa")).toBe(false);
    expect(ideePerStanza("bagno").some((i) => i.id === "bagno_spa")).toBe(true);
  });
});
