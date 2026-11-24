import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
export const safeName=s=>String(s).normalize('NFKC').replace(/[\\/<>:"|?*\x00-\x1F]/g,'_').replace(/^\.+/,'').slice(0,110)||'documento';
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function draftFile(draft,format){
 const title=`BOZZA DI LAVORO - ${draft.title}`;
 if(format==='pdf'){
  const pdf=new jsPDF();const clean=s=>s.replace(/[—–]/g,'-').replace(/’/g,"'").replace(/“|”/g,'"');let y=30;let page=1;
  const header=()=>{pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.setTextColor(35,58,84);pdf.text('EDILIZIA IN CLOUD | BOZZA DA REVISIONARE',20,15);pdf.setDrawColor(220);pdf.line(20,19,190,19);};
  const footer=()=>{pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(100);pdf.text(`Revisione ${draft.revision} - Documento di lavoro, non firmato | Pagina ${page}`,20,285);};
  header();pdf.setFontSize(15);pdf.setFont('helvetica','bold');pdf.setTextColor(30,58,95);const headings=pdf.splitTextToSize(clean(title),170);pdf.text(headings,20,y);y+=headings.length*7+8;
  pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.setTextColor(30);
  for(const paragraph of draft.body.split('\n')){const lines=pdf.splitTextToSize(clean(paragraph||' '),170);for(const line of lines){if(y>270){footer();pdf.addPage();page++;header();y=29;pdf.setFontSize(10);pdf.setTextColor(30);}pdf.text(line,20,y);y+=5.4;}y+=2;}
  footer();return{buffer:Buffer.from(pdf.output('arraybuffer')),contentType:'application/pdf',name:`BOZZA_${safeName(draft.title)}_r${draft.revision}.pdf`};
 }
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
 zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/_rels/document.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
 zip.file('word/styles.xml','<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>');
 const paragraph=(s,bold=false)=>`<w:p>${bold?'<w:pPr><w:spacing w:after="240"/></w:pPr>':''}<w:r>${bold?'<w:rPr><w:b/><w:sz w:val="30"/></w:rPr>':''}<w:t xml:space="preserve">${xml(s||' ')}</w:t></w:r></w:p>`;
 zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(title,true)}${paragraph(`Revisione ${draft.revision} | Bozza da revisionare. Firma non apposta.`)}${draft.body.split('\n').map(s=>paragraph(s)).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`);
 return{buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',name:`BOZZA_${safeName(draft.title)}_r${draft.revision}.docx`};
}
