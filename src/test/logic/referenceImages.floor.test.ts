import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PAVIMENTO_CONFIG } from "@/components/render-pavimento/defaultPavimentoConfig";
import { PavimentoConfigForm } from "@/components/render-pavimento/PavimentoConfigForm";
import { referenceThumbUrl } from "../../../shared/render-references/thumbs.ts";
import {
  floorReferenceCandidates,
  FLOOR_BEVEL_PHOTOS,
  FLOOR_EFFECT_PHOTOS,
  FLOOR_ESSENCE_PHOTOS,
  FLOOR_FINISH_FAMILY,
  FLOOR_FINISH_PHOTOS,
  FLOOR_LAYOUT_PHOTOS,
  FLOOR_SENZA_FOTO,
  FLOOR_SKIRTING_PHOTOS,
  FLOOR_TYPE_PHOTOS,
  FLOOR_TYPES_VIA_EFFECT,
  collectFloorReferenceImages,
  floorSurfacePhoto,
  listFloorReferencePaths,
} from "../../../shared/render-references/floorReferences.ts";
import { normalizeFloorLegacyConfig } from "../../../shared/render-floor/floorRenderConfig.ts";
import type {
  ConfigurazionePavimento,
  Bisellatura,
  EffettoVisivoPavimento,
  EssenzaLegno,
  FinituraPavimento,
  PatternPosa,
  TipoPavimento,
} from "../../../shared/render-floor/types.ts";
import { MAX_SHARED_REFERENCES } from "../../../shared/render-references/referencePicker.ts";
import {
  etichetteDiFormaConColore,
  fileMancanti,
  fotoBnADColori,
  fotoColoriInGrigio,
  miniatureMancanti,
} from "../lib/referenceGuards";

/**
 * Le foto del pavimento: esistono, sono in bianco e nero quando sono di forma (posa) e a
 * colori quando sono di materia, ogni opzione del form ha la sua foto o un motivo per non
 * averla, e il render riceve solo le foto degli elementi che cambia, nell'ordine giusto.
 */
const TABELLE = [
  FLOOR_LAYOUT_PHOTOS,
  FLOOR_TYPE_PHOTOS,
  FLOOR_EFFECT_PHOTOS,
  FLOOR_ESSENCE_PHOTOS,
  FLOOR_BEVEL_PHOTOS,
  FLOOR_FINISH_PHOTOS,
  FLOOR_SKIRTING_PHOTOS,
];

/**
 * Materiali davvero neutri: la foto è grigia perché il materiale lo è (cemento, resina
 * cementizia, moquette grigia). Il tono lo detta comunque il testo.
 */
const GRIGI_AMMESSI = [
  "bathroom/Piastrelle-Grigie-Effetto-Cemento.webp",
  "floors/Pavimento-In-Resina-Cementizia-Grigio-Nuvolato.webp",
  "floors/Moquette-Grigio-Medio-A-Pelo-Corto.webp",
];

// Tutte le opzioni vere del form (Record: se il tipo guadagna un valore, il controllo dei tipi lo pretende qui).
const POSE: Record<PatternPosa, true> = {
  rettilineo_dritto: true, a_correre: true, sfalsato_33: true, spina_di_pesce: true, spina_ungherese: true, diagonale_45: true,
  cassero_irregolare: true, opus_romanum: true, doppia_fila: true, modulare: true, esagonale: true,
};
const TIPI: Record<TipoPavimento, true> = {
  parquet_massello: true, parquet_prefinito: true, laminato: true, gres_porcellanato: true, ceramica: true, marmo: true,
  pietra_naturale: true, vinile_lvt: true, cotto: true, cemento_resina: true, resina_continua: true, microcemento: true,
  moquette: true, terrazzo_veneziano: true,
};
const EFFETTI: Record<EffettoVisivoPavimento, true> = {
  legno: true, marmo: true, pietra: true, cemento: true, resina: true, cotto: true, tessile: true, terrazzo: true, neutro: true,
};
const ESSENZE: Record<EssenzaLegno, true> = {
  rovere_naturale: true, rovere_sbiancato: true, rovere_miele: true, noce: true, teak: true, wenghe: true, frassino_bianco: true,
};
const BISELLI: Record<Bisellatura, true> = { nessuna: true, microbisello: true, bisello_v: true, bordo_irregolare: true };
const FINITURE: Record<FinituraPavimento, true> = {
  lucido: true, opaco: true, satinato: true, spazzolato: true, boccardato: true, anticato: true, levigato: true, naturale: true, cerato: true,
};
const BATTISCOPA = { coordinato_pavimento: true, bianco: true, legno: true, alluminio: true };

