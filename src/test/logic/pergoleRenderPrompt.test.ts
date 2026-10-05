import { describe, expect, it } from "vitest";

import { buildPergolePrompt } from "@/modules/render-pergole/lib/pergolePromptBuilder";
import type { ConfigurazionePergole } from "@/modules/render-pergole/lib/types";

function baseConfig(overrides: Partial<ConfigurazionePergole> = {}): ConfigurazionePergole {
  return {
    operazione: "add_new_pergola",
    installazione: {
      zona: "addossata_facciata",
      addossata_si_no: true,
      distanza_da_facciata: "aderente",
      larghezza_apparente: "media",
      profondita_apparente: "standard",
      altezza_apparente: "standard",
      numero_montanti: 2,
      posizione_montanti: "frontali_visibili",
      ancoraggio_a_terra: "pavimento",
      rapporto_con_porte_finestre: "porta-finestra centrale da lasciare libera",
    },
    struttura: {
      tipo: "bioclimatica_addossata",
      materiale: "alluminio",
      colore_nome: "Antracite RAL 7016",
      colore_hex: "#30343B",
      finitura: "opaca",
      stile: "premium_contemporaneo",
    },
    copertura: {
      tipo: "lamelle_orientabili",
      stato: "lamelle_45",
      trasparenza: "opaco",
    },
    chiusure_laterali: {
      tipo: "nessuna",
      stato: "aperte",
    },
    illuminazione: "nessuna",
    arredo: {
      gestisci_arredo: "mantieni",
      uso_area: "relax",
    },
    elementi_da_preservare: ["facciata", "serramenti"],
    note_libere: "",
    ...overrides,
  };
}

