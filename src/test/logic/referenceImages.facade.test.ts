import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLADDING_PATTERN_IN_PHOTO,
  CLADDING_PATTERN_PHOTOS,
  CLADDING_PHOTOS,
  FACADE_GUTTER_PHOTOS,
  FACADE_SENZA_FOTO,
  FACADE_SILL_PHOTOS,
  PLASTER_FINISH_PHOTOS,
  collectFacadeReferenceImages,
  listFacadeReferencePaths,
  type FacadeReferenceConfig,
} from "../../../shared/render-references/facadeReferences.ts";
import { MAX_SHARED_REFERENCES } from "../../../shared/render-references/referencePicker.ts";
import {
  BASE_COURSE_MATERIAL_DESCRIPTIONS,
  CLADDING_DESCRIPTIONS,
  CLADDING_PATTERN_DESCRIPTIONS,
  FINISH_DESCRIPTIONS,
  GUTTER_MATERIAL_DESCRIPTIONS,
  SILL_MATERIAL_DESCRIPTIONS,
} from "../../../shared/render-facciata/promptFragments.ts";
import { etichetteDiFormaConColore, fileMancanti, fotoBnADColori, fotoColoriInGrigio, miniatureMancanti } from "../lib/referenceGuards";

const TABELLE = [PLASTER_FINISH_PHOTOS, CLADDING_PHOTOS, CLADDING_PATTERN_PHOTOS, FACADE_SILL_PHOTOS, FACADE_GUTTER_PHOTOS];

/**
 * Foto di materia quasi neutre per natura: il colore lo dice il testo, la foto porta
 * grana, rilievo e modulo. Non sono foto di forma finite senza il suffisso «-BN».
 */
const NEUTRE_DI_MATERIA = [
  "facades/Intonaco-Esterno-Grigio-Chiaro-Liscio.webp", // intonaco liscio: la grana è l'informazione, il colore arriva dal testo
  "facades/Facciata-In-Marmo-Bianco-Venato.webp", // marmo bianco con venatura grigia
  "facades/Parete-Di-Mattoni-Bianchi.webp", // laterizio chiaro
  "facades/Pietra-Serena-Toscana-In-Blocchi-Modulari.webp", // arenaria grigio-azzurra
];

const facciata = (over: FacadeReferenceConfig): FacadeReferenceConfig => ({ tipo_intervento: "misto", ...over });
const ruoli = (cfg: FacadeReferenceConfig) => collectFacadeReferenceImages(cfg).map((r) => r.label.split(" — ")[0]);

