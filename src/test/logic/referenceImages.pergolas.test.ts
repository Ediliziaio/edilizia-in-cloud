import { describe, expect, it } from "vitest";
import {
  PERGOLA_ANCHOR_PHOTOS,
  PERGOLA_COVER_PHOTOS,
  PERGOLA_LIGHTING_PHOTOS,
  PERGOLA_MATERIAL_PHOTOS,
  PERGOLA_MATERIAL_TONES,
  PERGOLA_SIDE_PHOTOS,
  PERGOLA_TYPE_PHOTOS,
  SENZA_FOTO_PERGOLE,
  collectPergolaReferenceImages,
  listPergolaReferencePaths,
  type PergolaReferenceInput,
} from "../../../shared/render-references/pergolaReferences.ts";
import {
  CHIUSURE_PERGOLA,
  COPERTURE_PERGOLA,
  LUCI_PERGOLA,
  MATERIALI_PERGOLA,
  TIPI_PERGOLA,
  type ConfigurazionePergole,
} from "../../../shared/render-pergole/types.ts";
import {
  etichetteDiFormaConColore,
  fileMancanti,
  fotoBnADColori,
  fotoColoriInGrigio,
  miniatureMancanti,
} from "../lib/referenceGuards";

const TABELLE = [PERGOLA_TYPE_PHOTOS, PERGOLA_COVER_PHOTOS, PERGOLA_SIDE_PHOTOS, PERGOLA_MATERIAL_PHOTOS, PERGOLA_LIGHTING_PHOTOS, PERGOLA_ANCHOR_PHOTOS];
// Gli ancoraggi a terra del form, da un Record sul tipo: se un valore entra nel tipo e non qui, TypeScript si ferma.
const ancoraggi: Record<NonNullable<ConfigurazionePergole["installazione"]["ancoraggio_a_terra"]>, true> = {
  pavimento: true, deck: true, prato_con_plinti: true, bordo_piscina: true, terrazzo: true,
};
const ANCORAGGI = Object.keys(ancoraggi);
const ruoli = (refs: Array<{ label: string }>) => refs.map((r) => r.label.split(" — ")[0]);
const file = (refs: Array<{ url: string }>) => refs.map((r) => decodeURIComponent(r.url.split("/").pop() ?? ""));

function config(over: Partial<PergolaReferenceInput> = {}): PergolaReferenceInput {
  return {
    operazione: "add_new_pergola",
    struttura: { tipo: "bioclimatica_addossata", materiale: "alluminio", colore_hex: "#30343B" },
    copertura: { tipo: "lamelle_orientabili" },
    chiusure_laterali: { tipo: "nessuna" },
    illuminazione: "nessuna",
    ...over,
  };
}

