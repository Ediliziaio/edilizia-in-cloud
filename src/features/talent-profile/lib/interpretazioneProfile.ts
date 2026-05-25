import { ScalaCode, SCALE_LABELS } from '../types';
import { StressZoneSeverity, getStressZoneText, getStressZoneSeverityLabel } from './stressZone';
import { getScaleRangeText } from './scaleTexts';

export interface InterpretazioneItem {
  scala: string;
  valore: number;
  tipo: 'critico' | 'attenzione' | 'forza' | 'info';
  titolo: string;
  descrizione: string;
}

/**
 * Zona di interpretazione per ogni punteggio (Manuale V3)
 */
export type ZonaInterpretazione = 'critica' | 'attenzione' | 'norma' | 'sopra_media' | 'eccellenza';

export function getZonaInterpretazione(score: number): {
  zona: ZonaInterpretazione;
  colore: string;
  descrizione: string;
} {
  if (score < 60) return { zona: 'critica', colore: 'red', descrizione: 'Carenza grave - richiede intervento' };
  if (score < 80) return { zona: 'attenzione', colore: 'orange', descrizione: 'Carenza moderata - monitorare' };
  if (score < 120) return { zona: 'norma', colore: 'gray', descrizione: 'Nella norma' };
  if (score < 160) return { zona: 'sopra_media', colore: 'blue', descrizione: 'Sopra la media' };
  return { zona: 'eccellenza', colore: 'green', descrizione: 'Eccellenza' };
}

/**
 * Pattern combinati critici dal Manuale V3
 * Include pattern base e pattern avanzati per combinazioni specifiche
 */
interface PatternCritico {
  id: string;
  nome: string;
  condizione: (scale: Record<string, number>) => boolean;
  descrizione: string;
  tipo: 'critico' | 'attenzione';
}