describe("foto di riferimento condivise: facciata — i file", () => {
  it("ogni file dichiarato esiste su disco, con la sua miniatura", () => {
    expect(fileMancanti(...TABELLE)).toEqual([]);
    expect(miniatureMancanti(...TABELLE)).toEqual([]);
    expect(listFacadeReferencePaths().length).toBeGreaterThanOrEqual(9 + 14 + 4 + 1 + 5);
  });

  it("le foto di forma (posa) sono davvero in bianco e nero, quelle di materia davvero a colori", async () => {
    expect(await fotoBnADColori(...TABELLE)).toEqual([]);
    expect(await fotoColoriInGrigio(NEUTRE_DI_MATERIA, ...TABELLE)).toEqual([]);
  });

  it("le etichette delle foto di forma non dicono colori né finiture", () => {
    expect(etichetteDiFormaConColore(...TABELLE)).toEqual([]);
  });

  it("posa e davanzali sono di forma (B/N), finiture, rivestimenti e gronde sono di materia (a colori)", () => {
    for (const e of [...Object.values(CLADDING_PATTERN_PHOTOS), ...Object.values(FACADE_SILL_PHOTOS)]) expect(e.filename, e.filename).toMatch(/-BN\.webp$/);
    for (const t of [PLASTER_FINISH_PHOTOS, CLADDING_PHOTOS, FACADE_GUTTER_PHOTOS]) {
      for (const e of Object.values(t)) expect(e.filename, e.filename).not.toMatch(/-BN\.webp$/);
    }
  });

  it("ogni testo sta sotto i 160 caratteri", () => {
    for (const t of TABELLE) for (const [k, e] of Object.entries(t)) expect(e.text.length, k).toBeLessThanOrEqual(160);
  });

  it("ogni opzione vera del form ha la sua foto o sta in FACADE_SENZA_FOTO", () => {
    const senza = (dim: string, valori: string[], tabella: Record<string, unknown>) =>
      valori.filter((v) => !tabella[v] && !FACADE_SENZA_FOTO[`${dim}.${v}`]).map((v) => `${dim}.${v}`);
    expect(senza("intonaco", Object.keys(FINISH_DESCRIPTIONS), PLASTER_FINISH_PHOTOS)).toEqual([]);
    expect(senza("rivestimento", Object.keys(CLADDING_DESCRIPTIONS), CLADDING_PHOTOS)).toEqual([]);
    expect(senza("posa", Object.keys(CLADDING_PATTERN_DESCRIPTIONS), CLADDING_PATTERN_PHOTOS)).toEqual([]);
    expect(senza("gronde", Object.keys(GUTTER_MATERIAL_DESCRIPTIONS), FACADE_GUTTER_PHOTOS)).toEqual([]);
    expect(senza("davanzali", Object.keys(SILL_MATERIAL_DESCRIPTIONS), FACADE_SILL_PHOTOS)).toEqual([]);
    expect(senza("zoccolatura", Object.keys(BASE_COURSE_MATERIAL_DESCRIPTIONS), {})).toEqual([]);
    expect(senza("persiane", ["vernicia"], {})).toEqual([]);
  });

  it("un'opzione che ha la foto non resta anche in FACADE_SENZA_FOTO (motivo scaduto)", () => {
    const tabelle: Record<string, Record<string, unknown>> = {
      intonaco: PLASTER_FINISH_PHOTOS, rivestimento: CLADDING_PHOTOS, posa: CLADDING_PATTERN_PHOTOS, davanzali: FACADE_SILL_PHOTOS, gronde: FACADE_GUTTER_PHOTOS,
    };
    const doppie = Object.keys(FACADE_SENZA_FOTO).filter((chiave) => {
      const [dimensione, valore] = chiave.split(".");
      return Boolean(tabelle[dimensione]?.[valore]);
    });
    expect(doppie).toEqual([]);
  });

  it("la tabella «posa già nella foto» usa solo materiali e pose che esistono", () => {
    for (const [materiale, posa] of Object.entries(CLADDING_PATTERN_IN_PHOTO)) {
      expect(CLADDING_PHOTOS[materiale], materiale).toBeDefined();
      expect(CLADDING_PATTERN_PHOTOS[posa as string], posa).toBeDefined();
    }
  });
});

