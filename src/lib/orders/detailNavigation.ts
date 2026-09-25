/** One navigation contract for desktop, mobile, notifications and old links. */
export type OrderDetailTab = "panoramica" | "cantiere" | "articoli" | "finanza";

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
  "section-assistenza": "panoramica",
  "section-note": "panoramica",
  "section-documenti": "panoramica",
  "section-lavorazioni": "cantiere",
  "section-pianificazione": "cantiere",
  "section-attivita": "cantiere",
  "section-rapportini": "cantiere",
  "section-foto": "cantiere",
  "section-sal": "cantiere",
  "section-materiali": "articoli",
  "section-pagamenti": "finanza",
  "section-conto-economico": "finanza",
  "esposizione-commessa": "finanza",
  "section-ritenute": "finanza",
} as const satisfies Record<string, OrderDetailTab>;

export type OrderDetailSection = keyof typeof SECTION_TABS;
export interface OrderDetailDestination {
  tab: OrderDetailTab;
  section?: OrderDetailSection;
}

const LEGACY_TABS: Record<string, OrderDetailDestination> = {
  stato: { tab: "panoramica", section: "section-stato" },
  campo: { tab: "cantiere", section: "section-rapportini" },
  sal: { tab: "cantiere", section: "section-sal" },
  assistenza: { tab: "panoramica", section: "section-assistenza" },
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
  const section = hash.replace(/^#/, "");
  if (Object.hasOwn(SECTION_TABS, section)) {
    return {
      tab: SECTION_TABS[section as OrderDetailSection],
      section: section as OrderDetailSection,
    };
  }
  const tab = new URLSearchParams(search).get("tab") ?? "panoramica";
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
  params.set(
    "tab",
    destination.section ? SECTION_TABS[destination.section] : destination.tab,
  );
  return {
    search: `?${params.toString()}`,
    hash: destination.section ? `#${destination.section}` : "",
  };
}
