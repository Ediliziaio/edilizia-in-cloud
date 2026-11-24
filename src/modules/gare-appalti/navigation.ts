import { Search,ClipboardCheck,Building2,CalendarClock,Gavel,Globe2 } from 'lucide-react';

export const gareRoot='/azienda/gare';
export type GareSection='opportunita'|'partecipazioni'|'scadenze'|'fascicolo'|'fonti';
export const gareSections=[
 {id:'opportunita',title:'Opportunità',icon:Search},
 {id:'partecipazioni',title:'Partecipazioni',icon:ClipboardCheck},
 {id:'scadenze',title:'Scadenze',icon:CalendarClock},
 {id:'fascicolo',title:'Fascicolo impresa',icon:Building2},
 {id:'fonti',title:'Fonti',icon:Globe2},
] as const;
export function sectionHref(section:GareSection,filters:URLSearchParams|Record<string,string>={}){
 const params=new URLSearchParams(filters);params.set('sezione',section);
 return `${gareRoot}?${params}`;
}
export function currentGareSection(pathname:string,search=''):GareSection{
 if(pathname===gareRoot||pathname===gareRoot+'/'){
  const section=new URLSearchParams(search).get('sezione');
  return gareSections.find(s=>s.id===section)?.id||'opportunita';
 }
 const child=pathname.slice(gareRoot.length+1).split('/')[0];
 return gareSections.find(s=>s.id===child)?.id||'opportunita';
}
export const gareMacroArea={id:'area_pratiche',title:'Pratiche e Progettazione',icon:Gavel,items:[{title:'Gare e appalti',url:gareRoot,icon:Gavel}]};