describe("foto di riferimento condivise: facciata — scelta e gating", () => {
  it("rivestimento prima della finitura intonaco; disattivi → niente", () => {
    // Il ruolo è «CLADDING MATERIAL TARGET» (prima «CLADDING TARGET»): ora c'è anche la foto della posa.
    expect(ruoli({ intonaco: { attivo: true, finitura: "graffiato_medio" }, rivestimento: { attivo: true, tipo: "clinker_rosso" } })).toEqual(["CLADDING MATERIAL TARGET", "PLASTER FINISH TARGET"]);
    expect(collectFacadeReferenceImages({ intonaco: { attivo: false, finitura: "liscio" }, rivestimento: { attivo: false, tipo: "clinker_rosso" } })).toEqual([]);
  });

  it("la posa si allega solo se la foto del materiale non la mostra già", () => {
    // clinker: la foto è già a corsi regolari → niente doppione
    expect(ruoli(facciata({ rivestimento: { attivo: true, tipo: "clinker_rosso", posa: "corsi_regolari" } }))).toEqual(["CLADDING MATERIAL TARGET"]);
    // porfido a corsi regolari: la foto del porfido è a opus incertum → serve la foto della posa
    const refs = collectFacadeReferenceImages(facciata({ rivestimento: { attivo: true, tipo: "porfido", posa: "corsi_regolari" } }));
    expect(refs.map((r) => r.label.split(":")[0])).toEqual(["CLADDING MATERIAL TARGET — porfido", "CLADDING LAYING PATTERN TARGET — corsi_regolari"]);
    expect(refs[1].filename).toBe("Mattoni-Clinker-Beige-In-Posa-A-Correre-BN.webp");
    expect(refs[1].label).toMatch(/not their size — the photo is deliberately black-and-white/);
    // posa assente: vale «corsi_regolari», come nel testo del prompt
    expect(ruoli(facciata({ rivestimento: { attivo: true, tipo: "luserna" } }))).toEqual(["CLADDING MATERIAL TARGET", "CLADDING LAYING PATTERN TARGET"]);
  });

  it("finitura dell'intonaco: foto nuova, etichetta di materia (grana dalla foto, tono dal testo)", () => {
    const [ref] = collectFacadeReferenceImages(facciata({ intonaco: { attivo: true, finitura: "bugnato" } }));
    expect(ref.folder).toBe("facades");
    expect(ref.filename).toBe("Dettaglio-Fotorealistico-Di-Bugnato-In-Pietra.webp");
    expect(ref.label).toMatch(/^PLASTER FINISH TARGET — bugnato: rusticated ashlar/);
    expect(ref.label).toMatch(/the exact colour tone comes from the written specification$/);
    expect(collectFacadeReferenceImages(facciata({ intonaco: { attivo: true, finitura: "veneziana" } }))[0].filename).toBe("Intonaco-Veneziano-Levigato-E-Luminoso.webp");
  });

  it("gronde: la foto (in roofs/) arriva solo se si sostituiscono", () => {
    const [ref] = collectFacadeReferenceImages(facciata({ elementi: { gronde: { azione: "sostituisci", materiale: "rame" } } }));
    expect(`${ref.folder}/${ref.filename}`).toBe("roofs/Grondaia-In-Rame-Dalla-Patina-Calda.webp");
    expect(ref.label).toMatch(/^GUTTER MATERIAL TARGET — rame:/);
    expect(collectFacadeReferenceImages(facciata({ elementi: { gronde: { azione: "mantieni", materiale: "rame" } } }))).toEqual([]);
    // testo libero dei form vecchi che non è una chiave → nessuna foto, nessun errore
    expect(collectFacadeReferenceImages(facciata({ elementi: { gronde: { azione: "sostituisci", materiale: "lamiera verniciata" } } }))).toEqual([]);
  });

  it("davanzali: la foto (di forma, in facades/) arriva solo se si sostituiscono con l'alluminio piegato", () => {
    const [ref] = collectFacadeReferenceImages(facciata({ elementi: { davanzali: { azione: "sostituisci", materiale: "alluminio" } } }));
    expect(`${ref.folder}/${ref.filename}`).toBe("facades/Davanzale-In-Alluminio-Piegato-BN.webp");
    expect(ref.label).toMatch(/^[A-Z][A-Z ]+ — [a-z_]+: .+\. .+$/);
    expect(ref.label).toMatch(/^WINDOW SILL TARGET — alluminio: folded window sill/);
    expect(ref.label).toMatch(/Copy only the sill itself: its folded profile, front return, end caps and slope/);
    expect(ref.label).toMatch(/the windows and their sizes stay as in the source photo/);
    expect(ref.label).toMatch(/black-and-white: colour, finish and material come from the written specification$/);
    // mantieni → niente; pietra e marmo sono lastre (materia) e restano senza foto; testo libero o materiale assente → niente, senza errori
    expect(collectFacadeReferenceImages(facciata({ elementi: { davanzali: { azione: "mantieni", materiale: "alluminio" } } }))).toEqual([]);
    for (const materiale of ["pietra", "marmo", "lamiera di alluminio"]) {
      expect(collectFacadeReferenceImages(facciata({ elementi: { davanzali: { azione: "sostituisci", materiale } } })), materiale).toEqual([]);
    }
    expect(collectFacadeReferenceImages(facciata({ elementi: { davanzali: { azione: "sostituisci" } } }))).toEqual([]);
  });

  it("davanzali: vengono dopo l'intonaco e prima delle gronde; con rivestimento, posa e intonaco restano fuori", () => {
    const elementi = { davanzali: { azione: "sostituisci", materiale: "alluminio" }, gronde: { azione: "sostituisci", materiale: "rame" } };
    expect(ruoli(facciata({ intonaco: { attivo: true, finitura: "liscio" }, elementi }))).toEqual(["PLASTER FINISH TARGET", "WINDOW SILL TARGET", "GUTTER MATERIAL TARGET"]);
    // luserna: la foto del materiale non mostra una posa, quindi serve anche quella della posa
    expect(ruoli(facciata({ rivestimento: { attivo: true, tipo: "luserna" }, elementi }))).toEqual(["CLADDING MATERIAL TARGET", "CLADDING LAYING PATTERN TARGET", "WINDOW SILL TARGET"]);
    expect(ruoli(facciata({ rivestimento: { attivo: true, tipo: "luserna" }, intonaco: { attivo: true, finitura: "liscio" }, elementi })))
      .toEqual(["CLADDING MATERIAL TARGET", "CLADDING LAYING PATTERN TARGET", "PLASTER FINISH TARGET"]);
  });

  it(`al massimo ${MAX_SHARED_REFERENCES} foto: rivestimento, posa, intonaco; le gronde restano fuori`, () => {
    const refs = collectFacadeReferenceImages(facciata({
      intonaco: { attivo: true, finitura: "graffiato_fine" },
      rivestimento: { attivo: true, tipo: "travertino", posa: "opus_incertum" },
      elementi: { gronde: { azione: "sostituisci", materiale: "zinco_titanio" } },
    }));
    expect(refs).toHaveLength(MAX_SHARED_REFERENCES);
    expect(refs.map((r) => r.label.split(" — ")[0])).toEqual(["CLADDING MATERIAL TARGET", "CLADDING LAYING PATTERN TARGET", "PLASTER FINISH TARGET"]);
    // senza posa da correggere, le gronde entrano
    const conGronde = collectFacadeReferenceImages(facciata({
      intonaco: { attivo: true, finitura: "graffiato_fine" },
      rivestimento: { attivo: true, tipo: "travertino", posa: "corsi_sfalsati" },
      elementi: { gronde: { azione: "sostituisci", materiale: "zinco_titanio" } },
    }));
    expect(conGronde.map((r) => r.label.split(" — ")[0])).toEqual(["CLADDING MATERIAL TARGET", "PLASTER FINISH TARGET", "GUTTER MATERIAL TARGET"]);
  });

  it("nessun doppione e formato dell'etichetta «RUOLO — chiave: testo. Cosa copiare»", () => {
    const refs = collectFacadeReferenceImages(facciata({
      intonaco: { attivo: true, finitura: "rustico" },
      rivestimento: { attivo: true, tipo: "splitface_grigio", posa: "listelli_orizzontali" },
    }));
    const file = refs.map((r) => `${r.folder}/${r.filename}`);
    expect(new Set(file).size).toBe(file.length);
    for (const r of refs) expect(r.label).toMatch(/^[A-Z][A-Z ]+ — [a-z_]+: .+\. .+$/);
    // splitface: la foto del materiale è già a listelli → la posa non si ripete
    expect(refs.map((r) => r.label.split(" — ")[0])).toEqual(["CLADDING MATERIAL TARGET", "PLASTER FINISH TARGET"]);
  });
});

describe("generate-facade-render: le foto partono da legacy_config (payload v2)", () => {
  it("il collector riceve i campi del form da normalizedConfig.legacy_config", () => {
    const src = readFileSync(join(process.cwd(), "supabase", "functions", "generate-facade-render", "index.ts"), "utf8");
    expect(src).toMatch(/collectFacadeReferenceImages\(normalizedConfig\.legacy_config\)/);
  });
});
