/**
 * Listino Manutenzione — preset templates.
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 *
 * Catalogo pre-compilato di impianti / interventi / tariffe per ognuno dei
 * 9 preset (termoidraulica, elettrico, bagno, fotovoltaico, pittura,
 * tetti_ripasso, tetti_rifacimento, scavi, piscine).
 */
import {
  Sparkles, Flame, Zap as ZapIcon, Sun, Bath, PaintBucket,
  Cloud, Construction, Shovel, Waves,
} from "lucide-react";
import type { Vertical } from "@/hooks/useVertical";
import type {
  PresetListinoId, ImpiantoSeed, InterventoSeed, TariffaListinoSeed,
} from "./types";

/**
 * Mappa il `vertical` dell'azienda ai preset di listino manutenzione che
 * saranno pre-selezionati nel dialog "Importa da template".
 */
export function getDefaultPresetsForVertical(vertical: Vertical): PresetListinoId[] {
  switch (vertical) {
    case "caldaie":
    case "clima":
      return ["termoidraulica"];
    case "tetti":
      return ["tetti_ripasso"];
    case "bagno":
      return ["bagno"];
    case "ristrutturazione":
      return ["pittura", "bagno", "elettrico"];
    case "serramentista":
    case "tende_da_sole":
    case "vetrate":
    case "generico":
    default:
      return [];
  }
}

export const STANDARD_IMPIANTI: ImpiantoSeed[] = [
  // Termoidraulica / elettrico (classici)
  { nome: "Caldaia",              icona: "🔥", ordine: 10,  presets: ["termoidraulica"] },
  { nome: "Condizionatore",       icona: "❄️", ordine: 20,  presets: ["termoidraulica", "bagno"] },
  { nome: "Impianto Idraulico",   icona: "💧", ordine: 30,  presets: ["termoidraulica", "bagno"] },
  { nome: "Pompa di calore",      icona: "🌡️", ordine: 35,  presets: ["termoidraulica"] },
  { nome: "Impianto Elettrico",   icona: "⚡", ordine: 40,  presets: ["elettrico", "bagno"] },
  { nome: "Quadro elettrico",     icona: "🔌", ordine: 45,  presets: ["elettrico"] },
  { nome: "Allarme / antifurto",  icona: "🚨", ordine: 50,  presets: ["elettrico"] },
  { nome: "Videosorveglianza",    icona: "📹", ordine: 55,  presets: ["elettrico"] },
  // Bagno
  { nome: "Sanitari",             icona: "🚽", ordine: 60,  presets: ["bagno"] },
  { nome: "Box doccia / vasca",   icona: "🛁", ordine: 65,  presets: ["bagno"] },
  { nome: "Rubinetteria",         icona: "🚿", ordine: 70,  presets: ["bagno"] },
  // Fotovoltaico
  { nome: "Impianto Fotovoltaico",icona: "☀️", ordine: 80,  presets: ["fotovoltaico"] },
  { nome: "Inverter FV",          icona: "🔋", ordine: 85,  presets: ["fotovoltaico"] },
  { nome: "Sistema di accumulo",  icona: "🔋", ordine: 90,  presets: ["fotovoltaico"] },
  // Pittura / pareti
  { nome: "Pareti interne",       icona: "🖌️", ordine: 100, presets: ["pittura"] },
  { nome: "Facciate esterne",     icona: "🏢", ordine: 105, presets: ["pittura"] },
  { nome: "Infissi in legno",     icona: "🚪", ordine: 110, presets: ["pittura"] },
  // Tetti
  { nome: "Copertura a falda",    icona: "🏠", ordine: 120, presets: ["tetti_ripasso", "tetti_rifacimento"] },
  { nome: "Canali di gronda",     icona: "🌧️", ordine: 125, presets: ["tetti_ripasso", "tetti_rifacimento"] },
  { nome: "Lucernari",            icona: "🪟", ordine: 130, presets: ["tetti_rifacimento"] },
  { nome: "Comignoli",            icona: "🏭", ordine: 135, presets: ["tetti_ripasso", "tetti_rifacimento"] },
  // Scavi
  { nome: "Area di cantiere",     icona: "⛏️", ordine: 140, presets: ["scavi"] },
  { nome: "Sottoservizi",         icona: "🚧", ordine: 145, presets: ["scavi"] },
  // Piscine
  { nome: "Vasca piscina",        icona: "🏊", ordine: 150, presets: ["piscine"] },
  { nome: "Impianto filtraggio",  icona: "⚙️", ordine: 155, presets: ["piscine"] },
  { nome: "Illuminazione piscina",icona: "💡", ordine: 160, presets: ["piscine"] },
];

