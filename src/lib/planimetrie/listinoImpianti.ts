/**
 * Voci impianti dalla pianta: per ogni quantità che la pianta sa contare (punti presa,
 * punti luce, metri di cavo, tubi, split…) una voce di computo con descrizione, unità e un
 * prezzo di partenza. I prezzi sono indicativi di mercato (fornitura e posa, 2026) e
 * l'impresa li cambia prima di creare le voci; restano poi modificabili nel computo.
 *
 * Le voci nascono con una riga di misura legata alla chiave della pianta: quando la pianta
 * cambia, «La pianta è cambiata» e l'«Effetto sul prezzo» dell'editor le seguono.
 */
import type { MappaQuantita } from "../../../shared/planimetrie/quantita.ts";

export interface VoceListino {
  /** Soggetto e misura della chiave, senza ambito né stato: «elementi:presa.numero», «impianti:elettrico.cavo_ml». */
  id: string;
  descrizione: string;
  unita: "n" | "ml";
  prezzo: number;
  capitolo: "Impianto elettrico" | "Impianto idrico e scarichi" | "Climatizzazione e riscaldamento";
}

export const LISTINO_IMPIANTI: readonly VoceListino[] = [
  { id: "elementi:quadro_elettrico.numero", descrizione: "Quadro elettrico d'appartamento con differenziali e magnetotermici, fornitura e posa", unita: "n", prezzo: 650, capitolo: "Impianto elettrico" },
  { id: "elementi:presa.numero", descrizione: "Punto presa 10/16 A sottotraccia, completo di scatola, frutto e placca", unita: "n", prezzo: 48, capitolo: "Impianto elettrico" },
  { id: "elementi:punto_luce.numero", descrizione: "Punto luce a soffitto sottotraccia", unita: "n", prezzo: 42, capitolo: "Impianto elettrico" },
  { id: "elementi:interruttore.numero", descrizione: "Punto di comando (interruttore o deviatore) sottotraccia", unita: "n", prezzo: 38, capitolo: "Impianto elettrico" },
  { id: "impianti:elettrico.corrugato_ml", descrizione: "Tubo corrugato flessibile Ø 25 mm sottotraccia, compresa la traccia", unita: "ml", prezzo: 6.5, capitolo: "Impianto elettrico" },
  { id: "impianti:elettrico.cavo_ml", descrizione: "Cavo unipolare FS17 sezione 2,5 mmq", unita: "ml", prezzo: 1.3, capitolo: "Impianto elettrico" },
  { id: "elementi:collettore.numero", descrizione: "Collettore di distribuzione acqua sanitaria con cassetta", unita: "n", prezzo: 380, capitolo: "Impianto idrico e scarichi" },
  { id: "elementi:punto_acqua.numero", descrizione: "Punto acqua fredda e calda (adduzione) sottotraccia", unita: "n", prezzo: 125, capitolo: "Impianto idrico e scarichi" },
  { id: "elementi:scarico.numero", descrizione: "Punto di scarico in PP con raccordi", unita: "n", prezzo: 95, capitolo: "Impianto idrico e scarichi" },
  { id: "impianti:acqua.tubo_ml", descrizione: "Tubo multistrato coibentato Ø 16–20 mm per acqua fredda e calda", unita: "ml", prezzo: 11, capitolo: "Impianto idrico e scarichi" },
  { id: "impianti:scarico.tubo_ml", descrizione: "Tubo di scarico in PP Ø 40–110 mm con pendenza", unita: "ml", prezzo: 16, capitolo: "Impianto idrico e scarichi" },
  { id: "elementi:split.numero", descrizione: "Climatizzatore split inverter, unità interna, fornitura e posa", unita: "n", prezzo: 850, capitolo: "Climatizzazione e riscaldamento" },
  { id: "elementi:unita_esterna.numero", descrizione: "Unità esterna climatizzatore con staffe e antivibranti, posa", unita: "n", prezzo: 450, capitolo: "Climatizzazione e riscaldamento" },
  { id: "impianti:clima.rame_ml", descrizione: "Linea frigorifera in rame coibentato (due tubi), compresa la traccia", unita: "ml", prezzo: 32, capitolo: "Climatizzazione e riscaldamento" },
  { id: "impianti:clima.condensa_ml", descrizione: "Tubo scarico condensa", unita: "ml", prezzo: 7, capitolo: "Climatizzazione e riscaldamento" },
  { id: "elementi:termosifone.numero", descrizione: "Radiatore in alluminio con valvola termostatica e detentore", unita: "n", prezzo: 290, capitolo: "Climatizzazione e riscaldamento" },
  { id: "elementi:caldaia.numero", descrizione: "Caldaia murale a condensazione, fornitura e posa", unita: "n", prezzo: 2300, capitolo: "Climatizzazione e riscaldamento" },
];

export interface ProposteVoce {
  voce: VoceListino;
  /** La chiave completa della pianta (con ambito e stato). */
  chiave: string;
  quantita: number;
  stimata: boolean;
}

/**
 * Le voci del listino che la pianta sa misurare in questo stato. Per gli elementi:
 * nello stato di fatto quelli esistenti, nel progetto quelli nuovi (è il lavoro da fare).
 */
export function vociDallaPianta(mappa: MappaQuantita, ambito: string): ProposteVoce[] {
  const statoElementi = ambito === "fatto" ? "esistente" : "nuovo";
  const out: ProposteVoce[] = [];
  for (const voce of LISTINO_IMPIANTI) {
    const [soggetto, misura] = voce.id.split(".");
    const chiave = soggetto.startsWith("elementi:")
      ? `${ambito}:elementi:${statoElementi}:${soggetto.slice("elementi:".length)}.${misura}`
      : `${ambito}:${soggetto}.${misura}`;
    const q = mappa[chiave];
    if (!q || !(q.valore > 0)) continue;
    out.push({ voce, chiave, quantita: Math.round(q.valore * 100) / 100, stimata: q.origine === "stimata" });
  }
  return out;
}
