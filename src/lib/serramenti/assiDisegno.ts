/**
 * Gli assi del listino che fanno il disegno: i loro codici e le loro etichette, e come un'apertura
 * del listino diventa il disegno delle ante.
 *
 * È la parte «dati» del disegno automatico: serve a creare gli assi negli articoli e a leggerli
 * quando si disegna. Le maggiorazioni sono tutte a ZERO e segnate «da compilare»: i prezzi di arco,
 * trapezio, cassonetto e motore li decide l'azienda, non si inventano qui.
 */
import { TIPOLOGIE_DISEGNO, type AntaDisegno, type FormaSerramento } from "./disegnoSerramento";
import type { PersianaDisegno } from "./disegnoPersiana";

export interface MaggiorazioneAsse {
  tipo: "none" | "percentuale" | "importo";
  valore: number;
  /** true finché nessuno ha deciso il prezzo. */
  daCompilare?: boolean;
}

export interface ValoreAsseDisegno {
  codice: string;
  nome: string;
  maggiorazione: MaggiorazioneAsse;
}

export interface AsseDisegno {
  codice: string;
  nome: string;
  obbligatorio: boolean;
  valori: ValoreAsseDisegno[];
}

const zero: MaggiorazioneAsse = { tipo: "none", valore: 0, daCompilare: true };
const v = (codice: string, nome: string): ValoreAsseDisegno => ({ codice, nome, maggiorazione: { ...zero } });

// ---- Serramenti

export const ASSE_FORMA: AsseDisegno = {
  codice: "forma",
  nome: "Forma",
  obbligatorio: true,
  valori: [
    v("rettangolare", "Rettangolare"), v("arco", "Ad arco"), v("trapezio", "Trapezio"),
    v("lunetta", "Lunetta (semicerchio)"), v("tonda", "Tonda / ovale"), v("triangolo", "Triangolare"), v("ogiva", "Ogivale (arco a punta)"),
  ],
};

export const ASSE_ALTEZZA_CASSONETTO: AsseDisegno = {
  codice: "altezza_cassonetto",
  nome: "Altezza cassonetto",
  obbligatorio: true,
  valori: [v("150", "150 mm"), v("200", "200 mm"), v("250", "250 mm"), v("300", "300 mm")],
};

export const ASSE_AVVOLGIMENTO: AsseDisegno = {
  codice: "avvolgimento",
  nome: "Avvolgimento",
  obbligatorio: true,
  // stessi codici della tapparella già nel listino
  valori: [v("manuale", "Manuale con cintino"), v("motorizzato", "Motorizzato (motore tubolare)"), v("motorizzato_radio", "Motorizzato radiocomando")],
};

export const ASSE_ZANZARIERA: AsseDisegno = {
  codice: "zanzariera",
  nome: "Zanzariera",
  obbligatorio: false,
  valori: [v("no", "Senza zanzariera"), v("si", "Con zanzariera")],
};

export const ASSE_MANIGLIA: AsseDisegno = {
  codice: "maniglia",
  nome: "Finitura maniglia",
  obbligatorio: false,
  valori: [v("argento", "Argento"), v("inox", "Inox"), v("bianco", "Bianco"), v("nero", "Nero"), v("ottone", "Ottone"), v("bronzo", "Bronzo")],
};

// ---- Persiane

export const ASSE_PERSIANA_APERTURA: AsseDisegno = {
  codice: "apertura_persiana",
  nome: "Apertura",
  obbligatorio: true,
  valori: [v("chiusa", "Chiusa"), v("aperta_45", "Aperta a 45°"), v("aperta_90", "Aperta a 90°"), v("anta_singola_aperta", "Anta singola aperta")],
};

export const ASSE_PERSIANA_LAMELLE: AsseDisegno = {
  codice: "lamelle",
  nome: "Lamelle",
  obbligatorio: true,
  valori: [v("fisse", "Lamelle fisse"), v("orientabili", "Lamelle orientabili")],
};

export const ASSE_PERSIANA_ALETTA: AsseDisegno = {
  codice: "aletta",
  nome: "Aletta",
  obbligatorio: false,
  // le misure vere dipendono dal produttore: vanno prese dalla scheda tecnica della linea
  valori: [v("nessuna", "Senza aletta"), v("28", "Aletta 28 mm"), v("30", "Aletta 30 mm"), v("35", "Aletta 35 mm"), v("40", "Aletta 40 mm"), v("60", "Aletta 60 mm"), v("65", "Aletta 65 mm")],
};

