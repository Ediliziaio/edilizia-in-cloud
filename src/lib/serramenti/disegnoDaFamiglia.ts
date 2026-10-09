/**
 * Dall'articolo del listino al disegno: legge `disegno_tipologia` della famiglia, le scelte fatte
 * negli assi (colore, vetro, telaio) e le misure, e dice che cosa disegnare.
 * Senza `disegno_tipologia` (o con una tipologia sconosciuta) non c'è disegno: resta la foto.
 */
import type { AxisSelection, FamilyWithAxes } from "@/types/articleFamily";
import { disegnaPersiana } from "./disegnoPersiana";
import {
  TIPOLOGIE_DISEGNO,
  type AntaDisegno,
  type DefinizioneDisegno,
  type TipologiaDisegno,
  type ScenaSerramento,
  type SerramentoDisegno,
} from "./disegnoSerramento";
import { anteDaApertura, apertureDellaTipologia, persianaDaConfigurazione } from "./assiDisegno";
import { finituraDaEtichetta, type Finitura } from "./finituraSerramento";
import { telaioDaEtichetta } from "./telaioSerramento";
import { vetroDaEtichette } from "./vetroSerramento";

export type DisegnoFamiglia =
  | {
      tipo: "serramento";
      /** Una vista interna e una esterna, come nel PDF. */
      viste: Array<{ vista: "interna" | "esterna"; disegno: SerramentoDisegno }>;
      finituraInterna: Finitura | null;
      finituraEsterna: Finitura | null;
      /** Monoblocco: colori di tapparella e cassonetto. */
      finituraTapparella?: Finitura | null;
      finituraCassonetto?: Finitura | null;
      /** Se l'articolo permette di scegliere l'apertura: quella scelta (vista da dentro). */
      apertura?: "dx" | "sx";
      /** L'apertura del listino scelta («Battente DX», «Scorre verso SX»…). */
      aperturaNome?: string;
    }
  | {
      tipo: "persiana";
      /** Da fuori (come le schede) e da dentro (con la maniglia: la persiana si spinge da dentro). */
      viste: Array<{ vista: "interna" | "esterna"; scena: ScenaSerramento }>;
      finituraEsterna: Finitura | null;
      /** Se l'articolo permette di scegliere l'apertura: quella scelta (vista da dentro). */
      apertura?: "dx" | "sx";
    };

/** L'id del tipo di disegno composto a mano (articolo con «Personalizzata»). */
export const TIPOLOGIA_PERSONALIZZATA = "personalizzata";

type ConDisegno = { disegno_tipologia?: string | null; disegno_definizione?: DefinizioneDisegno | null };

/** La tipologia (del catalogo o composta a mano) di un articolo, con le misure e le ante di partenza. */
export function tipologiaDiFamiglia(family: ConDisegno): TipologiaDisegno | undefined {
  const t = family.disegno_tipologia;
  if (!t) return undefined;
  if (t === TIPOLOGIA_PERSONALIZZATA) return tipologiaDaDefinizione(family.disegno_definizione);
  return TIPOLOGIE_DISEGNO.find((x) => x.id === t);
}

/** Una definizione composta a mano diventa una tipologia come quelle del catalogo. */
export function tipologiaDaDefinizione(def: DefinizioneDisegno | null | undefined): TipologiaDisegno | undefined {
  if (!def || !Array.isArray(def.ante) || def.ante.length === 0) return undefined;
  return {
    id: TIPOLOGIA_PERSONALIZZATA,
    nome: "Personalizzata",
    larghezzaMm: def.larghezzaMm ?? 1200,
    altezzaMm: def.altezzaMm ?? 1400,
    ante: def.ante,
    soglia: def.soglia,
    scorrimento: def.scorrimento,
    inLinea: def.inLinea,
    sopraluce: def.sopraluce,
    sottoluce: def.sottoluce,
    traversi: def.traversi,
    inglesine: def.inglesine,
  };
}

