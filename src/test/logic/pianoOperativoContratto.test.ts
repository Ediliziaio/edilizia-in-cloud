import { describe, expect, it } from 'vitest';
import { parseContractExtract } from '@/lib/orders/contractExtract';
import { articoliDalPiano, fasiOperativePerEstratto, pianoOperativoContratto, modelliDalPiano } from '@/lib/orders/pianoOperativoContratto';
import { soloLeParti, type ParteContratto } from '@/lib/orders/sceltaContratto';
import { fasiDalContratto } from '@/lib/orders/contractPreparation';
import { fasiDaBozza } from '@/lib/orders/pianificazioneAvvio';

export const preventivoPosizioni = (quantita = 2, zanzariere = 13) => parseContractExtract({
  cliente:{nome_completo:'Cliente di prova'}, importo_totale_eur:12000,
  voci:[{descrizione:'Sola fornitura infissi come da allegato',quantita:1,prezzo_unitario_eur:12000},{descrizione:'Pose e materiali di consumo compresi',quantita:1,prezzo_unitario_eur:0}],
  posizioni_allegato:[{codice:'Porta 003',descrizione:'Porta in PVC',dimensioni:'1000x2200',quantita},{codice:'ZANZARIERE',descrizione:'Zanzariere',quantita:zanzariere}],
  note_a_mano:[{testo:'Guarnizioni grigie',riferimento:null,contraddice:'Guarnizioni nere'}],
});

