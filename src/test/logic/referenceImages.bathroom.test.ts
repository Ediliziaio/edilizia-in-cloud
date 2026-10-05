import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BATH_SCREEN_PHOTOS,
  BATHROOM_FOLDER,
  BATHROOM_PHOTO_TABLES,
  LIGHTING_PHOTOS,
  SENZA_FOTO,
  SHOWER_DRAIN_PHOTOS,
  SHOWER_NICHE_PHOTOS,
  TILE_EFFECT_PHOTOS,
  TOWEL_WARMER_PHOTOS,
  collectBathroomReferenceImages,
  listBathroomReferencePaths,
  type BathroomReferenceConfig,
} from "../../../shared/render-references/bathroomReferences.ts";
import { BLACK_AND_WHITE_RULE, isBlackAndWhite } from "../../../shared/render-references/referencePicker.ts";
import {
  BASIN_DESCRIPTIONS,
  BATH_SCREEN_DESCRIPTIONS,
  BATHTUB_FAUCET_DESCRIPTIONS,
  BATHTUB_MATERIAL_DESCRIPTIONS,
  BATHTUB_TYPE_DESCRIPTIONS,
  FAUCET_FINISH_DESCRIPTIONS,
  FAUCET_STYLE_DESCRIPTIONS,
  FLUSH_PLATE_COLOR_DESCRIPTIONS,
  FLUSH_PLATE_DESCRIPTIONS,
  LIGHTING_TYPE_DESCRIPTIONS,
  SANITARY_COLOR_DESCRIPTIONS,
  SHOWER_DRAIN_DESCRIPTIONS,
  SHOWER_GLASS_DESCRIPTIONS,
  SHOWER_HEAD_DESCRIPTIONS,
  SHOWER_NICHE_DESCRIPTIONS,
  SHOWER_PROFILE_DESCRIPTIONS,
  SHOWER_TRAY_DESCRIPTIONS,
  SHOWER_TYPE_DESCRIPTIONS,
  TILE_EFFECT_DESCRIPTIONS,
  TOWEL_WARMER_TYPE_DESCRIPTIONS,
  VANITY_MIRROR_DESCRIPTIONS,
  VANITY_STYLE_DESCRIPTIONS,
  VANITY_TOP_DESCRIPTIONS,
} from "../../../shared/render-bathroom/promptFragments.ts";
import { DEFAULT_BATHROOM_CONFIG } from "@/components/render-bagno/defaultBathroomConfig";
import { buildBathroomRenderConfig } from "../../../shared/render-bathroom/bathroomRenderConfig.ts";
import {
  etichetteDiFormaConColore,
  fileMancanti,
  fotoBnADColori,
  fotoColoriInGrigio,
  miniatureMancanti,
} from "../lib/referenceGuards";

const TABELLE = Object.values(BATHROOM_PHOTO_TABLES);
const ruoli = (refs: Array<{ label: string }>) => refs.map((r) => r.label.split(" — ")[0]);

/** Le opzioni vere del form: le chiavi delle descrizioni che il prompt sa scrivere. */
const OPZIONI: Record<string, string[]> = {
  "doccia.tipo": Object.keys(SHOWER_TYPE_DESCRIPTIONS),
  "doccia.box_vetro": Object.keys(SHOWER_GLASS_DESCRIPTIONS),
  "doccia.profilo": Object.keys(SHOWER_PROFILE_DESCRIPTIONS),
  "doccia.piatto": Object.keys(SHOWER_TRAY_DESCRIPTIONS),
  "doccia.soffione": Object.keys(SHOWER_HEAD_DESCRIPTIONS),
  "doccia.nicchia": Object.keys(SHOWER_NICHE_DESCRIPTIONS),
  "doccia.scarico": Object.keys(SHOWER_DRAIN_DESCRIPTIONS),
  "vasca.tipo": Object.keys(BATHTUB_TYPE_DESCRIPTIONS),
  "vasca.materiale": Object.keys(BATHTUB_MATERIAL_DESCRIPTIONS),
  "vasca.rubinetteria_vasca": Object.keys(BATHTUB_FAUCET_DESCRIPTIONS),
  "vasca.parete_doccia": Object.keys(BATH_SCREEN_DESCRIPTIONS),
  "vanity.stile": Object.keys(VANITY_STYLE_DESCRIPTIONS),
  "vanity.piano": Object.keys(VANITY_TOP_DESCRIPTIONS),
  "vanity.lavabo": Object.keys(BASIN_DESCRIPTIONS),
  "vanity.specchio": Object.keys(VANITY_MIRROR_DESCRIPTIONS),
  // SANITARY_TYPE_DESCRIPTIONS ha anche «back_to_wall», che il form non offre.
  "sanitari.tipo_wc": ["sospeso", "rimless_sospeso", "a_terra"],
  "sanitari.tipo_bidet": ["sospeso", "a_terra"],
  "sanitari.piastra_wc": Object.keys(FLUSH_PLATE_DESCRIPTIONS),
  "sanitari.piastra_wc_colore": Object.keys(FLUSH_PLATE_COLOR_DESCRIPTIONS),
  "sanitari.colore": Object.keys(SANITARY_COLOR_DESCRIPTIONS),
  "rubinetteria.stile": Object.keys(FAUCET_STYLE_DESCRIPTIONS),
  "rubinetteria.finitura": Object.keys(FAUCET_FINISH_DESCRIPTIONS),
  "termoarredo.tipo": Object.keys(TOWEL_WARMER_TYPE_DESCRIPTIONS),
  "illuminazione_tipo": Object.keys(LIGHTING_TYPE_DESCRIPTIONS),
  "piastrelle.effetto": Object.keys(TILE_EFFECT_DESCRIPTIONS),
};

/**
 * Foto di MATERIA davvero neutre (scarto cromatico ≤ 10): cromo, acciaio, nero opaco,
 * ceramica e smalto bianchi, marmi bianco/nero, cemento e pietre grigie, vetro fumé o
 * puntinato. Sono a colori di proposito: il loro colore È il grigio.
 */
