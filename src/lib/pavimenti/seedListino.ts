import { calcPrezzoVoce } from "./calcoli";
import type { PavUnitaMisura } from "@/types/pavimenti";

/** Voce del set standard (template, senza id/company). */
export interface SeedVoce {
  descrizione: string;
  unita_misura: PavUnitaMisura;
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
  unita_misura: PavUnitaMisura,
  costo_materiali: number,
  costo_manodopera: number,
): SeedVoce => ({ descrizione, unita_misura, costo_materiali, costo_manodopera, ricarico_pct: 0 });

/**
 * Set standard di capitoli/voci per la posa di pavimenti & resine. Costi
 * materiali/manodopera indicativi (€), ricarico 0 (l'azienda lo personalizza).
 * Valori di partenza editabili dopo l'import nel listino aziendale.
 */
export const SEED_LISTINO: SeedCapitolo[] = [
  {
    nome: "Sopralluogo e preparazione",
    voci: [
      v("Sopralluogo, rilievo e verifica del sottofondo", "corpo", 0, 140),
      v("Rimozione pavimento esistente, compreso massetto", "mq", 0, 16),
      v("Trasporto e smaltimento macerie a discarica autorizzata", "corpo", 150, 110),
    ],
  },
  {
    nome: "Massetti e sottofondi",
    voci: [
      v("Massetto autolivellante cementizio sp. 3-5 cm", "mq", 11, 14),
      v("Massetto tradizionale sabbia-cemento", "mq", 9, 16),
      v("Primer / promotore di adesione", "mq", 3, 4),
      v("Rasatura di livellamento per posa", "mq", 5, 8),
    ],
  },
  {
    nome: "Pavimenti in gres / ceramica",
    voci: [
      v("Fornitura e posa gres porcellanato 60x60", "mq", 32, 28),
      v("Fornitura e posa grande formato (120x120 e oltre)", "mq", 55, 45),
      v("Stuccatura/fugatura con fuga colorata", "mq", 3, 8),
      v("Fornitura e posa battiscopa in gres", "ml", 9, 10),
    ],
  },
  {
    nome: "Parquet e laminato",
    voci: [
      v("Fornitura e posa parquet prefinito incollato", "mq", 48, 32),
      v("Fornitura e posa parquet massello", "mq", 70, 45),
      v("Fornitura e posa laminato flottante con materassino", "mq", 22, 16),
      v("Fornitura e posa battiscopa in legno", "ml", 11, 10),
    ],
  },
  {
    nome: "Resine e microcemento",
    voci: [
      v("Resina epossidica/poliuretanica multistrato", "mq", 35, 40),
      v("Microcemento a parete/pavimento (cicli completi)", "mq", 42, 48),
      v("Finitura protettiva trasparente anti-usura", "mq", 8, 10),
      v("Decorazioni/effetti speciali su resina", "mq", 15, 25),
    ],
  },
  {
    nome: "Pietra e materiali naturali",
    voci: [
      v("Fornitura e posa marmo / granito lucidato", "mq", 90, 55),
      v("Fornitura e posa pietra naturale", "mq", 60, 50),
      v("Levigatura e lucidatura in opera", "mq", 8, 22),
    ],
  },
  {
    nome: "Impermeabilizzazione (aree umide)",
    voci: [
      v("Impermeabilizzazione con guaina liquida", "mq", 12, 16),
      v("Fasce di rinforzo su giunti e angoli", "ml", 4, 6),
    ],
  },
  {
    nome: "Finiture e accessori",
    voci: [
      v("Fornitura e posa profili e giunti di dilatazione", "ml", 7, 9),
      v("Fornitura e posa soglie e raccordi", "cad", 35, 30),
      v("Pulizia finale e protezione del pavimento posato", "corpo", 40, 160),
    ],
  },
];

/** Riga capitolo pronta per insert su `pav_listino_capitoli`. */
export interface SeedCapitoloRow {
  id: string;
  company_id: string;
  nome: string;
  ordine: number;
}
/** Riga voce pronta per insert su `pav_listino_voci`. */
export interface SeedVoceRow {
  company_id: string;
  capitolo_id: string;
  descrizione: string;
  unita_misura: PavUnitaMisura;
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
