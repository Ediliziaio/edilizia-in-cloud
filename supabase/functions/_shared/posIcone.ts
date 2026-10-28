/** Original editorial icons. Not regulatory safety signs and never evidence of compliance. */
export const VERSIONE_ICONE_POS = "pos-editoriali-1";
export const ICONE_POS = [
  {id:"cantiere",nome:"Opera e cantiere",segni:'<path d="M3 21V10l9-7 9 7v11H3Z"/><path d="M9 21v-8h6v8M7 10h.01M17 10h.01"/>'},
  {id:"impresa",nome:"Impresa",segni:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/>'},
  {id:"responsabilita",nome:"Figure e responsabilità",segni:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3M3 9a3 3 0 0 1 3-3m12 0a3 3 0 0 1 3 3M2 19v-2a4 4 0 0 1 3-4m14 0a4 4 0 0 1 3 4v2"/>'},
  {id:"emergenze",nome:"Organizzazione delle emergenze",segni:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M12 10v6m-3-3h6"/>'},
  {id:"addetti",nome:"Lavoratori",segni:'<path d="M5 11a7 7 0 0 1 14 0M3 11h18M9 5v5m6-5v5M7 13a5 5 0 0 0 10 0M5 22a7 7 0 0 1 14 0"/>'},
  {id:"formazione",nome:"Informazione e formazione",segni:'<path d="M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1v15M5 7l4 1m6 0 4-1M5 11l4 1m6 0 4-1"/>'},
  {id:"rumore",nome:"Valutazione del rumore",segni:'<path d="M5 9a5 5 0 0 1 10 0c0 5-4 5-4 8a3 3 0 0 1-6 0M8 9a2 2 0 0 1 4 0c0 3-3 3-3 5M18 6a7 7 0 0 1 0 8m3-11a11 11 0 0 1 0 14"/>'},
  {id:"lavorazioni",nome:"Lavorazioni e misure",segni:'<path d="M14 4a6 6 0 0 0-7 7L2 16a3 3 0 0 0 4 4l5-5a6 6 0 0 0 7-7l-4 4-3-3 3-5Z"/>'},
  {id:"procedure",nome:"Procedure PSC",segni:'<rect x="5" y="4" width="15" height="18" rx="2"/><path d="M9 4V2h7v2M8 9l1 1 2-2m3 1h3M8 15l1 1 2-2m3 1h3M8 19h9"/>'},
  {id:"allegati",nome:"Documenti e allegati",segni:'<path d="M14 2H5v20h14V7l-5-5v5h5M9 11h6m-6 4h6m-6 4h4"/>'},
  {id:"firme",nome:"Firme e consegna",segni:'<path d="m4 16 11-11 4 4L8 20l-5 1 1-5ZM13 7l4 4M3 4h6M3 8h3M12 21h9"/>'},
] as const;
export type IconaPosId = typeof ICONE_POS[number]["id"];
export function iconaPosSvg(id: IconaPosId): string {
  const icona=ICONE_POS.find(i=>i.id===id);
  if(!icona) throw new Error("Icona POS non riconosciuta");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="#183451" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icona.segni}</g></svg>`;
}