const MATERIE_NEUTRE = [
  "Miscelatore-Da-Lavabo-Cromato-Moderno.webp", "Miscelatore-Da-Lavabo-Nero-Opaco.webp", "Miscelatore-Monocomando-In-Acciaio-Spazzolato.webp",
  "Porta-Doccia-In-Vetro-Senza-Cornice.webp", "Pannello-Doccia-In-Vetro-Fume-Traslucido.webp", "Vetro-Doccia-Puntinato-Sfumato.webp",
  "WC-Sospeso-In-Ceramica-Bianca.webp", "Smalto-Bianco-Lucido-Su-Ghisa.webp", "Piano-In-Quarzo-Grigio-Chiaro-Lucidato.webp",
  "Piastrelle-In-Marmo-Carrara-Lucido.webp", "Piastrelle-In-Marmo-Statuario.webp", "Piastrelle-In-Marmo-Marquinia-Griglia-2x2.webp",
  "Piastrelle-Effetto-Cemento-Grigio-Opaco.webp", "Piastrelle-Antracite-Effetto-Cemento.webp", "Piastrelle-In-Basalto-Scuro.webp",
  "Ardesia-Naturale-Color-Carbone.webp", "Mosaico-Esagonale-Bianco-Lucido.webp",
].map((f) => `${BATHROOM_FOLDER}/${f}`);

/** Configurazione con tutte le sezioni accese (ciò che il form scrive in legacy_config). */
function tuttoAcceso(): BathroomReferenceConfig {
  return {
    sostituzione: { piastrelle_parete: true, pavimento: true, doccia: true, vasca: true, mobile_bagno: true, sanitari: true, rubinetteria: true },
    doccia: { attivo: true, tipo: "walk_in", box_vetro: "fume", profilo: "nero_opaco", piatto: "filo_pavimento", soffione: "pioggia_soffitto" },
    vasca: { attivo: true, tipo: "freestanding_ovale", materiale: "solid_surface", rubinetteria_vasca: "a_pavimento" },
    vanity: { attivo: true, stile: "a_terra_industrial", piano: "quarzo", lavabo: "appoggio_ovale", specchio: "tondo" },
    sanitari: { attivo: true, azione_wc: "sostituisci", tipo_wc: "sospeso", azione_bidet: "sostituisci", tipo_bidet: "sospeso", colore: "nero_opaco", piastra_wc: "tonda_soft" },
    rubinetteria: { attivo: true, finitura: "oro_rosa", stile: "industrial" },
    piastrelle_parete: { attivo: true, effetto: "zellige" },
    pavimento: { attivo: true, effetto: "travertino" },
  };
}

describe("foto di riferimento del bagno: file e colori", () => {
  it("ogni file dichiarato esiste su disco, con la sua miniatura", () => {
    expect(listBathroomReferencePaths().length).toBeGreaterThan(60);
    expect(fileMancanti(...TABELLE)).toEqual([]);
    expect(miniatureMancanti(...TABELLE)).toEqual([]);
  });

  it("nessuna etichetta di forma (B/N) parla di colore o finitura", () => {
    expect(etichetteDiFormaConColore(...TABELLE)).toEqual([]);
  });

  it("le foto di forma sono davvero in grigio, quelle di materia davvero a colori (o neutre per natura)", async () => {
    expect(await fotoBnADColori(...TABELLE)).toEqual([]);
    expect(await fotoColoriInGrigio(MATERIE_NEUTRE, ...TABELLE)).toEqual([]);
  }, 60_000);

  it("forma in B/N e materia a colori: le tabelle di forma hanno solo foto B/N, quelle di materia solo a colori", () => {
    const FORMA = ["doccia.tipo", "doccia.piatto", "doccia.soffione", "doccia.nicchia", "doccia.scarico", "vasca.tipo", "vasca.rubinetteria_vasca", "vasca.parete_doccia", "vanity.stile", "vanity.lavabo", "vanity.specchio", "sanitari.tipo_wc", "sanitari.tipo_bidet", "sanitari.piastra_wc", "rubinetteria.stile", "termoarredo.tipo", "illuminazione_tipo"];
    const sbagliate: string[] = [];
    for (const [campo, tabella] of Object.entries(BATHROOM_PHOTO_TABLES)) {
      for (const [chiave, e] of Object.entries(tabella)) {
        if (isBlackAndWhite(e) !== FORMA.includes(campo)) sbagliate.push(`${campo}.${chiave}: ${e.filename}`);
      }
    }
    expect(sbagliate).toEqual([]);
  });

  it("i testi sono brevi (≤ 160 caratteri) e in cartella bathroom", () => {
    for (const tabella of TABELLE) {
      for (const e of Object.values(tabella)) {
        expect(e.text.length, e.filename).toBeLessThanOrEqual(160);
        expect(e.folder).toBe(BATHROOM_FOLDER);
      }
    }
  });
});

