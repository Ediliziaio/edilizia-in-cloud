import { calcPrezzoVoce } from "./calcoli";
import type { TetUnitaMisura } from "@/types/tetti";

/** Voce del set standard (template, senza id/company). */
export interface SeedVoce {
  descrizione: string;
  unita_misura: TetUnitaMisura;
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
  unita_misura: TetUnitaMisura,
  costo_materiali: number,
  costo_manodopera: number,
): SeedVoce => ({ descrizione, unita_misura, costo_materiali, costo_manodopera, ricarico_pct: 0 });

/**
 * Set standard di capitoli/voci per il rifacimento di una copertura/tetto.
 * Costi materiali/manodopera indicativi (€), ricarico 0 (l'azienda lo personalizza).
 * I prezzi sono valori di partenza editabili dopo l'import nel listino aziendale.
 */
export const SEED_LISTINO: SeedCapitolo[] = [
  {
    nome: "Allestimento cantiere e ponteggi",
    voci: [
      v("Ponteggio perimetrale fisso, montaggio e nolo primo mese", "mq", 8, 9),
      v("Allestimento cantiere, recinzioni e segnaletica di sicurezza", "corpo", 180, 220),
      v("Linea vita provvisoria e sistemi anticaduta di cantiere", "corpo", 120, 180),
    ],
  },
  {
    nome: "Smontaggio e rimozioni",
    voci: [
      v("Rimozione manto di copertura esistente (coppi/tegole/lastre)", "mq", 0, 12),
      v("Rimozione vecchia guaina/isolante e listellatura", "mq", 0, 10),
      v("Rimozione lattoneria esistente (gronde, pluviali, scossaline)", "ml", 0, 8),
      v("Trasporto e smaltimento materiali a discarica autorizzata", "mq", 6, 5),
    ],
  },
  {
    nome: "Struttura e orditura",
    voci: [
      v("Revisione e sostituzione di travetti e listellatura in legno", "mq", 14, 16),
      v("Trattamento antitarlo e ignifugo dell'orditura lignea", "mq", 4, 6),
      v("Rinforzo/sostituzione elementi portanti ammalorati", "cad", 60, 140),
    ],
  },
  {
    nome: "Isolamento e coibentazione",
    voci: [
      v("Pannelli isolanti in fibra di legno/lana di roccia sp. 10 cm", "mq", 24, 12),
      v("Freno/barriera al vapore", "mq", 5, 6),
      v("Membrana traspirante di sottotegola", "mq", 7, 7),
    ],
  },
  {
    nome: "Impermeabilizzazione",
    voci: [
      v("Guaina bituminosa ardesiata a doppio strato", "mq", 12, 14),
      v("Membrana sintetica TPO/PVC per coperture piane", "mq", 18, 16),
      v("Sigillature, raccordi e risvolti a parete", "ml", 6, 12),
    ],
  },
  {
    nome: "Manto di copertura",
    voci: [
      v("Fornitura e posa coppi/tegole portoghesi o marsigliesi", "mq", 22, 18),
      v("Fornitura e posa lastre metalliche aggraffate", "mq", 38, 26),
      v("Colmi, displuvi e pezzi speciali", "ml", 14, 16),
      v("Elementi di ventilazione e aeratori di colmo", "cad", 28, 22),
    ],
  },
  {
    nome: "Lattoneria",
    voci: [
      v("Fornitura e posa canali di gronda in alluminio/rame", "ml", 22, 14),
      v("Fornitura e posa pluviali e discendenti", "ml", 18, 12),
      v("Scossaline, converse e faldali a camini/pareti", "ml", 24, 16),
    ],
  },
  {
    nome: "Sicurezza e opere accessorie",
    voci: [
      v("Linea vita permanente certificata (UNI 11578)", "corpo", 480, 320),
      v("Fornitura e posa lucernario / finestra da tetto", "cad", 520, 240),
      v("Comignoli, torrini e converse di camino", "cad", 180, 120),
      v("Fermaneve e parapetti perimetrali", "ml", 28, 18),
    ],
  },
  {
    nome: "Finiture e pulizia",
    voci: [
      v("Trattamento e tinteggiatura del sottogronda/cornicione", "mq", 4, 9),
      v("Pulizia finale della copertura e del cantiere", "corpo", 0, 280),
      v("Smaltimento finale e ripristino delle aree", "corpo", 60, 160),
    ],
  },
];

/** Riga capitolo pronta per insert su `tet_listino_capitoli`. */
export interface SeedCapitoloRow {
  id: string;
  company_id: string;
  nome: string;
  ordine: number;
}
/** Riga voce pronta per insert su `tet_listino_voci`. */
export interface SeedVoceRow {
  company_id: string;
  capitolo_id: string;
  descrizione: string;
  unita_misura: TetUnitaMisura;
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
