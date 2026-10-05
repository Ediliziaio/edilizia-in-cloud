import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPergolaEdgePrompt } from "../../../shared/render-pergole/pergolaEdgePrompt.ts";
import {
  coperturaEffettiva,
  normalizzaConfigPergola,
  numeroMontanti,
  pergolaAddossata,
  statiPerCopertura,
  statoCoperturaCoerente,
  tipologiaConMontaggio,
  tipologiaPerCopertura,
} from "../../../shared/render-pergole/pergolaCoerenza.ts";
import type { ConfigurazionePergole } from "../../../shared/render-pergole/types.ts";

/**
 * Il prompt che la edge generate-pergola-render manda davvero (prima stava dentro
 * la edge e nessun test lo eseguiva). Configurazione di partenza = il default del form.
 */
function base(): ConfigurazionePergole {
  return {
    operazione: "add_new_pergola",
    installazione: {
      zona: "addossata_facciata", addossata_si_no: true, distanza_da_facciata: "aderente", larghezza_apparente: "media",
      profondita_apparente: "standard", altezza_apparente: "standard", numero_montanti: 2, posizione_montanti: "frontali_visibili",
      ancoraggio_a_terra: "pavimento", rapporto_con_porte_finestre: "Mantieni porte-finestre e oscuranti utilizzabili.",
    },
    struttura: { tipo: "bioclimatica_addossata", materiale: "alluminio", colore_nome: "Antracite RAL 7016", colore_hex: "#30343B", finitura: "opaca", stile: "premium_contemporaneo" },
    copertura: { tipo: "lamelle_orientabili", stato: "lamelle_45", trasparenza: "opaco" },
    chiusure_laterali: { tipo: "nessuna", stato: "aperte", colore_nome: "Coerente con struttura" },
    illuminazione: "nessuna",
    arredo: { gestisci_arredo: "mantieni", uso_area: "relax" },
    elementi_da_preservare: ["facciata", "serramenti"],
    note_libere: "",
  };
}

function con(mod: (c: ConfigurazionePergole) => void): ConfigurazionePergole {
  const c = base();
  mod(c);
  return c;
}

const prompt = (c: ConfigurazionePergole) => buildPergolaEdgePrompt(c as unknown as Record<string, unknown>);

describe("prompt pergole della edge: la configurazione di default", () => {
  it("bioclimatica addossata: attacco a muro, due montanti anteriori, lamelle a 45°", () => {
    const p = prompt(base());
    expect(p.userPrompt).toContain("Typology: bioclimatica_addossata; wall-mounted bioclimatic pergola");
    expect(p.userPrompt).toContain("Wall-mounted: yes");
    expect(p.userPrompt).toContain("Post count: 2\nPost positions:\n- front-left grounded post\n- front-right grounded post\n");
    expect(p.userPrompt).toContain("Open state: louvers tilted about 45 degrees, visibly bioclimatic and semi-open");
    // configurazione già coerente: lo stesso oggetto va al riscrittore
    const c = base();
    expect(buildPergolaEdgePrompt(c as unknown as Record<string, unknown>).configCoerente).toBe(c);
  });
});

