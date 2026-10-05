import { describe, expect, it } from "vitest";
import {
  DOOR_FOTO_ORFANE,
  INTERIOR_DOOR_SENZA_FOTO,
  INTERIOR_DOOR_TYPE_REFERENCES,
  INTERIOR_DOOR_VARIANT_REFERENCES,
  SECURITY_DOOR_SENZA_FOTO,
  SECURITY_DOOR_TYPE_REFERENCES,
  collectInteriorDoorReferenceImages,
  collectSecurityDoorReferenceImages,
  listDoorReferencePaths,
} from "../../../shared/render-references/doorReferences.ts";
import { BLACK_AND_WHITE_RULE, MAX_SHARED_REFERENCES } from "../../../shared/render-references/referencePicker.ts";
import { DOOR_TYPE_DESCRIPTIONS as INTERNA_TIPI } from "../../../shared/render-interior-door/promptFragments.ts";
import { DOOR_TYPE_DESCRIPTIONS as BLINDATA_TIPI } from "../../../shared/render-security-door/promptFragments.ts";
import { DEFAULT_INTERIOR_DOOR_CONFIG, DEFAULT_SECURITY_DOOR_CONFIG } from "../../../shared/render-technical/defaults.ts";
import { bridgeTechnicalConfig } from "../../../shared/render-technical/bridge.ts";
import { fotoDelPreset, fotoDellOpzione } from "../../../shared/render-technical/referenceImages.ts";
import { OPZIONI_TECNICHE, valoriApplicabili } from "../../../shared/render-technical/opzioni.ts";
import { technicalRenderModuleSpecs } from "@/lib/render/technicalRenderModules";
import { etichetteDiFormaConColore, fileMancanti, fotoBnADColori, miniatureMancanti } from "../lib/referenceGuards";

/**
 * Porte interne e blindate: sono tutte foto di FORMA in bianco e nero. Il modello copia
 * anta, meccanismo e telaio; colore, finitura, maniglia e vetro arrivano dal testo.
 */
const interna = (preset: string, extra: Record<string, unknown> = {}) =>
  bridgeTechnicalConfig("porte-interne", { interventionPreset: preset, ...extra });
const blindata = (preset: string, extra: Record<string, unknown> = {}) =>
  bridgeTechnicalConfig("porte-blindate", { interventionPreset: preset, ...extra });