const files = (config: Record<string, unknown>) => collectFloorReferenceImages(config).map((r) => r.filename);
const labels = (config: Record<string, unknown>) => collectFloorReferenceImages(config).map((r) => r.label);

describe("foto del pavimento: la libreria", () => {
  it("ogni file dichiarato esiste, con la sua miniatura", () => {
    expect(fileMancanti(...TABELLE)).toEqual([]);
    expect(miniatureMancanti(...TABELLE)).toEqual([]);
  });

  it("ogni voce «pavimento» del manifest ha la sua foto principale nella libreria (le alternative sono elencate)", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "scripts", "render-references", "manifest.json"), "utf8")) as {
      voci: Array<{ modulo: string; dim: string; valore: string; file: string[] }>;
    };
    const voci = manifest.voci.filter((v) => v.modulo === "pavimento");
    expect(voci).toHaveLength(49);
    const usate = new Set(listFloorReferencePaths());
    expect(voci.filter((v) => !usate.has(v.file[0])).map((v) => `${v.dim}.${v.valore}`)).toEqual([]);
    // file secondari non usati: alternative della stessa voce, o non adatti (opaco legno è un rivestimento di facciata a doghe)
    const secondari = voci.flatMap((v) => v.file.slice(1)).filter((f) => !usate.has(f)).sort();
    expect(secondari).toEqual([
      "floors/Piastrelle-Beige-In-Griglia-Perfetta-BN.webp", // seconda griglia dritta
      "floors/Piastrelle-Chevron-Grigio-Chiaro-BN.webp", // secondo chevron
      "floors/Piastrelle-In-Gres-Effetto-Rovere-Sfalsate.webp", // secondo gres effetto legno
      "floors/Superficie-Opaca-Effetto-Legno.webp", // doghe di facciata, non un pavimento
    ]);
  });

  it("forma in bianco e nero vero, materia a colori (salvo i materiali davvero grigi)", async () => {
    expect(await fotoBnADColori(...TABELLE)).toEqual([]);
    expect(await fotoColoriInGrigio(GRIGI_AMMESSI, ...TABELLE)).toEqual([]);
    // la posa è di forma: tutte le sue foto sono «-BN»; nessuna foto di materia lo è
    for (const e of Object.values(FLOOR_LAYOUT_PHOTOS)) expect(e.filename).toMatch(/-BN\.webp$/);
    for (const t of TABELLE.slice(1)) for (const e of Object.values(t)) expect(e.filename).not.toMatch(/-BN\.webp$/);
  }, 30_000);

  it("le etichette di forma non nominano colori né finiture; ogni testo è breve", () => {
    expect(etichetteDiFormaConColore(...TABELLE)).toEqual([]);
    for (const t of TABELLE) for (const [k, e] of Object.entries(t)) {
      expect(e.text.length, k).toBeGreaterThan(20);
      expect(e.text.length, k).toBeLessThanOrEqual(160);
    }
  });

  it("ogni opzione del form ha una foto o un motivo scritto in FLOOR_SENZA_FOTO", () => {
    const scoperte: string[] = [];
    const controlla = (dim: string, valori: string[], tabella: Record<string, unknown>, extra: string[] = []) => {
      for (const v of valori) if (!tabella[v] && !extra.includes(v) && !FLOOR_SENZA_FOTO[`${dim}.${v}`]) scoperte.push(`${dim}.${v}`);
    };
    controlla("posa", Object.keys(POSE), FLOOR_LAYOUT_PHOTOS);
    controlla("tipo", Object.keys(TIPI), FLOOR_TYPE_PHOTOS, FLOOR_TYPES_VIA_EFFECT);
    controlla("effetto", Object.keys(EFFETTI), FLOOR_EFFECT_PHOTOS);
    controlla("essenza", Object.keys(ESSENZE), FLOOR_ESSENCE_PHOTOS);
    controlla("bisello", Object.keys(BISELLI), FLOOR_BEVEL_PHOTOS);
    controlla("finitura", Object.keys(FINITURE), FLOOR_FINISH_PHOTOS);
    controlla("battiscopa", Object.keys(BATTISCOPA), FLOOR_SKIRTING_PHOTOS);
    expect(scoperte).toEqual([]);
    // e nessun motivo resta appeso a un'opzione che una foto ce l'ha
    for (const chiave of Object.keys(FLOOR_SENZA_FOTO)) {
      const [dim, valore] = chiave.split(".");
      const tabella = { posa: FLOOR_LAYOUT_PHOTOS, tipo: FLOOR_TYPE_PHOTOS, effetto: FLOOR_EFFECT_PHOTOS, finitura: FLOOR_FINISH_PHOTOS, bisello: FLOOR_BEVEL_PHOTOS, battiscopa: FLOOR_SKIRTING_PHOTOS }[dim];
      expect(tabella?.[valore], chiave).toBeUndefined();
    }
    for (const k of Object.keys(FLOOR_FINISH_PHOTOS)) expect(FLOOR_FINISH_FAMILY[k], k).toBeDefined();
  });
});

