/**
 * Serramenti: ante, sistema di apertura e controtelaio.
 *
 * Il controtelaio è la cornice murata nel vano (in lamiera o legno) a cui si fissa il serramento: si ordina
 * prima della posa, quindi serve già in fase di computo. Le misure qui sono di massima (1 cm di fuga per lato
 * fra vano e controtelaio, 1,5 cm per lato fra controtelaio e telaio); il serramentista conferma in cantiere.
 */
import type { Apertura, Muro, Punto, SistemaApertura, TipoCassonetto, TipoOscurante, TipoZanzariera } from "./modello.ts";

export const NOMI_SISTEMA: Record<SistemaApertura, string> = {
  battente: "A battente",
  anta_ribalta: "Anta e ribalta",
  vasistas: "A vasistas",
  scorrevole: "Scorrevole",
  scorrevole_scomparsa: "Scorrevole a scomparsa",
  alzante_scorrevole: "Alzante scorrevole",
  libro: "A libro",
  fisso: "Fisso",
};

const SCORREVOLI: readonly SistemaApertura[] = ["scorrevole", "scorrevole_scomparsa", "alzante_scorrevole"];
const SISTEMI_FINESTRA: readonly SistemaApertura[] = ["battente", "anta_ribalta", "vasistas", "scorrevole", "libro", "fisso"];
const SISTEMI_PORTA: readonly SistemaApertura[] = ["battente", "scorrevole", "scorrevole_scomparsa", "libro"];
const SISTEMI_PORTAFINESTRA: readonly SistemaApertura[] = ["battente", "anta_ribalta", "scorrevole", "alzante_scorrevole", "libro", "fisso"];

/** I sistemi che hanno senso per il tipo di apertura. */
export function sistemiAmmessi(tipo: Apertura["tipo"]): readonly SistemaApertura[] {
  return tipo === "finestra" ? SISTEMI_FINESTRA : tipo === "porta" ? SISTEMI_PORTA : tipo === "portafinestra" ? SISTEMI_PORTAFINESTRA : [];
}

type Dati = Pick<Apertura, "tipo" | "larghezza" | "manovra"> & Partial<Pick<Apertura, "ante" | "sistema" | "oscurante" | "cassonetto" | "altezzaCassonetto" | "motore" | "zanzariera">>;

export function sistemaDi(a: Dati): SistemaApertura {
  if (a.sistema) return a.sistema;
  return a.manovra === "scorrevole" ? "scorrevole" : "battente";
}

export const eScorrevole = (s: SistemaApertura) => SCORREVOLI.includes(s);

/** La manovra coerente con un sistema (la manovra resta il campo che leggono disegno e render). */
export function manovraDi(s: SistemaApertura): Apertura["manovra"] {
  return eScorrevole(s) ? "scorrevole" : s === "fisso" ? "nessuna" : "battente";
}

/** Quante ante ha: quelle scritte, altrimenti una (due per finestre e portefinestre larghe più di 1,4 m). */
export function anteDi(a: Dati): number {
  if (a.ante && a.ante >= 1) return Math.round(a.ante);
  if (a.tipo === "varco") return 0;
  return a.tipo !== "porta" && a.larghezza > 140 ? 2 : 1;
}

export const NOMI_OSCURANTE: Record<TipoOscurante, string> = {
  tapparella: "Tapparella",
  veneziana: "Veneziana esterna",
  persiana: "Persiana",
  scuro: "Scuri interni",
};
export const NOMI_CASSONETTO: Record<TipoCassonetto, string> = {
  monoblocco: "Monoblocco (nel vano)",
  a_filo: "Murato a filo",
  esterno: "Esterno a vista",
};

/** Solo finestre e portefinestre hanno l'oscurante (le porte interne e i varchi no). */
export function oscuranteAmmessi(tipo: Apertura["tipo"]): readonly TipoOscurante[] {
  return tipo === "finestra" || tipo === "portafinestra" ? ["tapparella", "veneziana", "persiana", "scuro"] : [];
}

export const eAvvolgibile = (o: TipoOscurante | null | undefined): o is "tapparella" | "veneziana" => o === "tapparella" || o === "veneziana";

export function oscuranteDi(a: Dati): TipoOscurante | null {
  return a.oscurante && oscuranteAmmessi(a.tipo).includes(a.oscurante) ? a.oscurante : null;
}

/** Il cassonetto c'è solo per tapparelle e veneziane; senza scelta è un monoblocco. */
export function cassonettoDi(a: Dati): TipoCassonetto | null {
  return eAvvolgibile(oscuranteDi(a)) ? a.cassonetto ?? "monoblocco" : null;
}

/**
 * Altezza del cassonetto consigliata: sale col vano (più telo da arrotolare). Le veneziane hanno il pacchetto
 * delle lamelle, qualche centimetro in più.
 */
