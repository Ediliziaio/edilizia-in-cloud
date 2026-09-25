/**
 * Il preventivo d'esempio della Casa Full Electric: lo usano l'anteprima del
 * modello e la prova del PDF. Numeri verosimili ma dimostrativi, dichiarati
 * come tali: una villetta di 120 m² che lascia caldaia e piano a gas.
 */
import type { FotoFullElectric, FullElectricPdfData } from "@/components/termoidraulico/fullElectric/FullElectricPDF";
import type { ComponenteFullElectric } from "./regole";
import { economiaFullElectric, type DatiFullElectric } from "./dati";
import { FAQ_FULL_ELECTRIC, PASSAGGI_FULL_ELECTRIC } from "./testi";

/** Le foto di serie del modello, finché non ci sono quelle dedicate. */
export const FOTO_FULL_ELECTRIC_DI_SERIE: Partial<Record<FotoFullElectric, string>> = {
  copertina: "/pdf-stock/fotovoltaico/villa-tetto-coppi.jpg",
  cosaVuolDire: "/pdf-stock/fotovoltaico/tecnica-percorso-energia.jpg",
  oggi: "/module-art/termoidraulica-caldaia.jpg",
  domani: "/pdf-stock/fotovoltaico/villa-tetto-piano.jpg",
  energia: "/pdf-stock/fotovoltaico/storia-energia-serale.jpg",
  bollette: "/pdf-stock/fotovoltaico/storia-bolletta-serena.jpg",
  incentivi: "/pdf-stock/comune/consegna-documenti.jpg",
  ambiente: "/pdf-stock/fotovoltaico/co2-bosco.jpg",
  passaggi: "/pdf-stock/fotovoltaico/sopralluogo.jpg",
  installazione: "/pdf-stock/fotovoltaico/fasi-installatori.jpg",
  decisione: "/pdf-stock/fotovoltaico/villa-tramonto.jpg",
};

/** La foto di ogni pezzo del sistema; senza foto adatta la scheda resta senza. */
export const FOTO_PEZZI_FULL_ELECTRIC: Record<ComponenteFullElectric, string | null> = {
  fotovoltaico: "/pdf-stock/fotovoltaico/vista-drone.jpg",
  accumulo: "/pdf-stock/fotovoltaico/inverter-batteria-garage.jpg",
  pompa_calore: "/pdf-stock/termoidraulico/pompa-di-calore.jpg",
  induzione: null,
  scaldacqua: "/module-art/termoidraulica-acqua-calda-cover-v2.jpg",
  climatizzazione: "/module-art/climatizzazione.jpg",
  wallbox: "/pdf-stock/fotovoltaico/auto-elettrica-wallbox.jpg",
};

/** I dati d'esempio: li usano l'anteprima della libreria e la prova del PDF. */
export const DATI_FULL_ELECTRIC_DIMOSTRATIVI: DatiFullElectric = {
  componenti: [
    { tipo: "fotovoltaico", titolo: "Fotovoltaico 6 kWp", dettaglio: "14 moduli da 430 W e inverter ibrido" },
    { tipo: "accumulo", titolo: "Batteria da 10 kWh", dettaglio: "Al litio, modulare: si può ampliare" },
    { tipo: "pompa_calore", titolo: "Pompa di calore aria-acqua 8 kW", dettaglio: "Riscaldamento e acqua calda, bollitore da 200 litri" },
    { tipo: "induzione", titolo: "Piano a induzione", dettaglio: "4 zone, 60 cm" },
  ],
  impianto_attuale: "Caldaia a gas del 2008 e piano cottura a gas",
  spesa_gas: 1700,
  spesa_luce: 960,
  gas_smc: 1400,
  luce_kwh: 3000,
  produzione_kwh: 7500,
  consumo_kwh: 7200,
  autoconsumo_pct: 60,
  prezzo_luce: 0.28,
  prezzo_immissione: 0.1,
  quota_fissa: 150,
  detrazione_pct: 50,
  importo_detraibile: 16000,
  contributo_ct: 3500,
  modalita_ct: "sconto_in_fattura",
  aumento_energia_pct: 2,
  anni: 20,
  caratteristiche: [
    { etichetta: "Potenza del fotovoltaico", valore: "6 kWp" },
    { etichetta: "Produzione stimata", valore: "7.500 kWh l'anno" },
    { etichetta: "Batteria", valore: "10 kWh" },
    { etichetta: "Pompa di calore", valore: "8 kW · SCOP 4,6" },
    { etichetta: "Piano a induzione", valore: "4 zone" },
    { etichetta: "Potenza del contatore", valore: "6 kW" },
  ],
};

export function anteprimaFullElectric(foto: Partial<Record<FotoFullElectric, string | null>> = {
  ...FOTO_FULL_ELECTRIC_DI_SERIE, ...FOTO_PEZZI_FULL_ELECTRIC,
}): FullElectricPdfData {
  const d = DATI_FULL_ELECTRIC_DIMOSTRATIVI;
  return {
    azienda: { nome: "La tua azienda", telefono: "+39 02 000 000", email: "info@azienda.it", sito: "azienda.it", piva: "IT00000000000" },
    cliente: { nome: "Mario Rossi", indirizzo: "Via Roma 1, 20100 Milano (MI)" },
    preventivo: { codice: "FE-ESEMPIO", dataIso: "2026-09-25T10:00:00Z", validitaGiorni: 30, consulente: "Il tuo consulente" },
    sistema: {
      componenti: d.componenti,
      impiantoAttuale: d.impianto_attuale,
      voci: [
        { descrizione: "Impianto fotovoltaico 6 kWp: 14 moduli da 430 W, strutture e inverter ibrido" },
        { descrizione: "Batteria di accumulo al litio da 10 kWh" },
        { descrizione: "Pompa di calore aria-acqua 8 kW con bollitore da 200 litri" },
        { descrizione: "Piano a induzione 4 zone e linea dedicata" },
        { descrizione: "Smontaggio della caldaia a gas e chiusura dell'allacciamento" },
        { descrizione: "Pratiche di connessione alla rete e per gli incentivi" },
      ],
      caratteristiche: d.caratteristiche,
    },
    economia: economiaFullElectric(d, 28600, 10),
    testi: { faq: FAQ_FULL_ELECTRIC, passaggi: PASSAGGI_FULL_ELECTRIC },
    foto,
  };
}