describe("foto di riferimento del bagno: opzioni del form e manifest", () => {
  it("ogni opzione vera ha una foto o sta in SENZA_FOTO col motivo (e nessuna sta in entrambi)", () => {
    const scoperte: string[] = [];
    const doppie: string[] = [];
    for (const [campo, valori] of Object.entries(OPZIONI)) {
      const tabella = (BATHROOM_PHOTO_TABLES as Record<string, Record<string, unknown>>)[campo] ?? {};
      for (const v of valori) {
        const motivo = SENZA_FOTO[campo]?.[v];
        if (!tabella[v] && !motivo) scoperte.push(`${campo}=${v}`);
        if (tabella[v] && motivo) doppie.push(`${campo}=${v}`);
      }
    }
    expect(scoperte).toEqual([]);
    expect(doppie).toEqual([]);
    // Le 29 tinte/effetti: 22 con foto, le 7 tinte unite senza.
    expect(Object.keys(TILE_EFFECT_PHOTOS)).toHaveLength(22);
    expect(Object.keys(SENZA_FOTO["piastrelle.effetto"]).every((k) => k.startsWith("mono_"))).toBe(true);
  });

  it("le tabelle non hanno chiavi che il form non offre", () => {
    const orfane: string[] = [];
    for (const [campo, tabella] of Object.entries(BATHROOM_PHOTO_TABLES)) {
      for (const chiave of Object.keys(tabella)) if (!OPZIONI[campo]?.includes(chiave)) orfane.push(`${campo}.${chiave}`);
    }
    expect(orfane).toEqual([]);
  });

  it("ogni voce «bagno» del manifest ha la sua opzione e la tabella usa uno dei suoi file (eccezioni scritte)", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "scripts", "render-references", "manifest.json"), "utf8")) as {
      voci: Array<{ modulo: string; dim: string; valore: string; file: string[] }>;
    };
    const CAMPO: Record<string, string> = {
      doccia_tipo: "doccia.tipo", doccia_vetro: "doccia.box_vetro", doccia_profilo: "doccia.profilo", doccia_piatto: "doccia.piatto",
      doccia_soffione: "doccia.soffione", vasca_tipo: "vasca.tipo", vasca_materiale: "vasca.materiale", vasca_rubinetto: "vasca.rubinetteria_vasca",
      mobile_stile: "vanity.stile", mobile_piano: "vanity.piano", lavabo_tipo: "vanity.lavabo", specchio_tipo: "vanity.specchio",
      wc_tipo: "sanitari.tipo_wc", sanitari_colore: "sanitari.colore", bidet_tipo: "sanitari.tipo_bidet", placca_stile: "sanitari.piastra_wc",
      rubinetto_finitura: "rubinetteria.finitura", rubinetto_stile: "rubinetteria.stile", piastrella_effetto: "piastrelle.effetto",
    };
    // Mappa per significato (vedi l'intestazione di bathroomReferences.ts): l'ardesia a spacco
    // del manifest sta sotto «ardesia», ma nel codice è «pietra_ardesia».
    const ECCEZIONI: Record<string, string> = { "piastrelle.effetto=pietra_ardesia": "bathroom/Ardesia-Naturale-Color-Carbone.webp" };
    const voci = manifest.voci.filter((v) => v.modulo === "bagno");
    expect(voci).toHaveLength(85);
    const errori: string[] = [];
    for (const v of voci) {
      const campo = CAMPO[v.dim];
      if (!campo) { errori.push(`dimensione senza campo: ${v.dim}`); continue; }
      const entry = (BATHROOM_PHOTO_TABLES as Record<string, Record<string, { folder: string; filename: string }>>)[campo][v.valore];
      if (!entry) { errori.push(`${campo}=${v.valore}: nessuna foto`); continue; }
      const usato = `${entry.folder}/${entry.filename}`;
      const atteso = ECCEZIONI[`${campo}=${v.valore}`];
      if (atteso ? usato !== atteso : !v.file.includes(usato)) errori.push(`${campo}=${v.valore}: ${usato} non è tra ${v.file.join(", ")}`);
    }
    expect(errori).toEqual([]);
  });
});

