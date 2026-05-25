/**
 * Gestione Stress Zone secondo il Manuale V3
 * La Stress Zone è la combinazione di SV < 100 AND CF < 100
 * con 4 livelli di severità in base ai punteggi minimi
 */

export type StressZoneSeverity = 'nessuna' | 'lieve' | 'moderata' | 'severa' | 'critica';

/**
 * Calcola la severità della Stress Zone (Manuale V3 - Cap. 10.2)
 * @param sv - Punteggio Stile di Vita (0-200)
 * @param cf - Punteggio Capacità di Fronteggiare (0-200)
 * @returns Livello di severità della Stress Zone
 */
export function calculateStressZoneSeverity(sv: number, cf: number): StressZoneSeverity {
  // Se almeno uno è >= 100, non c'è Stress Zone
  if (sv >= 100 || cf >= 100) {
    return 'nessuna';
  }
  
  // Il minimo tra i due determina la severità
  const minValue = Math.min(sv, cf);
  
  // Manuale V3: Criteri di severità
  if (minValue < 40) {
    return 'critica';
  }
  if (minValue < 60) {
    return 'severa';
  }
  if (minValue < 80) {
    return 'moderata';
  }
  // Entrambi 80-99
  return 'lieve';
}

/**
 * Ottiene il colore CSS per il livello di severità
 */
export function getStressZoneSeverityColor(severity: StressZoneSeverity): string {
  switch (severity) {
    case 'critica':
      return 'text-destructive bg-destructive/10 border-destructive';
    case 'severa':
      return 'text-red-600 bg-red-50 border-red-500';
    case 'moderata':
      return 'text-orange-600 bg-orange-50 border-orange-500';
    case 'lieve':
      return 'text-amber-600 bg-amber-50 border-amber-500';
    default:
      return 'text-green-600 bg-green-50 border-green-500';
  }
}

/**
 * Ottiene il testo interpretativo per la Stress Zone (Manuale V3 - Cap. 10.2)
 */
export function getStressZoneText(severity: StressZoneSeverity, sv: number, cf: number): string {
  switch (severity) {
    case 'critica':
      return `⚠️ STRESS ZONE CRITICA (SV: ${sv}, CF: ${cf})
      
Il candidato si trova in una situazione di crisi grave con risorse personali quasi nulle per affrontarla.

IMPLICAZIONI:
• Probabile impossibilità di sostenere qualsiasi carico lavorativo aggiuntivo
• Rischio elevatissimo di breakdown se inserito in ambiente stressante
• Capacità decisionale e di concentrazione gravemente compromesse
• Qualsiasi pressione potrebbe peggiorare la situazione

RACCOMANDAZIONE:
ASSUNZIONE IMMEDIATA FORTEMENTE SCONSIGLIATA. Se si intende comunque procedere, è obbligatorio:
1. Colloquio approfondito con psicologo del lavoro
2. Valutazione di supporto professionale esterno
3. Periodo di prova in ruolo a pressione ZERO`;

    case 'severa':
      return `⚠️ STRESS ZONE SEVERA (SV: ${sv}, CF: ${cf})

Il candidato sta affrontando una situazione di significativa difficoltà personale con risorse limitate.

IMPLICAZIONI:
• Performance lavorativa probabilmente compromessa al 30-50%
• Vulnerabilità elevata a qualsiasi pressione aggiuntiva
• Rischio medio-alto di assenze per malattia o cali improvvisi
• Difficoltà nella gestione delle priorità e delle scadenze

RACCOMANDAZIONE:
Colloquio approfondito OBBLIGATORIO. Domande suggerite:
1. "Come sta in questo periodo? Ci sono situazioni che la preoccupano?"
2. "Se dovesse affrontare una settimana intensa, come pensa di gestirla?"
3. "Ha un sistema di supporto (famiglia, amici) su cui può contare?"`;

    case 'moderata':
      return `⚡ STRESS ZONE MODERATA (SV: ${sv}, CF: ${cf})

Il candidato mostra segnali di difficoltà moderata con risorse di coping parzialmente disponibili.

IMPLICAZIONI:
• Performance può calare del 15-25% sotto stress prolungato
• Necessità di monitoraggio nei primi 3 mesi
• Rischio di sovraccarico se caricato troppo rapidamente
• Può farcela se inserito gradualmente

RACCOMANDAZIONE:
Approfondire in colloquio le ragioni dello stress. Se temporaneo (es. trasferimento, separazione recente) potrebbe risolversi. Prevedere:
1. Onboarding graduale con carichi progressivi
2. Mentor o buddy per supporto quotidiano
3. Checkpoint a 30-60-90 giorni`;

    case 'lieve':
      return `💡 STRESS ZONE LIEVE (SV: ${sv}, CF: ${cf})

Il candidato attraversa una fase di difficoltà minore con risorse adeguate per gestirla.

IMPLICAZIONI:
• Impatto minimo sulla performance (5-10%)
• Situazione probabilmente temporanea e gestibile
• Rischio contenuto se ambiente lavorativo è sano

RACCOMANDAZIONE:
Monitorare senza allarmarsi. Verificare in colloquio se esistono fattori specifici. L'inserimento può procedere con normale attenzione ai segnali di sovraccarico.`;

    default:
      return '';
  }
}

/**
 * Ottiene il label breve per la severità
 */
export function getStressZoneSeverityLabel(severity: StressZoneSeverity): string {
  const labels: Record<StressZoneSeverity, string> = {
    nessuna: 'Nessuna',
    lieve: 'Lieve',
    moderata: 'Moderata',
    severa: 'Severa',
    critica: 'Critica'
  };
  return labels[severity];
}