export const ASSI_DISEGNO: AsseDisegno[] = [
  ASSE_FORMA, ASSE_ALTEZZA_CASSONETTO, ASSE_AVVOLGIMENTO, ASSE_ZANZARIERA, ASSE_MANIGLIA,
  ASSE_PERSIANA_APERTURA, ASSE_PERSIANA_LAMELLE, ASSE_PERSIANA_ALETTA,
];

/** Quanti valori degli assi aspettano ancora un prezzo: tutti, finché l'azienda non li compila. */
export function maggiorazioniDaCompilare(): number {
  return ASSI_DISEGNO.reduce((tot, a) => tot + a.valori.filter((x) => x.maggiorazione.daCompilare).length, 0);
}

/** La forma dal codice del valore dell'asse Forma. */
export function formaDaCodice(codice: string | null | undefined): FormaSerramento {
  return codice === "arco" || codice === "trapezio" || codice === "lunetta" || codice === "tonda" || codice === "triangolo" || codice === "ogiva" ? codice : "rettangolare";
}

// ---- Apertura dei serramenti: dal codice del listino alle ante

export interface AperturaDisegno {
  codice: string;
  nome: string;
  ante: AntaDisegno[];
}

const batt = (lato: "dx" | "sx", principale = false): AntaDisegno => (principale ? { tipo: "battente", lato, principale } : { tipo: "battente", lato });
const ar = (lato: "dx" | "sx"): AntaDisegno => ({ tipo: "anta_ribalta", lato });

const UNA_ANTA: AperturaDisegno[] = [
  { codice: "battente_dx", nome: "Battente DX", ante: [batt("dx")] },
  { codice: "battente_sx", nome: "Battente SX", ante: [batt("sx")] },
  { codice: "anta_ribalta_dx", nome: "Anta-ribalta DX", ante: [ar("dx")] },
  { codice: "anta_ribalta_sx", nome: "Anta-ribalta SX", ante: [ar("sx")] },
];
const SERRATURA_PASSANTE: AperturaDisegno[] = UNA_ANTA.slice(0, 2);
const DUE_ANTE: AperturaDisegno[] = [
  { codice: "battente_principale_dx", nome: "Battente, anta principale DX", ante: [batt("sx"), batt("dx", true)] },
  { codice: "battente_principale_sx", nome: "Battente, anta principale SX", ante: [batt("sx", true), batt("dx")] },
  { codice: "ribalta_su_anta_dx", nome: "Anta-ribalta sull'anta DX (SX battente)", ante: [batt("sx"), ar("dx")] },
  { codice: "ribalta_su_anta_sx", nome: "Anta-ribalta sull'anta SX (DX battente)", ante: [ar("sx"), batt("dx")] },
  { codice: "ribalta_su_entrambe", nome: "Anta-ribalta su entrambe", ante: [ar("sx"), ar("dx")] },
];
const TRE_ANTE: AperturaDisegno[] = [
  { codice: "battente_tutte", nome: "Tutte a battente", ante: [batt("sx"), batt("dx"), batt("dx")] },
  { codice: "ribalta_laterali", nome: "Laterali anta-ribalta, centrale battente", ante: [ar("sx"), batt("dx"), ar("dx")] },
  { codice: "ribalta_centrale", nome: "Centrale anta-ribalta, laterali battente", ante: [batt("sx"), ar("dx"), batt("dx")] },
  { codice: "ribalta_tutte", nome: "Tutte anta-ribalta", ante: [ar("sx"), ar("dx"), ar("dx")] },
  { codice: "battente_2_1", nome: "2+1: coppia SX, singola DX", ante: [batt("sx"), batt("dx", true), batt("dx")] },
  { codice: "battente_1_2", nome: "1+2: singola SX, coppia DX", ante: [batt("sx"), batt("sx"), batt("dx", true)] },
];
const QUATTRO_ANTE: AperturaDisegno[] = [
  { codice: "battente_2_2", nome: "2+2: due coppie a battente", ante: [batt("sx"), batt("dx", true), batt("sx"), batt("dx", true)] },
  { codice: "ribalta_2_2", nome: "2+2: anta-ribalta sulle principali", ante: [batt("sx"), ar("dx"), batt("sx"), ar("dx")] },
];
const PORTONCINO_2: AperturaDisegno[] = [
  { codice: "principale_dx", nome: "Anta principale DX", ante: [batt("sx"), batt("dx", true)] },
  { codice: "principale_sx", nome: "Anta principale SX", ante: [batt("sx", true), batt("dx")] },
];

