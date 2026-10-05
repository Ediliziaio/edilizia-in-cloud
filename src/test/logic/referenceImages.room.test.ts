import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STANZA_CONFIG, StanzaConfigForm } from "@/components/render-stanza/StanzaConfigForm";
import { referenceThumbUrl } from "../../../shared/render-references/thumbs.ts";
import type { ConfigRivestimentoPareti, ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";
import {
  ROOM_CLADDING_PHOTOS,
  ROOM_LIGHTING_PHOTOS,
  ROOM_SENZA_FOTO,
  collectRoomReferenceImages,
  listRoomReferencePaths,
  roomReferenceCandidates,
} from "../../../shared/render-references/roomReferences.ts";
import {
  FLOOR_ESSENCE_PHOTOS,
  FLOOR_EFFECT_PHOTOS,
  FLOOR_LAYOUT_PHOTOS,
  FLOOR_TYPE_PHOTOS,
} from "../../../shared/render-references/floorReferences.ts";
import {
  etichetteDiFormaConColore,
  fileMancanti,
  fotoBnADColori,
  fotoColoriInGrigio,
  miniatureMancanti,
} from "../lib/referenceGuards";

/**
 * Le foto della stanza: il rivestimento delle pareti (4 foto del set, in facades/) e il
 * pavimento (le stesse foto del render pavimento). Entrano solo per i sistemi attivi.
 */
const ROOT = process.cwd();

function stanza(patch: Partial<ConfigurazioneStanza> = {}): ConfigurazioneStanza {
  return { ...structuredClone(DEFAULT_STANZA_CONFIG), ...patch };
}

const TIPI_RIVESTIMENTO: Record<NonNullable<ConfigRivestimentoPareti["tipo"]>, true> = {
  boiserie_legno: true, mattone_vista: true, pietra_naturale: true, pannelli_3d: true, intonaco_spatolato: true, stucco_veneziano: true,
};

const labels = (cfg: unknown) => collectRoomReferenceImages(cfg).map((r) => r.label);
const files = (cfg: unknown) => collectRoomReferenceImages(cfg).map((r) => r.filename);

describe("foto della stanza: la libreria", () => {
  it("i file del rivestimento esistono, con miniatura, a colori e con testi brevi", async () => {
    expect(fileMancanti(ROOM_CLADDING_PHOTOS)).toEqual([]);
    expect(miniatureMancanti(ROOM_CLADDING_PHOTOS)).toEqual([]);
    expect(await fotoBnADColori(ROOM_CLADDING_PHOTOS)).toEqual([]);
    expect(await fotoColoriInGrigio([], ROOM_CLADDING_PHOTOS)).toEqual([]);
    expect(etichetteDiFormaConColore(ROOM_CLADDING_PHOTOS)).toEqual([]);
    for (const [k, e] of Object.entries(ROOM_CLADDING_PHOTOS)) {
      expect(e.folder, k).toBe("facades");
      expect(e.text.length, k).toBeLessThanOrEqual(160);
    }
  });

  it("ogni tipo di rivestimento del form ha una foto o un motivo in ROOM_SENZA_FOTO", () => {
    const scoperti = Object.keys(TIPI_RIVESTIMENTO).filter((t) => !ROOM_CLADDING_PHOTOS[t] && !ROOM_SENZA_FOTO[`rivestimento_pareti.${t}`]);
    expect(scoperti).toEqual([]);
  });

  it("le 4 voci «stanza» del manifest sono tutte nella libreria", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "scripts", "render-references", "manifest.json"), "utf8")) as {
      voci: Array<{ modulo: string; valore: string; file: string[] }>;
    };
    const voci = manifest.voci.filter((v) => v.modulo === "stanza");
    expect(voci.map((v) => v.valore).sort()).toEqual(["intonaco_spatolato", "mattone_vista", "pietra_naturale", "stucco_veneziano"]);
    const usate = new Set(listRoomReferencePaths());
    expect(voci.filter((v) => !usate.has(v.file[0])).map((v) => v.valore)).toEqual([]);
  });
});