const PATTERN_CRITICI: PatternCritico[] = [
  // PATTERN STRESS ZONE
  {
    id: 'stress_zone_critica',
    nome: 'Stress Zone CRITICA',
    condizione: (s) => (s['SV'] || 100) < 40 || (s['CF'] || 100) < 40,
    descrizione: 'SITUAZIONE DI CRISI GRAVE. Il candidato ha risorse personali quasi nulle per affrontare qualsiasi difficoltà. Impossibilità di garantire performance stabili. ASSUNZIONE FORTEMENTE SCONSIGLIATA senza valutazione specialistica.',
    tipo: 'critico'
  },
  {
    id: 'stress_zone_severa',
    nome: 'Stress Zone Severa',
    condizione: (s) => {
      const sv = s['SV'] || 100;
      const cf = s['CF'] || 100;
      return sv < 100 && cf < 100 && (sv < 60 || cf < 60) && sv >= 40 && cf >= 40;
    },
    descrizione: 'Condizione di elevata vulnerabilità. Sia la sfera personale (SV) che la resilienza (CF) sono significativamente compromesse. Colloquio approfondito OBBLIGATORIO prima di procedere.',
    tipo: 'critico'
  },
  
  // PATTERN GAP EFFICACIA-EFFICIENZA
  // CORREZIONE: Il pattern scatta solo se EF è EFFETTIVAMENTE basso, non solo per gap alto
  {
    id: 'visionario_disorganizzato_forte',
    nome: 'Visionario Fortemente Disorganizzato',
    condizione: (s) => {
      const ec = s['EC'] || 100;
      const ef = s['EF'] || 100;
      // Gap > 40 E efficienza effettivamente bassa (< 100)
      return (ec - ef) > 40 && ef < 100;
    },
    descrizione: 'Gap SIGNIFICATIVO tra Efficacia ed Efficienza (>40 punti) CON Efficienza bassa. Il candidato sa identificare cosa fare ma fatica enormemente ad organizzarsi. Raggiunge gli obiettivi solo a costo di grande dispendio energetico. NECESSITA formazione su metodi di lavoro e affiancamento con figure metodiche.',
    tipo: 'critico'
  },
  {
    id: 'visionario_disorganizzato',
    nome: 'Visionario Disorganizzato',
    condizione: (s) => {
      const ec = s['EC'] || 100;
      const ef = s['EF'] || 100;
      const gap = ec - ef;
      // Gap 20-40 E efficienza sotto media (< 110)
      return gap > 20 && gap <= 40 && ef < 110;
    },
    descrizione: 'Gap tra Efficacia ed Efficienza (20-40 punti) con Efficienza sotto media. Alta determinazione (EC) ma scarsa autodisciplina (EF). Grandi idee, difficoltà nell\'esecuzione ordinata. Richiede supporto organizzativo e procedure chiare.',
    tipo: 'attenzione'
  },
  // PATTERN POSITIVO: Determinazione Superiore (Alto EC + Alto EF)
  {
    id: 'determinazione_superiore',
    nome: 'Determinazione Superiore',
    condizione: (s) => {
      const ec = s['EC'] || 100;
      const ef = s['EF'] || 100;
      // EC molto alta E EF comunque alta = combinazione positiva
      return ec >= 160 && ef >= 130;
    },
    descrizione: 'Eccellente determinazione (EC eccellente) abbinata a buona organizzazione (EF alto). Profilo che sa identificare gli obiettivi giusti E li persegue con metodo. Combinazione rara e preziosa: vede cosa fare e sa come farlo.',
    tipo: 'forza' as 'attenzione' // Type workaround - sarà gestito in modo speciale
  },
  {
    id: 'esecutore_cieco_forte',
    nome: 'Esecutore senza Visione Strategica',
    condizione: (s) => ((s['EF'] || 100) - (s['EC'] || 100)) > 40,
    descrizione: 'Altissima efficienza operativa ma scarsissima capacità di identificare cosa sia importante (gap >40). Esegue perfettamente ma necessita di direzione chiara dall\'alto. NON adatto a ruoli autonomi o con responsabilità strategiche.',
    tipo: 'attenzione'
  },
  {
    id: 'esecutore_cieco',
    nome: 'Esecutore senza Visione',
    condizione: (s) => {
      const gap = (s['EF'] || 100) - (s['EC'] || 100);
      return gap > 20 && gap <= 40;
    },
    descrizione: 'Buona efficienza operativa ma poca determinazione strategica. Ottimo esecutore, scarso nel prendere iniziative autonome. Ideale in ruoli ben definiti con supervisione.',
    tipo: 'attenzione'
  },
  
  // PATTERN RESPONSABILITÀ
  {
    id: 'caricato_irresponsabile',
    nome: 'Caricato Irresponsabile',
    condizione: (s) => (s['QN'] || 100) > 130 && (s['QR'] || 100) < 80,
    descrizione: 'Si carica di molti impegni (QN alto) ma NON si sente responsabile dei risultati (QR basso). Combinazione PROBLEMATICA: promette molto poi cerca scuse quando non riesce. Verificare in colloquio con domande specifiche su fallimenti passati e come li ha gestiti.',
    tipo: 'critico'
  },
  {
    id: 'scaricatore_responsabilita',
    nome: 'Scaricatore di Responsabilità',
    condizione: (s) => (s['QN'] || 100) < 70 && (s['QR'] || 100) < 70,
    descrizione: 'Evita sia di caricarsi di lavoro (QN basso) sia di assumere responsabilità (QR basso). Profilo PASSIVO che tende a fare il minimo indispensabile. NON adatto a ruoli che richiedono iniziativa, autonomia o leadership.',
    tipo: 'critico'
  },
  {
    id: 'super_responsabile_rischio',
    nome: 'Super-Responsabile a Rischio Burnout',
    condizione: (s) => (s['QN'] || 100) > 160 && (s['QR'] || 100) > 160 && (s['SV'] || 100) < 90,
    descrizione: 'Si carica di enormi responsabilità (QN+QR altissimi) ma la sfera personale è compromessa (SV basso). Profilo WORKAHOLIC che sta sacrificando la vita privata. RISCHIO BURNOUT ELEVATO nei prossimi 12-18 mesi se non si interviene.',
    tipo: 'critico'
  },
  
  // PATTERN COMBATTENTE
  {
    id: 'combattente_sotto_pressione',
    nome: 'Combattente sotto Pressione',
    condizione: (s) => (s['SV'] || 100) < 80 && (s['MO'] || 100) > 140,
    descrizione: 'Nonostante difficoltà personali significative (SV basso), mantiene alta motivazione (MO alto). Possibile tendenza a sovracompensare i problemi con il lavoro. Rischio burnout nel medio termine se la situazione personale non migliora.',
    tipo: 'attenzione'
  },
  
  // PATTERN RIGIDITÀ
  {
    id: 'rigidita_fragile',
    nome: 'Rigidità Fragile',
    condizione: (s) => (s['SC'] || 100) > 170 && (s['CF'] || 100) < 80,
    descrizione: 'Estrema rigidità cognitiva (SC molto alta) combinata con bassa resilienza (CF basso). Rischio di CROLLO sotto pressione imprevista. Qualsiasi cambiamento non programmato può generare reazioni sproporzionate. Non adatto ad ambienti dinamici.',
    tipo: 'critico'
  },
  {
    id: 'rigidita_perfezionista',
    nome: 'Rigidità Perfezionista',
    condizione: (s) => (s['SC'] || 100) > 160 && (s['EF'] || 100) > 150 && (s['PA'] || 100) < 80,
    descrizione: 'Alta schematicità + alta efficienza + bassa partecipazione. Profilo del perfezionista solitario. Lavora bene ma fatica a collaborare e ad accettare metodi diversi dai propri. Può creare attrito in team.',
    tipo: 'attenzione'
  },
  
  // PATTERN LEADERSHIP
  {
    id: 'leader_isolato',
    nome: 'Leader Isolato',
    condizione: (s) => (s['QR'] || 100) > 150 && (s['PA'] || 100) < 80,
    descrizione: 'Alta propensione alla responsabilità (QR alto) ma scarsa partecipazione relazionale (PA basso). Rischia di imporsi senza coinvolgere il team. Può essere percepito come autoritario piuttosto che autorevole.',
    tipo: 'attenzione'
  },
  {
    id: 'gregario_motivato',
    nome: 'Gregario Motivato',
    condizione: (s) => (s['QR'] || 100) < 80 && (s['MO'] || 100) > 140,
    descrizione: 'Alta motivazione (MO alto) senza ambizione di leadership (QR basso). Ottimo elemento di supporto, esegue con entusiasmo compiti assegnati ma non cerca e non è adatto a ruoli direttivi.',
    tipo: 'attenzione'
  },
  
  // PATTERN WORKAHOLIC
  {
    id: 'workaholic_a_rischio',
    nome: 'Workaholic a Rischio',
    condizione: (s) => (s['SV'] || 100) < 70 && (s['EF'] || 100) > 150 && (s['EC'] || 100) > 150,
    descrizione: 'Altissima produttività (EF+EC molto alti) ma sfera personale gravemente trascurata (SV molto basso). Il lavoro sta compensando problemi personali. Rischio burnout ELEVATO. Verificare in colloquio equilibrio vita-lavoro.',
    tipo: 'critico'
  },
  
  // PATTERN COMMERCIALE
  {
    id: 'commerciale_fragile',
    nome: 'Commerciale con Fragilità',
    condizione: (s) => (s['PA'] || 100) > 140 && (s['SP'] || 100) > 140 && (s['CF'] || 100) < 80,
    descrizione: 'Ottima propensione relazionale e spazio vitale (PA+SP alti) ma bassa resilienza (CF basso). Buon commerciale ma potrebbe crollare sotto rifiuti ripetuti o pressione commerciale intensa.',
    tipo: 'attenzione'
  },
  
  // PATTERN FLESSIBILITÀ ESTREMA
  {
    id: 'flessibilita_caotica',
    nome: 'Flessibilità Caotica',
    condizione: (s) => (s['SC'] || 100) < 60 && (s['EF'] || 100) < 80,
    descrizione: 'Schematicità molto bassa + Efficienza bassa. Altissima flessibilità ma totale disorganizzazione. Fatica a seguire procedure e mantenere costanza. Può essere creativo ma inaffidabile nelle consegne.',
    tipo: 'attenzione'
  },
  
  // NUOVI PATTERN dal Manuale V3 Cap. 14.3
  {
    id: 'caricatore_deresponsabilizzato',
    nome: 'Carica Molto ma Non Risponde',
    condizione: (s) => (s['QN'] || 100) > 130 && (s['QR'] || 100) < 70,
    descrizione: 'Gap significativo tra Quantità caricata (QN alto) e Qualità Relazionale (QR basso). Tende a caricarsi di molti impegni ma senza sentirsi responsabile dei risultati. Promette molto, poi cerca scuse quando le cose non vanno. Verificare in colloquio come gestisce i fallimenti.',
    tipo: 'critico'
  },
  
  // PATTERN ESECUTORE PURO (dal Caso Luiza)
  {
    id: 'esecutore_puro_fragile',
    nome: 'Esecutore Puro con Fragilità',
    condizione: (s) => (s['EF'] || 100) > 150 && (s['EC'] || 100) < 80 && (s['CF'] || 100) < 90,
    descrizione: 'Altissima efficienza operativa ma scarsa determinazione e resilienza moderata. Esegue perfettamente compiti definiti ma si blocca davanti a problemi imprevisti. Non adatto a ruoli con autonomia decisionale.',
    tipo: 'attenzione'
  },
  
  // PATTERN MOTIVAZIONE DISCONNESSA
  {
    id: 'motivazione_disconnessa',
    nome: 'Motivazione Disconnessa dalla Realtà',
    condizione: (s) => (s['MO'] || 100) > 160 && (s['EF'] || 100) < 80 && (s['EC'] || 100) < 80,
    descrizione: 'Altissima motivazione dichiarata ma scarsa capacità di tradurla in risultati concreti (EF+EC bassi). Potrebbe essere un "sognatore" che si entusiasma ma non conclude. Verificare track record effettivo.',
    tipo: 'attenzione'
  },
  
  // PATTERN ANZIANITÀ + RIGIDITÀ (Caso Luiza specifico)
  {
    id: 'eta_rigidita_rischio',
    nome: 'Rigidità Consolidata',
    condizione: (s) => (s['SC'] || 100) > 165 && (s['CF'] || 100) < 85,
    descrizione: 'Alta schematicità combinata con resilienza moderata-bassa. Pattern tipico di professionisti che hanno sviluppato rigidità nel tempo e faticano ad adattarsi. Rischio elevato in contesti di cambiamento organizzativo.',
    tipo: 'attenzione'
  }
];