describe("foto di riferimento delle porte: file e regola bianco/nero", () => {
  it("ogni file dichiarato esiste, con la sua miniatura", () => {
    expect(fileMancanti(INTERIOR_DOOR_TYPE_REFERENCES, INTERIOR_DOOR_VARIANT_REFERENCES, SECURITY_DOOR_TYPE_REFERENCES)).toEqual([]);
    expect(miniatureMancanti(INTERIOR_DOOR_TYPE_REFERENCES, INTERIOR_DOOR_VARIANT_REFERENCES, SECURITY_DOOR_TYPE_REFERENCES)).toEqual([]);
    // 9 tipi di porta interna (5 del primo set + battente classica, a libro, doppia anta, tutta altezza) + la vetrata trasparente + 4 blindate
    expect(listDoorReferencePaths()).toHaveLength(14);
  });

  it("sono foto di forma: file in grigio vero e nessun colore o finitura nelle etichette", async () => {
    expect(await fotoBnADColori(INTERIOR_DOOR_TYPE_REFERENCES, INTERIOR_DOOR_VARIANT_REFERENCES, SECURITY_DOOR_TYPE_REFERENCES)).toEqual([]);
    expect(etichetteDiFormaConColore(INTERIOR_DOOR_TYPE_REFERENCES, INTERIOR_DOOR_VARIANT_REFERENCES, SECURITY_DOOR_TYPE_REFERENCES)).toEqual([]);
    for (const e of [...Object.values(INTERIOR_DOOR_TYPE_REFERENCES), ...Object.values(INTERIOR_DOOR_VARIANT_REFERENCES), ...Object.values(SECURITY_DOOR_TYPE_REFERENCES)]) {
      expect(e.filename, e.filename).toMatch(/-BN\.webp$/);
      expect(e.text.length, e.filename).toBeLessThanOrEqual(160);
    }
  });

  it("ogni tipo di porta ha la sua foto oppure il motivo per cui non ce l'ha", () => {
    for (const tipo of Object.keys(INTERNA_TIPI)) {
      expect(Boolean(INTERIOR_DOOR_TYPE_REFERENCES[tipo]) !== Boolean(INTERIOR_DOOR_SENZA_FOTO[tipo]), `interna ${tipo}`).toBe(true);
    }
    for (const tipo of Object.keys(BLINDATA_TIPI)) {
      expect(Boolean(SECURITY_DOOR_TYPE_REFERENCES[tipo]) !== Boolean(SECURITY_DOOR_SENZA_FOTO[tipo]), `blindata ${tipo}`).toBe(true);
    }
  });

  it("le porte interne hanno tutte la foto: nessun tipo resta in SENZA_FOTO, e le varianti sono «tipo/variante» di un tipo vero", () => {
    expect(INTERIOR_DOOR_SENZA_FOTO).toEqual({});
    for (const tipo of Object.keys(INTERNA_TIPI)) expect(INTERIOR_DOOR_TYPE_REFERENCES[tipo], tipo).toBeTruthy();
    for (const chiave of Object.keys(INTERIOR_DOOR_VARIANT_REFERENCES)) {
      const [tipo, variante, ...resto] = chiave.split("/");
      expect(Object.keys(INTERNA_TIPI), chiave).toContain(tipo);
      expect(variante, chiave).toBeTruthy();
      expect(resto, chiave).toEqual([]);
      // la variante non rifà la foto del tipo: è un file diverso
      expect(INTERIOR_DOOR_VARIANT_REFERENCES[chiave].filename, chiave).not.toBe(INTERIOR_DOOR_TYPE_REFERENCES[tipo].filename);
    }
    // le chiavi dei tipi non contengono «/»: una variante non si raggiunge dal door_type
    expect(Object.keys(INTERIOR_DOOR_TYPE_REFERENCES).filter((k) => k.includes("/"))).toEqual([]);
  });

  it("la foto «effetto legno» del set è dichiarata orfana, e nessuna tabella la usa", () => {
    expect(Object.keys(DOOR_FOTO_ORFANE)).toEqual(["doors/Porta-Blindata-Effetto-Legno-BN.webp"]);
    expect(listDoorReferencePaths()).not.toContain("doors/Porta-Blindata-Effetto-Legno-BN.webp");
  });
});

