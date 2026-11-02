/**
 * Serramenti: ante, sistema di apertura e controtelaio.
 *
 * Il controtelaio è la cornice murata nel vano (in lamiera o legno) a cui si fissa il serramento: si ordina
 * prima della posa, quindi serve già in fase di computo. Le misure qui sono di massima (1 cm di fuga per lato
 * fra vano e controtelaio, 1,5 cm per lato fra controtelaio e telaio); il serramentista conferma in cantiere.
 */
import type { Apertura, Muro, SistemaApertura } from "./modello.ts";

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

type Dati = Pick<Apertura, "tipo" | "larghezza" | "manovra"> & Partial<Pick<Apertura, "ante" | "sistema">>;

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
}

const FUGA_FORO = 1, FUGA_TELAIO = 1.5, MONTANTE = 6;

export function misureSerramento(a: Dati & Pick<Apertura, "altezza">, muro?: Pick<Muro, "spessore">): MisureSerramento {
  const sistema = sistemaDi(a), ante = Math.max(1, anteDi(a));
  const cl = a.larghezza - 2 * FUGA_FORO, ca = a.altezza - FUGA_FORO;
  const speciale = sistema === "scorrevole_scomparsa";
  const tl = cl - 2 * FUGA_TELAIO, ta = ca - FUGA_TELAIO;
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
  };
}
