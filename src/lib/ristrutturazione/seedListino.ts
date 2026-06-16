import { calcPrezzoVoce } from "./calcoli";
import type { RstUnitaMisura } from "@/types/ristrutturazione";

/** Voce del set standard (template, senza id/company). */
export interface SeedVoce {
  descrizione: string;
  unita_misura: RstUnitaMisura;
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
  unita_misura: RstUnitaMisura,
  costo_materiali: number,
  costo_manodopera: number,
): SeedVoce => ({ descrizione, unita_misura, costo_materiali, costo_manodopera, ricarico_pct: 0 });

/**
 * Set standard di capitoli/voci edili per la ristrutturazione residenziale.
 * Costi materiali/manodopera indicativi (€), ricarico 0 (l'azienda lo personalizza).
 * I prezzi sono valori di partenza editabili dopo l'import nel listino aziendale.
 */
export const SEED_LISTINO: SeedCapitolo[] = [
  {
    nome: "Demolizioni e rimozioni",
    voci: [
      v("Demolizione di tramezzi e murature interne, compreso carico", "mq", 0, 18),
      v("Rimozione di pavimento esistente e relativo massetto", "mq", 0, 14),
      v("Rimozione di rivestimenti e sanitari del bagno", "corpo", 0, 350),
      v("Trasporto e smaltimento macerie a discarica autorizzata", "mq", 12, 8),
    ],
  },
  {
    nome: "Opere murarie",
    voci: [
      v("Tramezzo in laterizio forato sp. 8 cm, posto in opera", "mq", 16, 24),
      v("Formazione di tracce per impianti su muratura", "ml", 1.5, 9),
      v("Chiusura tracce e ripristino murario con malta", "ml", 3, 7),
      v("Realizzazione di nuova apertura con architrave", "cad", 60, 240),
    ],
  },
  {
    nome: "Intonaci",
    voci: [
      v("Intonaco civile premiscelato per interni a base calce", "mq", 7, 16),
      v("Rasatura a gesso di pareti e soffitti, finitura liscia", "mq", 4, 12),
      v("Ripristino di intonaci ammalorati con rete portaintonaco", "mq", 9, 18),
    ],
  },
  {
    nome: "Massetti e sottofondi",
    voci: [
      v("Massetto autolivellante per posa pavimentazioni", "mq", 9, 11),
      v("Sottofondo alleggerito per passaggio impianti", "mq", 8, 10),
      v("Barriera al vapore e isolamento acustico anticalpestio", "mq", 6, 7),
    ],
  },
  {
    nome: "Pavimenti e rivestimenti",
    voci: [
      v("Fornitura e posa gres porcellanato 60x60 per pavimento", "mq", 28, 26),
      v("Fornitura e posa rivestimento bagno fino a h 2,10 m", "mq", 24, 30),
      v("Posa di battiscopa in gres o legno", "ml", 6, 8),
      v("Fornitura e posa parquet prefinito rovere", "mq", 42, 24),
    ],
  },
  {
    nome: "Impianto elettrico",
    voci: [
      v("Punto luce/comando completo di cavo, scatola e frutto", "cad", 18, 35),
      v("Punto presa 10/16 A completo di linea e frutto", "cad", 16, 32),
      v("Fornitura e posa quadro elettrico con differenziali", "corpo", 220, 280),
      v("Certificazione di conformità impianto (DM 37/08)", "corpo", 0, 350),
    ],
  },
  {
    nome: "Impianto idro-sanitario",
    voci: [
      v("Punto di adduzione e scarico acqua per sanitario", "cad", 45, 90),
      v("Fornitura e posa di sanitari sospesi (wc + bidet)", "corpo", 380, 260),
      v("Fornitura e posa piatto doccia e box doccia", "corpo", 420, 240),
      v("Fornitura e posa miscelatori e rubinetteria", "cad", 95, 60),
    ],
  },
  {
    nome: "Impianto termico",
    voci: [
      v("Fornitura e posa di radiatori in alluminio per elemento", "cad", 22, 16),
      v("Sostituzione caldaia a condensazione murale", "corpo", 1200, 600),
      v("Termostato ambiente cronotermostato wireless", "cad", 80, 70),
    ],
  },
  {
    nome: "Serramenti interni",
    voci: [
      v("Fornitura e posa porta interna tamburata in laminato", "cad", 180, 90),
      v("Fornitura e posa porta scorrevole interno muro", "cad", 320, 160),
      v("Sostituzione di soglie e davanzali interni", "ml", 35, 30),
    ],
  },
  {
    nome: "Tinteggiature",
    voci: [
      v("Tinteggiatura di pareti e soffitti con idropittura traspirante", "mq", 2, 7),
      v("Applicazione di fondo fissativo isolante", "mq", 1.2, 4),
      v("Stuccatura e carteggiatura preliminare delle superfici", "mq", 1.5, 6),
    ],
  },
  {
    nome: "Opere esterne",
    voci: [
      v("Impermeabilizzazione di balcone con guaina e ripristino", "mq", 22, 28),
      v("Tinteggiatura di facciata con pittura ai silicati", "mq", 5, 14),
      v("Pulizia finale del cantiere e smontaggio ponteggi", "corpo", 0, 450),
    ],
  },
];

/** Riga capitolo pronta per insert su `rst_listino_capitoli`. */
export interface SeedCapitoloRow {
  id: string;
  company_id: string;
  nome: string;
  ordine: number;
}
/** Riga voce pronta per insert su `rst_listino_voci`. */
export interface SeedVoceRow {
  company_id: string;
  capitolo_id: string;
  descrizione: string;
  unita_misura: RstUnitaMisura;
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
