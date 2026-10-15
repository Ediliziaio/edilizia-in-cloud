import { normalizzaTestoTemplatePdf } from './testoTemplatePdf.ts';

export interface StileContratto {
  famiglia?: 'helvetica' | 'times' | 'courier';
  dimensione?: number;
  grassetto?: boolean;
  corsivo?: boolean;
  sottolineato?: boolean;
  barrato?: boolean;
  colore?: string;
}
export interface ParteContratto { testo: string; stile: StileContratto }
export interface RigaContratto {
  tipo: 'h1' | 'h2' | 'li' | 'p';
  testo: string;
  parti?: ParteContratto[];
  allineamento?: 'left' | 'center' | 'right' | 'justify';
  interlinea?: number;
  spazioDopo?: number;
}
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decode = (s: string) => normalizzaTestoTemplatePdf(s);
const css = (s: string): Record<string, string> => Object.fromEntries(s.split(';').map(p => p.split(/:(.*)/s).slice(0,2).map(x => x.trim())).filter(p => p.length === 2));
function styleOf(tag: string, attrs: string, parent: StileContratto): StileContratto {
  const s = { ...parent };
  if (/^(strong|b|h[1-3])$/.test(tag)) s.grassetto = true;
  if (/^(em|i)$/.test(tag)) s.corsivo = true;
  if (tag === 'u') s.sottolineato = true;
  if (/^(s|strike)$/.test(tag)) s.barrato = true;
  const raw = /\bstyle\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /\bstyle\s*=\s*'([^']*)'/i.exec(attrs)?.[1] ?? '';
  const c = css(raw);
  const size = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(c['font-size'] ?? '');
  if (size) s.dimensione = Math.max(7, Math.min(28, Number(size[1]) * (size[2] === 'px' ? .75 : 1)));
  if (c['font-family']) s.famiglia = /courier|mono/i.test(c['font-family']) ? 'courier' : /georgia|times|\bserif\b/i.test(c['font-family']) && !/sans-serif/i.test(c['font-family']) ? 'times' : 'helvetica';
  if (/^(bold|[6-9]00)$/.test(c['font-weight'] ?? '')) s.grassetto = true;
  if (c['font-style'] === 'italic') s.corsivo = true;
  if (/underline/.test(c['text-decoration'] ?? '')) s.sottolineato = true;
  if (/line-through/.test(c['text-decoration'] ?? '')) s.barrato = true;
  const col = c.color;
  if (/^#[\da-f]{6}$/i.test(col ?? '')) s.colore = col;
  else if (/^#[\da-f]{3}$/i.test(col ?? '')) s.colore = '#' + col.slice(1).split('').map(x => x+x).join('');
  else {
    const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(col ?? '');
    if (rgb) s.colore = '#' + rgb.slice(1).map(x => Math.min(255,Number(x)).toString(16).padStart(2,'0')).join('');
  }
  return s;
}

/** Portable, allowlisted document model: the same runs feed browser, React PDF and Edge PDF. */
export function leggiTestoRiccoContratto(input: string): RigaContratto[] {
  const text = String(input ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  if (!/<(?:p|div|h[1-6]|ul|ol|li|span|strong|em)\b/i.test(text)) {
    return text.replace(/\r\n/g,'\n').split('\n').map(x => x.trim()).filter(Boolean).map(line => {
      const h = /^(#{1,4})\s+(.+)$/.exec(line);
      const li = /^[-*•]\s+(.+)$/.exec(line);
      const value = h?.[2] ?? li?.[1] ?? line;
      const parti: ParteContratto[] = [];
      const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
      let pos = 0; let m: RegExpExecArray | null;
      while ((m = re.exec(value))) {
        if (m.index > pos) parti.push({testo: decode(value.slice(pos,m.index)), stile:{}});
        parti.push({testo: decode(m[1] ?? m[2]), stile:m[1] ? {grassetto:true} : {corsivo:true}});
        pos = re.lastIndex;
      }
      if (pos < value.length) parti.push({testo:decode(value.slice(pos)),stile:{}});
      return {tipo:h ? h[1].length === 1 ? 'h1' : 'h2' : li ? 'li' : 'p',testo:parti.map(p=>p.testo).join(''),parti};
    });
  }
  const rows: RigaContratto[] = [];
  const stack: Array<{tag:string;stile:StileContratto}> = [];
  let current: RigaContratto | null = null;
  let ordered = 0;
  const flush = () => {
    if (current?.parti?.some(p=>p.testo.trim())) {
      current.testo = current.parti.map(p=>p.testo).join('').trim();
      rows.push(current);
    }
    current = null;
  };
  for (const token of text.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (token.startsWith('<')) {
      const m = /^<(\/)?([a-z0-9]+)([^>]*)>/i.exec(token);
      if (!m) continue;
      const [,close,rawTag,attrs] = m; const tag=rawTag.toLowerCase();
      if (close) {
        if (/^(p|div|h[1-6]|li)$/.test(tag)) flush();
        const at = stack.map(x=>x.tag).lastIndexOf(tag);
        if (at >= 0) stack.splice(at);
        if (tag==='ol') ordered=0;
        continue;
      }
      if (tag==='br') { if(current) current.parti!.push({testo:'\n',stile:{...stack.at(-1)?.stile}}); continue; }
      if(tag==='ol') ordered=1;
      if (/^(p|div|h[1-6]|li)$/.test(tag)) {
        if (tag==='p' && current?.tipo==='li') { /* Tiptap nests p inside li. */ }
        else {
          flush();
          current={tipo:/^h/.test(tag)?tag==='h1'?'h1':'h2':tag==='li'?'li':'p',testo:'',parti:[]};
          if(tag==='li' && ordered) current.parti!.push({testo:`${ordered++}. `,stile:{}});
        }
        const c=css(/\bstyle="([^"]*)"/i.exec(attrs)?.[1] ?? /\bstyle='([^']*)'/i.exec(attrs)?.[1] ?? '');
        if (/^(left|center|right|justify)$/.test(c['text-align'] ?? '')) current!.allineamento=c['text-align'] as RigaContratto['allineamento'];
        const lh=Number(c['line-height']); if(lh>=1 && lh<=2.5) current!.interlinea=lh;
        const gap=/^(\d+(?:\.\d+)?)pt$/.exec(c['margin-bottom'] ?? ''); if(gap) current!.spazioDopo=Math.min(24,Number(gap[1]));
      }
      if (!/^(img|hr|input)$/.test(tag)) stack.push({tag,stile:styleOf(tag,attrs,stack.at(-1)?.stile ?? {})});
    } else {
      const value=token.replace(/\s+/g,' ');
      if(!current && !value.trim()) continue;
      current ??= {tipo:'p',testo:'',parti:[]};
      // Decode entities without trimming meaningful spaces between inline spans.
      const decoded=value.replace(/&(#[xX]?[\da-fA-F]+|[a-z]+);/g,m=>decode(m));
      current.parti!.push({testo:decoded,stile:{...stack.at(-1)?.stile}});
    }
  }
  flush();
  return rows;
}

/** Only recognised blank signature tails are moved; obligations and clause wording stay intact. */
export function separaFirmeContratto(rows: RigaContratto[]): { righe: RigaContratto[]; firmeRilevate: boolean } {
  const out=rows.map(r=>({...r,parti:r.parti?.map(p=>({...p,stile:{...p.stile}}))}));
  const joined=out.map(r=>r.testo).join('\n');
  const signature=/Luogo\s+(?:e\s+data\s*_{3,}|[^\n]{0,180}?,\s*data\s+[^\n]{0,180}?)[\s\S]*?Firma\s+del\s+cliente[\s\S]*?_{3,}[\s\S]*?(?:Il\s+)?Legale\s+Rappresentante[\s\S]*?_{3,}\s*$/i.exec(joined);
  if(!signature) return {righe:out,firmeRilevate:false};
  let offset=0;
  for(let i=0;i<out.length;i++) {
    const r=out[i];
    if(offset+r.testo.length>=signature.index) {
      const n=signature.index-offset;
      let chars=0;
      r.parti=(r.parti ?? [{testo:r.testo,stile:{}}]).flatMap(p=>{ const keep=Math.max(0,n-chars); chars+=p.testo.length; return keep ? [{...p,testo:p.testo.slice(0,keep)}] : []; });
      r.testo=r.parti.map(p=>p.testo).join('').trim();
      out.splice(i+(r.testo?1:0)); break;
    }
    offset+=r.testo.length+1;
  }
  return {righe:out,firmeRilevate:true};
}

export function contrattoInHtml(rows: RigaContratto[]): string {
  return rows.map(r=>{
    const tag=r.tipo==='h1'?'h1':r.tipo==='h2'?'h2':'p';
    const style=[r.allineamento?`text-align:${r.allineamento}`:'',r.interlinea?`line-height:${r.interlinea}`:'',r.spazioDopo!=null?`margin-bottom:${r.spazioDopo}pt`:''].filter(Boolean).join(';');
    const body=(r.parti ?? [{testo:r.testo,stile:{}}]).map(p=>{
      const s=p.stile;
      const css=[s.dimensione?`font-size:${s.dimensione}pt`:'',s.famiglia?`font-family:${s.famiglia==='times'?'Times New Roman, serif':s.famiglia==='courier'?'Courier New, monospace':'Helvetica, sans-serif'}`:'',s.colore?`color:${s.colore}`:'',s.grassetto?'font-weight:700':'',s.corsivo?'font-style:italic':'',s.sottolineato||s.barrato?`text-decoration:${[s.sottolineato?'underline':'',s.barrato?'line-through':''].filter(Boolean).join(' ')}`:''].filter(Boolean).join(';');
      return `<span${css?` style="${css}"`:''}>${escape(p.testo).replace(/\n/g,'<br/>')}</span>`;
    }).join('');
    return `<${tag}${style?` style="${style}"`:''}>${r.tipo==='li'&&!/^\d+\./.test(r.testo)?'• ':''}${body}</${tag}>`;
  }).join('');
}

/** Bounded paragraphs for fixed-height HTML pages, preserving every word and inline style. */
export function segmentaRigaContratto(row:RigaContratto, maxChars:number):RigaContratto[] {
  if(row.testo.length<=maxChars||row.tipo==='h1'||row.tipo==='h2')return [row];
  const out:RigaContratto[]=[];let parts:ParteContratto[]=[];let length=0;
  const flush=()=>{if(parts.length)out.push({...row,testo:parts.map(p=>p.testo).join(''),parti:parts});parts=[];length=0;};
  for(const part of row.parti??[{testo:row.testo,stile:{}}])for(const word of part.testo.match(/\S+\s*|\s+/g)??[]) {
    if(length&&length+word.length>maxChars)flush();
    parts.push({...part,testo:word});length+=word.length;
  }
  flush();return out;
}