describe("foto della stanza: cosa riceve il render", () => {
  it("nessun sistema attivo → nessuna foto (anche se i tipi sono scelti)", () => {
    expect(collectRoomReferenceImages(stanza())).toEqual([]);
    const spenti = stanza({
      rivestimento_pareti: { attivo: false, tipo: "mattone_vista", applica_a: "parete_principale" },
      pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: false, tipo: "parquet_legno", pattern: "spina_pesce" },
    });
    expect(collectRoomReferenceImages(spenti)).toEqual([]);
  });

  it("rivestimento attivo: la sua foto con l'etichetta della parete", () => {
    const refs = collectRoomReferenceImages(stanza({ rivestimento_pareti: { attivo: true, tipo: "stucco_veneziano", applica_a: "parete_principale" } }));
    expect(refs).toHaveLength(1);
    expect(refs[0].label).toMatch(/^WALL CLADDING TARGET — stucco_veneziano: polished Venetian stucco/);
    expect(refs[0].label).toMatch(/Copy the wall surface only: texture, relief, joint pattern and scale/);
    expect(refs[0].url).toMatch(/\/render-references\/facades\/Intonaco-Veneziano-Levigato-E-Luminoso\.webp$/);
    // boiserie e pannelli 3D non hanno foto: nessuna immagine sbagliata al loro posto
    expect(collectRoomReferenceImages(stanza({ rivestimento_pareti: { attivo: true, tipo: "boiserie_legno" } }))).toEqual([]);
  });

  it("pavimento attivo: le chiavi della stanza si traducono come nel prompt (parquet_legno, spina_pesce…)", () => {
    const parquet = stanza({ pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "parquet_legno", pattern: "spina_pesce", effetto_visivo: "legno", formato_piastrella: "listelli_standard" } });
    expect(files(parquet)).toEqual([FLOOR_LAYOUT_PHOTOS.spina_di_pesce.filename, FLOOR_TYPE_PHOTOS.parquet_prefinito.filename]);
    // cassero regolare = a correre: nessuna foto di posa; opus romano = opus romanum
    expect(labels(stanza({ pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, pattern: "cassero_regolare" } }))).toEqual([
      expect.stringMatching(/^FLOOR MATERIAL TARGET — gres_porcellanato \/ cemento/),
    ]);
    expect(files(stanza({ pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, pattern: "opus_romano" } }))[0]).toBe(FLOOR_LAYOUT_PHOTOS.opus_romanum.filename);
    // resina: continua, nessuna posa
    expect(files(stanza({ pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "resina", formato_piastrella: "continuo" } }))).toEqual([FLOOR_TYPE_PHOTOS.resina_continua.filename]);
    // lastre grandi: nessuna posa
    expect(files(stanza({ pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "marmo", effetto_visivo: "marmo", formato_piastrella: "120x240" } }))).toEqual([FLOOR_TYPE_PHOTOS.marmo.filename]);
  });

  it("«Laminato effetto legno» con l'effetto «cemento» di partenza: la foto è del laminato, non di un gres effetto cemento", () => {
    expect(files(stanza({ pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "parquet_laminato", pattern: "cassero_regolare" } }))).toEqual([FLOOR_TYPE_PHOTOS.laminato.filename]);
  });

  it("nella stanza niente primi piani di dettaglio del pavimento (bisello, finitura)", () => {
    const refs = labels(stanza({ pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "parquet_legno", effetto_visivo: "legno", pattern: "dritto", finitura: "spazzolato" } }));
    expect(refs.some((l) => /EDGE BEVEL|SURFACE FINISH/.test(l))).toBe(false);
  });

  it("priorità: posa del pavimento, poi rivestimento, poi superficie del pavimento; tetto 3", () => {
    const cfg = stanza({
      rivestimento_pareti: { attivo: true, tipo: "mattone_vista", applica_a: "parete_principale" },
      pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "gres_porcellanato", effetto_visivo: "pietra", pattern: "spina_ungherese", formato_piastrella: "30x60" },
    });
    const refs = labels(cfg);
    expect(refs).toHaveLength(3);
    expect(refs[0]).toMatch(/^LAYING PATTERN TARGET — spina_ungherese/);
    expect(refs[1]).toMatch(/^WALL CLADDING TARGET — mattone_vista/);
    expect(refs[2]).toMatch(/^FLOOR MATERIAL TARGET — gres_porcellanato \/ pietra/);
    expect(files(cfg)[2]).toBe(FLOOR_EFFECT_PHOTOS.pietra.filename);
  });
});