describe("foto di riferimento condivise: pergole — libreria", () => {
  it("ogni file dichiarato esiste su disco, con la sua miniatura", () => {
    expect(fileMancanti(...TABELLE)).toEqual([]);
    expect(miniatureMancanti(...TABELLE)).toEqual([]);
    expect(listPergolaReferencePaths().every((p) => p.startsWith("pergolas/"))).toBe(true);
  });

  it("le foto di forma (tipi, coperture, chiusure, piede del montante) sono in grigi veri e quelle di materia (materiali, luci) a colori", async () => {
    expect(await fotoBnADColori(...TABELLE)).toEqual([]);
    expect(await fotoColoriInGrigio([], ...TABELLE)).toEqual([]);
  }, 30_000);

  it("le etichette delle foto in bianco e nero non parlano di colore né di finitura; tutte stanno in 160 caratteri", () => {
    expect(etichetteDiFormaConColore(...TABELLE)).toEqual([]);
    const lunghe = TABELLE.flatMap((t) => Object.entries(t)).filter(([, e]) => e.text.length > 160).map(([k]) => k);
    expect(lunghe).toEqual([]);
  });

  it("ogni opzione vera del codice ha la sua foto o un motivo scritto in SENZA_FOTO", () => {
    const scoperte: string[] = [];
    const controlla = (dim: string, valori: string[], tabella: Record<string, unknown>) => {
      for (const v of valori) if (!tabella[v] && !SENZA_FOTO_PERGOLE[`${dim}.${v}`]) scoperte.push(`${dim}.${v}`);
    };
    controlla("struttura.tipo", TIPI_PERGOLA, PERGOLA_TYPE_PHOTOS);
    controlla("struttura.materiale", MATERIALI_PERGOLA, PERGOLA_MATERIAL_PHOTOS);
    controlla("copertura.tipo", COPERTURE_PERGOLA, PERGOLA_COVER_PHOTOS);
    controlla("chiusure_laterali", CHIUSURE_PERGOLA, PERGOLA_SIDE_PHOTOS);
    controlla("illuminazione", LUCI_PERGOLA, PERGOLA_LIGHTING_PHOTOS);
    controlla("ancoraggio_a_terra", ANCORAGGI, PERGOLA_ANCHOR_PHOTOS);
    expect(scoperte).toEqual([]);
    expect(Object.keys(PERGOLA_MATERIAL_TONES).sort()).toEqual(Object.keys(PERGOLA_MATERIAL_PHOTOS).sort());
  });

  it("SENZA_FOTO non nasconde opzioni che una foto ce l'hanno, e ogni motivo è scritto", () => {
    const tabellaDi: Record<string, Record<string, unknown>> = {
      chiusure_laterali: PERGOLA_SIDE_PHOTOS, illuminazione: PERGOLA_LIGHTING_PHOTOS, ancoraggio_a_terra: PERGOLA_ANCHOR_PHOTOS,
    };
    for (const [chiave, motivo] of Object.entries(SENZA_FOTO_PERGOLE)) {
      const [dim, valore] = chiave.split(".");
      expect(tabellaDi[dim], `${chiave}: dimensione sconosciuta`).toBeDefined();
      expect(tabellaDi[dim][valore], chiave).toBeUndefined();
      expect(motivo.length, chiave).toBeGreaterThan(10);
    }
  });

  it("le chiavi delle foto del piede sono valori veri dell'ancoraggio a terra", () => {
    expect(Object.keys(PERGOLA_ANCHOR_PHOTOS).sort()).toEqual(["deck", "prato_con_plinti"]);
    expect(Object.keys(PERGOLA_ANCHOR_PHOTOS).every((k) => ANCORAGGI.includes(k))).toBe(true);
  });
});

