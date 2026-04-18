/**
 * Catalogo base tipologie serramenti — 20 tipologie standard.
 *
 * Le icone SVG sono ORIGINALI: schemi tecnici con notazione ISO 10077
 * (freccia = direzione apertura, X = battente/anta, quadrato = fisso).
 * Questa notazione è uno standard industriale universale — non coperta
 * da copyright. Disegnate con geometrie minimaliste (strokes 1.5-2px,
 * currentColor per ereditare colore tema).
 *
 * Usate dal selettore famiglia nel wizard preventivo serramentista e
 * dalla galleria catalogo nella pagina Listini.
 */

import type { TipologiaSerramento } from "../types";

/** Cornice SVG comune: rettangolo infisso 80×60 in viewBox 100×80, padding 10 */
const FRAME = `<rect x="10" y="10" width="80" height="60" fill="none" stroke="currentColor" stroke-width="2" rx="1"/>`;

/** Linea verticale divisoria per ante multiple */
function divider(x: number): string {
  return `<line x1="${x}" y1="10" x2="${x}" y2="70" stroke="currentColor" stroke-width="1.5"/>`;
}

/** X diagonale = anta a battente */
function batt(x1: number, y1: number, x2: number, y2: number): string {
  return (
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="1" opacity="0.7"/>` +
    `<line x1="${x2}" y1="${y1}" x2="${x1}" y2="${y2}" stroke="currentColor" stroke-width="1" opacity="0.7"/>`
  );
}

/** Freccia orizzontale/verticale per scorrevoli/vasistas */
function arrow(d: string): string {
  return `<path d="${d}" stroke="currentColor" stroke-width="1.5" fill="none" marker-end="url(#ah)"/>`;
}

/** Definizione marker freccia (una sola nel documento) */
const ARROW_DEFS = `<defs><marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="currentColor"/></marker></defs>`;

/** Utility: wrap content in SVG tag con viewBox 100×80 */
function svg(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80" width="100%" height="100%">${ARROW_DEFS}${content}</svg>`;
}

// ─── ICONE TIPOLOGIE ────────────────────────────────────────────────────

const ICON_FINESTRA_1_ANTA = svg(FRAME + batt(10, 10, 90, 70));

const ICON_FINESTRA_2_ANTE = svg(FRAME + divider(50) + batt(10, 10, 50, 70) + batt(50, 10, 90, 70));

const ICON_FINESTRA_3_ANTE = svg(
  FRAME + divider(37) + divider(63) + batt(10, 10, 37, 70) + batt(37, 10, 63, 70) + batt(63, 10, 90, 70),
);

const ICON_VASISTAS = svg(FRAME + arrow("M50 65 L50 25"));

const ICON_FISSO_NEL_TELAIO = svg(FRAME + `<line x1="30" y1="30" x2="70" y2="30" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="30" y1="50" x2="70" y2="50" stroke="currentColor" stroke-width="1" opacity="0.5"/>`);

const ICON_FISSO_NELL_ANTA = svg(
  FRAME + `<rect x="20" y="20" width="60" height="40" fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"/>`,
);

const ICON_PORTA_BALCONE_1_ANTA = svg(
  `<rect x="30" y="5" width="40" height="70" fill="none" stroke="currentColor" stroke-width="2" rx="1"/>` +
    batt(30, 5, 70, 75),
);

const ICON_PORTA_BALCONE_2_ANTE = svg(
  `<rect x="20" y="5" width="60" height="70" fill="none" stroke="currentColor" stroke-width="2" rx="1"/>` +
    `<line x1="50" y1="5" x2="50" y2="75" stroke="currentColor" stroke-width="1.5"/>` +
    batt(20, 5, 50, 75) +
    batt(50, 5, 80, 75),
);

const ICON_PORTA_BALCONE_3_ANTE = svg(
  `<rect x="15" y="5" width="70" height="70" fill="none" stroke="currentColor" stroke-width="2" rx="1"/>` +
    `<line x1="38" y1="5" x2="38" y2="75" stroke="currentColor" stroke-width="1.5"/>` +
    `<line x1="62" y1="5" x2="62" y2="75" stroke="currentColor" stroke-width="1.5"/>` +
    batt(15, 5, 38, 75) +
    batt(38, 5, 62, 75) +
    batt(62, 5, 85, 75),
);

const ICON_PORTA_INGRESSO_1_ANTA = svg(
  `<rect x="30" y="5" width="40" height="70" fill="none" stroke="currentColor" stroke-width="2.5" rx="1"/>` +
    `<circle cx="62" cy="40" r="1.5" fill="currentColor"/>`,
);

const ICON_PORTA_INGRESSO_2_ANTE = svg(
  `<rect x="20" y="5" width="60" height="70" fill="none" stroke="currentColor" stroke-width="2.5" rx="1"/>` +
    `<line x1="50" y1="5" x2="50" y2="75" stroke="currentColor" stroke-width="1.5"/>` +
    `<circle cx="46" cy="40" r="1.5" fill="currentColor"/>` +
    `<circle cx="54" cy="40" r="1.5" fill="currentColor"/>`,
);

const ICON_SCORREVOLE_2_ANTE = svg(
  FRAME + divider(50) + arrow("M15 40 L45 40") + arrow("M85 40 L55 40"),
);

const ICON_SCORREVOLE_ALZANTE = svg(
  `<rect x="5" y="5" width="90" height="70" fill="none" stroke="currentColor" stroke-width="2" rx="1"/>` +
    `<line x1="50" y1="5" x2="50" y2="75" stroke="currentColor" stroke-width="1.5"/>` +
    arrow("M10 40 L45 40"),
);

const ICON_ARCO = svg(
  `<path d="M10 40 A40 40 0 0 1 90 40 L90 70 L10 70 Z" fill="none" stroke="currentColor" stroke-width="2"/>` +
    batt(10, 40, 90, 70),
);

const ICON_PORTONCINO_BLINDATO = svg(
  `<rect x="28" y="5" width="44" height="70" fill="none" stroke="currentColor" stroke-width="3" rx="1"/>` +
    `<circle cx="62" cy="40" r="1.5" fill="currentColor"/>` +
    `<rect x="35" y="15" width="30" height="50" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>`,
);

const ICON_PERSIANA_1_ANTA = svg(
  FRAME +
    `<line x1="20" y1="20" x2="80" y2="20" stroke="currentColor" stroke-width="1"/>` +
    `<line x1="20" y1="30" x2="80" y2="30" stroke="currentColor" stroke-width="1"/>` +
    `<line x1="20" y1="40" x2="80" y2="40" stroke="currentColor" stroke-width="1"/>` +
    `<line x1="20" y1="50" x2="80" y2="50" stroke="currentColor" stroke-width="1"/>` +
    `<line x1="20" y1="60" x2="80" y2="60" stroke="currentColor" stroke-width="1"/>`,
);

const ICON_ZANZARIERA = svg(
  FRAME +
    `<g stroke="currentColor" stroke-width="0.5" opacity="0.5">` +
    Array.from({ length: 9 }, (_, i) => `<line x1="${15 + i * 8}" y1="15" x2="${15 + i * 8}" y2="65"/>`).join("") +
    Array.from({ length: 7 }, (_, i) => `<line x1="15" y1="${15 + i * 8}" x2="85" y2="${15 + i * 8}"/>`).join("") +
    `</g>`,
);

const ICON_TAPPARELLA = svg(
  `<rect x="10" y="5" width="80" height="15" fill="none" stroke="currentColor" stroke-width="2" rx="1"/>` +
    FRAME.replace(`y="10"`, `y="25"`).replace(`height="60"`, `height="50"`) +
    `<line x1="20" y1="30" x2="80" y2="30" stroke="currentColor" stroke-width="0.5"/>` +
    `<line x1="20" y1="40" x2="80" y2="40" stroke="currentColor" stroke-width="0.5"/>` +
    `<line x1="20" y1="50" x2="80" y2="50" stroke="currentColor" stroke-width="0.5"/>` +
    `<line x1="20" y1="60" x2="80" y2="60" stroke="currentColor" stroke-width="0.5"/>`,
);

const ICON_VELUX = svg(
  `<polygon points="15,30 85,15 85,65 15,65" fill="none" stroke="currentColor" stroke-width="2"/>` +
    `<line x1="50" y1="22" x2="50" y2="65" stroke="currentColor" stroke-width="1"/>`,
);

const ICON_GENERICO = svg(FRAME);

// ─── DEFINIZIONE 20 TIPOLOGIE ───────────────────────────────────────────

export const CATALOGO_TIPOLOGIE: TipologiaSerramento[] = [
  // FINESTRE (6)
  {
    slug: "finestra-1-anta",
    nome: "Finestra 1 anta",
    categoria: "finestra",
    ante: 1,
    descrizione: "Finestra ad anta singola a battente. Apertura laterale.",
    icon_svg: ICON_FINESTRA_1_ANTA,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 2.25,
  },
  {
    slug: "finestra-2-ante",
    nome: "Finestra 2 ante",
    categoria: "finestra",
    ante: 2,
    descrizione: "Finestra a due ante a battente.",
    icon_svg: ICON_FINESTRA_2_ANTE,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 4.5,
  },
  {
    slug: "finestra-3-ante",
    nome: "Finestra 3 ante",
    categoria: "finestra",
    ante: 3,
    descrizione: "Finestra a tre ante a battente.",
    icon_svg: ICON_FINESTRA_3_ANTE,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 6.75,
  },
  {
    slug: "finestra-vasistas",
    nome: "Finestra vasistas",
    categoria: "finestra",
    ante: null,
    descrizione: "Finestra con apertura a vasistas (ribalta verso l'interno).",
    icon_svg: ICON_VASISTAS,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 2.25,
  },
  {
    slug: "finestra-arco",
    nome: "Finestra ad arco",
    categoria: "finestra",
    ante: null,
    descrizione: "Finestra con parte superiore ad arco.",
    icon_svg: ICON_ARCO,
    modalita_prezzo_base_default: "misura_libera",
    unit_of_measure_default: "pz",
    area_max_mq: null,
  },
  {
    slug: "velux-tetto",
    nome: "Finestra per tetto (Velux)",
    categoria: "finestra",
    ante: 1,
    descrizione: "Finestra inclinata per tetto, tipo Velux.",
    icon_svg: ICON_VELUX,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 2.0,
  },
  // FISSI (2)
  {
    slug: "fisso-nel-telaio",
    nome: "Fisso nel telaio",
    categoria: "fisso",
    ante: null,
    descrizione: "Vetrata fissa senza apertura (solo telaio + vetro).",
    icon_svg: ICON_FISSO_NEL_TELAIO,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: null,
  },
  {
    slug: "fisso-nell-anta",
    nome: "Fisso nell'anta",
    categoria: "fisso",
    ante: null,
    descrizione: "Elemento fisso integrato in anta (parte non apribile).",
    icon_svg: ICON_FISSO_NELL_ANTA,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 2.25,
  },
  // PORTE BALCONE (4)
  {
    slug: "porta-balcone-1-anta",
    nome: "Porta balcone 1 anta",
    categoria: "porta_balcone",
    ante: 1,
    descrizione: "Portafinestra ad anta singola per balcone/terrazzo.",
    icon_svg: ICON_PORTA_BALCONE_1_ANTA,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 3.0,
  },
  {
    slug: "porta-balcone-2-ante",
    nome: "Porta balcone 2 ante",
    categoria: "porta_balcone",
    ante: 2,
    descrizione: "Portafinestra a due ante per balcone/terrazzo.",
    icon_svg: ICON_PORTA_BALCONE_2_ANTE,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 6.0,
  },
  {
    slug: "porta-balcone-3-ante",
    nome: "Porta balcone 3 ante",
    categoria: "porta_balcone",
    ante: 3,
    descrizione: "Portafinestra a tre ante.",
    icon_svg: ICON_PORTA_BALCONE_3_ANTE,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 9.0,
  },
  {
    slug: "porta-balcone-serratura-passante",
    nome: "Porta balcone con serratura passante",
    categoria: "porta_balcone",
    ante: 2,
    descrizione: "Portafinestra con serratura passante (apertura da entrambi i lati).",
    icon_svg: ICON_PORTA_BALCONE_2_ANTE,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 6.0,
  },
  // PORTE INGRESSO (2)
  {
    slug: "porta-ingresso-1-anta",
    nome: "Porta d'ingresso 1 anta",
    categoria: "porta_ingresso",
    ante: 1,
    descrizione: "Porta d'ingresso singola con serratura di sicurezza.",
    icon_svg: ICON_PORTA_INGRESSO_1_ANTA,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 2.5,
  },
  {
    slug: "porta-ingresso-2-ante",
    nome: "Porta d'ingresso 2 ante",
    categoria: "porta_ingresso",
    ante: 2,
    descrizione: "Porta d'ingresso doppia.",
    icon_svg: ICON_PORTA_INGRESSO_2_ANTE,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 5.0,
  },
  {
    slug: "portoncino-blindato",
    nome: "Portoncino blindato",
    categoria: "porta_ingresso",
    ante: 1,
    descrizione: "Porta blindata di sicurezza con pannello coibentato.",
    icon_svg: ICON_PORTONCINO_BLINDATO,
    modalita_prezzo_base_default: "pz",
    unit_of_measure_default: "pz",
    area_max_mq: 2.5,
  },
  // SCORREVOLI (3)
  {
    slug: "scorrevole-2-ante",
    nome: "Scorrevole 2 ante",
    categoria: "scorrevole",
    ante: 2,
    descrizione: "Finestra/porta scorrevole a 2 ante (tipo Smart Slide).",
    icon_svg: ICON_SCORREVOLE_2_ANTE,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 6.0,
  },
  {
    slug: "alzante-scorrevole",
    nome: "Alzante scorrevole",
    categoria: "scorrevole",
    ante: 2,
    descrizione: "Porta-finestra alzante scorrevole di grandi dimensioni.",
    icon_svg: ICON_SCORREVOLE_ALZANTE,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 12.0,
  },
  {
    slug: "traslante-scorrevole",
    nome: "Traslante scorrevole",
    categoria: "scorrevole",
    ante: 2,
    descrizione: "Sistema scorrevole traslante con fissa/anta.",
    icon_svg: ICON_SCORREVOLE_2_ANTE,
    modalita_prezzo_base_default: "griglia",
    unit_of_measure_default: "pz",
    area_max_mq: 8.0,
  },
  // ACCESSORI (3)
  {
    slug: "persiana",
    nome: "Persiana",
    categoria: "finestra",
    ante: 1,
    descrizione: "Persiana esterna in alluminio/pvc/legno.",
    icon_svg: ICON_PERSIANA_1_ANTA,
    modalita_prezzo_base_default: "mq",
    unit_of_measure_default: "pz",
    area_max_mq: null,
  },
  {
    slug: "zanzariera",
    nome: "Zanzariera",
    categoria: "finestra",
    ante: null,
    descrizione: "Zanzariera a rullo o fissa.",
    icon_svg: ICON_ZANZARIERA,
    modalita_prezzo_base_default: "mq",
    unit_of_measure_default: "pz",
    area_max_mq: null,
  },
  {
    slug: "tapparella",
    nome: "Tapparella (avvolgibile)",
    categoria: "finestra",
    ante: null,
    descrizione: "Tapparella avvolgibile motorizzata o manuale.",
    icon_svg: ICON_TAPPARELLA,
    modalita_prezzo_base_default: "mq",
    unit_of_measure_default: "pz",
    area_max_mq: null,
  },
];

/** Conta per categoria (utility per UI) */
export function getTipologieCountByCategoria() {
  return CATALOGO_TIPOLOGIE.reduce<Record<string, number>>((acc, t) => {
    acc[t.categoria] = (acc[t.categoria] ?? 0) + 1;
    return acc;
  }, {});
}

/** Lookup per slug */
export function getTipologiaBySlug(slug: string): TipologiaSerramento | undefined {
  return CATALOGO_TIPOLOGIE.find((t) => t.slug === slug);
}

/** Icon fallback */
export const ICON_GENERICO_SVG = ICON_GENERICO;