/** Le aperture per tipologia (id di TIPOLOGIE_DISEGNO): le scelte dell'asse Apertura e le ante che disegnano. */
const APERTURE_BATTENTI: Record<string, AperturaDisegno[]> = {
  finestra_1_anta: UNA_ANTA,
  finestra_arco: UNA_ANTA,
  finestra_1_anta_sopraluce: UNA_ANTA,
  finestra_1_anta_sottoluce: UNA_ANTA,
  finestra_2_ante_sopraluce: DUE_ANTE,
  finestra_2_ante_sopraluce_2_sezioni: DUE_ANTE,
  finestra_2_ante_sottoluce: DUE_ANTE,
  finestra_3_ante_sopraluce: TRE_ANTE,
  porta_finestra_2_ante_sopraluce: DUE_ANTE,
  finestra_2_ante: DUE_ANTE,
  finestra_3_ante: TRE_ANTE,
  finestra_4_ante: QUATTRO_ANTE,
  porta_finestra_4_ante: QUATTRO_ANTE,
  porta_finestra_1_anta: UNA_ANTA,
  porta_finestra_2_ante: DUE_ANTE,
  porta_finestra_3_ante: TRE_ANTE,
  portoncino_2_ante: PORTONCINO_2,
  portoncino_1_anta: SERRATURA_PASSANTE,
  monoblocco_1_anta: UNA_ANTA,
  monoblocco_2_ante: DUE_ANTE,
};

/** Il verso specchia lo schema completo, senza mandare nella stessa direzione le due ante centrali. */
const TIPOLOGIE_SCORREVOLI = ["traslante_4_ante", "alzante_as_fa", "alzante_fa_as_as_fa", "alzante_scomparsa", "traslante_fisso_telaio", "traslante_fisso_anta", "traslante_su_parete", "slide", "slide_plus", "finestra_scorrevole_2_ante", "smart_slide", "scorri_ribalta_patio"];

export function apertureDellaTipologia(tipologiaId: string): AperturaDisegno[] {
  if (TIPOLOGIE_SCORREVOLI.includes(tipologiaId) || tipologiaId === "porta_finestra_scorrevole_2_ante") {
    const base = TIPOLOGIE_DISEGNO.find((t) => t.id === tipologiaId);
    if (!base) return [];
    const latoBase = base.ante.find((a) => a.tipo === "scorrevole" || a.tipo === "alzante_scorrevole")?.lato ?? "dx";
    return (["dx", "sx"] as const).map((verso) => ({
      codice: `scorre_${verso}`,
      nome: `Scorre verso ${verso.toUpperCase()}`,
      ante: verso === latoBase ? base.ante.map((a) => ({ ...a })) : [...base.ante].reverse().map((a) => ({ ...a, ...(a.lato ? { lato: a.lato === "dx" ? "sx" as const : "dx" as const } : {}) })),
    }));
  }
  return APERTURE_BATTENTI[tipologiaId] ?? [];
}

/** Le ante di un'apertura del listino, o null se la tipologia o il codice non si conoscono. */
export function anteDaApertura(tipologiaId: string, codice: string | null | undefined): AntaDisegno[] | null {
  const a = apertureDellaTipologia(tipologiaId).find((x) => x.codice === codice);
  return a ? a.ante.map((x) => ({ ...x })) : null;
}

// ---- Persiane: le configurazioni di apertura delle schede

export interface ConfigurazionePersiana {
  codice: string;
  nome: string;
  gruppo: string;
  /** Se è una struttura (a libro, pacchetto, scorrevole, angolo) fissa anche il tipo di persiana. */
  tipo?: PersianaDisegno["tipo"];
  /** Quello che la configurazione imposta nel disegno, dalle misure. */
  parti: (larghezzaMm: number, altezzaMm: number) => Partial<PersianaDisegno>;
}

const cfg = (
  gruppo: string, codice: string, nome: string, parti: Partial<PersianaDisegno> | ConfigurazionePersiana["parti"], tipo?: PersianaDisegno["tipo"],
): ConfigurazionePersiana => ({ gruppo, codice, nome, tipo, parti: typeof parti === "function" ? parti : () => parti });

/**
 * Tutti i modi in cui una persiana si apre e si compone, come nelle schede del listino. Si disegnano chiuse.
 * Le larghezze delle ante asimmetriche e del vetro fisso sono proporzioni, non misure: seguono la larghezza.
 */
