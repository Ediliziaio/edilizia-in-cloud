import { describe, expect, it } from "vitest";
import {
  SENZA_FOTO_PERSIANE,
  SHUTTER_HARDWARE_PHOTOS,
  SHUTTER_HEAD_BOX_PHOTOS,
  SHUTTER_LEAF_COUNT_PHOTOS,
  SHUTTER_MATERIAL_PHOTOS,
  SHUTTER_MATERIAL_TONES,
  SHUTTER_MOUNTING_PHOTOS,
  SHUTTER_TYPE_PHOTOS,
  SHUTTER_WOOD_FINISH_PHOTOS,
  collectShutterReferenceImages,
  distanzaTono,
  listShutterReferencePaths,
  shutterReferenceInputFromConfig,
} from "../../../shared/render-references/shutterReferences.ts";
import {
  ANTE_PER_TIPO,
  EFFETTI_LEGNO_PERSIANA,
  FERRAMENTE_PERSIANA,
  INSTALLAZIONI_PERSIANA,
  MATERIALI_PERSIANA,
  TIPI_PERSIANA,
} from "../../../shared/render-persiane/types.ts";
import {
  etichetteDiFormaConColore,
  fileMancanti,
  fotoBnADColori,
  fotoColoriInGrigio,
  miniatureMancanti,
} from "../lib/referenceGuards";

const TABELLE = [SHUTTER_TYPE_PHOTOS, SHUTTER_HEAD_BOX_PHOTOS, SHUTTER_LEAF_COUNT_PHOTOS, SHUTTER_WOOD_FINISH_PHOTOS, SHUTTER_MATERIAL_PHOTOS, SHUTTER_MOUNTING_PHOTOS, SHUTTER_HARDWARE_PHOTOS];
/** Tutti i numeri di ante che il form può chiedere (1, 2 per i battenti; 4, 6 per l'«a libro»), come stringhe. */
const NUMERI_ANTE = Array.from(new Set(Object.values(ANTE_PER_TIPO).flat())).map(String);
const ruoli = (refs: Array<{ label: string }>) => refs.map((r) => r.label.split(" — ")[0]);
const file = (refs: Array<{ url: string }>) => refs.map((r) => decodeURIComponent(r.url.split("/").pop() ?? ""));

