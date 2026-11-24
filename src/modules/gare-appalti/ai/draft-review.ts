export function draftMarkers(body:string){return [...new Set(body.match(/\[DA\s+(?:COMPLETARE|CONFERMARE|APPROVARE)[^\]]*\]/gi)||[])];}
export function markerParts(text:string){return text.split(/(\[DA\s+(?:COMPLETARE|CONFERMARE|APPROVARE)[^\]]*\])/gi);}
export function isDraftMarker(text:string){return /^\[DA\s+(?:COMPLETARE|CONFERMARE|APPROVARE)[^\]]*\]$/i.test(text);}
export const profileFields=[{key:'ragione_sociale',label:'Ragione sociale'},{key:'partita_iva',label:'Partita IVA'},{key:'pec',label:'PEC'},{key:'sede',label:'Sede'},{key:'rappresentante',label:'Rappresentante'},{key:'referente',label:'Referente gare'}];