export const CONFIGURAZIONI_PERSIANA: ConfigurazionePersiana[] = [
  cfg("A battente", "1_anta_dx", "1 anta, cerniere a destra", { ante: 1, lato: "dx" }),
  cfg("A battente", "1_anta_sx", "1 anta, cerniere a sinistra", { ante: 1, lato: "sx" }),
  cfg("A battente", "2_ante", "2 ante", { ante: 2 }),
  cfg("A battente", "2_ante_asimm_principale_dx", "2 ante asimmetriche, principale a destra", { ante: 2, proporzioni: [0.4, 0.6] }),
  cfg("A battente", "2_ante_asimm_principale_sx", "2 ante asimmetriche, principale a sinistra", { ante: 2, proporzioni: [0.6, 0.4] }),
  cfg("A battente", "3_ante", "3 ante", { ante: 3 }),
  cfg("A battente", "3_ante_1_2_dx", "3 ante (1+2, a destra)", { ante: 3, cerniere: ["sx", "dx", "dx"] }),
  cfg("A battente", "3_ante_2_1_sx", "3 ante (2+1, a sinistra)", { ante: 3, cerniere: ["sx", "sx", "dx"] }),
  cfg("A battente", "4_ante", "4 ante", { ante: 4, cerniere: ["sx", "dx", "sx", "dx"] }),
  cfg("A battente", "4_ante_2_2", "4 ante (2+2)", { ante: 4, cerniere: ["sx", "sx", "dx", "dx"] }),
  cfg("A libro", "libro_2_ante", "A libro, 2 ante", { ante: 2 }, "a_libro"),
  cfg("A libro", "libro_3_ante", "A libro, 3 ante", { ante: 3 }, "a_libro"),
  cfg("A libro", "libro_4_ante", "A libro, 4 ante", { ante: 4 }, "a_libro"),
  cfg("A pacchetto", "pacchetto_3_ante_dx", "A pacchetto, 3 ante, a destra", { ante: 3, direzione: "dx" }, "pacchetto"),
  cfg("A pacchetto", "pacchetto_3_ante_sx", "A pacchetto, 3 ante, a sinistra", { ante: 3, direzione: "sx" }, "pacchetto"),
  cfg("A pacchetto", "pacchetto_4_ante_dx", "A pacchetto, 4 ante, a destra", { ante: 4, direzione: "dx" }, "pacchetto"),
  cfg("A pacchetto", "pacchetto_4_ante_sx", "A pacchetto, 4 ante, a sinistra", { ante: 4, direzione: "sx" }, "pacchetto"),
  cfg("Scorrevole", "scorrevole_1_anta_dx", "Scorrevole, 1 anta, verso destra", { ante: 1, direzione: "dx" }, "scorrevole"),
  cfg("Scorrevole", "scorrevole_1_anta_sx", "Scorrevole, 1 anta, verso sinistra", { ante: 1, direzione: "sx" }, "scorrevole"),
  cfg("Scorrevole", "scorrevole_2_ante", "Scorrevole, 2 ante", { ante: 2, direzione: "dx" }, "scorrevole"),
  cfg("Scorrevole", "scorrevole_2_ante_sovrapposte", "Scorrevole, 2 ante sovrapposte", { ante: 2, direzione: "dx", sovrapposte: true }, "scorrevole"),
  cfg("Ad angolo", "angolo_2_ante", "Ad angolo, 2 ante", { ante: 2 }, "angolo"),
  cfg("Ad angolo", "angolo_3_ante", "Ad angolo, 3 ante", { ante: 3 }, "angolo"),
  cfg("Con vetro fisso", "con_sopraluce", "Con sopraluce di vetro fisso", (_l, h) => ({ ante: 2, sopraluceMm: Math.round(h * 0.25) })),
  cfg("Con vetro fisso", "pannello_fisso_superiore", "Con pannello fisso superiore", (_l, h) => ({ ante: 2, sopraluceMm: Math.round(h * 0.25) })),
  cfg("Con vetro fisso", "pannello_fisso_laterale_dx", "Con pannello fisso laterale, a destra", (l) => ({ ante: 1, pannelloFisso: { lato: "dx" as const, larghezzaMm: Math.round(l * 0.34) } })),
  cfg("Con vetro fisso", "pannello_fisso_laterale_sx", "Con pannello fisso laterale, a sinistra", (l) => ({ ante: 1, lato: "dx" as const, pannelloFisso: { lato: "sx" as const, larghezzaMm: Math.round(l * 0.34) } })),
];

/** La configurazione dal suo codice, o undefined. */
export function configurazionePersiana(codice: string | null | undefined): ConfigurazionePersiana | undefined {
  return CONFIGURAZIONI_PERSIANA.find((c) => c.codice === codice);
}

/** Le parti da aggiungere a una persiana per una configurazione, alle sue misure; vuote se il codice non si conosce. */
export function persianaDaConfigurazione(codice: string | null | undefined, larghezzaMm: number, altezzaMm: number): Partial<PersianaDisegno> {
  const c = configurazionePersiana(codice);
  if (!c) return {};
  return { ...c.parti(larghezzaMm, altezzaMm), ...(c.tipo ? { tipo: c.tipo } : {}) };
}