/** La famiglia ha un disegno? (per sapere se chiedere le misure anche a chi non prezza a mq). */
export function haDisegno(family: ConDisegno): boolean {
  const t = family.disegno_tipologia;
  if (!t) return false;
  if (t.startsWith("persiana:")) return true;
  return !!tipologiaDiFamiglia(family);
}

/** L'etichetta del valore scelto in un asse, o undefined. */
function etichettaScelta(family: FamilyWithAxes, selection: AxisSelection, codice: string, voci?: Record<string, string> | null): string | undefined {
  // La voce scelta dentro il valore («71 - Schwarzbraun» dentro «Colore Fuori Standard») è il colore vero.
  if (voci?.[codice]) return voci[codice];
  const asse = family.axes.find((a) => a.codice === codice);
  if (!asse) return undefined;
  return asse.values.find((v) => v.id === selection[codice])?.label;
}

/**
 * Il telaio come si legge sul disegno: il valore («Telaio a Z») e, se c'è, la voce scelta dentro («Aletta 35 mm
 * Salamander»). Il tipo sta nel valore e la misura nella voce: la sola voce non dice se è a L o a Z.
 */
function etichettaTelaio(family: FamilyWithAxes, selection: AxisSelection, voci?: Record<string, string> | null): string | undefined {
  const parti = [etichettaScelta(family, selection, "telaio", null), voci?.telaio].filter((p): p is string => !!p);
  return parti.length > 0 ? parti.join(" · ") : undefined;
}

/** Il codice (non l'etichetta) del valore scelto in un asse. */
function codiceScelto(family: FamilyWithAxes, selection: AxisSelection, codice: string): string | undefined {
  return family.axes.find((a) => a.codice === codice)?.values.find((v) => v.id === selection[codice])?.valore;
}

/** Apertura a sinistra: la tipologia (disegnata con l'apertura a destra) si specchia; a destra si fissa il lato. */
function conApertura(ante: AntaDisegno[], apertura: "dx" | "sx" | undefined): AntaDisegno[] {
  if (!apertura) return ante;
  const gira = (l: "dx" | "sx") => (l === "dx" ? "sx" : "dx");
  const sceltaDx = (a: AntaDisegno) => ({ ...a, lato: a.lato ?? "dx" });
  if (apertura === "dx") return ante.map(sceltaDx);
  return [...ante].reverse().map((a) => ({ ...a, lato: gira(a.lato ?? "dx") }));
}

/** Le misure con cui mostrare il disegno finché non se ne scrivono di proprie. */
export function misureTipiche(family: ConDisegno): { larghezzaMm: number; altezzaMm: number } {
  const tip = tipologiaDiFamiglia(family);
  return { larghezzaMm: tip?.larghezzaMm ?? 1000, altezzaMm: tip?.altezzaMm ?? 1400 };
}

/** Le scelte di un articolo con i valori di serie (per la miniatura nell'elenco). */
function scelteDiSerie(family: FamilyWithAxes): AxisSelection {
  const sel: AxisSelection = {};
  for (const ax of family.axes) {
    const v = ax.values.find((x) => x.is_default && x.attivo) ?? ax.values.find((x) => x.attivo);
    if (v) sel[ax.codice] = v.id;
  }
  return sel;
}

/** La miniatura dell'elenco: la prima vista del disegno, alla misura tipica della tipologia, senza colore scelto. */
export function miniaturaDaFamiglia(family: FamilyWithAxes): DisegnoFamiglia | null {
  if (!haDisegno(family)) return null;
  const tip = tipologiaDiFamiglia(family);
  const d = disegnoDaFamiglia(family, scelteDiSerie(family), tip?.larghezzaMm ?? 1100, tip?.altezzaMm ?? 1400);
  if (!d) return null;
  return d.tipo === "persiana" ? { ...d, viste: d.viste.slice(0, 1), finituraEsterna: null } : { ...d, viste: d.viste.slice(0, 1), finituraInterna: null, finituraEsterna: null };
}

