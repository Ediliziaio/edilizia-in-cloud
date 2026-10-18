/** One navigation contract for desktop, mobile, notifications and old links. */
export type OrderDetailTab = "panoramica" | "cantiere" | "articoli" | "finanza";
export const CANTIERE_VIEWS = [
  { value: "lavorazioni", label: "Lavorazioni", description: "Fasi, responsabili, assegnazioni e mezzi del cantiere." },
  { value: "cronoprogramma", label: "Cronoprogramma", description: "Le fasi nel tempo: date previste e reali, ritardi e avanzamento." },
  { value: "ufficio", label: "Ufficio", description: "Le fasi dell’ufficio: contratto, ordini, pratiche, fatture, con chi le fa." },
  { value: "squadra", label: "Ore e persone", description: "Chi ha lavorato, quante ore, se tornano con le timbrature. L’ufficio inserisce le ore qui." },
  { value: "diario", label: "Diario", description: "Rapportini, foto e aggiornamenti dal campo." },
  { value: "collaudo", label: "Consegna e assistenza", description: "Collaudi, verbali, riserve e interventi di assistenza." },
] as const;
export type CantiereView = typeof CANTIERE_VIEWS[number]["value"];
export const ECONOMIA_VIEWS = [
  { value: "margini", label: "Margini e costi", description: "Risultato della commessa, scostamenti e costi da verificare." },
  { value: "manodopera", label: "Manodopera e subappalti", description: "Ore, tariffe, budget e costi registrati di dipendenti e ditte." },
  { value: "pagamenti", label: "Incassi e pagamenti", description: "Rate cliente, uscite ai fornitori e disponibilità di cassa." },
  { value: "documenti", label: "Varianti, SAL e documenti", description: "Variazioni del contratto, avanzamento economico e documenti fiscali." },
] as const;
export type EconomiaView = typeof ECONOMIA_VIEWS[number]["value"];
export const MATERIALI_VIEWS = [
  { value: "articoli", label: "Articoli e misure", description: "Forniture della commessa, quantità e verifica delle misure." },
  { value: "acquisti", label: "Ordini d’acquisto", description: "Ordini ai fornitori collegati a questa commessa." },
  { value: "bolle", label: "Bolle e DDT", description: "Bolle dei fornitori, foto dal cantiere e DDT fatti al cliente." },
  { value: "fatture", label: "Fatture fornitori", description: "Fatture arrivate per questa commessa, collegate o da collegare." },
  { value: "magazzino", label: "Magazzino e seriali", description: "Movimenti dei materiali, matricole e garanzie." },
] as const;
export type MaterialiView = typeof MATERIALI_VIEWS[number]["value"];
export function resolveEconomiaView(search: string, section?: string): EconomiaView {
  if (section === "section-manodopera-costi") return "manodopera";
  if (section === "section-pagamenti" || section === "esposizione-commessa" || section === "section-ritenute") return "pagamenti";
  if (section === "section-sal" || section === "section-varianti" || section === "section-fatturazione") return "documenti";
  if (section === "section-conto-economico") return "margini";
  return ECONOMIA_VIEWS.find(view => view.value === new URLSearchParams(search).get("vista_economia"))?.value ?? "margini";
}
export function resolveMaterialiView(search: string, section?: string): MaterialiView {
  if (section === "section-acquisti") return "acquisti";
  if (section === "section-bolle") return "bolle";
  if (section === "section-fatture-fornitori") return "fatture";
  if (section === "section-magazzino") return "magazzino";
  if (section === "section-materiali") return "articoli";
  return MATERIALI_VIEWS.find(view => view.value === new URLSearchParams(search).get("vista_materiali"))?.value ?? "articoli";
}
const CANTIERE_SECTIONS: Partial<Record<string, CantiereView>> = {
  "section-lavorazioni": "lavorazioni", "section-attivita": "lavorazioni",
  "section-pianificazione": "lavorazioni", "section-cronoprogramma": "cronoprogramma", "section-squadra": "lavorazioni", "section-statistiche": "squadra",
  "section-mezzi": "lavorazioni", "section-rapportini": "diario",
  "section-foto": "diario", "section-diario": "diario", "section-collaudo": "collaudo",
  "section-assistenza": "collaudo", "section-sopralluoghi": "lavorazioni",
  "section-ufficio": "ufficio",
};
export function resolveCantiereView(search: string, section?: string): CantiereView {
  if (section && Object.hasOwn(CANTIERE_SECTIONS, section)) return CANTIERE_SECTIONS[section]!;
  const view = new URLSearchParams(search).get("vista_cantiere");
  return CANTIERE_VIEWS.find(item => item.value === view)?.value ?? "lavorazioni";
}

