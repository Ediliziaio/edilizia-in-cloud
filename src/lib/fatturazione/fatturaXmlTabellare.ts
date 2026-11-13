/** Rappresentazione fedele dell'XML, senza rileggere né ricalcolare la fattura dal gestionale. */
export interface TabellaXml { titolo: string; intestazioni: string[]; righe: string[][]; larghezze?: Array<number | '*'>; numeriche?: number[] }
export interface FatturaXmlStampabile { titolo: string; cedente: string[]; cliente: string[]; tabelle: TabellaXml[]; causali: string[] }
const children = (e: Element | null, nome: string): Element[] => e ? Array.from(e.children).filter(x => x.localName === nome) : [];
const child = (e: Element | null, nome: string) => children(e,nome)[0] ?? null;
const testo = (e: Element | null) => e?.textContent?.trim() ?? '';
const data = (s: string) => s.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3-$2-$1');
const numero = (s: string, prezzo = false): string => !s ? '—' : /^-?\d+(\.\d+)?$/.test(s) ? Number(s).toLocaleString('it-IT',{ minimumFractionDigits: prezzo ? 2 : 0, maximumFractionDigits:8 }) : s;
const TIPI: Record<string,string> = { TD01:'fattura',TD02:'acconto/anticipo su fattura',TD04:'nota di credito',TD05:'nota di debito',TD06:'parcella',TD24:'fattura differita' };
const MODALITA: Record<string,string> = { MP01:'Contanti',MP02:'Assegno',MP05:'Bonifico',MP08:'Carta di pagamento',MP12:'Ri.Ba.',MP19:'SEPA Direct Debit' };

