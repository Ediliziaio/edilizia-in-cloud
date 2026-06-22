import { calcPrezzoVoce } from "./calcoli";
import type { BgnUnitaMisura } from "@/types/bagni";

/** Voce del set standard (template, senza id/company). */
export interface SeedVoce {
  descrizione: string;
  unita_misura: BgnUnitaMisura;
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
  unita_misura: BgnUnitaMisura,
  costo_materiali: number,
  costo_manodopera: number,
): SeedVoce => ({ descrizione, unita_misura, costo_materiali, costo_manodopera, ricarico_pct: 0 });

/**
 * Set standard di capitoli/voci per la ristrutturazione di un bagno chiavi in mano.
 * Costi materiali/manodopera indicativi (€), ricarico 0 (l'azienda lo personalizza).
 * I prezzi sono valori di partenza editabili dopo l'import nel listino aziendale.
 */
export const SEED_LISTINO: SeedCapitolo[] = [
  {
    nome: "Demolizioni e rimozioni",
    voci: [
      v("Rimozione di sanitari, rubinetteria e accessori esistenti", "corpo", 0, 280),
      v("Demolizione di rivestimenti e pavimenti del bagno, compreso massetto", "mq", 0, 22),
      v("Demolizione di tramezzi interni del bagno", "mq", 0, 18),
      v("Trasporto e smaltimento macerie a discarica autorizzata", "corpo", 180, 120),
    ],
  },
  {
    nome: "Idraulica e scarichi",
    voci: [
      v("Punto di adduzione acqua calda/fredda per sanitario", "cad", 35, 75),
      v("Punto di scarico per sanitario (wc, bidet, lavabo, doccia)", "cad", 40, 85),
      v("Rifacimento colonna di scarico e collegamento alla rete", "corpo", 220, 380),
      v("Fornitura e posa cassetta di scarico a incasso per wc sospeso", "cad", 180, 160),
    ],
  },
  {
    nome: "Impianto elettrico",
    voci: [
      v("Punto luce/comando completo di cavo, scatola e frutto", "cad", 18, 35),
      v("Punto presa 10/16 A completo di linea e frutto", "cad", 16, 32),
      v("Fornitura e posa specchio retroilluminato con presa", "cad", 140, 70),
      v("Adeguamento impianto e certificazione di conformità (DM 37/08)", "corpo", 0, 320),
    ],
  },
  {
    nome: "Opere murarie e massetti",
    voci: [
      v("Tramezzo in laterizio o cartongesso idro sp. 8-10 cm", "mq", 18, 26),
      v("Formazione e chiusura tracce per impianti su muratura", "ml", 3, 14),
      v("Massetto autolivellante con pendenze per piatto doccia a filo", "mq", 12, 16),
      v("Impermeabilizzazione con guaina liquida e fasce di rinforzo", "mq", 14, 18),
    ],
  },
  {
    nome: "Rivestimenti e pavimenti",
    voci: [
      v("Fornitura e posa pavimento in gres porcellanato 60x60", "mq", 32, 28),
      v("Fornitura e posa rivestimento a parete fino a h 2,20 m", "mq", 28, 34),
      v("Posa di mosaico o decoro nicchia doccia", "mq", 60, 65),
      v("Fornitura e posa profili, battiscopa e finiture angolari", "ml", 9, 12),
    ],
  },
  {
    nome: "Sanitari",
    voci: [
      v("Fornitura e posa wc sospeso con sedile rallentato", "cad", 320, 140),
      v("Fornitura e posa bidet sospeso", "cad", 220, 110),
      v("Fornitura e posa lavabo con mobile sospeso e specchio", "corpo", 480, 220),
      v("Fornitura e posa termoarredo / scaldasalviette", "cad", 260, 120),
    ],
  },
  {
    nome: "Box doccia e vasche",
    voci: [
      v("Fornitura e posa piatto doccia filo pavimento in resina/pietra", "cad", 380, 180),
      v("Fornitura e posa box doccia in cristallo temperato 8 mm", "cad", 620, 220),
      v("Fornitura e posa vasca da bagno con telaio e pannello", "cad", 540, 260),
      v("Fornitura e posa colonna doccia termostatica con soffione", "cad", 320, 130),
    ],
  },
  {
    nome: "Rubinetteria e miscelatori",
    voci: [
      v("Fornitura e posa miscelatore lavabo", "cad", 95, 55),
      v("Fornitura e posa miscelatore bidet", "cad", 90, 50),
      v("Fornitura e posa gruppo doccia/vasca incasso", "cad", 180, 90),
    ],
  },
  {
    nome: "Accessori e finiture",
    voci: [
      v("Fornitura e posa set accessori bagno (porta-salviette, dispenser, ecc.)", "corpo", 140, 90),
      v("Sigillature, silicone sanitario e pulizia finale del cantiere", "corpo", 60, 220),
      v("Tinteggiatura del soffitto e pareti non rivestite con idropittura", "mq", 2, 8),
    ],
  },
];

/** Riga capitolo pronta per insert su `bgn_listino_capitoli`. */
export interface SeedCapitoloRow {
  id: string;
  company_id: string;
  nome: string;
  ordine: number;
}
/** Riga voce pronta per insert su `bgn_listino_voci`. */
export interface SeedVoceRow {
  company_id: string;
  capitolo_id: string;
  descrizione: string;
  unita_misura: BgnUnitaMisura;
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