describe("foto di riferimento condivise: persiane — libreria", () => {
  it("ogni file dichiarato esiste su disco, con la sua miniatura", () => {
    expect(fileMancanti(...TABELLE)).toEqual([]);
    expect(miniatureMancanti(...TABELLE)).toEqual([]);
    expect(listShutterReferencePaths().every((p) => p.startsWith("shutters/"))).toBe(true);
  });

  it("le foto di forma sono in grigi veri e quelle di materia sono a colori", async () => {
    expect(await fotoBnADColori(...TABELLE)).toEqual([]);
    expect(await fotoColoriInGrigio([], ...TABELLE)).toEqual([]);
  }, 30_000);

  it("le etichette delle foto in bianco e nero non parlano di colore né di finitura", () => {
    expect(etichetteDiFormaConColore(...TABELLE)).toEqual([]);
  });

  it("ogni etichetta sta in 160 caratteri", () => {
    const lunghe = TABELLE.flatMap((t) => Object.entries(t)).filter(([, e]) => e.text.length > 160).map(([k]) => k);
    expect(lunghe).toEqual([]);
  });

  it("ogni opzione vera del codice ha la sua foto o un motivo scritto in SENZA_FOTO", () => {
    const scoperte: string[] = [];
    const controlla = (dim: string, valori: string[], tabella: Record<string, unknown>) => {
      for (const v of valori) if (!tabella[v] && !SENZA_FOTO_PERSIANE[`${dim}.${v}`]) scoperte.push(`${dim}.${v}`);
    };
    controlla("tipo", TIPI_PERSIANA, SHUTTER_TYPE_PHOTOS);
    controlla("materiale", MATERIALI_PERSIANA, SHUTTER_MATERIAL_PHOTOS);
    controlla("effetto_legno", EFFETTI_LEGNO_PERSIANA, SHUTTER_WOOD_FINISH_PHOTOS);
    controlla("ferramenta_finitura", FERRAMENTE_PERSIANA, SHUTTER_HARDWARE_PHOTOS);
    controlla("installazione", INSTALLAZIONI_PERSIANA, SHUTTER_MOUNTING_PHOTOS);
    controlla("cassonetto", ["esterno_a_vista", "a_scomparsa"], SHUTTER_HEAD_BOX_PHOTOS);
    controlla("numero_ante", NUMERI_ANTE, SHUTTER_LEAF_COUNT_PHOTOS);
    expect([...NUMERI_ANTE].sort()).toEqual(["1", "2", "4", "6"]);
    expect(scoperte).toEqual([]);
  });

  it("SENZA_FOTO non nasconde opzioni che una foto ce l'hanno, e ogni motivo è scritto", () => {
    const tabellaDi: Record<string, Record<string, unknown>> = {
      tipo: SHUTTER_TYPE_PHOTOS, materiale: SHUTTER_MATERIAL_PHOTOS, effetto_legno: SHUTTER_WOOD_FINISH_PHOTOS,
      ferramenta_finitura: SHUTTER_HARDWARE_PHOTOS, installazione: SHUTTER_MOUNTING_PHOTOS, cassonetto: SHUTTER_HEAD_BOX_PHOTOS,
      numero_ante: SHUTTER_LEAF_COUNT_PHOTOS,
    };
    for (const [chiave, motivo] of Object.entries(SENZA_FOTO_PERSIANE)) {
      const [dim, valore] = chiave.split(".");
      expect(tabellaDi[dim]?.[valore], chiave).toBeUndefined();
      expect(motivo.length, chiave).toBeGreaterThan(10);
    }
  });

  it("le chiavi delle foto sono valori veri del codice (il manifest diceva «noce», «douglas_fiammato»)", () => {
    expect(Object.keys(SHUTTER_WOOD_FINISH_PHOTOS).every((k) => (EFFETTI_LEGNO_PERSIANA as string[]).includes(k))).toBe(true);
    expect(Object.keys(SHUTTER_TYPE_PHOTOS).every((k) => (TIPI_PERSIANA as string[]).includes(k))).toBe(true);
    expect(Object.keys(SHUTTER_MATERIAL_TONES).sort()).toEqual(Object.keys(SHUTTER_MATERIAL_PHOTOS).sort());
    expect(Object.keys(SHUTTER_HEAD_BOX_PHOTOS).sort()).toEqual(["a_scomparsa", "esterno_a_vista"]);
    expect(Object.keys(SHUTTER_LEAF_COUNT_PHOTOS).every((k) => NUMERI_ANTE.includes(k))).toBe(true);
  });
});