describe("foto di riferimento del bagno: scelta, priorità e tetto", () => {
  it("niente sostituzioni → nessuna foto", () => {
    expect(collectBathroomReferenceImages({ sostituzione: {}, doccia: { attivo: false, tipo: "walk_in" } })).toEqual([]);
  });

  it("stesso gating del builder: servono sia sostituzione.<sezione> sia <sezione>.attivo", () => {
    // Prima bastava uno dei due: la sezione spenta nel prompt mandava lo stesso la sua foto.
    expect(collectBathroomReferenceImages({ sostituzione: { doccia: true }, doccia: { attivo: false, tipo: "walk_in" } })).toEqual([]);
    expect(collectBathroomReferenceImages({ sostituzione: { doccia: false }, doccia: { attivo: true, tipo: "walk_in" } })).toEqual([]);
    expect(ruoli(collectBathroomReferenceImages({ sostituzione: { doccia: true }, doccia: { attivo: true, tipo: "walk_in" } }))).toEqual(["SHOWER TYPE TARGET"]);
  });

  it("doccia + vasca + rivestimento: tre foto, prima la struttura (il tetto è passato da 2 a 3, la vasca non è più esclusa dalla doccia)", () => {
    // Prima: max 2 e una sola tra doccia/vasca/sanitari/mobile → [doccia, rivestimento].
    const refs = collectBathroomReferenceImages({ sostituzione: { doccia: true, vasca: true, piastrelle_parete: true }, doccia: { attivo: true, tipo: "walk_in" }, vasca: { attivo: true, tipo: "freestanding_ovale" }, piastrelle_parete: { attivo: true, effetto: "marmo_carrara" } });
    expect(ruoli(refs)).toEqual(["SHOWER TYPE TARGET", "BATHTUB TYPE TARGET", "WALL TILE EFFECT TARGET"]);
  });

  it("tutto acceso: massimo 3, struttura → superfici grandi (parete prima del pavimento)", () => {
    const refs = collectBathroomReferenceImages(tuttoAcceso());
    expect(refs).toHaveLength(3);
    expect(ruoli(refs)).toEqual(["SHOWER TYPE TARGET", "BATHTUB TYPE TARGET", "WALL TILE EFFECT TARGET"]);
    const senzaVasca = tuttoAcceso();
    senzaVasca.sostituzione!.vasca = false;
    expect(ruoli(collectBathroomReferenceImages(senzaVasca))).toEqual(["SHOWER TYPE TARGET", "WALL TILE EFFECT TARGET", "FLOOR TILE EFFECT TARGET"]);
  });

  it("stesso effetto su parete e pavimento: una foto sola che vale per tutti e due, e il posto libero va al mobile", () => {
    const cfg = tuttoAcceso();
    cfg.sostituzione!.vasca = false;
    cfg.pavimento!.effetto = "zellige";
    const refs = collectBathroomReferenceImages(cfg);
    expect(ruoli(refs)).toEqual(["SHOWER TYPE TARGET", "WALL AND FLOOR TILE EFFECT TARGET", "VANITY STYLE TARGET"]);
    expect(refs.filter((r) => r.filename === TILE_EFFECT_PHOTOS.zellige.filename)).toHaveLength(1);
  });

  it("solo sanitari: WC e bidet prima della placca; il colore non bianco prima della placca, il bianco per ultimo", () => {
    const sanitari = (colore: string) => collectBathroomReferenceImages({ sostituzione: { sanitari: true }, sanitari: { attivo: true, azione_wc: "sostituisci", tipo_wc: "rimless_sospeso", azione_bidet: "sostituisci", tipo_bidet: "sospeso", colore, piastra_wc: "vetro_minimal" } });
    expect(ruoli(sanitari("nero_opaco"))).toEqual(["TOILET TYPE TARGET", "BIDET TYPE TARGET", "SANITARY CERAMIC COLOUR TARGET"]);
    expect(ruoli(sanitari("bianco"))).toEqual(["TOILET TYPE TARGET", "BIDET TYPE TARGET", "FLUSH PLATE TARGET"]);
  });

  it("sanitari: WC sospeso nuovo → foto del WC e della placca; WC mantenuto → niente WC né placca", () => {
    // Prima la placca non aveva foto: c'era solo il WC (toHaveLength(1)).
    const refs = collectBathroomReferenceImages({ sostituzione: { sanitari: true }, sanitari: { attivo: true, azione_wc: "sostituisci", tipo_wc: "rimless_sospeso", azione_bidet: "mantieni" } });
    expect(ruoli(refs)).toEqual(["TOILET TYPE TARGET", "FLUSH PLATE TARGET"]);
    expect(refs[0].label).toMatch(/^TOILET TYPE TARGET — rimless_sospeso/);
    const mantiene = collectBathroomReferenceImages({ sostituzione: { sanitari: true }, sanitari: { attivo: true, azione_wc: "mantieni", tipo_wc: "sospeso", azione_bidet: "aggiungi", tipo_bidet: "a_terra", colore: "nero_opaco" } });
    // Il bidet aggiunto a terra c'è; il colore no (le sue foto mostrano un WC sospeso).
    expect(ruoli(mantiene)).toEqual(["BIDET TYPE TARGET"]);
    expect(mantiene[0].label).toMatch(/^BIDET TYPE TARGET — a_terra/);
  });

  it("WC a terra: niente placca e niente foto del colore (forma sbagliata), etichetta che esclude la cassetta della foto", () => {
    const refs = collectBathroomReferenceImages({ sostituzione: { sanitari: true }, sanitari: { attivo: true, azione_wc: "sostituisci", tipo_wc: "a_terra", azione_bidet: "rimuovi", colore: "grigio_chiaro", piastra_wc: "tonda_soft" } });
    expect(ruoli(refs)).toEqual(["TOILET TYPE TARGET"]);
    expect(refs[0].label).toMatch(/not the tank in the photo/);
  });

  it("mobile: stile, lavabo, specchio (retroilluminato se non scelto) e piano; la stessa foto non entra due volte", () => {
    const refs = collectBathroomReferenceImages({ sostituzione: { mobile_bagno: true }, vanity: { attivo: true, stile: "sospeso_moderno", lavabo: "integrato", piano: "quarzo" } });
    // Mobile sospeso moderno e lavabo integrato sono la stessa foto: resta quella del mobile.
    expect(ruoli(refs)).toEqual(["VANITY STYLE TARGET", "MIRROR TYPE TARGET", "VANITY TOP MATERIAL TARGET"]);
    expect(refs[1].label).toMatch(/^MIRROR TYPE TARGET — retroilluminato/);
    expect(new Set(refs.map((r) => r.filename)).size).toBe(refs.length);
    // Prima il mobile sospeso non aveva foto (solo il catalogo dell'azienda); ora sì.
    expect(collectBathroomReferenceImages({ sostituzione: { mobile_bagno: true }, vanity: { attivo: true, stile: "a_terra_classico", piano: "legno", lavabo: "semincasso", specchio: "verticale" } })[0].label).toMatch(/^VANITY STYLE TARGET — a_terra_classico/);
  });

  it("il prodotto del catalogo dell'azienda toglie la foto generica dello stesso elemento e libera lo slot", () => {
    const cfg = tuttoAcceso();
    cfg.sostituzione!.vasca = false;
    const conCatalogo = collectBathroomReferenceImages(cfg, { categorieCatalogo: ["box_doccia", "piastrella_parete"] });
    expect(ruoli(conCatalogo)).toEqual(["FLOOR TILE EFFECT TARGET", "VANITY STYLE TARGET", "TOILET TYPE TARGET"]);
    // Col catalogo che copre solo la parete, un effetto uguale resta come foto del pavimento.
    const uguale = tuttoAcceso();
    uguale.pavimento!.effetto = "zellige";
    expect(ruoli(collectBathroomReferenceImages(uguale, { categorieCatalogo: ["piastrella_parete"] }))).toContain("FLOOR TILE EFFECT TARGET");
  });

  it("rubinetti: stile (forma) prima della finitura (materia)", () => {
    const refs = collectBathroomReferenceImages({ sostituzione: { rubinetteria: true }, rubinetteria: { attivo: true, finitura: "nero_opaco", stile: "vintage_crosshead" } });
    expect(ruoli(refs)).toEqual(["FAUCET STYLE TARGET", "FAUCET FINISH TARGET"]);
  });

  it("chiavi sconosciute o tinte unite: nessuna foto, nessun errore", () => {
    expect(collectBathroomReferenceImages({ sostituzione: { piastrelle_parete: true, pavimento: true }, piastrelle_parete: { attivo: true, effetto: "mono_verde_salvia" }, pavimento: { attivo: true, effetto: "terrazzo" } })).toEqual([]);
  });
});

describe("foto di riferimento del bagno: etichette", () => {
  it("formato «RUOLO — chiave: testo. Cosa copiare»; B/N con la regola del bianco e nero, materia senza", () => {
    const refs = collectBathroomReferenceImages(tuttoAcceso());
    for (const r of refs) expect(r.label).toMatch(/^[A-Z ]+ — [a-z_]+: .+\. .+$/);
    const [doccia, vasca, parete] = refs;
    expect(doccia.label).toContain(BLACK_AND_WHITE_RULE);
    expect(vasca.label).toMatch(/not the faucet in the photo/);
    expect(vasca.label).toContain(BLACK_AND_WHITE_RULE);
    expect(parete.label).not.toContain("black-and-white");
    expect(parete.label).toMatch(/tile size, laying pattern and grout come from the written specification/);
  });

  it("l'URL punta alla cartella bathroom", () => {
    const [ref] = collectBathroomReferenceImages({ sostituzione: { doccia: true }, doccia: { attivo: true, tipo: "semicircolare" } });
    expect(ref.url).toMatch(/\/render-references\/bathroom\/Box-Doccia-Semicircolare-In-Vetro-Curvo-BN\.webp$/);
  });
});

