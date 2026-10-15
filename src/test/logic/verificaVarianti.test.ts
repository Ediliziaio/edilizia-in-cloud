import { describe, it, expect } from 'vitest';
import type { FamilyWithAxes } from '@/types/articleFamily';
import { verificaVarianti } from '@/lib/listino/verificaVarianti';

const famiglia = (nome: string, valori: string[] = []) => ({nome, axes: valori.length ? [{nome:'Apertura',codice:'apertura',tipo:'discrete',values:valori.map(valore=>({valore,label:valore,attivo:true}))}] : []}) as unknown as FamilyWithAxes;
describe('completezza delle varianti',()=>{
  it('rileva lo scorrevole senza senso, senza richiederlo sui fissi o vasistas',()=>{
    expect(verificaVarianti(famiglia('Slide Plus')).map(p=>p.codice)).toContain('senso-mancante');
    expect(verificaVarianti(famiglia('Fisso nel Telaio')).map(p=>p.codice)).not.toContain('senso-mancante');
    expect(verificaVarianti(famiglia('Finestra Wasistas')).map(p=>p.codice)).not.toContain('senso-mancante');
  });
  it('verifica la coppia speculare usando i codici e ignorando i valori inattivi',()=>{
    const f=famiglia('Finestra 1 Anta',['battente_dx']);
    expect(verificaVarianti(f).map(p=>p.codice)).toContain('specchio-mancante');
    f.axes[0].values.push({...f.axes[0].values[0],valore:'battente_sx',attivo:false});
    expect(verificaVarianti(f).map(p=>p.codice)).toContain('specchio-mancante');
    f.axes[0].values[1].attivo=true;
    expect(verificaVarianti(f)).toEqual([]);
  });
  it('non considera la scelta del numero di ante come una scelta DX/SX',()=>{
    expect(verificaVarianti(famiglia('Finestra Anger Social',['1_anta','2_ante'])).map(p=>p.codice)).toContain('senso-mancante');
  });
  it('segnala condizioni irraggiungibili e predefiniti ambigui',()=>{
    const f=famiglia('Fisso',['dx','sx']);
    f.axes[0].values.forEach(v=>v.is_default=true);
    f.axes[0].visibile_se={asse:'inesistente',valori:['con']};
    expect(verificaVarianti(f).map(p=>p.codice)).toEqual(['default-multipli','condizione-non-valida']);
  });
});