export const ORDER_DETAIL_TABS = [
  { value: "panoramica", label: "Panoramica", shortLabel: "Panoramica" },
  { value: "cantiere", label: "Cantiere", shortLabel: "Cantiere" },
  { value: "articoli", label: "Materiali e acquisti", shortLabel: "Materiali" },
  { value: "finanza", label: "Economia e pagamenti", shortLabel: "Economia" },
] as const satisfies readonly {
  value: OrderDetailTab;
  label: string;
  shortLabel: string;
}[];

const SECTION_TABS = {
  "section-stato": "panoramica",
  "section-assistenza": "cantiere",
  "section-sopralluoghi": "cantiere",
  "section-note": "panoramica",
  "section-ufficio": "cantiere",
  "section-documenti": "panoramica",
  "section-lavorazioni": "cantiere",
  "section-pianificazione": "cantiere",
  "section-cronoprogramma": "cantiere",
  "section-attivita": "cantiere",
  "section-rapportini": "cantiere",
  "section-collaudo": "cantiere",
  "section-foto": "cantiere",
  "section-squadra": "cantiere",
  "section-statistiche": "cantiere",
  "section-mezzi": "cantiere",
  "section-diario": "cantiere",
  "section-sal": "finanza",
  "section-materiali": "articoli",
  "section-bolle": "articoli",
  "section-fatture-fornitori": "articoli",
  "section-acquisti": "articoli",
  "section-magazzino": "articoli",
  "section-varianti": "finanza",
  "section-fatturazione": "finanza",
  "section-pagamenti": "finanza",
  "section-conto-economico": "finanza",
  "section-manodopera-costi": "finanza",
  "esposizione-commessa": "finanza",
  "section-ritenute": "finanza",
} as const satisfies Record<string, OrderDetailTab>;

export type OrderDetailSection = keyof typeof SECTION_TABS;
export interface OrderDetailDestination {
  tab: OrderDetailTab;
  section?: OrderDetailSection;
  cantiereView?: CantiereView;
  economiaView?: EconomiaView;
  materialiView?: MaterialiView;
}

const LEGACY_TABS: Record<string, OrderDetailDestination> = {
  stato: { tab: "panoramica", section: "section-stato" },
  campo: { tab: "cantiere", section: "section-rapportini" },
  sal: { tab: "finanza", section: "section-sal" },
  assistenza: { tab: "cantiere", section: "section-assistenza" },
  altro: { tab: "panoramica", section: "section-note" },
  ritenute: { tab: "finanza", section: "section-ritenute" },
  materiali: { tab: "articoli" },
  economia: { tab: "finanza" },
  manodopera: { tab: "cantiere", section: "section-lavorazioni" },
  documenti: { tab: "panoramica", section: "section-documenti" },
};

export function isOrderDetailTab(value: string): value is OrderDetailTab {
  return ORDER_DETAIL_TABS.some((tab) => tab.value === value);
}

export function resolveOrderDetailDestination(
  search: string,
  hash = "",
): OrderDetailDestination {
  const params = new URLSearchParams(search);
  const hashSection = hash.replace(/^#/, "");
  const section = Object.hasOwn(SECTION_TABS, hashSection)
    ? hashSection
    : params.get("section") ?? "";
  if (Object.hasOwn(SECTION_TABS, section)) {
    return {
      tab: SECTION_TABS[section as OrderDetailSection],
      section: section as OrderDetailSection,
    };
  }
  const tab = params.get("tab") ?? "panoramica";
  if (isOrderDetailTab(tab)) return { tab };
  return Object.hasOwn(LEGACY_TABS, tab)
    ? LEGACY_TABS[tab]
    : { tab: "panoramica" };
}

/** Keep unrelated query parameters; discard the previous area's anchor. */
export function orderDetailLocation(
  search: string,
  destination: OrderDetailDestination,
) {
  const params = new URLSearchParams(search);
  params.delete("section");
  params.set(
    "tab",
    destination.section ? SECTION_TABS[destination.section] : destination.tab,
  );
  if (destination.cantiereView) params.set("vista_cantiere", destination.cantiereView);
  if (destination.economiaView) params.set("vista_economia", destination.economiaView);
  if (destination.materialiView) params.set("vista_materiali", destination.materialiView);
  return {
    search: `?${params.toString()}`,
    hash: destination.section ? `#${destination.section}` : "",
  };
}
