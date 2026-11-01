/**
 * Catalogo di arredi e sanitari (fase 3): i tipi sono quelli che le esportazioni sanno disegnare
 * (`src/lib/planimetrie/esporta/simboli.ts`), con le misure più comuni in cm.
 */
export interface VoceCatalogo {
  tipo: string;
  nome: string;
  gruppo: "Bagno" | "Cucina" | "Camere" | "Soggiorno" | "Impianti";
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
];

export const GRUPPI_CATALOGO = ["Bagno", "Cucina", "Camere", "Soggiorno", "Impianti"] as const;

export const nomeDelTipo = (tipo: string) => CATALOGO.find((v) => v.tipo === tipo)?.nome ?? tipo.replace(/_/g, " ");