describe("foto di riferimento del bagno: il livello giusto del payload", () => {
  it("il wizard salva il payload v2: i campi del form stanno in legacy_config, non al livello alto", () => {
    const config = structuredClone(DEFAULT_BATHROOM_CONFIG);
    config.sostituzione.doccia = true;
    config.doccia.attivo = true;
    const payload = JSON.parse(JSON.stringify(buildBathroomRenderConfig(config)));
    // Al livello alto del payload v2 non c'è nessun campo del form: zero foto.
    expect(collectBathroomReferenceImages(payload)).toEqual([]);
    // Da legacy_config (quello che legge l'edge) arrivano doccia e piastrelle del default.
    expect(ruoli(collectBathroomReferenceImages(payload.legacy_config))).toEqual(["SHOWER TYPE TARGET", "WALL TILE EFFECT TARGET", "FLOOR TILE EFFECT TARGET"]);
  });
});

describe("foto di riferimento del bagno: termoarredo, nicchia, scarico, parete sopravasca, luci (05/10/2026)", () => {
  const termoarredo = (azione: string, tipo?: string) =>
    collectBathroomReferenceImages({ sostituzione: { termoarredo: true }, termoarredo: { attivo: true, azione, tipo } });
  const nicchia = (n?: string) =>
    collectBathroomReferenceImages({ sostituzione: { doccia: true }, doccia: { attivo: true, nicchia: n } });
  const scarico = (s?: string, extra: { tipo?: string; piatto?: string } = {}) =>
    collectBathroomReferenceImages({ sostituzione: { doccia: true }, doccia: { attivo: true, scarico: s, ...extra } });
  const luci = (tipo?: string | null, acceso = true) =>
    collectBathroomReferenceImages({ sostituzione: { illuminazione: acceso }, illuminazione_tipo: tipo });
  const parete = (tipo: string | undefined, schermo?: string, vasca = true) =>
    collectBathroomReferenceImages({ sostituzione: { vasca }, vasca: { attivo: vasca, tipo, parete_doccia: schermo } });

  const NUOVE = {
    "termoarredo.tipo": TOWEL_WARMER_PHOTOS,
    "doccia.nicchia": SHOWER_NICHE_PHOTOS,
    "doccia.scarico": SHOWER_DRAIN_PHOTOS,
    "vasca.parete_doccia": BATH_SCREEN_PHOTOS,
    "illuminazione_tipo": LIGHTING_PHOTOS,
  } as const;

  it("cinque tabelle nuove con una foto per ogni opzione che ha una forma da mostrare; canalina e parete girevole restano senza, col motivo", () => {
    expect(Object.keys(TOWEL_WARMER_PHOTOS)).toEqual(["scaletta", "piastra_design", "tubi_verticali"]);
    expect(Object.keys(SHOWER_NICHE_PHOTOS)).toEqual(["verticale", "orizzontale"]);
    expect(Object.keys(SHOWER_DRAIN_PHOTOS)).toEqual(["piletta"]);
    expect(Object.keys(BATH_SCREEN_PHOTOS)).toEqual(["fissa"]);
    expect(Object.keys(LIGHTING_PHOTOS)).toEqual(["faretti_incasso", "led_lineare", "applique_specchio", "plafoniera"]);
    for (const [campo, tabella] of Object.entries(NUOVE)) {
      expect(BATHROOM_PHOTO_TABLES[campo as keyof typeof BATHROOM_PHOTO_TABLES], campo).toBe(tabella);
      for (const e of Object.values(tabella)) expect(isBlackAndWhite(e), e.filename).toBe(true);
    }
    // I due file del titolare erano vuoti (0 byte): si rigenerano. Nel frattempo restano senza foto, e il motivo dice quale.
    expect(Object.keys(SENZA_FOTO["doccia.scarico"])).toEqual(["canalina"]);
    expect(SENZA_FOTO["doccia.scarico"].canalina).toMatch(/Canalina-Doccia-Lineare-A-Filo-Parete/);
    expect(Object.keys(SENZA_FOTO["vasca.parete_doccia"])).toEqual(["nessuna", "girevole"]);
    expect(SENZA_FOTO["vasca.parete_doccia"].girevole).toMatch(/Parete-Vasca-Girevole-In-Vetro/);
    expect(Object.keys(SENZA_FOTO["doccia.nicchia"])).toEqual(["nessuna"]);
  });

  it("ogni etichetta ha il formato «RUOLO — chiave: testo. Copy only…», dice una cosa sola da copiare e porta la regola del bianco e nero", () => {
    const refs = [
      ...["scaletta", "piastra_design", "tubi_verticali"].flatMap((t) => termoarredo("aggiungi", t)),
      ...["verticale", "orizzontale"].flatMap((n) => nicchia(n)),
      ...scarico("piletta"),
      ...["faretti_incasso", "led_lineare", "applique_specchio", "plafoniera"].flatMap((l) => luci(l)),
      ...parete(undefined, "fissa"),
    ];
    expect(refs).toHaveLength(11);
    expect(new Set(refs.map((r) => r.filename)).size).toBe(11);
    for (const r of refs) {
      expect(r.label, r.filename).toMatch(/^[A-Z ]+ — [a-z_]+: .+\. Copy only .+/);
      expect(r.label, r.filename).toContain(BLACK_AND_WHITE_RULE);
      expect(r.folder).toBe(BATHROOM_FOLDER);
      expect(r.filename).toMatch(/-BN\.webp$/);
    }
  });

  it("termoarredo: la foto del tipo parte solo quando si monta un modello nuovo (sostituisci, aggiungi), mai con «rimuovi»", () => {
    for (const azione of ["sostituisci", "aggiungi"]) {
      const refs = termoarredo(azione, "tubi_verticali");
      expect(refs, azione).toHaveLength(1);
      expect(refs[0].label).toMatch(/^TOWEL WARMER TARGET — tubi_verticali: vertical-tube towel warmer/);
      expect(refs[0].url).toMatch(/\/bathroom\/Termoarredo-A-Tubi-Verticali-BN\.webp$/);
    }
    expect(termoarredo("rimuovi", "tubi_verticali")).toEqual([]);
    expect(termoarredo("", "scaletta")).toEqual([]);
    // Stesso gating del builder (buildTowelWarmerSpec): servono sia sostituzione.termoarredo sia termoarredo.attivo.
    expect(collectBathroomReferenceImages({ sostituzione: { termoarredo: true }, termoarredo: { attivo: false, azione: "sostituisci", tipo: "scaletta" } })).toEqual([]);
    expect(collectBathroomReferenceImages({ sostituzione: { termoarredo: false }, termoarredo: { attivo: true, azione: "sostituisci", tipo: "scaletta" } })).toEqual([]);
    expect(collectBathroomReferenceImages({ sostituzione: { termoarredo: true } })).toEqual([]);
    // Senza un tipo valido il builder descrive la scaletta: anche la foto è la scaletta.
    expect(termoarredo("aggiungi")[0].label).toMatch(/^TOWEL WARMER TARGET — scaletta/);
    expect(termoarredo("aggiungi", "toString")[0].label).toMatch(/^TOWEL WARMER TARGET — scaletta/);
    // Dalla foto si copia il termoarredo, non la stanza né la misura.
    expect(termoarredo("sostituisci", "piastra_design")[0].label).toMatch(/not the room around it; its size and position follow the written specification/);
  });

  it("nicchia nella parete: verticale e orizzontale hanno la loro foto; «nessuna» e non indicata no; solo con la doccia che cambia", () => {
    expect(ruoli(nicchia("verticale"))).toEqual(["SHOWER NICHE TARGET"]);
    expect(nicchia("verticale")[0].url).toMatch(/\/bathroom\/Nicchia-Doccia-Verticale-Con-Ripiano-BN\.webp$/);
    expect(nicchia("orizzontale")[0].url).toMatch(/\/bathroom\/Nicchia-Doccia-Orizzontale-Lunga-BN\.webp$/);
    expect(nicchia("nessuna")).toEqual([]);
    expect(nicchia(undefined)).toEqual([]);
    expect(nicchia("tonda")).toEqual([]);
    expect(collectBathroomReferenceImages({ sostituzione: { doccia: true }, doccia: { attivo: false, nicchia: "verticale" } })).toEqual([]);
    expect(collectBathroomReferenceImages({ sostituzione: { doccia: false }, doccia: { attivo: true, nicchia: "verticale" } })).toEqual([]);
    // Le foto mostrano anche gli accessori della doccia accanto alla nicchia: l'etichetta dice di non copiarli.
    expect(nicchia("orizzontale")[0].label).toMatch(/not the shower fittings, glass or wall tiles in the photo/);
  });

  it("scarico: la piletta ha la foto, la canalina non ancora; una canalina su un piatto semicircolare è una piletta, come scrive il builder", () => {
    expect(ruoli(scarico("piletta"))).toEqual(["SHOWER DRAIN TARGET"]);
    expect(scarico("piletta")[0].label).toMatch(/^SHOWER DRAIN TARGET — piletta: square point drain/);
    expect(scarico("piletta")[0].url).toMatch(/\/bathroom\/Piletta-Doccia-Quadrata-A-Filo-BN\.webp$/);
    expect(scarico("canalina")).toEqual([]);
    expect(scarico(undefined)).toEqual([]);
    expect(scarico("tombino")).toEqual([]);
    const semicircolare = scarico("canalina", { tipo: "semicircolare" });
    expect(ruoli(semicircolare)).toEqual(["SHOWER TYPE TARGET", "SHOWER DRAIN TARGET"]);
    expect(semicircolare[1].label).toMatch(/^SHOWER DRAIN TARGET — piletta/);
    expect(ruoli(scarico("canalina", { tipo: "walk_in" }))).toEqual(["SHOWER TYPE TARGET"]);
  });

  it("con uno scarico scelto la foto del piatto non porta più il suo scarico; senza, vale com'era", () => {
    const piatto = (p: string, s?: string) =>
      collectBathroomReferenceImages({ sostituzione: { doccia: true }, doccia: { attivo: true, piatto: p, scarico: s } })
        .find((r) => r.label.startsWith("SHOWER TRAY TARGET"))!.label;
    // La foto del piatto rialzato mostra uno scarico tondo, quella della pietra uno a griglia, quella a filo una canalina.
    expect(piatto("rialzato_3cm")).toMatch(/Copy the shape and construction only/);
    expect(piatto("rialzato_3cm")).not.toContain("not its drain");
    expect(piatto("rialzato_3cm", "piletta")).toContain("not its drain: the drain follows the written drain specification");
    expect(piatto("rialzato_5cm", "canalina")).toContain("not its drain");
    expect(piatto("pietra", "piletta")).toContain("not its drain");
    expect(piatto("filo_pavimento")).toContain("floor-level construction (no step, no raised edge), not the room around it");
    expect(piatto("filo_pavimento")).not.toContain("not the drain");
    expect(piatto("filo_pavimento", "piletta")).toContain("not the drain or the room around it");
  });

  it("illuminazione: basta l'interruttore e un tipo scelto; una foto per tipo; testo libero, tipo vuoto o interruttore spento → nessuna foto", () => {
    const FILE: Record<string, string> = {
      faretti_incasso: "Faretti-A-Incasso-Soffitto-Bagno-BN.webp",
      led_lineare: "Profilo-LED-Lineare-A-Soffitto-Bagno-BN.webp",
      applique_specchio: "Applique-Ai-Lati-Dello-Specchio-BN.webp",
      plafoniera: "Plafoniera-Tonda-A-Soffitto-Bagno-BN.webp",
    };
    for (const [tipo, file] of Object.entries(FILE)) {
      const refs = luci(tipo);
      expect(refs, tipo).toHaveLength(1);
      expect(refs[0].label).toMatch(new RegExp(`^LIGHTING TARGET — ${tipo}: `));
      expect(refs[0].url).toMatch(new RegExp(`/bathroom/${file.replace(/\./g, "\\.")}$`));
      // Ogni foto mostra il corpo illuminante dentro un bagno intero: l'etichetta dice di copiare solo lui.
      expect(refs[0].label).toMatch(/Copy only the .*(light|downlights|LED)/);
    }
    expect(luci("led_lineare")[0].label).toMatch(/not the furniture, lit niche, under-cabinet glow or other lights in the photo/);
    expect(luci("faretti_incasso", false)).toEqual([]);
    expect(luci("")).toEqual([]);
    expect(luci(undefined)).toEqual([]);
    expect(luci(null)).toEqual([]);
    expect(luci("due lampade a sospensione sopra il lavabo")).toEqual([]);
    expect(luci("constructor")).toEqual([]);
    // Come il builder, il tipo si legge tagliando gli spazi.
    expect(luci("  plafoniera  ")).toHaveLength(1);
  });

  it("parete sopravasca: la fissa ha la foto su una vasca contro parete; non su una freestanding, non «nessuna», non la girevole (foto non ancora arrivata)", () => {
    expect(ruoli(parete("incassata", "fissa"))).toEqual(["BATHTUB TYPE TARGET", "BATH SCREEN TARGET"]);
    expect(parete(undefined, "fissa")[0].url).toMatch(/\/bathroom\/Parete-Vasca-Fissa-In-Vetro-BN\.webp$/);
    for (const tipo of ["back_to_wall", "incassata", "angolare"]) expect(ruoli(parete(tipo, "fissa")), tipo).toContain("BATH SCREEN TARGET");
    for (const tipo of ["freestanding_ovale", "freestanding_rettangolare"]) expect(ruoli(parete(tipo, "fissa")), tipo).toEqual(["BATHTUB TYPE TARGET"]);
    expect(ruoli(parete("incassata", "girevole"))).toEqual(["BATHTUB TYPE TARGET"]);
    expect(ruoli(parete("incassata", "nessuna"))).toEqual(["BATHTUB TYPE TARGET"]);
    expect(ruoli(parete("incassata", undefined))).toEqual(["BATHTUB TYPE TARGET"]);
    expect(parete(undefined, "fissa", false)).toEqual([]);
    // La foto mostra una vasca con i suoi rubinetti: la forma della vasca arriva dal tipo, non da qui.
    expect(parete(undefined, "fissa")[0].label).toMatch(/not the tub, taps or tiles in the photo; the tub follows the bathtub type/);
  });

  it("priorità: gli elementi aggiunti entrano dopo i dettagli di prima, dal più grande al più piccolo, e prima del bianco dei sanitari", () => {
    const nuove = (): BathroomReferenceConfig => ({
      sostituzione: { doccia: true, vasca: true, termoarredo: true, illuminazione: true },
      doccia: { attivo: true, nicchia: "verticale", scarico: "piletta" },
      vasca: { attivo: true, parete_doccia: "fissa" },
      termoarredo: { attivo: true, azione: "aggiungi", tipo: "scaletta" },
      illuminazione_tipo: "plafoniera",
    });
    // Tutte e cinque: il tetto è 3, restano fuori nicchia e scarico.
    expect(ruoli(collectBathroomReferenceImages(nuove()))).toEqual(["TOWEL WARMER TARGET", "BATH SCREEN TARGET", "LIGHTING TARGET"]);
    const senzaGrandi = nuove();
    senzaGrandi.sostituzione!.termoarredo = false;
    senzaGrandi.sostituzione!.vasca = false;
    expect(ruoli(collectBathroomReferenceImages(senzaGrandi))).toEqual(["LIGHTING TARGET", "SHOWER NICHE TARGET", "SHOWER DRAIN TARGET"]);

    // Dopo i dettagli che c'erano già (stile e finitura dei rubinetti).
    const rubinetti: BathroomReferenceConfig = {
      sostituzione: { rubinetteria: true, termoarredo: true, illuminazione: true },
      rubinetteria: { attivo: true, stile: "industrial", finitura: "oro_rosa" },
      termoarredo: { attivo: true, azione: "aggiungi", tipo: "scaletta" },
      illuminazione_tipo: "plafoniera",
    };
    expect(ruoli(collectBathroomReferenceImages(rubinetti))).toEqual(["FAUCET STYLE TARGET", "FAUCET FINISH TARGET", "TOWEL WARMER TARGET"]);

    // Il bianco dei sanitari resta l'ultimo di tutti: il termoarredo gli passa davanti, il colore non bianco no.
    const sanitari = (colore: string): BathroomReferenceConfig => ({
      sostituzione: { sanitari: true, termoarredo: true },
      sanitari: { attivo: true, azione_wc: "sostituisci", tipo_wc: "sospeso", azione_bidet: "mantieni", colore, piastra_wc: "tonda_soft" },
      termoarredo: { attivo: true, azione: "aggiungi", tipo: "scaletta" },
    });
    expect(ruoli(collectBathroomReferenceImages(sanitari("bianco")))).toEqual(["TOILET TYPE TARGET", "FLUSH PLATE TARGET", "TOWEL WARMER TARGET"]);
    expect(ruoli(collectBathroomReferenceImages(sanitari("nero_opaco")))).toEqual(["TOILET TYPE TARGET", "SANITARY CERAMIC COLOUR TARGET", "FLUSH PLATE TARGET"]);
  });

  it("il catalogo dell'azienda non toglie queste foto (nessuna categoria del catalogo bagno le copre) e gli slot liberi le tagliano per priorità", () => {
    const cfg: BathroomReferenceConfig = {
      sostituzione: { termoarredo: true, illuminazione: true },
      termoarredo: { attivo: true, azione: "sostituisci", tipo: "scaletta" },
      illuminazione_tipo: "faretti_incasso",
    };
    const tutte = ["mobile_bagno", "lavabo", "specchio", "wc", "bidet", "box_doccia", "piatto_doccia", "soffione", "vasca", "rubinetteria", "piastrella_parete", "pavimento"];
    expect(ruoli(collectBathroomReferenceImages(cfg, { categorieCatalogo: tutte }))).toEqual(["TOWEL WARMER TARGET", "LIGHTING TARGET"]);
  });
});