describe("pergole render prompt", () => {
  it("creates wall-mounted aluminum bioclimatic pergola with louver rules and installability envelope", () => {
    const prompt = buildPergolePrompt(baseConfig());
    const text = `${prompt.systemPrompt}\n${prompt.userPrompt}`.toLowerCase();

    expect(text).toContain("wall-mounted");
    expect(text).toContain("facade plane");
    expect(text).toContain("orientable");
    expect(text).toContain("louvers tilted about 45 degrees");
    expect(text).toContain("no floating");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("creates freestanding patio pergola with independent posts and no wall attachment", () => {
    const prompt = buildPergolePrompt(baseConfig({
      installazione: {
        ...baseConfig().installazione,
        zona: "patio_centrale",
        addossata_si_no: false,
        numero_montanti: 4,
      },
      struttura: {
        ...baseConfig().struttura,
        tipo: "bioclimatica_autoportante",
      },
    }));

    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("freestanding");
    expect(text).toContain("independent");
    expect(text).toContain("no rear wall attachment");
    expect(text).toContain("four corner posts");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("replaces an existing awning with removal of brackets and clean facade restoration", () => {
    const prompt = buildPergolePrompt(baseConfig({ operazione: "replace_existing_awning_with_pergola" }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("remove existing awning");
    expect(text).toContain("brackets");
    expect(text).toContain("patch the facade");
    expect(text).toContain("no old awning arms");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes retractable fabric cover without glass/louver drift", () => {
    const prompt = buildPergolePrompt(baseConfig({
      struttura: { ...baseConfig().struttura, tipo: "telo_addossata" },
      copertura: { tipo: "telo_retraibile", stato: "telo_disteso" },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("retractable technical fabric");
    expect(text).toContain("fully extended and tensioned");
    expect(text).toContain("not as glass or metal");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("adds ZIP side closures with technical screen rules", () => {
    const prompt = buildPergolePrompt(baseConfig({
      operazione: "add_side_closures",
      chiusure_laterali: {
        tipo: "screen_zip",
        stato: "chiuse",
        colore_nome: "Grigio tecnico",
        colore_hex: "#7A7D80",
      },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("technical zip screens");
    expect(text).toContain("side tracks");
    expect(text).toContain("not decorative curtains");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps geometry untouched for recolor-only operation", () => {
    const prompt = buildPergolePrompt(baseConfig({
      operazione: "recolor_only",
      struttura: {
        ...baseConfig().struttura,
        colore_nome: "Bianco opaco",
        colore_hex: "#F2F1EA",
      },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("recolor-only");
    expect(text).toContain("preserve exact footprint");
    expect(text).toContain("post positions");
    expect(text).toContain("strict scope");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps recolor-only free from side closure, lighting and furniture additions", () => {
    const prompt = buildPergolePrompt(baseConfig({
      operazione: "recolor_only",
      chiusure_laterali: {
        tipo: "screen_zip",
        stato: "chiuse",
        colore_nome: "Grigio tecnico",
      },
      illuminazione: "strip_led_perimetrale",
      arredo: {
        gestisci_arredo: "aggiungi_minimo",
        uso_area: "relax",
      },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("preserve existing side closure condition exactly");
    expect(prompt.normalizedConfig.replacement_manifest.additions).toHaveLength(0);
    expect(prompt.normalizedConfig.replacement_manifest.replacements).toHaveLength(0);
    expect(prompt.validation.isValid).toBe(true);
  });

  it("treats addossata typology as wall-mounted even if the boolean is inconsistent", () => {
    const prompt = buildPergolePrompt(baseConfig({
      installazione: {
        ...baseConfig().installazione,
        addossata_si_no: false,
      },
      struttura: {
        ...baseConfig().struttura,
        tipo: "telo_addossata",
      },
      copertura: { tipo: "telo_retraibile", stato: "telo_disteso" },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("rear beam/ledger follows the facade plane");
    expect(text).toContain("wall-mounted: yes");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("protects pool edge for poolside pergola placement", () => {
    const prompt = buildPergolePrompt(baseConfig({
      installazione: {
        ...baseConfig().installazione,
        zona: "bordo_piscina",
        addossata_si_no: false,
        ancoraggio_a_terra: "bordo_piscina",
      },
      struttura: {
        ...baseConfig().struttura,
        tipo: "vetro_autoportante",
      },
      copertura: { tipo: "vetro", stato: "chiusa", trasparenza: "trasparente" },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("pool edge");
    expect(text).toContain("inside pool water");
    expect(text).toContain("transparent");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("preserves terrace parapet and door operation", () => {
    const prompt = buildPergolePrompt(baseConfig({
      installazione: {
        ...baseConfig().installazione,
        zona: "terrazzo",
        addossata_si_no: true,
        ancoraggio_a_terra: "terrazzo",
      },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("terrace");
    expect(text).toContain("parapet");
    expect(text).toContain("doors and door-windows remain");
    expect(prompt.validation.isValid).toBe(true);
  });

  // ── Correzioni A (audit 04/10): la stessa regola di coerenza del prompt della edge ──

  it("la tipologia autoportante vince sull'interruttore «addossata» rimasto acceso", () => {
    const prompt = buildPergolePrompt(baseConfig({ struttura: { ...baseConfig().struttura, tipo: "bioclimatica_autoportante" } }));
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("wall-mounted: no, freestanding / independent");
    expect(text).toContain("no rear wall attachment");
    expect(text).toContain("post count: 4");
    expect(text).toContain("four corner posts");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("addossata con 4 montanti: posizioni coerenti col numero, nessun pilastro contro la facciata", () => {
    const prompt = buildPergolePrompt(baseConfig({ installazione: { ...baseConfig().installazione, numero_montanti: 4 } }));
    expect(prompt.userPrompt).toContain("2 intermediate posts evenly spaced along the front beam on the target paving");
    expect(prompt.userPrompt).toContain("no posts against the facade: the rear beam is carried by the wall ledger");
  });

  it("tipologia telo con la copertura a lamelle rimasta dal default: copertura telo, stato coerente", () => {
    const prompt = buildPergolePrompt(baseConfig({ struttura: { ...baseConfig().struttura, tipo: "telo_addossata" } }));
    expect(prompt.userPrompt).toContain("Cover type: telo_retraibile");
    expect(prompt.userPrompt).not.toContain("louvers tilted");
    expect(prompt.normalizedConfig.legacy_config.copertura.tipo).toBe("telo_retraibile");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("solo copertura da bioclimatica a telo: la struttura si descrive senza lamelle", () => {
    const prompt = buildPergolePrompt(baseConfig({ operazione: "change_cover_only", copertura: { tipo: "telo_retraibile", stato: "telo_disteso" } }));
    expect(prompt.userPrompt).toContain("Typology: addossata");
    expect(prompt.userPrompt).toContain("Structural language: wall-mounted pergola attached to the facade");
    expect(prompt.validation.isValid).toBe(true);
  });

  // ── Elementi che mancavano (B, 04/10) ─────────────────────────────────

  it("colore del telo e vetro della copertura arrivano alla descrizione della copertura", () => {
    const telo = buildPergolePrompt(baseConfig({
      struttura: { ...baseConfig().struttura, tipo: "telo_addossata" },
      copertura: { tipo: "telo_retraibile", stato: "telo_disteso", colore_telo_nome: "Ecrù", colore_telo_hex: "#E8DFC8" },
    }));
    expect(telo.normalizedConfig.technical_specification.coverDescription).toContain("fabric colour Ecrù (#E8DFC8)");
    expect(telo.validation.isValid).toBe(true);

    const vetro = buildPergolePrompt(baseConfig({
      struttura: { ...baseConfig().struttura, tipo: "vetro_autoportante" },
      installazione: { ...baseConfig().installazione, addossata_si_no: false, numero_montanti: 4 },
      copertura: { tipo: "vetro", stato: "chiusa", trasparenza: "satinato" },
    }));
    expect(vetro.userPrompt).toContain("satin frosted panels that diffuse the light");
    expect(vetro.validation.isValid).toBe(true);

    const opaco = buildPergolePrompt(baseConfig());
    expect(opaco.normalizedConfig.technical_specification.coverDescription).toBe(
      "bioclimatic orientable aluminum louvers, repeated blades in a precise roof grid, integrated perimeter frame",
    );
  });

  it("ancoraggio a terra assente: dalla zona", () => {
    const prompt = buildPergolePrompt(baseConfig({ installazione: { ...baseConfig().installazione, zona: "bordo_piscina", ancoraggio_a_terra: undefined } }));
    expect(prompt.userPrompt).toContain("bordo piscina anchoring");
  });
});
