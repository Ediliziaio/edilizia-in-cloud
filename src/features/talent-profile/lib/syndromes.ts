/**
 * Sistema Sindromi V5 - Assessment Psicometrico
 *
 * 24 sindromi totali:
 * - 18 primarie (S01-S18) con gravità RED/ORANGE/YELLOW
 * - 6 secondarie (SS1-SS6)
 *
 * Basato sul Manuale V5
 */

import { SyndromeSeverity } from '../types';

// ============================================
// INTERFACCE
// ============================================

export interface SyndromeResult {
  code: string;
  name: string;
  severity: SyndromeSeverity;
  description: string;
  isActive: boolean;
  category: 'primary' | 'secondary';
}

export interface TraitScores {
  ORG: number;
  AUT: number;
  GP: number;
  ADS: number;
  DET: number;
  VEN: number;
  HRM: number;
  LDR: number;
  PRO: number;
  COM: number;
  ESP: number;
  RC: number;
  FIN: number;
  SUC: number;
  PRI: number;
}

export interface SyndromeCheckContext {
  traits: TraitScores;
  candidateAge?: number;
  allTraits: number[];  // Per calcolare se GP è il più alto
}

// ============================================
// SINDROMI PRIMARIE (S01-S18)
// ============================================

function checkS01_DemotivanteCronica(ctx: SyndromeCheckContext): SyndromeResult {
  const { HRM, PRO, COM, ESP } = ctx.traits;
  const isActive = HRM < 0 && PRO < 0 && COM < 0 && ESP < 0;

  return {
    code: 'S01',
    name: 'PERSONA DEMOTIVANTE CRONICA',
    severity: 'RED',
    description: 'SEMPRE NON IDONEA. Porta al fallimento chi gestisce.',
    isActive,
    category: 'primary'
  };
}

function checkS02_SP(ctx: SyndromeCheckContext): SyndromeResult {
  const { AUT, GP, COM, RC } = ctx.traits;
  const isActive = AUT >= 60 && GP < 21 && COM <= 0 && RC > 45;

  return {
    code: 'S02',
    name: 'SP (SOPPRESSIVA)',
    severity: 'RED',
    description: 'SEMPRE NON IDONEA. Porta aziende al fallimento. Possibili comportamenti poco etici.',
    isActive,
    category: 'primary'
  };
}

function checkS03_Trouble(ctx: SyndromeCheckContext): SyndromeResult {
  const { AUT, GP, RC, COM } = ctx.traits;
  const isActive = AUT >= 60 && (GP < 21 || RC <= -19) && COM <= 0;

  return {
    code: 'S03',
    name: 'TROUBLE',
    severity: 'RED',
    description: 'Bomba a mano. Idonea SOLO con controllo costante. Se RC>45 diventa SP.',
    isActive,
    category: 'primary'
  };
}

function checkS04_PersonaDemotivante(ctx: SyndromeCheckContext): SyndromeResult {
  const { PRO, COM, ESP } = ctx.traits;
  const isActive = PRO <= 0 && COM <= 0 && ESP <= 0;

  return {
    code: 'S04',
    name: 'PERSONA DEMOTIVANTE',
    severity: 'RED',
    description: 'SEMPRE NON IDONEA. Amplifica difficoltà, demotiva.',
    isActive,
    category: 'primary'
  };
}

function checkS05_AtteggiamentoDemotivante(ctx: SyndromeCheckContext): SyndromeResult {
  const { GP, PRO, COM } = ctx.traits;
  const isActive = GP <= 0 && PRO < 10 && COM <= 0;

  return {
    code: 'S05',
    name: 'ATTEGGIAMENTO DEMOTIVANTE',
    severity: 'ORANGE',
    description: '50% casi problemi etica. NON IDONEA ruoli chiave.',
    isActive,
    category: 'primary'
  };
}

