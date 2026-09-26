// L'analisi AI delle aperture restituisce codici inglesi («upper_left»,
// «door_window»): prima comparivano così, col trattino basso tolto, anche sul
// computer. Qui la loro lettura in italiano; un codice nuovo resta leggibile.

const POSIZIONE: Record<string, string> = {
  far_left: "tutta a sinistra",
  left: "a sinistra",
  center: "al centro",
  right: "a destra",
  far_right: "tutta a destra",
  upper_left: "in alto a sinistra",
  upper_center: "in alto al centro",
  upper_right: "in alto a destra",
  lower_left: "in basso a sinistra",
  lower_center: "in basso al centro",
  lower_right: "in basso a destra",
  full_width: "tutta la larghezza",
  unknown: "posizione non chiara",
};

const APERTURA: Record<string, string> = {
  window: "finestra",
  door_window: "portafinestra",
  balcony_door: "porta balcone",
  arched_window: "finestra ad arco",
  unknown: "apertura",
};

const OSCURANTE: Record<string, string> = {
  veneziana_classica: "veneziana classica",
  veneziana_esterna: "veneziana esterna",
  scuro_pieno: "scuro pieno",
  scuro_cornice: "scuro a cornice",
  gelosia: "gelosia",
  avvolgibile_esterno: "avvolgibile",
  a_libro: "persiana a libro",
  griglia_sicurezza: "griglia di sicurezza",
  brise_soleil: "brise-soleil",
  battente_generica: "persiana a battente",
  nessuna: "nessun oscurante",
  unknown: "oscurante non chiaro",
};

const ORIENTAMENTO: Record<string, string> = {
  portrait: "verticale",
  landscape: "orizzontale",
  square: "quadrata",
  unknown: "non chiara",
};

const MAPPE = { posizione: POSIZIONE, apertura: APERTURA, oscurante: OSCURANTE, orientamento: ORIENTAMENTO } as const;

export function etichettaAnalisiPersiane(tipo: keyof typeof MAPPE, codice: string | null | undefined): string {
  if (!codice) return "";
  return MAPPE[tipo][codice] ?? codice.replace(/_/g, " ");
}
