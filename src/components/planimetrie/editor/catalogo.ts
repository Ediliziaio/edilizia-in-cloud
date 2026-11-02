/**
 * Catalogo di arredi e sanitari (fase 3): i tipi sono quelli che le esportazioni sanno disegnare
 * (`src/lib/planimetrie/esporta/simboli.ts`), con le misure più comuni in cm.
 */
import { CAMPI } from "@/lib/planimetrie/campiSport";

export interface VoceCatalogo {
  tipo: string;
  nome: string;
  gruppo: "Bagno" | "Cucina" | "Camere" | "Soggiorno" | "Esterni e garage" | "Giardino e piscina" | "Sport" | "Impianti" | "Energia" | "Struttura";
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
  { tipo: "cucina_angolare", nome: "Cucina ad angolo", gruppo: "Cucina", larghezza: 300, profondita: 240, altezza: 90 },
  { tipo: "isola_cucina", nome: "Isola con sgabelli", gruppo: "Cucina", larghezza: 180, profondita: 90, altezza: 90 },
  { tipo: "lavastoviglie", nome: "Lavastoviglie", gruppo: "Cucina", larghezza: 60, profondita: 60, altezza: 85 },
  { tipo: "frigorifero", nome: "Frigorifero", gruppo: "Cucina", larghezza: 60, profondita: 65, altezza: 185 },
  { tipo: "tavolo", nome: "Tavolo", gruppo: "Cucina", larghezza: 140, profondita: 80, altezza: 75 },
  { tipo: "sedia", nome: "Sedia", gruppo: "Cucina", larghezza: 45, profondita: 50, altezza: 90 },
  { tipo: "letto_matrimoniale", nome: "Letto matrimoniale", gruppo: "Camere", larghezza: 160, profondita: 200, altezza: 45 },
  { tipo: "letto_singolo", nome: "Letto singolo", gruppo: "Camere", larghezza: 90, profondita: 200, altezza: 45 },
  { tipo: "comodino", nome: "Comodino", gruppo: "Camere", larghezza: 45, profondita: 40, altezza: 50 },
  { tipo: "armadio", nome: "Armadio", gruppo: "Camere", larghezza: 200, profondita: 60, altezza: 240 },
  { tipo: "scrivania", nome: "Scrivania", gruppo: "Camere", larghezza: 120, profondita: 60, altezza: 75 },
  { tipo: "divano", nome: "Divano 3 posti", gruppo: "Soggiorno", larghezza: 210, profondita: 90, altezza: 85 },
  { tipo: "divano_angolare", nome: "Divano angolare", gruppo: "Soggiorno", larghezza: 280, profondita: 170, altezza: 85 },
  { tipo: "poltrona", nome: "Poltrona", gruppo: "Soggiorno", larghezza: 85, profondita: 85, altezza: 90 },
  { tipo: "mobile_tv", nome: "Mobile TV", gruppo: "Soggiorno", larghezza: 180, profondita: 45, altezza: 50 },
  { tipo: "libreria", nome: "Libreria", gruppo: "Soggiorno", larghezza: 160, profondita: 35, altezza: 200 },
  { tipo: "tavolo_rotondo", nome: "Tavolo rotondo", gruppo: "Soggiorno", larghezza: 110, profondita: 110, altezza: 75 },
  { tipo: "auto", nome: "Auto", gruppo: "Esterni e garage", larghezza: 180, profondita: 450, altezza: 150 },
  { tipo: "scaffale", nome: "Scaffalatura", gruppo: "Esterni e garage", larghezza: 300, profondita: 100, altezza: 400 },
  { tipo: "banco_lavoro", nome: "Banco da lavoro", gruppo: "Esterni e garage", larghezza: 200, profondita: 80, altezza: 90 },
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
  { tipo: "termostato", nome: "Termostato", gruppo: "Impianti", larghezza: 14, profondita: 6, altezza: 150 },
  { tipo: "vmc", nome: "VMC (ventilazione)", gruppo: "Impianti", larghezza: 60, profondita: 45, altezza: 260 },
  // Giardino e piscina: fuori casa, a terra (la piscina è interrata: in pianta il bordo e l'acqua)
  { tipo: "piscina", nome: "Piscina", gruppo: "Giardino e piscina", larghezza: 800, profondita: 400, altezza: 0 },
  { tipo: "idromassaggio", nome: "Minipiscina idromassaggio", gruppo: "Giardino e piscina", larghezza: 220, profondita: 220, altezza: 0 },
  { tipo: "pergola", nome: "Pergola", gruppo: "Giardino e piscina", larghezza: 400, profondita: 300, altezza: 250 },
  { tipo: "albero", nome: "Albero", gruppo: "Giardino e piscina", larghezza: 300, profondita: 300, altezza: 0 },
  { tipo: "siepe", nome: "Siepe", gruppo: "Giardino e piscina", larghezza: 300, profondita: 60, altezza: 120 },
  { tipo: "aiuola", nome: "Aiuola", gruppo: "Giardino e piscina", larghezza: 200, profondita: 100, altezza: 0 },
  { tipo: "ombrellone", nome: "Ombrellone", gruppo: "Giardino e piscina", larghezza: 300, profondita: 300, altezza: 0 },
  { tipo: "lettino", nome: "Lettino prendisole", gruppo: "Giardino e piscina", larghezza: 70, profondita: 190, altezza: 0 },
  { tipo: "tavolo_esterno", nome: "Tavolo da esterno", gruppo: "Giardino e piscina", larghezza: 200, profondita: 100, altezza: 0 },
  { tipo: "barbecue", nome: "Barbecue in muratura", gruppo: "Giardino e piscina", larghezza: 150, profondita: 60, altezza: 0 },
  { tipo: "cancello_pedonale", nome: "Cancello pedonale", gruppo: "Giardino e piscina", larghezza: 110, profondita: 12, altezza: 150 },
  { tipo: "cancello_carrabile", nome: "Cancello carrabile", gruppo: "Giardino e piscina", larghezza: 400, profondita: 12, altezza: 150 },
  // Punto quotato del terreno: la quota si scrive nel pannello; con due o più punti il terreno
  // è in pendenza (nel 3D) e la pianta ha le curve di livello (shared/planimetrie/terreno.ts).
  { tipo: "quota_terreno", nome: "Quota del terreno (punto quotato)", gruppo: "Giardino e piscina", larghezza: 40, profondita: 40, altezza: 0 },
  { tipo: "lampione", nome: "Lampione da giardino", gruppo: "Giardino e piscina", larghezza: 30, profondita: 30, altezza: 300 },
  { tipo: "faretto_giardino", nome: "Faretto / segnapasso", gruppo: "Giardino e piscina", larghezza: 15, profondita: 15, altezza: 0 },
  { tipo: "irrigatore", nome: "Irrigatore", gruppo: "Giardino e piscina", larghezza: 20, profondita: 20, altezza: 0 },
  { tipo: "pozzetto", nome: "Pozzetto", gruppo: "Giardino e piscina", larghezza: 40, profondita: 40, altezza: 0 },
  // Energia: generatori e accumuli (le linee del riscaldamento partono da caldaia o pompa di calore)
  { tipo: "pompa_calore", nome: "Pompa di calore (esterna)", gruppo: "Energia", larghezza: 100, profondita: 40, altezza: 0 },
  { tipo: "bollitore", nome: "Bollitore acqua calda", gruppo: "Energia", larghezza: 60, profondita: 60, altezza: 0 },
  { tipo: "inverter", nome: "Inverter fotovoltaico", gruppo: "Energia", larghezza: 50, profondita: 20, altezza: 140 },
  { tipo: "batteria_accumulo", nome: "Batteria di accumulo", gruppo: "Energia", larghezza: 60, profondita: 25, altezza: 0 },
  { tipo: "wallbox", nome: "Wallbox ricarica auto", gruppo: "Energia", larghezza: 30, profondita: 15, altezza: 120 },
  // Struttura: pilastri di capannoni, garage, piani pilotis.
  { tipo: "pilastro", nome: "Pilastro", gruppo: "Struttura", larghezza: 30, profondita: 30, altezza: 300 },
  // Rampa dritta: 16 alzate da 17,5 cm, pedata 28 cm; la freccia indica dove si sale.
  // Finestra sulla falda (tipo Velux): conta nel rapporto aeroilluminante dei sottotetti.
  { tipo: "lucernario", nome: "Lucernario (finestra a tetto)", gruppo: "Struttura", larghezza: 78, profondita: 118, altezza: 220 },
  { tipo: "scala", nome: "Scala (rampa)", gruppo: "Struttura", larghezza: 100, profondita: 450, altezza: 280 },
  { tipo: "scala_u", nome: "Scala a U (due rampe)", gruppo: "Struttura", larghezza: 200, profondita: 360, altezza: 280 },
  { tipo: "scala_chiocciola", nome: "Scala a chiocciola", gruppo: "Struttura", larghezza: 160, profondita: 160, altezza: 280 },
  { tipo: "trave", nome: "Trave in c.a.", gruppo: "Struttura", larghezza: 400, profondita: 30, altezza: 50 },
  { tipo: "solaio", nome: "Solaio (piastra)", gruppo: "Struttura", larghezza: 800, profondita: 600, altezza: 25 },
  { tipo: "ascensore", nome: "Ascensore", gruppo: "Struttura", larghezza: 150, profondita: 150, altezza: 280 },
  // Sport: campi con le misure regolamentari (src/lib/planimetrie/campiSport.ts), ingombro con le fasce di rispetto
  ...CAMPI.map((c): VoceCatalogo => ({ tipo: c.tipo, nome: c.nome, gruppo: "Sport", larghezza: c.ingombro[0], profondita: c.ingombro[1], altezza: 0 })),
];

/**
 * I tipi che hanno un'immagine in `public/planimetrie/simboli/<tipo>.png` (miniatura del catalogo).
 * Senza, la miniatura è il simbolo disegnato. Si aggiunge qui il tipo quando si mette l'immagine.
 */
export const IMMAGINI_SIMBOLI: ReadonlySet<string> = new Set<string>([]);
export const urlImmagineSimbolo = (tipo: string) => (IMMAGINI_SIMBOLI.has(tipo) ? `/planimetrie/simboli/${tipo}.png` : null);

export const GRUPPI_CATALOGO = ["Bagno", "Cucina", "Camere", "Soggiorno", "Esterni e garage", "Giardino e piscina", "Sport", "Impianti", "Energia", "Struttura"] as const;

export const nomeDelTipo = (tipo: string) => CATALOGO.find((v) => v.tipo === tipo)?.nome ?? tipo.replace(/_/g, " ");