describe("foto di riferimento condivise: persiane — scelta", () => {
  it("il tipo scelto porta la sua foto, con etichetta di FORMA (foto nuova del set al posto di quella di Commons)", () => {
    const refs = collectShutterReferenceImages({ tipo: "veneziana_classica", materiale: "pvc", operazione: "sostituisci" });
    expect(refs).toHaveLength(1);
    expect(refs[0].label).toMatch(/^SHUTTER MODEL TARGET — veneziana_classica: /);
    expect(refs[0].label).toMatch(/Copy the shape and construction only — the photo is deliberately black-and-white/);
    expect(refs[0].url).toMatch(/\/render-references\/shutters\/Persiana-Italiana-A-Lamelle-Chiuse-BN\.webp$/);
  });

  it("legno naturale senza tinta aggiunge la foto del materiale, a colori", () => {
    const refs = collectShutterReferenceImages({ tipo: "scuro_pieno", materiale: "legno_naturale", operazione: "sostituisci" });
    expect(ruoli(refs)).toEqual(["SHUTTER MODEL TARGET", "SHUTTER MATERIAL TARGET"]);
    expect(refs[1].label).toMatch(/the exact colour tone comes from the written specification$/);
  });

  it("la foto del materiale si allega solo se il suo tono è vicino alla tinta scelta", () => {
    const antracite = collectShutterReferenceImages({ tipo: "scuro_pieno", materiale: "alluminio", colore_mode: "ral", colore_hex: "#383E42" });
    expect(ruoli(antracite)).toContain("SHUTTER MATERIAL TARGET");
    // il default del form: legno naturale in Bianco puro → la foto del legno oliato tirerebbe il bianco verso il miele
    const bianco = collectShutterReferenceImages({ tipo: "scuro_pieno", materiale: "legno_naturale", colore_mode: "ral", colore_hex: "#F7F5EF" });
    expect(ruoli(bianco)).toEqual(["SHUTTER MODEL TARGET"]);
    expect(distanzaTono("#383E42", "#5B6168")).toBeLessThan(20);
    expect(distanzaTono("#F7F5EF", "#8F5224")).toBeGreaterThan(20);
  });

  it("con l'effetto legno la foto è l'essenza scelta, non il materiale", () => {
    const refs = collectShutterReferenceImages({ tipo: "scuro_cornice", materiale: "legno_naturale", colore_mode: "legno", effetto_legno: "noce_nazionale", colore_hex: "#F7F5EF" });
    expect(ruoli(refs)).toEqual(["SHUTTER MODEL TARGET", "WOOD FINISH TARGET"]);
    expect(file(refs)[1]).toBe("Lamella-Verticale-Effetto-Noce.webp");
    // rovere chiaro (anche implicito) non ha foto: bastano le parole
    expect(ruoli(collectShutterReferenceImages({ tipo: "scuro_cornice", materiale: "legno_naturale", colore_mode: "legno" }))).toEqual(["SHUTTER MODEL TARGET"]);
  });

  it("priorità e tetto: forma, essenza, montaggio; la ferramenta resta fuori dal tetto di 3", () => {
    const refs = collectShutterReferenceImages({
      operazione: "sostituisci", tipo: "veneziana_classica", materiale: "alluminio", colore_mode: "legno", effetto_legno: "rovere_scuro",
      installazione: "su_telaio", ferramenta_finitura: "bronzo_scuro",
    });
    expect(ruoli(refs)).toEqual(["SHUTTER MODEL TARGET", "WOOD FINISH TARGET", "SHUTTER MOUNTING TARGET"]);
    expect(new Set(file(refs)).size).toBe(refs.length);
    // senza essenza la ferramenta entra
    const senzaEssenza = collectShutterReferenceImages({ tipo: "veneziana_classica", materiale: "pvc", installazione: "su_telaio", ferramenta_finitura: "bronzo_scuro" });
    expect(ruoli(senzaEssenza)).toEqual(["SHUTTER MODEL TARGET", "SHUTTER MOUNTING TARGET", "HARDWARE FINISH TARGET"]);
    expect(senzaEssenza[2].label).toMatch(/ignore the shutter board and its colour/);
  });

  it("il montaggio ha la foto solo se scelto a mano, diverso da quello del tipo e su un tipo a battente", () => {
    expect(ruoli(collectShutterReferenceImages({ tipo: "scuro_pieno", installazione: "cardini_tradizionali" }))).toEqual(["SHUTTER MODEL TARGET"]);
    expect(ruoli(collectShutterReferenceImages({ tipo: "brise_soleil", installazione: "brackets_architettonici" }))).toEqual(["SHUTTER MODEL TARGET"]);
    expect(ruoli(collectShutterReferenceImages({ tipo: "avvolgibile_esterno", installazione: "su_telaio", ferramenta_finitura: "bronzo_scuro" }))).toEqual(["SHUTTER MODEL TARGET"]);
    const staffe = collectShutterReferenceImages({ tipo: "gelosia", installazione: "brackets_architettonici" });
    expect(file(staffe)).toEqual(["Persiana-A-Gelosia-Chiusa-BN.webp", "Persiana-Sostenuta-Da-Staffe-Decorative-BN.webp"]);
    expect(staffe[1].label).toMatch(/^SHUTTER MOUNTING TARGET — brackets_architettonici: .*Copy only how the leaf is fixed/);
  });

  it("cambia colore: niente foto del tipo né del materiale (nel form sono nascosti e resterebbero i default)", () => {
    // Le tapparelle da ricolorare ricevevano la foto della veneziana (tipo di default nascosto): uscivano persiane.
    expect(collectShutterReferenceImages({ operazione: "cambia_colore", tipo: "veneziana_classica", materiale: "legno_naturale", colore_mode: "ral", colore_hex: "#383E42" })).toEqual([]);
    const legno = collectShutterReferenceImages({ operazione: "cambia_colore", tipo: "veneziana_classica", materiale: "legno_naturale", colore_mode: "legno", effetto_legno: "castagno" });
    expect(ruoli(legno)).toEqual(["WOOD FINISH TARGET"]);
  });

  it("rimuovi → nessuna foto; tipo sconosciuto → nessuna foto del tipo", () => {
    expect(collectShutterReferenceImages({ tipo: "veneziana_classica", operazione: "rimuovi", colore_mode: "legno", effetto_legno: "noce_nazionale" })).toEqual([]);
    expect(collectShutterReferenceImages({ tipo: "boh" })).toEqual([]);
  });

  it("veneziana esterna: la foto di un frangisole a lamelle su guide, non di un'anta a battente (era l'unico tipo senza foto)", () => {
    const refs = collectShutterReferenceImages({ tipo: "veneziana_esterna", materiale: "pvc" });
    expect(file(refs)).toEqual(["Veneziana-Esterna-A-Lamelle-Orientabili-Su-Guide-BN.webp"]);
    expect(refs[0].label).toMatch(/^SHUTTER MODEL TARGET — veneziana_esterna: external venetian blind in two vertical side guides/);
    expect(refs[0].label).toMatch(/no leaves, no hinges/);
    expect(refs[0].label).toMatch(/Copy the shape and construction only — the photo is deliberately black-and-white/);
    // montaggio e anta non le sceglie lei: il montaggio nativo è sulle guide e l'anta non c'è
    expect(file(collectShutterReferenceImages({ tipo: "veneziana_esterna", installazione: "su_telaio", numero_ante: 1, ferramenta_finitura: "bronzo_scuro" })))
      .toEqual(["Veneziana-Esterna-A-Lamelle-Orientabili-Su-Guide-BN.webp"]);
    // ricolorare: niente foto del tipo
    expect(collectShutterReferenceImages({ operazione: "cambia_colore", tipo: "veneziana_esterna" })).toEqual([]);
  });

  it("veneziana esterna col cassonetto nascosto: la foto lo ha a vista, quindi si copiano solo lamelle e guide", () => {
    const nascosto = collectShutterReferenceImages({ tipo: "veneziana_esterna", cassonetto: "a_scomparsa" });
    expect(file(nascosto)).toEqual(["Veneziana-Esterna-A-Lamelle-Orientabili-Su-Guide-BN.webp"]);
    expect(nascosto[0].label).toMatch(/Copy only the slats and the side guides — the head box in the photo is NOT requested: it stays concealed/);
    expect(nascosto[0].label).toMatch(/the photo is deliberately black-and-white/);
    // a vista, o senza scelta: il cassonetto della foto è quello giusto, l'etichetta di forma è quella di sempre
    for (const cassonetto of ["esterno_a_vista", undefined]) {
      expect(collectShutterReferenceImages({ tipo: "veneziana_esterna", cassonetto })[0].label, String(cassonetto)).toMatch(/Copy the shape and construction only/);
    }
  });

  it("l'avvolgibile ha la foto di una tapparella vera, in grigi (prima: uno scuro pieno in ferro)", () => {
    const refs = collectShutterReferenceImages({ tipo: "avvolgibile_esterno", materiale: "pvc" });
    expect(file(refs)).toEqual(["Serranda-Avvolgibile-Con-Guide-Laterali-BN.webp"]);
    expect(refs[0].label).toMatch(/roller-shutter curtain/);
  });

  it("tapparella col cassonetto a vista: la foto della finestra intera col cassonetto; senza scelta il primo piano", () => {
    expect(file(collectShutterReferenceImages({ tipo: "avvolgibile_esterno", cassonetto: "esterno_a_vista" }))).toEqual(["Finestra-Con-Tapparella-Abbassata-BN.webp"]);
    expect(collectShutterReferenceImages({ tipo: "avvolgibile_esterno", cassonetto: "esterno_a_vista" })[0].label).toMatch(/^SHUTTER MODEL TARGET — avvolgibile_esterno: window with an external roller shutter/);
    expect(file(collectShutterReferenceImages({ tipo: "avvolgibile_esterno" }))).toEqual(["Serranda-Avvolgibile-Con-Guide-Laterali-BN.webp"]);
  });

  it("tapparella col cassonetto nascosto: la foto della finestra intera senza cassonetto sulla facciata", () => {
    const nascosto = collectShutterReferenceImages({ tipo: "avvolgibile_esterno", cassonetto: "a_scomparsa" });
    expect(file(nascosto)).toEqual(["Finestra-Con-Tapparella-Cassonetto-Nascosto-BN.webp"]);
    expect(nascosto[0].label).toMatch(/^SHUTTER MODEL TARGET — avvolgibile_esterno: window with an external roller shutter lowered halfway: the curtain comes out of a thin slot under the lintel, no head box on the facade/);
    expect(nascosto[0].label).toMatch(/Copy the shape and construction only — the photo is deliberately black-and-white/);
    // una scelta sconosciuta non cambia la foto: resta il primo piano della serranda
    expect(file(collectShutterReferenceImages({ tipo: "avvolgibile_esterno", cassonetto: "boh" }))).toEqual(["Serranda-Avvolgibile-Con-Guide-Laterali-BN.webp"]);
    // il cassonetto non è una scelta dei tipi a battente: ignorato
    expect(file(collectShutterReferenceImages({ tipo: "scuro_pieno", cassonetto: "a_scomparsa" }))).toEqual(["Persiana-In-Legno-A-Due-Ante-BN.webp"]);
    // ricolorare le tapparelle: niente foto del tipo, nemmeno col cassonetto scelto
    expect(collectShutterReferenceImages({ operazione: "cambia_colore", tipo: "avvolgibile_esterno", cassonetto: "a_scomparsa" })).toEqual([]);
  });

  it("anta singola: la foto dell'anta sola a fianco di quella del tipo, che ne mostra due; l'etichetta del tipo lo dice", () => {
    const tipi: Array<[string, string]> = [
      ["veneziana_classica", "Persiana-Italiana-A-Lamelle-Chiuse-BN.webp"],
      ["scuro_pieno", "Persiana-In-Legno-A-Due-Ante-BN.webp"],
      ["scuro_cornice", "Persiana-Doppia-A-Pannelli-Rialzati-BN.webp"],
      ["gelosia", "Persiana-A-Gelosia-Chiusa-BN.webp"],
    ];
    for (const [tipo, fotoDelTipo] of tipi) {
      const refs = collectShutterReferenceImages({ tipo, numero_ante: 1 });
      expect(ruoli(refs), tipo).toEqual(["SHUTTER MODEL TARGET", "SHUTTER LEAF COUNT TARGET"]);
      expect(file(refs), tipo).toEqual([fotoDelTipo, "Persiana-Ad-Una-Anta-Chiusa-BN.webp"]);
      expect(refs[0].label, tipo).toMatch(/the photo shows two leaves but the requested shutter has ONE/);
      expect(refs[0].label, tipo).toMatch(/the photo is deliberately black-and-white/);
      expect(refs[1].label, tipo).toMatch(/^SHUTTER LEAF COUNT TARGET — 1: one single louvered leaf hinged on one side jamb/);
      expect(refs[1].label, tipo).toMatch(/Copy only the number of leaves and how the leaf hangs: ONE leaf on one jamb/);
      expect(refs[1].label, tipo).toMatch(/slats or panels follow the type photo.*the photo is deliberately black-and-white/);
    }
  });

  it("anta singola solo dove il tipo può averla: con due ante, a libro, su guide o fissi non entra nessuna foto in più", () => {
    // due ante: è già ciò che mostrano le foto dei tipi, con l'etichetta di forma di sempre
    const due = collectShutterReferenceImages({ tipo: "veneziana_classica", numero_ante: 2 });
    expect(ruoli(due)).toEqual(["SHUTTER MODEL TARGET"]);
    expect(due[0].label).toMatch(/Copy the shape and construction only/);
    // un numero che il tipo non può avere si ignora, come fa il prompt (anteCompatibili)
    for (const tipo of ["a_libro", "avvolgibile_esterno", "veneziana_esterna", "brise_soleil", "griglia_sicurezza"]) {
      const refs = collectShutterReferenceImages({ tipo, numero_ante: 1 });
      expect(ruoli(refs), tipo).toEqual(["SHUTTER MODEL TARGET"]);
      expect(refs[0].label, tipo).not.toMatch(/ONE/);
    }
    // 4 e 6 pannelli del tipo a libro: nessuna foto dedicata
    for (const numero_ante of [4, 6]) expect(ruoli(collectShutterReferenceImages({ tipo: "a_libro", numero_ante })), String(numero_ante)).toEqual(["SHUTTER MODEL TARGET"]);
  });

  it("anta singola: «cambia colore» e «rimuovi» non allegano niente; un numero in stringa non conta (il prompt non lo legge)", () => {
    expect(collectShutterReferenceImages({ operazione: "cambia_colore", tipo: "veneziana_classica", numero_ante: 1 })).toEqual([]);
    expect(collectShutterReferenceImages({ operazione: "rimuovi", tipo: "veneziana_classica", numero_ante: 1 })).toEqual([]);
    expect(ruoli(collectShutterReferenceImages(shutterReferenceInputFromConfig({ tipo: "veneziana_classica", numero_ante: "1" })))).toEqual(["SHUTTER MODEL TARGET"]);
  });

  it("l'anta singola è sagoma: viene subito dopo il tipo, prima di essenza e montaggio (tetto di 3)", () => {
    const refs = collectShutterReferenceImages({
      operazione: "sostituisci", tipo: "veneziana_classica", numero_ante: 1, colore_mode: "legno", effetto_legno: "noce_nazionale",
      installazione: "su_telaio", ferramenta_finitura: "bronzo_scuro",
    });
    expect(ruoli(refs)).toEqual(["SHUTTER MODEL TARGET", "SHUTTER LEAF COUNT TARGET", "WOOD FINISH TARGET"]);
    expect(new Set(file(refs)).size).toBe(refs.length);
    // senza essenza il montaggio e la ferramenta restano fuori lo stesso: il tetto è 3
    const senzaEssenza = collectShutterReferenceImages({ tipo: "veneziana_classica", numero_ante: 1, materiale: "pvc", installazione: "su_telaio", ferramenta_finitura: "bronzo_scuro" });
    expect(ruoli(senzaEssenza)).toEqual(["SHUTTER MODEL TARGET", "SHUTTER LEAF COUNT TARGET", "SHUTTER MOUNTING TARGET"]);
  });

  it("la edge legge i campi da legacy_config (piano v2); una chiave al livello alto vince", () => {
    const piano = { schema_version: "persiane_render_v2", legacy_config: { tipo: "gelosia", operazione: "sostituisci", colore_mode: "legno", effetto_legno: "douglas", installazione: "su_telaio" } };
    expect(shutterReferenceInputFromConfig(piano)).toEqual({ tipo: "gelosia", operazione: "sostituisci", colore_mode: "legno", effetto_legno: "douglas", installazione: "su_telaio" });
    expect(shutterReferenceInputFromConfig({ tipo: "scuro_pieno", legacy_config: { tipo: "gelosia" } }).tipo).toBe("scuro_pieno");
    expect(shutterReferenceInputFromConfig(null)).toEqual({});
  });

  it("la edge legge anche il numero di ante (è un numero, non una stringa): da legacy_config, il livello alto vince, una stringa si scarta", () => {
    const piano = { schema_version: "persiane_render_v2", legacy_config: { tipo: "gelosia", numero_ante: 1 } };
    expect(shutterReferenceInputFromConfig(piano)).toEqual({ tipo: "gelosia", numero_ante: 1 });
    expect(shutterReferenceInputFromConfig({ numero_ante: 2, legacy_config: { numero_ante: 1 } }).numero_ante).toBe(2);
    expect(shutterReferenceInputFromConfig({ legacy_config: { numero_ante: "1" } })).toEqual({});
    expect(ruoli(collectShutterReferenceImages(shutterReferenceInputFromConfig(piano)))).toEqual(["SHUTTER MODEL TARGET", "SHUTTER LEAF COUNT TARGET"]);
  });
});
