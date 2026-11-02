/**
 * Voci impianti dalla pianta: per ogni quantità che la pianta sa contare (punti presa,
 * punti luce, metri di cavo, tubi, split…) una voce di computo con descrizione, unità e un
 * prezzo di partenza. I prezzi sono indicativi di mercato (fornitura e posa, 2026) e
 * l'impresa li cambia prima di creare le voci; restano poi modificabili nel computo.
 *
 * Le voci nascono con una riga di misura legata alla chiave della pianta: quando la pianta
 * cambia, «La pianta è cambiata» e l'«Effetto sul prezzo» dell'editor le seguono.
 */
import { CAMPI } from "./campiSport";
import type { MappaQuantita } from "../../../shared/planimetrie/quantita.ts";

export interface VoceListino {
  /** Soggetto e misura della chiave, senza ambito né stato: «elementi:presa.numero», «impianti:elettrico.cavo_ml». */
  id: string;
  descrizione: string;
  unita: "n" | "ml" | "mq" | "mc";
  prezzo: number;
  capitolo: "Impianto elettrico" | "Impianto idrico e scarichi" | "Climatizzazione e riscaldamento" | "Energia" | "Esterni" | "Copertura" | "Sport" | "Scavi e terreno";
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
  { id: "impianti:riscaldamento.tubo_ml", descrizione: "Tubo multistrato coibentato per riscaldamento, mandata e ritorno", unita: "ml", prezzo: 12, capitolo: "Climatizzazione e riscaldamento" },
  { id: "elementi:termostato.numero", descrizione: "Termostato ambiente programmabile, posa e collegamento", unita: "n", prezzo: 140, capitolo: "Climatizzazione e riscaldamento" },
  { id: "impianti:fotovoltaico.kwp", descrizione: "Impianto fotovoltaico su tetto: moduli da 430 Wp, strutture, cavi e quadro di campo (inverter e accumulo a parte), per kWp", unita: "n", prezzo: 1450, capitolo: "Energia" },
  { id: "tetto:copertura.superficie_mq", descrizione: "Copertura: manto in tegole (o guaina sul piano) con impermeabilizzazione e isolamento", unita: "mq", prezzo: 135, capitolo: "Copertura" },
  { id: "terreno:scavo.volume_mc", descrizione: "Scavo di sbancamento con mezzo meccanico, carico e trasporto a discarica", unita: "mc", prezzo: 28, capitolo: "Scavi e terreno" },
  { id: "terreno:riporto.volume_mc", descrizione: "Riporto con materiale arido stabilizzato, steso e compattato a strati", unita: "mc", prezzo: 32, capitolo: "Scavi e terreno" },
  { id: "elementi:pompa_calore.numero", descrizione: "Pompa di calore aria-acqua monoblocco, fornitura e posa", unita: "n", prezzo: 7800, capitolo: "Energia" },
  { id: "elementi:bollitore.numero", descrizione: "Bollitore per acqua calda sanitaria 200 l", unita: "n", prezzo: 1500, capitolo: "Energia" },
  { id: "elementi:inverter.numero", descrizione: "Inverter per impianto fotovoltaico, posa e collegamento", unita: "n", prezzo: 1900, capitolo: "Energia" },
  { id: "elementi:batteria_accumulo.numero", descrizione: "Batteria di accumulo 10 kWh", unita: "n", prezzo: 5200, capitolo: "Energia" },
  { id: "elementi:wallbox.numero", descrizione: "Wallbox per ricarica auto 7,4 kW, posa e linea dedicata", unita: "n", prezzo: 1100, capitolo: "Energia" },
  { id: "elementi:lucernario.numero", descrizione: "Finestra per tetti 78 × 118 cm con raccordo, fornitura e posa", unita: "n", prezzo: 1350, capitolo: "Copertura" },
  { id: "elementi:vmc.numero", descrizione: "Ventilazione meccanica controllata con recupero di calore", unita: "n", prezzo: 3800, capitolo: "Energia" },
  { id: "elementi:piscina.numero", descrizione: "Piscina interrata con vasca, impianto di filtrazione, bordo e scavo (a corpo, da adeguare alla misura)", unita: "n", prezzo: 38000, capitolo: "Esterni" },
  { id: "elementi:idromassaggio.numero", descrizione: "Minipiscina idromassaggio da esterno, fornitura e posa", unita: "n", prezzo: 9500, capitolo: "Esterni" },
  { id: "elementi:pergola.numero", descrizione: "Pergola in legno o alluminio con copertura, fornitura e posa", unita: "n", prezzo: 6500, capitolo: "Esterni" },
  { id: "elementi:cancello_pedonale.numero", descrizione: "Cancello pedonale in ferro zincato verniciato, con pilastrini e serratura elettrica", unita: "n", prezzo: 1400, capitolo: "Esterni" },
  { id: "elementi:cancello_carrabile.numero", descrizione: "Cancello carrabile scorrevole motorizzato, con pilastri e fotocellule", unita: "n", prezzo: 4800, capitolo: "Esterni" },
  { id: "elementi:lampione.numero", descrizione: "Lampione da giardino LED, con plinto e linea interrata", unita: "n", prezzo: 520, capitolo: "Esterni" },
  { id: "elementi:faretto_giardino.numero", descrizione: "Faretto o segnapasso LED da esterno, con linea", unita: "n", prezzo: 160, capitolo: "Esterni" },
  { id: "elementi:irrigatore.numero", descrizione: "Irrigatore a scomparsa con tubazione e quota della centralina", unita: "n", prezzo: 95, capitolo: "Esterni" },
  { id: "elementi:pozzetto.numero", descrizione: "Pozzetto in cls con chiusino carrabile", unita: "n", prezzo: 180, capitolo: "Esterni" },
  { id: "elementi:barbecue.numero", descrizione: "Barbecue in muratura con piano di lavoro", unita: "n", prezzo: 2200, capitolo: "Esterni" },
  { id: "esterni:prato.superficie_mq", descrizione: "Prato: preparazione del terreno, concimazione e semina (o posa a rotoli)", unita: "mq", prezzo: 9, capitolo: "Esterni" },
  { id: "esterni:pavimentato.superficie_mq", descrizione: "Pavimentazione esterna in gres o pietra su massetto, compreso sottofondo", unita: "mq", prezzo: 85, capitolo: "Esterni" },
  { id: "esterni:vialetto.superficie_mq", descrizione: "Vialetto pedonale in lastre o autobloccanti, compreso sottofondo", unita: "mq", prezzo: 70, capitolo: "Esterni" },
  { id: "esterni:ghiaia.superficie_mq", descrizione: "Ghiaia su telo antiradice, spessore 8 cm", unita: "mq", prezzo: 22, capitolo: "Esterni" },
  { id: "esterni:parcheggio.superficie_mq", descrizione: "Area di parcheggio in autobloccanti o asfalto, compreso cassonetto", unita: "mq", prezzo: 60, capitolo: "Esterni" },
  { id: "esterni:aiuola.superficie_mq", descrizione: "Aiuola con cordolo, terra vegetale e piante", unita: "mq", prezzo: 45, capitolo: "Esterni" },
  { id: "esterni:lotto.recinzione_ml", descrizione: "Recinzione: muretto in calcestruzzo e rete o pannelli metallici h 1,50 m", unita: "ml", prezzo: 110, capitolo: "Esterni" },
  { id: "elementi:caldaia.numero", descrizione: "Caldaia murale a condensazione, fornitura e posa", unita: "n", prezzo: 2300, capitolo: "Climatizzazione e riscaldamento" },
  // Sport: un campo «chiavi in mano», prezzo indicativo dal modulo dei campi
  ...CAMPI.map((c): VoceListino => ({ id: `elementi:${c.tipo}.numero`, descrizione: c.descrizione, unita: "n", prezzo: c.prezzo, capitolo: "Sport" })),
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