describe("foto di riferimento condivise: pergole — scelta", () => {
  it("forma vecchia della chiamata (solo il tipo): la foto segue il tipo; tipo sconosciuto → niente", () => {
    expect(collectPergolaReferenceImages({ tipo_struttura: "bioclimatica_addossata" })[0].label).toMatch(/^PERGOLA TYPE TARGET — bioclimatica_addossata: /);
    expect(collectPergolaReferenceImages({ tipo_struttura: "boh" })).toEqual([]);
  });

  it("la bioclimatica mostra già le lamelle: nessuna foto della copertura in più", () => {
    const refs = collectPergolaReferenceImages(config());
    expect(ruoli(refs)).toEqual(["PERGOLA TYPE TARGET", "STRUCTURE MATERIAL TARGET"]);
    expect(file(refs)[0]).toBe("Pergola-Bioclimatica-Sulla-Terrazza-BN.webp");
    expect(refs[0].label).toMatch(/do NOT copy the building, furniture or surroundings$/);
  });

  it("una tendina di copertura rimasta al default non vince sulla tipologia (telo → niente lamelle)", () => {
    const refs = collectPergolaReferenceImages(config({ struttura: { tipo: "telo_addossata", materiale: "alluminio", colore_hex: "#30343B" } }));
    expect(file(refs)).not.toContain("Lamelle-Orientabili-Della-Pergola-BN.webp");
    expect(file(refs)[0]).toBe("Pergola-A-Parete-Con-Copertura-Retrattile-BN.webp");
  });

  it("struttura generica con un'altra copertura: dalla foto del tipo solo il telaio, poi la copertura; priorità e tetto di 3", () => {
    const refs = collectPergolaReferenceImages(config({
      struttura: { tipo: "autoportante", materiale: "alluminio", colore_hex: "#30343B" },
      copertura: { tipo: "vetro" },
      chiusure_laterali: { tipo: "screen_zip" },
      illuminazione: "strip_led_perimetrale",
    }));
    expect(ruoli(refs)).toEqual(["PERGOLA TYPE TARGET", "PERGOLA COVER TARGET", "SIDE CLOSURE TARGET"]);
    expect(refs[0].label).toMatch(/Copy only the frame .* the roof covering in the photo is NOT the requested one/);
    expect(file(refs)).toEqual([
      "Pergola-In-Alluminio-Su-Terrazza-BN.webp",
      "Pergolato-In-Vetro-Sotto-Il-Cielo-Azzurro-BN.webp",
      "Tenda-A-Rullo-Zip-Per-Pergola-BN.webp",
    ]);
  });

  it("le luci entrano quando c'è posto, con la regola sull'ora del giorno; i downlight lineari sono le barre nelle travi", () => {
    const refs = collectPergolaReferenceImages(config({ struttura: { tipo: "bioclimatica_autoportante", materiale: "alluminio", colore_hex: "#FFFFFF" }, illuminazione: "downlight_lineari" }));
    expect(ruoli(refs)).toEqual(["PERGOLA TYPE TARGET", "LIGHTING TARGET"]);
    expect(file(refs)[1]).toBe("Pergola-In-Alluminio-Illuminata-Al-Tramonto-2.webp");
    expect(refs[1].label).toMatch(/keep the source photo's time of day, sky and daylight/);
  });

  it("il materiale si allega solo se il suo tono è vicino al colore della struttura", () => {
    expect(ruoli(collectPergolaReferenceImages(config({ struttura: { tipo: "bioclimatica_addossata", materiale: "alluminio", colore_hex: "#F2F1EA" } })))).toEqual(["PERGOLA TYPE TARGET"]);
    // tipologia legno con l'alluminio di default: si legge legno lamellare; con un colore rovere la foto entra
    const legno = collectPergolaReferenceImages(config({ struttura: { tipo: "legno_autoportante", materiale: "alluminio", colore_hex: "#B08C62" }, copertura: { tipo: "listelli_legno" } }));
    expect(file(legno)).toEqual(["Pergola-In-Legno-Sulla-Terrazza-BN.webp", "Dettaglio-Di-Abete-Lamellare.webp"]);
  });

  it("gating per operazione: solo copertura → la copertura; aggiungi chiusure → le chiusure; solo colore, stato, rimuovi chiusure → niente", () => {
    const soloCopertura = collectPergolaReferenceImages(config({ operazione: "change_cover_only", copertura: { tipo: "telo_retraibile" }, chiusure_laterali: { tipo: "screen_zip" } }));
    expect(ruoli(soloCopertura)).toEqual(["PERGOLA COVER TARGET"]);
    expect(file(soloCopertura)).toEqual(["Copertura-Ecru-Retrattile-Della-Pergola-BN.webp"]);
    const chiusure = collectPergolaReferenceImages(config({ operazione: "add_side_closures", chiusure_laterali: { tipo: "vetrata_slide" }, illuminazione: "spot_integrati" }));
    expect(ruoli(chiusure)).toEqual(["SIDE CLOSURE TARGET"]);
    for (const operazione of ["recolor_only", "change_open_state", "remove_side_closures"]) {
      expect(collectPergolaReferenceImages(config({ operazione, chiusure_laterali: { tipo: "screen_zip" }, illuminazione: "spot_integrati" })), operazione).toEqual([]);
    }
  });

  it("giardino senza ancoraggio scelto: i plinti nel prato, ultima foto dopo il tipo e il materiale", () => {
    const refs = collectPergolaReferenceImages(config({ installazione: { zona: "giardino_relax" } }));
    expect(ruoli(refs)).toEqual(["PERGOLA TYPE TARGET", "STRUCTURE MATERIAL TARGET", "POST FOOT TARGET"]);
    expect(file(refs)[2]).toBe("Piede-Di-Montante-Su-Plinto-Nel-Prato-BN.webp");
    expect(refs[2].label).toMatch(/^POST FOOT TARGET — prato_con_plinti: foot of a square post on a flat base plate/);
    expect(refs[2].label).toMatch(/Copy only how the post foot is fixed to the ground/);
    expect(refs[2].label).toMatch(/the post itself \(section, height, material\) follows the structure photo and the written specification/);
    expect(refs[2].label).toMatch(/the photo is deliberately black-and-white/);
    expect(refs[2].label).toMatch(/do NOT copy the rest of the scene$/);
  });

  it("l'ancoraggio scelto a mano vince sulla zona: deck → la foto del deck, anche in una zona che da sola non avrebbe foto", () => {
    const deck = collectPergolaReferenceImages(config({ installazione: { zona: "giardino_relax", ancoraggio_a_terra: "deck" } }));
    expect(file(deck)).toEqual(["Pergola-Bioclimatica-Sulla-Terrazza-BN.webp", "Angolo-Di-Profilo-In-Alluminio-Antracite.webp", "Piede-Di-Montante-Su-Deck-BN.webp"]);
    expect(deck[2].label).toMatch(/^POST FOOT TARGET — deck: foot of a square post on a flat base plate with a visible screw at each corner/);
    const terrazzoConDeck = collectPergolaReferenceImages(config({ installazione: { zona: "terrazzo", ancoraggio_a_terra: "deck" } }));
    expect(file(terrazzoConDeck)[2]).toBe("Piede-Di-Montante-Su-Deck-BN.webp");
    // plinti scelti a mano in una zona che porterebbe il pavimento
    const plintiInPatio = collectPergolaReferenceImages(config({ installazione: { zona: "patio_centrale", ancoraggio_a_terra: "prato_con_plinti" } }));
    expect(file(plintiInPatio)[2]).toBe("Piede-Di-Montante-Su-Plinto-Nel-Prato-BN.webp");
  });

  it("pavimento, bordo piscina e terrazzo (scelti o dati dalla zona) e nessuna installazione: nessuna foto del piede", () => {
    for (const zona of ["addossata_facciata", "patio_centrale", "terrazzo", "bordo_piscina", "dining_outdoor", "custom", undefined]) {
      expect(ruoli(collectPergolaReferenceImages(config({ installazione: { zona } }))), String(zona)).not.toContain("POST FOOT TARGET");
    }
    // un ancoraggio scelto a mano senza foto vince sulla zona giardino
    for (const ancoraggio_a_terra of ["pavimento", "bordo_piscina", "terrazzo"]) {
      expect(ruoli(collectPergolaReferenceImages(config({ installazione: { zona: "giardino_relax", ancoraggio_a_terra } }))), ancoraggio_a_terra).not.toContain("POST FOOT TARGET");
    }
    // forma vecchia della chiamata: nessuna installazione, nessun piede
    expect(ruoli(collectPergolaReferenceImages({ tipo_struttura: "bioclimatica_addossata" }))).toEqual(["PERGOLA TYPE TARGET"]);
  });

  it("il piede del montante conta solo quando l'operazione costruisce la pergola (i montanti non cambiano nelle altre)", () => {
    const installazione = { zona: "giardino_relax", ancoraggio_a_terra: "deck" };
    for (const operazione of ["add_new_pergola", "replace_existing_awning_with_pergola", "replace_existing_pergola"]) {
      expect(ruoli(collectPergolaReferenceImages(config({ operazione, installazione }))), operazione).toContain("POST FOOT TARGET");
    }
    for (const operazione of ["change_cover_only", "add_side_closures", "remove_side_closures", "recolor_only", "change_open_state"]) {
      expect(ruoli(collectPergolaReferenceImages(config({ operazione, installazione, chiusure_laterali: { tipo: "screen_zip" } }))), operazione).not.toContain("POST FOOT TARGET");
    }
  });

  it("il piede del montante è l'ultimo dettaglio: con le chiusure resta fuori dal tetto di 3, e le luci passano prima di lui", () => {
    const installazione = { zona: "giardino_relax" };
    const chiusure = collectPergolaReferenceImages(config({ installazione, chiusure_laterali: { tipo: "screen_zip" } }));
    expect(ruoli(chiusure)).toEqual(["PERGOLA TYPE TARGET", "SIDE CLOSURE TARGET", "STRUCTURE MATERIAL TARGET"]);
    // struttura chiara: la foto del materiale (tono scuro) non entra, restano tipo, luci e piede
    const luci = collectPergolaReferenceImages(config({
      installazione, struttura: { tipo: "bioclimatica_addossata", materiale: "alluminio", colore_hex: "#F2F1EA" }, illuminazione: "strip_led_perimetrale",
    }));
    expect(ruoli(luci)).toEqual(["PERGOLA TYPE TARGET", "LIGHTING TARGET", "POST FOOT TARGET"]);
  });

  it("nessuna foto due volte", () => {
    for (const tipo of TIPI_PERGOLA) {
      for (const copertura of COPERTURE_PERGOLA) {
        const refs = collectPergolaReferenceImages(config({
          installazione: { zona: "giardino_relax" },
          struttura: { tipo, materiale: "alluminio", colore_hex: "#30343B" }, copertura: { tipo: copertura }, chiusure_laterali: { tipo: "brise_soleil" }, illuminazione: "spot_integrati",
        }));
        expect(new Set(file(refs)).size, `${tipo}/${copertura}`).toBe(refs.length);
        expect(refs.length).toBeLessThanOrEqual(3);
      }
    }
  });
});
