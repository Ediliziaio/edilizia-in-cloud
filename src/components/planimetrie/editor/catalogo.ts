/**
 * Catalogo di arredi e sanitari (fase 3): i tipi sono quelli che le esportazioni sanno disegnare
 * (`src/lib/planimetrie/esporta/simboli.ts`), con le misure più comuni in cm.
 */
export interface VoceCatalogo {
  tipo: string;
  nome: string;
  gruppo: "Bagno" | "Cucina" | "Camere" | "Soggiorno" | "Impianti" | "Struttura";
  larghezza: number;
  profondita: number;
  altezza: number;
}

export const CATALOGO: VoceCatalogo[] = [
  { tipo: "wc", nome: "WC", gruppo: "Bagno", larghezza: 38, profondita: 55, altezza: 40 },
  { tipo: "bidet", nome: "Bidet", gruppo: "Bagno", larghezza: 38, profondita: 55, altezza: 40 },
  { tipo: "lavabo", nome: "Lavabo", gruppo: "Bagno", larghezza: 60, profondita: 45, altezza: 85 },
  { tipo: "doccia", nome: "Doccia", gruppo: "Bagno", larghezza: 80, profondita: 80, altezza: 200 },
  { tipo: "vasca", nome: "Vasca", gruppo: "Bagno", larghezza: 170, profondita: 70, altezza: 55 },
  { tipo: "lavatrice", nome: "Lavatrice", gruppo: "Bagno", larghezza: 60, profondita: 60, altezza: 85 },
  { tipo: "cucina", nome: "Cucina lineare", gruppo: "Cucina", larghezza: 240, profondita: 60, altezza: 90 },
  { tipo: "frigorifero", nome: "Frigorifero", gruppo: "Cucina", larghezza: 60, profondita: 65, altezza: 185 },
  { tipo: "tavolo", nome: "Tavolo", gruppo: "Cucina", larghezza: 140, profondita: 80, altezza: 75 },
  { tipo: "sedia", nome: "Sedia", gruppo: "Cucina", larghezza: 45, profondita: 50, altezza: 90 },
  { tipo: "letto_matrimoniale", nome: "Letto matrimoniale", gruppo: "Camere", larghezza: 160, profondita: 200, altezza: 45 },
  { tipo: "letto_singolo", nome: "Letto singolo", gruppo: "Camere", larghezza: 90, profondita: 200, altezza: 45 },
  { tipo: "comodino", nome: "Comodino", gruppo: "Camere", larghezza: 45, profondita: 40, altezza: 50 },
  { tipo: "armadio", nome: "Armadio", gruppo: "Camere", larghezza: 200, profondita: 60, altezza: 240 },
  { tipo: "scrivania", nome: "Scrivania", gruppo: "Camere", larghezza: 120, profondita: 60, altezza: 75 },
  { tipo: "divano", nome: "Divano", gruppo: "Soggiorno", larghezza: 200, profondita: 90, altezza: 85 },
  { tipo: "caldaia", nome: "Caldaia", gruppo: "Impianti", larghezza: 45, profondita: 35, altezza: 75 },
  // Punti impianto (fase 7): simboli grandi abbastanza da vedersi in pianta; si contano nel computo.
  { tipo: "presa", nome: "Presa", gruppo: "Impianti", larghezza: 24, profondita: 24, altezza: 30 },
  { tipo: "interruttore", nome: "Interruttore", gruppo: "Impianti", larghezza: 24, profondita: 24, altezza: 110 },
  { tipo: "punto_luce", nome: "Punto luce", gruppo: "Impianti", larghezza: 30, profondita: 30, altezza: 270 },
  { tipo: "quadro_elettrico", nome: "Quadro elettrico", gruppo: "Impianti", larghezza: 40, profondita: 15, altezza: 160 },
  { tipo: "punto_acqua", nome: "Punto acqua", gruppo: "Impianti", larghezza: 24, profondita: 24, altezza: 50 },
  { tipo: "scarico", nome: "Scarico", gruppo: "Impianti", larghezza: 24, profondita: 24, altezza: 0 },
  { tipo: "termosifone", nome: "Termosifone", gruppo: "Impianti", larghezza: 80, profondita: 12, altezza: 60 },
  { tipo: "split", nome: "Split clima", gruppo: "Impianti", larghezza: 90, profondita: 25, altezza: 220 },
  // Le partenze delle linee stimate (shared/planimetrie/impianti.ts).
  { tipo: "unita_esterna", nome: "Unità esterna clima", gruppo: "Impianti", larghezza: 80, profondita: 30, altezza: 30 },
  { tipo: "collettore", nome: "Collettore acqua", gruppo: "Impianti", larghezza: 50, profondita: 12, altezza: 40 },
  { tipo: "colonna_scarico", nome: "Colonna di scarico", gruppo: "Impianti", larghezza: 16, profondita: 16, altezza: 0 },
  // Struttura: pilastri di capannoni, garage, piani pilotis.
  { tipo: "pilastro", nome: "Pilastro", gruppo: "Struttura", larghezza: 30, profondita: 30, altezza: 300 },
];

export const GRUPPI_CATALOGO = ["Bagno", "Cucina", "Camere", "Soggiorno", "Impianti", "Struttura"] as const;

export const nomeDelTipo = (tipo: string) => CATALOGO.find((v) => v.tipo === tipo)?.nome ?? tipo.replace(/_/g, " ");
