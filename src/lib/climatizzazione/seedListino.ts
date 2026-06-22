import { calcPrezzoVoce } from "./calcoli";
import type { ClmUnitaMisura } from "@/types/climatizzazione";

/** Voce del set standard (template, senza id/company). */
export interface SeedVoce {
  descrizione: string;
  unita_misura: ClmUnitaMisura;
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
  unita_misura: ClmUnitaMisura,
  costo_materiali: number,
  costo_manodopera: number,
): SeedVoce => ({ descrizione, unita_misura, costo_materiali, costo_manodopera, ricarico_pct: 0 });

/**
 * Set standard di capitoli/voci per un impianto di climatizzazione (split,
 * multisplit, VRF) chiavi in mano. Costi materiali/manodopera indicativi (€),
 * ricarico 0 (l'azienda lo personalizza). Valori di partenza editabili dopo
 * l'import nel listino aziendale.
 */
export const SEED_LISTINO: SeedCapitolo[] = [
  {
    nome: "Sopralluogo e progetto",
    voci: [
      v("Sopralluogo tecnico, rilievo e calcolo del carico termico", "corpo", 0, 180),
      v("Progetto impianto, schema unità e relazione tecnica", "corpo", 0, 220),
      v("Dichiarazione di conformità impianto (DM 37/08)", "corpo", 0, 160),
    ],
  },
  {
    nome: "Unità interne",
    voci: [
      v("Fornitura e posa unità interna a parete 9.000 BTU/h", "cad", 280, 140),
      v("Fornitura e posa unità interna a parete 12.000 BTU/h", "cad", 340, 150),
      v("Fornitura e posa unità interna a parete 18.000 BTU/h", "cad", 460, 170),
      v("Fornitura e posa unità interna canalizzata / a cassetta", "cad", 720, 320),
    ],
  },
  {
    nome: "Unità esterne (motocondensante)",
    voci: [
      v("Fornitura e posa unità esterna monosplit (inverter)", "cad", 520, 180),
      v("Fornitura e posa unità esterna multisplit (2-5 attacchi)", "cad", 1180, 320),
      v("Fornitura e posa unità esterna VRF/VRV per impianto canalizzato", "cad", 3200, 680),
      v("Fornitura e posa staffe antivibranti e mensole unità esterna", "cad", 60, 70),
    ],
  },
  {
    nome: "Linee frigorifere e collegamenti",
    voci: [
      v("Fornitura e posa linea frigorifera in rame coibentato (coppia tubi)", "ml", 14, 22),
      v("Cavo di collegamento elettrico unità interna/esterna", "ml", 4, 8),
      v("Fornitura e posa canalina in PVC per copertura linee", "ml", 8, 12),
      v("Carotaggio/foro passaggio tubazioni in muratura", "cad", 8, 45),
    ],
  },
  {
    nome: "Scarico condensa",
    voci: [
      v("Realizzazione linea scarico condensa a gravità", "ml", 5, 14),
      v("Fornitura e posa pompa di sollevamento condensa", "cad", 90, 70),
    ],
  },
  {
    nome: "Opere elettriche",
    voci: [
      v("Linea elettrica dedicata da quadro a unità esterna", "ml", 6, 12),
      v("Fornitura e posa interruttore magnetotermico dedicato in quadro", "cad", 35, 55),
    ],
  },
  {
    nome: "Messa in servizio",
    voci: [
      v("Vuoto impianto, carica gas refrigerante e prove di tenuta", "corpo", 60, 180),
      v("Avviamento, verifica funzionale e consegna al cliente", "corpo", 0, 140),
    ],
  },
  {
    nome: "Manutenzione",
    voci: [
      v("Pulizia e sanificazione unità interna (a unità)", "cad", 20, 45),
      v("Controllo carica gas, tenuta circuito e pressioni", "corpo", 30, 90),
    ],
  },
];

/** Riga capitolo pronta per insert su `clm_listino_capitoli`. */
export interface SeedCapitoloRow {
  id: string;
  company_id: string;
  nome: string;
  ordine: number;
}
/** Riga voce pronta per insert su `clm_listino_voci`. */
export interface SeedVoceRow {
  company_id: string;
  capitolo_id: string;
  descrizione: string;
  unita_misura: ClmUnitaMisura;
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
