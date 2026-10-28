import type { PosContenuto } from '../../../supabase/functions/_shared/posModello';

// Only app-owned candidates are eligible. Site-specific technical text, files,
// employer role, shifts and organisation are never replaced by this comparison.
const campi = [
  ['opera.committente', 'Committente'],
  ['opera.responsabile_lavori', 'Responsabile dei lavori'],
  ['opera.cantiere', 'Indirizzo del cantiere'],
  ['opera.descrizione_attivita', 'Descrizione della commessa'],
  ['opera.data_inizio', 'Inizio lavori'],
  ['opera.data_fine', 'Fine lavori'],
  ['impresa.ragione_sociale', 'Ragione sociale'],
  ['impresa.partita_iva', 'Partita IVA'],
  ['impresa.datore_lavoro', 'Datore di lavoro'],
  ['impresa.sede_legale', 'Sede legale'],
  ['impresa.sede_operativa', 'Sede operativa'],
  ['dirigenti', 'Dirigenti'], ['preposti', 'Preposti'], ['rspp', 'RSPP'],
  ['medico_competente', 'Medico competente'], ['rls', 'RLS / RLST'],
  ['emergenze.addetti', 'Addetti alle emergenze'],
  ['lavoratori', 'Lavoratori per qualifica'], ['formazione', 'Lavoratori e formazione'],
] as const;
export type CampoConfrontoPos = typeof campi[number][0];
export interface DifferenzaPos { campo: CampoConfrontoPos; titolo: string; attuale: unknown; rilevato: unknown; nonRilevato: boolean }
const leggi = (p: PosContenuto, path: CampoConfrontoPos): unknown => path.split('.').reduce<unknown>((v,k)=>(v as Record<string, unknown>)[k],p);
function canonico(v: unknown): string {
  if(Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if(v && typeof v==='object') return `{${Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonico(x)}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}
function assente(v: unknown): boolean {
  if(v==null || v==='') return true;
  if(Array.isArray(v)) return v.length===0;
  if(typeof v==='object') {
    const o=v as Record<string,unknown>;
    if('nominativo' in o) return !String(o.nominativo||'').trim();
    return Object.values(o).every(assente);
  }
  return false;
}
export function confrontaPos(attuale: PosContenuto, fonte: PosContenuto): DifferenzaPos[] {
  return campi.flatMap(([campo,titolo])=>{
    const a=leggi(attuale,campo), b=leggi(fonte,campo);
    return canonico(a)===canonico(b)?[]:[{campo,titolo,attuale:a,rilevato:b,nonRilevato:assente(b)}];
  });
}
/** Explicit selection includes removal; an empty source is never applied by default. */
export function applicaConfrontoPos(attuale: PosContenuto, fonte: PosContenuto, selezionati: readonly CampoConfrontoPos[]): PosContenuto {
  const nuovo=structuredClone(attuale);
  const validi=new Set(campi.map(([k])=>k));
  for(const campo of selezionati) {
    if(!validi.has(campo)) throw new Error('Campo di confronto POS non consentito');
    const parti=campo.split('.');
    const destinazione=parti.length===1?nuovo:(nuovo as unknown as Record<string,Record<string,unknown>>)[parti[0]];
    (destinazione as unknown as Record<string,unknown>)[parti.at(-1)!]=structuredClone(leggi(fonte,campo));
  }
  if(selezionati.some(k=>k==='lavoratori'||k==='formazione')) nuovo.formazione=nuovo.formazione.map(r=>({...r,verificata:false}));
  return nuovo;
}
const etichette: Record<string,string>={nominativo:'Nominativo',codice_fiscale:'Codice fiscale',indirizzo:'Indirizzo',telefono:'Telefono',email:'Email',via:'Via',localita:'Località',provincia:'Provincia',mansioni_sicurezza:'Mansioni di sicurezza',ruolo:'Ruolo',ruolo_altro:'Altro ruolo',svolto_da:'Svolto da',previsto:'Previsto',tipo:'Tipo',antincendio:'Antincendio',primo_soccorso:'Primo soccorso',qualifica:'Qualifica',numero:'Numero',note:'Note',verificata:'Formazione verificata',base:'Formazione base',rischi_specifici:'Rischi specifici',rischi_cantiere:'Rischi del cantiere',dpi_terza_categoria:'DPI III categoria',altro:'Altro',attestati:'Attestati'};
export function testoConfrontoPos(v: unknown): string {
  if(v==null||v==='') return 'Non indicato';
  if(typeof v==='boolean') return v?'Sì':'No';
  if(Array.isArray(v)) return v.length?v.map(testoConfrontoPos).join('\n\n'):'Nessuna voce rilevata';
  if(typeof v==='object') return Object.entries(v).filter(([,x])=>x!==''&&x!=null).map(([k,x])=>`${etichette[k]||k}: ${testoConfrontoPos(x)}`).join('\n')||'Non indicato';
  return String(v);
}