export const STANDARD_INTERVENTI: InterventoSeed[] = [
  // Generici
  { nome: "Manutenzione ordinaria", categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["termoidraulica", "elettrico", "bagno", "fotovoltaico", "piscine"] },
  { nome: "Riparazione guasto",     categoria: "guasto",                     durata_stimata_h: 3, presets: ["termoidraulica", "elettrico", "bagno"] },
  { nome: "Sopralluogo",            categoria: "sopralluogo",                durata_stimata_h: 1, presets: ["termoidraulica", "elettrico", "bagno", "fotovoltaico", "pittura", "tetti_ripasso", "tetti_rifacimento", "scavi", "piscine"] },
  { nome: "Installazione",          categoria: "installazione",              durata_stimata_h: 6, presets: ["termoidraulica", "elettrico", "bagno", "fotovoltaico", "piscine"] },
  // Fotovoltaico specifici
  { nome: "Pulizia pannelli FV",    categoria: "manutenzione_ordinaria",     durata_stimata_h: 3, presets: ["fotovoltaico"] },
  { nome: "Controllo producibilità",categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["fotovoltaico"] },
  { nome: "Sostituzione inverter",  categoria: "guasto",                     durata_stimata_h: 4, presets: ["fotovoltaico"] },
  // Pittura specifici
  { nome: "Ritocco localizzato",    categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["pittura"] },
  { nome: "Tinteggiatura completa", categoria: "installazione",              durata_stimata_h: 8, presets: ["pittura"] },
  { nome: "Rasatura + stucco",      categoria: "installazione",              durata_stimata_h: 4, presets: ["pittura"] },
  // Tetti ripasso
  { nome: "Pulizia canali",         categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["tetti_ripasso"] },
  { nome: "Ripasso coppi",          categoria: "manutenzione_straordinaria", durata_stimata_h: 4, presets: ["tetti_ripasso"] },
  { nome: "Trattamento antimuschio",categoria: "manutenzione_ordinaria",     durata_stimata_h: 3, presets: ["tetti_ripasso"] },
  { nome: "Sostituzione coppi rotti", categoria: "guasto",                   durata_stimata_h: 2, presets: ["tetti_ripasso"] },
  // Tetti rifacimento
  { nome: "Rimozione manto",        categoria: "installazione",              durata_stimata_h: 8, presets: ["tetti_rifacimento"] },
  { nome: "Posa nuovo manto",       categoria: "installazione",              durata_stimata_h: 10,presets: ["tetti_rifacimento"] },
  { nome: "Impermeabilizzazione",   categoria: "installazione",              durata_stimata_h: 6, presets: ["tetti_rifacimento", "piscine", "bagno"] },
  // Scavi
  { nome: "Sbancamento",            categoria: "installazione",              durata_stimata_h: 8, presets: ["scavi"] },
  { nome: "Scavo fondazione",       categoria: "installazione",              durata_stimata_h: 6, presets: ["scavi"] },
  { nome: "Reinterro",              categoria: "installazione",              durata_stimata_h: 4, presets: ["scavi"] },
  // Piscine
  { nome: "Apertura stagionale",    categoria: "manutenzione_ordinaria",     durata_stimata_h: 4, presets: ["piscine"] },
  { nome: "Chiusura invernale",     categoria: "manutenzione_ordinaria",     durata_stimata_h: 4, presets: ["piscine"] },
  { nome: "Pulizia vasca",          categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["piscine"] },
  { nome: "Controllo pH e clorazione", categoria: "manutenzione_ordinaria",  durata_stimata_h: 1, presets: ["piscine"] },
];

