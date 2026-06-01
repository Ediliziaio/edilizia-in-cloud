/**
 * Servizio di Ricalcolo Profili V5
 * 
 * Ricalcola i profili candidati usando lo scoring V5 nativo
 * direttamente dalle risposte del questionario
 */

import { supabase } from '../integrations/supabase/client';
import { 
  calcolaProfiloV5, 
  RispostaInputV5, 
  DomandaV5,
  ProfiloCalcolatoV5 
} from './scoringV5';
import { 
  getActiveSyndromes, 
  hasCriticalSyndromes,
  formatSyndromesForDB,
  TraitScores 
} from './syndromes';
import { TraitCode, PolaritaV5, RispostaValueV5 } from '../types';

// Re-export per uso esterno
export type { DomandaV5, RispostaInputV5, ProfiloCalcolatoV5 } from './scoringV5';

// ============================================
// INTERFACCE
// ============================================

export interface RicalcoloResult {
  success: boolean;
  candidatoId: string;
  candidatoNome: string;
  profiloV5: ProfiloCalcolatoV5 | null;
  syndromes: ReturnType<typeof getActiveSyndromes>;
  hasCritical: boolean;
  error?: string;
}

export interface BatchRicalcoloResult {
  total: number;
  success: number;
  failed: number;
  results: RicalcoloResult[];
}

// ============================================
// FUNZIONI DI CARICAMENTO DATI
// ============================================

/**
 * Carica tutte le domande dal database
 */
export async function loadDomandeV5(): Promise<DomandaV5[]> {
  const { data, error } = await supabase
    .from('domande')
    .select('id, scala_primaria, polarita')
    .order('id');
  
  if (error) {
    console.error('Errore caricamento domande:', error);
    throw new Error(`Errore caricamento domande: ${error.message}`);
  }
  
  return (data || []).map(d => ({
    id: d.id,
    scala_primaria: d.scala_primaria as TraitCode,
    polarita: d.polarita as PolaritaV5
  }));
}

/**
 * Carica le risposte di un candidato
 */
export async function loadRisposteCandidato(candidatoId: string): Promise<RispostaInputV5[]> {
  const { data, error } = await supabase
    .from('risposte')
    .select('domanda_id, valore')
    .eq('candidato_id', candidatoId)
    .order('domanda_id');
  
  if (error) {
    console.error('Errore caricamento risposte:', error);
    throw new Error(`Errore caricamento risposte: ${error.message}`);
  }
  
  return (data || []).map(r => ({
    domanda_id: r.domanda_id,
    valore: r.valore as RispostaValueV5
  }));
}

// ============================================
// FUNZIONE DI RICALCOLO SINGOLO
// ============================================

/**
 * Ricalcola il profilo V5 per un singolo candidato
 */
export async function ricalcolaProfiloCandidatoV5(
  candidatoId: string,
  domande?: DomandaV5[]
): Promise<RicalcoloResult> {
  try {
    // Carica info candidato
    const { data: candidato, error: candidatoError } = await supabase
      .from('candidati')
      .select('id, nome, cognome, eta')
      .eq('id', candidatoId)
      .single();
    
    if (candidatoError || !candidato) {
      return {
        success: false,
        candidatoId,
        candidatoNome: 'N/A',
        profiloV5: null,
        syndromes: [],
        hasCritical: false,
        error: `Candidato non trovato: ${candidatoError?.message}`
      };
    }
    
    const nomeCompleto = `${candidato.nome} ${candidato.cognome}`;
    
    // Carica domande se non fornite
    const domandeEffettive = domande || await loadDomandeV5();
    
    // Carica risposte
    const risposte = await loadRisposteCandidato(candidatoId);
    
    if (risposte.length === 0) {
      return {
        success: false,
        candidatoId,
        candidatoNome: nomeCompleto,
        profiloV5: null,
        syndromes: [],
        hasCritical: false,
        error: 'Nessuna risposta trovata per questo candidato'
      };
    }
    
    // Calcola profilo V5
    const profiloV5 = calcolaProfiloV5(risposte, domandeEffettive, true);
    
    // Converti traits_v5 in TraitScores per syndromes
    const traitScores: TraitScores = {
      ORG: profiloV5.traits_v5.ORG,
      AUT: profiloV5.traits_v5.AUT,
      GP: profiloV5.traits_v5.GP,
      ADS: profiloV5.traits_v5.ADS,
      DET: profiloV5.traits_v5.DET,
      VEN: profiloV5.traits_v5.VEN,
      HRM: profiloV5.traits_v5.HRM,
      LDR: profiloV5.traits_v5.LDR,
      PRO: profiloV5.traits_v5.PRO,
      COM: profiloV5.traits_v5.COM,
      ESP: profiloV5.traits_v5.ESP,
      RC: profiloV5.traits_v5.RC,
      FIN: profiloV5.traits_v5.FIN,
      SUC: profiloV5.traits_v5.SUC,
      PRI: profiloV5.traits_v5.PRI
    };
    
    // Calcola sindromi
    const syndromes = getActiveSyndromes(traitScores, candidato.eta || undefined);
    const hasCritical = hasCriticalSyndromes(traitScores, candidato.eta || undefined);
    
    return {
      success: true,
      candidatoId,
      candidatoNome: nomeCompleto,
      profiloV5,
      syndromes,
      hasCritical
    };
    
  } catch (error) {
    return {
      success: false,
      candidatoId,
      candidatoNome: 'N/A',
      profiloV5: null,
      syndromes: [],
      hasCritical: false,
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    };
  }
}

