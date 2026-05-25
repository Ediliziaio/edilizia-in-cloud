// Mappatura dalle scale del test alle macro-aree del grafico a candele
// Aggiornato secondo il Manuale di Elaborazione V2
import { ScalaCode, SCALE_LABELS } from '../types';
import { calculateSecondaryIndices } from './interpretazioneProfile';

export interface MacroArea {
  id: string;
  label: string;
  description: string;
  calcola: (scale: Record<string, number>) => number;
  tooltipPositive: string;
  tooltipNegative: string;
}

export const MACRO_AREAS: MacroArea[] = [
  {
    id: 'organizzazione',
    label: 'Organizzazione',
    description: 'Capacità di strutturare il lavoro e mantenere ordine',
    calcola: (s) => {
      // Formula Manuale V3: (EF + 120 - |SC - 120|) / 2 - 100
      const ef = s['EF'] || 100;
      const sc = s['SC'] || 100;
      return ((ef + 120 - Math.abs(sc - 120)) / 2) - 100;
    },
    tooltipPositive: 'Eccellente capacità organizzativa. Sa strutturare il lavoro efficacemente.',
    tooltipNegative: 'Difficoltà nella gestione organizzativa. Tende al disordine operativo.',
  },
  {
    id: 'motivazione',
    label: 'Motivazione',
    description: 'Spinta interiore e determinazione nel raggiungere obiettivi',
    calcola: (s) => (s['MO'] || 100) - 100,
    tooltipPositive: 'Altamente motivato e determinato. Persegue gli obiettivi con costanza.',
    tooltipNegative: 'Bassa motivazione intrinseca. Fatica a mantenere la spinta nel tempo.',
  },
  {
    id: 'gestione_stress',
    label: 'Gestione Stress',
    description: 'Capacità di gestire la pressione e le situazioni difficili',
    calcola: (s) => (s['CF'] || 100) - 100,
    tooltipPositive: 'Eccellente gestione dello stress. Rimane lucido sotto pressione.',
    tooltipNegative: 'Vulnerabilità allo stress. Rischio di calo prestazionale sotto pressione.',
  },
  {
    id: 'autodisciplina',
    label: 'Autodisciplina',
    description: 'Controllo di sé e rispetto delle regole e scadenze',
    calcola: (s) => {
      // Formula Manuale V3: (EF + QR + min(SC, 140)) / 3 - 100
      const ef = s['EF'] || 100;
      const qr = s['QR'] || 100;
      const sc = Math.min(s['SC'] || 100, 140);
      return ((ef + qr + sc) / 3) - 100;
    },
    tooltipPositive: 'Forte autodisciplina. Rispetta scadenze e procedure autonomamente.',
    tooltipNegative: 'Scarsa autodisciplina. Necessita supervisione costante.',
  },
  {
    id: 'determinazione',
    label: 'Determinazione',
    description: 'Capacità di portare a termine gli obiettivi nonostante gli ostacoli',
    calcola: (s) => {
      // Media di EC e MO
      const ec = s['EC'] || 100;
      const mo = s['MO'] || 100;
      return ((ec + mo) / 2) - 100;
    },
    tooltipPositive: 'Altamente determinato. Non si arrende di fronte agli ostacoli.',
    tooltipNegative: 'Tendenza ad abbandonare quando le cose si complicano.',
  },
  {
    id: 'attitudine_vendita',
    label: 'Att. Vendita',
    description: 'Propensione alla persuasione e al contatto commerciale',
    calcola: (s) => {
      // Usa l'indice secondario
      const indici = calculateSecondaryIndices(s);
      return indici.attitudineVendita - 100;
    },
    tooltipPositive: 'Naturale predisposizione commerciale. Ottimo nel convincere e negoziare.',
    tooltipNegative: 'Scarsa attitudine commerciale. Difficoltà nella persuasione.',
  },
  {
    id: 'leadership',
    label: 'Leadership',
    description: 'Capacità di guidare e influenzare gli altri',
    calcola: (s) => {
      // Usa l'indice secondario Leadership Naturale
      const indici = calculateSecondaryIndices(s);
      return indici.leadershipNaturale - 100;
    },
    tooltipPositive: 'Forte leadership naturale. Sa guidare e ispirare il team.',
    tooltipNegative: 'Tendenza a seguire piuttosto che guidare.',
  },
  {
    id: 'produttivita',
    label: 'Produttività',
    description: 'Efficienza nel completare le attività',
    calcola: (s) => {
      // Usa l'indice secondario Worker Index
      const indici = calculateSecondaryIndices(s);
      return indici.workerIndex - 100;
    },
    tooltipPositive: 'Altamente produttivo. Ottimizza tempo e risorse.',
    tooltipNegative: 'Produttività sotto la media. Rischio di rallentamenti operativi.',
  },
  {
    id: 'empatia',
    label: 'Empatia',
    description: 'Capacità di comprendere e connettersi con gli altri',
    calcola: (s) => {
      // Media di SP e PA
      const sp = s['SP'] || 100;
      const pa = s['PA'] || 100;
      return ((sp + pa) / 2) - 100;
    },
    tooltipPositive: 'Elevata empatia. Costruisce relazioni autentiche.',
    tooltipNegative: 'Difficoltà nella connessione emotiva con colleghi e clienti.',
  },
  {
    id: 'flessibilita',
    label: 'Flessibilità',
    description: 'Adattabilità ai cambiamenti e nuove situazioni',
    calcola: (s) => {
      // Flessibilità = 200 - SC, poi normalizzata
      const sc = s['SC'] || 100;
      const flessibilita = 200 - sc;
      return flessibilita - 100;
    },
    tooltipPositive: 'Alta flessibilità. Si adatta facilmente ai cambiamenti.',
    tooltipNegative: 'Rigido e resistente ai cambiamenti. Preferisce procedure stabili.',
  },
];

// Calcola il valore di una macro-area dai punteggi delle scale
export function calculateMacroAreaValue(
  macroArea: MacroArea,
  scalePunteggi: Record<string, number>
): number {
  return macroArea.calcola(scalePunteggi);
}

// Genera i dati per il grafico a candele
export interface CandleData {
  id: string;
  label: string;
  value: number; // -100 a +100
  isPositive: boolean;
  tooltipText: string;
  description: string;
}

export function generateCandleChartData(
  scalePunteggi: Record<string, number>
): CandleData[] {
  return MACRO_AREAS.map(area => {
    const value = calculateMacroAreaValue(area, scalePunteggi);
    const isPositive = value >= 0;
    
    return {
      id: area.id,
      label: area.label,
      value: Math.max(-100, Math.min(100, value)), // Clamp tra -100 e +100
      isPositive,
      tooltipText: isPositive ? area.tooltipPositive : area.tooltipNegative,
      description: area.description,
    };
  });
}

// Colori per il grafico
export const CANDLE_COLORS = {
  positive: 'hsl(var(--primary))', // Blu
  negative: 'hsl(var(--accent))', // Arancione
  neutral: 'hsl(var(--muted-foreground))',
};