function checkS06_ProblemiEtica(ctx: SyndromeCheckContext): SyndromeResult {
  const { ORG, AUT, GP, ADS, PRO, COM, ESP, RC, FIN, SUC, PRI } = ctx.traits;

  // 6 combinazioni (attendibilità ~85%)
  const S06a = ORG < 31 && ADS < 0 && PRO < 15 && FIN < 0;
  const S06b = RC < -14 && FIN < 31 && GP < 0 && ADS < 40 && PRI < 70;
  const S06c = RC < -14 && FIN < 31 && GP > 60 && ADS < 40 && PRI < 70;
  const S06d = (ESP > 49 && ORG < 26 && AUT < 30 && ADS < 40) ||
               (COM > 14 && ORG < 26 && AUT < 30 && ADS < 40);
  const S06e = PRO > 0 && COM > 0 && ESP > 0 && SUC < 69 && PRI < 40 && FIN < 30;
  const S06f = PRO < -50 && COM < -50;

  const isActive = S06a || S06b || S06c || S06d || S06e || S06f;

  return {
    code: 'S06',
    name: 'POTENZIALI PROBLEMI ETICA',
    severity: 'ORANGE',
    description: 'Attendibilità 85%. Richiede approfondimento in colloquio.',
    isActive,
    category: 'primary'
  };
}

function checkS07_CreativoDispersivo(ctx: SyndromeCheckContext): SyndromeResult {
  const { ORG, RC } = ctx.traits;
  const isActive = ORG < 30 && RC <= 14;

  return {
    code: 'S07',
    name: 'CREATIVO DISPERSIVO',
    severity: 'ORANGE',
    description: 'Inizia progetti, non completa. Non adatto a ruoli che richiedono follow-through.',
    isActive,
    category: 'primary'
  };
}

function checkS08_Ghost(ctx: SyndromeCheckContext): SyndromeResult {
  const { ORG, AUT, GP, ADS, DET, VEN, PRO } = ctx.traits;
  const isActive = ORG > 44 && AUT > 44 && GP > 44 && ADS > 44 && DET > 44 && VEN > 44 && PRO > 44;

  return {
    code: 'S08',
    name: 'GHOST',
    severity: 'ORANGE',
    description: '80% prestazioni inferiori al grafico. Profilo troppo uniforme.',
    isActive,
    category: 'primary'
  };
}

function checkS09_RobotismoAlContrario(ctx: SyndromeCheckContext): SyndromeResult {
  const { AUT, GP, RC } = ctx.traits;
  const isActive = (AUT >= 60 && GP < 21) || (AUT >= 60 && RC <= -20);

  return {
    code: 'S09',
    name: 'ROBOTISMO AL CONTRARIO',
    severity: 'ORANGE',
    description: 'Fa opposto di richiesto. Non idonea Capo Area/Direttore Vendite.',
    isActive,
    category: 'primary'
  };
}

function checkS10_DisaccordoTipo1(ctx: SyndromeCheckContext): SyndromeResult {
  const { AUT, DET, VEN, PRO, COM } = ctx.traits;
  const isActive = AUT > 29 && DET > 29 && VEN > 49 && PRO < 30 && COM < 20;

  return {
    code: 'S10',
    name: 'DISACCORDO Tipo 1',
    severity: 'YELLOW',
    description: 'Genera disaccordi inconsapevoli. Richiede coaching comunicativo.',
    isActive,
    category: 'primary'
  };
}

function checkS11_DisaccordoTipo2(ctx: SyndromeCheckContext): SyndromeResult {
  const { AUT, GP, DET, PRO, COM } = ctx.traits;
  const isActive = GP > 49 && PRO > 39 && COM < 16 && (DET > 44 || (DET > 35 && AUT > 60));

  return {
    code: 'S11',
    name: 'DISACCORDO Tipo 2',
    severity: 'YELLOW',
    description: 'Attacca chi non concorda. Gestire con attenzione in team.',
    isActive,
    category: 'primary'
  };
}

function checkS12_InsuccessoCommerciale(ctx: SyndromeCheckContext): SyndromeResult {
  const { VEN, RC, SUC, FIN } = ctx.traits;
  const age = ctx.candidateAge || 0;
  const isActive = VEN > 29 && age > 39 && RC > 44 && SUC < 69 && FIN < 30;

  return {
    code: 'S12',
    name: 'INSUCCESSO COMMERCIALE',
    severity: 'YELLOW',
    description: 'Scarsi risultati commerciali nonostante attitudine. Pattern di rigidità.',
    isActive,
    category: 'primary'
  };
}

