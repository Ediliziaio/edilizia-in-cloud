import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseContractExtract } from '@/lib/orders/contractExtract';
import { articoliDalPiano, modelliDalPiano, pianoOperativoContratto } from '@/lib/orders/pianoOperativoContratto';
import { salvaPianoOperativoContratto } from '@/lib/orders/salvaPianoOperativoContratto';
import { commessaLocaleDb } from '../support/commessaLocaleDb';

const piano = () => pianoOperativoContratto(parseContractExtract({descrizione_lavori:'Fornitura e posa di infissi',voci:[],posizioni_allegato:[{codice:'Finestra A',quantita:2,dimensioni:'1200x1500',descrizione:'Finestra bianca'},{codice:'Zanzariere',quantita:13,descrizione:'Zanzariera su misura'}]}));
type Client = NonNullable<Parameters<typeof salvaPianoOperativoContratto>[1]>;
const locale = () => commessaLocaleDb({orders:[{id:'commessa',company_id:'azienda'}]});
const salva = (s: ReturnType<typeof locale>,extra = {}) => { const p=piano();return salvaPianoOperativoContratto({companyId:'azienda',orderId:'commessa',piano:p,fasi:modelliDalPiano(p),aggiungiArticoli:true,vatRate:22,...extra},s.db as unknown as Client); };
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>vi.unstubAllGlobals());

