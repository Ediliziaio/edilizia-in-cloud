/**
 * Pacchetti "chiavi in mano" per il bagno: set predefiniti di voci di computo
 * (Economy / Standard / Premium) per partire in un click con un bagno tipo da
 * ~6 m². Costi materiali/manodopera indicativi; prezzo unitario con un ricarico
 * di default del 30% (pacchetto sellable) — l'azienda personalizza dopo il caricamento.
 */
import { calcRigaImporto } from "./calcoli";
import type { BgnComputoVoce, BgnUnitaMisura } from "@/types/bagni";

const RICARICO_PACCHETTO = 1.3;

interface PacchettoVoce {
  capitolo: string;
  descrizione: string;
  um: BgnUnitaMisura;
  q: number;
  /** costo materiali unitario */
  cm: number;
  /** costo manodopera unitario */
  cl: number;
}
export interface Pacchetto {
  key: string;
  label: string;
  descrizione: string;
  voci: PacchettoVoce[];
}

const v = (capitolo: string, descrizione: string, um: BgnUnitaMisura, q: number, cm: number, cl: number): PacchettoVoce =>
  ({ capitolo, descrizione, um, q, cm, cl });

export const PACCHETTI_BAGNO: readonly Pacchetto[] = [
  {
    key: "economy",
    label: "Economy",
    descrizione: "Bagno funzionale: sanitari a terra, doccia base, gres standard.",
    voci: [
      v("Demolizioni", "Rimozione sanitari, rivestimenti e pavimento esistenti", "corpo", 1, 0, 320),
      v("Idraulica e scarichi", "Adeguamento punti acqua e scarico", "corpo", 1, 180, 360),
      v("Impianto elettrico", "Punti luce/presa + specchio", "corpo", 1, 120, 200),
      v("Opere murarie", "Massetto e impermeabilizzazione", "mq", 6, 14, 18),
      v("Rivestimenti", "Pavimento in gres 30x30", "mq", 6, 22, 26),
      v("Rivestimenti", "Rivestimento pareti fino a h 2,1 m", "mq", 21, 22, 30),
      v("Sanitari", "WC e bidet a terra", "corpo", 1, 280, 160),
      v("Sanitari", "Lavabo con mobile e specchio", "corpo", 1, 240, 120),
      v("Box doccia", "Piatto doccia + box doccia base", "cad", 1, 420, 200),
      v("Rubinetteria", "Miscelatori lavabo/bidet + gruppo doccia", "corpo", 1, 220, 120),
    ],
  },
  {
    key: "standard",
    label: "Standard",
    descrizione: "Bagno moderno: wc sospeso, gres 60x60, box in cristallo, termoarredo.",
    voci: [
      v("Demolizioni", "Rimozione sanitari, rivestimenti e pavimento esistenti", "corpo", 1, 0, 350),
      v("Idraulica e scarichi", "Rifacimento punti acqua/scarico + cassetta incasso", "corpo", 1, 320, 480),
      v("Impianto elettrico", "Punti luce/presa, specchio retroilluminato", "corpo", 1, 180, 260),
      v("Opere murarie", "Massetto, impermeabilizzazione e nicchia doccia", "mq", 6, 18, 22),
      v("Rivestimenti", "Pavimento in gres porcellanato 60x60", "mq", 6, 30, 28),
      v("Rivestimenti", "Rivestimento pareti fino a h 2,2 m", "mq", 22, 28, 34),
      v("Sanitari", "WC e bidet sospesi con sedile rallentato", "corpo", 1, 540, 250),
      v("Sanitari", "Lavabo con mobile sospeso e specchio", "corpo", 1, 480, 220),
      v("Box doccia", "Piatto a filo + box doccia in cristallo 8 mm", "cad", 1, 980, 420),
      v("Rubinetteria", "Miscelatori + colonna doccia termostatica", "corpo", 1, 500, 220),
      v("Accessori e finiture", "Termoarredo + set accessori + sigillature", "corpo", 1, 400, 210),
    ],
  },
  {
    key: "premium",
    label: "Premium",
    descrizione: "Bagno di pregio: grandi formati/mosaico, box su misura, domotica luci.",
    voci: [
      v("Demolizioni", "Rimozione completa e predisposizioni", "corpo", 1, 0, 420),
      v("Idraulica e scarichi", "Rifacimento completo + predisposizione idromassaggio", "corpo", 1, 480, 620),
      v("Impianto elettrico", "Illuminazione scenografica + comandi domotici", "corpo", 1, 380, 360),
      v("Opere murarie", "Massetto, impermeabilizzazione, nicchie e setti", "mq", 6, 24, 28),
      v("Rivestimenti", "Pavimento grande formato 120x60", "mq", 6, 48, 34),
      v("Rivestimenti", "Rivestimento parete + decoro mosaico nicchia", "mq", 23, 42, 40),
      v("Sanitari", "WC e bidet sospesi top di gamma", "corpo", 1, 900, 320),
      v("Sanitari", "Doppio lavabo con top su misura", "corpo", 1, 1200, 360),
      v("Box doccia", "Piatto a filo in pietra + box su misura", "cad", 1, 1600, 560),
      v("Box doccia", "Vasca freestanding (opzionale)", "cad", 1, 1400, 420),
      v("Rubinetteria", "Rubinetteria di design + soffione a soffitto", "corpo", 1, 900, 320),
      v("Accessori e finiture", "Termoarredo design, accessori, pulizia finale", "corpo", 1, 700, 320),
    ],
  },
];

/**
 * Genera le righe di computo (`BgnComputoVoce`) per un pacchetto, pronte per
 * essere iniettate nello stato del ComputoEditor. Importo e margine sono coerenti
 * con i calcoli del computo (`calcRigaImporto`); `prezzo_unitario` = costo × ricarico.
 */
export function buildPacchettoRows(
  pacchetto: Pacchetto,
  progettoId: string,
  companyId: string,
  genId: () => string = () =>
    (globalThis.crypto?.randomUUID?.() ?? `pac-${Math.random().toString(36).slice(2)}-${Date.now()}`),
): BgnComputoVoce[] {
  return pacchetto.voci.map((voce, i) => {
    const prezzo = Math.round((voce.cm + voce.cl) * RICARICO_PACCHETTO * 100) / 100;
    const importo = calcRigaImporto({ quantita: voce.q, prezzo_unitario: prezzo, sconto_pct: 0 });
    const costoRiga = (voce.cm + voce.cl) * voce.q;
    const margine_eur = importo - costoRiga;
    return {
      id: genId(),
      progetto_id: progettoId,
      company_id: companyId,
      capitolo_nome: voce.capitolo,
      descrizione: voce.descrizione,
      unita_misura: voce.um,
      quantita: voce.q,
      prezzo_unitario: prezzo,
      costo_materiali: voce.cm,
      costo_manodopera: voce.cl,
      sconto_pct: 0,
      importo,
      margine_eur,
      margine_pct: importo > 0 ? (margine_eur / importo) * 100 : 0,
      listino_voce_id: null,
      ordine: i,
      fonte: null,
    };
  });
}