describe("foto della stanza: gli elementi nuovi del pavimento", () => {
  it("essenza, battiscopa e posa modulare portano le loro foto", () => {
    const cfg = stanza({
      pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "parquet_legno", essenza_legno: "teak", pattern: "modulare", battiscopa_azione: "sostituisci", battiscopa_tipo: "alluminio" },
    });
    expect(labels(cfg)).toEqual([
      expect.stringMatching(/^LAYING PATTERN TARGET — modulare/),
      expect.stringMatching(/^WOOD SPECIES TARGET — teak/),
      expect.stringMatching(/^SKIRTING BOARD TARGET — alluminio/),
    ]);
    // battiscopa da sostituire senza materiale preciso («coordinato»): nessuna foto
    const coordinato = stanza({ pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, battiscopa_azione: "sostituisci" } });
    expect(labels(coordinato).some((l) => l.startsWith("SKIRTING"))).toBe(false);
  });
});

describe("foto della stanza: l'illuminazione a binario", () => {
  const ruolo = (label: string) => label.split(" — ")[0];
  const illuminazione = (patch: Partial<ConfigurazioneStanza["illuminazione"]>) =>
    stanza({ illuminazione: { ...DEFAULT_STANZA_CONFIG.illuminazione, ...patch } });

  it("il file sta in lighting/, con la miniatura, in bianco e nero, con un testo breve e senza colori", async () => {
    expect(fileMancanti(ROOM_LIGHTING_PHOTOS)).toEqual([]);
    expect(miniatureMancanti(ROOM_LIGHTING_PHOTOS)).toEqual([]);
    expect(await fotoBnADColori(ROOM_LIGHTING_PHOTOS)).toEqual([]);
    expect(etichetteDiFormaConColore(ROOM_LIGHTING_PHOTOS)).toEqual([]);
    for (const [k, e] of Object.entries(ROOM_LIGHTING_PHOTOS)) {
      expect(e.folder, k).toBe("lighting");
      expect(e.filename, k).toMatch(/-BN\.webp$/);
      expect(e.text.length, k).toBeLessThanOrEqual(160);
    }
    expect(listRoomReferencePaths()).toContain("lighting/Binario-Con-Faretti-Orientabili-BN.webp");
  });

  it("la foto parte solo con l'illuminazione attiva e il tipo «binario»", () => {
    // spenta, anche se il tipo è scelto
    expect(collectRoomReferenceImages(illuminazione({ attivo: false, tipo: "binario" }))).toEqual([]);
    // accesa ma di un altro tipo (quello di partenza è «misto»): nessuna foto sbagliata al suo posto
    expect(DEFAULT_STANZA_CONFIG.illuminazione.tipo).toBe("misto");
    expect(collectRoomReferenceImages(illuminazione({ attivo: true }))).toEqual([]);
    for (const tipo of ["faretti_incassati", "lampadario_centrale", "led_strip_perimetrale", "lampade_sospensione", "applique_parete", "misto"] as const) {
      expect(collectRoomReferenceImages(illuminazione({ attivo: true, tipo })), tipo).toEqual([]);
    }
    const [ref] = collectRoomReferenceImages(illuminazione({ attivo: true, tipo: "binario" }));
    expect(ref.folder).toBe("lighting");
    expect(ref.url).toMatch(/\/render-references\/lighting\/Binario-Con-Faretti-Orientabili-BN\.webp$/);
    expect(ref.label).toMatch(/^[A-Z][A-Z ]+ — [a-z_]+: .+\. .+$/);
    expect(ref.label).toMatch(/^LIGHTING TYPE TARGET — binario: slim surface-mounted ceiling track/);
    // la foto è una stanza vuota con la luce di una finestra: il testo dice di non copiarla
    expect(ref.label).toMatch(/ignore the room, the walls and the daylight of this sample/);
    expect(ref.label).toMatch(/the track length, its position and the number of heads come from the written specification/);
    expect(ref.label).toMatch(/black-and-white: colour, finish and material come from the written specification$/);
  });

  it("priorità: dopo il rivestimento e la superficie del pavimento, prima del battiscopa; tetto 3", () => {
    const binario = { ...DEFAULT_STANZA_CONFIG.illuminazione, attivo: true, tipo: "binario" as const };
    const mattone = { attivo: true, tipo: "mattone_vista" as const, applica_a: "parete_principale" as const };
    // con il rivestimento: prima il rivestimento, poi il binario
    expect(labels(stanza({ illuminazione: binario, rivestimento_pareti: mattone })).map(ruolo)).toEqual(["WALL CLADDING TARGET", "LIGHTING TYPE TARGET"]);
    // posa, essenza e battiscopa da sostituire: il binario prende il posto del battiscopa
    const parquet = stanza({
      illuminazione: binario,
      pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "parquet_legno", essenza_legno: "teak", pattern: "modulare", battiscopa_azione: "sostituisci", battiscopa_tipo: "alluminio" },
    });
    expect(labels(parquet).map(ruolo)).toEqual(["LAYING PATTERN TARGET", "WOOD SPECIES TARGET", "LIGHTING TYPE TARGET"]);
    // posa, rivestimento e superficie occupano i tre posti: il binario resta fuori
    const pieno = stanza({
      illuminazione: binario,
      rivestimento_pareti: mattone,
      pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "gres_porcellanato", effetto_visivo: "pietra", pattern: "spina_ungherese", formato_piastrella: "30x60" },
    });
    expect(labels(pieno).map(ruolo)).toEqual(["LAYING PATTERN TARGET", "WALL CLADDING TARGET", "FLOOR MATERIAL TARGET"]);
    // pavimento continuo (resina: niente posa) e rivestimento: rivestimento, superficie e binario
    const resina = stanza({
      illuminazione: binario,
      rivestimento_pareti: mattone,
      pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "resina", formato_piastrella: "continuo" },
    });
    expect(labels(resina).map(ruolo)).toEqual(["WALL CLADDING TARGET", "FLOOR MATERIAL TARGET", "LIGHTING TYPE TARGET"]);
  });
});