/**
 * La configurazione del disegno, congelata nella riga del preventivo: la tipologia e le scelte come ETICHETTE
 * (non gli id del listino, che possono cambiare). Con questa e le misure il disegno si rifà identico, sempre.
 */
export interface DisegnoConfig {
  v: 1;
  /** Id di TIPOLOGIE_DISEGNO, `persiana:<codice>[:orientabili]` o `personalizzata`, come in `article_families.disegno_tipologia`. */
  tipologia: string;
  /** Tipo composto a mano: la definizione si congela con la riga, così il PDF non dipende dall'articolo. */
  definizione?: DefinizioneDisegno;
  /**
   * Riga congelata SENZA disegno: un preventivo già consegnato prima del disegno automatico resta com'era
   * (con la foto dell'articolo), anche se l'articolo ha poi un tipo di disegno.
   */
  nessuno?: boolean;
  apertura?: "dx" | "sx";
  /** Apertura del listino (battente DX, ribalta su anta SX, scorre verso DX…): le ante vengono dal catalogo `assiDisegno`. */
  aperturaCodice?: string;
  aperturaNome?: string;
  /** Composizione scelta congelata: le nuove aperture non cambiano un preventivo già salvato. */
  ante?: AntaDisegno[];
  soglia?: boolean;
  sopraluceApribile?: boolean;
  colore?: string;
  /** Il colore di ogni lato, come lo scrive la riga (`colore_interno` / `colore_esterno`, anche se uguali): ha la precedenza su `colore`. */
  coloreInterno?: string;
  coloreEsterno?: string;
  telaio?: string;
  /** «Con monoblocco» su una qualunque tipologia: il serramento ha il cassonetto sopra (non vale per le sagome e i fissi). */
  monoblocco?: boolean;
  /** Monoblocco: altezza del cassonetto, avvolgimento («Motorizzato…»), colori e zanzariera, dalle scelte. */
  altezzaCassonettoMm?: number;
  avvolgimento?: string;
  coloreTapparella?: string;
  coloreCassonetto?: string;
  zanzariera?: boolean;
  /** Sagome: altezza dell'arco (freccia); trapezio: altezza del lato basso e quale lato è (visto da dentro). */
  frecciaMm?: number;
  altezzaMinoreMm?: number;
  latoMinore?: "dx" | "sx";
  /** Altezza del sopraluce e del sottoluce, se la tipologia li ha. */
  sopraluceMm?: number;
  sottoluceMm?: number;
  tipologiaVetro?: string;
  vetrocamera?: string;
}

const aperturaDaEtichetta = (e: string | undefined): "dx" | "sx" | undefined =>
  e ? (/sinistra|\bsx\b/i.test(e) ? "sx" : "dx") : undefined;

/** Le misure della sagoma già scritte in una configurazione (da non perdere quando si rifà dalle scelte). */
export function formaDaConfig(c: DisegnoConfig | null | undefined): { frecciaMm?: number; altezzaMinoreMm?: number; latoMinore?: "dx" | "sx"; sopraluceMm?: number; sottoluceMm?: number } {
  return { frecciaMm: c?.frecciaMm, altezzaMinoreMm: c?.altezzaMinoreMm, latoMinore: c?.latoMinore, sopraluceMm: c?.sopraluceMm, sottoluceMm: c?.sottoluceMm };
}

