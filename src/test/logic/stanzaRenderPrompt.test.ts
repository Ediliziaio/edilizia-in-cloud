import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_STANZA_CONFIG, StanzaConfigForm } from "@/components/render-stanza/StanzaConfigForm";
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

describe("room render prompt pipeline: correzioni (A)", () => {
  it("i colori che il form mostra sono quelli che il prompt riceve (prima: pavimento grigio #b0b0b0, «selected wall color»)", () => {
    const cfg = config();
    cfg.pavimento = { ...cfg.pavimento, attivo: true };
    cfg.verniciatura = { ...cfg.verniciatura, attivo: true };
    cfg.soffitto = { ...cfg.soffitto, attivo: true };
    cfg.tende = { ...cfg.tende, attivo: true };
    cfg.arredo = { ...cfg.arredo, attivo: true };
    const text = buildRoomPrompt(cfg).userPrompt;
    expect(text).toContain("hex #C4A882");
    expect(text).not.toContain("#b0b0b0");
    expect(text).toContain("Apply #FFFFFF with satinato finish");
    expect(text).not.toContain("selected wall color");
    expect(text).toContain("with color #FFFFFF");
    expect(text).toContain("#E8DDD0");
    expect(text).toContain("#8B7355");
    const cucina = config();
    cucina.tipo_stanza = "cucina";
    cucina.restyling_cucina = { ...cucina.restyling_cucina!, attivo: true };
    const testoCucina = buildRoomPrompt(cucina).userPrompt;
    expect(testoCucina).toContain("#FFFFFF");
    expect(testoCucina).toContain("#D4D0CA");
    expect(testoCucina).not.toContain("selected countertop color");
  });

  it("rivestimento pareti in inglese, sulla parete giusta, col colore naturale se non scelto", () => {
    const cfg = config();
    cfg.rivestimento_pareti = { attivo: true, tipo: "mattone_vista", applica_a: "parete_principale" };
    const text = buildRoomPrompt(cfg).userPrompt;
    expect(text).toContain("Wall cladding: exposed brick: clay bricks in running bond");
    expect(text).toContain("on the main focal wall facing the camera only");
    expect(text).toContain("in the natural colour of the material");
    expect(text).not.toContain("with color selected");
    expect(text).toContain("Cladding must have believable thickness, seams and contact edges");
    // un intonaco non ha fughe né spessore di pannelli
    cfg.rivestimento_pareti = { attivo: true, tipo: "stucco_veneziano", applica_a: "tutte", colore_hex: "#d8cfc4" };
    const stucco = buildRoomPrompt(cfg);
    expect(stucco.userPrompt).toContain("polished Venetian stucco");
    expect(stucco.userPrompt).toContain("on all visible wall planes, colour #d8cfc4");
    expect(stucco.userPrompt).toContain("The plaster is a thin continuous coat");
    expect(stucco.userPrompt).not.toContain("believable thickness, seams");
    expect(stucco.validation.isValid).toBe(true);
  });

  it("pavimento della stanza: l'effetto «cemento» di partenza non resta su parquet, cotto, marmo o moquette", () => {
    const attesi: Record<string, string> = {
      parquet_legno: "wood look",
      parquet_laminato: "wood look",
      cotto: "terracotta look",
      marmo: "marble look",
      moquette: "textile look",
      resina: "resin look",
    };
    for (const [tipo, look] of Object.entries(attesi)) {
      const cfg = config();
      cfg.pavimento = { ...cfg.pavimento, attivo: true, tipo }; // effetto_visivo resta «cemento» dal default
      const text = buildRoomPrompt(cfg).userPrompt;
      expect(text, tipo).toContain(look);
      expect(text, tipo).not.toContain("concrete look");
    }
    // i materiali che imitano tengono l'effetto scelto
    const gres = config();
    gres.pavimento = { ...gres.pavimento, attivo: true, tipo: "gres_porcellanato", effetto_visivo: "marmo" };
    expect(buildRoomPrompt(gres).userPrompt).toContain("marble look");
    const lvt = config();
    lvt.pavimento = { ...lvt.pavimento, attivo: true, tipo: "vinile_lvt", effetto_visivo: "pietra" };
    expect(buildRoomPrompt(lvt).userPrompt).toContain("stone look");
  });

  it("pavimento della stanza: «continuo» e «listelli standard» non diventano un formato in centimetri", () => {
    for (const formato of ["continuo", "listelli_standard"]) {
      const cfg = config();
      cfg.pavimento = { ...cfg.pavimento, attivo: true, tipo: "gres_porcellanato", formato_piastrella: formato };
      const prompt = buildRoomPrompt(cfg);
      expect(prompt.userPrompt, formato).not.toMatch(/continuo cm|listelli_standard cm/);
      expect(prompt.validation.isValid, formato).toBe(true);
    }
  });
});

/** Monta il form della stanza con le sezioni chiuse dell'accordion aperte dove serve. */
function montaForm(value: ConfigurazioneStanza) {
  const onChange = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(StanzaConfigForm, { value, onChange }));
  });
  const apri = (sezione: string) => {
    const trigger = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim().startsWith(sezione) && b.getAttribute("aria-expanded") !== null);
    if (!trigger) throw new Error(`sezione non trovata: ${sezione}`);
    act(() => trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  };
  return { container, onChange, apri, smonta: () => { act(() => root.unmount()); container.remove(); } };
}

