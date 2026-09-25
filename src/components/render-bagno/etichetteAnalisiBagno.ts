// L'analisi AI del bagno restituisce codici inglesi («corner_shower»,
// «wall_hung»): prima comparivano così, col trattino basso tolto, anche sul
// computer. Qui la loro lettura in italiano; un codice nuovo resta leggibile.

const AMBIENTE: Record<string, string> = {
  bathroom: "bagno",
  ensuite: "bagno in camera",
  powder_room: "bagno di servizio",
  wet_room: "bagno a pavimento unico",
  laundry_bath: "bagno con lavanderia",
  unknown: "non chiaro",
};

const LAYOUT: Record<string, string> = {
  linear_single_wall: "tutto su una parete",
  opposed_walls: "pareti contrapposte",
  corner_shower: "doccia ad angolo",
  bathtub_alcove: "vasca in nicchia",
  compact_rectangular: "rettangolare compatto",
  split_zones: "zone separate",
  unknown: "non chiaro",
};

const DOCCIA: Record<string, string> = {
  walk_in: "walk-in",
  nicchia_box: "box in nicchia",
  frontale_box: "box frontale",
  angolare: "angolare",
  semicircolare: "semicircolare",
  generic_box: "box",
  unknown: "non chiara",
  none: "assente",
};

const VASCA: Record<string, string> = {
  freestanding_ovale: "freestanding ovale",
  freestanding_rettangolare: "freestanding rettangolare",
  back_to_wall: "filo muro",
  incassata: "incassata",
  angolare: "angolare",
  generic_built_in: "incassata",
  unknown: "non chiara",
  none: "assente",
};

const MOBILE: Record<string, string> = {
  wall_hung: "sospeso",
  floor_standing: "a terra",
  console: "consolle",
  unknown: "non chiaro",
  none: "assente",
};

const SANITARI: Record<string, string> = {
  wall_hung: "sospesi",
  back_to_wall: "filo muro",
  floor_standing: "a terra",
  unknown: "non chiari",
  none: "assenti",
};

const CONDIZIONI: Record<string, string> = {
  buono: "buono stato",
  discreto: "stato discreto",
  da_ristrutturare: "da ristrutturare",
};

const LUCE: Record<string, string> = {
  natural: "luce naturale",
  ceiling_spots: "faretti a soffitto",
  pendant: "lampada a sospensione",
  mirror_backlit: "specchio retroilluminato",
  wall_sconces: "applique",
  mixed: "luce mista",
  unknown: "luce non chiara",
};

const MAPPE = {
  ambiente: AMBIENTE,
  layout: LAYOUT,
  doccia: DOCCIA,
  vasca: VASCA,
  mobile: MOBILE,
  sanitari: SANITARI,
  condizioni: CONDIZIONI,
  luce: LUCE,
} as const;

export function etichettaAnalisiBagno(tipo: keyof typeof MAPPE, codice: string | null | undefined): string {
  if (!codice) return "";
  return MAPPE[tipo][codice] ?? codice.replace(/_/g, " ");
}
