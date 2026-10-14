import type { prepareVariation } from "./variationDraft";
import { variationImpact } from "./variationDraft";
import { variationEventDate } from "./pendingVariationDocument";
type PublicVariation=Pick<ReturnType<typeof prepareVariation>,"titolo"|"descrizione"|"motivazione"|"richiesto_da"|"impatto_economico"> & {impatto_giorni?:number};
export interface VariationPdfContext {orderCode?:string;customerName?:string;currentNet?:number;vatRate?:number;companyName?:string;companyDetails?:string;customerAddress?:string;siteAddress?:string;proposalNumber?:number;proposalRegisteredAt?:string;documentHeading?:string;primaryColor?:string;archivedOriginal?:boolean}
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
  const doc = new jsPDF();
  const colors:Record<string,[number,number,number]>={"#1e3a5f":[30,58,95],"#14532d":[20,83,45],"#9a3412":[154,52,18]};
  const navy:[number,number,number]=colors[context.primaryColor || ""] || [30,58,95];
  let y = 22;
  const clean = (text: string) => text.replace(/[\u2010-\u2015\u2212]/g,"-").replace(/[\u00a0\u202f]/g," ");
  const money = (amount: number) => clean(new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(amount));
  const header=()=>{
    doc.setTextColor(...navy);doc.setFont("helvetica","bold");doc.setFontSize(9);
    doc.text(doc.splitTextToSize(clean(context.companyName || "LAVORI EXTRA E VARIANTI"),105)[0],19,13);
    if(context.orderCode)doc.text(clean(context.orderCode).slice(0,30),191,13,{align:"right"});
    doc.setDrawColor(...navy);doc.line(19,17,191,17);y=26;
  };
  function write(text: string, heading = false) {
    if(heading && y>245){doc.addPage();header();}
    doc.setFont("helvetica",heading ? "bold" : "normal"); doc.setFontSize(heading ? 12 : 10);
    doc.setTextColor(...(heading ? navy : [35,45,60] as [number,number,number]));
    const lines = doc.splitTextToSize(clean(text), 172) as string[];
    for (const line of lines) {
      if (y > 262) { doc.addPage();header();doc.setFont("helvetica",heading?"bold":"normal");doc.setFontSize(heading?12:10);doc.setTextColor(...(heading?navy:[35,45,60] as [number,number,number])); }
      doc.text(line, 19, y); y += heading ? 6 : 4.5;
    }
    y += heading ? 2.5 : 2;
  }
  header();
  write(context.documentHeading?.trim().slice(0,120) || (mode==="proposta" ? "PROPOSTA DI VARIAZIONE - LAVORI EXTRA" : "LAVORI EXTRA E VARIANTI"),true);
  write(mode==="proposta" ? "DA APPROVARE - Documento non firmato" : "ANTEPRIMA BOZZA - Non salvata, non inviata, non firmata");
  write(`PDF generato il: ${new Date().toLocaleDateString("it-IT",{timeZone:"Europe/Rome"})}`);
  if (context.orderCode && !context.archivedOriginal) write(`Commessa di riferimento: ${context.orderCode}`);
  if (context.proposalNumber !== undefined) {
    if (!Number.isSafeInteger(context.proposalNumber) || context.proposalNumber < 1) throw new Error("Numero OdV non valido.");
    const registeredDate=variationEventDate(context.proposalRegisteredAt);
    if(context.archivedOriginal) {
      write(`OdV #${context.proposalNumber} | Commessa ${context.orderCode ?? "-"} | Registrata ${registeredDate ?? "data non disponibile"}`);
      write("Originale conservato in commessa con gli allegati di questa versione.");
    } else {
      write(`Variante registrata: OdV #${context.proposalNumber}`);
      write(registeredDate ? `Proposta registrata il: ${registeredDate}` : "Data di registrazione non disponibile.");
      write("Ristampa della proposta dai dati registrati e dall'anagrafica attuale. Non e' una copia dell'originale inviato, ne' un documento firmato.");
    }
  }
  if(mode==="proposta"){
    write("Impresa",true);write([context.companyName,context.companyDetails].filter(Boolean).join("\n"));
    write("Cliente / committente",true);write([context.customerName,context.customerAddress].filter(Boolean).join("\n"));
    if(context.siteAddress)write(`Cantiere: ${context.siteAddress}`);
  }else if(context.customerName)write(`Cliente: ${context.customerName}`);
  write(variation.titolo,true); write(variation.descrizione);
  if (variation.motivazione) { write("Motivazione",true); write(variation.motivazione); }
  if (variation.richiesto_da) write(`Richiesto da: ${variation.richiesto_da}`);
  // Old variations stored timing outside their description; never silently omit it.
  if (variation.impatto_giorni !== undefined && !/Tempo aggiuntivo richiesto:|Nessuna estensione dei tempi richiesta\./.test(variation.descrizione)) {
    write(variation.impatto_giorni ? `Tempo aggiuntivo richiesto: ${variation.impatto_giorni} giorni. Il dato registrato non specifica se lavorativi o di calendario: concordare l'unita' prima dell'accettazione.` : "Nessuna estensione dei tempi richiesta.");
  }
  write("Riepilogo economico",true); write(`Variazione netta, IVA esclusa: ${money(variation.impatto_economico)}`);
  if (impact?.vat !== null && impact?.vat !== undefined) {
    write(`IVA stimata (${impact.rate}%): ${money(impact.vat)}\nDifferenza IVA inclusa: ${money(impact.grossDelta!)}`);
  }
  if (impact?.revisedNet !== null && impact?.revisedNet !== undefined) {
    write(`Valore concordato prima della proposta, IVA esclusa: ${money(context.currentNet!)}`);
    write(`Nuovo contratto netto, solo se approvata: ${money(impact.revisedNet)}`);
  }
  write("Gli importi IVA inclusa sono una stima con l'aliquota della commessa. Verificare l'IVA applicabile e precisare nelle condizioni eventuali aliquote diverse prima dell'accettazione.");
  if(mode==="proposta"){
    const acceptance="Il cliente dichiara di aver letto la variazione e di accettare i lavori, la variazione economica e le condizioni sopra riportate. La proposta non modifica le altre condizioni del contratto di riferimento.";
    doc.setFont("helvetica","normal");doc.setFontSize(10);
    const approvalHeight=8.5+doc.splitTextToSize(clean(acceptance),172).length*4.5+2+46;
    if(y+approvalHeight>265){doc.addPage();header();}
    write("Approvazione della proposta",true);
    write(acceptance);
    // Keep the blank signing area together, never print a fabricated signature/date.
    if(y+46>265){doc.addPage();header();}
    doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(35,45,60);
    doc.text("Luogo e data: __________________________________",19,y+4);
    doc.text("Nome e cognome cliente: __________________________",19,y+15);
    doc.text("Firma cliente per approvazione",19,y+29);doc.text("Firma impresa",111,y+29);
    doc.setDrawColor(110);doc.line(19,y+43,98,y+43);doc.line(111,y+43,190,y+43);
  }else write("Nessuna variazione di date, assegnazioni o pagamenti viene eseguita da questa anteprima.");
  const count = doc.getNumberOfPages();
  for (let page=1;page<=count;page++) {
    doc.setPage(page); doc.setDrawColor(210); doc.line(19,280,191,280);
    doc.setFont("helvetica","normal");doc.setTextColor(100);doc.setFontSize(8);doc.text(`${mode==="proposta" ? "Proposta non firmata" : "Anteprima non firmata"} | ${page} / ${count}`,19,286);
  }
  return doc;
}