describe("room render prompt pipeline: elementi nuovi (B)", () => {
  it("pavimento: essenza del legno (prima solo un colore esadecimale)", () => {
    const cfg = config();
    cfg.pavimento = { ...cfg.pavimento, attivo: true, tipo: "parquet_legno", essenza_legno: "noce", colore_nome: "Noce", colore_hex: "#6d442b" };
    const prompt = buildRoomPrompt(cfg);
    expect(prompt.userPrompt).toContain("Wood essence: walnut: warm medium-dark brown");
    expect(prompt.userPrompt).toContain("Noce, hex #6d442b");
    expect(prompt.validation.isValid).toBe(true);
    // senza essenza (le stanze salvate) nessuna riga; su un gres effetto cemento l'essenza non vale
    const senza = config();
    senza.pavimento = { ...senza.pavimento, attivo: true, tipo: "parquet_legno" };
    expect(buildRoomPrompt(senza).userPrompt).not.toContain("Wood essence");
    const gres = config();
    gres.pavimento = { ...gres.pavimento, attivo: true, essenza_legno: "noce" };
    expect(buildRoomPrompt(gres).userPrompt).not.toContain("Wood essence");
  });

  it("pavimento: battiscopa da sostituire con materiale e altezza (prima solo «coordinato»)", () => {
    const cfg = config();
    cfg.pavimento = { ...cfg.pavimento, attivo: true, battiscopa_azione: "sostituisci", battiscopa_tipo: "bianco", battiscopa_altezza_cm: 10 };
    const text = buildRoomPrompt(cfg).userPrompt;
    expect(text).toContain("Skirting: Replace baseboard with clean white painted baseboard. Height: 10cm.");
    const coordinato = config();
    coordinato.pavimento = { ...coordinato.pavimento, attivo: true, battiscopa_azione: "sostituisci" };
    expect(buildRoomPrompt(coordinato).userPrompt).toContain("Replace baseboard with baseboard coordinated with the new floor material and color. Height: 8cm.");
  });

  it("pavimento: posa modulare", () => {
    const cfg = config();
    cfg.pavimento = { ...cfg.pavimento, attivo: true, pattern: "modulare" };
    const prompt = buildRoomPrompt(cfg);
    expect(prompt.userPrompt).toContain("modular mixed-size layout with repeating geometric modules");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("illuminazione: binario con faretti orientabili", () => {
    const cfg = config();
    cfg.illuminazione = { attivo: true, tipo: "binario", temperatura: "neutra_3000k", intensita_luce: "normale" };
    const prompt = buildRoomPrompt(cfg);
    expect(prompt.userPrompt).toContain("Install/adjust ceiling track lighting with adjustable spot heads (binario)");
    expect(prompt.userPrompt).toContain("Mount one slim ceiling track");
    expect(prompt.userPrompt.toLowerCase()).toContain("do not invent a decorative chandelier");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("pittura su pareti specifiche: si dice quali (senza testo resta com'era)", () => {
    const cfg = config();
    cfg.verniciatura = { ...cfg.verniciatura, attivo: true, applica_a: "specifiche", pareti_specifiche: "parete dietro il divano" };
    const text = buildRoomPrompt(cfg).userPrompt;
    expect(text).toContain("to only these walls: parete dietro il divano.");
    expect(text).toContain("paint target: only parete dietro il divano");
    expect(text).toContain("Every wall plane not named in the target keeps its current colour and finish.");
    const senzaTesto = config();
    senzaTesto.verniciatura = { ...senzaTesto.verniciatura, attivo: true, applica_a: "specifiche" };
    const vecchio = buildRoomPrompt(senzaTesto).userPrompt;
    expect(vecchio).toContain("finish to specifiche.");
    expect(vecchio).toContain("paint target: specifiche");
    expect(vecchio).not.toContain("not named in the target");
  });

  it("form: essenza solo per il legno, battiscopa con tipo e altezza, binario e pareti specifiche", () => {
    const parquet = config();
    parquet.pavimento = { ...parquet.pavimento, attivo: true, tipo: "parquet_legno", battiscopa_azione: "sostituisci" };
    parquet.verniciatura = { ...parquet.verniciatura, attivo: true, applica_a: "specifiche" };
    const f = montaForm(parquet);
    f.apri("Verniciatura pareti");
    f.apri("Pavimento");
    expect(f.container.textContent).toContain("Essenza legno");
    expect(f.container.querySelector('[aria-label="Tipo battiscopa"]')).not.toBeNull();
    expect(f.container.querySelector('[aria-label="Altezza battiscopa"]')).not.toBeNull();
    expect(f.container.textContent).toContain("Quali pareti");
    const noce = Array.from(f.container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Noce");
    act(() => noce!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(f.onChange.mock.calls.at(-1)?.[0].pavimento).toMatchObject({ essenza_legno: "noce", colore_nome: "Noce", colore_hex: "#6d442b" });
    f.smonta();

    const gres = config();
    gres.pavimento = { ...gres.pavimento, attivo: true };
    const g = montaForm(gres);
    g.apri("Pavimento");
    expect(g.container.textContent).not.toContain("Essenza legno");
    expect(g.container.querySelector('[aria-label="Tipo battiscopa"]')).toBeNull();
    g.smonta();
  });
});