// ============================================
// FUNZIONE DI SALVATAGGIO
// ============================================

/**
 * Salva il profilo V5 ricalcolato nel database
 */
export async function salvaProfiloV5(
  candidatoId: string,
  profilo: ProfiloCalcolatoV5,
  syndromes: ReturnType<typeof getActiveSyndromes>
): Promise<{ success: boolean; error?: string }> {
  try {
    const syndromeData = formatSyndromesForDB(
      syndromes.map(s => ({ ...s, isActive: true }))
    );
    
    // Prima verifichiamo se esiste già un profilo
    const { data: existing } = await supabase
      .from('profili_candidato')
      .select('id')
      .eq('candidato_id', candidatoId)
      .maybeSingle();
    
    let error;
    
    if (existing) {
      // Update existing profile usando RPC o query diretta
      const { error: updateError } = await supabase
        .from('profili_candidato')
        .update({
          traits_v5: JSON.parse(JSON.stringify(profilo.traits_v5)),
          essere_pct: profilo.essere_pct,
          fare_pct: profilo.fare_pct,
          avere_pct: profilo.avere_pct,
          reliability_index: profilo.reliability_index,
          profilo_tipo_v5: profilo.profilo_tipo_v5,
          syndromes_detected: JSON.parse(JSON.stringify(syndromeData)),
          assessment_version: 'v5',
          strength_points: JSON.parse(JSON.stringify(profilo.strengths)),
          out_points: JSON.parse(JSON.stringify(profilo.valleys)),
          updated_at: new Date().toISOString()
        })
        .eq('candidato_id', candidatoId);
      error = updateError;
    } else {
      // Insert new profile
      const { error: insertError } = await supabase
        .from('profili_candidato')
        .insert([{
          candidato_id: candidatoId,
          traits_v5: JSON.parse(JSON.stringify(profilo.traits_v5)),
          essere_pct: profilo.essere_pct,
          fare_pct: profilo.fare_pct,
          avere_pct: profilo.avere_pct,
          reliability_index: profilo.reliability_index,
          profilo_tipo_v5: profilo.profilo_tipo_v5,
          syndromes_detected: JSON.parse(JSON.stringify(syndromeData)),
          assessment_version: 'v5',
          strength_points: JSON.parse(JSON.stringify(profilo.strengths)),
          out_points: JSON.parse(JSON.stringify(profilo.valleys))
        }]);
      error = insertError;
    }
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true };
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Errore sconosciuto' 
    };
  }
}

// ============================================
// FUNZIONE DI RICALCOLO E SALVATAGGIO
// ============================================

/**
 * Ricalcola e salva il profilo V5 per un candidato
 */
export async function ricalcolaESalvaProfiloV5(
  candidatoId: string,
  domande?: DomandaV5[]
): Promise<RicalcoloResult> {
  const result = await ricalcolaProfiloCandidatoV5(candidatoId, domande);
  
  if (result.success && result.profiloV5) {
    const saveResult = await salvaProfiloV5(
      candidatoId, 
      result.profiloV5, 
      result.syndromes
    );
    
    if (!saveResult.success) {
      return {
        ...result,
        success: false,
        error: `Calcolo OK ma salvataggio fallito: ${saveResult.error}`
      };
    }
  }
  
  return result;
}