export function altezzaCassonettoConsigliata(altezzaVano: number, oscurante: TipoOscurante = "tapparella"): number {
  const base = altezzaVano <= 150 ? 22 : altezzaVano <= 210 ? 25 : altezzaVano <= 250 ? 30 : 35;
  return base + (oscurante === "veneziana" ? 5 : 0);
}

const altezzaCassonetto = (a: Dati & Pick<Apertura, "altezza">): number =>
  a.altezzaCassonetto && a.altezzaCassonetto > 0 ? a.altezzaCassonetto : altezzaCassonettoConsigliata(a.altezza, oscuranteDi(a) ?? "tapparella");

export interface MisureOscurante {
  tipo: TipoOscurante;
  avvolgibile: boolean;
  /** Ante di persiane e scuri (1 per tapparelle e veneziane). */
  ante: number;
  cassonetto: { tipo: TipoCassonetto; larghezza: number; altezza: number; profondita: number } | null;
  /** Muro libero che serve SOPRA il vano per il cassonetto, cm (0 se sta dentro il vano o non c'è). */
  spazioSopra: number;
  /** Il telo (tapparella o veneziana) o le ante (persiana, scuri). */
  telo: { larghezza: number; altezza: number };
  superficieMq: number;
  /** Guide laterali, m (due per ogni telo). */
  guideMl: number;
  /** Albero di avvolgimento, m. */
  alberoMl: number;
  motore: boolean;
}

const GUIDE = 4;

/** Misure di massima dell'oscurante e del cassonetto (null se la finestra non ne ha). */
export function misureOscurante(a: Dati & Pick<Apertura, "altezza">): MisureOscurante | null {
  const tipo = oscuranteDi(a);
  if (!tipo) return null;
  const avv = eAvvolgibile(tipo);
  const cassTipo = cassonettoDi(a);
  const ca = altezzaCassonetto(a);
  const base = misureSerramentoBase(a);
  const cassonetto = cassTipo
    ? { tipo: cassTipo, larghezza: Math.round(a.larghezza - 2 * FUGA_FORO), altezza: ca, profondita: cassTipo === "esterno" ? ca : Math.max(ca, 25) }
    : null;
  const altezzaTelo = Math.max(0, base.altezzaLuce - (cassTipo === "monoblocco" ? ca : 0));
  const telo = avv
    ? { larghezza: Math.round((base.larghezzaTelaio - 2 * GUIDE) * 10) / 10, altezza: Math.round(altezzaTelo * 10) / 10 }
    : { larghezza: a.larghezza, altezza: a.altezza };
  const ante = avv ? 1 : Math.max(1, anteDi(a));
  return {
    tipo,
    avvolgibile: avv,
    ante,
    cassonetto,
    spazioSopra: cassTipo && cassTipo !== "monoblocco" ? ca : 0,
    telo,
    superficieMq: Math.round(((telo.larghezza * telo.altezza) / 10_000) * 100) / 100,
    guideMl: avv ? Math.round(((2 * telo.altezza) / 100) * 100) / 100 : 0,
    alberoMl: avv ? Math.round((telo.larghezza / 100) * 100) / 100 : 0,
    motore: avv && !!a.motore,
  };
}

export const NOMI_ZANZARIERA: Record<TipoZanzariera, string> = {
  laterale: "Zanzariera laterale",
  verticale: "Zanzariera a rullo",
  plisse: "Zanzariera plissé",
  battente: "Zanzariera a battente",
  incastro: "Zanzariera a incastro",
};

/** Solo finestre e portefinestre hanno la zanzariera. */
export function zanzarieraAmmessa(tipo: Apertura["tipo"]): boolean {
  return tipo === "finestra" || tipo === "portafinestra";
}

export function zanzarieraDi(a: Dati): TipoZanzariera | null {
  return a.zanzariera && zanzarieraAmmessa(a.tipo) ? a.zanzariera : null;
}

export interface MisureZanzariera {
  tipo: TipoZanzariera;
  /** Il telo, cm: la luce del serramento meno 2 cm per lato di appoggio. */
  larghezza: number;
  altezza: number;
  superficieMq: number;
  /** Ante o teli (2 se laterale o plissé e la luce supera 2 m). */
  ante: number;
  /** Guide, binari o telaio da ordinare, m (rullo: due guide verticali; laterale e plissé: binario alto e basso; battente e incastro: il telaio). */
  guideMl: number;
}

/** Misure di massima della zanzariera (null se la finestra non ne ha). */
export function misureZanzariera(a: Dati & Pick<Apertura, "altezza">): MisureZanzariera | null {
  const tipo = zanzarieraDi(a);
  if (!tipo) return null;
  const t = misureSerramento(a).telaio;
  const larghezza = Math.round((t.larghezza - 4) * 10) / 10, altezza = Math.round((t.altezza - 4) * 10) / 10;
  const ante = (tipo === "laterale" || tipo === "plisse") && larghezza > 200 ? 2 : tipo === "battente" && larghezza > 100 ? 2 : 1;
  const guide = tipo === "verticale" ? 2 * altezza : tipo === "laterale" || tipo === "plisse" ? 2 * larghezza : 2 * (larghezza + altezza);
  return {
    tipo,
    larghezza,
    altezza,
    superficieMq: Math.round(((larghezza * altezza) / 10_000) * 100) / 100,
    ante,
    guideMl: Math.round((guide / 100) * 100) / 100,
  };
}

