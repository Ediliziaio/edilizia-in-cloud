import { calcPrezzoVoce } from "./calcoli";
import type { EleUnitaMisura } from "@/types/elettrico";

/** Voce del set standard (template, senza id/company). */
export interface SeedVoce {
  descrizione: string;
  unita_misura: EleUnitaMisura;
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
  unita_misura: EleUnitaMisura,
  costo_materiali: number,
  costo_manodopera: number,
): SeedVoce => ({ descrizione, unita_misura, costo_materiali, costo_manodopera, ricarico_pct: 0 });

/**
 * Set standard di capitoli/voci per un impianto elettrico civile/domotico.
 * Costi materiali/manodopera indicativi (€), ricarico 0 (l'azienda lo
 * personalizza). Valori di partenza editabili dopo l'import nel listino aziendale.
 */
export const SEED_LISTINO: SeedCapitolo[] = [
  {
    nome: "Sopralluogo e progetto",
    voci: [
      v("Sopralluogo tecnico e rilievo dell'impianto esistente", "corpo", 0, 160),
      v("Progetto impianto e schema unifilare del quadro", "corpo", 0, 220),
      v("Dichiarazione di conformità impianto (DM 37/08)", "corpo", 0, 180),
    ],
  },
  {
    nome: "Quadro elettrico",
    voci: [
      v("Fornitura e posa quadro elettrico centralizzato (centralino)", "cad", 120, 180),
      v("Fornitura e posa interruttore magnetotermico differenziale", "cad", 45, 25),
      v("Fornitura e posa interruttore magnetotermico modulare", "cad", 18, 18),
      v("Fornitura e posa scaricatore di sovratensione (SPD)", "cad", 90, 45),
    ],
  },
  {
    nome: "Punti luce e comandi",
    voci: [
      v("Punto luce completo di cavo, scatola, tubazione e frutto", "cad", 18, 35),
      v("Punto comando deviato / invertito", "cad", 22, 42),
      v("Punto comando con dimmer / regolazione", "cad", 38, 45),
    ],
  },
  {
    nome: "Punti presa",
    voci: [
      v("Punto presa 2P+T 10/16 A bivalente completo", "cad", 16, 32),
      v("Punto presa schuko / universale completo", "cad", 18, 34),
      v("Punto presa dedicata su linea autonoma (lavatrice, forno)", "cad", 24, 45),
    ],
  },
  {
    nome: "Linee e cablaggi",
    voci: [
      v("Linea dorsale/montante completa di cavo e tubazione", "ml", 6, 12),
      v("Tubazione corrugata in traccia / cavidotto", "ml", 3, 10),
      v("Fornitura e posa cassetta di derivazione", "cad", 8, 22),
    ],
  },
  {
    nome: "Forza motrice e utenze speciali",
    voci: [
      v("Alimentazione dedicata a boiler / pompa di calore", "cad", 35, 60),
      v("Punto cucina/forno con linea dedicata", "cad", 30, 55),
      v("Predisposizione ricarica veicolo elettrico (wallbox)", "cad", 120, 140),
    ],
  },
  {
    nome: "Illuminazione",
    voci: [
      v("Fornitura e posa faretto LED da incasso", "cad", 22, 20),
      v("Fornitura e posa plafoniera/applique LED", "cad", 45, 28),
      v("Fornitura e posa striscia LED con alimentatore", "ml", 14, 18),
      v("Fornitura e posa corpo illuminante da esterno", "cad", 65, 40),
    ],
  },
  {
    nome: "Domotica e sicurezza",
    voci: [
      v("Fornitura e posa centralina/gateway domotico", "cad", 320, 180),
      v("Fornitura e posa termostato/cronotermostato smart", "cad", 110, 60),
      v("Fornitura e posa videocitofono", "cad", 240, 140),
      v("Fornitura e posa kit antifurto (centrale + sensori)", "corpo", 420, 280),
    ],
  },
  {
    nome: "Reti dati e TV",
    voci: [
      v("Punto rete LAN cat. 6 completo di cavo e presa", "cad", 22, 38),
      v("Punto presa TV / SAT completo", "cad", 18, 30),
      v("Fornitura e posa access point Wi-Fi", "cad", 90, 50),
    ],
  },
];

/** Riga capitolo pronta per insert su `ele_listino_capitoli`. */
export interface SeedCapitoloRow {
  id: string;
  company_id: string;
  nome: string;
  ordine: number;
}
/** Riga voce pronta per insert su `ele_listino_voci`. */
export interface SeedVoceRow {
  company_id: string;
  capitolo_id: string;
  descrizione: string;
  unita_misura: EleUnitaMisura;
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