describe("prompt pergole della edge: correzioni (audit 04/10)", () => {
  it("solo colore non aggiunge chiusure, luci e arredo rimasti nella configurazione", () => {
    const p = prompt(con((c) => {
      c.operazione = "recolor_only";
      c.chiusure_laterali = { tipo: "screen_zip", stato: "chiuse", colore_nome: "Grigio tecnico" };
      c.illuminazione = "strip_led_perimetrale";
      c.arredo = { gestisci_arredo: "aggiungi_minimo", uso_area: "relax" };
    }));
    expect(p.userPrompt).not.toContain("Include side closure system");
    expect(p.userPrompt).not.toContain("Add integrated lighting");
    expect(p.userPrompt).not.toContain("outdoor furniture for relax use");
    expect(p.userPrompt).toContain("Side closure: preserve the existing side closure condition exactly");
    expect(p.promptPayload.replacement_manifest.additions).toEqual([]);
  });

  it("stato apertura e solo copertura non installano luci né chiusure", () => {
    for (const operazione of ["change_open_state", "change_cover_only"] as const) {
      const p = prompt(con((c) => {
        c.operazione = operazione;
        c.illuminazione = "spot_integrati";
        c.chiusure_laterali = { tipo: "vetrata_slide", stato: "chiuse" };
      }));
      expect(p.userPrompt, operazione).not.toContain("Add integrated lighting");
      expect(p.userPrompt, operazione).not.toContain("Include side closure system");
    }
  });

  it("la tipologia autoportante vince sull'interruttore «addossata» rimasto acceso, e sta su 4 montanti", () => {
    const p = prompt(con((c) => { c.struttura.tipo = "bioclimatica_autoportante"; }));
    expect(p.userPrompt).toContain("Wall-mounted: no, freestanding independent");
    expect(p.userPrompt).toContain("Rear attachment line: no rear wall attachment");
    expect(p.userPrompt).toContain("Post count: 4\nPost positions:\n- four grounded corner posts aligned to perspective\n");
    expect(p.userPrompt).not.toContain("Wall-mounted: yes");
  });

  it("addossata con 4 montanti: tutti sul fronte, nessun pilastro contro la facciata", () => {
    const p = prompt(con((c) => { c.installazione.numero_montanti = 4; }));
    expect(p.userPrompt).toContain("Post count: 4");
    expect(p.userPrompt).toContain("- 2 intermediate grounded posts evenly spaced along the front beam");
    expect(p.userPrompt).toContain("- no posts against the facade: the rear beam is carried by the wall ledger");
  });

  it("autoportante con 6 montanti: i due in più sono dichiarati", () => {
    const p = prompt(con((c) => { c.struttura.tipo = "legno_autoportante"; c.installazione.numero_montanti = 6; c.copertura = { tipo: "listelli_legno", stato: "chiusa" }; }));
    expect(p.userPrompt).toContain("Post count: 6");
    expect(p.userPrompt).toContain("- 2 intermediate grounded posts at the middle of the long sides");
  });

  it("tipologia telo con la copertura a lamelle rimasta dal default: la copertura è il telo, lo stato non è un'inclinazione", () => {
    const p = prompt(con((c) => { c.struttura.tipo = "telo_addossata"; }));
    expect(p.userPrompt).toContain("Cover type: telo_retraibile; retractable technical fabric cover");
    expect(p.userPrompt).not.toContain("louvers tilted");
    expect(p.userPrompt).not.toContain("Cover type: lamelle_orientabili");
  });

  it("vetro con lo stato «lamelle 45°» rimasto: il tetto in vetro è chiuso", () => {
    const p = prompt(con((c) => { c.struttura.tipo = "vetro_autoportante"; c.copertura = { tipo: "vetro", stato: "lamelle_45" }; }));
    expect(p.userPrompt).toContain("Open state: roof cover closed; shade/water protection visually active and continuous");
    expect(p.userPrompt).not.toContain("louvers tilted");
  });

  it("solo copertura da bioclimatica a telo: la struttura si descrive senza lamelle", () => {
    const p = prompt(con((c) => { c.operazione = "change_cover_only"; c.copertura = { tipo: "telo_retraibile", stato: "telo_disteso" }; }));
    expect(p.userPrompt).toContain("Typology: addossata; wall-mounted pergola attached to the facade");
    expect(p.userPrompt).not.toContain("orientable roof louvers");
    expect(p.userPrompt).toContain("Cover type: telo_retraibile");
    expect(p.userPrompt).toContain("Open state: fabric canopy fully extended and tensioned");
  });

  it("tipologia legno con l'alluminio di default si descrive in legno lamellare", () => {
    const p = prompt(con((c) => { c.struttura.tipo = "legno_addossata"; c.copertura = { tipo: "listelli_legno", stato: "chiusa" }; }));
    expect(p.userPrompt).toContain("Material: laminated timber");
    expect(p.userPrompt).not.toContain("Material: powder-coated aluminum");
  });

  it("rimuovi chiusure: il blocco delle chiusure dice di toglierle, non di descriverle", () => {
    const p = prompt(con((c) => { c.operazione = "remove_side_closures"; c.chiusure_laterali = { tipo: "screen_zip", stato: "chiuse" }; }));
    expect(p.userPrompt).toContain("Side closure: none after this edit");
    expect(p.userPrompt).not.toContain("Include side closure system");
  });

  it("la edge passa al riscrittore la configurazione resa coerente", () => {
    const src = readFileSync(join(process.cwd(), "supabase", "functions", "generate-pergola-render", "index.ts"), "utf8");
    expect(src).toMatch(/buildPergolaEdgePrompt\(rawConfig\)/);
    expect(src).toMatch(/legacy_config: configCoerente/);
    expect(src).toMatch(/collectPergolaReferenceImages\(rawConfig as PergolaReferenceInput\)/);
  });
});

