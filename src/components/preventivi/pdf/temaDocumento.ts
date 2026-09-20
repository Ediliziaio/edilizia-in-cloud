/**
 * Il tema del documento: dal colore dell'azienda a tutto il resto.
 *
 * Un solo colore in ingresso (più due facoltativi) e ne escono le varianti che
 * servono a impaginare: il fondo per il testo bianco, l'inchiostro per scrivere
 * sul bianco, le tinte chiare per i riquadri. Così «cambi azienda, il documento
 * cambia faccia», e resta leggibile anche con un marchio lime o giallo.
 */
import {
  fondoPerTestoBianco, normalizzaHex, schiarisci, scurisci, testoSopra, testoSuChiaro, testoSuScuro,
} from "../../../../supabase/functions/_shared/temaColori";

export interface TemaDocumento {
  /** Il colore dell'azienda, com'è. */
  marca: string;
  /** Il colore dell'azienda adatto a fare da fondo al testo bianco. */
  fondo: string;
  fondoScuro: string;
  /** Il colore dell'azienda adatto a scrivere sul bianco (numeri, occhielli). */
  inchiostroMarca: string;
  tinta: string;
  tintaForte: string;
  secondario: string;
  accento: string;
  inchiostro: string;
  grigio: string;
  grigioChiaro: string;
  filetto: string;
  carta: string;
  cartaCalda: string;
  bianco: string;
}

/** Blu notte: il colore di chi non ne ha ancora scelto uno. */
export const COLORE_DI_SERIE = "#1E3A5F";

export function creaTema(colori: { primario?: string | null; secondario?: string | null; accento?: string | null }): TemaDocumento {
  const marca = normalizzaHex(colori.primario) ?? COLORE_DI_SERIE;
  const fondo = fondoPerTestoBianco(marca);
  return {
    marca,
    fondo,
    fondoScuro: scurisci(fondo, 0.38),
    inchiostroMarca: testoSuChiaro(marca),
    tinta: schiarisci(marca, 0.92),
    tintaForte: schiarisci(marca, 0.8),
    secondario: normalizzaHex(colori.secondario) ?? marca,
    accento: normalizzaHex(colori.accento) ?? marca,
    inchiostro: "#14181F",
    grigio: "#5B6472",
    grigioChiaro: "#8A93A0",
    filetto: "#E3E6EA",
    carta: "#FFFFFF",
    cartaCalda: "#F7F6F3",
    bianco: "#FFFFFF",
  };
}

/** I colori della copertina: fondo scelto (o quello dell'azienda) e testo leggibile sopra. */
export function coloriCopertina(tema: TemaDocumento, scelti: { fondo?: string | null; testo?: string | null }) {
  const fondo = normalizzaHex(scelti.fondo) ?? tema.fondoScuro;
  const testoScelto = normalizzaHex(scelti.testo);
  const testo = testoScelto ?? testoSopra(fondo);
  // L'evidenza (occhiello, parola in corsivo): la tinta dell'azienda schiarita
  // finché si legge sul fondo della copertina.
  const evidenza = testoSuScuro(schiarisci(tema.marca, 0.45), fondo, 4.5);
  return { fondo, testo, evidenza };
}

/**
 * La copertina è «in tinta»: la foto va in scala di grigi e prende il colore
 * dell'azienda. È la regola, perché è ciò che fa di due documenti due aziende
 * diverse. Solo con un velo quasi assente (sotto il 25%) l'azienda sta dicendo
 * che vuole vedere la foto com'è: allora resta a colori, con un velo scuro.
 */
export function copertinaInTinta(opacitaVelo: number | null | undefined): boolean {
  return (opacitaVelo ?? 0.6) >= 0.25;
}
