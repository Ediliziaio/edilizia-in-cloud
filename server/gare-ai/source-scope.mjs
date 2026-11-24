import {createHash} from 'node:crypto';
import {readingUnits} from '../../src/modules/gare-appalti/reader/text-model.js';
export function scopeSourcePages(scope,extracted,documents){
 if(!scope)return extracted.pages;
 const doc=documents[0];if(documents.length!==1)throw Error('La domanda sul testo richiede una sola fonte');
 const coverage=extracted.coverage.find(c=>c.document_id===doc.id)||{};
 const unit=readingUnits(extracted.pages.filter(p=>p.document_id===doc.id),coverage).find(u=>u.key===scope.unit_key);
 if(!unit?.available||!unit.reading_complete)throw Error('Il testo richiesto non è ancora completamente letto');
 if(createHash('sha256').update(unit.text).digest('hex')!==scope.extracted_sha256)throw Error('La trascrizione è cambiata: riapri il testo e ripeti la domanda');
 return[{text:unit.text,document_id:doc.id,version:doc.version,page:unit.page,section:unit.section,method:unit.method}];
}
