import { describe, expect, it } from "vitest";

import { DEFAULT_STANZA_CONFIG } from "@/components/render-stanza/StanzaConfigForm";
import { buildRoomPrompt } from "../../../shared/render-room/stanzaPromptBuilder.ts";
import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";

function config(): ConfigurazioneStanza {
  return structuredClone(DEFAULT_STANZA_CONFIG);
}

describe("room render prompt pipeline", () => {
  it("uses the advanced floor rules when room floor replacement is active", () => {
    const cfg = config();
    cfg.pavimento = {
      ...cfg.pavimento,
      attivo: true,
      tipo: "marmo",
      effetto_visivo: "marmo",
      formato_piastrella: "120x240",
      pattern: "dritto",
      finitura: "lucido",
      fuga_larghezza_mm: 2,
      fuga_colore: "tono_su_tono",
    };

    const prompt = buildRoomPrompt(cfg);
    expect(prompt.userPrompt.toLowerCase()).toContain("120x240 cm modules");
    expect(prompt.userPrompt.toLowerCase()).toContain("large-format scale");
    expect(prompt.userPrompt.toLowerCase()).toContain("no small-tile subdivision");
    expect(prompt.userPrompt.toLowerCase()).toContain("tone-on-tone grout");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps kitchen layout and appliance anchors during kitchen restyling", () => {
    const cfg = config();
    cfg.tipo_stanza = "cucina";
    cfg.restyling_cucina = {
      ...cfg.restyling_cucina!,
      attivo: true,
      materiale_frontali: "effetto_legno",
      maniglie: "senza_maniglia",
      cambia_piano_cottura: false,
    };

    const prompt = buildRoomPrompt(cfg);
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("preserve the photographed kitchen cabinet layout");
    expect(text).toContain("sink position");
    expect(text).toContain("clear work triangle");
    expect(text).toContain("keep the existing cooktop");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps mixed lighting from inventing unrelated decorative fixtures", () => {
    const cfg = config();
    cfg.illuminazione = {
      ...cfg.illuminazione,
      attivo: true,
      tipo: "misto",
      temperatura: "neutra_3000k",
    };

    const prompt = buildRoomPrompt(cfg);
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("use the existing visible lighting points as anchors");
    expect(text).toContain("do not invent a decorative chandelier");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("locks an accent wall to one wall plane only", () => {
    const cfg = config();
    cfg.verniciatura = {
      attivo: true,
      applica_a: "parete_accento",
      colore_accento_hex: "#264653",
      colore_accento_nome: "blu petrolio",
      finitura: "opaco",
    };

    const prompt = buildRoomPrompt(cfg);
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("single accent wall only");
    expect(text).toContain("paint one single accent wall plane only");
    expect(text).toContain("do not repaint the remaining walls");
    expect(text).toContain("do not change floor, ceiling, furniture or openings");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps wallpaper on the selected wall without spillover", () => {
    const cfg = config();
    cfg.carta_da_parati = {
      attivo: true,
      stile_pattern: "botanico",
      applica_a: "parete_principale",
      colore_base: "avorio",
      descrizione: "foglie sottili tono su tono",
    };

    const prompt = buildRoomPrompt(cfg);
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("wallpaper target: parete principale");
    expect(text).toContain("do not spill onto ceiling");
    expect(text).toContain("doors, windows, trim, baseboards or furniture");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes suspension lights without inventing unrelated chandeliers", () => {
    const cfg = config();
    cfg.illuminazione = {
      attivo: true,
      tipo: "lampade_sospensione",
      temperatura: "calda_2700k",
      intensita_luce: "normale",
    };

    const prompt = buildRoomPrompt(cfg);
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("lampade sospensione");
    expect(text).toContain("ceiling suspension points");
    expect(text).toContain("do not invent unrelated chandeliers");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("removes curtains and hardware while preserving the window", () => {
    const cfg = config();
    cfg.tende = {
      attivo: true,
      tipo: "nessuna",
    };

    const prompt = buildRoomPrompt(cfg);
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("remove visible curtains and curtain hardware");
    expect(text).toContain("remove curtains, rods, rails and visible brackets only");
    expect(text).toContain("exterior view");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("does not allow radical mode to change the photographed architecture", () => {
    const cfg = config();
    cfg.intensita = "radicale";
    cfg.arredo = {
      ...cfg.arredo,
      attivo: true,
      intensita_cambio: "arredo_completo",
    };

    const prompt = buildRoomPrompt(cfg);
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("same photographed architecture");
    expect(text).toContain("preserve photographed wall corners");
    expect(text).toContain("no crop");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("preserves furniture geometry when only color is selected", () => {
    const cfg = config();
    cfg.arredo = {
      ...cfg.arredo,
      attivo: true,
      intensita_cambio: "colore_sola",
    };

    const prompt = buildRoomPrompt(cfg);
    expect(prompt.userPrompt.toLowerCase()).toContain("do not change furniture geometry");
    expect(prompt.userPrompt.toLowerCase()).toContain("only surface finish changes");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("turns space/detail choices into explicit add/remove/keep instructions", () => {
    const cfg = config();
    cfg.spazi_dettagli = {
      attivo: true,
      layout_strategy: "ottimizza_spazio",
      elementi_da_mantenere: "divano e porta finestra",
      elementi_da_aggiungere: "applique laterali e tappeto neutro",
      elementi_da_rimuovere: "mobile basso vecchio",
    };

    const prompt = buildRoomPrompt(cfg);
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("applique laterali");
    expect(text).toContain("mobile basso vecchio");
    expect(text).toContain("divano e porta finestra");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("never leaks undefined strings into the final room prompt", () => {
    const cfg = config();
    cfg.pavimento = {
      ...cfg.pavimento,
      attivo: true,
      tipo: "resina",
      formato_piastrella: "continuo",
      fuga_larghezza_mm: 0,
    };

    const prompt = buildRoomPrompt(cfg);
    expect(prompt.userPrompt).not.toContain("undefined");
    expect(prompt.systemPrompt).not.toContain("undefined");
    expect(prompt.validation.isValid).toBe(true);
  });
});