/**
 * Genera interpretazioni personalizzate basate sui dati reali del candidato
 * Aggiornato secondo il Manuale V3 con testi arricchiti
 */
export function generateInterpretazione(
  scalePunteggi: Record<string, number>,
  schematicita: number,
  stressZone: boolean,
  outPoints: string[],
  strengthPoints: string[],
  stressZoneSeverity?: StressZoneSeverity
): InterpretazioneItem[] {
  const interpretazioni: InterpretazioneItem[] = [];
  
  // Calcola la severità se non fornita
  const severity = stressZoneSeverity || 
    (stressZone ? 
      (Math.min(scalePunteggi['SV'] || 100, scalePunteggi['CF'] || 100) < 40 ? 'critica' :
       Math.min(scalePunteggi['SV'] || 100, scalePunteggi['CF'] || 100) < 60 ? 'severa' :
       Math.min(scalePunteggi['SV'] || 100, scalePunteggi['CF'] || 100) < 80 ? 'moderata' : 'lieve')
      : 'nessuna');

  // Analisi Pattern Combinati (priorità alta)
  for (const pattern of PATTERN_CRITICI) {
    if (pattern.condizione(scalePunteggi)) {
      interpretazioni.push({
        scala: pattern.id,
        valore: 0,
        tipo: pattern.tipo as 'critico' | 'attenzione',
        titolo: pattern.nome,
        descrizione: pattern.descrizione
      });
    }
  }

  // Analisi Stress Zone (se non già coperta dai pattern)
  if (stressZone && severity !== 'critica' && severity !== 'severa' && 
      !interpretazioni.some(i => i.scala === 'stress_zone_critica' || i.scala === 'stress_zone_severa')) {
    const sv = scalePunteggi['SV'] || 100;
    const cf = scalePunteggi['CF'] || 100;
    
    if (severity === 'moderata') {
      interpretazioni.push({
        scala: 'stress_zone_moderata',
        valore: 0,
        tipo: 'attenzione',
        titolo: 'Stress Zone Moderata',
        descrizione: `Stile di Vita (${sv}) e Capacità di Fronteggiare (${cf}) sono entrambi sotto 100 con almeno uno sotto 80. Segnali di difficoltà moderata che richiedono monitoraggio. Consigliato inserimento graduale e checkpoint regolari.`
      });
    } else if (severity === 'lieve') {
      interpretazioni.push({
        scala: 'stress_zone_lieve',
        valore: 0,
        tipo: 'info',
        titolo: 'Stress Zone Lieve',
        descrizione: `Stile di Vita (${sv}) e Capacità di Fronteggiare (${cf}) sono entrambi nella fascia 80-99. Situazione di lieve difficoltà ma gestibile. Monitorare senza allarmarsi.`
      });
    }
  }

  // Analisi Out Points critici (< 80)
  const scaleToCheck: ScalaCode[] = ['SV', 'MO', 'CF', 'QR', 'EF', 'EC', 'QN', 'SP', 'PA'];
  
  for (const scala of scaleToCheck) {
    const valore = scalePunteggi[scala];
    if (valore === undefined) continue;
    
    const zona = getZonaInterpretazione(valore);
    const scaleText = getScaleRangeText(scala, valore);
    
    if (zona.zona === 'critica') {
      interpretazioni.push({
        scala,
        valore,
        tipo: 'critico',
        titolo: `${SCALE_LABELS[scala]} Critico`,
        descrizione: scaleText.testo + ' ' + scaleText.implicazioni
      });
    } else if (zona.zona === 'attenzione' && !stressZone) {
      // Aggiungi solo se non già segnalato dalla stress zone
      if (!['SV', 'CF'].includes(scala) || !stressZone) {
        interpretazioni.push({
          scala,
          valore,
          tipo: 'attenzione',
          titolo: `${SCALE_LABELS[scala]} Sotto Media`,
          descrizione: scaleText.testo + ' ' + scaleText.implicazioni
        });
      }
    } else if (zona.zona === 'eccellenza') {
      interpretazioni.push({
        scala,
        valore,
        tipo: 'forza',
        titolo: `${SCALE_LABELS[scala]} Eccellente`,
        descrizione: scaleText.testo + ' ' + scaleText.implicazioni
      });
    }
  }

  // Analisi Schematicità (Flessibilità al Cambiamento)
  const flessibilita = 200 - schematicita;
  if (schematicita > 170) {
    interpretazioni.push({
      scala: 'SC',
      valore: schematicita,
      tipo: 'attenzione',
      titolo: 'Flessibilità Molto Bassa',
      descrizione: `Schematicità ${schematicita}/200 (Flessibilità ${flessibilita}/200). Persona MOLTO RIGIDA che fatica ad adattarsi ai cambiamenti. Necessita di procedure definite e stabili. SCONSIGLIATA per contesti dinamici o ruoli che richiedono improvvisazione. Può diventare ostile verso colleghi "creativi".`
    });
  } else if (schematicita > 150) {
    interpretazioni.push({
      scala: 'SC',
      valore: schematicita,
      tipo: 'info',
      titolo: 'Flessibilità Bassa',
      descrizione: `Schematicità ${schematicita}/200 (Flessibilità ${flessibilita}/200). Preferisce procedure chiare e prevedibilità. Adatto a ruoli amministrativi, compliance, controllo qualità. Può avere difficoltà con cambiamenti frequenti.`
    });
  } else if (schematicita < 70) {
    interpretazioni.push({
      scala: 'SC',
      valore: schematicita,
      tipo: 'info',
      titolo: 'Flessibilità Molto Alta',
      descrizione: `Schematicità ${schematicita}/200 (Flessibilità ${flessibilita}/200). Grande adattabilità e apertura al cambiamento. Ottimo per ruoli creativi e ambienti dinamici. Possibile difficoltà nel seguire procedure rigide o compiti ripetitivi.`
    });
  }

  return interpretazioni;
}