/** Monta il form della stanza e apre le sezioni dell'accordion richieste. */
function montaForm(value: ConfigurazioneStanza, sezioni: string[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(StanzaConfigForm, { value, onChange: vi.fn() })));
  for (const sezione of sezioni) {
    const trigger = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim().startsWith(sezione) && b.getAttribute("aria-expanded") !== null);
    act(() => trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }
  return { container, smonta: () => { act(() => root.unmount()); container.remove(); } };
}

const miniatura = (e: { folder: string; filename: string }) => referenceThumbUrl(e.folder, e.filename);

describe("miniature nel form della stanza: la stessa foto che il render riceve", () => {
  it("rivestimento: la miniatura accanto al tipo è la foto del render; boiserie e pannelli 3D senza foto", () => {
    for (const tipo of Object.keys(TIPI_RIVESTIMENTO) as Array<keyof typeof TIPI_RIVESTIMENTO>) {
      const cfg = stanza({ rivestimento_pareti: { attivo: true, tipo, applica_a: "parete_principale" } });
      const { container, smonta } = montaForm(cfg, ["Rivestimento pareti"]);
      const img = container.querySelector(`img[alt="Rivestimento: ${tipo}"]`);
      const foto = ROOM_CLADDING_PHOTOS[tipo];
      if (foto) {
        expect(img?.getAttribute("src"), tipo).toBe(miniatura(foto));
        expect(collectRoomReferenceImages(cfg)[0].filename, tipo).toBe(foto.filename);
      } else {
        expect(img, tipo).toBeNull();
      }
      smonta();
    }
  });

  it("pavimento: superficie, posa, essenze e battiscopa mostrano le foto che il render riceve", () => {
    const cfg = stanza({
      pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "parquet_legno", essenza_legno: "rovere_miele", pattern: "spina_pesce", battiscopa_azione: "sostituisci", battiscopa_tipo: "bianco" },
    });
    const { container, smonta } = montaForm(cfg, ["Pavimento"]);
    const candidate = roomReferenceCandidates(cfg);
    const per = (ruolo: string) => candidate.find((c) => c.role === ruolo)!.entry;
    const src = (alt: string) => container.querySelector(`img[alt="${alt}"]`)?.getAttribute("src");
    expect(src("Pavimento: parquet_legno")).toBe(miniatura(per("WOOD SPECIES TARGET")));
    expect(src("Posa: spina_pesce")).toBe(miniatura(per("LAYING PATTERN TARGET")));
    expect(src("Battiscopa: bianco")).toBe(miniatura(per("SKIRTING BOARD TARGET")));
    for (const [essenza, foto] of Object.entries(FLOOR_ESSENCE_PHOTOS)) {
      expect(Array.from(container.querySelectorAll("img")).some((i) => i.getAttribute("src") === miniatura(foto)), essenza).toBe(true);
    }
    smonta();
    // lastre grandi: il render non riceve la posa, e il form non la mostra
    const lastre = stanza({ pavimento: { ...DEFAULT_STANZA_CONFIG.pavimento, attivo: true, tipo: "marmo", formato_piastrella: "120x240" } });
    const l = montaForm(lastre, ["Pavimento"]);
    expect(l.container.querySelector('img[alt="Posa: dritto"]')).toBeNull();
    expect(l.container.querySelector('img[alt="Pavimento: marmo"]')?.getAttribute("src")).toBe(miniatura(FLOOR_TYPE_PHOTOS.marmo));
    l.smonta();
  });
});