describe("foto di riferimento del bagno: gli elementi aggiunti seguono il prompt (payload v2 costruito dal builder)", () => {
  /** Costruisce il payload come il wizard e dà la specifica tecnica scritta nel prompt più le foto scelte da legacy_config. */
  const dalWizard = (modifica: (c: typeof DEFAULT_BATHROOM_CONFIG) => void, opzioni: { categorieCatalogo?: string[] } = {}) => {
    const config = structuredClone(DEFAULT_BATHROOM_CONFIG);
    config.sostituzione.piastrelle_parete = false;
    config.sostituzione.pavimento = false;
    modifica(config);
    const payload = JSON.parse(JSON.stringify(buildBathroomRenderConfig(config)));
    return { spec: payload.technical_specification, refs: collectBathroomReferenceImages(payload.legacy_config, opzioni) };
  };

  it("termoarredo: sostituisci o aggiungi → il prompt descrive il tipo e la foto è la sua; rimuovi → né l'uno né l'altra", () => {
    for (const azione of ["sostituisci", "aggiungi"] as const) {
      const monta = dalWizard((c) => {
        c.sostituzione.termoarredo = true;
        c.termoarredo = { attivo: true, azione, tipo: "piastra_design", finitura: "nero_opaco" };
      });
      expect(monta.spec.towelWarmer.typeLabel, azione).toMatch(/flat-panel design towel warmer/);
      expect(ruoli(monta.refs), azione).toEqual(["TOWEL WARMER TARGET"]);
      expect(monta.refs[0].label).toMatch(/^TOWEL WARMER TARGET — piastra_design/);
    }
    const toglie = dalWizard((c) => {
      c.sostituzione.termoarredo = true;
      c.termoarredo = { attivo: true, azione: "rimuovi", tipo: "piastra_design", finitura: "nero_opaco" };
    });
    expect(toglie.spec.towelWarmer.typeLabel).toBeNull();
    expect(toglie.refs).toEqual([]);
    // Interruttore acceso ma sezione spenta: il prompt non nomina il termoarredo e la foto non parte.
    const spento = dalWizard((c) => {
      c.sostituzione.termoarredo = true;
      c.termoarredo = { attivo: false, azione: "sostituisci", tipo: "scaletta", finitura: "bianco" };
    });
    expect(spento.spec.towelWarmer).toBeUndefined();
    expect(spento.refs).toEqual([]);
  });

  it("illuminazione: il prompt cambia le luci solo con un tipo scelto, e solo allora c'è la foto (un testo libero è valido per il prompt ma non ha foto)", () => {
    const led = dalWizard((c) => {
      c.sostituzione.illuminazione = true;
      c.illuminazione_tipo = "led_lineare";
    });
    expect(led.spec.lighting.replace).toBe(true);
    expect(ruoli(led.refs)).toEqual(["LIGHTING TARGET"]);
    const senzaTipo = dalWizard((c) => {
      c.sostituzione.illuminazione = true;
      c.illuminazione_tipo = "";
    });
    expect(senzaTipo.spec.lighting.replace).toBe(false);
    expect(senzaTipo.refs).toEqual([]);
    const libero = dalWizard((c) => {
      c.sostituzione.illuminazione = true;
      c.illuminazione_tipo = "due lampade a sospensione";
    });
    expect(libero.spec.lighting.replace).toBe(true);
    expect(libero.refs).toEqual([]);
  });

  it("nicchia e scarico: il prompt costruisce una piletta al posto di una canalina su un piatto semicircolare, e la foto è quella della piletta", () => {
    // Il catalogo copre tipo, vetro, profilo, piatto e soffione: restano solo nicchia e scarico, il resto non fa numero.
    const catalogoDoccia = { categorieCatalogo: ["box_doccia", "piatto_doccia", "soffione"] };
    const semicircolare = dalWizard((c) => {
      c.sostituzione.doccia = true;
      c.doccia.attivo = true;
      c.doccia.tipo = "semicircolare";
      c.doccia.nicchia = "orizzontale";
      c.doccia.scarico = "canalina";
    }, catalogoDoccia);
    expect(semicircolare.spec.shower.wallNicheRule).toMatch(/horizontal recessed niche/);
    expect(semicircolare.spec.shower.drainType).toMatch(/small square point drain/);
    expect(ruoli(semicircolare.refs)).toEqual(["SHOWER NICHE TARGET", "SHOWER DRAIN TARGET"]);
    expect(semicircolare.refs[1].label).toMatch(/^SHOWER DRAIN TARGET — piletta/);

    // Canalina su un walk-in: il prompt scrive la canalina, e la sua foto non c'è ancora.
    const canalina = dalWizard((c) => {
      c.sostituzione.doccia = true;
      c.doccia.attivo = true;
      c.doccia.nicchia = "nessuna";
      c.doccia.scarico = "canalina";
    }, catalogoDoccia);
    expect(canalina.spec.shower.drainType).toMatch(/slim linear channel drain/);
    expect(canalina.spec.shower.wallNiche).toBe(false);
    expect(canalina.refs).toEqual([]);

    // Niente indicato nel form: il prompt resta quello di prima e non parte nessuna foto in più.
    const nonIndicati = dalWizard((c) => {
      c.sostituzione.doccia = true;
      c.doccia.attivo = true;
    }, catalogoDoccia);
    expect(nonIndicati.spec.shower.wallNicheRule).toBeUndefined();
    expect(nonIndicati.refs).toEqual([]);
  });

  it("parete sopravasca: il prompt la monta solo su una vasca contro parete, e solo allora c'è la foto", () => {
    const contro = dalWizard((c) => {
      c.sostituzione.vasca = true;
      c.vasca = { ...c.vasca, attivo: true, tipo: "incassata", parete_doccia: "fissa" };
    });
    expect(contro.spec.bathtub.screenRule).toMatch(/fixed clear-glass bath screen/);
    expect(ruoli(contro.refs)).toContain("BATH SCREEN TARGET");
    const libera = dalWizard((c) => {
      c.sostituzione.vasca = true;
      c.vasca = { ...c.vasca, attivo: true, tipo: "freestanding_ovale", parete_doccia: "fissa" };
    });
    expect(libera.spec.bathtub.screenRule).toMatch(/no bath screen: a freestanding tub/);
    expect(ruoli(libera.refs)).not.toContain("BATH SCREEN TARGET");
    const girevole = dalWizard((c) => {
      c.sostituzione.vasca = true;
      c.vasca = { ...c.vasca, attivo: true, tipo: "incassata", parete_doccia: "girevole" };
    });
    expect(girevole.spec.bathtub.screenRule).toMatch(/hinged clear-glass bath screen/);
    expect(ruoli(girevole.refs)).not.toContain("BATH SCREEN TARGET");
  });
});
