// PDF creati in memoria: nessun file cliente, servizio AI, database o costo.
import { PDFDocument, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';
import { extractPdfWithCoverage } from '../../../supabase/functions/_shared/pdfExtraction.ts';
const native = await PDFDocument.create();
const font = await native.embedFont(StandardFonts.Helvetica);
native.addPage().drawText('Consumo annuo: 6000 kWh\nSpesa annua: 1800 euro',{x:30,y:700,font,size:14,lineHeight:22});
const n = await extractPdfWithCoverage((await native.save()).buffer as ArrayBuffer,{
  maxChars:10000,ocrPage:()=>{throw Error('Un PDF nativo non deve richiedere OCR');},
});
if(!n.coverage.complete || !n.text.includes('6000 kWh') || !n.text.includes('1800 euro')) throw Error('Lettura nativa non conservata');
const nonTestuale=await PDFDocument.create();
for(let i=0;i<8;i++)nonTestuale.addPage().drawRectangle({x:30,y:30,width:400,height:600});
let calls=0;
const s=await extractPdfWithCoverage((await nonTestuale.save()).buffer as ArrayBuffer,{
  maxChars:10000,maxOcrPages:8,ocrPage:async(page,bytes)=>{
    calls++;
    if((await PDFDocument.load(bytes)).getPageCount()!==1)throw Error('Il callback OCR deve ricevere una sola pagina');
    return {text:'Trascrizione sintetica della pagina '+page,finishReason:'stop'};
  },
});
if(calls!==8||!s.coverage.complete)throw Error('Copertura pagine non testuali non conservata');
console.log(JSON.stringify({pdf_runtime:'ok',pagine_native:n.coverage.pages_native.length,pagine_ocr:s.coverage.pages_ocr.length,ocr_a_pagamento:false}));
