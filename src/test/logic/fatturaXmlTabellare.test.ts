import { expect,it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { generateXML } from '../../../supabase/functions/_shared/generateXML';
import { fatturaXmlTabellareHtml,leggiFattureXmlStampabili,generaPdfFatturaXml } from '@/lib/fatturazione/fatturaXmlTabellare';
const az={ragione_sociale:'Fornitore Prova Srl',partita_iva:'01941970939',regime_fiscale:'RF01',indirizzo_via:'Via Roma 1',indirizzo_comune:'Pordenone',indirizzo_cap:'33170',indirizzo_provincia:'PN',indirizzo_nazione:'IT'};
const cliente={ragione_sociale:'Cliente Prova Srl',partita_iva:'01234567897',indirizzo_via:'Via Cliente 2',indirizzo_comune:'Udine',indirizzo_cap:'33100',indirizzo_provincia:'UD',indirizzo_nazione:'IT',codice_sdi:'ABC1234'};
function xml(n=1){return generateXML({tipo:'fattura',numero:'FPR 79/26',data_emissione:'2026-11-13',cliente_snapshot:cliente,righe:Array.from({length:n},(_,i)=>({numero_linea:i+1,descrizione:`Voce ${i+1} — lavori e installazioni`,quantita:1,prezzo_unitario:100,imponibile:100,aliquota_iva:'22',unita_misura:'PZ'})),riepilogo_iva:[{aliquota:'22',imponibile:n*100,imposta:n*22,esigibilita:'I'}],totale_documento:n*122,totale_da_pagare:n*122,note_documento:'Rendicontazione bando F decreto 59702 <riferimento> & note pubbliche',note_interne:'RISERVATO NON ESPORTARE',cup:'B12H20000070001',cig:'ZA12345678',scadenze_pagamento:[{data_scadenza:'2026-11-30',importo:n*61,metodo_pagamento:'MP05'},{data_scadenza:'2026-12-31',importo:n*61,metodo_pagamento:'MP05'}],iban_pagamento:'IT39Q0708464900000000976098'},az,'00001');}
it('riporta dati delle parti, note, CUP/CIG, tutti i riepiloghi e tutte le rate',()=>{
 const f=leggiFattureXmlStampabili(xml())[0];expect(f.cedente.join(' ')).toContain('Via Roma 1');expect(f.cliente.join(' ')).toContain('Via Cliente 2');
 expect(f.causali.join(' ')).toContain('59702');expect(JSON.stringify(f)).not.toContain('RISERVATO NON ESPORTARE');
 const rate=f.tabelle.find(t=>t.titolo==='Dati di pagamento')!;expect(rate.righe).toHaveLength(2);expect(rate.righe[1].join(' ')).toContain('31-12-2026');
 expect(JSON.stringify(f)).toContain('B12H20000070001');expect(JSON.stringify(f)).toContain('ZA12345678');
 const h=fatturaXmlTabellareHtml(xml()).html;expect(h).toContain('&lt;riferimento&gt; &amp;');expect(h).not.toContain('<riferimento>');
});
it('il PDF da un vecchio XML senza causale non inventa la nota del gestionale',()=>{
 const originale=xml().replace(/<Causale>[\s\S]*?<\/Causale>/g,'');const f=leggiFattureXmlStampabili(originale)[0];expect(f.causali).toEqual([]);expect(JSON.stringify(f)).not.toContain('59702');
});
it('legge anche XML con prefissi namespace su tutti gli elementi',()=>{
 const prefissato=xml().replace(/<(\/?)(?!p:|\?|!)([A-Za-z][\w]*)/g,'<$1p:$2');expect(leggiFattureXmlStampabili(prefissato)[0].titolo).toContain('79/26');
});
it('gestisce tutti i corpi di un lotto e rifiuta file non XML senza recuperare dati inventati',()=>{
 const originale=xml();const body=originale.match(/<FatturaElettronicaBody>[\s\S]*<\/FatturaElettronicaBody>/)![0];const lotto=originale.replace('</p:FatturaElettronica>',body+'</p:FatturaElettronica>');expect(leggiFattureXmlStampabili(lotto)).toHaveLength(2);
 expect(()=>leggiFattureXmlStampabili('<html>errore</html>')).toThrow();expect(()=>leggiFattureXmlStampabili('<FatturaElettronica><broken')).toThrow();
});
it('genera un vero PDF scaricabile con testo selezionabile, causale e importi originali',async()=>{
 const bytes=await generaPdfFatturaXml(xml());expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-');
 const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>'str'in x?x.str:'').join(' ');
 expect(text).toContain('59702');expect(text).toContain('122,00');expect(text).toContain('Via Cliente');expect(text).not.toContain('RISERVATO');await pdf.cleanup();
},30000);
it('impagina fatture lunghe senza perdere le ultime righe o le note',async()=>{
 const bytes=await generaPdfFatturaXml(xml(70));const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;expect(pdf.numPages).toBeGreaterThan(1);let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>'str'in x?x.str:'').join(' ');
 expect(text).toContain('Voce 70');expect(text).toContain('59702');await pdf.cleanup();
},30000);