describe('persistenza del piano documentale nella commessa',()=>{
  it('salva quantità previste e collega ciascun articolo alla fase, alla sottofase e alla sua voce',async()=>{
    const s=locale();await salva(s);
    expect(s.tabelle.order_work_phases).toHaveLength(2);expect(s.tabelle.order_work_subphases).toHaveLength(2);expect(s.tabelle.order_work_phase_voci.map(v=>v.quantita)).toEqual([2,13]);
    expect(s.tabelle.order_items.map(a=>a.quantity)).toEqual([2,13]);
    for(const a of s.tabelle.order_items){const o=a.origini[0],v=s.tabelle.order_work_phase_voci.find(v=>v.id===o.voce_id)!;expect(v.quantita).toBe(a.quantity);expect(v.phase_id).toBe(a.phase_id);expect(o.subphase_id).toBe(v.subphase_id);expect(v.importo).toBeNull();expect(v.origine).toBe('piano');}
    expect(s.chiamate.filter(c=>c==='upsert:order_work_phase_voci')).toHaveLength(1);
  });
  it('ripetere il completamento non crea righe nuove e conserva quantità, progressi, prezzi e assegnazioni modificati',async()=>{
    const s=locale();await salva(s);Object.assign(s.tabelle.order_items[0],{quantity:3,purchase_price:480,phase_id:'fase-scelta',unita_misura:'mq',specifiche:'Scelta verificata dal tecnico'});s.tabelle.order_work_subphases[0].quantita_fatta=1;s.tabelle.order_work_phase_voci[0].quantita=4;
    const prima=s.chiamate.filter(c=>c.startsWith('rpc:')).length;await salva(s);
    expect(s.tabelle.order_items).toHaveLength(2);expect(s.tabelle.order_work_phase_voci).toHaveLength(2);expect(s.tabelle.order_work_phases).toHaveLength(2);
    expect(s.chiamate.filter(c=>c.startsWith('rpc:'))).toHaveLength(prima);expect(s.tabelle.order_items[0]).toMatchObject({quantity:3,purchase_price:480,phase_id:'fase-scelta',unita_misura:'mq',specifiche:'Scelta verificata dal tecnico'});expect(s.tabelle.order_work_subphases[0].quantita_fatta).toBe(1);expect(s.tabelle.order_work_phase_voci[0].quantita).toBe(4);
  });
  it('conserva quantità confermata e riscontro del tecnico quando riapplica la stessa fonte', async () => {
    const s = locale();
    await salva(s);
    const a = s.tabelle.order_items[0];
    const verifica = { stato: 'confermata', motivi: ['Controllato in cantiere'], campi_mancanti: [] as string[], confermata_da: 'tecnico' };
    Object.assign(a, { quantity: 9, quantita_calcolata: 9, origini: a.origini.map((o: object) => ({ ...o, verifica_acquisto: verifica })) });
    await salva(s);
    await salva(s);
    expect(s.tabelle.order_items).toHaveLength(2);
    expect(a).toMatchObject({ quantity: 9, quantita_calcolata: 9, origini: [{ verifica_acquisto: verifica }] });
  });

  it('richiede una revisione esplicita quando cambiano i dati di una fonte confermata', async () => {
    const s = locale();
    await salva(s);
    const a = s.tabelle.order_items[0];
    a.origini[0].verifica_acquisto = { stato: 'confermata', motivi: [], campi_mancanti: [] };
    const p = piano();
    p.materiali[0].origini[0].quantita = 4;
    await expect(salva(s, { piano: p })).rejects.toThrow(/fonte.*cambiata/i);
    expect(a.origini[0]).toMatchObject({ quantita: 2, verifica_acquisto: { stato: 'confermata' } });
  });
  it('dopo risposta persa degli articoli recupera i riferimenti salvati e completa senza duplicare',async()=>{
    const s=locale();s.perdiRispostaArticoli();await expect(salva(s)).rejects.toThrow(/Connessione/);expect(s.tabelle.order_items).toHaveLength(2);
    await salva(s);expect(s.tabelle.order_items).toHaveLength(2);expect(s.chiamate.filter(c=>c==='rpc:commessa_aggiungi_voci')).toHaveLength(1);expect(s.tabelle.order_items.every(a=>a.chiave_materiale&&a.origini[0].voce_id)).toBe(true);
  });
  it('collega gli articoli già creati atomicamente tramite posizione e manifest, senza inserirli di nuovo',async()=>{
    const s=locale(),p=piano(),a=articoliDalPiano(p);s.tabelle.order_items=a.map((a,i)=>({id:'atomic-'+i,order_id:'commessa',name:a.name,quantity:a.quantity,position:i}));
    await salva(s,{aggiungiArticoli:false,articoli:a});expect(s.tabelle.order_items).toHaveLength(2);expect(s.chiamate).not.toContain('rpc:commessa_aggiungi_voci');expect(s.tabelle.order_items[0].origini[0].subphase_id).toBeTruthy();
  });
  it('non ripristina un articolo escluso nel modulo e conserva i collegamenti se si aggiungono solo articoli',async()=>{
    const s=locale(),p=piano(),a=articoliDalPiano(p);s.tabelle.order_items=[{id:'atomic',order_id:'commessa',name:a[0].name,quantity:a[0].quantity,position:0}];
    await salva(s,{aggiungiArticoli:false,articoli:a.slice(0,1)});expect(s.tabelle.order_items).toHaveLength(1);const origine=s.tabelle.order_items[0].origini;
    await salva(s,{fasi:[],aggiungiArticoli:false});expect(s.tabelle.order_items[0].origini).toEqual(origine);
  });
  it('rifiuta una commessa di altra azienda prima di scrivere',async()=>{
    const s=locale();s.tabelle.orders[0].company_id='altra';await expect(salva(s)).rejects.toThrow(/non disponibile/);expect(s.chiamate.every(c=>c.startsWith('leggi:'))).toBe(true);
  });
  it('non assegna un’IVA inventata agli articoli aggiunti a una commessa',async()=>{
    const s=locale();await expect(salva(s,{vatRate:null})).rejects.toThrow(/Conferma l'IVA/);expect(s.chiamate).not.toContain('rpc:commessa_aggiungi_voci');
  });
  it('ferma associazioni ambigue invece di scegliere una delle fasi omonime',async()=>{
    const s=locale(),p=piano();s.tabelle.order_work_phases=[{id:'a',company_id:'azienda',order_id:'commessa',name:p.fasi[0].nome},{id:'b',company_id:'azienda',order_id:'commessa',name:p.fasi[0].nome}];
    await expect(salva(s)).rejects.toThrow(/non univoca/);expect(s.tabelle.order_items??[]).toEqual([]);
  });
});