// ============================================
// FUNZIONE DI RICALCOLO BATCH
// ============================================

/**
 * Ricalcola tutti i profili V5 per i candidati con test completato
 */
export async function ricalcolaTuttiProfiliV5(
  onProgress?: (current: number, total: number) => void
): Promise<BatchRicalcoloResult> {
  // Carica lista candidati con test completato
  const { data: candidati, error } = await supabase
    .from('candidati')
    .select('id, nome, cognome')
    .eq('test_completato', true)
    .order('updated_at', { ascending: false });
  
  if (error || !candidati) {
    return {
      total: 0,
      success: 0,
      failed: 0,
      results: []
    };
  }
  
  // Carica domande una sola volta
  const domande = await loadDomandeV5();
  
  const results: RicalcoloResult[] = [];
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < candidati.length; i++) {
    const candidato = candidati[i];
    
    if (onProgress) {
      onProgress(i + 1, candidati.length);
    }
    
    const result = await ricalcolaESalvaProfiloV5(candidato.id, domande);
    results.push(result);
    
    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }
  
  return {
    total: candidati.length,
    success,
    failed,
    results
  };
}

// ============================================
// FUNZIONE DI DEBUG/TEST
// ============================================

/**
 * Esegue un ricalcolo di test (senza salvare) e stampa i risultati
 */
export async function testRicalcoloV5(candidatoId: string): Promise<void> {
  // Debug helper: i console.log sotto sono lo scopo della funzione (stampa
  // diagnostica). Guard DEV-only: in produzione la funzione è no-op così non
  // sporca la console utente né esegue lavoro inutile se richiamata per errore.
  if (!import.meta.env.DEV) return;
  console.log('='.repeat(60));
  console.log('TEST RICALCOLO V5 NATIVO');
  console.log('='.repeat(60));
  
  const result = await ricalcolaProfiloCandidatoV5(candidatoId);
  
  if (!result.success) {
    console.error('❌ Errore:', result.error);
    return;
  }
  
  console.log(`\n📋 Candidato: ${result.candidatoNome}`);
  console.log(`   ID: ${result.candidatoId}`);
  
  const profilo = result.profiloV5!;
  
  console.log('\n📊 TRATTI V5 (scala -100/+100):');
  const traits = profilo.traits_v5;
  console.log(`   ESSERE: ORG=${traits.ORG}, AUT=${traits.AUT}, GP=${traits.GP}`);
  console.log(`   FARE:   ADS=${traits.ADS}, DET=${traits.DET}, VEN=${traits.VEN}, HRM=${traits.HRM}`);
  console.log(`   AVERE:  LDR=${traits.LDR}, PRO=${traits.PRO}, COM=${traits.COM}, ESP=${traits.ESP}`);
  console.log(`   INDIC:  RC=${traits.RC}, FIN=${traits.FIN}, SUC=${traits.SUC}, PRI=${traits.PRI}`);
  
  console.log('\n📈 MACRO-AREE:');
  console.log(`   ESSERE: ${profilo.essere_pct}%`);
  console.log(`   FARE:   ${profilo.fare_pct}%`);
  console.log(`   AVERE:  ${profilo.avere_pct}%`);
  
  console.log('\n🏷️ PROFILO TIPO:', profilo.profilo_tipo_v5);
  console.log('📋 ATTENDIBILITÀ:', profilo.reliability_index);
  
  if (profilo.strengths.length > 0) {
    console.log('\n💪 PUNTI DI FORZA:', profilo.strengths.join(', '));
  }
  
  if (profilo.valleys.length > 0) {
    console.log('⚠️ AREE CRITICHE:', profilo.valleys.join(', '));
  }
  
  if (result.syndromes.length > 0) {
    console.log('\n🔴 SINDROMI ATTIVE:');
    result.syndromes.forEach(s => {
      console.log(`   [${s.severity}] ${s.code}: ${s.name}`);
    });
  }
  
  if (result.hasCritical) {
    console.log('\n⛔ ATTENZIONE: Sindromi critiche rilevate (S01-S04)');
  }
  
  console.log('\n' + '='.repeat(60));
}
