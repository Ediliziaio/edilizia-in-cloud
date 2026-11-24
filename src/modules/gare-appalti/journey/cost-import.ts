// Quantities and unit prices are decimal strings; multiplication and rounding
// never pass through binary floating point.
function decimal(value:string){const normalized=value.trim().replace(',','.');if(!/^\d{1,15}(\.\d{1,8})?$/.test(normalized))throw Error(`Numero da verificare: ${value||'vuoto'}. Usa numeri positivi senza separatori delle migliaia.`);const[whole,fraction='']=normalized.split('.');return{integer:BigInt(whole+fraction),scale:fraction.length};}
export function lineAmount(quantity:string,unitPrice:string){const q=decimal(quantity),p=decimal(unitPrice);const denominator=10n**BigInt(q.scale+p.scale);const numerator=q.integer*p.integer*100n;let cents=numerator/denominator;if(numerator%denominator*2n>=denominator)cents++;return`${cents/100n}.${String(cents%100n).padStart(2,'0')}`;}
export function parseDelimited(text:string,{maxRows=1000,maxColumns=50,maxCharacters=5_000_000}={}){
 if(text.length>maxCharacters)throw Error('File troppo esteso per l’importazione guidata');
 const counts:Record<string,number>={';':0,'\t':0,',':0};let inside=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(inside&&text[i+1]==='"')i++;else inside=!inside;}else if(!inside&&(ch==='\r'||ch==='\n'))break;else if(!inside&&ch in counts)counts[ch]++;}
 const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(field);field='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(s=>s.trim()))rows.push(row);row=[];field='';}else field+=ch;if(rows.length>maxRows+1||row.length>maxColumns)throw Error(`Massimo ${maxRows} righe e ${maxColumns} colonne per importazione`);}
 if(quoted)throw Error('Virgolette non chiuse nel file');row.push(field);if(row.length>maxColumns||rows.some(r=>r.length>maxColumns))throw Error(`Massimo ${maxColumns} colonne per importazione`);if(row.some(s=>s.trim()))rows.push(row);if(rows.length>maxRows+1)throw Error(`Massimo ${maxRows} voci per importazione`);return rows;
}