export const STANDARD_TARIFFE_LISTINO: TariffaListinoSeed[] = [
  // ─── TERMOIDRAULICA ─────────────────────────────────────────────────────────
  { impianto: "Caldaia",            intervento: "Manutenzione ordinaria", prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Caldaia",            intervento: "Riparazione guasto",     prezzo: 80,  unita: "ora",        iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Caldaia",            intervento: "Sopralluogo",            prezzo: 60,  unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Condizionatore",     intervento: "Manutenzione ordinaria", prezzo: 90,  unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Condizionatore",     intervento: "Riparazione guasto",     prezzo: 90,  unita: "ora",        iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Condizionatore",     intervento: "Installazione",          prezzo: 280, unita: "intervento", iva_pct: 10, presets: ["termoidraulica"] },
  { impianto: "Impianto Idraulico", intervento: "Riparazione guasto",     prezzo: 75,  unita: "ora",        iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Impianto Idraulico", intervento: "Sopralluogo",            prezzo: 55,  unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Pompa di calore",    intervento: "Manutenzione ordinaria", prezzo: 180, unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Pompa di calore",    intervento: "Installazione",          prezzo: 850, unita: "intervento", iva_pct: 10, presets: ["termoidraulica"] },

  // ─── ELETTRICO ──────────────────────────────────────────────────────────────
  { impianto: "Impianto Elettrico", intervento: "Manutenzione ordinaria", prezzo: 95,  unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Impianto Elettrico", intervento: "Riparazione guasto",     prezzo: 70,  unita: "ora",        iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Impianto Elettrico", intervento: "Sopralluogo",            prezzo: 55,  unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Quadro elettrico",   intervento: "Installazione",          prezzo: 450, unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Allarme / antifurto",intervento: "Installazione",          prezzo: 650, unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Allarme / antifurto",intervento: "Manutenzione ordinaria", prezzo: 80,  unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Videosorveglianza",  intervento: "Installazione",          prezzo: 850, unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Videosorveglianza",  intervento: "Manutenzione ordinaria", prezzo: 110, unita: "intervento", iva_pct: 22, presets: ["elettrico"] },

  // ─── BAGNO ──────────────────────────────────────────────────────────────────
  { impianto: "Sanitari",           intervento: "Installazione",          prezzo: 320, unita: "intervento", iva_pct: 10, presets: ["bagno"] },
  { impianto: "Sanitari",           intervento: "Riparazione guasto",     prezzo: 85,  unita: "ora",        iva_pct: 22, presets: ["bagno"] },
  { impianto: "Box doccia / vasca", intervento: "Installazione",          prezzo: 380, unita: "intervento", iva_pct: 10, presets: ["bagno"] },
  { impianto: "Box doccia / vasca", intervento: "Riparazione guasto",     prezzo: 75,  unita: "ora",        iva_pct: 22, presets: ["bagno"] },
  { impianto: "Rubinetteria",       intervento: "Installazione",          prezzo: 85,  unita: "intervento", iva_pct: 10, presets: ["bagno"] },
  { impianto: "Rubinetteria",       intervento: "Riparazione guasto",     prezzo: 65,  unita: "ora",        iva_pct: 22, presets: ["bagno"] },
  { impianto: "Impianto Idraulico", intervento: "Installazione",          prezzo: 550, unita: "intervento", iva_pct: 10, presets: ["bagno"] },
  { impianto: "Box doccia / vasca", intervento: "Impermeabilizzazione",   prezzo: 35,  unita: "mq",         iva_pct: 10, presets: ["bagno"] },

  // ─── FOTOVOLTAICO ───────────────────────────────────────────────────────────
  { impianto: "Impianto Fotovoltaico", intervento: "Manutenzione ordinaria", prezzo: 180, unita: "intervento", iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Impianto Fotovoltaico", intervento: "Pulizia pannelli FV",    prezzo: 6,   unita: "mq",         iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Impianto Fotovoltaico", intervento: "Controllo producibilità",prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Impianto Fotovoltaico", intervento: "Sopralluogo",            prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Impianto Fotovoltaico", intervento: "Installazione",          prezzo: 1800,unita: "intervento", iva_pct: 10, presets: ["fotovoltaico"] },
  { impianto: "Inverter FV",           intervento: "Sostituzione inverter",  prezzo: 380, unita: "intervento", iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Sistema di accumulo",   intervento: "Installazione",          prezzo: 1200,unita: "intervento", iva_pct: 10, presets: ["fotovoltaico"] },

  // ─── PITTURA ────────────────────────────────────────────────────────────────
  { impianto: "Pareti interne",     intervento: "Tinteggiatura completa", prezzo: 9,   unita: "mq",         iva_pct: 22, presets: ["pittura"] },
  { impianto: "Pareti interne",     intervento: "Ritocco localizzato",    prezzo: 85,  unita: "intervento", iva_pct: 22, presets: ["pittura"] },
  { impianto: "Pareti interne",     intervento: "Rasatura + stucco",      prezzo: 12,  unita: "mq",         iva_pct: 22, presets: ["pittura"] },
  { impianto: "Facciate esterne",   intervento: "Tinteggiatura completa", prezzo: 16,  unita: "mq",         iva_pct: 10, presets: ["pittura"] },
  { impianto: "Facciate esterne",   intervento: "Sopralluogo",            prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["pittura"] },
  { impianto: "Infissi in legno",   intervento: "Tinteggiatura completa", prezzo: 32,  unita: "mq",         iva_pct: 22, presets: ["pittura"] },

  // ─── RIPASSO TETTI ──────────────────────────────────────────────────────────
  { impianto: "Copertura a falda",  intervento: "Ripasso coppi",          prezzo: 18,  unita: "mq",         iva_pct: 10, presets: ["tetti_ripasso"] },
  { impianto: "Copertura a falda",  intervento: "Sostituzione coppi rotti",prezzo: 8,  unita: "pz",         iva_pct: 22, presets: ["tetti_ripasso"] },
  { impianto: "Copertura a falda",  intervento: "Trattamento antimuschio",prezzo: 6,   unita: "mq",         iva_pct: 22, presets: ["tetti_ripasso"] },
  { impianto: "Canali di gronda",   intervento: "Pulizia canali",         prezzo: 4,   unita: "ml",         iva_pct: 22, presets: ["tetti_ripasso"] },
  { impianto: "Comignoli",          intervento: "Riparazione guasto",     prezzo: 140, unita: "intervento", iva_pct: 22, presets: ["tetti_ripasso"] },
  { impianto: "Copertura a falda",  intervento: "Sopralluogo",            prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["tetti_ripasso", "tetti_rifacimento"] },

  // ─── RIFACIMENTO TETTI ──────────────────────────────────────────────────────
  { impianto: "Copertura a falda",  intervento: "Rimozione manto",        prezzo: 14,  unita: "mq",         iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Copertura a falda",  intervento: "Posa nuovo manto",       prezzo: 28,  unita: "mq",         iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Copertura a falda",  intervento: "Impermeabilizzazione",   prezzo: 18,  unita: "mq",         iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Canali di gronda",   intervento: "Installazione",          prezzo: 32,  unita: "ml",         iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Lucernari",          intervento: "Installazione",          prezzo: 280, unita: "intervento", iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Comignoli",          intervento: "Installazione",          prezzo: 180, unita: "intervento", iva_pct: 10, presets: ["tetti_rifacimento"] },

  // ─── SCAVI ──────────────────────────────────────────────────────────────────
  { impianto: "Area di cantiere",   intervento: "Sopralluogo",            prezzo: 180, unita: "intervento", iva_pct: 22, presets: ["scavi"] },
  { impianto: "Area di cantiere",   intervento: "Sbancamento",            prezzo: 14,  unita: "mq",         iva_pct: 10, presets: ["scavi"] },
  { impianto: "Area di cantiere",   intervento: "Scavo fondazione",       prezzo: 28,  unita: "ml",         iva_pct: 10, presets: ["scavi"] },
  { impianto: "Area di cantiere",   intervento: "Reinterro",              prezzo: 9,   unita: "mq",         iva_pct: 10, presets: ["scavi"] },
  { impianto: "Sottoservizi",       intervento: "Installazione",          prezzo: 32,  unita: "ml",         iva_pct: 10, presets: ["scavi"] },

  // ─── PISCINE ────────────────────────────────────────────────────────────────
  { impianto: "Vasca piscina",      intervento: "Sopralluogo",            prezzo: 250, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Installazione",          prezzo: 12000,unita: "intervento",iva_pct: 10, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Impermeabilizzazione",   prezzo: 45,  unita: "mq",         iva_pct: 10, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Apertura stagionale",    prezzo: 180, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Chiusura invernale",     prezzo: 160, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Pulizia vasca",          prezzo: 95,  unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Controllo pH e clorazione", prezzo: 60, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Impianto filtraggio",intervento: "Manutenzione ordinaria", prezzo: 140, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Impianto filtraggio",intervento: "Installazione",          prezzo: 1800,unita: "intervento", iva_pct: 10, presets: ["piscine"] },
  { impianto: "Illuminazione piscina", intervento: "Installazione",       prezzo: 180, unita: "intervento", iva_pct: 10, presets: ["piscine"] },
];

export const PRESET_LISTINO_CARDS: Array<{
  id: PresetListinoId;
  nome: string;
  descrizione: string;
  icon: typeof Sparkles;
  iconClass: string;
}> = [
  { id: "termoidraulica", nome: "Termoidraulica", descrizione: "Caldaie, condizionatori, pompe di calore e impianto idraulico — set classico assistenza termoidraulica.", icon: Flame, iconClass: "bg-orange-100 text-orange-700" },
  { id: "elettrico", nome: "Elettrico & sicurezza", descrizione: "Impianti elettrici, quadri, allarmi e videosorveglianza con tariffe di manutenzione e installazione.", icon: ZapIcon, iconClass: "bg-yellow-100 text-yellow-700" },
  { id: "bagno", nome: "Ristrutturazione bagno", descrizione: "Sanitari, box doccia, rubinetterie + impermeabilizzazioni — il pacchetto completo per un bagno nuovo.", icon: Bath, iconClass: "bg-cyan-100 text-cyan-700" },
  { id: "fotovoltaico", nome: "Fotovoltaico", descrizione: "Installazione + manutenzione pannelli, pulizia, controllo producibilità, sostituzione inverter, accumulo.", icon: Sun, iconClass: "bg-amber-100 text-amber-700" },
  { id: "pittura", nome: "Pittura e decorazioni", descrizione: "Tinteggiature interne/esterne, rasature, stucchi, verniciatura infissi — tariffe al mq e a corpo.", icon: PaintBucket, iconClass: "bg-fuchsia-100 text-fuchsia-700" },
  { id: "tetti_ripasso", nome: "Ripasso tetti", descrizione: "Manutenzione coperture: ripasso coppi, pulizia canali, antimuschio, sostituzioni puntuali.", icon: Cloud, iconClass: "bg-sky-100 text-sky-700" },
  { id: "tetti_rifacimento", nome: "Rifacimento tetti", descrizione: "Rimozione manto, posa nuovo manto, impermeabilizzazione, lucernari, comignoli, canali.", icon: Construction, iconClass: "bg-stone-200 text-stone-700" },
  { id: "scavi", nome: "Scavi a terra", descrizione: "Sbancamento, scavo fondazione, reinterro, sottoservizi — tariffe al mq e al metro lineare.", icon: Shovel, iconClass: "bg-amber-100 text-amber-800" },
  { id: "piscine", nome: "Realizzazione piscine", descrizione: "Costruzione vasca + impermeabilizzazione + apertura/chiusura stagionale + impianto filtraggio.", icon: Waves, iconClass: "bg-teal-100 text-teal-700" },
];
