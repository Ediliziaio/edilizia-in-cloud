import type { CompanySector } from "@/types/auth";

export interface OrderStatusTemplate {
  name: string;
  icon: string;
  color: string;
  position: number;
}

const serramentiInfissiTemplate: OrderStatusTemplate[] = [
  { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
  { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
  { name: "Rilievo Tecnico", icon: "Ruler", color: "#CA8A04", position: 2 },
  { name: "In Produzione", icon: "Factory", color: "#7C3AED", position: 3 },
  { name: "Produzione Finita", icon: "Package", color: "#0891B2", position: 4 },
  { name: "Merce in Magazzino", icon: "Package", color: "#EA580C", position: 5 },
  { name: "Posa Programmata", icon: "Calendar", color: "#DB2777", position: 6 },
  { name: "Posa Completata", icon: "Home", color: "#16A34A", position: 7 },
];

const fotovoltaicoTemplate: OrderStatusTemplate[] = [
  { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
  { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
  { name: "Sopralluogo Tecnico", icon: "Clipboard", color: "#CA8A04", position: 2 },
  { name: "Progettazione", icon: "Ruler", color: "#7C3AED", position: 3 },
  { name: "Pratica GSE", icon: "FileText", color: "#0891B2", position: 4 },
  { name: "Materiale Ordinato", icon: "Package", color: "#EA580C", position: 5 },
  { name: "Installazione Programmata", icon: "Calendar", color: "#DB2777", position: 6 },
  { name: "Installazione Completata", icon: "Wrench", color: "#2563EB", position: 7 },
  { name: "Collaudo", icon: "Shield", color: "#CA8A04", position: 8 },
  { name: "Allaccio Rete", icon: "Zap", color: "#16A34A", position: 9 },
];

const bagniRistrutturazioniTemplate: OrderStatusTemplate[] = [
  { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
  { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
  { name: "Rilievo Tecnico", icon: "Ruler", color: "#CA8A04", position: 2 },
  { name: "Progettazione", icon: "Clipboard", color: "#7C3AED", position: 3 },
  { name: "Ordine Materiali", icon: "Package", color: "#0891B2", position: 4 },
  { name: "Demolizioni", icon: "Hammer", color: "#DC2626", position: 5 },
  { name: "Impianti", icon: "Wrench", color: "#EA580C", position: 6 },
  { name: "Posa", icon: "Factory", color: "#DB2777", position: 7 },
  { name: "Finiture", icon: "PaintBucket", color: "#7C3AED", position: 8 },
  { name: "Consegna", icon: "Home", color: "#16A34A", position: 9 },
];

const defaultTemplate: OrderStatusTemplate[] = [
  { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
  { name: "In Lavorazione", icon: "Settings", color: "#CA8A04", position: 1 },
  { name: "Completato", icon: "CheckCircle", color: "#16A34A", position: 2 },
];

export function getOrderStatusTemplate(sector: CompanySector): OrderStatusTemplate[] {
  switch (sector) {
    case "serramenti":
    case "infissi":
      return serramentiInfissiTemplate;
    case "fotovoltaico":
      return fotovoltaicoTemplate;
    case "bagni":
    case "ristrutturazioni":
      return bagniRistrutturazioniTemplate;
    case "tetti":
    case "pittura":
    case "altro":
    default:
      return defaultTemplate;
  }
}

export const availableIcons = [
  "FileText",
  "CheckCircle",
  "Clipboard",
  "Ruler",
  "Factory",
  "Package",
  "Truck",
  "Wrench",
  "Home",
  "Zap",
  "Sun",
  "Hammer",
  "PaintBucket",
  "Settings",
  "Clock",
  "Calendar",
  "Shield",
  "Star",
  "Award",
  "Flag",
] as const;

export const availableColors = [
  "#2563EB", // blu
  "#16A34A", // verde
  "#CA8A04", // ambra
  "#DC2626", // rosso
  "#7C3AED", // viola
  "#0891B2", // ciano
  "#EA580C", // arancione
  "#DB2777", // rosa
] as const;

export type AvailableIcon = typeof availableIcons[number];
export type AvailableColor = typeof availableColors[number];