describe("coerenza della configurazione pergola", () => {
  it("addossata o autoportante: decide la tipologia, l'interruttore solo se la tipologia non lo dice", () => {
    expect(pergolaAddossata("autoportante", true)).toBe(false);
    expect(pergolaAddossata("telo_addossata", false)).toBe(true);
    expect(pergolaAddossata(undefined, true)).toBe(true);
  });

  it("la copertura segue la tipologia, tranne in «solo copertura»", () => {
    expect(coperturaEffettiva("add_new_pergola", "bioclimatica_addossata", "telo_retraibile")).toBe("lamelle_orientabili");
    expect(coperturaEffettiva("change_cover_only", "bioclimatica_addossata", "telo_retraibile")).toBe("telo_retraibile");
    expect(coperturaEffettiva("add_new_pergola", "legno_addossata", "policarbonato")).toBe("policarbonato");
  });

  it("lo stato resta se la copertura lo può avere, altrimenti il più vicino", () => {
    for (const stato of statiPerCopertura("lamelle_orientabili")) expect(statoCoperturaCoerente("lamelle_orientabili", stato)).toBe(stato);
    expect(statoCoperturaCoerente("telo_retraibile", "lamelle_90")).toBe("telo_raccolto");
    expect(statoCoperturaCoerente("telo_retraibile", "lamelle_15")).toBe("telo_disteso");
    expect(statoCoperturaCoerente("telo_retraibile", "lamelle_45")).toBe("semi_aperta");
    expect(statoCoperturaCoerente("lamelle_orientabili", "telo_raccolto")).toBe("lamelle_90");
    expect(statoCoperturaCoerente("vetro", "aperta")).toBe("chiusa");
    expect(statoCoperturaCoerente("policarbonato", "lamelle_45")).toBe("chiusa");
  });

  it("form: l'interruttore cambia il montaggio della tipologia, la copertura scelta cambia la famiglia", () => {
    expect(tipologiaConMontaggio("bioclimatica_addossata", false)).toBe("bioclimatica_autoportante");
    expect(tipologiaConMontaggio("autoportante", true)).toBe("addossata");
    expect(tipologiaPerCopertura("bioclimatica_addossata", "telo_retraibile", true)).toBe("telo_addossata");
    expect(tipologiaPerCopertura("vetro_autoportante", "policarbonato", false)).toBe("autoportante");
    expect(tipologiaPerCopertura("legno_addossata", "vetro", true)).toBe("legno_addossata");
  });

  it("montanti: l'autoportante ne ha almeno 4", () => {
    expect(numeroMontanti(false, 2)).toBe(4);
    expect(numeroMontanti(false, 6)).toBe(6);
    expect(numeroMontanti(true, 2)).toBe(2);
    expect(numeroMontanti(true, undefined)).toBe(2);
  });

  it("una configurazione coerente esce identica (stesso oggetto); una incoerente esce corretta", () => {
    const c = base();
    expect(normalizzaConfigPergola(c)).toBe(c);
    const sbagliata = con((x) => { x.struttura.tipo = "telo_autoportante"; });
    const giusta = normalizzaConfigPergola(sbagliata);
    expect(giusta.installazione.addossata_si_no).toBe(false);
    expect(giusta.installazione.numero_montanti).toBe(4);
    expect(giusta.copertura).toMatchObject({ tipo: "telo_retraibile", stato: "semi_aperta" });
    expect(sbagliata.copertura.tipo).toBe("lamelle_orientabili"); // l'originale non si tocca
  });
});