export function leggiFattureXmlStampabili(xml: string): FatturaXmlStampabile[] {
  const d = new DOMParser().parseFromString(xml,'application/xml');
  if (d.getElementsByTagNameNS('*','parsererror').length || d.documentElement.localName !== 'FatturaElettronica') throw new Error('Il file non è un XML FatturaPA valido.');
  const header = child(d.documentElement,'FatturaElettronicaHeader');
  const corpi = children(d.documentElement,'FatturaElettronicaBody');
  if (!header || !corpi.length) throw new Error('Intestazione o corpo della fattura assenti nel file XML.');
  return corpi.map(body => {
    const usati = new Set<Element>();
    const val = (e: Element | null,nome: string) => { const x=child(e,nome);if(x)usati.add(x);return testo(x); };
    const parte = (nome: string): string[] => {
      const p=child(header,nome),an=child(p,'DatiAnagrafici'),anag=child(an,'Anagrafica'),sede=child(p,'Sede'),iva=child(an,'IdFiscaleIVA');
      const denominazione=val(anag,'Denominazione') || [val(anag,'Nome'),val(anag,'Cognome')].filter(Boolean).join(' ');
      const partita=[val(iva,'IdPaese'),val(iva,'IdCodice')].join('');
      const cf=val(an,'CodiceFiscale'),regime=val(an,'RegimeFiscale');
      const via=[val(sede,'Indirizzo'),val(sede,'NumeroCivico')].filter(Boolean).join(' ');
      const luogo=[val(sede,'CAP'),val(sede,'Comune'),val(sede,'Provincia'),val(sede,'Nazione')].filter(Boolean).join(' ');
      return [denominazione,partita ? `Identificativo fiscale IVA: ${partita}`:'',cf?`Codice fiscale: ${cf}`:'',regime?`Regime fiscale: ${regime}`:'',via,luogo].filter(Boolean);
    };
    const cedente=parte('CedentePrestatore'),cliente=parte('CessionarioCommittente');
    const generali=child(body,'DatiGenerali'),doc=child(generali,'DatiGeneraliDocumento');
    const tipo=val(doc,'TipoDocumento'),n=val(doc,'Numero'),divisa=val(doc,'Divisa');
    const tabelle: TabellaXml[]=[{titolo:'',intestazioni:['Tipologia documento','Art. 73','Numero documento','Data documento','Codice destinatario'],righe:[[tipo+(TIPI[tipo]?` (${TIPI[tipo]})`:''),val(doc,'Art73')||'—',n,data(val(doc,'Data')),val(child(header,'DatiTrasmissione'),'CodiceDestinatario')||'—']]}];
    const beni=child(body,'DatiBeniServizi');
    const righe=children(beni,'DettaglioLinee').map(r=>{
      const linea=val(r,'NumeroLinea');
      const codici=children(r,'CodiceArticolo').map(c=>[val(c,'CodiceTipo'),val(c,'CodiceValore')].filter(Boolean).join(': ')).join('\n');
      const sconti=children(r,'ScontoMaggiorazione').map(c=>{const tipo=val(c,'Tipo'),p=val(c,'Percentuale'),i=val(c,'Importo');return [tipo,p?`${numero(p)}%`:'',i?numero(i,true):''].filter(Boolean).join(' ');}).join('\n');
      const iva=val(r,'AliquotaIVA'),natura=val(r,'Natura');
      return [codici||linea,val(r,'Descrizione'),numero(val(r,'Quantita')),numero(val(r,'PrezzoUnitario'),true),val(r,'UnitaMisura'),sconti,iva?`${numero(iva)}%${natura?' · '+natura:''}`:natura,numero(val(r,'PrezzoTotale'),true)];
    });
    tabelle.push({titolo:'Dettaglio righe',intestazioni:['N./Cod. articolo','Descrizione','Quantità','Prezzo unitario','UM','Sconto/magg.','% IVA','Prezzo totale'],righe,larghezze:[38,'*',34,48,20,42,34,51],numeriche:[2,3,7]});
    const iva=children(beni,'DatiRiepilogo').map(r=>{
      const es=val(r,'EsigibilitaIVA'),aliquota=val(r,'AliquotaIVA'),natura=val(r,'Natura');
      return [[es?({I:'I (esigibilità immediata)',D:'D (esigibilità differita)',S:'S (scissione pagamenti)'}[es]??es):'',val(r,'RiferimentoNormativo'),natura].filter(Boolean).join(' · '),aliquota?`${numero(aliquota)}%`:'',numero(val(r,'SpeseAccessorie'),true),numero(val(r,'Arrotondamento'),true),numero(val(r,'ImponibileImporto'),true),numero(val(r,'Imposta'),true)];
    });
    tabelle.push({titolo:'Riepilogo IVA e totali',intestazioni:['Esigibilità IVA / riferimenti normativi','% IVA','Spese accessorie','Arrotondamento','Totale imponibile','Totale imposta'],righe:iva,numeriche:[2,3,4,5]});
    const totale=val(doc,'ImportoTotaleDocumento'),arrotondamento=val(doc,'Arrotondamento');
    tabelle.push({titolo:'',intestazioni:['Valuta','Arrotondamento documento','Totale documento'],righe:[[divisa,numero(arrotondamento,true),totale?numero(totale,true):'Non indicato nell’XML']],numeriche:[1,2]});
    const rate=children(body,'DatiPagamento').flatMap(p=>{
      const condizioni=val(p,'CondizioniPagamento');
      return children(p,'DettaglioPagamento').map(r=>{
        const modalita=val(r,'ModalitaPagamento');
        return [condizioni,[modalita,MODALITA[modalita]].filter(Boolean).join(' '),val(r,'Beneficiario'),val(r,'IBAN'),val(r,'IstitutoFinanziario'),data(val(r,'DataScadenzaPagamento')),numero(val(r,'ImportoPagamento'),true)];
      });
    });
    if(rate.length)tabelle.push({titolo:'Dati di pagamento',intestazioni:['Condizioni','Modalità','Beneficiario','IBAN','Istituto','Data scadenza','Importo'],righe:rate,larghezze:[34,58,55,130,84,52,57],numeriche:[6]});
    const causali=children(doc,'Causale').map(e=>{usati.add(e);return testo(e);}).filter(Boolean);
    if(causali.length)tabelle.push({titolo:'Causale / annotazioni del documento',intestazioni:['Causale'],righe:causali.map(c=>[c])});
    // Gli altri campi restano leggibili: CUP/CIG, DDT, ritenute, cassa, sconti,
    // dati gestionali e dettagli di rate non vengono persi dal modello grafico.
    const altri: string[][]=[];
    const raccogli=(e: Element,percorso: string[])=>{
      if(e.localName==='Signature'||e.localName==='Attachment')return;
      const path=[...percorso,e.localName];
      if(e.children.length){for(const c of Array.from(e.children))raccogli(c,path);}
      else if(!usati.has(e)&&testo(e))altri.push([path.join(' / '),testo(e)]);
    };
    raccogli(header,[]);raccogli(body,[]);
    if(altri.length)tabelle.push({titolo:'Altri dati presenti nel file XML',intestazioni:['Campo','Valore'],righe:altri,larghezze:['*','*']});
    return {titolo:`Fattura elettronica ${n||tipo}`,cedente,cliente,tabelle,causali};
  });
}