/**
 * Da che parte del muro è l'esterno: +1 se sta dalla parte della normale `n`, −1 dalla parte opposta, 0 se
 * non si capisce (nessuna stanza da un lato né dall'altro, o stanze da tutti e due). `centro` è il punto
 * dell'asse al centro del vano; vale in qualunque sistema di coordinate, purché `n` e i contorni siano nello stesso.
 */
export function latoEsterno(centro: Punto, n: Punto, spessore: number, locali: Punto[][]): 1 | -1 | 0 {
  const dentro = (p: Punto, poly: Punto[]) => {
    let r = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) r = !r;
    }
    return r;
  };
  const k = spessore / 2 + 6, len = Math.hypot(n.x, n.y) || 1;
  const prova = (sgn: number) => {
    const p = { x: centro.x + (n.x / len) * k * sgn, y: centro.y + (n.y / len) * k * sgn };
    return locali.some((c) => c.length >= 3 && dentro(p, c));
  };
  const piu = prova(1), meno = prova(-1);
  return piu && !meno ? -1 : meno && !piu ? 1 : 0;
}

export interface MisureSerramento {
  /** Il vano disegnato (foro murario), cm. */
  foro: { larghezza: number; altezza: number };
  /** La cornice murata: foro meno 1 cm per lato. */
  controtelaio: { larghezza: number; altezza: number; profondita: number };
  /** Il serramento (telaio fisso): controtelaio meno 1,5 cm per lato. */
  telaio: { larghezza: number; altezza: number };
  /** Larghezza di un'anta (telaio meno i montanti centrali, diviso le ante). */
  anta: number;
  /** Lunghezza di muro libero che serve a fianco per la porta a scomparsa, cm (0 se non serve). */
  tascaScomparsa: number;
  /** Perimetro del controtelaio, m (per sigillature e nastri). */
  perimetroMl: number;
  /** Superficie del serramento, m². */
  superficieMq: number;
  /** Il controtelaio è speciale (cassa per porta a scomparsa)? */
  controtelaioSpeciale: boolean;
  /** Il controtelaio porta anche il cassonetto (monoblocco)? */
  controtelaioMonoblocco: boolean;
  /** Altezza del cassonetto dentro il vano, cm (0 se non è un monoblocco). */
  cassonettoNelVano: number;
}

const FUGA_FORO = 1, FUGA_TELAIO = 1.5, MONTANTE = 6;

/** Larghezza e altezza del telaio e della luce libera (senza cassonetto monoblocco), prima di arrotondare. */
function misureSerramentoBase(a: Dati & Pick<Apertura, "altezza">) {
  const larghezzaTelaio = a.larghezza - 2 * FUGA_FORO - 2 * FUGA_TELAIO;
  const altezzaLuce = a.altezza - FUGA_FORO - FUGA_TELAIO;
  return { larghezzaTelaio, altezzaLuce };
}

export function misureSerramento(a: Dati & Pick<Apertura, "altezza">, muro?: Pick<Muro, "spessore">): MisureSerramento {
  const sistema = sistemaDi(a), ante = Math.max(1, anteDi(a));
  const cl = a.larghezza - 2 * FUGA_FORO, ca = a.altezza - FUGA_FORO;
  const speciale = sistema === "scorrevole_scomparsa";
  // il monoblocco si prende l'altezza del cassonetto dal vano: il serramento vero e proprio è più basso
  const monoblocco = cassonettoDi(a) === "monoblocco";
  const cass = monoblocco ? altezzaCassonetto(a) : 0;
  const tl = cl - 2 * FUGA_TELAIO, ta = ca - FUGA_TELAIO - cass;
  const sp = muro?.spessore ?? 20;
  return {
    foro: { larghezza: a.larghezza, altezza: a.altezza },
    // la cassa della porta a scomparsa è larga il doppio della luce e profonda almeno 10 cm di tramezzo + guaina
    controtelaio: { larghezza: Math.round(cl * 10) / 10, altezza: Math.round(ca * 10) / 10, profondita: speciale ? Math.max(sp, 10) : sp },
    telaio: { larghezza: Math.round(tl * 10) / 10, altezza: Math.round(ta * 10) / 10 },
    anta: Math.round(((tl - MONTANTE * (ante - 1)) / ante) * 10) / 10,
    tascaScomparsa: speciale ? Math.round(a.larghezza + 5) : 0,
    perimetroMl: Math.round(((2 * (cl + ca)) / 100) * 100) / 100,
    superficieMq: Math.round(((a.larghezza * a.altezza) / 10_000) * 100) / 100,
    controtelaioSpeciale: speciale,
    controtelaioMonoblocco: monoblocco,
    cassonettoNelVano: cass,
  };
}