describe('piano comune delle lavorazioni e degli articoli',()=>{
  it('i capitoli sulle voci governano le fasi quando l’AI li riscrive con titoli differenti',()=>{
    const e=parseContractExtract({voci:[{descrizione:'Fornitura tubo',quantita:10,unita:'m',capitolo:'CAP. 1 - Lavorazioni in sottocentrale e distribuzioni principali'}],
      fasi_lavoro:[{nome:'Sottocentrale',giorni:null,sottofasi:['Tubi']}]});
    const p=pianoOperativoContratto(e);expect(p.fasi).toHaveLength(1);expect(p.fasi[0].nome).toBe(e.voci[0].capitolo);
    expect(p.fasi[0].lavorazioni).toHaveLength(1);
  });
  it('conserva le quantità di posa e acquisto, il prezzo a corpo e le varianti da confermare',()=>{
    const e=preventivoPosizioni(),p=pianoOperativoContratto(e),a=articoliDalPiano(p);
    expect(p.fasi.map(f=>[f.nome,f.lavorazioni.map(l=>l.quantita)])).toEqual([['Installazione serramenti',[2]],['Installazione zanzariere',[13]]]);
    expect(a.map(a=>a.quantity)).toEqual([2,13]);expect(a.every(a=>a.unit_price===0&&a.prezzo_da_definire)).toBe(true);
    for(const f of p.fasi)for(const l of f.lavorazioni){const m=p.materiali.find(m=>m.chiave===l.articolo_riferimenti[0])!;expect(m.phase_id).toBe(f.riferimento);expect(m.quantita_calcolata).toBe(l.quantita);expect(m.origini[0]).toMatchObject({tipo:'contratto',posizione_ref:l.riferimento});}
    expect(p.materiali[1].verifiche.join(' ')).toMatch(/Misure/);expect(p.materiali[0].verifiche.join(' ')).toMatch(/Guarnizioni grigie/);
    expect(p.avvisi.join(' ')).toMatch(/sola fornitura/);expect(e.importo_totale_eur).toBe(12000);
  });
  it('funziona con nuove quantità e nuove posizioni, senza fissare il caso a 17 e 13',()=>{
    const p=pianoOperativoContratto(preventivoPosizioni(7,4));expect(p.materiali.map(m=>m.quantita_calcolata)).toEqual([7,4]);expect(p.fasi.flatMap(f=>f.lavorazioni.map(l=>l.quantita))).toEqual([7,4]);
  });
  it('una fornitura pura non inventa la posa',()=>{
    const e=preventivoPosizioni();e.voci=e.voci.slice(0,1);const p=pianoOperativoContratto(e);expect(p.fasi).toEqual([]);expect(p.materiali).toHaveLength(2);
  });
  it('riusa la fase di montaggio letta dal documento senza aggiungere una fase omonima',()=>{
    const e=preventivoPosizioni();e.fasi_lavoro=[{nome:'Montaggio infissi',giorni:3,sottofasi:['Posa infissi']}];const p=pianoOperativoContratto(e);expect(p.fasi.map(f=>f.nome)).toEqual(['Montaggio infissi','Installazione zanzariere']);expect(p.fasi[0].giorni).toBe(3);expect(p.fasi[0].lavorazioni[0].quantita).toBe(2);expect(p.materiali[0].phase_id).toBe(p.fasi[0].riferimento);
  });
  it('mantiene i riferimenti attraverso selezione delle parti, parser e bozza',()=>{
    const e=preventivoPosizioni();const parti=new Set<ParteContratto>(['lavorazioni','articoli','cliente']);
    const p=pianoOperativoContratto(e),r=parseContractExtract(soloLeParti(e,parti));
    expect(modelliDalPiano(pianoOperativoContratto(r))).toEqual(modelliDalPiano(p));
    expect(fasiDaBozza(fasiDalContratto(r))?.map(f=>[f.riferimento,f.sottofasi])).toEqual(fasiDalContratto(r).map(f=>[f.riferimento,f.sottofasi]));
    const soloFasi=soloLeParti(e,new Set(['lavorazioni']));expect(pianoOperativoContratto(soloFasi).materiali).toEqual([]);expect(fasiDalContratto(soloFasi)[0].sottofasi[0].quantita).toBe(2);
    const soloArticoli=soloLeParti(e,new Set(['articoli']));expect(fasiDalContratto(soloArticoli)).toEqual([]);expect(pianoOperativoContratto(soloArticoli).materiali).toHaveLength(2);
  });
  it('le correzioni alle quantità aggiornano lo stesso lavoro e il suo articolo',()=>{
    const e=preventivoPosizioni(),p=pianoOperativoContratto(e);
    e.riferimento_piano=p.riferimento;e.fasi_lavoro=fasiOperativePerEstratto(p);e.posizioni_allegato![0].quantita=5;
    const nuovo=pianoOperativoContratto(e);expect(nuovo.fasi[0].lavorazioni[0].quantita).toBe(5);expect(nuovo.materiali[0].quantita_calcolata).toBe(5);expect(nuovo.materiali[0].chiave).toBe(p.materiali[0].chiave);
  });
  it('non ricrea fasi rinominate o lavorazioni tolte dall’anteprima',()=>{
    const e=preventivoPosizioni(),p=pianoOperativoContratto(e);e.riferimento_piano=p.riferimento;e.fasi_lavoro=fasiOperativePerEstratto(p).slice(0,1);e.fasi_lavoro[0].nome='Posa piano terra';
    const nuovo=pianoOperativoContratto(e);expect(nuovo.fasi.map(f=>f.nome)).toEqual(['Posa piano terra']);expect(nuovo.materiali[1].phase_id).toBeNull();
  });
  it('un capitolo lungo conserva tutte le lavorazioni e i riferimenti univoci anche con codici ripetuti',()=>{
    const e=parseContractExtract({voci:Array.from({length:55},(_,i)=>({codice:'MUR_1.1',capitolo:'Murature',descrizione:'Demolizione parete '+i,unita:'mq',quantita:i+1}))});
    const p=pianoOperativoContratto(e),l=p.fasi.flatMap(f=>f.lavorazioni);expect(l).toHaveLength(55);expect(new Set(l.map(l=>l.riferimento)).size).toBe(55);expect(fasiDaBozza(modelliDalPiano(p))![0].sottofasi).toHaveLength(55);expect(p.materiali).toEqual([]);
  });
  it('usa la ricetta per le murature e lascia fuori materiali del cliente, servizi e sconti',()=>{
    const e=parseContractExtract({voci:[{descrizione:'Tramezzo in laterizio forato spessore 8 cm',capitolo:'Murature',quantita:10,unita:'mq'},{descrizione:'Fornitura piastrelle del cliente',capitolo:'Pavimenti',quantita:20,unita:'mq',a_carico_committente:true},{descrizione:'Noleggio ponteggio',quantita:30,unita:'mq'},{descrizione:'Sconto',quantita:1,prezzo_unitario_eur:-100}]});
    const p=pianoOperativoContratto(e);expect(p.materiali.some(m=>/laterizio/i.test(m.descrizione))).toBe(true);expect(p.materiali.every(m=>!/piastrell|ponteggio|sconto/i.test(m.descrizione))).toBe(true);
    for(const m of p.materiali)expect(m.origini[0]).toMatchObject({tipo:'contratto',posizione_ref:p.fasi[0].lavorazioni[0].riferimento});
  });
  it('non trasforma m² di colla in kg e non inventa una quantità assente',()=>{
    const p=pianoOperativoContratto(parseContractExtract({voci:[{descrizione:'Fornitura colla H40',quantita:78,unita:'mq'},{descrizione:'Fornitura cemento',unita:'kg'}]}));
    expect(p.materiali).toHaveLength(1);expect(p.materiali[0]).toMatchObject({quantita_calcolata:78,unita_misura:'mq'});expect(p.materiali[0].verifiche.join(' ')).toMatch(/Resa e unità/);expect(p.avvisi.join(' ')).toMatch(/senza quantità/);
  });
  it('un facsimile vuoto non genera lavori o acquisti',()=>{
    const p=pianoOperativoContratto(parseContractExtract({descrizione_lavori:'Contratto da compilare, rinvia agli allegati',voci:[]}));expect(p.fasi).toEqual([]);expect(p.materiali).toEqual([]);
  });
});