describe("generate-room-render: foto condivise dopo il catalogo dell'azienda", () => {
  const src = readFileSync(join(ROOT, "supabase", "functions", "generate-room-render", "index.ts"), "utf8");

  it("raccoglie le foto dal config del wizard e le scarica solo negli slot liberi", () => {
    expect(src).toMatch(/collectRoomReferenceImages\(cfg\)/);
    expect(src).toMatch(/const slotLiberi = 4 - catalogReferences\.length;/);
    expect(src).toMatch(/fetchSharedReferenceImages\(\s*refsCondivise\.slice\(0, slotLiberi\)/);
  });

  it("la legenda parte dopo le foto del catalogo, contate PRIMA di concatenare, e solo se è arrivata almeno una foto", () => {
    expect(src).toMatch(/const primaCondivisa = 2 \+ catalogReferences\.length;/);
    expect(src).toMatch(/buildSharedReferenceLegend\(fetched\.references, primaCondivisa\)/);
    expect(src.indexOf("const primaCondivisa")).toBeLessThan(src.indexOf("catalogReferences = [...catalogReferences, ...fetched.references]"));
    expect(src).toMatch(/if \(fetched\.references\.length > 0\) \{[\s\S]{0,400}buildSharedReferenceLegend\(fetched\.references/);
  });

  it("il rewriter riceve il manifest di QUESTO render, non lo snapshot salvato (vuoto al primo render, vecchio a una variante)", () => {
    expect(src).toMatch(/config: \{ config: cfg, analisi: normalizedConfig \}/);
    expect(src).not.toMatch(/analisi: session\.config_snapshot/);
    expect(src.indexOf("buildRoomPrompt(cfg")).toBeLessThan(src.indexOf("analisi: normalizedConfig"));
  });

  it("la legenda entra nel prompt salvato (prompt_used) e il modello riceve le stesse foto anche al secondo tentativo", () => {
    expect(src.indexOf("buildSharedReferenceLegend(fetched.references")).toBeLessThan(src.indexOf("prompt_used: fullPrompt"));
    const generate = src.slice(src.indexOf("const generateCandidate"), src.indexOf("const generateCandidate") + 1200);
    expect(generate).toMatch(/referenceImages: catalogReferences\.length > 0 \? catalogReferences : undefined/);
    // il retry del controllo qualità passa dalla stessa funzione
    const retry = src.slice(src.indexOf("[QC FAILURE"));
    expect(retry).toMatch(/generateCandidate\(correctedPrompt, true\)/);
  });
});
