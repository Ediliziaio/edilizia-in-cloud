import type { FamilyWithAxes } from '@/types/articleFamily';

export interface ProblemaVarianti { codice: string; messaggio: string }

/** Verifica la completezza dei dati, senza dedurre compatibilità dal nome commerciale. */
export function verificaVarianti(famiglia: FamilyWithAxes): ProblemaVarianti[] {
  const problemi: ProblemaVarianti[] = [];
  const assi = famiglia.axes;
  if (assi.length === 0) problemi.push({codice:'personalizzazioni-assenti',messaggio:'Nessuna personalizzazione registrata: verificare finiture, vetro, ferramenta e configurazione del prodotto importato.'});
  const apertura = assi.find(a => a.codice === 'apertura');
  const attive = apertura?.values.filter(v => v.attivo) ?? [];
  const codici = new Set(attive.map(v => v.valore));
  const direzionabili = /slide|scorrevole|traslante|portoncino|finestra|anger|porta d['’]ingresso/i.test(famiglia.nome)
    && !/fisso|wasistas|vasistas/i.test(famiglia.nome);
  if (direzionabili && !attive.some(v => /(^|_)(dx|sx)(_|$)/i.test(v.valore))) {
    problemi.push({codice:'senso-mancante',messaggio:'DX/SX o schema dell’anta principale non definiti: occorre confermare il disegno visto dall’interno.'});
  }
  for (const valore of attive) {
    if (!/(^|_)(dx|sx)(_|$)/i.test(valore.valore)) continue;
    const specchio = valore.valore.replace(/(^|_)(dx|sx)(?=_|$)/gi, (_, p: string, lato: string) => p + (lato.toLowerCase() === 'dx' ? 'sx' : 'dx'));
    if (!codici.has(specchio)) problemi.push({codice:'specchio-mancante',messaggio:`Manca la variante speculare attiva di «${valore.label}».`});
  }
  for (const asse of assi) {
    const valori = asse.values.filter(v => v.attivo);
    if (asse.obbligatorio && valori.length === 0 && asse.tipo === 'discrete') problemi.push({codice:'asse-vuoto',messaggio:`«${asse.nome}» è obbligatorio ma non ha scelte attive.`});
    if (valori.filter(v => v.is_default).length > 1) problemi.push({codice:'default-multipli',messaggio:`«${asse.nome}» ha più valori predefiniti.`});
    const condizione = asse.visibile_se as {asse?: string; valori?: string[]} | null;
    if (condizione?.asse) {
      const padre = assi.find(a => a.codice === condizione.asse);
      if (!padre || condizione.valori?.some(v => !padre.values.some(p => p.attivo && p.valore === v))) problemi.push({codice:'condizione-non-valida',messaggio:`La condizione di visibilità di «${asse.nome}» non trova una scelta attiva nell’asse collegato.`});
    }
  }
  if (assi.some(a => a.codice === 'zanzariera' && a.visibile_se)) problemi.push({codice:'zanzariera-condizionata',messaggio:'Zanzariera visibile soltanto con monoblocco: verificare la possibilità di richiederla separatamente.'});
  return problemi;
}