describe("prompt pergole della edge: elementi che mancavano (B, 04/10)", () => {
  it("colore del telo: solo per la copertura a telo, nel blocco copertura e nell'installazione", () => {
    const p = prompt(con((c) => {
      c.struttura.tipo = "telo_addossata";
      c.copertura = { tipo: "telo_retraibile", stato: "telo_disteso", colore_telo_nome: "Ecrù", colore_telo_hex: "#E8DFC8" };
    }));
    expect(p.userPrompt).toContain("Cover type: telo_retraibile; retractable technical fabric cover with visible textile tension, tracks and collection logic; fabric colour Ecrù (#E8DFC8)");
    expect(p.userPrompt).toMatch(/Install a new telo addossata .*; fabric colour Ecrù \(#E8DFC8\); state/);
    // su una copertura a lamelle il colore del telo non entra
    const lamelle = prompt(con((c) => { c.copertura = { ...c.copertura, colore_telo_nome: "Ecrù" }; }));
    expect(lamelle.userPrompt).not.toContain("fabric colour");
  });

  it("vetro della copertura: trasparente, satinato o fumé; «opaco» (default vecchio) non aggiunge niente", () => {
    const fume = prompt(con((c) => { c.struttura.tipo = "vetro_addossata"; c.copertura = { tipo: "vetro", stato: "chiusa", trasparenza: "fumé" }; }));
    expect(fume.userPrompt).toContain("smoked tinted panels that darken the light below");
    const opaco = prompt(con((c) => { c.struttura.tipo = "vetro_addossata"; c.copertura = { tipo: "vetro", stato: "chiusa", trasparenza: "opaco" }; }));
    expect(opaco.userPrompt).not.toContain("panels that");
    const soloCopertura = prompt(con((c) => { c.operazione = "change_cover_only"; c.copertura = { tipo: "policarbonato", stato: "chiusa", trasparenza: "satinato" }; }));
    expect(soloCopertura.userPrompt).toMatch(/replace only the roof\/cover system with polycarbonate .*satin frosted panels/);
  });

  it("colore delle chiusure laterali: nel blocco chiusure e nell'aggiunta; «Coerente con struttura» vale non specificato", () => {
    const p = prompt(con((c) => { c.chiusure_laterali = { tipo: "screen_zip", stato: "chiuse", colore_nome: "Grigio antracite", colore_hex: "#383E42" }; }));
    expect(p.userPrompt).toContain("state chiuse; finish Grigio antracite (#383E42). Must attach to posts/beams");
    expect(p.userPrompt).toContain("state chiuse; finish Grigio antracite (#383E42); avoid generic decorative curtains.");
    const coerente = prompt(con((c) => { c.chiusure_laterali = { tipo: "screen_zip", stato: "chiuse", colore_nome: "Coerente con struttura" }; }));
    expect(coerente.userPrompt).not.toContain("finish Coerente");
    expect(coerente.userPrompt).not.toContain("; finish ");
  });

  it("ancoraggio a terra: scelto nel form, o dalla zona se assente (prima il default «pavimento» vinceva anche in giardino)", () => {
    const giardino = prompt(con((c) => { c.installazione = { ...c.installazione, zona: "giardino_relax", ancoraggio_a_terra: undefined }; }));
    expect(giardino.userPrompt).toContain("prato con plinti anchoring");
    const terrazzo = prompt(con((c) => { c.installazione = { ...c.installazione, zona: "terrazzo", ancoraggio_a_terra: undefined }; }));
    expect(terrazzo.userPrompt).toContain("terrazzo anchoring");
    const deck = prompt(con((c) => { c.installazione = { ...c.installazione, ancoraggio_a_terra: "deck" }; }));
    expect(deck.userPrompt).toContain("deck anchoring");
  });

  it("il default nuovo del form (senza «pavimento» e «opaco» salvati) dà lo stesso prompt del default vecchio", () => {
    const vecchio = base();
    const nuovo = con((c) => {
      delete c.installazione.ancoraggio_a_terra;
      delete c.copertura.trasparenza;
    });
    expect(prompt(nuovo).userPrompt).toBe(prompt(vecchio).userPrompt);
  });
});