function checkS13_FuoriRotta(ctx: SyndromeCheckContext): SyndromeResult {
  const { SUC, PRI, FIN } = ctx.traits;
  const isActive = SUC < 69 && PRI < 40 && FIN < 30;

  return {
    code: 'S13',
    name: 'FUORI ROTTA',
    severity: 'YELLOW',
    description: 'Principi sbagliati per prosperità. Richiede riallineamento valori.',
    isActive,
    category: 'primary'
  };
}

function checkS14_PocaPrecisione(ctx: SyndromeCheckContext): SyndromeResult {
  const { AUT, VEN } = ctx.traits;
  const isActive = AUT >= 60 && VEN >= 70;

  return {
    code: 'S14',
    name: 'POCA PRECISIONE',
    severity: 'YELLOW',
    description: 'Non adatta ruoli impiegatizi/back office. Troppo orientata alla vendita.',
    isActive,
    category: 'primary'
  };
}

function checkS15_ProfiloTuttoBasso(ctx: SyndromeCheckContext): SyndromeResult {
  const { ORG, AUT, GP, ADS, DET, VEN, HRM, LDR, PRO, COM, ESP, FIN, SUC, PRI } = ctx.traits;
  // Tutti i tratti (escluso RC) <= +10
  const allLow = ORG <= 10 && AUT <= 10 && GP <= 10 && ADS <= 10 && DET <= 10 &&
                 VEN <= 10 && HRM <= 10 && LDR <= 10 && PRO <= 10 && COM <= 10 &&
                 ESP <= 10 && FIN <= 10 && SUC <= 10 && PRI <= 10;

  return {
    code: 'S15',
    name: 'PROFILO TUTTO BASSO',
    severity: 'ORANGE',
    description: 'Condizione PSP anche se GP non lo indica. Relazione demotivante in corso.',
    isActive: allLow,
    category: 'primary'
  };
}

function checkS16_BruttoCarattere(ctx: SyndromeCheckContext): SyndromeResult {
  const { PRO, COM } = ctx.traits;
  const isActive = PRO < 10 && COM <= 0;

  return {
    code: 'S16',
    name: 'BRUTTO CARATTERE',
    severity: 'YELLOW',
    description: 'Difficoltà relazionali evidenti. Non adatto a ruoli di contatto.',
    isActive,
    category: 'primary'
  };
}

function checkS17_GPPiuAlto(ctx: SyndromeCheckContext): SyndromeResult {
  const { GP } = ctx.traits;
  const allTraitValues = ctx.allTraits;
  const maxTrait = Math.max(...allTraitValues);
  const isActive = GP === maxTrait && GP > 0;

  return {
    code: 'S17',
    name: 'GP PIÙ ALTO',
    severity: 'YELLOW',
    description: 'Non affronta situazioni. Se venditore con DET<30: NON IDONEO.',
    isActive,
    category: 'primary'
  };
}

function checkS18_Ego(ctx: SyndromeCheckContext): SyndromeResult {
  const { ORG, AUT, DET, VEN, LDR, PRO, COM, ESP } = ctx.traits;
  const isActive = ORG < 0 && AUT > 50 && DET > 44 && VEN > 44 && LDR > 44 &&
                   PRO < 0 && COM < 0 && ESP > 60;

  return {
    code: 'S18',
    name: 'EGO',
    severity: 'YELLOW',
    description: 'Ego ipertrofico. Difficile da gestire, resiste al feedback.',
    isActive,
    category: 'primary'
  };
}

// S19: RC MOLTO ALTA (Manuale V2.0 - RC >= 45)
function checkS19_RCMoltoAlta(ctx: SyndromeCheckContext): SyndromeResult {
  const { RC } = ctx.traits;
  const isActive = RC >= 45;

  return {
    code: 'S19',
    name: 'RC MOLTO ALTA',
    severity: 'YELLOW',
    description: 'Rigidità elevata. Resiste ai cambiamenti, si giustifica. Gestire con numeri e fatti concreti.',
    isActive,
    category: 'primary'
  };
}

// S20: RC MOLTO BASSA (Manuale V2.0 - RC <= -29)
function checkS20_RCMoltoBassa(ctx: SyndromeCheckContext): SyndromeResult {
  const { RC } = ctx.traits;
  const isActive = RC < -29;

  return {
    code: 'S20',
    name: 'RC MOLTO BASSA',
    severity: 'ORANGE',
    description: 'Altamente dispersiva, impulsiva. Vulcano di idee ma non ne completa nessuna. Cambia continuamente direzione.',
    isActive,
    category: 'primary'
  };
}