describe("porte interne: il preset sceglie la foto della forma", () => {
  const attese: Record<string, string> = {
    battente_liscia: "Porta-Interna-Bianca-Minimalista-BN.webp",
    scorrevole_interno_muro: "Porta-Scorrevole-A-Scomparsa-Elegante-BN.webp",
    scorrevole_esterno_muro: "Porta-Scorrevole-Moderna-Con-Binario-Visibile-BN.webp",
    rasomuro: "Porta-Rasomuro-Minimalista-Tono-Su-Tono-BN.webp",
    vetrata_satinata: "Porta-Interna-In-Vetro-Satinato-BN.webp",
    // foto del 05/10/2026
    battente_classica: "Porta-Interna-Battente-Classica-Pantografata-BN.webp",
    a_libro: "Porta-Interna-A-Libro-Due-Ante-BN.webp",
    doppia_anta: "Porta-Interna-Doppia-Anta-BN.webp",
    tutta_altezza: "Porta-Interna-Tutta-Altezza-BN.webp",
  };

  it("ogni preset del form ha la sua foto: nove preset, nove foto diverse", () => {
    const preset = technicalRenderModuleSpecs["porte-interne"].presets.map((p) => p.value).sort();
    expect(preset).toEqual(Object.keys(attese).sort());
    expect(new Set(Object.values(attese)).size).toBe(9);
  });

  for (const [preset, file] of Object.entries(attese)) {
    it(`${preset} → ${file}`, () => {
      const refs = collectInteriorDoorReferenceImages(interna(preset));
      expect(refs.map((r) => `${r.folder}/${r.filename}`)).toEqual([`doors/${file}`]);
      expect(refs[0].label).toMatch(/^INTERIOR DOOR TYPE TARGET — [a-z_]+: /);
      expect(refs[0].label.endsWith(`Copy the shape and construction only — ${BLACK_AND_WHITE_RULE}`)).toBe(true);
      expect(refs[0].url).toMatch(new RegExp(`/render-references/doors/${file.replace(/\./g, "\\.")}$`));
    });
  }

  it("la chiave nell'etichetta è quella vera della config (vetrata, non vetrata_satinata)", () => {
    const [ref] = collectInteriorDoorReferenceImages(interna("vetrata_satinata"));
    expect(ref.label).toMatch(/^INTERIOR DOOR TYPE TARGET — vetrata: /);
  });

  it("ogni preset del form porta la sua foto, e nessun tipo di porta è in SENZA_FOTO", () => {
    for (const p of technicalRenderModuleSpecs["porte-interne"].presets) {
      const ricca = interna(p.value) as { door_type: string };
      expect(collectInteriorDoorReferenceImages(ricca), p.value).toHaveLength(1);
      expect(INTERIOR_DOOR_SENZA_FOTO[ricca.door_type], p.value).toBeUndefined();
    }
  });
});

