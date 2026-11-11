/** Icone vettoriali comuni ai modelli. Nessun logo o dato specifico di un'azienda. */
export const ICONE_EDITORIALI_FV=[
 {id:"sun",nome:"Fotovoltaico"},{id:"inverter",nome:"Inverter"},{id:"battery",nome:"Accumulo"},{id:"tools",nome:"Installazione"},
 {id:"shield",nome:"Garanzie"},{id:"support",nome:"Assistenza"},{id:"inspection",nome:"Sopralluogo"},{id:"document",nome:"Documenti"},
 {id:"clock",nome:"Tempi"},{id:"chart",nome:"Risparmio"},{id:"award",nome:"Certificazioni"},{id:"grid",nome:"Rete elettrica"},
] as const;
export type IconaEditorialeFv=typeof ICONE_EDITORIALI_FV[number]["id"];
const TRACCIATI:Record<IconaEditorialeFv,string>={
 sun:'<circle cx="18" cy="5" r="2.2"/><path d="M18 1v.5m0 7V9m-4-4h.5m7 0h.5M3 11h14l3 10H1L3 11Zm1 5h14m-9-5L7 21m5-10 2 10"/>',
 inverter:'<rect x="6" y="2.5" width="12" height="19" rx="2"/><rect x="9" y="5.5" width="6" height="4" rx=".7"/><path d="m12.5 12-2.5 4h3l-1.5 3M9 22v1m6-1v1"/>',
 battery:'<rect x="2" y="6" width="18" height="12" rx="2"/><path d="M22 10v4M6 10v4m4-4v4m4-4v4"/>',
 tools:'<path d="M14 5a5 5 0 0 0-5 6L3.5 16.5a2.8 2.8 0 0 0 4 4L13 15a5 5 0 0 0 6-6l-3 3-3-3 3-3a5 5 0 0 0-2-1Z"/><circle cx="5.5" cy="18.5" r=".5"/>',
 shield:'<path d="m12 2 8 3v6c0 5-4.3 8.3-8 11-3.7-2.7-8-6-8-11V5l8-3Z"/><path d="m8.5 11.5 2.3 2.3 4.7-4.6"/>',
 support:'<path d="M4 13v-1a8 8 0 0 1 16 0v1M20 18v1a2 2 0 0 1-2 2h-4"/><rect x="2.5" y="11" width="4.5" height="7" rx="1.7"/><rect x="17" y="11" width="4.5" height="7" rx="1.7"/><path d="M11 21h3"/>',
 inspection:'<path d="m2 11 9-8 9 8M5 9v11h7M9 20v-6h3"/><circle cx="17" cy="16" r="3.5"/><path d="m19.5 18.5 3 3"/>',
 document:'<path d="M6 2.5h8l4 4V22H6V2.5Zm8 0v5h4M9 11h6m-6 3h6m-6 3 2 2 4-3"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 chart:'<path d="M3 3v18h18M7 17v-4m5 4V9m5 8V5M6 8l5-3 4 1 4-4"/>',
 award:'<circle cx="12" cy="9" r="6"/><path d="m8 14-2 8 6-3 6 3-2-8m-6-5 1.5 1.5L15 7"/>',
 grid:'<path d="m6 22 6-20 6 20M5 8h14M3 13h18M8 17h8M6 22h12M9 8l6 5-7 4m7-9-6 5 7 4"/>',
};
const sicuro=(s:string)=>s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]!));
export function svgIconaEditorialeFv(nome:string|null|undefined,opzioni:{colore?:string|null;dimensione?:number;label?:string}={}){
 const id=Object.prototype.hasOwnProperty.call(TRACCIATI,nome??"")?nome as IconaEditorialeFv:"shield",colore=/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(opzioni.colore??"")?opzioni.colore!:"#188569",n=opzioni.dimensione,dimensione=typeof n==="number"&&Number.isFinite(n)&&n>=12&&n<=128?n:24;
 const accessibilita=opzioni.label?`role="img" aria-label="${sicuro(opzioni.label)}"`:'aria-hidden="true"';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${dimensione}" height="${dimensione}" fill="none" color="${colore}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${accessibilita} data-fv-icon="${id}">${TRACCIATI[id]}</svg>`;
}
export function tavolaIconeEditorialiFv(colore="#188569"){
 const cards=ICONE_EDITORIALI_FV.map((icona,i)=>{const x=30+i%4*270,y=130+Math.floor(i/4)*200;return `<g transform="translate(${x} ${y})"><rect width="250" height="180" rx="18" fill="white" stroke="#dce5df"/>${svgIconaEditorialeFv(icona.id,{colore,dimensione:52}).replace('<svg ','<svg x="99" y="28" ')}<text x="125" y="113" text-anchor="middle" font-size="18" fill="#203d50" font-weight="600">${icona.nome}</text><text x="125" y="141" text-anchor="middle" font-size="12" fill="#71858b">${icona.id}.svg</text></g>`;}).join("");
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1140 770" font-family="Arial,sans-serif"><rect width="1140" height="770" fill="#f1f5f0"/><text x="34" y="52" font-size="29" font-weight="700" fill="#203d50">Un solo stile. Per tutti i modelli.</text><text x="34" y="84" font-size="16" fill="#647986">12 icone SVG · colore personalizzabile · sfondo trasparente · PDF e interfaccia</text>${cards}</svg>`;
}
