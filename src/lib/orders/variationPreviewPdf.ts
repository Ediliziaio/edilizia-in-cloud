import type { prepareVariation, VariationDocumentParts } from "./variationDraft";
import { CONDIZIONI_STANDARD_VARIANTE, variationImpact } from "./variationDraft";
import { variationEventDate } from "./pendingVariationDocument";
import { disegnaPiedeJsPdf, fontPiedeBase64, limiteContenutoJsPdf, personalizzazioneDocumento, puntiInMm } from "../../../supabase/functions/_shared/personalizzazioneDocumenti";
import { accentoDocumento, colore, pagina, riquadro, sezione, tabella, testata, rgb255 } from "../../../supabase/functions/_shared/stileDocumenti";
type PublicVariation=Pick<ReturnType<typeof prepareVariation>,"titolo"|"descrizione"|"motivazione"|"richiesto_da"|"impatto_economico"> & {impatto_giorni?:number};
export interface VariationPdfContext {companyId?:string;orderCode?:string;customerName?:string;currentNet?:number;vatRate?:number;companyName?:string;companyDetails?:string;customerAddress?:string;siteAddress?:string;proposalNumber?:number;proposalRegisteredAt?:string;documentHeading?:string;primaryColor?:string;archivedOriginal?:boolean;parti?:VariationDocumentParts;logo?:string;societarie?:string[]}
export function variationPdfFilename(orderCode:string|undefined,title:string){
  const part=(value:string)=>value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,65);
  return `variante-${part(orderCode||"commessa")}-${part(title)||"lavori-extra"}.pdf`;
}
/** Offline proposal: no token, network, persistence, approval or invented signature. */
export function variationProposalPdf(variation:PublicVariation,context:VariationPdfContext){
  if(!context.companyName?.trim() || !context.customerName?.trim())throw new Error("Completa impresa e cliente in «Dati del documento e pagamento» prima di preparare il PDF.");
  return buildVariationPdf(variation,context,"proposta");
}
export function variationPreviewPdf(variation:PublicVariation,context:VariationPdfContext){return buildVariationPdf(variation,context,"bozza");}
async function buildVariationPdf(variation:PublicVariation,context:VariationPdfContext,mode:"bozza"|"proposta") {
  if(!variation.titolo.trim() || !variation.descrizione.trim() || !Number.isFinite(variation.impatto_economico))throw new Error("Controlla titolo, descrizione e importo del documento.");
  if (variation.impatto_giorni !== undefined && (!Number.isSafeInteger(variation.impatto_giorni) || variation.impatto_giorni < 0 || variation.impatto_giorni > 3650)) throw new Error("Giorni aggiuntivi non validi.");
  if (variation.impatto_giorni !== undefined && (
    [...variation.descrizione.matchAll(/Tempo aggiuntivo richiesto: (\d+) giorni/g)].some(match => Number(match[1]) !== variation.impatto_giorni) ||
    (variation.impatto_giorni > 0 && variation.descrizione.includes("Nessuna estensione dei tempi richiesta."))
  )) throw new Error("Tempi incoerenti tra descrizione e giorni registrati: verifica la variante.");
  const impact = variationImpact(context.currentNet,variation.impatto_economico,context.vatRate);
  if (impact?.revisedNet !== null && impact?.revisedNet !== undefined && (context.currentNet! < 0 || impact.revisedNet < 0)) throw new Error("La riduzione supera il valore del contratto: verifica l'importo.");
  const { jsPDF } = await import("jspdf");
  // Col logo si comprime: un PNG con trasparenza entra nel PDF senza compressione e pesa molto.
  const doc = new jsPDF({compress:!!context.logo});
  // Lo stile unico dei documenti (10/11/2026, stileDocumenti.ts): l'accento della veste (Vulcano), poi il colore scelto
  // per il documento; grigi, filetti e fondi dello stile. Niente fasce piene né testo bianco.
  const veste=personalizzazioneDocumento(context.companyId);
  const accent=rgb255(accentoDocumento({coloreVeste:veste.piedeColore,coloreAzienda:context.primaryColor}));
  const INK=rgb255(colore.inchiostro), GREY=rgb255(colore.testoTenue), LINE=rgb255(colore.linea), PALE=rgb255(colore.fondoTenue), HEAD=rgb255(colore.fondoIntestazione);
  const mm=puntiInMm;
  // Il piè proprio (Vulcano, 10/11/2026) vale dove esce il piè societario: lì il contenuto si ferma più in alto.
  const piedeProprio=Boolean(veste.piedeRighe&&context.societarie?.length);
  const LEFT=mm(pagina.margineLaterale), RIGHT=210-LEFT, WIDTH=RIGHT-LEFT;
  // Senza piè proprio: le righe societarie (o impresa e dati) centrate, il numero di pagina e sopra la riga di stato.
  const righePiede=(context.societarie?.length ? context.societarie : [context.companyName,...(context.companyDetails ?? "").split("\n")]).map(r=>(r ?? "").trim()).filter(Boolean).slice(0,4);
  const cimaPiede=297-mm(32+5+righePiede.length*9.5)-mm(12);
  const BOTTOM=piedeProprio?limiteContenutoJsPdf(veste,WIDTH,cimaPiede):cimaPiede;
  // Se il carattere non si scarica il piè resta in Helvetica: il documento esce lo stesso.
  const fontPiede=veste.piedeFont&&context.societarie?.length?await fontPiedeBase64():null;
  if(fontPiede){doc.addFileToVFS("EBGaramond-Regular.ttf",fontPiede);doc.addFont("EBGaramond-Regular.ttf","EBGaramond","normal");}
  let y = mm(pagina.margineAlto);
  const clean = (text: string) => text.replace(/[‐-―−]/g,"-").replace(/[  ]/g," ");
  const money = (amount: number) => clean(new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",useGrouping:true}).format(amount));
  const number = (n: number) => clean(n.toLocaleString("it-IT",{maximumFractionDigits:2,useGrouping:true}));
  const font=(size:number,bold=false,color:[number,number,number]=INK)=>{doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);doc.setTextColor(...color);};
  const lines=(text:string,width:number)=>doc.splitTextToSize(clean(text),width) as string[];
  const parts=context.parti;
  const heading=context.documentHeading?.trim().slice(0,120) || (mode==="proposta" ? "Variante al contratto" : "Lavori extra e varianti");
  const number_odv=context.proposalNumber;
  if (number_odv !== undefined && (!Number.isSafeInteger(number_odv) || number_odv < 1)) throw new Error("Numero OdV non valido.");
  const registeredDate=variationEventDate(context.proposalRegisteredAt);
  const today=new Date().toLocaleDateString("it-IT",{timeZone:"Europe/Rome"});

  /** Le pagine dopo la prima: una riga sola, per sapere di che documento sono, col filetto d'accento. */
  const continuation=()=>{
    doc.addPage();
    const top=mm(pagina.margineAlto);
    font(8,true);doc.text(lines(context.companyName || heading,110)[0],LEFT,top);
    font(8,false,GREY);doc.text(clean([heading,context.orderCode,number_odv!==undefined?`OdV #${number_odv}`:""].filter(Boolean).join(" - ")),RIGHT,top,{align:"right"});
    doc.setDrawColor(...accent);doc.setLineWidth(mm(testata.filettoSpessore));doc.line(LEFT,top+2.5,RIGHT,top+2.5);doc.setLineWidth(.2);y=top+2.5+mm(testata.spazioDopo);
  };
  const room=(height:number)=>{if(y+height>BOTTOM)continuation();};
  function write(text:string,size:number=pagina.corpo,color:[number,number,number]=INK,bold=false,lineHeight=mm(size*pagina.interlinea)){
    font(size,bold,color);
    for(const line of lines(text,WIDTH)){room(lineHeight);font(size,bold,color);doc.text(line,LEFT,y);y+=lineHeight;}
    y+=1.5;
  }
  /** Titolo di sezione: 8 pt grassetto maiuscolo nell'accento, filetto sotto. */
  const section=(title:string)=>{
    room(14);y+=mm(sezione.spazioPrima);
    font(sezione.corpo,true,accent);doc.text(clean(title.toUpperCase()),LEFT,y,{charSpace:mm(sezione.spaziatura)});
    y+=1.6;doc.setDrawColor(...LINE);doc.setLineWidth(mm(sezione.filetto));doc.line(LEFT,y,RIGHT,y);doc.setLineWidth(.2);y+=mm(sezione.spazioDopo)+2.6;
  };
  /** L'etichetta di stato: 7 pt grassetto maiuscolo, fondo tenue, bordo linea, testo tenue. */
  const etichetta=(testo:string,xDestra:number,base:number)=>{
    font(7,true,GREY);const t=clean(testo.toUpperCase());const w=doc.getTextWidth(t)+4;
    doc.setFillColor(...PALE);doc.setDrawColor(...LINE);doc.setLineWidth(mm(.75));doc.roundedRect(xDestra-w,base-3.2,w,4.6,1,1,"FD");doc.setLineWidth(.2);
    doc.text(t,xDestra-2,base,{align:"right"});
  };

  // ── Testata: il logo su bianco a sinistra (senza logo il nome), a destra che documento è; sotto il filetto d'accento.
  const top=y;
  let fondoSinistra=top;
  let conLogo=false;
  if(context.logo){
    try{
      const image=doc.getImageProperties(context.logo);
      // Le proporzioni del logo restano le sue: sta nella misura della veste o in quella di serie.
      const scale=Math.min(mm(veste.logoLarghezzaMax ?? testata.logoLarghezzaMax)/image.width,mm(veste.logoAltezza ?? testata.logoAltezza)/image.height),width=image.width*scale,height=image.height*scale;
      doc.addImage(context.logo,image.fileType,LEFT,top,width,height);
      fondoSinistra=top+height;conLogo=true;
    }catch{/* Un logo illeggibile non ferma il documento. */}
  }
  if(!conLogo){font(testata.ragioneSocialeCorpo,true);doc.text(lines(context.companyName || "Impresa",WIDTH*0.55)[0],LEFT,top+mm(testata.ragioneSocialeCorpo));fondoSinistra=top+mm(testata.ragioneSocialeCorpo)+1.5;}
  let yd=top+mm(testata.titoloCorpo)*0.85;
  font(testata.titoloCorpo,true);
  const titoloRighe=lines(heading,WIDTH*0.5);
  titoloRighe.forEach((r,i)=>doc.text(r,RIGHT,yd+i*mm(testata.titoloCorpo*1.2),{align:"right"}));
  yd+=(titoloRighe.length-1)*mm(testata.titoloCorpo*1.2)+mm(testata.sottotitoloCorpo)*1.5;
  font(testata.sottotitoloCorpo,false,GREY);doc.text(clean(number_odv!==undefined?`OdV #${number_odv} del ${registeredDate ?? today}`:`del ${today}`),RIGHT,yd,{align:"right"});
  yd+=5.2;
  etichetta(mode==="proposta" ? "Da approvare - Documento non firmato" : "Anteprima bozza - Non salvata, non inviata, non firmata",RIGHT,yd);
  yd+=1.6;
  y=Math.max(fondoSinistra,yd)+mm(testata.filettoDistanza);
  doc.setDrawColor(...accent);doc.setLineWidth(mm(testata.filettoSpessore));doc.line(LEFT,y,RIGHT,y);doc.setLineWidth(.2);
  y+=mm(testata.spazioDopo)+1;
  if(number_odv!==undefined && !context.archivedOriginal){
    write(registeredDate ? `Proposta registrata il: ${registeredDate}` : "Data di registrazione non disponibile.",pagina.nota,GREY);
    write("Ristampa della proposta dai dati registrati e dall'anagrafica attuale. Non e' una copia dell'originale inviato, ne' un documento firmato.",pagina.nota,GREY);
  }

  // ── Le parti: riquadri tenui
  const pad=mm(riquadro.padding), raggio=mm(riquadro.raggio);
  if(mode==="proposta" || context.customerName){
    const half=(WIDTH-mm(10))/2;
    const dettagli=(detail:string)=>{font(9);return lines(detail,half-pad*2).slice(0,4);};
    const impresa=dettagli(context.companyDetails ?? ""), cliente=dettagli(context.customerAddress ?? "");
    // I due riquadri hanno la stessa altezza: quella del più pieno.
    const height=pad*2+3+4.6+Math.max(impresa.length,cliente.length)*3.9;
    const box=(x:number,label:string,name:string,detailLines:string[])=>{
      doc.setFillColor(...PALE);doc.setDrawColor(...LINE);doc.setLineWidth(mm(riquadro.bordo));doc.roundedRect(x,y,half,height,raggio,raggio,"FD");doc.setLineWidth(.2);
      font(riquadro.etichettaCorpo,false,GREY);doc.text(label.toUpperCase(),x+pad,y+pad+1.8);
      font(riquadro.valoreCorpo,true);doc.text(lines(name,half-pad*2)[0] ?? "",x+pad,y+pad+6.6);
      font(9);detailLines.forEach((line,i)=>doc.text(line,x+pad,y+pad+10.6+i*3.9));
      return height;
    };
    const a=box(LEFT,"Impresa",context.companyName || "-",impresa);
    const b=box(LEFT+half+mm(10),"Committente",context.customerName || "-",cliente);
    y+=Math.max(a,b)+3.5;
  }

  // ── Riferimenti: a cosa si lega, in un riquadro
  const refs=[["Commessa",context.orderCode],["Cantiere",context.siteAddress],["Contratto di riferimento",parts?.riferimento],["Lavorazione",parts?.fase],["Richiesto da",variation.richiesto_da]]
    .filter((r):r is [string,string]=>!!r[1]?.trim());
  if(refs.length){
    const perRow=Math.min(refs.length,3),cell=(WIDTH-pad*2)/perRow,rows=Math.ceil(refs.length/perRow);
    const h=pad*2+rows*9-2;
    doc.setFillColor(...PALE);doc.setDrawColor(...LINE);doc.setLineWidth(mm(riquadro.bordo));doc.roundedRect(LEFT,y,WIDTH,h,raggio,raggio,"FD");doc.setLineWidth(.2);
    refs.forEach(([label,value],i)=>{
      const x=LEFT+pad+(i%perRow)*cell,t=y+pad+1.8+Math.floor(i/perRow)*9;
      font(riquadro.etichettaCorpo,false,GREY);doc.text(label.toUpperCase(),x,t);
      font(9);doc.text(lines(value,cell-4)[0],x,t+4.2);
    });
    y+=h+2;
  }

  // ── I lavori
  section(`Oggetto${parts ? ` - ${parts.tipo}` : ""}`);
  write(variation.titolo,10.5,INK,true,5);
  write(parts ? parts.lavori : variation.descrizione);
  if(variation.motivazione){write("Motivazione",pagina.nota,GREY,true);write(variation.motivazione);}
  // Le varianti vecchie tengono i giorni fuori dalla descrizione: non si possono tacere.
  if(!parts && variation.impatto_giorni !== undefined && !/Tempo aggiuntivo richiesto:|Nessuna estensione dei tempi richiesta\./.test(variation.descrizione)){
    write(variation.impatto_giorni ? `Tempo aggiuntivo richiesto: ${variation.impatto_giorni} giorni. Il dato registrato non specifica se lavorativi o di calendario: concordarlo prima di firmare.` : "Nessuna estensione dei tempi richiesta.");
  }

  // ── La tabella
  const rows=parts?.righe ?? [{descrizione:variation.titolo,quantita:null,unita:"a corpo",prezzo:null,importo:variation.impatto_economico}];
  const col={n:LEFT+2,desc:LEFT+9,qty:133,um:136,price:167,amount:RIGHT-2};
  const RIGA_MIN=mm(tabella.altezzaRigaMin);
  /** Intestazione grigia, 7,5 pt maiuscolo tenue; niente filetti colorati. */
  const tableHead=()=>{
    doc.setFillColor(...HEAD);doc.rect(LEFT,y,WIDTH,6.5,"F");
    font(tabella.intestazioneCorpo,true,GREY);doc.text("N.",col.n,y+4.4);doc.text("DESCRIZIONE",col.desc,y+4.4);doc.text("Q.TA",col.qty,y+4.4,{align:"right"});doc.text("U.M.",col.um,y+4.4);doc.text("PREZZO",col.price,y+4.4,{align:"right"});doc.text("IMPORTO",col.amount,y+4.4,{align:"right"});
    y+=6.5;
  };
  room(22);y+=2;tableHead();
  rows.forEach((row,i)=>{
    font(tabella.corpo);const description=lines(row.descrizione,col.qty-col.desc-13);
    const height=Math.max(RIGA_MIN,description.length*3.9+3);
    if(y+height>BOTTOM){continuation();tableHead();}
    const base=y+Math.max(4.4,(height-description.length*3.9)/2+3);
    font(8,false,GREY);doc.text(String(i+1),col.n,base);
    font(tabella.corpo);description.forEach((line,l)=>doc.text(line,col.desc,base+l*3.9));
    if(row.quantita!==null)doc.text(number(row.quantita),col.qty,base,{align:"right"});
    font(8,false,GREY);doc.text(clean(row.unita),col.um,base);
    font(tabella.corpo);if(row.prezzo!==null)doc.text(money(row.prezzo),col.price,base,{align:"right"});
    font(tabella.corpo,true);doc.text(money(row.importo),col.amount,base,{align:"right"});
    y+=height;doc.setDrawColor(...LINE);doc.setLineWidth(mm(tabella.filetto));doc.line(LEFT,y,RIGHT,y);doc.setLineWidth(.2);
  });
  y+=4;

  // ── I totali: a sinistra il contratto, a destra la variante
  const totalRows:[string,string][]=[["Variazione netta, IVA esclusa",money(variation.impatto_economico)]];
  if(impact?.vat!==null && impact?.vat!==undefined)totalRows.push([`IVA stimata (${impact.rate}%)`,money(impact.vat)]);
  const final=impact?.grossDelta!==null && impact?.grossDelta!==undefined ? ["Differenza IVA inclusa",money(impact.grossDelta)] : null;
  room(totalRows.length*5+14);
  const totalX=112;let totalY=y;
  totalRows.forEach(([label,value])=>{font(tabella.corpo);doc.text(label,totalX,totalY+3.8);font(tabella.corpo,true);doc.text(value,RIGHT-2,totalY+3.8,{align:"right"});totalY+=5.5;doc.setDrawColor(...LINE);doc.setLineWidth(mm(tabella.filetto));doc.line(totalX-2,totalY,RIGHT,totalY);doc.setLineWidth(.2);});
  // La riga che conta: grassetto, filetto d'inchiostro sopra, il valore nell'accento.
  if(final){doc.setDrawColor(...INK);doc.setLineWidth(mm(tabella.filettoTotale));doc.line(totalX-2,totalY,RIGHT,totalY);doc.setLineWidth(.2);font(tabella.corpo+.5,true);doc.text(final[0],totalX,totalY+5.6);font(riquadro.valoreCorpo+2,true,accent);doc.text(final[1],RIGHT-2,totalY+5.8,{align:"right"});totalY+=8;}
  if(impact?.revisedNet!==null && impact?.revisedNet!==undefined){
    font(riquadro.etichettaCorpo,false,GREY);doc.text("Valore concordato prima della proposta, IVA esclusa",LEFT,y+3.5);
    font(riquadro.valoreCorpo,true);doc.text(money(context.currentNet!),LEFT,y+8);
    font(riquadro.etichettaCorpo,false,GREY);doc.text("Nuovo contratto netto, solo se approvata",LEFT,y+13);
    font(riquadro.valoreCorpo,true);doc.text(money(impact.revisedNet),LEFT,y+17.5);
    totalY=Math.max(totalY,y+18);
  }
  y=totalY+4;

  // ── Le condizioni: quelle di ogni variante, poi quelle scritte per questa
  section("Condizioni contrattuali");
  const conditions=[...CONDIZIONI_STANDARD_VARIANTE as readonly string[],
    // Un paragrafo, un punto: le clausole dell'azienda arrivano separate da una riga vuota.
    ...(parts?.condizioni ? parts.condizioni.split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean) : []),
    ...(parts?.pagamento ? [`Pagamento dei lavori extra: ${parts.pagamento}`] : []),
    ...(parts ? [parts.tempi] : [])];
  conditions.forEach((text,i)=>{
    font(8.5);const wrapped=lines(text,WIDTH-6);
    wrapped.forEach((line,l)=>{room(3.9);font(8.5);if(l===0){font(8.5,true);doc.text(`${i+1}.`,LEFT,y);font(8.5);}doc.text(line,LEFT+6,y);y+=3.9;});
    y+=1;
  });

  // ── Firme, tutte su una pagina
  if(mode==="proposta"){
    const acceptance="Il cliente dichiara di aver letto la variazione e di accettare i lavori, la variazione economica e le condizioni sopra riportate. La proposta non modifica il contratto fino all'approvazione.";
    font(8.5);
    const approvalHeight=14+lines(acceptance,WIDTH).length*3.9+40;
    if(y+approvalHeight>BOTTOM)continuation();
    section("Approvazione della proposta");
    write(acceptance,8.5,INK,false,3.9);
    y+=1;
    font(8.5);doc.text("Luogo e data: ______________________________",LEFT,y+3);
    doc.text("Nome e cognome cliente: ______________________",110,y+3);
    // Mai una firma o una data inventate: lo spazio resta vuoto.
    // Firme: una riga d'inchiostro e sotto, 8 pt tenue, chi firma.
    doc.setDrawColor(...INK);doc.setLineWidth(mm(.5));doc.line(LEFT,y+24,95,y+24);doc.line(110,y+24,RIGHT,y+24);doc.setLineWidth(.2);
    font(pagina.nota,false,GREY);doc.text("Firma cliente per approvazione",(LEFT+95)/2,y+27.5,{align:"center"});doc.text("Firma impresa",(110+RIGHT)/2,y+27.5,{align:"center"});
    y+=30;
  }else write("Nessuna variazione di date, assegnazioni o pagamenti viene eseguita da questa anteprima.",pagina.nota,GREY);

  const count = doc.getNumberOfPages();
  for (let page=1;page<=count;page++) {
    doc.setPage(page);
    const stato=mode==="proposta" ? "Proposta non firmata" : "Anteprima non firmata";
    if(piedeProprio){
      disegnaPiedeJsPdf(doc,veste,{font:fontPiede?"EBGaramond":"helvetica",pulisci:fontPiede?undefined:clean,larghezzaUtile:WIDTH,pagina:`Pag. ${page} / ${count} - ${stato}`});
      continue;
    }
    // Il piè dello stile: righe societarie centrate 7 pt tenui, sotto «Pag. n / m»; sopra, 6,5 pt, lo stato.
    font(6.5,false,GREY);doc.text(stato,105,cimaPiede+mm(5),{align:"center"});
    const cima=297-mm(32+5+righePiede.length*9.5);
    doc.setDrawColor(...LINE);doc.setLineWidth(mm(.5));doc.line(LEFT,cima,RIGHT,cima);doc.setLineWidth(.2);
    font(7,false,GREY);
    const righe=righePiede.flatMap(r=>lines(r,WIDTH)).slice(0,4);
    righe.forEach((r,i)=>doc.text(r,105,cima+mm(5+7)+i*mm(9.5),{align:"center"}));
    doc.text(`Pag. ${page} / ${count}`,105,297-mm(29)+mm(6),{align:"center"});
  }
  return doc;
}