describe("porte interne: la foto entra solo se la forma cambia ed è quella che il prompt chiede", () => {
  const base = DEFAULT_INTERIOR_DOOR_CONFIG;
  const file = (config: object) => collectInteriorDoorReferenceImages(config).map((r) => r.filename);
  /** La configurazione ricca di un preset del form (quella da cui nasce il prompt). */
  const ricca = (preset: string, extra: Record<string, unknown> = {}) => interna(preset, extra) as unknown as typeof base;
  /** Una battente liscia con telaio standard: la base su cui le tre foto di variante (doppia anta, a libro, tutta altezza) valgono. */
  const battente = { ...base, door_type: "battente_liscia", frame: { tipo: "standard" } };
  const LIBRO = "Porta-Interna-A-Libro-Due-Ante-BN.webp";
  const DOPPIA = "Porta-Interna-Doppia-Anta-BN.webp";
  const ALTA = "Porta-Interna-Tutta-Altezza-BN.webp";
  const VETRO_SATINATO = "Porta-Interna-In-Vetro-Satinato-BN.webp";
  const VETRO_TRASPARENTE = "Porta-Interna-Vetro-Trasparente-Telaio-Sottile-BN.webp";

  it("solo finitura, solo telaio, solo maniglia → nessuna foto, anche sulle porte con la foto nuova", () => {
    const senzaForma = [["recolor_or_restyle_only"], ["change_frame_only"], ["change_hardware_only"], ["change_frame_only", "change_hardware_only"]];
    for (const preset of ["battente_liscia", "battente_classica", "a_libro", "doppia_anta", "tutta_altezza", "vetrata_satinata"]) {
      for (const interventi of senzaForma) {
        expect(file({ ...ricca(preset), interventi }), `${preset} ${interventi.join("+")}`).toEqual([]);
      }
    }
  });

  it("scorrevole esterno senza parete libera: il prompt lo dichiara non costruibile, la foto col binario non entra", () => {
    const stretta = { ...base, door_type: "scorrevole_esterno_muro", interventi: ["convert_to_wall_sliding"], apertura: { ...base.apertura, spazio_scorrimento_parete: "ridotto" } };
    expect(collectInteriorDoorReferenceImages(stretta)).toEqual([]);
    const libera = { ...stretta, apertura: { ...base.apertura, spazio_scorrimento_parete: "sufficiente" } };
    expect(collectInteriorDoorReferenceImages(libera)[0].filename).toBe("Porta-Scorrevole-Moderna-Con-Binario-Visibile-BN.webp");
  });

  it("il meccanismo che il prompt impone vince sul door_type (conversione a scomparsa di una battente)", () => {
    const refs = collectInteriorDoorReferenceImages({ ...base, door_type: "battente_liscia", frame: { tipo: "standard" }, interventi: ["convert_to_pocket_sliding"] });
    expect(refs[0].filename).toBe("Porta-Scorrevole-A-Scomparsa-Elegante-BN.webp");
  });

  it("vetro su un'anta cieca → nessuna foto: la foto è una porta piena e il prompt chiede il vetro", () => {
    expect(file({ ...battente, glass: { enabled: true, type: "satinato" } })).toEqual([]);
    for (const preset of ["battente_classica", "a_libro", "doppia_anta", "tutta_altezza"]) {
      expect(file({ ...ricca(preset), glass: { enabled: true, type: "trasparente", privacy_level: "basso" } }), preset).toEqual([]);
      expect(file({ ...ricca(preset), interventi: ["replace_existing_door", "add_glazing"] }), `${preset} + vetro`).toEqual([]);
    }
  });

  it("vetrata: satinato o vetro non specificato → la foto del satinato; trasparente → la sua; fumé, inglesine e parziale → nessuna", () => {
    const vetrata = ricca("vetrata_satinata");
    const conVetro = (type?: string) => ({ ...vetrata, glass: { ...vetrata.glass, type } });
    expect(file(conVetro("satinato"))).toEqual([VETRO_SATINATO]);
    expect(file(conVetro(undefined))).toEqual([VETRO_SATINATO]);
    expect(file(conVetro("trasparente"))).toEqual([VETRO_TRASPARENTE]);
    for (const tipo of ["fume", "inglesine", "parziale"]) expect(file(conVetro(tipo)), tipo).toEqual([]);
  });

  it("la vetrata con vetro trasparente porta nell'etichetta la variante («vetrata/trasparente») e resta una foto di forma", () => {
    const [ref] = collectInteriorDoorReferenceImages(interna("vetrata_satinata", { opzioni: { vetro: "trasparente" } }));
    expect(ref.label).toMatch(/^INTERIOR DOOR TYPE TARGET — vetrata\/trasparente: glazed interior door: one clear glass pane/);
    expect(ref.label.endsWith(`Copy the shape and construction only — ${BLACK_AND_WHITE_RULE}`)).toBe(true);
    expect(`${ref.folder}/${ref.filename}`).toBe(`doors/${VETRO_TRASPARENTE}`);
    expect(ref.url).toMatch(new RegExp(`/render-references/doors/${VETRO_TRASPARENTE.replace(/\./g, "\\.")}$`));
  });

  it("vetrata con un'altra variante (doppia anta, a libro, tutta altezza) → nessuna foto, nemmeno col vetro trasparente", () => {
    const vetrata = ricca("vetrata_satinata");
    const trasparente = { ...vetrata, glass: { ...vetrata.glass, type: "trasparente" } };
    expect(file({ ...trasparente, leaf_config: "doppia_simmetrica" })).toEqual([]);
    expect(file({ ...trasparente, leaf_config: "libro_doppia" })).toEqual([]);
    expect(file({ ...trasparente, height: "tutta_altezza" })).toEqual([]);
    expect(file({ ...trasparente, apertura: { ...vetrata.apertura, altezza_apparente: "tutta_altezza" } })).toEqual([]);
  });

  it("doppia anta: solo in un vano largo e con le ante uguali, come chiede il prompt", () => {
    const doppia = ricca("doppia_anta"); // vano «ampia» impostato dal preset
    expect(file(doppia)).toEqual([DOPPIA]);
    expect(file({ ...doppia, apertura: { ...doppia.apertura, larghezza_apparente: "molto_ampia" } })).toEqual([DOPPIA]);
    // vano standard o stretto: il prompt avverte «requires a wide apparent doorway» e vieta la doppia anta
    for (const larghezza of ["standard", "stretta"]) {
      expect(file({ ...doppia, apertura: { ...doppia.apertura, larghezza_apparente: larghezza } }), larghezza).toEqual([]);
    }
    // ante diverse (una attiva e una passiva): la foto ha due ante uguali
    expect(file({ ...doppia, leaf_config: "doppia_asimmetrica" })).toEqual([]);
    // una battente liscia con la configurazione a due ante è la porta della foto
    const largo = { ...battente, apertura: { ...base.apertura, larghezza_apparente: "ampia" } };
    expect(file({ ...largo, leaf_config: "doppia_simmetrica" })).toEqual([DOPPIA]);
    // una classica pantografata, una a filo muro o una scorrevole a due ante no: le ante della foto sono lisce e a battente
    expect(file({ ...largo, door_type: "battente_classica", leaf_config: "doppia_simmetrica" })).toEqual([]);
    expect(file({ ...doppia, frame: { tipo: "rasomuro" } })).toEqual([]);
    expect(file({ ...doppia, interventi: ["convert_to_pocket_sliding"] })).toEqual([]);
  });

  it("a libro: la foto vale per la porta a libro e per la battente liscia con le ante che si ripiegano", () => {
    const libro = ricca("a_libro");
    expect(file(libro)).toEqual([LIBRO]);
    expect(file({ ...battente, leaf_config: "libro_doppia" })).toEqual([LIBRO]);
    // a libro e doppia anta insieme: il prompt li stampa tutti e due, la foto ne mostra uno
    expect(file({ ...libro, door_type: "doppia_anta", apertura: { ...libro.apertura, larghezza_apparente: "ampia" } })).toEqual([]);
    // a filo muro o con un altro meccanismo la foto (ante a battente con casing) non c'entra
    expect(file({ ...libro, frame: { tipo: "rasomuro" } })).toEqual([]);
    expect(file({ ...libro, interventi: ["convert_to_wall_sliding"], apertura: { ...libro.apertura, spazio_scorrimento_parete: "ampio" } })).toEqual([]);
  });

  it("tutta altezza: telaio minimale, a filo o complanare come la foto (nessun coprifilo); standard o classico la smentirebbero", () => {
    const alta = ricca("tutta_altezza"); // telaio minimale impostato dal preset
    expect(file(alta)).toEqual([ALTA]);
    for (const tipo of ["minimale", "complanare", "rasomuro"]) {
      expect(file({ ...alta, frame: { ...alta.frame, tipo } }), tipo).toEqual([ALTA]);
    }
    for (const tipo of ["standard", "coprifilo_classico"]) {
      expect(file({ ...alta, frame: { ...alta.frame, tipo } }), tipo).toEqual([]);
    }
    // l'altezza può venire dalla porta o dal vano, su una battente liscia con telaio minimale…
    const liscia = { ...battente, frame: { tipo: "minimale" } };
    expect(file({ ...liscia, height: "tutta_altezza" })).toEqual([ALTA]);
    expect(file({ ...liscia, apertura: { ...base.apertura, altezza_apparente: "tutta_altezza" } })).toEqual([ALTA]);
    // …ma con i coprifili standard della battente liscia no
    expect(file({ ...battente, height: "tutta_altezza" })).toEqual([]);
    // una rasomuro a tutta altezza è proprio la porta della foto; una classica pantografata no
    expect(file({ ...base, door_type: "rasomuro", height: "tutta_altezza" })).toEqual([ALTA]);
    expect(file({ ...ricca("battente_classica"), height: "tutta_altezza" })).toEqual([]);
    // tutta altezza e doppia anta: due varianti insieme
    expect(file({ ...alta, leaf_config: "doppia_simmetrica", apertura: { ...alta.apertura, larghezza_apparente: "ampia" } })).toEqual([]);
  });

  it("battente classica: la foto vale per la classica a un'anta; con le ante che si ripiegano non entra, a filo muro vince la rasomuro", () => {
    const classica = ricca("battente_classica");
    expect(file(classica)).toEqual(["Porta-Interna-Battente-Classica-Pantografata-BN.webp"]);
    expect(file({ ...classica, leaf_config: "libro_doppia" })).toEqual([]);
    expect(file({ ...classica, leaf_config: "doppia_simmetrica" })).toEqual([]);
    // il filo muro vince sul tipo (come prima): niente coprifili, quindi la foto della rasomuro e non quella classica
    expect(file({ ...classica, frame: { tipo: "rasomuro" } })).toEqual(["Porta-Rasomuro-Minimalista-Tono-Su-Tono-BN.webp"]);
  });

  it("le scelte del form: finitura e maniglia non cambiano la foto; il vetro la cambia (trasparente) o la toglie (fumé)", () => {
    const conFinitura = collectInteriorDoorReferenceImages(interna("battente_liscia", { opzioni: { finitura_anta: "effetto_legno_scuro", maniglia: "ottone" } }));
    expect(conFinitura.map((r) => r.filename)).toEqual(["Porta-Interna-Bianca-Minimalista-BN.webp"]);
    const nuove: Record<string, string> = {
      battente_classica: "Porta-Interna-Battente-Classica-Pantografata-BN.webp",
      a_libro: LIBRO,
      doppia_anta: DOPPIA,
      tutta_altezza: ALTA,
    };
    for (const [preset, foto] of Object.entries(nuove)) {
      expect(file(interna(preset, { opzioni: { finitura_anta: "effetto_legno_chiaro", maniglia: "bianco" } })), preset).toEqual([foto]);
    }
    expect(file(interna("vetrata_satinata", { opzioni: { vetro: "satinato" } }))).toEqual([VETRO_SATINATO]);
    expect(file(interna("vetrata_satinata", { opzioni: { vetro: "trasparente" } }))).toEqual([VETRO_TRASPARENTE]);
    expect(file(interna("vetrata_satinata", { opzioni: { vetro: "fume" } }))).toEqual([]);
  });

  it("config assente o malformata (API) → nessuna foto, nessuna eccezione", () => {
    expect(collectInteriorDoorReferenceImages(null)).toEqual([]);
    expect(collectInteriorDoorReferenceImages({})).toEqual([]);
    expect(collectInteriorDoorReferenceImages({ interventi: "replace_existing_door", door_type: 3, glass: null, apertura: null })).toEqual([]);
    // un door_type che non è un tipo di porta (né la chiave di una variante, né una del prototipo) non porta foto
    for (const door_type of ["vetrata/trasparente", "constructor", "toString", "__proto__"]) {
      expect(file({ ...base, door_type, frame: { tipo: "standard" } }), door_type).toEqual([]);
    }
  });
});

