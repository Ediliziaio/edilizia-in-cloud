import { planningDay } from "@/lib/orders/planning";

export const RIGHE_REGISTRO = 50;
export const REGISTRI_OPERAZIONE = {
  rapportini: ["rapportini", "giornale"],
  lavorazioni: ["fasi"],
  acquisti: ["ordini"],
  ddt: ["ddt"],
  fatture: ["costi"],
  squadre: ["timbrature", "mezzi", "subappalti"],
} as const;

export type RegistroOperazione = (typeof REGISTRI_OPERAZIONE)[keyof typeof REGISTRI_OPERAZIONE][number];
export type PeriodoRegistro = { dal: string; al: string };
export type PagineRegistro = Partial<Record<RegistroOperazione, number>>;

export const CATEGORIE_PRIORITA = [
  ["tutte", "Tutte"], ["fasi", "Fasi"], ["materiali", "Materiali"], ["ordini", "Consegne"], ["ddt", "DDT"], ["rapportini", "Rapportini"], ["cassa", "Cassa"],
] as const;
export type CategoriaPriorita = (typeof CATEGORIE_PRIORITA)[number][0];

export function categoriaPriorita(valore: string | null, vedeCassa: boolean): CategoriaPriorita {
  return CATEGORIE_PRIORITA.find(([id]) => id === valore && (id !== "cassa" || vedeCassa))?.[0] ?? "tutte";
}

export function nelPeriodoRegistro(data: string | null, periodo: PeriodoRegistro) {
  return (!periodo.dal || (!!data && data >= periodo.dal)) && (!periodo.al || (!!data && data <= periodo.al));
}

export function periodoRegistro(parametri: URLSearchParams): PeriodoRegistro {
  const dal = planningDay(parametri.get("mov-dal"));
  const al = planningDay(parametri.get("mov-al"));
  return dal && al && dal > al ? { dal: "", al: "" } : { dal, al };
}

export function paginaRegistro(valore: string | null): number {
  const pagina = Number(valore);
  return Number.isSafeInteger(pagina) && pagina > 0 && pagina <= Math.floor(0x7fffffff / RIGHE_REGISTRO) ? pagina : 1;
}

function normalizza(testo: string) {
  return testo.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("it");
}

export function cercaNellOperazione(ricerca: string, campi: Array<string | null | undefined>) {
  const testo = normalizza(campi.filter(Boolean).join(" "));
  return normalizza(ricerca.trim()).split(/\s+/).every(parola => testo.includes(parola));
}

export function cantiereInAmbito(parametri: URLSearchParams, id: string) {
  const ricerca = new URLSearchParams(parametri);
  ricerca.set("scheda", "cantiere");
  ricerca.set("vista-cantiere", "da-seguire");
  ricerca.set("ambito-cantiere", id);
  ricerca.delete("fase-cantiere");
  ricerca.delete("rapportino-cantiere");
  return `?${ricerca.toString()}`;
}
