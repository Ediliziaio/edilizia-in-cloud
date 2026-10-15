import { describe, expect, it } from 'vitest';
import { Document, Page } from '@react-pdf/renderer';
import { renderToBuffer } from '@react-pdf/renderer/lib/react-pdf.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TestoContrattoPdf } from '@/components/preventivi/pdf/TestoContrattoPdf';
import { leggiTestoRiccoContratto, separaFirmeContratto } from '../../../supabase/functions/_shared/testoRiccoContratto';

describe('PDF contrattuale: stili effettivi',()=>{
  it('incorpora due dimensioni e famiglie nello stesso paragrafo senza tag visibili',async()=>{
    const rows=leggiTestoRiccoContratto('<h2>ART. 1 OGGETTO</h2><p>Normale <span style="font-size:8pt;font-family:Courier New, monospace;color:#123456">PICCOLO</span> <span style="font-size:18pt;font-family:Times New Roman, serif"><strong>GRANDE</strong></span></p>');
    const buffer=await renderToBuffer(<Document><Page size="A4" style={{padding:40}}>{rows.map((r,i)=><TestoContrattoPdf key={i} riga={r} />)}</Page></Document>);
    const pdf=await getDocument({data:new Uint8Array(buffer),useSystemFonts:true}).promise;
    const content=await (await pdf.getPage(1)).getTextContent();
    const words=content.items.filter((x):x is typeof x & {str:string;transform:number[]}=>'str' in x);
    const small=words.find(x=>x.str==='PICCOLO')!;const large=words.find(x=>x.str==='GRANDE')!;
    expect(Math.abs(small.transform[0])).toBeCloseTo(8);
    expect(Math.abs(large.transform[0])).toBeCloseTo(18);
    expect(words.map(x=>x.str).join(' ')).not.toMatch(/<span|font-size|##/);
    await pdf.cleanup();
  },30000);
  it('non riporta righe firma manuali nelle clausole del documento nativo',()=>{
    const text='## ART. 25 ALLEGATI\nTesto conservato. Luogo e data __________ Firma del cliente ______________ Il Legale Rappresentante __________';
    const result=separaFirmeContratto(leggiTestoRiccoContratto(text));
    expect(result.righe.map(r=>r.testo).join(' ')).toBe('ART. 25 ALLEGATI Testo conservato.');
  });
});