describe("porte blindate: il preset sceglie la foto della forma", () => {
  const attese: Record<string, string> = {
    moderna_liscia: "Porta-Blindata-Moderna-Eleganza-Italiana-BN.webp",
    classica_pantografata: "Porta-Blindata-Classica-Con-Pannello-Inciso-BN.webp",
    rasomuro: "Porta-Blindata-Rasomuro-Minimalista-BN.webp",
    con_fiancoluce: "Porta-Blindata-Con-Fiancoluce-Elegante-BN.webp",
  };

  for (const [preset, file] of Object.entries(attese)) {
    it(`${preset} → ${file}`, () => {
      const refs = collectSecurityDoorReferenceImages(blindata(preset));
      expect(refs.map((r) => `${r.folder}/${r.filename}`)).toEqual([`doors/${file}`]);
      expect(refs[0].label).toMatch(/^SECURITY DOOR TYPE TARGET — [a-z_]+: /);
    });
  }

  it("«solo finitura» non allega la forma: cambia il pannello, non la porta", () => {
    expect(collectSecurityDoorReferenceImages(blindata("solo_finitura"))).toEqual([]);
    // nemmeno scegliendo la finitura del pannello o il lato fotografato
    expect(collectSecurityDoorReferenceImages(blindata("solo_finitura", { opzioni: { finitura_pannello: "effetto_legno", lato_foto: "pianerottolo" } }))).toEqual([]);
  });

  it("lato fotografato, finitura del pannello e maniglia non cambiano la foto della forma", () => {
    const refs = collectSecurityDoorReferenceImages(blindata("moderna_liscia", { opzioni: { lato_foto: "pianerottolo", finitura_pannello: "laccato", maniglia: "cromo" } }));
    expect(refs.map((r) => r.filename)).toEqual(["Porta-Blindata-Moderna-Eleganza-Italiana-BN.webp"]);
  });

  it("solo telaio, solo soglia, solo ferramenta → nessuna foto", () => {
    for (const interventi of [["change_frame_only"], ["replace_threshold"], ["add_security_hardware"]]) {
      expect(collectSecurityDoorReferenceImages({ ...DEFAULT_SECURITY_DOOR_CONFIG, interventi }), interventi[0]).toEqual([]);
    }
  });

  it("fiancoluce su un vano stretto: il prompt lo dichiara non costruibile, la foto col fiancoluce non entra", () => {
    const ricca = blindata("con_fiancoluce") as unknown as typeof DEFAULT_SECURITY_DOOR_CONFIG;
    expect(collectSecurityDoorReferenceImages({ ...ricca, apertura: { ...ricca.apertura, larghezza_apparente: "stretta" } })).toEqual([]);
  });

  it("sopraluce o doppia anta → nessuna foto (tutte le foto hanno la testata piena e un'anta sola)", () => {
    expect(collectSecurityDoorReferenceImages({ ...DEFAULT_SECURITY_DOOR_CONFIG, vetri: { fiancoluce: false, sopraluce: true } })).toEqual([]);
    expect(collectSecurityDoorReferenceImages({ ...DEFAULT_SECURITY_DOOR_CONFIG, leaf_type: "doppia_anta_simmetrica" })).toEqual([]);
  });

  it("ogni preset del form o porta una foto o è «solo finitura» o il suo tipo sta in SENZA_FOTO", () => {
    for (const p of technicalRenderModuleSpecs["porte-blindate"].presets) {
      const ricca = blindata(p.value) as { door_type: string; interventi: string[] };
      const refs = collectSecurityDoorReferenceImages(ricca);
      const finituraSoltanto = ricca.interventi.length === 1 && ricca.interventi[0] === "recolor_or_restyle_only";
      expect(refs.length === 1 || finituraSoltanto || Boolean(SECURITY_DOOR_SENZA_FOTO[ricca.door_type]), p.value).toBe(true);
    }
  });

  it("mai più del tetto condiviso, mai la stessa foto due volte", () => {
    for (const modulo of ["porte-interne", "porte-blindate"] as const) {
      for (const p of technicalRenderModuleSpecs[modulo].presets) {
        const refs = modulo === "porte-interne" ? collectInteriorDoorReferenceImages(interna(p.value)) : collectSecurityDoorReferenceImages(blindata(p.value));
        expect(refs.length).toBeLessThanOrEqual(MAX_SHARED_REFERENCES);
        expect(new Set(refs.map((r) => r.filename)).size).toBe(refs.length);
      }
    }
  });
});