/** Dalle scelte fatte sull'articolo alla configurazione da congelare. Null se l'articolo non ha il disegno. */
export function configDaFamiglia(
  family: FamilyWithAxes | undefined | null,
  selection: AxisSelection,
  coloriRiga?: {
    coloreInterno?: string | null;
    coloreEsterno?: string | null;
    voci?: Record<string, string> | null;
    /** Le misure della sagoma, scritte nella riga. */
    forma?: {
      frecciaMm?: number | null;
      altezzaMinoreMm?: number | null;
      latoMinore?: "dx" | "sx" | null;
      sopraluceMm?: number | null;
      sottoluceMm?: number | null;
    } | null;
  },
): DisegnoConfig | null {
  if (!family || !haDisegno(family)) return null;
  const e = (codice: string) => etichettaScelta(family, selection, codice, coloriRiga?.voci);
  const c: DisegnoConfig = { v: 1, tipologia: family.disegno_tipologia as string };
  // Articoli storici importati prima della distinzione fra i due fissi.
  // Il fix vale per le scelte nuove, mai per gli snapshot già salvati.
  if (c.tipologia === "fisso" && /fisso nell['’\s]+anta/i.test(family.nome ?? "")) c.tipologia = "fisso_anta";
  if (c.tipologia === TIPOLOGIA_PERSONALIZZATA && family.disegno_definizione) c.definizione = family.disegno_definizione;
  const etichettaApertura = e("apertura");
  // Un'apertura del catalogo (anche solo dal nome, per le righe lette dalle etichette) detta le ante; le due voci
  // vecchie «Apertura a destra/sinistra» specchiano la tipologia.
  const daCatalogo = etichettaApertura
    ? apertureDellaTipologia(c.tipologia).find((a) => a.nome === etichettaApertura || a.codice === codiceScelto(family, selection, "apertura"))
    : undefined;
  if (daCatalogo) {
    c.aperturaCodice = daCatalogo.codice;
    c.aperturaNome = daCatalogo.nome;
    c.ante = daCatalogo.ante.map((a) => ({ ...a }));
  } else {
    const apertura = aperturaDaEtichetta(etichettaApertura);
    if (apertura) c.apertura = apertura;
    const tipologia = c.tipologia === "fisso_anta" ? TIPOLOGIE_DISEGNO.find((t) => t.id === c.tipologia) : tipologiaDiFamiglia(family);
    if (tipologia) c.ante = conApertura(tipologia.ante, apertura).map((a) => ({ ...a }));
  }
  const soglia = codiceScelto(family, selection, "soglia");
  const sogliaNome = e("soglia");
  if (sogliaNome && /senza|nessuna|^no$/i.test(sogliaNome)) c.soglia = false;
  else if (sogliaNome && /con soglia|soglia bassa|soglia standard/i.test(sogliaNome)) c.soglia = true;
  else if (soglia === "senza" || soglia === "no") c.soglia = false;
  else if (soglia === "con" || soglia === "si") c.soglia = true;
  const sopraluce = codiceScelto(family, selection, "apertura_sopraluce");
  if (sopraluce === "vasistas") c.sopraluceApribile = true;
  else if (sopraluce === "fisso") c.sopraluceApribile = false;
  if (e("colore")) c.colore = e("colore");
  if (coloriRiga?.forma?.frecciaMm) c.frecciaMm = coloriRiga.forma.frecciaMm;
  if (coloriRiga?.forma?.altezzaMinoreMm) c.altezzaMinoreMm = coloriRiga.forma.altezzaMinoreMm;
  if (coloriRiga?.forma?.latoMinore) c.latoMinore = coloriRiga.forma.latoMinore;
  if (coloriRiga?.forma?.sopraluceMm) c.sopraluceMm = coloriRiga.forma.sopraluceMm;
  if (coloriRiga?.forma?.sottoluceMm) c.sottoluceMm = coloriRiga.forma.sottoluceMm;
  if (coloriRiga?.coloreInterno) c.coloreInterno = coloriRiga.coloreInterno;
  if (coloriRiga?.coloreEsterno) c.coloreEsterno = coloriRiga.coloreEsterno;
  const telaio = etichettaTelaio(family, selection, coloriRiga?.voci);
  if (telaio) c.telaio = telaio;
  const cassonetto = /(\d{2,3})/.exec(e("altezza_cassonetto") ?? "");
  if (cassonetto) c.altezzaCassonettoMm = Number(cassonetto[1]);
  if (e("avvolgimento")) c.avvolgimento = e("avvolgimento");
  if (e("colore_tapparella")) c.coloreTapparella = e("colore_tapparella");
  if (e("colore_cassonetto")) c.coloreCassonetto = e("colore_cassonetto");
  if (e("monoblocco")) c.monoblocco = /^\s*con\b/i.test(e("monoblocco") as string);
  if (e("zanzariera")) c.zanzariera = /^\s*con\b/i.test(e("zanzariera") as string);
  if (e("tipologia_vetro")) c.tipologiaVetro = e("tipologia_vetro");
  if (e("vetrocamera")) c.vetrocamera = e("vetrocamera");
  return c;
}

/** Il disegno dalla configurazione e dalle misure. */
export function disegnoDaConfig(config: DisegnoConfig, larghezzaMm: number, altezzaMm: number): DisegnoFamiglia | null {
  if (config.nessuno) return null;
  if (!(larghezzaMm > 0) || !(altezzaMm > 0)) return null;
  const coloreInterno = finituraDaEtichetta(config.coloreInterno ?? config.colore);
  const coloreEsterno = finituraDaEtichetta(config.coloreEsterno ?? config.colore);
  const t = config.tipologia;

  if (t.startsWith("persiana:")) {
    const [, codice, variante] = t.split(":");
    // Variante: lamelle fisse (di serie), orientabili, gelosia, scuro pieno (doghe) o scuro a cornice.
    const tipoPersiana = variante === "scuro" ? ("scuro_pieno" as const) : variante === "scuro_cornice" ? ("scuro_cornice" as const) : variante === "gelosia" ? ("gelosia" as const) : ("veneziana" as const);
    const base = {
      larghezzaMm,
      altezzaMm,
      ante: 2,
      tipo: tipoPersiana,
      lamelle: variante === "orientabili" ? ("orientabili" as const) : ("fisse" as const),
      apertura: config.apertura,
      ...persianaDaConfigurazione(codice, larghezzaMm, altezzaMm),
    };
    return {
      tipo: "persiana",
      viste: [
        { vista: "esterna", scena: disegnaPersiana({ ...base, vista: "esterna" }) },
        { vista: "interna", scena: disegnaPersiana({ ...base, vista: "interna" }) },
      ],
      finituraEsterna: coloreEsterno,
      apertura: base.apertura,
    };
  }

  const tipologia = t === TIPOLOGIA_PERSONALIZZATA ? tipologiaDaDefinizione(config.definizione) : TIPOLOGIE_DISEGNO.find((x) => x.id === t);
  if (!tipologia) return null;
  // Monoblocco: la tipologia dà il cassonetto di serie, le scelte lo cambiano.
  // Il monoblocco è anche una scelta di ogni tipologia («Con monoblocco»): cassonetto sopra, tranne che su sagome e fissi.
  const mono = tipologia.monoblocco ?? (config.monoblocco && !tipologia.forma && t !== "fisso" ? { cassonettoMm: 200, tapparella: { motore: false } } : undefined);
  const monoblocco = mono
    ? {
        ...mono,
        cassonettoMm: config.altezzaCassonettoMm ?? mono.cassonettoMm,
        tapparella:
          mono.tapparella === false
            ? (false as const)
            : { ...mono.tapparella, motore: config.avvolgimento ? /motoriz/i.test(config.avvolgimento) : mono.tapparella?.motore },
        zanzariera: config.zanzariera ?? mono.zanzariera,
      }
    : undefined;
  let anteScelte = config.ante ?? (config.aperturaCodice ? anteDaApertura(t, config.aperturaCodice) : null) ?? conApertura(tipologia.ante, config.apertura);
  // Snapshot anteriori al catalogo comune: conservano l'antica interpretazione
  // del verso (senza specchiare i fissi). Le righe nuove salvano `ante`.
  if (!config.ante && /^scorre_(dx|sx)$/.test(config.aperturaCodice ?? "")) {
    const versoStorico = config.aperturaCodice === "scorre_sx" ? "sx" as const : "dx" as const;
    anteScelte = tipologia.ante.map((a) => a.tipo === "scorrevole" || a.tipo === "alzante_scorrevole" ? { ...a, lato: versoStorico } : { ...a });
  }
  // Il muro dello scorrevole sta dalla parte in cui scorre l'anta.
  const verso = anteScelte.find((a) => a.tipo === "scorrevole" || a.tipo === "alzante_scorrevole")?.lato;
  const base: SerramentoDisegno = {
    larghezzaMm,
    altezzaMm,
    ante: anteScelte,
    scorrimento: tipologia.scorrimento ? { ...tipologia.scorrimento, lato: verso ?? tipologia.scorrimento.lato } : undefined,
    inLinea: tipologia.inLinea,
    // Sopraluce e sottoluce: l'altezza scritta nella riga, o quella di partenza della tipologia, o un quarto / un quinto dell'altezza.
    sopraluce: tipologia.sopraluce ? { altezzaMm: config.sopraluceMm ?? tipologia.sopraluce.altezzaMm ?? Math.round(altezzaMm * 0.25), sezioni: tipologia.sopraluce.sezioni, apribile: config.sopraluceApribile ?? tipologia.sopraluce.apribile } : undefined,
    sottoluce: tipologia.sottoluce ? { altezzaMm: config.sottoluceMm ?? tipologia.sottoluce.altezzaMm ?? Math.round(altezzaMm * 0.2) } : undefined,
    soglia: config.soglia ?? tipologia.soglia,
    traversi: tipologia.traversi,
    inglesine: tipologia.inglesine,
    forma: tipologia.forma,
    frecciaMm: config.frecciaMm ?? tipologia.frecciaMm,
    // Il lato basso di serie è una misura fissa: se la finestra è più bassa non regge, e si prende il 70% dell'altezza.
    altezzaMinoreMm: config.altezzaMinoreMm ?? (tipologia.altezzaMinoreMm !== undefined && tipologia.altezzaMinoreMm < altezzaMm ? tipologia.altezzaMinoreMm : tipologia.forma === "trapezio" ? Math.round(altezzaMm * 0.7) : undefined),
    latoMinore: config.latoMinore ?? tipologia.latoMinore,
    monoblocco,
    telaio: telaioDaEtichetta(config.telaio) ?? undefined,
    vetro: vetroDaEtichette(config.tipologiaVetro, config.vetrocamera),
  };
  return {
    tipo: "serramento",
    apertura: config.apertura,
    aperturaNome: config.aperturaNome,
    viste: [
      { vista: "interna", disegno: { ...base, vista: "interna" } },
      { vista: "esterna", disegno: { ...base, vista: "esterna" } },
    ],
    finituraInterna: coloreInterno,
    finituraEsterna: coloreEsterno,
    finituraTapparella: finituraDaEtichetta(config.coloreTapparella),
    // «Come il serramento»: il cassonetto prende il colore del serramento.
    finituraCassonetto: config.coloreCassonetto && !/come il serramento/i.test(config.coloreCassonetto) ? finituraDaEtichetta(config.coloreCassonetto) : null,
  };
}

export function disegnoDaFamiglia(
  family: FamilyWithAxes,
  selection: AxisSelection,
  larghezzaMm: number,
  altezzaMm: number,
  voci?: Record<string, string> | null,
): DisegnoFamiglia | null {
  const config = configDaFamiglia(family, selection, { voci });
  return config ? disegnoDaConfig(config, larghezzaMm, altezzaMm) : null;
}