/**
 * Descrizioni critiche per scale specifiche (Manuale V3)
 */
function getDescrizioneCritica(scala: ScalaCode, valore: number): string {
  const descrizioni: Record<ScalaCode, string> = {
    SV: `Punteggio ${valore}/200 indica PROBLEMI SIGNIFICATIVI nella sfera personale: possibili difficoltà familiari gravi, crisi relazionali, problemi economici o di salute che impattano pesantemente la concentrazione e le energie disponibili per il lavoro.`,
    CF: `Punteggio ${valore}/200 indica BASSA RESILIENZA allo stress. Sotto pressione potrebbe avere cali significativi di performance, blocchi operativi o assenze. Non adatto a ruoli stressanti senza adeguato supporto.`,
    MO: `Punteggio ${valore}/200 indica MOTIVAZIONE MOLTO BASSA. Il candidato mostra scarsa spinta intrinseca, fatica a mantenere l'impegno senza stimoli esterni costanti. Rischio elevato di abbandono nei primi mesi.`,
    QR: `Punteggio ${valore}/200 indica DIFFICOLTÀ nell'assumersi responsabilità di alto livello. Tende a delegare, evitare decisioni importanti o cercare scuse quando i risultati non arrivano. Non adatto a ruoli con autonomia decisionale.`,
    EF: `Punteggio ${valore}/200 indica SCARSA AUTODISCIPLINA. Richiede supervisione costante per rispettare scadenze. Difficoltà nel seguire procedure, gestire priorità e mantenere ordine. Non adatto a lavoro autonomo.`,
    EC: `Punteggio ${valore}/200 indica SCARSA DETERMINAZIONE. Tende ad abbandonare di fronte agli ostacoli, si scoraggia facilmente, non porta a termine i progetti. Necessita guida costante per completare compiti.`,
    QN: `Punteggio ${valore}/200 indica DIFFICOLTÀ nella gestione di carichi di lavoro multipli. Si sente sopraffatto facilmente, evita di prendere impegni, gestisce un compito alla volta.`,
    SP: `Punteggio ${valore}/200 indica BASSA CONSAPEVOLEZZA di sé e difficoltà nella gestione dei confini personali. Può essere troppo invasivo o al contrario troppo passivo nelle relazioni professionali.`,
    PA: `Punteggio ${valore}/200 indica SCARSA PROPENSIONE RELAZIONALE. Fatica nel lavoro di squadra, preferisce isolarsi, non contribuisce attivamente ai gruppi. Non adatto a ruoli che richiedono collaborazione intensa.`,
    SC: `Punteggio ${valore}/200 indica ECCESSIVA RIGIDITÀ cognitiva.`,
    ST: `Punteggio ${valore}/200 indica ELEVATO livello di stress percepito.`,
    LE: `Punteggio ${valore}/200 indica BASSA propensione alla leadership.`
  };
  return descrizioni[scala] || `Punteggio ${valore}/200 - Area critica da monitorare.`;
}