// ============================================
// SINDROMI SECONDARIE (SS1-SS6)
// ============================================

function checkSS1_FaCoseMaNonLeFaFare(ctx: SyndromeCheckContext): SyndromeResult {
  const { ADS, DET } = ctx.traits;
  const isActive = ADS > 44 && DET < 30;

  return {
    code: 'SS1',
    name: 'FA COSE MA NON LE FA FARE',
    severity: 'YELLOW',
    description: 'Alta autodisciplina ma bassa determinazione nella delega.',
    isActive,
    category: 'secondary'
  };
}

function checkSS2_DisaccordoImportante(ctx: SyndromeCheckContext): SyndromeResult {
  const { GP, COM } = ctx.traits;
  const isActive = GP <= 0 && COM <= 0;

  return {
    code: 'SS2',
    name: 'DISACCORDO IMPORTANTE',
    severity: 'YELLOW',
    description: 'Combinazione di pressione e scarsa comprensione genera conflitti.',
    isActive,
    category: 'secondary'
  };
}

function checkSS3_Perfezionista(ctx: SyndromeCheckContext): SyndromeResult {
  const { ORG, COM } = ctx.traits;
  const isActive = ORG > 64 && COM < 0;

  return {
    code: 'SS3',
    name: 'PERFEZIONISTA',
    severity: 'YELLOW',
    description: 'Alta organizzazione ma poca tolleranza per gli errori altrui.',
    isActive,
    category: 'secondary'
  };
}

function checkSS4_Esecutore(ctx: SyndromeCheckContext): SyndromeResult {
  const { ORG, GP, PRO } = ctx.traits;
  const isActive = ORG >= 30 && GP >= 30 && PRO >= 20;

  return {
    code: 'SS4',
    name: 'ESECUTORE',
    severity: 'YELLOW',  // Positiva ma segnalata
    description: 'Profilo positivo: affidabile, organizzato, proattivo.',
    isActive,
    category: 'secondary'
  };
}

function checkSS5_Zerbino(ctx: SyndromeCheckContext): SyndromeResult {
  const { PRO, DET } = ctx.traits;
  const isActive = PRO > 40 && DET < 35;

  return {
    code: 'SS5',
    name: 'ZERBINO',
    severity: 'YELLOW',
    description: 'Alta proattività ma non si impone. Rischio di essere sfruttato.',
    isActive,
    category: 'secondary'
  };
}

// SS6 removed — was duplicate of S19 (RC MOLTO ALTA) per Manuale V2.0

// ============================================
// FUNZIONE PRINCIPALE
// ============================================

/**
 * Verifica tutte le sindromi per un profilo
 */
export function checkAllSyndromes(
  traits: TraitScores,
  candidateAge?: number
): SyndromeResult[] {
  const allTraitValues = [
    traits.ORG, traits.AUT, traits.GP, traits.ADS, traits.DET,
    traits.VEN, traits.HRM, traits.LDR, traits.PRO, traits.COM,
    traits.ESP, traits.RC, traits.FIN, traits.SUC, traits.PRI
  ];

  const ctx: SyndromeCheckContext = {
    traits,
    candidateAge,
    allTraits: allTraitValues
  };

  const allSyndromes: SyndromeResult[] = [
    // Primarie (ordine di gravità)
    checkS01_DemotivanteCronica(ctx),
    checkS02_SP(ctx),
    checkS03_Trouble(ctx),
    checkS04_PersonaDemotivante(ctx),
    checkS05_AtteggiamentoDemotivante(ctx),
    checkS06_ProblemiEtica(ctx),
    checkS07_CreativoDispersivo(ctx),
    checkS08_Ghost(ctx),
    checkS09_RobotismoAlContrario(ctx),
    checkS10_DisaccordoTipo1(ctx),
    checkS11_DisaccordoTipo2(ctx),
    checkS12_InsuccessoCommerciale(ctx),
    checkS13_FuoriRotta(ctx),
    checkS14_PocaPrecisione(ctx),
    checkS15_ProfiloTuttoBasso(ctx),
    checkS16_BruttoCarattere(ctx),
    checkS17_GPPiuAlto(ctx),
    checkS18_Ego(ctx),
    checkS19_RCMoltoAlta(ctx),
    checkS20_RCMoltoBassa(ctx),
    // Secondarie
    checkSS1_FaCoseMaNonLeFaFare(ctx),
    checkSS2_DisaccordoImportante(ctx),
    checkSS3_Perfezionista(ctx),
    checkSS4_Esecutore(ctx),
    checkSS5_Zerbino(ctx),
  ];

  return allSyndromes;
}

