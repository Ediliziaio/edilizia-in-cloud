// Esegue il renderer reale con dati sintetici; nessuna rete o scrittura DB.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import * as pdfLib from 'pdf-lib';

const out = process.argv[2];
if (!out || !path.isAbsolute(out)) throw new Error('Indicare una cartella assoluta per le prove PDF');
fs.mkdirSync(out, { recursive: true });
const companyId = '10000000-0000-4000-8000-000000000001';
const coverPath = `${companyId}/template-cover-prova.pdf`;
const coverDoc = await pdfLib.PDFDocument.create();
const coverPage = coverDoc.addPage([595,842]);
coverPage.drawText('COPERTINA ORIGINALE - BORDO ALTO', { x: 25, y: 810, size: 16 });
coverPage.drawText('BORDO BASSO INTEGRO', { x: 25, y: 25, size: 16 });
const coverBytes = await coverDoc.save();
fs.writeFileSync(path.join(out,'copertina-originale.pdf'),coverBytes);
const db = {
  from(table) {
    const q = { select(){return q;}, eq(){return q;}, in(){return q;},
      maybeSingle: async () => ({ data: table === 'profiles' ? { company_id: companyId } : null }),
      then(resolve) { return Promise.resolve({data:[]}).then(resolve); },
    }; return q;
  },
  storage: { from: () => ({ download: async ref => ({ data: ref === coverPath ? new Blob([coverBytes]) : null }) }) },
};
let handler;
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  let source = fs.readFileSync(file.endsWith('/generate-quote-pdf/index.ts') && process.env.PALMA_PDF_SOURCE ? process.env.PALMA_PDF_SOURCE : file, 'utf8');
  if (file.endsWith('/generate-quote-pdf/index.ts')) {
    assert(source.includes('Profilo 5 camere, vetro basso-emissivo 4/16/4'));
    source = source.replace("Offerta per la fornitura e installazione di serramenti in PVC presso l'immobile sito in Via Esempio 10, Roma.", 'Descrizione generale dei lavori e delle opere concordate. '.repeat(90) + 'FINE_OGGETTO_INTEGRO');
    source = source.replace('Finestra PVC 120x140 doppio vetro','Finestra PVC 120x140 doppio vetro '+ 'specifiche estese della lavorazione '.repeat(20)+'FINE_NOME_INTEGRO');
    source = source.replace('Profilo 5 camere, vetro basso-emissivo 4/16/4', (Array.from({length:180},(_,i)=>`V${String(i+1).padStart(3,'0')} Lavorazione estesa con preparazione supporti, protezioni e controllo finale. `).join('') + 'FINE_DESCRIZIONE_INTEGRA'));
    source = source.replace('      righePerIva = items;', `      items.push({ name: ${JSON.stringify('Nota di lavorazione completa. '.repeat(180) + 'FINE_NOTA_INTEGRA')}, item_category: 'nota' });\n      righePerIva = items;`);
  }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const req = ref => {
    if (ref.includes('pdf-lib')) return pdfLib;
    if (ref.includes('supabase-js')) return { createClient: () => db };
    if (ref.endsWith('/auth.ts')) return { requireAuth: async () => ({ userId: 'prova', supabaseAdmin: db }), requireCompanyAccess: async () => {} };
    if (ref.endsWith('/chiamataInterna.ts')) return { chiamataInternaValida: () => false };
    if (ref.endsWith('/headers.ts')) return {
      getCorsHeaders: () => ({}),
      jsonResponse: (data,status=200) => new Response(JSON.stringify(data),{status}),
      errorResponse: (error,status=500) => new Response(JSON.stringify({error}),{status}),
    };
    if (ref.endsWith('/getBranding.ts')) return { getBrandingForCompany: async () => ({ hidePoweredBy: true, primaryColor: '#123456', logoUrl: '', platformName: 'Prova' }) };
    if (ref.startsWith('.')) return load(path.resolve(path.dirname(file),ref));
    throw new Error(`Dipendenza non simulata: ${ref}`);
  };
  new Function('require','module','exports','Deno','fetch',code)(req,module,module.exports,{serve: fn=>handler=fn, env:{get:()=>''}},()=>{throw new Error('Rete non consentita nelle prove');});
  cache.set(file,module.exports);
  return module.exports;
}
load(path.resolve('supabase/functions/generate-quote-pdf/index.ts'));
for (const layout of ['classic','modern','minimal','bold','copertina-pdf']) {
  const response = await handler(new Request('https://example.invalid',{ method:'POST', body:JSON.stringify({ preview_mode:true, company_name:'IMPRESA DI PROVA', template_data:{ layout: layout === 'copertina-pdf' ? 'classic' : layout, company_id: companyId, cover_title:'', cover_subtitle:'', show_cover_image:layout === 'copertina-pdf', cover_image_url:layout === 'copertina-pdf' ? coverPath : null, show_notes:false, show_contractual_terms:false, show_legal_terms:false } }) }));
  const result = await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  assert(result.pdf_base64);
  const file = path.join(out,`${layout}.pdf`);
  fs.writeFileSync(file,Buffer.from(result.pdf_base64,'base64'));
  const testo = execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
  assert(testo.includes('FINE_DESCRIZIONE_INTEGRA'),`${layout}: descrizione tagliata`);
  assert(testo.includes('FINE_NOME_INTEGRO'),`${layout}: nome tagliato`);
  for(let i=1;i<=180;i++) assert.equal((testo.match(new RegExp(`\\bV${String(i).padStart(3,'0')}\\b`,'g'))||[]).length,1,`${layout}: pezzo di descrizione perso o duplicato (${i})`);
  assert(testo.includes('FINE_OGGETTO_INTEGRO'),`${layout}: oggetto tagliato`);
  assert(testo.includes('FINE_NOTA_INTEGRA'),`${layout}: nota tagliata`);
  assert.equal((testo.match(/3\.400,00/g)||[]).length,1,`${layout}: importo duplicato`);
  if (layout === 'copertina-pdf') {
    assert(testo.includes('COPERTINA ORIGINALE - BORDO ALTO'));
    assert(testo.includes('BORDO BASSO INTEGRO'));
  }
  console.log(`${layout}: OK, ${(await pdfLib.PDFDocument.load(Buffer.from(result.pdf_base64,'base64'))).getPageCount()} pagine, testo completo, importo unico`);
}