function getDescrizioneAttenzione(scala: ScalaCode, valore: number): string {
  const descrizioni: Record<ScalaCode, string> = {
    SV: `Punteggio ${valore}/200 - Equilibrio vita-lavoro sotto la media. Possibili fattori di stress moderati che richiedono monitoraggio. Verificare in colloquio eventuali situazioni temporanee.`,
    CF: `Punteggio ${valore}/200 - Resilienza moderata. Gestisce situazioni ordinarie ma può avere difficoltà con stress intenso o prolungato. Evitare esposizione a pressione eccessiva senza supporto.`,
    MO: `Punteggio ${valore}/200 - Motivazione nella norma bassa. Lavora discretamente ma senza particolare entusiasmo. Beneficia di obiettivi chiari, feedback regolari e riconoscimenti.`,
    QR: `Punteggio ${valore}/200 - Preferisce non assumere responsabilità eccessive. Adatto a ruoli di supporto con supervisione, non a posizioni con autonomia decisionale significativa.`,
    EF: `Punteggio ${valore}/200 - Autodisciplina da sviluppare. Utile affiancamento iniziale, sistemi di reminder e procedure chiare. Può migliorare con formazione specifica su time management.`,
    EC: `Punteggio ${valore}/200 - Determinazione moderata. Porta a termine i compiti ma può scoraggiarsi di fronte a ostacoli significativi. Supportare nei momenti difficili con mentoring.`,
    QN: `Punteggio ${valore}/200 - Preferisce carichi contenuti. Non sovraccaricare inizialmente, aumentare progressivamente le responsabilità valutando la risposta.`,
    SP: `Punteggio ${valore}/200 - Assertività da sviluppare. Supportare nell'espressione delle proprie esigenze e nella gestione dei confini professionali.`,
    PA: `Punteggio ${valore}/200 - Partecipazione moderata. Favorire integrazione graduale nel team con attività strutturate. Può aprirsi col tempo.`,
    SC: `Punteggio ${valore}/200 - Schematicità nella norma.`,
    ST: `Punteggio ${valore}/200 - Stress moderato.`,
    LE: `Punteggio ${valore}/200 - Leadership da sviluppare.`
  };
  return descrizioni[scala] || `Punteggio ${valore}/200 - Area nella norma bassa.`;
}