const esc=(s: string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function fatturaXmlTabellareHtml(xml: string): {html:string;titolo:string} {
  const fatture=leggiFattureXmlStampabili(xml);
  const parti=(label:string,righe:string[])=>`<td><b>${esc(label)}</b><div>${righe.map(esc).join('<br>')}</div></td>`;
  const corpo=fatture.map(f=>`<section><table class="parti"><tbody><tr>${parti('Cedente/prestatore (fornitore)',f.cedente)}${parti('Cessionario/committente (cliente)',f.cliente)}</tr></tbody></table>${f.tabelle.map(t=>`${t.titolo?`<h2>${esc(t.titolo)}</h2>`:''}<table>${t.larghezze?`<colgroup>${t.larghezze.map(w=>`<col${typeof w==='number'?` style="width:${w}pt"`:''}>`).join('')}</colgroup>`:''}<thead><tr>${t.intestazioni.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.righe.map(r=>`<tr>${r.map((v,i)=>`<td${t.numeriche?.includes(i)?' class="n"':''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')}<p class="footer">Rappresentazione leggibile del file XML. I dati riportati provengono esclusivamente dall’XML.</p></section>`).join('');
  return {titolo:fatture[0].titolo,html:`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(fatture[0].titolo)}</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:8pt;color:#111;margin:0;padding:10mm}section+section{break-before:page}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 8px}th,td{border:1px solid #777;padding:4px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#e9e9e9;font-size:7pt;font-weight:normal}thead{display:table-header-group}h2{font-size:8pt;text-transform:uppercase;margin:10px 0 3px}.parti td{width:50%}.parti b{display:block;margin-bottom:4px}.n{text-align:right}.footer{font-size:6.5pt;color:#555}@media print{body{padding:0}}</style></head><body>${corpo}</body></html>`};
}

export function definizionePdfFatturaXml(fatture: FatturaXmlStampabile[]): Record<string,unknown> {
  const layout={hLineWidth:()=>0.4,vLineWidth:()=>0.4,hLineColor:()=>'#777777',vLineColor:()=>'#777777',paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>4,paddingBottom:()=>4};
  const content: Record<string,unknown>[]=[];
  for(const [indice,f]of fatture.entries()){
    content.push({pageBreak:indice?'before':undefined,table:{widths:['*','*'],body:[[{stack:[{text:'Cedente/prestatore (fornitore)',bold:true},...f.cedente]},{stack:[{text:'Cessionario/committente (cliente)',bold:true},...f.cliente]}]]},layout,margin:[0,0,0,8]});
    for(const t of f.tabelle){
      if(t.titolo)content.push({text:t.titolo.toUpperCase(),bold:true,fontSize:8,margin:[0,6,0,3]});
      content.push({table:{headerRows:1,widths:t.larghezze??t.intestazioni.map(()=>'*'),body:[t.intestazioni.map(text=>({text,fillColor:'#e9e9e9',fontSize:7})),...t.righe.map(r=>r.map((text,i)=>({text,alignment:t.numeriche?.includes(i)?'right':'left'})))]},layout,margin:[0,0,0,7]});
    }

  }
  return {pageSize:'A4',pageMargins:[24,24,24,32],defaultStyle:{font:'Roboto',fontSize:7.5},content,info:{title:fatture[0]?.titolo??'Fattura elettronica',subject:'Rappresentazione del file XML'},footer:(pagina:number,totale:number)=>({text:`Rappresentazione leggibile del file XML · Pagina ${pagina} di ${totale}`,fontSize:6.5,color:'#555555',alignment:'right',margin:[24,8,24,0]})};
}

export async function generaPdfFatturaXml(xml: string): Promise<Uint8Array> {
  const fatture=leggiFattureXmlStampabili(xml);
  const [m,f]=await Promise.all([import('pdfmake/build/pdfmake.min.js'),import('pdfmake/build/vfs_fonts.js')]);
  m.default.addVirtualFileSystem(f.default);
  return m.default.createPdf(definizionePdfFatturaXml(fatture) as never).getBuffer();
}
