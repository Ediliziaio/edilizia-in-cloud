import {describe,it,expect,vi}from 'vitest';
import {render,screen,fireEvent}from '@testing-library/react';
import {SegnaleticaLavorazionePos}from '@/components/sicurezza/pos/SegnaleticaLavorazionePos';
import {lavorazioneVuota}from '../../../supabase/functions/_shared/posModello';
describe('Scelta e ubicazione segnaletica POS',()=>{
 it('non deduce prescrizioni dal testo della lavorazione',()=>{render(<SegnaleticaLavorazionePos l={{...lavorazioneVuota('l'),titolo:'Lavoro elettrico con casco'}} ro={false} onChange={vi.fn()}/>);expect(screen.getAllByRole('checkbox',{hidden:true}).every(x=>!(x as HTMLInputElement).checked)).toBe(true);});
 it('seleziona un segnale e conserva l’ubicazione distinta dalle note',()=>{const onChange=vi.fn();const l=lavorazioneVuota('l');const {rerender}=render(<SegnaleticaLavorazionePos l={l} ro={false} onChange={onChange}/>);fireEvent.click(screen.getByLabelText(/Protezione del capo/));expect(onChange).toHaveBeenLastCalledWith([{id:'elmetto',ubicazione:'',note:''}]);rerender(<SegnaleticaLavorazionePos l={{...l,segnaletica:[{id:'elmetto',ubicazione:'Ingresso',note:'solo fase A'}]}} ro={false} onChange={onChange}/>);fireEvent.change(screen.getByLabelText('Ubicazione: Protezione del capo'),{target:{value:'Deposito'}});expect(onChange).toHaveBeenLastCalledWith([{id:'elmetto',ubicazione:'Deposito',note:'solo fase A'}]);});
 it('in sola lettura mostra soltanto le scelte e impedisce modifiche',()=>{render(<SegnaleticaLavorazionePos l={{...lavorazioneVuota('l'),segnaletica:[{id:'soccorso',ubicazione:'Locale DEMO',note:''}]}} ro onChange={vi.fn()}/>);expect(screen.getAllByRole('checkbox',{hidden:true})).toHaveLength(1);expect(screen.getByLabelText('Ubicazione: Primo soccorso')).toBeDisabled();});
});