function getDescrizioneForza(scala: ScalaCode, valore: number): string {
  const descrizioni: Record<ScalaCode, string> = {
    SV: `Punteggio ${valore}/200 - PUNTO DI FORZA ECCELLENTE. Vita personale pienamente soddisfacente, persona equilibrata e serena. Base solida per affrontare qualsiasi sfida professionale con lucidità. Asset prezioso per il team.`,
    CF: `Punteggio ${valore}/200 - PUNTO DI FORZA ECCELLENTE. Eccezionale capacità di fronteggiare. Rimane lucido e operativo anche in situazioni di crisi. Può gestire emergenze e guidare team in momenti critici.`,
    MO: `Punteggio ${valore}/200 - PUNTO DI FORZA ECCELLENTE. Altissima motivazione intrinseca. Lavora con passione, cerca eccellenza, non si accontenta. Asset strategico per progetti ambiziosi.`,
    QR: `Punteggio ${valore}/200 - PUNTO DI FORZA ECCELLENTE. Naturalmente orientato alla leadership e responsabilità. Si assume ownership senza difficoltà e risponde dei risultati con maturità.`,
    EF: `Punteggio ${valore}/200 - PUNTO DI FORZA ECCELLENTE. Maestro nell'ottimizzare processi, rispettare scadenze, mantenere standard elevati costantemente. Riferimento metodologico per il team.`,
    EC: `Punteggio ${valore}/200 - PUNTO DI FORZA ECCELLENTE. Eccezionale determinazione. Non si arrende MAI, trova sempre un modo per raggiungere l'obiettivo. Può trascinare team verso obiettivi ambiziosi.`,
    QN: `Punteggio ${valore}/200 - PUNTO DI FORZA ECCELLENTE. Gestisce efficacemente carichi di lavoro elevati, multitasking naturale, non si sente sopraffatto da responsabilità multiple.`,
    SP: `Punteggio ${valore}/200 - PUNTO DI FORZA ECCELLENTE. Elevata consapevolezza di sé, gestisce i confini con assertività ed efficacia. Sa proteggere il proprio spazio senza creare conflitti.`,
    PA: `Punteggio ${valore}/200 - PUNTO DI FORZA ECCELLENTE. Eccellente nel lavoro di squadra e nelle relazioni professionali. Crea connessioni, facilita collaborazione, elemento aggregante del team.`,
    SC: `Punteggio ${valore}/200 - Alta strutturazione mentale.`,
    ST: `Punteggio ${valore}/200 - Gestione stress ottimale.`,
    LE: `Punteggio ${valore}/200 - PUNTO DI FORZA. Spiccata attitudine alla leadership.`
  };
  return descrizioni[scala] || `Punteggio ${valore}/200 - Punto di forza significativo.`;
}

