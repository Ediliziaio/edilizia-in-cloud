import type { prepareVariation, VariationDocumentParts } from "./variationDraft";
import { CONDIZIONI_STANDARD_VARIANTE, variationImpact } from "./variationDraft";
import { variationEventDate } from "./pendingVariationDocument";
import { fontPiedeBase64, personalizzazioneDocumento, puntiInMm } from "../../../supabase/functions/_shared/personalizzazioneDocumenti";
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
  const colors:Record<string,[number,number,number]>={"#1e3a5f":[30,58,95],"#14532d":[20,83,45],"#9a3412":[154,52,18]};
  const navy:[number,number,number]=colors[context.primaryColor || ""] || [30,58,95];
  const INK:[number,number,number]=[35,45,60], GREY:[number,number,number]=[100,110,125], LINE:[number,number,number]=[215,222,232], PALE:[number,number,number]=[245,247,250];
  const LEFT=15, RIGHT=195, WIDTH=RIGHT-LEFT, BOTTOM=272;
  const veste=personalizzazioneDocumento(context.companyId);
  // Se il carattere non si scarica il piè resta in Helvetica: il documento esce lo stesso.
  const fontPiede=veste.piedeFont&&context.societarie?.length?await fontPiedeBase64():null;
  if(fontPiede){doc.addFileToVFS("EBGaramond-Regular.ttf",fontPiede);doc.addFont("EBGaramond-Regular.ttf","EBGaramond","normal");}
  let y = 14;
  const clean = (text: string) => text.replace(/[‐-―−]/g,"-").replace(/[  ]/g," ");
  const money = (amount: number) => clean(new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",useGrouping:true}).format(amount));
  const number = (n: number) => clean(n.toLocaleString("it-IT",{maximumFractionDigits:2,useGrouping:true}));
  const font=(size:number,bold=false,color:[number,number,number]=INK)=>{doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);doc.setTextColor(...color);};
  const lines=(text:string,width:number)=>doc.splitTextToSize(clean(text),width) as string[];
  const parts=context.parti;
  const heading=(context.documentHeading?.trim().slice(0,120) || (mode==="proposta" ? "Variante al contratto" : "Lavori extra e varianti")).toUpperCase();
  const number_odv=context.proposalNumber;
  if (number_odv !== undefined && (!Number.isSafeInteger(number_odv) || number_odv < 1)) throw new Error("Numero OdV non valido.");
  const registeredDate=variationEventDate(context.proposalRegisteredAt);

  /** Le pagine dopo la prima: una riga sola, per sapere di che documento sono. */
  const continuation=()=>{
    doc.addPage();
    font(8,true,navy);doc.text(lines(context.companyName || heading,110)[0],LEFT,12);
    font(8,false,GREY);doc.text(clean([context.orderCode,number_odv!==undefined?`OdV #${number_odv}`:""].filter(Boolean).join(" - ")),RIGHT,12,{align:"right"});
    doc.setDrawColor(...navy);doc.line(LEFT,14.5,RIGHT,14.5);y=21;
  };
  const room=(height:number)=>{if(y+height>BOTTOM)continuation();};
  function write(text:string,size=9,color:[number,number,number]=INK,bold=false,lineHeight=size*0.46){
    font(size,bold,color);
    for(const line of lines(text,WIDTH)){room(lineHeight);font(size,bold,color);doc.text(line,LEFT,y);y+=lineHeight;}
    y+=1.5;
  }
  const section=(title:string)=>{room(11);y+=2;font(9,true,navy);doc.text(title.toUpperCase(),LEFT,y);y+=1.5;doc.setDrawColor(...navy);doc.setLineWidth(.3);doc.line(LEFT,y,RIGHT,y);doc.setLineWidth(.2);y+=4.5;};

  // ── Testata: chi scrive
  let textX=LEFT, altezzaLogoGrande=0;
  if(context.logo){
    try{
      const image=doc.getImageProperties(context.logo);
      // Le proporzioni del logo restano le sue: sta in 48 x 15 mm, senza deformarsi.
      const scale=Math.min((veste.logoLarghezzaMax?puntiInMm(veste.logoLarghezzaMax):48)/image.width,(veste.logoAltezza?puntiInMm(veste.logoAltezza):15)/image.height),width=image.width*scale,height=image.height*scale;
      doc.addImage(context.logo,image.fileType,LEFT,y-4,width,height);
      if(veste.logoAltezza)altezzaLogoGrande=height;else textX=LEFT+width+5;
    }catch{/* Un logo illeggibile non ferma il documento. */}
  }
  if(altezzaLogoGrande){
    // Il logo grande occupa la riga e contiene già il nome: i dati dell'impresa vanno sotto.
    y+=altezzaLogoGrande;
    font(7.5,false,GREY);
    const dati=lines(context.companyDetails ?? "",WIDTH).slice(0,3);
    dati.forEach((line,i)=>doc.text(line,LEFT,y+i*3.3));
    y+=dati.length*3.3+3;
  }else{
  font(11,true,navy);doc.text(lines(context.companyName || "Impresa",RIGHT-textX)[0],textX,y+1);
  font(7.5,false,GREY);
  lines(context.companyDetails ?? "",RIGHT-textX).slice(0,3).forEach((line,i)=>doc.text(line,textX,y+5+i*3.3));
  y+=16;
  }

  // ── Fascia: che documento è
  doc.setFillColor(...navy);doc.rect(LEFT,y,WIDTH,9,"F");
  font(10,true,[255,255,255]);doc.text(lines(heading,120)[0],LEFT+3,y+6);
  const today=new Date().toLocaleDateString("it-IT",{timeZone:"Europe/Rome"});
  font(8.5,true,[255,255,255]);doc.text(clean(number_odv!==undefined?`OdV #${number_odv} del ${registeredDate ?? today}`:`del ${today}`),RIGHT-3,y+6,{align:"right"});
  y+=13.5;
  write(mode==="proposta" ? "DA APPROVARE - Documento non firmato" : "ANTEPRIMA BOZZA - Non salvata, non inviata, non firmata",8,[154,88,10],true);
  if(number_odv!==undefined && !context.archivedOriginal){
    write(registeredDate ? `Proposta registrata il: ${registeredDate}` : "Data di registrazione non disponibile.",7.5,GREY);
    write("Ristampa della proposta dai dati registrati e dall'anagrafica attuale. Non e' una copia dell'originale inviato, ne' un documento firmato.",7.5,GREY);
  }

  // ── Le parti
  if(mode==="proposta" || context.customerName){
    const box=(x:number,width:number,label:string,name:string,detail:string)=>{
      const detailLines=lines(detail,width-6).slice(0,4);
      const height=12+detailLines.length*3.4;
      doc.setDrawColor(...LINE);doc.roundedRect(x,y,width,height,1,1);
      font(6.5,true,GREY);doc.text(label.toUpperCase(),x+3,y+4.2);
      font(9.5,true);doc.text(lines(name,width-6)[0] ?? "",x+3,y+8.6);
      font(8,false);detailLines.forEach((line,i)=>doc.text(line,x+3,y+12.2+i*3.4));
      return height;
    };
    const half=(WIDTH-4)/2;
    const a=box(LEFT,half,"Impresa",context.companyName || "-",context.companyDetails ?? "");
    const b=box(LEFT+half+4,half,"Committente",context.customerName || "-",context.customerAddress ?? "");
    y+=Math.max(a,b)+3;
  }

  // ── Riferimenti: a cosa si lega
  const refs=[["Commessa",context.orderCode],["Cantiere",context.siteAddress],["Contratto di riferimento",parts?.riferimento],["Lavorazione",parts?.fase],["Richiesto da",variation.richiesto_da]]
    .filter((r):r is [string,string]=>!!r[1]?.trim());
  if(refs.length){
    const perRow=Math.min(refs.length,3),cell=WIDTH/perRow,rows=Math.ceil(refs.length/perRow);
    doc.setFillColor(...PALE);doc.rect(LEFT,y,WIDTH,rows*10.5+1,"F");
    refs.forEach(([label,value],i)=>{
      const x=LEFT+3+(i%perRow)*cell,top=y+4+Math.floor(i/perRow)*10.5;
      font(6.5,false,GREY);doc.text(label,x,top);
      font(8.5,true);doc.text(lines(value,cell-5)[0],x,top+4);
    });
    y+=rows*10.5+5;
  }

  // ── I lavori
  section(`Oggetto${parts ? ` - ${parts.tipo}` : ""}`);
  write(variation.titolo,10.5,INK,true,5);
  write(parts ? parts.lavori : variation.descrizione);
  if(variation.motivazione){write("Motivazione",8,GREY,true);write(variation.motivazione);}
  // Le varianti vecchie tengono i giorni fuori dalla descrizione: non si possono tacere.
  if(!parts && variation.impatto_giorni !== undefined && !/Tempo aggiuntivo richiesto:|Nessuna estensione dei tempi richiesta\./.test(variation.descrizione)){
    write(variation.impatto_giorni ? `Tempo aggiuntivo richiesto: ${variation.impatto_giorni} giorni. Il dato registrato non specifica se lavorativi o di calendario: concordarlo prima di firmare.` : "Nessuna estensione dei tempi richiesta.");
  }

  // ── La tabella
  const rows=parts?.righe ?? [{descrizione:variation.titolo,quantita:null,unita:"a corpo",prezzo:null,importo:variation.impatto_economico}];
  const col={n:LEFT+2,desc:LEFT+9,qty:133,um:136,price:167,amount:RIGHT-2};
  const tableHead=()=>{
    doc.setFillColor(...PALE);doc.rect(LEFT,y,WIDTH,6.5,"F");doc.setDrawColor(...navy);doc.setLineWidth(.4);doc.line(LEFT,y,RIGHT,y);doc.setLineWidth(.2);
    font(7,true,navy);doc.text("N.",col.n,y+4.4);doc.text("DESCRIZIONE",col.desc,y+4.4);doc.text("Q.TA",col.qty,y+4.4,{align:"right"});doc.text("U.M.",col.um,y+4.4);doc.text("PREZZO",col.price,y+4.4,{align:"right"});doc.text("IMPORTO",col.amount,y+4.4,{align:"right"});
    y+=6.5;
  };
  room(22);y+=2;tableHead();
  rows.forEach((row,i)=>{
    font(8.5);const description=lines(row.descrizione,col.qty-col.desc-13);
    const height=Math.max(6.5,description.length*3.8+2.8);
    if(y+height>BOTTOM){continuation();tableHead();}
    font(8,false,GREY);doc.text(String(i+1),col.n,y+4.4);
    font(8.5);description.forEach((line,l)=>doc.text(line,col.desc,y+4.4+l*3.8));
    if(row.quantita!==null)doc.text(number(row.quantita),col.qty,y+4.4,{align:"right"});
    font(8,false,GREY);doc.text(clean(row.unita),col.um,y+4.4);
    font(8.5);if(row.prezzo!==null)doc.text(money(row.prezzo),col.price,y+4.4,{align:"right"});
    font(8.5,true);doc.text(money(row.importo),col.amount,y+4.4,{align:"right"});
    y+=height;doc.setDrawColor(...LINE);doc.line(LEFT,y,RIGHT,y);
  });
  y+=4;

  // ── I totali: a sinistra il contratto, a destra la variante
  const totalRows:[string,string][]=[["Variazione netta, IVA esclusa",money(variation.impatto_economico)]];
  if(impact?.vat!==null && impact?.vat!==undefined)totalRows.push([`IVA stimata (${impact.rate}%)`,money(impact.vat)]);
  const final=impact?.grossDelta!==null && impact?.grossDelta!==undefined ? ["Differenza IVA inclusa",money(impact.grossDelta)] : null;
  room(totalRows.length*5+14);
  const totalX=112;let totalY=y;
  totalRows.forEach(([label,value])=>{font(8.5,false,GREY);doc.text(label,totalX,totalY+3.5);font(8.5,true);doc.text(value,RIGHT-2,totalY+3.5,{align:"right"});totalY+=5;});
  if(final){doc.setFillColor(...navy);doc.rect(totalX-2,totalY,RIGHT-totalX+2,7.5,"F");font(9,true,[255,255,255]);doc.text(final[0],totalX,totalY+5);doc.text(final[1],RIGHT-2,totalY+5,{align:"right"});totalY+=7.5;}
  if(impact?.revisedNet!==null && impact?.revisedNet!==undefined){
    font(7.5,false,GREY);doc.text("Valore concordato prima della proposta, IVA esclusa",LEFT,y+3.5);
    font(9,true);doc.text(money(context.currentNet!),LEFT,y+8);
    font(7.5,false,GREY);doc.text("Nuovo contratto netto, solo se approvata",LEFT,y+13);
    font(9,true,navy);doc.text(money(impact.revisedNet),LEFT,y+17.5);
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
    wrapped.forEach((line,l)=>{room(3.9);font(8.5);if(l===0){font(8.5,true,navy);doc.text(`${i+1}.`,LEFT,y);font(8.5);}doc.text(line,LEFT+6,y);y+=3.9;});
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
    font(8,false,GREY);doc.text("Firma cliente per approvazione",LEFT,y+13);doc.text("Firma impresa",110,y+13);
    doc.setDrawColor(110);doc.line(LEFT,y+27,95,y+27);doc.line(110,y+27,RIGHT,y+27);
    y+=30;
  }else write("Nessuna variazione di date, assegnazioni o pagamenti viene eseguita da questa anteprima.",8,GREY);

  const count = doc.getNumberOfPages();
  for (let page=1;page<=count;page++) {
    doc.setPage(page); doc.setDrawColor(...LINE); doc.line(LEFT,280,RIGHT,280);
    const stato=mode==="proposta" ? "Proposta non firmata" : "Anteprima non firmata";
    const societarie=context.societarie?.length ? context.societarie : null;
    if(societarie){
      // In fondo i dati societari, centrati, e sotto pagina e stato (09/11/2026).
      font(6.5,false,GREY);
      if(fontPiede){doc.setFont("EBGaramond","normal");doc.setTextColor(veste.piedeColore!);}
      const righe=societarie.flatMap(r=>lines(r,WIDTH)).slice(0,3);
      righe.forEach((r,i)=>doc.text(r,105,283.5+i*3,{align:"center"}));
      doc.text(`Pagina ${page} di ${count} - ${stato}`,105,284+righe.length*3,{align:"center"});
    }else{
      font(7.5,false,GREY);doc.text(clean(`${context.companyName ? `${context.companyName} - ` : ""}${stato}`),LEFT,284);
      doc.text(`Pagina ${page} di ${count}`,RIGHT,284,{align:"right"});
    }
  }
  return doc;
}