describe("foto del pavimento: cosa riceve il render", () => {
  it("i due casi del test precedente, col set nuovo", () => {
    // spina di pesce su parquet: posa + materiale, come prima
    const spina = labels({ tipo: "parquet_prefinito", pattern_posa: "spina_di_pesce", bisellatura: "nessuna" });
    expect(spina).toHaveLength(2);
    expect(spina[0]).toMatch(/^LAYING PATTERN TARGET — spina_di_pesce/);
    expect(spina[1]).toMatch(/^FLOOR MATERIAL TARGET — parquet_prefinito/);
    // gres effetto cemento in posa dritta: prima 1 foto, ora 2 — la posa dritta ha la sua foto nel set nuovo
    const gres = labels({ tipo: "gres_porcellanato", effetto_visivo: "cemento", pattern_posa: "rettilineo_dritto" });
    expect(gres).toHaveLength(2);
    expect(gres[0]).toMatch(/^LAYING PATTERN TARGET — rettilineo_dritto/);
    expect(gres[1]).toMatch(/^FLOOR MATERIAL TARGET — gres_porcellanato \/ cemento/);
  });

  it("posa caratterizzante + essenza + battiscopa, nell'ordine; il tetto è 3", () => {
    const refs = collectFloorReferenceImages({
      tipo: "parquet_massello", essenza_legno: "noce", pattern_posa: "spina_ungherese", finitura: "cerato", bisellatura: "bisello_v",
      battiscopa: { azione: "sostituisci", tipo: "legno", altezza_cm: 10 },
    });
    expect(refs).toHaveLength(MAX_SHARED_REFERENCES);
    expect(refs[0].label).toMatch(/^LAYING PATTERN TARGET — spina_ungherese: Hungarian point/);
    expect(refs[1].label).toMatch(/^WOOD SPECIES TARGET — noce: walnut/);
    expect(refs[2].label).toMatch(/^SKIRTING BOARD TARGET — legno: /);
    // bisello e finitura (dettagli) restano fuori per il tetto
    expect(refs.map((r) => r.filename)).not.toContain(FLOOR_BEVEL_PHOTOS.bisello_v.filename);
  });

  it("senza battiscopa da sostituire i dettagli del legno entrano: bisello prima della finitura", () => {
    const refs = labels({ tipo: "parquet_massello", essenza_legno: "noce", pattern_posa: "spina_di_pesce", finitura: "spazzolato", bisellatura: "bisello_v", battiscopa: { azione: "mantieni" } });
    expect(refs[0]).toMatch(/^LAYING PATTERN TARGET — spina_di_pesce/);
    expect(refs[1]).toMatch(/^WOOD SPECIES TARGET — noce/);
    expect(refs[2]).toMatch(/^EDGE BEVEL TARGET — bisello_v/);
  });

  it("battiscopa mantenuto, rimosso o «coordinato» → nessuna foto del battiscopa", () => {
    const base = { tipo: "gres_porcellanato", effetto_visivo: "cemento", pattern_posa: "a_correre" };
    for (const battiscopa of [{ azione: "mantieni", tipo: "legno" }, { azione: "rimuovi", tipo: "bianco" }, { azione: "sostituisci", tipo: "coordinato_pavimento" }, { azione: "sostituisci" }]) {
      expect(labels({ ...base, battiscopa }).some((l) => l.startsWith("SKIRTING")), JSON.stringify(battiscopa)).toBe(false);
    }
    expect(labels({ ...base, battiscopa: { azione: "sostituisci", tipo: "alluminio" } }).some((l) => l.startsWith("SKIRTING BOARD TARGET — alluminio"))).toBe(true);
  });

  it("gres e ceramica: la superficie è quella dell'effetto (anche dedotto), con «neutro» nessuna", () => {
    expect(labels({ tipo: "gres_porcellanato", effetto_visivo: "marmo", pattern_posa: "a_correre", finitura: "naturale" })).toEqual([
      expect.stringMatching(/^FLOOR MATERIAL TARGET — gres_porcellanato \/ marmo: marble-effect porcelain/),
    ]);
    // senza effetto scritto il prompt dice «cemento» e la foto segue
    expect(files({ tipo: "gres_porcellanato", pattern_posa: "a_correre" })).toEqual([FLOOR_EFFECT_PHOTOS.cemento.filename]);
    expect(files({ tipo: "ceramica", effetto_visivo: "neutro", pattern_posa: "a_correre" })).toEqual([]);
  });

  it("laminato e LVT: foto del prodotto se sono effetto legno, dell'effetto se imitano altro", () => {
    expect(files({ tipo: "laminato", pattern_posa: "a_correre", bisellatura: "nessuna" })).toEqual([FLOOR_TYPE_PHOTOS.laminato.filename]);
    expect(files({ tipo: "vinile_lvt", effetto_visivo: "pietra", essenza_legno: "noce", pattern_posa: "a_correre", finitura: "naturale" })).toEqual([FLOOR_EFFECT_PHOTOS.pietra.filename]);
  });

  it("un'essenza rimasta da un tipo precedente non entra su un pavimento che non è legno", () => {
    expect(files({ tipo: "marmo", essenza_legno: "noce", pattern_posa: "a_correre", finitura: "lucido" })).toEqual([
      FLOOR_TYPE_PHOTOS.marmo.filename,
      FLOOR_FINISH_PHOTOS.lucido.filename,
    ]);
    expect(files({ tipo: "gres_porcellanato", effetto_visivo: "cemento", essenza_legno: "noce", pattern_posa: "a_correre" })).toEqual([FLOOR_EFFECT_PHOTOS.cemento.filename]);
    // con l'effetto legno l'essenza vale anche sul gres
    expect(labels({ tipo: "gres_porcellanato", effetto_visivo: "legno", essenza_legno: "teak", pattern_posa: "a_correre" })[0]).toMatch(/^WOOD SPECIES TARGET — teak/);
  });

  it("pavimenti continui: nessuna foto di posa né di dettaglio, solo la superficie", () => {
    for (const tipo of ["resina_continua", "microcemento", "cemento_resina", "moquette"]) {
      const refs = collectFloorReferenceImages({ tipo, pattern_posa: "spina_di_pesce", finitura: "lucido", bisellatura: "bisello_v" });
      expect(refs, tipo).toHaveLength(1);
      expect(refs[0].label, tipo).toMatch(new RegExp(`^FLOOR MATERIAL TARGET — ${tipo}:`));
    }
  });

  it("lastre grandi: niente foto di posa (spingerebbe una griglia fitta di quadrotte)", () => {
    expect(files({ tipo: "gres_porcellanato", effetto_visivo: "marmo", pattern_posa: "rettilineo_dritto", formato_piastrella: "120x120", finitura: "naturale" })).toEqual([FLOOR_EFFECT_PHOTOS.marmo.filename]);
    expect(files({ tipo: "marmo", pattern_posa: "rettilineo_dritto", formato_piastrella: "60x60", scala_pattern: "maxi_lastre" })[0]).toBe(FLOOR_TYPE_PHOTOS.marmo.filename);
    expect(files({ tipo: "gres_porcellanato", effetto_visivo: "pietra", pattern_posa: "rettilineo_dritto", formato_piastrella: "60x60", scala_pattern: "standard", finitura: "naturale" })).toEqual([
      FLOOR_LAYOUT_PHOTOS.rettilineo_dritto.filename,
      FLOOR_EFFECT_PHOTOS.pietra.filename,
    ]);
  });

  it("la finitura è l'ultimo dettaglio: su un gres effetto marmo opaco entra dopo la superficie", () => {
    expect(labels({ tipo: "gres_porcellanato", effetto_visivo: "marmo", pattern_posa: "a_correre", finitura: "opaco" })).toEqual([
      expect.stringMatching(/^FLOOR MATERIAL TARGET — gres_porcellanato \/ marmo/),
      expect.stringMatching(/^SURFACE FINISH TARGET — opaco: matt finish.*Copy only how the surface responds to light/),
    ]);
  });

  it("finitura e bisello solo sulla famiglia giusta: niente primi piani di legno su pietra e viceversa", () => {
    // spazzolato e cerato sono foto di legno: su un gres effetto cemento non entrano
    expect(files({ tipo: "gres_porcellanato", effetto_visivo: "cemento", pattern_posa: "a_correre", finitura: "spazzolato" })).toEqual([FLOOR_EFFECT_PHOTOS.cemento.filename]);
    // lucido è una foto di pietra: sul parquet non entra
    expect(files({ tipo: "parquet_prefinito", essenza_legno: "rovere_miele", pattern_posa: "a_correre", finitura: "lucido", bisellatura: "nessuna" })).toEqual([FLOOR_ESSENCE_PHOTOS.rovere_miele.filename]);
    // il bordo irregolare è una foto di assi rustiche: su cotto e pietra non entra
    expect(files({ tipo: "cotto", pattern_posa: "a_correre", bisellatura: "bordo_irregolare", finitura: "naturale" })).toEqual([FLOOR_TYPE_PHOTOS.cotto.filename]);
    expect(files({ tipo: "pietra_naturale", pattern_posa: "a_correre", finitura: "boccardato", bisellatura: "bordo_irregolare" })).toEqual([
      FLOOR_TYPE_PHOTOS.pietra_naturale.filename,
      FLOOR_FINISH_PHOTOS.boccardato.filename,
    ]);
  });

  it("nessun doppione: la posa opus romanum e la pietra sono la stessa foto in due versioni, ne entra una", () => {
    const refs = collectFloorReferenceImages({ tipo: "pietra_naturale", pattern_posa: "opus_romanum", finitura: "naturale" });
    expect(refs.map((r) => r.filename)).toEqual([FLOOR_TYPE_PHOTOS.pietra_naturale.filename]);
    // su un gres la posa opus resta (la superficie è un'altra foto)
    expect(files({ tipo: "gres_porcellanato", effetto_visivo: "pietra", pattern_posa: "opus_romanum", formato_piastrella: "60x60", scala_pattern: "standard" })[0]).toBe(FLOOR_LAYOUT_PHOTOS.opus_romanum.filename);
    // e in generale nessun file compare due volte
    const tutti = collectFloorReferenceImages({ tipo: "parquet_massello", essenza_legno: "rovere_miele", pattern_posa: "spina_di_pesce", finitura: "spazzolato", bisellatura: "microbisello" });
    expect(new Set(tutti.map((r) => `${r.folder}/${r.filename}`)).size).toBe(tutti.length);
  });

  it("formato dell'etichetta: RUOLO — chiave: testo. cosa copiare (B/N: solo la geometria)", () => {
    const [posa, superficie] = collectFloorReferenceImages({ tipo: "parquet_prefinito", essenza_legno: "rovere_naturale", pattern_posa: "diagonale_45", bisellatura: "nessuna", finitura: "naturale" });
    expect(posa.label).toBe(`LAYING PATTERN TARGET — diagonale_45: ${FLOOR_LAYOUT_PHOTOS.diagonale_45.text}. Copy only the laying geometry: module orientation, offsets and where the joint lines run; module size comes from the written specification — the photo is deliberately black-and-white: colour, finish and material come from the written specification`);
    expect(superficie.label).toMatch(/^WOOD SPECIES TARGET — rovere_naturale: natural oak boards.*\. Copy the wood species: grain figure, knots and tone of the boards; ignore this sample's plank size and layout/);
    expect(posa.url).toMatch(/\/render-references\/floors\/Piastrelle-Grigio-Chiaro-In-Diagonale-BN\.webp$/);
  });

  it("legge anche lo schema v2 (legacy_config) e normalizza come il prompt", () => {
    const piatta = { tipo: "parquet_massello", essenza_legno: "noce", pattern_posa: "spina_di_pesce" };
    expect(collectFloorReferenceImages({ legacy_config: piatta, scene_analysis: {} })).toEqual(collectFloorReferenceImages(piatta));
    // la foto della superficie è la stessa che il form mostra sulla scheda del materiale
    expect(floorSurfacePhoto(normalizeFloorLegacyConfig(piatta))?.entry).toBe(FLOOR_ESSENCE_PHOTOS.noce);
  });
});

/** Monta il form del pavimento: restituisce contenitore, onChange e smontaggio. */
function montaForm(value: ConfigurazionePavimento) {
  const onChange = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(PavimentoConfigForm, { value, onChange })));
  return { container, onChange, smonta: () => { act(() => root.unmount()); container.remove(); } };
}