describe("miniature del form delle porte: la stessa foto che va al modello", () => {
  const attese: Record<string, Record<string, string | null>> = {
    "porte-interne": {
      battente_liscia: "Porta-Interna-Bianca-Minimalista-BN.webp",
      battente_classica: "Porta-Interna-Battente-Classica-Pantografata-BN.webp",
      scorrevole_interno_muro: "Porta-Scorrevole-A-Scomparsa-Elegante-BN.webp",
      scorrevole_esterno_muro: "Porta-Scorrevole-Moderna-Con-Binario-Visibile-BN.webp",
      rasomuro: "Porta-Rasomuro-Minimalista-Tono-Su-Tono-BN.webp",
      tutta_altezza: "Porta-Interna-Tutta-Altezza-BN.webp",
      a_libro: "Porta-Interna-A-Libro-Due-Ante-BN.webp",
      doppia_anta: "Porta-Interna-Doppia-Anta-BN.webp",
      vetrata_satinata: "Porta-Interna-In-Vetro-Satinato-BN.webp",
    },
    "porte-blindate": {
      moderna_liscia: "Porta-Blindata-Moderna-Eleganza-Italiana-BN.webp",
      classica_pantografata: "Porta-Blindata-Classica-Con-Pannello-Inciso-BN.webp",
      rasomuro: "Porta-Blindata-Rasomuro-Minimalista-BN.webp",
      con_fiancoluce: "Porta-Blindata-Con-Fiancoluce-Elegante-BN.webp",
      solo_finitura: null,
    },
  };

  for (const [modulo, perPreset] of Object.entries(attese)) {
    it(`${modulo}: ogni preset del form ha in tabella la sua miniatura (o nessuna)`, () => {
      expect(technicalRenderModuleSpecs[modulo as "porte-interne"].presets.map((p) => p.value).sort()).toEqual(Object.keys(perPreset).sort());
      for (const [preset, file] of Object.entries(perPreset)) {
        const foto = fotoDelPreset(modulo, preset);
        expect(foto?.filename ?? null, preset).toBe(file);
        if (foto) {
          // è proprio la foto che il collector allega per quel preset
          const motore = modulo === "porte-interne" ? collectInteriorDoorReferenceImages(interna(preset)) : collectSecurityDoorReferenceImages(blindata(preset));
          expect(`${motore[0].folder}/${motore[0].filename}`).toBe(`${foto.folder}/${foto.filename}`);
        }
      }
    });
  }

  it("tra le opzioni delle porte solo il vetro trasparente ha una foto sua: la vetrata col vetro trasparente; finiture, maniglia e lato nessuna miniatura", () => {
    const conMiniatura: string[] = [];
    for (const modulo of ["porte-interne", "porte-blindate"] as const) {
      for (const p of technicalRenderModuleSpecs[modulo].presets) {
        for (const o of OPZIONI_TECNICHE[modulo]) {
          for (const v of valoriApplicabili(o, p.value)) {
            const foto = fotoDellOpzione(modulo, p.value, o.chiave, v.value);
            if (foto) conMiniatura.push(`${modulo}/${p.value}/${o.chiave}=${v.value} → ${foto.folder}/${foto.filename}`);
          }
        }
      }
    }
    expect(conMiniatura).toEqual(["porte-interne/vetrata_satinata/vetro=trasparente → doors/Porta-Interna-Vetro-Trasparente-Telaio-Sottile-BN.webp"]);
  });

  it("«Satinato» e «Fumé» non hanno miniatura propria: la foto del satinato è quella del preset, il fumé non ha foto", () => {
    expect(fotoDellOpzione("porte-interne", "vetrata_satinata", "vetro", "satinato")).toBeNull();
    expect(fotoDellOpzione("porte-interne", "vetrata_satinata", "vetro", "fume")).toBeNull();
    expect(fotoDelPreset("porte-interne", "vetrata_satinata")?.filename).toBe("Porta-Interna-In-Vetro-Satinato-BN.webp");
  });
});
