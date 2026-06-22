import { calcPrezzoVoce } from "./calcoli";
import type { PisUnitaMisura } from "@/types/piscine";

/** Voce del set standard (template, senza id/company). */
export interface SeedVoce {
  descrizione: string;
  unita_misura: PisUnitaMisura;
  costo_materiali: number;
  costo_manodopera: number;
  ricarico_pct: number;
}
/** Capitolo del set standard con le sue voci. */
export interface SeedCapitolo {
  nome: string;
  voci: SeedVoce[];
}

const v = (
  descrizione: string,
  unita_misura: PisUnitaMisura,
  costo_materiali: number,
  costo_manodopera: number,
): SeedVoce => ({ descrizione, unita_misura, costo_materiali, costo_manodopera, ricarico_pct: 0 });

/**
 * Set standard di capitoli/voci per la costruzione di una piscina interrata
 * chiavi in mano. Costi materiali/manodopera indicativi (€), ricarico 0 (l'azienda
 * lo personalizza). Valori di partenza editabili dopo l'import nel listino aziendale.
 */
export const SEED_LISTINO: SeedCapitolo[] = [
  {
    nome: "Sopralluogo e progetto",
    voci: [
      v("Sopralluogo, rilievo e picchettamento", "corpo", 0, 200),
      v("Progetto piscina e pratiche edilizie/SCIA", "corpo", 0, 600),
      v("Tracciamento e livellamento dell'area", "corpo", 60, 180),
    ],
  },
  {
    nome: "Scavo e movimento terra",
    voci: [
      v("Scavo di sbancamento con mezzo meccanico", "mc", 0, 14),
      v("Carico, trasporto e smaltimento terra di risulta", "mc", 12, 10),
      v("Formazione di platea in cls armato di fondazione", "mq", 28, 26),
    ],
  },
  {
    nome: "Struttura vasca",
    voci: [
      v("Struttura in cemento armato gunite/casseri", "mq", 95, 85),
      v("Fornitura e posa vasca in vetroresina monoblocco", "corpo", 6500, 1800),
      v("Fornitura e montaggio pannelli in acciaio/PVC", "mq", 55, 45),
    ],
  },
  {
    nome: "Impermeabilizzazione e rivestimento",
    voci: [
      v("Fornitura e posa liner in PVC armato", "mq", 22, 28),
      v("Rivestimento in mosaico vetroso", "mq", 60, 70),
      v("Intonaco impermeabile e rasatura", "mq", 14, 20),
    ],
  },
  {
    nome: "Impianto idraulico",
    voci: [
      v("Fornitura e posa skimmer e bocchette di immissione", "cad", 60, 55),
      v("Fornitura e posa presa di fondo e troppopieno", "cad", 90, 70),
      v("Tubazioni idrauliche e collegamenti al locale tecnico", "ml", 8, 14),
      v("Realizzazione locale tecnico / pozzetto", "corpo", 350, 480),
    ],
  },
  {
    nome: "Filtrazione e trattamento",
    voci: [
      v("Fornitura e posa gruppo pompa + filtro a sabbia", "corpo", 850, 280),
      v("Fornitura e posa elettrolisi al sale / clorazione", "corpo", 700, 220),
      v("Fornitura e posa pompa di calore per piscina", "cad", 2200, 480),
      v("Regolazione automatica pH e cloro", "corpo", 950, 260),
    ],
  },
  {
    nome: "Illuminazione e accessori",
    voci: [
      v("Fornitura e posa faro LED subacqueo", "cad", 180, 90),
      v("Fornitura e posa scala romana / in acciaio inox", "cad", 420, 160),
      v("Fornitura e posa doccia esterna", "cad", 280, 120),
    ],
  },
  {
    nome: "Bordo e pavimentazione",
    voci: [
      v("Fornitura e posa bordo a sfioro / skimmer", "ml", 55, 45),
      v("Pavimentazione perimetrale antiscivolo", "mq", 38, 32),
      v("Coronamento e finiture del bordo vasca", "ml", 40, 35),
    ],
  },
  {
    nome: "Coperture e sicurezza",
    voci: [
      v("Fornitura e posa copertura isotermica a bolle", "mq", 9, 6),
      v("Fornitura e posa tapparella automatica", "corpo", 4500, 900),
      v("Fornitura e posa recinzione / allarme di sicurezza", "corpo", 1200, 450),
    ],
  },
];

/** Riga capitolo pronta per insert su `pis_listino_capitoli`. */
export interface SeedCapitoloRow {
  id: string;
  company_id: string;
  nome: string;
  ordine: number;
}
/** Riga voce pronta per insert su `pis_listino_voci`. */
export interface SeedVoceRow {
  company_id: string;
  capitolo_id: string;
  descrizione: string;
  unita_misura: PisUnitaMisura;
  costo_materiali: number;
  costo_manodopera: number;
  ricarico_pct: number;
  prezzo_unitario: number;
  ordine: number;
}

/**
 * Trasforma il set standard in righe insertabili per una specifica azienda.
 * Genera id client-side per i capitoli (così le voci possono referenziarli),
 * `ordine` progressivo e `prezzo_unitario` da `calcPrezzoVoce`.
 */
export function buildSeedRows(
  companyId: string,
  genId: () => string = () =>
    (globalThis.crypto?.randomUUID?.() ?? `seed-${Math.random().toString(36).slice(2)}-${Date.now()}`),
): { capitoli: SeedCapitoloRow[]; voci: SeedVoceRow[] } {
  const capitoli: SeedCapitoloRow[] = [];
  const voci: SeedVoceRow[] = [];
  SEED_LISTINO.forEach((cap, capIdx) => {
    const capitoloId = genId();
    capitoli.push({ id: capitoloId, company_id: companyId, nome: cap.nome, ordine: capIdx });
    cap.voci.forEach((voce, voceIdx) => {
      voci.push({
        company_id: companyId,
        capitolo_id: capitoloId,
        descrizione: voce.descrizione,
        unita_misura: voce.unita_misura,
        costo_materiali: voce.costo_materiali,
        costo_manodopera: voce.costo_manodopera,
        ricarico_pct: voce.ricarico_pct,
        prezzo_unitario: calcPrezzoVoce(voce),
        ordine: voceIdx,
      });
    });
  });
  return { capitoli, voci };
}