/**
 * Ottiene solo le sindromi attive
 */
export function getActiveSyndromes(
  traits: TraitScores,
  candidateAge?: number
): SyndromeResult[] {
  return checkAllSyndromes(traits, candidateAge).filter(s => s.isActive);
}

/**
 * Verifica se ci sono sindromi critiche (S01-S04)
 */
export function hasCriticalSyndromes(
  traits: TraitScores,
  candidateAge?: number
): boolean {
  const active = getActiveSyndromes(traits, candidateAge);
  return active.some(s => ['S01', 'S02', 'S03', 'S04'].includes(s.code));
}

/**
 * Ottiene la sindrome più grave
 */
export function getMostSevereSyndrome(
  traits: TraitScores,
  candidateAge?: number
): SyndromeResult | null {
  const active = getActiveSyndromes(traits, candidateAge);
  if (active.length === 0) return null;

  // Ordine: RED > ORANGE > YELLOW
  const redSyndromes = active.filter(s => s.severity === 'RED');
  if (redSyndromes.length > 0) return redSyndromes[0];

  const orangeSyndromes = active.filter(s => s.severity === 'ORANGE');
  if (orangeSyndromes.length > 0) return orangeSyndromes[0];

  return active[0];
}

// ============================================
// SCALA DELLE CRITICITÀ
// ============================================

/**
 * Calcola il livello di criticità (1-8, dove 1 è il più grave)
 */
export function getCriticalityLevel(
  traits: TraitScores,
  candidateAge?: number
): { level: number; description: string } | null {
  const active = getActiveSyndromes(traits, candidateAge);
  const { GP, RC } = traits;

  // LIV 1: Demotivante Cronica (S01)
  if (active.some(s => s.code === 'S01')) {
    return { level: 1, description: 'Demotivante Cronica' };
  }

  // LIV 2: SP (S02)
  if (active.some(s => s.code === 'S02')) {
    return { level: 2, description: 'Soppressiva' };
  }

  // LIV 3: Persona Demotivante (S04)
  if (active.some(s => s.code === 'S04')) {
    return { level: 3, description: 'Persona Demotivante' };
  }

  // LIV 4: Trouble (S03)
  if (active.some(s => s.code === 'S03')) {
    return { level: 4, description: 'Trouble' };
  }

  // LIV 5: Robotismo al Contrario (S09)
  if (active.some(s => s.code === 'S09')) {
    return { level: 5, description: 'Robotismo al Contrario' };
  }

  // LIV 6: RC <= -20
  if (RC <= -20) {
    return { level: 6, description: 'RC Estremamente Bassa' };
  }

  // LIV 7: GP >= 69 o GP tratto più alto
  if (GP >= 69 || active.some(s => s.code === 'S17')) {
    return { level: 7, description: 'GP Critico' };
  }

  // LIV 8: GP < 21
  if (GP < 21) {
    return { level: 8, description: 'PSP (Persona Soggetta a Pressioni)' };
  }

  return null;
}

// ============================================
// UTILITÀ UI
// ============================================

/**
 * Ottiene il colore del badge per la severità
 */
export function getSeverityBadgeClass(severity: SyndromeSeverity): string {
  switch (severity) {
    case 'RED':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'ORANGE':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'YELLOW':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

/**
 * Ottiene il colore hex per la severità
 */
export function getSeverityColor(severity: SyndromeSeverity): string {
  switch (severity) {
    case 'RED':
      return '#DC2626';
    case 'ORANGE':
      return '#EA580C';
    case 'YELLOW':
      return '#CA8A04';
    default:
      return '#6B7280';
  }
}

/**
 * Formatta le sindromi per il salvataggio in DB (JSONB)
 */
export function formatSyndromesForDB(syndromes: SyndromeResult[]): object[] {
  return syndromes
    .filter(s => s.isActive)
    .map(s => ({
      code: s.code,
      name: s.name,
      severity: s.severity,
      description: s.description,
      category: s.category
    }));
}
