import { CAMPIONI_FINITURE, campioneFinitura, campioneRivestimento, type SuperficieFinitura } from "../../../../shared/planimetrie/finiture.ts";
import type { PosaPavimento } from "../../../../shared/planimetrie/modello.ts";
import { COLORE_RADIANTE } from "../../../../shared/planimetrie/pavimentoRadiante.ts";
import { COLORI_CIRCUITO } from "../../../../shared/planimetrie/circuitiRadianti.ts";
import type { Materiale3D } from "./tipi";
import { CAMPIONI_PBR } from "./campioniPbr";
import { TRAME_GENERATE } from "./trameGenerate";

/** Colori dei materiali (sRGB). Giallo e rosso seguono la convenzione italiana: demolizioni e nuove costruzioni. */
export function materialeFinitura(testo: string | undefined, superficie: SuperficieFinitura, fallback: string): string {
  if (testo && /^#[0-9a-f]{6}$/i.test(testo.trim())) return `colore:${testo.trim().toLowerCase()}`;
  const campione = campioneFinitura(testo, superficie);
  return campione ? `finitura:${superficie}:${campione.id}` : fallback;
}

/** Il rivestimento a mezza altezza: piastrelle da parete o un campione dei pavimenti. */
export function materialeRivestimento(testo: string | undefined): string {
  if (testo && /^#[0-9a-f]{6}$/i.test(testo.trim())) return `colore:${testo.trim().toLowerCase()}`;
  const trovato = campioneRivestimento(testo);
  return trovato ? `finitura:${trovato.superficie}:${trovato.campione.id}` : "";
}

/** Le trame con un verso (doghe): si posano lungo il lato lungo della stanza. Le altre seguono solo i muri. */
const TRAME_A_DOGHE = new Set(["rovere", "rovere_gres", "rovere_miele", "gres_30x60"]);

/**
 * Di quanti gradi girare la texture del pavimento: la posa segue il lato più lungo della stanza
 * (non gli assi del foglio), poi «di traverso» aggiunge 90° e «in diagonale» 45°.
 */
export function rotazionePosa(contorno: ReadonlyArray<{ x: number; y: number }>, trama: string | undefined, posa: PosaPavimento | undefined): number {
  let lungo = 0, angolo = 0;
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i], b = contorno[(i + 1) % contorno.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > lungo + 1e-6) { lungo = l; angolo = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }
  }
  const periodo = trama && TRAME_A_DOGHE.has(trama) ? 180 : 90;
  const base = ((angolo % periodo) + periodo) % periodo;
  const totale = base + (posa === "traversa" ? 90 : posa === "diagonale" ? 45 : 0);
  const giro = Math.round((((totale % 180) + 180) % 180) * 10) / 10;
  return giro === 180 ? 0 : giro;
}

/** Lo stesso materiale, posato con un altro verso: l'angolo fa parte della chiave (`…@45`). */
export const conRotazione = (materiale: string, gradi: number): string => gradi ? `${materiale}@${gradi}` : materiale;