/**
 * Calcola indici secondari secondo il Manuale V3
 */
export function calculateSecondaryIndices(scalePunteggi: Record<string, number>): {
  leadershipNaturale: number;
  workerIndex: number;
  attitudineVendita: number;
  flessibilitaCambiamento: number;
} {
  // Leadership Naturale: QR*0.4 + PA*0.3 + media(SP,MO)*0.3
  // Rappresenta la capacità di guidare e influenzare
  const leadershipNaturale = Math.round(
    (scalePunteggi['QR'] || 100) * 0.4 + 
    (scalePunteggi['PA'] || 100) * 0.3 + 
    (((scalePunteggi['SP'] || 100) + (scalePunteggi['MO'] || 100)) / 2) * 0.3
  );

  // Worker Index: EC*0.4 + EF*0.4 + QN*0.2
  // Rappresenta produttività e orientamento al risultato
  const workerIndex = Math.round(
    (scalePunteggi['EC'] || 100) * 0.4 + 
    (scalePunteggi['EF'] || 100) * 0.4 + 
    (scalePunteggi['QN'] || 100) * 0.2
  );

  // Attitudine Vendita: PA*0.3 + SP*0.3 + MO*0.2 + CF*0.2
  // Rappresenta propensione commerciale e resilienza al rifiuto
  const attitudineVendita = Math.round(
    (scalePunteggi['PA'] || 100) * 0.3 + 
    (scalePunteggi['SP'] || 100) * 0.3 + 
    (scalePunteggi['MO'] || 100) * 0.2 + 
    (scalePunteggi['CF'] || 100) * 0.2
  );

  // Flessibilità al Cambiamento: 200 - SC (INVERTITO rispetto a Resistenza)
  // Più alto = più flessibile (positivo per l'azienda)
  const sc = scalePunteggi['SC'] || 100;
  const flessibilitaCambiamento = 200 - sc;

  return {
    leadershipNaturale,
    workerIndex,
    attitudineVendita,
    flessibilitaCambiamento
  };
}

/**
 * Ottiene l'interpretazione dettagliata per una scala specifica
 */
export function getDetailedScaleInterpretation(scala: ScalaCode, valore: number): {
  livello: string;
  testo: string;
  implicazioni: string;
  domande_colloquio: string[];
} {
  return getScaleRangeText(scala, valore);
}
