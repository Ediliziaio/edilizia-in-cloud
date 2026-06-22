import { calcPrezzoVoce } from "./calcoli";
import type { IdrUnitaMisura } from "@/types/termoidraulico";

/** Voce del set standard (template, senza id/company). */
export interface SeedVoce {
  descrizione: string;
  unita_misura: IdrUnitaMisura;
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
  unita_misura: IdrUnitaMisura,
  costo_materiali: number,
  costo_manodopera: number,
): SeedVoce => ({ descrizione, unita_misura, costo_materiali, costo_manodopera, ricarico_pct: 0 });

/**
 * Set standard di capitoli/voci per un impianto termoidraulico (riscaldamento +
 * idrosanitario). Costi materiali/manodopera indicativi (€), ricarico 0 (l'azienda
 * lo personalizza). Valori di partenza editabili dopo l'import nel listino aziendale.
 */
export const SEED_LISTINO: SeedCapitolo[] = [
  {
    nome: "Sopralluogo e progetto",
    voci: [
      v("Sopralluogo, rilievo e dimensionamento dell'impianto", "corpo", 0, 200),
      v("Progetto impianto e relazione tecnica", "corpo", 0, 240),
      v("Libretto impianto e dichiarazione di conformità (DM 37/08)", "corpo", 0, 180),
    ],
  },
  {
    nome: "Generatore di calore",
    voci: [
      v("Fornitura e posa caldaia a condensazione murale", "cad", 1100, 420),
      v("Fornitura e posa pompa di calore aria-acqua", "cad", 3800, 780),
      v("Fornitura e posa sistema ibrido (caldaia + PdC)", "cad", 4600, 950),
      v("Fornitura e posa scaldabagno / bollitore ACS", "cad", 420, 220),
    ],
  },
  {
    nome: "Distribuzione e collettori",
    voci: [
      v("Fornitura e posa collettore di distribuzione con cassetta", "cad", 180, 160),
      v("Fornitura e posa tubazione multistrato preisolata", "ml", 9, 14),
      v("Coibentazione tubazioni (isolante conforme L.10)", "ml", 5, 8),
    ],
  },
  {
    nome: "Terminali di emissione",
    voci: [
      v("Fornitura e posa radiatore/termoarredo con valvole", "cad", 140, 90),
      v("Fornitura e posa ventilconvettore (fan coil)", "cad", 380, 180),
      v("Fornitura e posa pannello radiante a pavimento", "mq", 28, 26),
    ],
  },
  {
    nome: "Regolazione e contabilizzazione",
    voci: [
      v("Fornitura e posa cronotermostato / termostato ambiente", "cad", 90, 55),
      v("Fornitura e posa valvola termostatica su radiatore", "cad", 28, 22),
      v("Fornitura e posa contabilizzatore di calore", "cad", 110, 70),
    ],
  },
  {
    nome: "Idraulica sanitaria",
    voci: [
      v("Punto di adduzione acqua calda/fredda", "cad", 30, 70),
      v("Punto di scarico per apparecchio sanitario", "cad", 35, 80),
      v("Fornitura e posa miscelatore termostatico ACS", "cad", 120, 70),
    ],
  },
  {
    nome: "Sicurezza e trattamento acqua",
    voci: [
      v("Fornitura e posa vaso di espansione e valvola di sicurezza", "cad", 80, 60),
      v("Fornitura e posa filtro defangatore magnetico", "cad", 130, 70),
      v("Fornitura e posa addolcitore acqua", "cad", 380, 160),
    ],
  },
  {
    nome: "Scarico fumi",
    voci: [
      v("Fornitura e posa scarico fumi coassiale / sdoppiato", "corpo", 180, 160),
      v("Fornitura e posa canna fumaria con terminale a tetto", "ml", 60, 55),
    ],
  },
  {
    nome: "Messa in servizio",
    voci: [
      v("Riempimento, sfiati e lavaggio circuito", "corpo", 40, 140),
      v("Avviamento, taratura e collaudo impianto", "corpo", 0, 180),
      v("Rapporto di controllo efficienza energetica (RCEE)", "corpo", 0, 90),
    ],
  },
];

/** Riga capitolo pronta per insert su `idr_listino_capitoli`. */
export interface SeedCapitoloRow {
  id: string;
  company_id: string;
  nome: string;
  ordine: number;
}
/** Riga voce pronta per insert su `idr_listino_voci`. */
export interface SeedVoceRow {
  company_id: string;
  capitolo_id: string;
  descrizione: string;
  unita_misura: IdrUnitaMisura;
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