export function definizioneMateriale(id: string): Materiale3D | undefined {
  const girato = /^(.+)@(\d+(?:\.\d+)?)$/.exec(id);
  if (girato) {
    const base = definizioneMateriale(girato[1]);
    return base?.tessitura ? { ...base, tessitura: { ...base.tessitura, rotazione: Number(girato[2]) } } : base;
  }
  if (id.startsWith("colore:")) {
    const colore = id.slice("colore:".length);
    return { nome: colore, colore, opacita: 1, ruvidita: .92, finituraProgetto: true, tessitura: { trama: "intonaco", metri: [1, 1], tinta: colore } };
  }
  const arredo = id.match(/^arredo:(\w+):(#[0-9a-f]{6})$/i);
  if (arredo) {
    const [, materiale, colore] = arredo;
    const base = MATERIALI[materiale];
    if (!base) return;
    const tessitura = base.tessitura ? { ...base.tessitura, tinta: colore } : undefined;
    return { ...base, colore, finituraProgetto: true, ...(tessitura ? { tessitura } : {}) };
  }
  return MATERIALI[id];
}

export const MATERIALI: Record<string, Materiale3D> = {
  ...Object.fromEntries(Object.entries(CAMPIONI_FINITURE).flatMap(([superficie, campioni]) => campioni.map((c) => {
    const trama = c.id === "gres_legno" ? "rovere_gres" : c.trama;
    return [`finitura:${superficie}:${c.id}`, {
      nome: c.nome, colore: c.colore === "#ffffff" ? (c.trama === "rovere" ? "#c49a63" : c.trama === "marmo" ? "#f2f0eb" : c.trama === "pietra" ? "#d9cdb9" : c.colore) : c.colore,
      opacita: 1, ruvidita: c.ruvidita, tessitura: { trama, metri: CAMPIONI_PBR[trama]?.metri ?? TRAME_GENERATE[trama]?.metri ?? c.metri, tinta: c.colore },
    }];
  }))),
  // linee degli impianti (stesse tinte del disegno 2D)
  canale_mandata: { nome: "Canale di mandata", colore: "#197bc4", opacita: 1, ruvidita: .45 },
  canale_ripresa: { nome: "Canale di ripresa", colore: "#cb404d", opacita: 1, ruvidita: .45 },
  canale_mandata_asse: { nome: "Asse di mandata · sezione da verificare", colore: "#68b9ea", opacita: .66, ruvidita: .62 },
  canale_ripresa_asse: { nome: "Asse di ripresa · sezione da verificare", colore: "#e88089", opacita: .66, ruvidita: .62 },
  raccordo_mandata: { nome: "Raccordo di mandata · indicativo", colore: "#126fae", opacita: 1, ruvidita: .53 },
  raccordo_ripresa: { nome: "Raccordo di ripresa · indicativo", colore: "#b13345", opacita: 1, ruvidita: .53 },
  raccordo_mandata_coperto: { nome: "Raccordo di mandata · tracciato coperto", colore: "#68b9ea", opacita: .62, ruvidita: .53 },
  raccordo_ripresa_coperto: { nome: "Raccordo di ripresa · tracciato coperto", colore: "#e88089", opacita: .62, ruvidita: .53 },
  nodo_canali_evidenza: { nome: "Riscontro sulla tavola", colore: "#c98313", opacita: 1, ruvidita: .52 },
  impianto_elettrica: { nome: "Impianto elettrico", colore: "#dc2626", opacita: 1, ruvidita: 0.5 },
  impianto_acqua: { nome: "Acqua", colore: "#2563eb", opacita: 1, ruvidita: 0.4 },
  impianto_scarico: { nome: "Scarichi", colore: "#92400e", opacita: 1, ruvidita: 0.6 },
  impianto_frigorifera: { nome: "Linea frigorifera (rame)", colore: "#0891b2", opacita: 1, ruvidita: 0.35 },
  impianto_condensa: { nome: "Scarico condensa", colore: "#65a30d", opacita: 1, ruvidita: 0.5 },
  impianto_riscaldamento: { nome: "Riscaldamento", colore: "#ea580c", opacita: 1, ruvidita: 0.4 },
  impianto_radiante: { nome: "Pavimento radiante", colore: COLORE_RADIANTE, opacita: 1, ruvidita: 0.5 },
  impianto_radiante_mandata: { nome: "Mandata radiante", colore: COLORI_CIRCUITO.mandata, opacita: 1, ruvidita: 0.45 },
  impianto_radiante_ritorno: { nome: "Ritorno radiante", colore: COLORI_CIRCUITO.ritorno, opacita: 1, ruvidita: 0.45 },
  muro: { nome: "Muro", colore: "#ece7df", opacita: 1, ruvidita: 0.9 },
  muro_demolire: { nome: "Muro da demolire", colore: "#f2c200", opacita: 1, ruvidita: 0.8 },
  muro_nuovo: { nome: "Muro nuovo", colore: "#d42a2a", opacita: 1, ruvidita: 0.8 },
  soffitto: { nome: "Soffitto", colore: "#f6f4ef", opacita: 1, ruvidita: 0.95 },
  battiscopa: { nome: "Battiscopa laccato bianco", colore: "#f3f1ec", opacita: 1, ruvidita: 0.38 },
  luce_calda: { nome: "Diffusore LED caldo", colore: "#fff4df", opacita: 1, ruvidita: .68, emissione: { colore: "#ffd5a3", intensita: 8 } },
  luce_specchio: { nome: "Luce perimetrale", colore: "#fff2db", opacita: 1, ruvidita: .75, emissione: { colore: "#ffdfb4", intensita: 2.7 } },
  vetro: { nome: "Vetro", colore: "#a9d2ee", opacita: 0.3, ruvidita: 0.05 },
  vetro_fume: { nome: "Vetro fumé", colore: "#54514b", opacita: .21, ruvidita: .10, doppioLato: true },
  schermo: { nome: "Schermo spento", colore: "#1b2330", opacita: 1, ruvidita: .22 },
  pavimento_legno: { nome: "Pavimento in legno", colore: "#b98a5c", opacita: 1, ruvidita: 0.6, tessitura: { trama: "rovere", metri: CAMPIONI_PBR.rovere.metri, tinta: "#ffffff" } },
  pavimento_piastrelle: { nome: "Pavimento in piastrelle", colore: "#cdd3d6", opacita: 1, ruvidita: 0.4, tessitura: { trama: "piastrelle", metri: TRAME_GENERATE.piastrelle.metri, tinta: "#d6dbdd" } },
  pavimento_gres: { nome: "Pavimento in gres", colore: "#d6c7b0", opacita: 1, ruvidita: 0.5, tessitura: { trama: "piastrelle", metri: TRAME_GENERATE.piastrelle.metri, tinta: "#dccfba" } },
  pavimento_esterno: { nome: "Pavimento esterno", colore: "#a7a299", opacita: 1, ruvidita: 0.85, tessitura: { trama: "cemento", metri: TRAME_GENERATE.cemento.metri, tinta: "#b5b0a6" } },
  pavimento: { nome: "Pavimento", colore: "#c9b79c", opacita: 1, ruvidita: 0.6, tessitura: { trama: "piastrelle", metri: TRAME_GENERATE.piastrelle.metri, tinta: "#d2c2a9" } },
  prato: { nome: "Prato", colore: "#7da55a", opacita: 1, ruvidita: 1 },
  acqua: { nome: "Acqua", colore: "#59c4de", opacita: .42, ruvidita: .05, tessitura: { trama: "onde", metri: TRAME_GENERATE.onde.metri, tinta: "#59c4de" } },
  acqua_turchese: { nome: "Acqua turchese", colore: "#6fdfd9", opacita: .39, ruvidita: .045, tessitura: { trama: "onde", metri: TRAME_GENERATE.onde.metri, tinta: "#6fdfd9" } },
  acqua_profonda: { nome: "Acqua blu", colore: "#4aa4c4", opacita: .44, ruvidita: .055, tessitura: { trama: "onde", metri: TRAME_GENERATE.onde.metri, tinta: "#4aa4c4" } },
  piscina_mosaico: { nome: "Mosaico azzurro", colore: "#4babca", opacita: 1, ruvidita: .53, tessitura: { trama: "mosaico", metri: TRAME_GENERATE.mosaico.metri, tinta: "#4babca" } },
  piscina_mosaico_chiaro: { nome: "Mosaico acquamarina", colore: "#74c6c3", opacita: 1, ruvidita: .56, tessitura: { trama: "mosaico", metri: TRAME_GENERATE.mosaico.metri, tinta: "#74c6c3" } },
  piscina_mosaico_scuro: { nome: "Mosaico blu ardesia", colore: "#346783", opacita: 1, ruvidita: .63, tessitura: { trama: "mosaico", metri: TRAME_GENERATE.mosaico.metri, tinta: "#346783" } },
  bordo_travertino: { nome: "Travertino", colore: "#c8b393", opacita: 1, ruvidita: .73, tessitura: { trama: "travertino", metri: [1.4, 1.4], tinta: "#ffffff" } },
  bordo_ardesia: { nome: "Ardesia", colore: "#45484d", opacita: 1, ruvidita: .83 },
  fogliame: { nome: "Fogliame", colore: "#4f7f3a", opacita: 1, ruvidita: 1 },
  fogliame_chiaro: { nome: "Fogliame, getti nuovi", colore: "#6f9c48", opacita: 1, ruvidita: 1 },
  corteccia: { nome: "Corteccia", colore: "#6a5340", opacita: 1, ruvidita: .9 },
  corteccia_olivo: { nome: "Corteccia dell’olivo", colore: "#78674f", opacita: 1, ruvidita: .84 },
  foglie_olivo: { nome: "Foglie d’olivo", colore: "#626f36", opacita: 1, ruvidita: .78, doppioLato: true },
  foglie_olivo_chiare: { nome: "Foglie d’olivo argentate", colore: "#899166", opacita: 1, ruvidita: .71, doppioLato: true },
  pietra: { nome: "Pietra", colore: "#d9d2c3", opacita: 1, ruvidita: 0.8 },
  zoccolo: { nome: "Zoccolatura", colore: "#bdb7ab", opacita: 1, ruvidita: 0.95 },
  davanzale: { nome: "Davanzali in pietra", colore: "#e9e4da", opacita: 1, ruvidita: 0.6 },
  marciapiede: { nome: "Marciapiede", colore: "#cfc9bd", opacita: 1, ruvidita: 0.9, tessitura: { trama: "gres_30x60", metri: TRAME_GENERATE.gres_30x60.metri, tinta: "#d3cdc1" } },
  tetto_verde: { nome: "Tetto verde (sedum)", colore: "#7f9c5b", opacita: 1, ruvidita: 1 },
  tetto_verde_intensivo: { nome: "Giardino pensile", colore: "#6f9a4e", opacita: 1, ruvidita: 1 },
  lamiera: { nome: "Lamiera (zinco)", colore: "#8e969c", opacita: 1, ruvidita: 0.35, metallico: .5 },
  lamiera_giunti: { nome: "Aggraffatura in lamiera", colore: "#626b72", opacita: 1, ruvidita: .45, metallico: .46 },
  guaina: { nome: "Guaina", colore: "#4a4d52", opacita: 1, ruvidita: 0.85 },
  tegole: { nome: "Tegole", colore: "#a5523a", opacita: 1, ruvidita: 0.8 },
  terra_rossa: { nome: "Terra rossa", colore: "#c1643b", opacita: 1, ruvidita: 1 },
  terra_rossa_scura: { nome: "Terra rossa (fuori campo)", colore: "#a95431", opacita: 1, ruvidita: 1 },
  resina_blu: { nome: "Resina blu", colore: "#2d6cb5", opacita: 1, ruvidita: 0.6 },
  resina_blu_scura: { nome: "Resina blu (fuori campo)", colore: "#24589a", opacita: 1, ruvidita: 0.6 },
  resina_arancio: { nome: "Resina arancio", colore: "#e08a3c", opacita: 1, ruvidita: 0.6 },
  resina_verde: { nome: "Resina verde", colore: "#2e7d5b", opacita: 1, ruvidita: 0.6 },
  erba_sintetica: { nome: "Erba sintetica", colore: "#4e9a3e", opacita: 1, ruvidita: 1 },
  erba_sintetica_scura: { nome: "Erba sintetica (fuori campo)", colore: "#3f8532", opacita: 1, ruvidita: 1 },
  sabbia: { nome: "Sabbia", colore: "#e8d3a0", opacita: 1, ruvidita: 1 },
  linee: { nome: "Linee", colore: "#ffffff", opacita: 1, ruvidita: 0.5 },
  linee_blu: { nome: "Fettucce", colore: "#2d6cb5", opacita: 1, ruvidita: 0.5 },
  rete: { nome: "Rete", colore: "#1f2937", opacita: 0.55, ruvidita: 0.8 },
  arancio: { nome: "Ferro del canestro", colore: "#f97316", opacita: 1, ruvidita: 0.4 },
  pannello_fv: { nome: "Pannelli fotovoltaici", colore: "#1d2b45", opacita: 1, ruvidita: 0.2 },
  massa: { nome: "Edificio (piani sotto)", colore: "#dedad3", opacita: 1, ruvidita: 0.9 },
  ghiaia: { nome: "Ghiaia", colore: "#c8c3b7", opacita: 1, ruvidita: 1 },
  asfalto: { nome: "Asfalto", colore: "#6f7072", opacita: 1, ruvidita: 0.95 },
  terra: { nome: "Terra", colore: "#7d5f42", opacita: 1, ruvidita: 1 },
  recinzione: { nome: "Recinzione", colore: "#3d5a40", opacita: 0.55, ruvidita: 0.6 },
  ceramica: { nome: "Ceramica", colore: "#fbfbfa", opacita: 1, ruvidita: 0.15 },
  ceramica_satinata: { nome: "Ceramica bianco caldo satinata", colore: "#f3efe7", opacita: 1, ruvidita: .32 },
  legno: { nome: "Legno", colore: "#9c744e", opacita: 1, ruvidita: .54, tessitura: { trama: "legno", metri: [.55, 1.2] } },
  rovere_chiaro: { nome: "Rovere chiaro opaco", colore: "#c6a781", opacita: 1, ruvidita: .57,
    tessitura: { trama: "impiallacciatura", metri: CAMPIONI_PBR.impiallacciatura.metri, tinta: "#ffffff" } },
  tessuto: { nome: "Tessuto", colore: "#d4c4af", opacita: 1, ruvidita: .89, tessitura: { trama: "tessuto", metri: CAMPIONI_PBR.tessuto.metri } },
  lino_tenda: { nome: "Lino della tenda", colore: "#e8ddc7", opacita: 1, ruvidita: .85, doppioLato: true,
    tessitura: { trama: "tessuto", metri: CAMPIONI_PBR.tessuto.metri } },
  terracotta: { nome: "Terracotta", colore: "#b87657", opacita: 1, ruvidita: .79 },
  tessuto_divano: { nome: "Tessuto verde ardesia", colore: "#65776d", opacita: 1, ruvidita: .92, tessitura: { trama: "tessuto", metri: CAMPIONI_PBR.tessuto.metri } },
  tessuto_cuscino: { nome: "Tessuto verde salvia", colore: "#829180", opacita: 1, ruvidita: .9, tessitura: { trama: "tessuto", metri: CAMPIONI_PBR.tessuto.metri } },
  lenzuola: { nome: "Lenzuola", colore: "#eef0f2", opacita: 1, ruvidita: .92, tessitura: { trama: "tessuto", metri: CAMPIONI_PBR.tessuto.metri } },
  copriletto: { nome: "Copriletto in lino", colore: "#a6ad9c", opacita: 1, ruvidita: .91, tessitura: { trama: "tessuto", metri: CAMPIONI_PBR.tessuto.metri } },
  lino_avorio: { nome: "Lino avorio", colore: "#ddd0b5", opacita: 1, ruvidita: .92, tessitura: { trama: "tessuto", metri: CAMPIONI_PBR.tessuto.metri } },
  libro_ruggine: { nome: "Copertina terracotta", colore: "#904f3d", opacita: 1, ruvidita: .73 },
  libro_verde: { nome: "Copertina salvia", colore: "#65775f", opacita: 1, ruvidita: .74 },
  libro_tela: { nome: "Copertina in tela", colore: "#b3a594", opacita: 1, ruvidita: .85 },
  carta: { nome: "Carta avorio", colore: "#e2d9c3", opacita: 1, ruvidita: .95 },
  ottone: { nome: "Ottone satinato", colore: "#b39767", opacita: 1, ruvidita: .37, metallico: .77 },
  grafite: { nome: "Metallo verniciato grafite", colore: "#373c3b", opacita: 1, ruvidita: .48, metallico: .23 },
  specchio: { nome: "Specchio", colore: "#e7edef", opacita: 1, ruvidita: .055, metallico: 1 },
  ceramica_smalto: { nome: "Ceramica smaltata", colore: "#e8e0ca", opacita: 1, ruvidita: .21 },
  laccato: { nome: "Mobile laccato", colore: "#e3e0da", opacita: 1, ruvidita: 0.4 },
  carrozzeria: { nome: "Vernice auto", colore: "#687981", opacita: 1, ruvidita: .24, metallico: .38 },
  vetro_auto: { nome: "Vetro auto brunito", colore: "#202a31", opacita: 1, ruvidita: .12, metallico: .28 },
  faro_auto: { nome: "Faro in vetro satinato", colore: "#e6e9ed", opacita: 1, ruvidita: .15, metallico: .18 },
  fanale_auto: { nome: "Fanale rosso", colore: "#a32122", opacita: 1, ruvidita: .19, metallico: .13 },
  piano_cucina: { nome: "Piano cucina", colore: "#5f5f5f", opacita: 1, ruvidita: 0.3 },
  quarzo: { nome: "Quarzo compatto", colore: "#c7bda9", opacita: 1, ruvidita: .46 },
  piano_travertino: { nome: "Travertino levigato", colore: "#e7d4b8", opacita: 1, ruvidita: .52, tessitura: { trama: "travertino", metri: [1.4, 1.4], tinta: "#f3e7d6" } },
  inox: { nome: "Acciaio inox spazzolato", colore: "#c5cbcf", opacita: 1, ruvidita: .27, metallico: .88 },
  induzione: { nome: "Vetroceramica nera", colore: "#20232a", opacita: 1, ruvidita: .17, metallico: .12 },
  grafica_induzione: { nome: "Incisioni piano cottura", colore: "#76797a", opacita: 1, ruvidita: .46 },
  guarnizione: { nome: "Gomma e guarnizioni", colore: "#2e3032", opacita: 1, ruvidita: .83 },
  spia: { nome: "Spia di alimentazione", colore: "#87342b", opacita: 1, ruvidita: .34,
    emissione: { colore: "#d55943", intensita: .6 } },
  telaio: { nome: "Telaio serramento", colore: "#e9e9e6", opacita: 1, ruvidita: 0.4 },
  stipite: { nome: "Stipite porta", colore: "#aa8e6d", opacita: 1, ruvidita: 0.52 },
  zanzariera: { nome: "Zanzariera", colore: "#4b5058", opacita: 0.35, ruvidita: 0.7 },
  oscurante: { nome: "Cassonetto e tapparella", colore: "#8d9094", opacita: 1, ruvidita: 0.5 },
  calcestruzzo: { nome: "Calcestruzzo", colore: "#9a9a96", opacita: 1, ruvidita: 0.95 },
  metallo: { nome: "Metallo", colore: "#b4b8bc", opacita: 1, ruvidita: .3, metallico: .6 },
};

/** Materiale di un'area esterna. */
export const MATERIALE_AREA: Record<string, string> = {
  prato: "prato", aiuola: "fogliame", pavimentato: "pavimento_esterno", vialetto: "pietra", ghiaia: "ghiaia", parcheggio: "asfalto", orto: "terra",
};

/** Materiale del pavimento secondo la destinazione del locale. */
export function materialePavimento(destinazione: string): string {
  const d = destinazione.toLowerCase();
  if (/bagno|wc|lavanderia|servizi/.test(d)) return "pavimento_piastrelle";
  if (/cucin|angolo cottura/.test(d)) return "pavimento_gres";
  if (/giardino|prato/.test(d)) return "prato";
  if (/balcon|terrazz|loggia|cortile|esterno/.test(d)) return "pavimento_esterno";
  if (/soggiorno|salotto|camera|letto|studio|pranzo|living/.test(d)) return "pavimento_legno";
  return "pavimento";
}

export function materialeMuro(stato: "esistente" | "demolire" | "nuovo", colori: boolean): string {
  if (!colori || stato === "esistente") return "muro";
  return stato === "demolire" ? "muro_demolire" : "muro_nuovo";
}