const miniatura = (e: { folder: string; filename: string }) => referenceThumbUrl(e.folder, e.filename);
const clic = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("miniature nel form del pavimento: la stessa foto che il render riceve", () => {
  it("ogni scheda del materiale mostra la foto di superficie che il motore allega dopo averla cliccata", () => {
    const { container, onChange, smonta } = montaForm(structuredClone(DEFAULT_PAVIMENTO_CONFIG));
    const etichette = ["Parquet massello", "Parquet prefinito", "Laminato", "Gres", "Ceramica", "Marmo", "Pietra", "LVT/SPC", "Cotto", "Cemento / resina", "Resina continua", "Microcemento", "Moquette", "Terrazzo"];
    const tipiVisti = new Set<string>();
    for (const etichetta of etichette) {
      const scheda = Array.from(container.querySelectorAll("button")).find((b) => b.querySelector("span.font-semibold")?.textContent === etichetta);
      expect(scheda, etichetta).toBeDefined();
      clic(scheda!);
      const cfg = onChange.mock.calls.at(-1)?.[0] as ConfigurazionePavimento;
      tipiVisti.add(cfg.tipo);
      const attesa = floorSurfacePhoto(normalizeFloorLegacyConfig(cfg))?.entry;
      const img = scheda!.querySelector("img");
      if (attesa) expect(img?.getAttribute("src"), etichetta).toBe(miniatura(attesa));
      else expect(img, etichetta).toBeNull(); // la ceramica a effetto neutro resta col campione disegnato
      // e la foto mostrata è proprio una di quelle che il render riceve
      if (attesa) expect(collectFloorReferenceImages(cfg).map((r) => r.filename), etichetta).toContain(attesa.filename);
    }
    expect(tipiVisti.size).toBe(14);
    expect(container.querySelectorAll("img[alt]").length).toBeGreaterThanOrEqual(13);
    smonta();
  });

  it("le schede della posa mostrano la foto della posa; quelle senza foto restano disegnate", () => {
    const { container, onChange, smonta } = montaForm(structuredClone(DEFAULT_PAVIMENTO_CONFIG));
    const viste: string[] = [];
    for (const img of Array.from(container.querySelectorAll<HTMLImageElement>('img[alt^="Posa "]'))) {
      clic(img.closest("button")!);
      const posa = (onChange.mock.calls.at(-1)?.[0] as ConfigurazionePavimento).pattern_posa;
      expect(img.getAttribute("src"), posa).toBe(miniatura(FLOOR_LAYOUT_PHOTOS[posa]));
      viste.push(posa);
    }
    expect(viste.sort()).toEqual(Object.keys(FLOOR_LAYOUT_PHOTOS).sort());
    smonta();
  });

  it("le essenze mostrano la loro foto; riepilogo, finitura, bisello e battiscopa mostrano le foto che il render riceve", () => {
    const cfg: ConfigurazionePavimento = {
      ...structuredClone(DEFAULT_PAVIMENTO_CONFIG),
      tipo: "parquet_massello", effetto_visivo: "legno", essenza_legno: "noce", pattern_posa: "spina_di_pesce",
      finitura: "spazzolato", bisellatura: "bisello_v", battiscopa: { azione: "sostituisci", tipo: "legno", altezza_cm: 8 },
    };
    const { container, smonta } = montaForm(cfg);
    for (const [essenza, foto] of Object.entries(FLOOR_ESSENCE_PHOTOS)) {
      const img = Array.from(container.querySelectorAll("img")).find((i) => i.getAttribute("src") === miniatura(foto));
      expect(img, essenza).toBeDefined();
    }
    const candidate = floorReferenceCandidates(normalizeFloorLegacyConfig(cfg));
    const per = (ruolo: string) => candidate.find((c) => c.role === ruolo)!.entry;
    const src = (alt: string) => container.querySelector(`img[alt="${alt}"]`)?.getAttribute("src");
    expect(src("Superficie: Parquet massello")).toBe(miniatura(FLOOR_ESSENCE_PHOTOS.noce));
    expect(src("Finitura spazzolato")).toBe(miniatura(per("SURFACE FINISH TARGET")));
    expect(src("Bisellatura bisello_v")).toBe(miniatura(per("EDGE BEVEL TARGET")));
    expect(src("Battiscopa legno")).toBe(miniatura(per("SKIRTING BOARD TARGET")));
    smonta();
    // una finitura di pietra su un parquet non ha foto nel render: nessuna anteprima
    const lucido = montaForm({ ...cfg, finitura: "lucido" });
    expect(lucido.container.querySelector('img[alt="Finitura lucido"]')).toBeNull();
    lucido.smonta();
  });
});
