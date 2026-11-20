import type { ModelloComputo } from "./modelloComputo";

export const STILI_COPERTINA_COMPUTO = ["piena", "editoriale", "fascia", "sobria", "fotografica", "diagonale", "cornice", "colonna"] as const;
export type StileCopertinaComputo = typeof STILI_COPERTINA_COMPUTO[number];
export const COPERTINE_COMPUTO: ReadonlyArray<{ id: StileCopertinaComputo; nome: string; descrizione: string }> = [
  { id: "piena", nome: "Architettura", descrizione: "Colore pieno e trama tecnica, con titolo e riferimenti in evidenza." },
  { id: "editoriale", nome: "Editoriale", descrizione: "Carta chiara, ampio respiro e un dettaglio nel colore del marchio." },
  { id: "fascia", nome: "Compatta", descrizione: "Una copertina ordinata, con una fascia a colori e i dati del progetto." },
  { id: "sobria", nome: "Essenziale", descrizione: "Bianco, tipografia e un filetto sottile: spazio al tuo progetto." },
  { id: "fotografica", nome: "Panoramica", descrizione: "Immagine protagonista in alto e titolo su fondo a colori. Funziona anche senza foto." },
  { id: "diagonale", nome: "Dinamica", descrizione: "Tagli diagonali nel colore del marchio e un impianto chiaro e moderno." },
  { id: "cornice", nome: "Cornice", descrizione: "Una doppia cornice sottile, fondo caldo e dettagli essenziali." },
  { id: "colonna", nome: "Laterale", descrizione: "Una banda verticale a colori accompagna titolo, logo e riferimenti." },
];

/** Le due vecchie testate restano compatte finché l'azienda non sceglie esplicitamente una copertina. */
export function haPaginaCopertina(veste?: Pick<ModelloComputo, "copertina" | "copertinaSeparata">, attiva = true): boolean {
  return attiva && (veste?.copertinaSeparata ?? !["fascia", "sobria"].includes(veste?.copertina ?? "piena"));
}

export function attivaCopertina(modello: ModelloComputo, copertina: StileCopertinaComputo): ModelloComputo {
  return { ...modello, copertina, copertinaSeparata: true, sezioni: { ...modello.sezioni, copertina: true } };
}
