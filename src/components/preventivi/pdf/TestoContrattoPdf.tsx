import { Text } from '@react-pdf/renderer';
import type { RigaContratto, StileContratto } from '../../../../supabase/functions/_shared/testoRiccoContratto';

export function fontContratto(s: StileContratto, fallback='Helvetica'): string {
  const family=s.famiglia ?? (/Times/i.test(fallback)?'times':/Courier/i.test(fallback)?'courier':'helvetica');
  return family==='times' ? s.grassetto ? s.corsivo?'Times-BoldItalic':'Times-Bold' : s.corsivo?'Times-Italic':'Times-Roman'
    : family==='courier' ? s.grassetto?s.corsivo?'Courier-BoldOblique':'Courier-Bold':s.corsivo?'Courier-Oblique':'Courier'
    : s.grassetto?s.corsivo?'Helvetica-BoldOblique':'Helvetica-Bold':s.corsivo?'Helvetica-Oblique':'Helvetica';
}

/** One renderer for all native module contracts, including editorial editions. */
export function TestoContrattoPdf({riga:r,prima=false,font='Helvetica',colore='#334155',dimensione=10}: {
  riga:RigaContratto;prima?:boolean;font?:string;colore?:string;dimensione?:number;
}) {
  const heading=r.tipo==='h1'||r.tipo==='h2';
  const base=heading?r.tipo==='h1'?14:11:dimensione;
  return <Text minPresenceAhead={heading?28:0} orphans={2} widows={2} style={{fontFamily:fontContratto({grassetto:heading},font),fontSize:base,color:colore,
    textAlign:r.allineamento??'left',lineHeight:r.interlinea??1.5,marginTop:heading&&!prima?10:0,
    marginLeft:r.tipo==='li'?10:0,marginBottom:r.spazioDopo??(heading?4:5)}}>
    {r.tipo==='li'&&!/^\d+\./.test(r.testo)?'• ':''}
    {(r.parti??[{testo:r.testo,stile:{}}]).map((p,i)=><Text key={i} style={{
      fontFamily:fontContratto({...p.stile,grassetto:p.stile.grassetto??heading},font),fontSize:p.stile.dimensione??base,
      color:p.stile.colore??colore,textDecoration:p.stile.sottolineato&&p.stile.barrato?'underline line-through':p.stile.sottolineato?'underline':p.stile.barrato?'line-through':undefined,
    }}>{p.testo}</Text>)}
  </Text>;
}
